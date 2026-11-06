import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import assert from 'node:assert/strict'
import { normalize } from './cases.js'
import { parseJSON } from './support/client.js'
import { compactRecall } from '../lib/recall-wire.js'
import { factualAudit } from './support/answer-audit.js'

const root = 'bench/runs/token-gate-v1/'
const read = async path => JSON.parse(await readFile(path, 'utf8'))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const manifest = await read(root + 'manifest.json')
assert.equal(sha(Buffer.concat(await Promise.all(manifest.files.map(f => readFile(f))))), manifest.sourceHash)
const at = process.argv.indexOf('--budget-file')
assert.ok(at >= 0, 'Supply shared budget file')
const budget = await read(process.argv[at + 1])
const prices = (await read('bench/protocol.json')).models
const bundle = { manifest, models: [], summary: [] }
for (const model of manifest.protocol.models) {
  const cases = await read(root + model + '-cases.json')
  const rows = await read(root + model + '.json')
  const traces = (await readFile(root + model + '-trace.jsonl', 'utf8')).trim().split('\n').map(JSON.parse)
  assert.equal(rows.length, cases.length * manifest.protocol.arms.length)
  assert.equal(new Set(rows.map(r => `${r.id}:${r.arm}`)).size, rows.length)
  for (const row of rows) {
    const fixture = cases.find(c => c.id === row.id)
    assert.equal(row.expected, fixture.expected)
    assert.equal(row.correct, normalize(row.answer) === normalize(fixture.expected))
    for (const call of row.calls) assert.ok(traces.some(t => t.raw === call.raw && JSON.stringify(t.request) === JSON.stringify(call.request)))
    if (!row.error) assert.equal(parseJSON(row.calls.at(-1).raw).answer, row.answer)
    if (row.arm === 'baseline' && fixture.originalRequest) assert.deepEqual(row.calls[0].request, fixture.originalRequest)
    assert.deepEqual(row.sourceIds, compactRecall(fixture.context).sourceIds)
  }
  const accountCalls = budget.calls.filter(c => c.purpose?.startsWith(`token-gate-v1:${model}:`))
  const price = prices.find(p => p.model === model)
  for (const arm of manifest.protocol.arms) {
    const items = rows.filter(r => r.arm === arm)
    const calls = accountCalls.filter(c => c.purpose.includes(`:${arm}:`))
    const regressions = items.filter(r => !r.correct && rows.find(b => b.id === r.id && b.arm === 'baseline').correct)
    const misses = items.filter(r => r.needsRecall && r.retrieved === false)
    bundle.summary.push({ model, arm, correct: items.filter(r => r.correct).length, total: items.length,
      factualCorrect: items.filter(r => factualAudit(r).correct).length,
      formatErrors: items.filter(r => factualAudit(r).formatError).length,
      factualRegressions: items.filter(r => !factualAudit(r).correct && factualAudit(rows.find(b => b.id === r.id && b.arm === 'baseline')).correct).map(r => r.id),
      historical: { correct: items.filter(r => r.id.startsWith('old-') && r.correct).length, total: items.filter(r => r.id.startsWith('old-')).length },
      novel: { correct: items.filter(r => r.id.startsWith('new-') && r.correct).length, total: items.filter(r => r.id.startsWith('new-')).length },
      inputTokens: calls.reduce((n, c) => n + (c.usage?.prompt_tokens ?? 0), 0), outputTokens: calls.reduce((n, c) => n + (c.usage?.completion_tokens ?? 0), 0),
      cacheHitTokens: calls.reduce((n, c) => n + (c.usage?.prompt_cache_hit_tokens ?? 0), 0),
      calls: calls.length, costUSD: calls.reduce((n, c) => n + c.cost, 0),
      accountedUSDFromUsage: calls.reduce((n, c) => n + (c.usage ? (c.usage.prompt_tokens * price.inputPerMillion + c.usage.completion_tokens * price.outputPerMillion) / 1e6 : 0), 0),
      reservedCalls: calls.filter(c => c.status !== 'settled').length,
      totalModelMs: items.reduce((n, r) => n + r.ms, 0),
      retrieved: items.filter(r => r.retrieved).length, invalidDecisions: items.filter(r => r.invalidDecision).length,
      labelledNeedSkipped: misses.length, labelledNeedSkippedWrong: misses.filter(r => !r.correct).length,
      regressions: regressions.map(r => r.id), failures: items.filter(r => !r.correct).map(r => ({ id: r.id, expected: r.expected, answer: r.answer, retrieved: r.retrieved, error: r.error })) })
  }
  bundle.models.push({ model, cases, rows, traces, accountCalls })
}
const trialCostUSD = bundle.summary.reduce((n, r) => n + r.costUSD, 0)
bundle.accounting = { trialCostUSD, cumulativeUSD: budget.spent, limitUSD: budget.limit }
const lines = ['# Token 精简与模型自主检索对照', '',
  '固定协议 token-gate-v1；两模型各 54 题 × 四组，共 432 个评分结果。模型选择检索时多一次回答调用，决策、输出、错误及失败预留全部计费。', '',
  '## 结果', '',
  '| 模型 | 方案 | 严格正确 / 事实正确 | 输入 token | 输出 token | API 调用 | 估算 USD | 相对原格式输入变化 |',
  '|---|---|---:|---:|---:|---:|---:|---:|',
  ...bundle.summary.map(r => {
    const baseline = bundle.summary.find(b => b.model === r.model && b.arm === 'baseline')
    return `| ${r.model} | ${r.arm} | ${r.correct}/${r.total} / ${r.factualCorrect}/${r.total} | ${r.inputTokens} | ${r.outputTokens} | ${r.calls} | ${r.costUSD.toFixed(6)} | ${((r.inputTokens / baseline.inputTokens - 1) * 100).toFixed(1)}% |`
  }), '',
  `本轮费用估算 $${trialCostUSD.toFixed(6)}；项目累计 $${budget.spent.toFixed(6)} / $${budget.limit}。按峰值/缓存未命中单价统一计算，非实际账单；缓存命中 token 另存证据，不将命中算成上下文 token 减少。`, '',
  '## 如何比较', '',
  '- baseline：每题始终注入原始有界检索结果。compact：相同事件、顺序、角色、文本及摘录边界，改用列式 JSON、以会话事件序号代替 UUID；完整 ID 映射保留在审计记录。没有删掉事实或缩小检索预算。',
  '- model-choice：先只给现有上下文，允许一次直接回答或请求检索。选择检索后，用 compact 的完全相同证据重新回答；两次调用全部计入。未让模型改写检索词，以单独检验检索门控。',
  '- no-recall：从不提供检索结果，用于判断已有摘要是否足够。它不是生产配置建议。',
  '- 每模型 30 个历史快照来自 long-native-v2（第30–39、70–79、110–119轮，从0计），所有组复用同样的历史、摘要、问题。baseline 请求与历史原请求逐字核验。本轮是静态请求对照，不是重新推进的完整长任务；共同的历史摘要已在之前计费，没有在这四组重复生成。',
  '- 另有预先固定的4种子×6类新题：现有上下文足够、隐藏口令、过期摘要、最初状态、否定规则、未知信息。新题有少量事实，未装入30 MiB档案；历史快照来自此前近30 MiB档案。标准答案和隐藏需求标签不进入模型输入。',
  '- 各题轮换组别执行顺序；温度0。未多次重复采样，结果不等于统计非劣证明，仍可能受缓存和服务端变化影响。', '',
  '## 逐项退化与跳检', '',
  '预注册主分数要求JSON的answer字段。试验中发现部分回答给出了正确裸数字，补充报告事后事实分数：仅接受合法answer或完整裸答案，不在长段落中匹配标准答案。该分数不替换主分数，格式失败单独记录。', '',
  ...bundle.summary.map(r => `- ${r.model}/${r.arm}：相对 baseline 新增严格错误 ${JSON.stringify(r.regressions)}；新增事实错误 ${JSON.stringify(r.factualRegressions)}；格式错误 ${r.formatErrors}；检索 ${r.retrieved} 次；标注有归档核查需求却跳检 ${r.labelledNeedSkipped} 次，其中严格答错 ${r.labelledNeedSkippedWrong} 次。`), '',
  '“标注有归档核查需求”表示可见记录不含完整原始证据；未知题直接回答UNKNOWN可能仍符合证据不足应弃答的规则，所以跳检数不等于错误数。正确率、实际错误与逐项退化应分开看。', '',
  ...bundle.summary.flatMap(r => r.failures.map(f => `- ${r.model}/${r.arm}: ${JSON.stringify(f)}`)), '',
  '## 使用边界', '',
  '生产默认检索行为保持不变。紧凑格式另提供可选入口 dsh-memory-ladder/compact，其完整动态轨迹见 ../long-compact-v1/RESULTS.md；自主检索仅保留实验驱动。未在完整AgentLoop验证自主检索，未证明任意长期级联状态不退化，也未测自由叙事质量；不能仅凭平均节省率上线。', '',
  '复现：配置 DEEPSEEK_API_KEY，先准备 long-native-v2 记录，再运行 node bench/token-gate.js --budget-file <共享授权账本>；node bench/token-gate-report.js --budget-file <账本>。已有结果会按题目和组别续跑，注册源代码变化会拒绝继续。', '',
  '离线核验：node bench/verify-token-gate.js。压缩证据包含全部请求响应、usage、题目、原历史请求、ID映射、每组失败及本试验调用账目；不导出整个私有预算文件。', '']
const output = 'docs/evidence/token-gate-v1/'
await mkdir(output, { recursive: true })
const json = JSON.stringify(bundle)
assert.ok(!/sk-[A-Za-z0-9]{20,}/u.test(json), 'Possible credential in evidence')
const exports = { 'evidence.json.gz': gzipSync(json, { level: 9 }), 'summary.json': JSON.stringify({ summary: bundle.summary, accounting: bundle.accounting, manifest }, null, 2), 'RESULTS.md': lines.join('\n') }
for (const [name, content] of Object.entries(exports)) await writeFile(output + name, content)
await writeFile(output + 'SHA256SUMS', Object.entries(exports).map(([name, content]) => `${sha(content)}  ${name}\n`).join(''))
console.log(JSON.stringify({ summary: bundle.summary, accounting: bundle.accounting }, null, 2))
