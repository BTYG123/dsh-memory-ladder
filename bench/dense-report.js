import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import assert from 'node:assert/strict'
import { factualAudit } from './support/answer-audit.js'
import { normalize } from './cases.js'
const root = 'bench/runs/dense-gate-v1/'
const read = async path => JSON.parse(await readFile(path, 'utf8'))
const sha = data => createHash('sha256').update(data).digest('hex')
const manifest = await read(root + 'manifest.json'), fixtures = await read(root + 'fixtures.json'), cases = await read(root + 'cases.json')
assert.equal(sha(Buffer.concat(await Promise.all(manifest.files.map(f => readFile(f))))), manifest.sourceHash)
assert.equal(sha(JSON.stringify(fixtures)), manifest.fixtureHash)
const at = process.argv.indexOf('--budget-file'); assert.ok(at >= 0)
const budget = await read(process.argv[at + 1])
const bundle = { manifest, fixtures, cases, models: [], summary: [] }
const coverage = cases.map(c => {
  const events = JSON.parse(c.context || '{"events":[]}').events
  const source = fixtures.find(f => f.seed === c.seed).entries
  const factCovered = c.required.every(id => {
    const original = source.find(e => e.id === id), event = events.find(e => e.id === id)
    if (!event) return false
    // Full short record, or the exact unique tail marker for the long-record probe.
    return c.type === 'tail-anchor' ? event.text.includes(c.expected) : event.text.includes(original.text)
  })
  return { id: c.id, type: c.type, idsCovered: c.sourceCoverage, factCovered, missingIds: c.missingSources }
})
bundle.coverage = coverage
for (const model of manifest.protocol.models) {
  const rows = await read(root + model + '.json')
  const traces = (await readFile(root + model + '-trace.jsonl', 'utf8')).trim().split('\n').map(JSON.parse)
  const calls = budget.calls.filter(c => c.purpose?.startsWith(`dense-gate-v1:${model}:`))
  assert.equal(rows.length, cases.length * manifest.protocol.arms.length)
  assert.equal(new Set(rows.map(r => `${r.id}:${r.arm}`)).size, rows.length)
  for (const row of rows) {
    assert.equal(row.expected, cases.find(c => c.id === row.id).expected)
    assert.equal(row.correct, normalize(row.answer) === normalize(row.expected))
  }
  for (const arm of manifest.protocol.arms) {
    const items = rows.filter(r => r.arm === arm), account = calls.filter(c => c.purpose.includes(`:${arm}:`))
    const regressions = items.filter(r => !factualAudit(r).correct && factualAudit(rows.find(b => b.id === r.id && b.arm === 'baseline')).correct).map(r => r.id)
    bundle.summary.push({ model, arm, total: items.length, strictCorrect: items.filter(r => r.correct).length,
      factualCorrect: items.filter(r => factualAudit(r).correct).length, formatErrors: items.filter(r => factualAudit(r).formatError).length,
      transportFailures: items.filter(r => r.error && !r.error.includes('JSON')).map(r => ({ id: r.id, error: r.error })),
      inputTokens: account.reduce((n, c) => n + (c.usage?.prompt_tokens ?? 0), 0), outputTokens: account.reduce((n, c) => n + (c.usage?.completion_tokens ?? 0), 0),
      calls: account.length, costUSD: account.reduce((n, c) => n + c.cost, 0), pendingReservations: account.filter(c => c.status !== 'settled').length,
      retrieved: items.filter(r => r.retrieved).length, staleGuard: items.filter(r => r.guardReason === 'stale-context').length,
      abstentionGuard: items.filter(r => r.guardReason === 'abstention').length,
      skippedWrong: items.filter(r => r.retrieved === false && !factualAudit(r).correct).map(r => r.id),
      factualRegressions: regressions,
      perType: manifest.protocol.seeds.length && [...new Set(cases.map(c => c.type))].map(type => ({ type, correct: items.filter(r => r.type === type && factualAudit(r).correct).length, total: items.filter(r => r.type === type).length })),
      failures: items.filter(r => !r.correct).map(r => ({ id: r.id, type: r.type, answer: r.answer, expected: r.expected,
        factualCorrect: factualAudit(r).correct, retrieved: r.retrieved, guardReason: r.guardReason, error: r.error, coverage: coverage.find(c => c.id === r.id) })) })
  }
  bundle.models.push({ model, rows, traces, calls })
}
bundle.accounting = { trialCostUSD: bundle.summary.reduce((n, s) => n + s.costUSD, 0), cumulativeUSD: budget.spent, limitUSD: budget.limit }
const lines = ['# 高事实密度与保底自主检索对照', '',
  '每种子120个项目、每项目12条分阶段交错记录；四种子共5760条记录，每条含事实、修订或有来源标记的干扰。长记录包含重复潮汐观测以检验末尾摘录。不是30 MiB体积测试。每模型64题×4组，共512个评分结果；固定4096字节原格式检索预算，compact转换后不增加证据。', '',
  '## 结果', '',
  '| 模型 | 方案 | JSON严格正确 | 事实正确 | 输入token | 输出token | 调用 | 费用USD |',
  '|---|---|---:|---:|---:|---:|---:|---:|',
  ...bundle.summary.map(s => `| ${s.model} | ${s.arm} | ${s.strictCorrect}/${s.total} | ${s.factualCorrect}/${s.total} | ${s.inputTokens} | ${s.outputTokens} | ${s.calls} | ${s.costUSD.toFixed(6)} |`), '',
  `费用包含全部决策和回答调用，以及失败的保留预付。本轮估算 $${bundle.accounting.trialCostUSD.toFixed(6)}；项目累计 $${budget.spent.toFixed(6)} / $${budget.limit}。既定峰值/缓存未命中估算单价，不是实际账单；本轮未生成摘要。`, '',
  '## 检索自身的上限', '',
  `64题中必要来源ID齐全 ${coverage.filter(c => c.idsCovered).length}/64；必要短原文或长记录唯一末尾锚点齐全 ${coverage.filter(c => c.factCovered).length}/64。无归档需求题的空来源集合视为齐全。来源ID齐全不能证明截取到了所需事实。`, '',
  ...coverage.filter(c => !c.factCovered).map(c => `- ${c.id}（${c.type}）：来源ID齐全=${c.idsCovered}，缺失ID=${JSON.stringify(c.missingIds)}。`), '',
  '这些缺陷在模型调用前已经观察到，但保留原题进行评测，没有删除难例。别名需要先找到编号再追踪交接/规则，当前单次词面检索缺少二跳；一些修订被有界预算挤出；长文本可能围绕编号而非末尾事实截取。门控只决定是否调用同一检索器，不能修复缺失证据。', '',
  '## 门控与逐项退化', '',
  'guarded-choice 读取公开的“后续归档尚未核对”状态说明，遇到它直接检索、不花决策调用；其余题由模型先决定，但直接UNKNOWN和无效决策必须检索后再答。没有读取标准答案或required来源ID。完全自主组可直接弃答。', '',
  ...bundle.summary.map(s => `- ${s.model}/${s.arm}：相对baseline新增事实错误 ${JSON.stringify(s.factualRegressions)}；跳检后答错 ${JSON.stringify(s.skippedWrong)}；过期保底${s.staleGuard}次，UNKNOWN保底${s.abstentionGuard}次。`), '',
  '主分数保持JSON协议要求；事实分数额外接受完整裸答案（例如66），不在叙事中搜索标准答案。事实分数不能掩盖输出协议失败。', '',
  '人工核查：Flash compact在2027-visible-arithmetic答73，预设答案66；该题“当前燃料73，本轮消耗7”存在结算前后措辞歧义，不据此单独断言插件导致计算退化。Pro compact在3253-joint多写单位“票”，事实值正确，但不符合精确答案规范。原题、预设答案及分数均未事后修改。运输中断和JSON解析失败也单独保留，不能全部解释为模型知识错误。', '',
  '## 范围', '',
  '这是一轮探索性静态对照。使用相同模型参数并逐题轮换组别顺序；没有重复采样或完整AgentLoop轨迹。多实体、语义改写、两跳、纠错、伪造引文、联合核查及未知信息均纳入；场景仍是程序合成，不能外推到任意任务或统计非劣保证。当前默认和可选插件均未因该试验改动。', '',
  '复现：node bench/dense-gate.js --build-only（离线）；设置DEEPSEEK_API_KEY后 node bench/dense-gate.js --budget-file <共享授权账本>。node bench/dense-report.js --budget-file <账本> 导出证据；node bench/verify-dense.js 离线审计。', '',
  '压缩证据保留完整四组输入输出、usage、全部合成源记录、缺失来源、逐题失败、公开新鲜度标签及调用账目。生产门控和检索算法未自动更新。', '']
const output = 'docs/evidence/dense-gate-v1/'
await mkdir(output, { recursive: true })
const json = JSON.stringify(bundle); assert.ok(!/sk-[A-Za-z0-9]{20,}/u.test(json))
const exports = { 'evidence.json.gz': gzipSync(json, { level: 9 }), 'summary.json': JSON.stringify({ summary: bundle.summary, coverage, accounting: bundle.accounting, manifest }, null, 2), 'RESULTS.md': lines.join('\n') }
for (const [name, content] of Object.entries(exports)) await writeFile(output + name, content)
await writeFile(output + 'SHA256SUMS', Object.entries(exports).map(([name, content]) => `${sha(content)}  ${name}\n`).join(''))
console.log(JSON.stringify({ summary: bundle.summary.map(({ failures, perType, ...s }) => s), accounting: bundle.accounting }, null, 2))
