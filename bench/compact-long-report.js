import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import assert from 'node:assert/strict'
import { normalize } from './cases.js'
const root = 'bench/runs/long-compact-v1/'
const read = async p => JSON.parse(await readFile(p, 'utf8'))
const sha = data => createHash('sha256').update(data).digest('hex')
const manifest = await read(root + 'manifest.json')
const protocol = await read('bench/long-compact-protocol.json')
const sourceHash = sha((await readFile('bench/long-compact.js', 'utf8')) + (await readFile('lib/archive.js', 'utf8')) + (await readFile('index.js', 'utf8')) + JSON.stringify(protocol) + (await readFile('lib/recall-wire.js', 'utf8')))
assert.equal(sourceHash, manifest.sourceHash)
const at = process.argv.indexOf('--budget-file')
assert.ok(at >= 0)
const budget = await read(process.argv[at + 1])
const bundle = { manifest, models: [], summary: [] }
function totals(calls) {
  return { calls: calls.length, input: calls.reduce((n, c) => n + (c.usage?.prompt_tokens ?? 0), 0),
    output: calls.reduce((n, c) => n + (c.usage?.completion_tokens ?? 0), 0), costUSD: calls.reduce((n, c) => n + c.cost, 0) }
}
for (const model of protocol.models) {
  const state = await read(root + model + '.json')
  const baseline = await read('bench/runs/long-native-v2/' + model + '.json')
  const trace = (await readFile(root + model + '-trace.jsonl', 'utf8')).trim().split('\n').map(JSON.parse)
  assert.equal(state.completed, 120)
  assert.equal(state.turns.length, 120)
  assert.deepEqual(state.restarts.map(r => r.phase), [1, 2, 3])
  assert.equal(new Set(state.restarts.map(r => r.pid)).size, 3)
  assert.equal(state.turns.filter(t => t.referenceMatch === true).length, 6)
  for (const turn of state.turns) assert.equal(turn.correct, normalize(turn.answer) === normalize(turn.expected))
  const calls = budget.calls.filter(c => c.purpose?.startsWith(`long-compact-v1:${model}:`))
  assert.equal(calls.length, trace.length)
  const pathHash = sha(state.sessionId)
  const sources = (await readFile(root + `archive/${model}/${pathHash}.jsonl`, 'utf8')).trim().split('\n').map(JSON.parse).filter(e => e.order >= 5000)
  const current = totals(calls), previous = totals(baseline.calls)
  bundle.summary.push({ model, correct: state.turns.filter(t => t.correct).length, total: state.turns.length,
    baselineCorrect: baseline.turns.filter(t => t.correct).length,
    regressions: state.turns.filter(t => !t.correct && baseline.turns[t.turn].correct).map(t => t.turn),
    failures: state.turns.filter(t => !t.correct),
    current, baseline: previous, inputReduction: 1 - current.input / previous.input,
    totalTokenReduction: 1 - (current.input + current.output) / (previous.input + previous.output),
    costReduction: 1 - current.costUSD / previous.costUSD,
    currentSummary: totals(calls.filter(c => c.purpose.includes(':summary'))), baselineSummary: totals(baseline.calls.filter(c => c.purpose.includes(':summary'))),
    compactions: state.compactions, restarts: state.restarts, archiveBytes: state.archiveBytes,
    windowExceeded: state.turns.filter(t => t.windowExceeded).length })
  bundle.models.push({ model, state, baseline, trace, sources, calls })
}
bundle.accounting = { trialCostUSD: bundle.summary.reduce((n, r) => n + r.current.costUSD, 0), cumulativeUSD: budget.spent, limitUSD: budget.limit }
const lines = ['# 紧凑检索格式：完整动态长任务验证', '',
  '静态 token-gate-v1 之后的独立运行，沿用 long-native-v2 的项目事件与题目，唯一有意修改是检索段的传输格式。使用实验子类覆盖 recallFor，不改变生产默认。实际摘要和后续上下文由这次模型输出重新产生，非静态请求回放。', '',
  '| 模型 | 正确 | 原版输入 / 新版输入 token | 原版输出 / 新版输出 token | 总 token 减少 | API费用减少 |',
  '|---|---:|---:|---:|---:|---:|',
  ...bundle.summary.map(r => `| ${r.model} | ${r.correct}/${r.total} | ${r.baseline.input} / ${r.current.input} | ${r.baseline.output} / ${r.current.output} | ${(r.totalTokenReduction * 100).toFixed(1)}% | ${(r.costReduction * 100).toFixed(1)}% |`), '',
  '总量包括初始化摘要、12次定期摘要和120次回答；每模型分3个独立进程，各40轮。档案初始29.63 MiB，检索预算仍为4096字节原格式上限，转换后不补充额外事件。每20轮逐字核对 compact(reference recall) 与真实上下文段；三阶段源哈希固定。', '',
  ...bundle.summary.map(r => `- ${r.model}：相对此前120轮的逐题新增错误 ${JSON.stringify(r.regressions)}；压缩提交 ${r.compactions.filter(c => c.committed).length}/${r.compactions.length}，窗口超出 ${r.windowExceeded}。`), '',
  `本次API估算 $${bundle.accounting.trialCostUSD.toFixed(6)}，项目累计 $${budget.spent.toFixed(6)} / $${budget.limit}。费用按既定峰值/缓存未命中单价统一估算；不是服务商账单。30 MiB种子是程序生成的背景，不包含模型生成该体量历史的成本。`, '',
  '## 范围和失败', '',
  '与基线不是同时间随机交错的动态运行，摘要输出会自然变化，因此不能将全部总量差异归因于序列化格式。静态四组对照提供固定上下文的补充证据。只有两个模型、每模型一次轨迹、相同事件脚本；不是统计非劣证明或任意长任务保证。历史大量重复，活动事实较少；完整AgentLoop、生产供应商适配器和自由叙事质量未覆盖。', '',
  ...bundle.summary.flatMap(r => r.failures.map(t => `- ${r.model} turn ${t.turn}: ${JSON.stringify(t)}`)),
  ...bundle.summary.flatMap(r => r.compactions.filter(c => !c.committed).map(c => `- ${r.model} compaction: ${JSON.stringify(c)}`)), '',
  '复现：准备容量种子，在三个独立进程依次执行 node bench/long-compact.js --phase 1（随后2、3）--budget-file <共享授权账本>；node bench/compact-long-report.js --budget-file <账本>。API密钥来自环境变量。', '',
  '离线核验：node bench/verify-compact-long.js。证据包含新旧轨迹、实际请求响应、全部调用usage与费用、归档中新写事件原文及来源ID、恢复记录与失败。', '']
const output = 'docs/evidence/long-compact-v1/'
await mkdir(output, { recursive: true })
const json = JSON.stringify(bundle)
assert.ok(!/sk-[A-Za-z0-9]{20,}/u.test(json))
const exports = { 'evidence.json.gz': gzipSync(json, { level: 9 }), 'summary.json': JSON.stringify({ summary: bundle.summary, accounting: bundle.accounting, manifest }, null, 2), 'RESULTS.md': lines.join('\n') }
for (const [name, content] of Object.entries(exports)) await writeFile(output + name, content)
await writeFile(output + 'SHA256SUMS', Object.entries(exports).map(([name, content]) => `${sha(content)}  ${name}\n`).join(''))
console.log(JSON.stringify({ summary: bundle.summary, accounting: bundle.accounting }, null, 2))
