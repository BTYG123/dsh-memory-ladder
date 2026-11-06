import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import assert from 'node:assert/strict'
import { factualAudit } from './support/answer-audit.js'
import { focusedRecall } from '../lib/focused-recall.js'
const root = 'bench/runs/focused-gate-v1/'
const read = async p => JSON.parse(await readFile(p, 'utf8'))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const manifest = await read(root + 'manifest.json'), fixtures = await read(root + 'fixtures.json'), cases = await read(root + 'cases.json')
assert.equal(sha(Buffer.concat(await Promise.all(manifest.files.map(f => readFile(f))))), manifest.sourceHash)
assert.equal(sha(JSON.stringify(fixtures)), manifest.fixtureHash)
const at = process.argv.indexOf('--budget-file'); assert.ok(at >= 0)
const budget = await read(process.argv[at + 1])
const coverage = []
for (const item of cases) {
  const fixture = fixtures.find(f => f.seed === item.seed)
  const focused = focusedRecall(fixture.entries, item.query)
  for (const [arm, text] of [['baseline', item.context], ['focused', focused.text]]) {
    const events = JSON.parse(text || '{"events":[]}').events
    coverage.push({ id: item.id, arm, linked: arm === 'focused' && focused.linked,
      idsCovered: item.required.every(id => events.some(e => e.id === id)),
      factsCovered: item.required.every(id => {
        const source = fixture.entries.find(e => e.id === id), event = events.find(e => e.id === id)
        return event && (item.type === 'tail-anchor' ? event.text.includes(item.expected) : event.text.includes(source.text))
      }) })
  }
}
const bundle = { manifest, fixtures, cases, coverage, models: [], summary: [] }
for (const model of manifest.protocol.models) {
  const rows = await read(root + model + '.json')
  const traces = (await readFile(root + model + '-trace.jsonl', 'utf8')).trim().split('\n').map(JSON.parse)
  const calls = budget.calls.filter(c => c.purpose?.startsWith(`focused-gate-v1:${model}:`))
  assert.equal(rows.length, cases.length * manifest.protocol.arms.length)
  for (const arm of manifest.protocol.arms) {
    const items = rows.filter(r => r.arm === arm), account = calls.filter(c => c.purpose.includes(`:${arm}:`))
    bundle.summary.push({ model, arm, total: items.length, strictCorrect: items.filter(r => r.correct).length,
      factualCorrect: items.filter(r => factualAudit(r).correct).length,
      formatErrors: items.filter(r => factualAudit(r).formatError).length,
      inputTokens: account.reduce((n, c) => n + (c.usage?.prompt_tokens ?? 0), 0), outputTokens: account.reduce((n, c) => n + (c.usage?.completion_tokens ?? 0), 0),
      calls: account.length, costUSD: account.reduce((n, c) => n + c.cost, 0),
      factualRegressions: items.filter(r => !factualAudit(r).correct && factualAudit(rows.find(b => b.id === r.id && b.arm === 'baseline')).correct).map(r => r.id),
      failures: items.filter(r => !r.correct).map(r => ({ id: r.id, expected: r.expected, answer: r.answer, raw: r.calls.at(-1)?.raw, error: r.error })) })
  }
  bundle.models.push({ model, rows, traces, calls })
}
bundle.accounting = { trialCostUSD: bundle.summary.reduce((n, r) => n + r.costUSD, 0), cumulativeUSD: budget.spent, limitUSD: budget.limit }
const lines = ['# 实体关联与长文窗口检索候选', '',
  '在dense-gate-v1发现检索缺陷后设计的研究原型，使用两个新种子9109/10453，每种子120实体×12条交错记录、16题。新种子来自相同模板，不是独立题型泛化评测。两模型各32题×3组，共192个评分结果。', '',
  '## 方法', '',
  'focused仅改变检索：从问题提取明确的ASCII连字符编号；对带数字锚点的明确别名问题，从用户原始记录关联编号。以最多4个编号限定候选池，在实体内计算词频；长文选择包含最多加权问题词的160字符窗口，并保留原始字符区间。再调用原始排序/序列化器，转换为相同compact格式。不使用标准答案、required来源ID、模型调用或MIST专用正则。未识别编号时退回原检索。', '',
  '该原型会全量扫描候选记录，尚未针对近30 MiB档案优化，也不能解析任意自然语言别名；没有改动生产默认或可选compact入口，不属于已发布包的文件清单。', '',
  '| 模型 | 方案 | JSON严格正确 | 规范化答案匹配 | 输入token | 输出token | 费用USD |',
  '|---|---|---:|---:|---:|---:|---:|',
  ...bundle.summary.map(s => `| ${s.model} | ${s.arm} | ${s.strictCorrect}/${s.total} | ${s.factualCorrect}/${s.total} | ${s.inputTokens} | ${s.outputTokens} | ${s.costUSD.toFixed(6)} |`), '',
  '| 检索器 | 必要来源ID齐全 | 必要事实片段齐全 |', '|---|---:|---:|',
  ...['baseline', 'focused'].map(arm => { const rows = coverage.filter(c => c.arm === arm); return `| ${arm} | ${rows.filter(c => c.idsCovered).length}/${rows.length} | ${rows.filter(c => c.factsCovered).length}/${rows.length} |` }), '',
  '空required集合视为齐全。来源ID覆盖与事实覆盖不同；后者要求完整必要短原文或长文唯一锚点。所有摘录必须精确对应原文字符区间，离线审计重新生成检索结果并检查。', '',
  ...bundle.summary.map(s => `- ${s.model}/${s.arm}：相对baseline新增规范化答案错误 ${JSON.stringify(s.factualRegressions)}。`), '',
  `本轮API估算 $${bundle.accounting.trialCostUSD.toFixed(6)}；项目累计 $${budget.spent.toFixed(6)} / $${budget.limit}，峰值/缓存未命中单价估计，不是账单；没有摘要调用。`, '',
  '## 失败与解释限制', '',
  '“规范化答案匹配”沿用此前副分数，仅额外接受完整裸答案，不是人工语义裁判。Flash focused两道联合核查多写“票”，事实值正确但精确答案不符；Pro还出现裸数字、输出算式和余额解释差异，全部保留原分数。', '',
  '复核发现visible-arithmetic题的“当前燃料73，本轮消耗7”措辞可能被解释为已结算或结算前状态；预设答案66保留，但不应把这类差异单独当成插件导致计算退化的确定证据。今后应明确写“消耗前”与“消耗后”。本轮未事后改题或改答案重算。检索覆盖提升不等于回答全对，更不等于不退化保证。', '',
  ...bundle.summary.flatMap(s => s.failures.map(f => `- ${s.model}/${s.arm}：${JSON.stringify(f)}`)), '',
  '复现：node bench/focused-gate.js --build-only；配置DEEPSEEK_API_KEY后 node bench/focused-gate.js --budget-file <授权账本>。node bench/focused-report.js --budget-file <账本>；node bench/verify-dense.js --focused。协议及所有源文件在调用前注册哈希。', '']
const output = 'docs/evidence/focused-gate-v1/'
await mkdir(output, { recursive: true })
const json = JSON.stringify(bundle); assert.ok(!/sk-[A-Za-z0-9]{20,}/u.test(json))
const exports = { 'evidence.json.gz': gzipSync(json, { level: 9 }), 'summary.json': JSON.stringify({ manifest, summary: bundle.summary, coverage, accounting: bundle.accounting }, null, 2), 'RESULTS.md': lines.join('\n') }
for (const [name, content] of Object.entries(exports)) await writeFile(output + name, content)
await writeFile(output + 'SHA256SUMS', Object.entries(exports).map(([name, content]) => `${sha(content)}  ${name}\n`).join(''))
console.log(JSON.stringify({ summary: bundle.summary.map(({ failures, ...s }) => s), accounting: bundle.accounting }, null, 2))
