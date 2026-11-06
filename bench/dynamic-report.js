import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import assert from 'node:assert/strict'
import { factualAudit } from './support/answer-audit.js'
const root = 'bench/runs/dynamic-focused-v1/'
const read = async p => JSON.parse(await readFile(p, 'utf8'))
const sha = b => createHash('sha256').update(b).digest('hex')
const manifest = await read(root + 'manifest.json')
assert.equal(sha(Buffer.concat(await Promise.all(manifest.files.map(f => readFile(f))))), manifest.sourceHash)
const at = process.argv.indexOf('--budget-file'); assert.ok(at >= 0)
const budget = await read(process.argv[at + 1])
const bundle = { manifest, trials: [], summary: [], clarity: {} }
const quantile = (a, p) => [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * p)]
for (const model of manifest.protocol.models) for (const arm of manifest.protocol.arms) {
  const id = `${model}-${arm}`, state = await read(root + id + '.json')
  assert.equal(state.completed, 90); assert.equal(state.turns.length, 90)
  assert.deepEqual(state.restarts.map(r => r.phase), [1, 2, 3])
  assert.equal(new Set(state.restarts.map(r => r.pid)).size, 3)
  const traces = (await readFile(root + id + '-trace.jsonl', 'utf8')).trim().split('\n').map(JSON.parse)
  const calls = budget.calls.filter(c => c.purpose?.startsWith(`dynamic-focused-v1:${id}:`))
  const archive = (await readFile(root + `archive/${id}/${sha(state.sessionId)}.jsonl`, 'utf8')).trim().split('\n').map(JSON.parse)
  // Shared capacity history is reproducible elsewhere; only dense and newly written sources are needed for provenance here.
  const sources = archive.filter(e => e.order >= 5000)
  const warm = state.turns.filter(t => ![0, 30, 60].includes(t.turn)).map(t => t.recallMs)
  const result = { id, model, arm, strictCorrect: state.turns.filter(t => t.correct).length,
    factualCorrect: state.turns.filter(t => factualAudit(t).correct).length, total: state.turns.length,
    formatErrors: state.turns.filter(t => factualAudit(t).formatError).length,
    inputTokens: calls.reduce((n, c) => n + (c.usage?.prompt_tokens ?? 0), 0), outputTokens: calls.reduce((n, c) => n + (c.usage?.completion_tokens ?? 0), 0),
    costUSD: calls.reduce((n, c) => n + c.cost, 0), calls: calls.length,
    warmRecallP50Ms: quantile(warm, .5), warmRecallP95Ms: quantile(warm, .95), coldRecallMs: state.turns.filter(t => [0, 30, 60].includes(t.turn)).map(t => t.recallMs),
    referenceChecks: state.turns.filter(t => t.referenceMatch === true).length,
    compactions: state.compactions.filter(c => c.committed).length, compactionAttempts: state.compactions.length,
    compactionErrors: state.compactions.filter(c => !c.committed), restarts: state.restarts, archiveBytes: state.archiveBytes,
    windowExceeded: state.turns.filter(t => t.windowExceeded).length,
    perType: [...new Set(state.turns.map(t => t.type))].map(type => ({ type, correct: state.turns.filter(t => t.type === type && factualAudit(t).correct).length, total: state.turns.filter(t => t.type === type).length })),
    failures: state.turns.filter(t => !t.correct).map(t => ({ turn: t.turn, type: t.type, expected: t.expected, answer: t.answer, raw: t.raw, error: t.error, factualCorrect: factualAudit(t).correct })) }
  bundle.summary.push(result); bundle.trials.push({ id, state, traces, calls, sources })
}
for (const s of bundle.summary) if (s.arm === 'focused') {
  const baseline = bundle.trials.find(t => t.id === `${s.model}-compact`).state
  const current = bundle.trials.find(t => t.id === s.id).state
  s.regressions = current.turns.filter(t => !factualAudit(t).correct && factualAudit(baseline.turns[t.turn]).correct).map(t => t.turn)
}
bundle.clarity.manifest = await read('bench/runs/balance-clarity-v1/manifest.json')
bundle.clarity.cases = await read('bench/runs/balance-clarity-v1/cases.json')
assert.equal(sha(Buffer.concat(await Promise.all(bundle.clarity.manifest.files.map(f => readFile(f))))), bundle.clarity.manifest.sourceHash)
bundle.clarity.models = []
for (const model of manifest.protocol.models) {
  const rows = await read(`bench/runs/balance-clarity-v1/${model}.json`)
  assert.equal(rows.length, 24)
  const calls = budget.calls.filter(c => c.purpose?.startsWith(`balance-clarity-v1:${model}:`))
  bundle.clarity.models.push({ model, rows, calls })
}
const clarityCostUSD = bundle.clarity.models.flatMap(m => m.calls).reduce((n, c) => n + c.cost, 0)
bundle.accounting = { trajectoryCostUSD: bundle.summary.reduce((n, s) => n + s.costUSD, 0), clarityCostUSD, cumulativeUSD: budget.spent, limitUSD: budget.limit }
const lines = ['# 高密度档案上的动态检索与余额复核', '',
  '两模型×两检索器，各90轮、三个独立进程阶段；共360个动态评分。所有轨迹载入相同29.63 MiB容量背景及120实体×12条密集历史（共6440条种子记录），再追加真实Session事件。每10轮真实压缩，每30轮退出进程并恢复。', '',
  '## 动态结果', '',
  '| 模型 | 检索器 | JSON严格正确 | 规范化答案匹配 | 输入token | 输出token | 热检索p50 / p95 ms | 费用USD |',
  '|---|---|---:|---:|---:|---:|---:|---:|',
  ...bundle.summary.map(s => `| ${s.model} | ${s.arm} | ${s.strictCorrect}/${s.total} | ${s.factualCorrect}/${s.total} | ${s.inputTokens} | ${s.outputTokens} | ${s.warmRecallP50Ms.toFixed(1)} / ${s.warmRecallP95Ms.toFixed(1)} | ${s.costUSD.toFixed(6)} |`), '',
  ...bundle.summary.map(s => `- ${s.id}：压缩${s.compactions}/${s.compactionAttempts}，独立进程${s.restarts.length}，原文直接检索核对${s.referenceChecks}次，窗口超出${s.windowExceeded}次，最终档案${(s.archiveBytes / 1048576).toFixed(2)} MiB。`), '',
  ...bundle.summary.filter(s => s.arm === 'focused').map(s => `- ${s.id} 相对本次compact轨迹新增规范化错误：${JSON.stringify(s.regressions)}。`), '',
  '## 余额措辞复核', '',
  '独立种子24179，3组数值×明确“消耗前/消耗后已结算”两种表述×4种上下文（无检索、原格式、compact、focused）×2模型，共48次。案例和实现先注册哈希；同一组使用相同系统规则。', '',
  ...bundle.clarity.models.map(m => `- ${m.model}：JSON严格正确${m.rows.filter(r => r.correct).length}/24，规范化答案匹配${m.rows.filter(r => factualAudit(r).correct).length}/24。`), '',
  '这支持使用明确措辞，不证明此前含糊问题只有一种正确理解，也没有事后修改此前题目、标准答案或分数。', '',
  '## 全部失败', '',
  ...bundle.summary.flatMap(s => s.failures.map(f => `- ${s.id}: ${JSON.stringify(f)}`)),
  ...bundle.summary.flatMap(s => s.compactionErrors.map(f => `- ${s.id} compaction: ${JSON.stringify(f)}`)),
  ...bundle.clarity.models.flatMap(m => m.rows.filter(r => !r.correct).map(r => `- clarity/${m.model}: ${JSON.stringify(r)}`)), '',
  '## 范围与费用', '',
  'Host脚本接受正式裁决并维护真值，模型回答不改变裁决；跨项目查询会回看非当前项目，摘要和后续上下文则真实受本轨迹模型输出影响。使用真实Harness Session、TokenMeter、系统提示和压缩事务，经过计费桥接调用模型；不是完整AgentLoop、模型自主裁决或自由跑团叙事评分。没有把合成背景生成视为模型历史生成费用。', '',
  'compact与focused是同一协议的独立轨迹，摘要会不同；两模型四轨迹并行，未重复采样，不能把差异外推为统计非劣保证或纯序列化因果效果。热检索耗时为本机样本，不含模型调用和每30轮的离线核对。focused仍全量扫描，延迟与CPU代价必须和token一起看；默认入口及可选compact入口未改动。', '',
  `本轮轨迹估算 $${bundle.accounting.trajectoryCostUSD.toFixed(6)}，余额专项 $${clarityCostUSD.toFixed(6)}；累计账本 $${budget.spent.toFixed(6)} / $${budget.limit}。包含全部摘要、回答、失败保留预付，按既定峰值/缓存未命中价格估计，不是服务商账单。`, '',
  '复现：准备capacity-v1种子后，在三个独立进程依次执行 node bench/dynamic-focused.js --phase 1（随后2、3）--budget-file <共享授权账本>。余额专项：node bench/balance-clarity.js --budget-file <账本>。导出：node bench/dynamic-report.js --budget-file <账本>。离线审计：node bench/verify-dynamic.js。', '',
  '压缩证据包含完整请求响应、全部新旧密集源记录、Session事件、逐题得分、恢复PID、压缩结果、检索耗时和每次调用usage/费用；不重复提交可重建的30MiB容量背景。其源文件哈希在manifest.seedHash中。', '']
const output = 'docs/evidence/dynamic-focused-v1/'
await mkdir(output, { recursive: true })
const json = JSON.stringify(bundle); assert.ok(!/sk-[A-Za-z0-9]{20,}/u.test(json))
const exports = { 'evidence.json.gz': gzipSync(json, { level: 9 }), 'summary.json': JSON.stringify({ manifest, summary: bundle.summary, clarity: bundle.clarity.models.map(m => ({ model: m.model, correct: m.rows.filter(r => r.correct).length, total: m.rows.length })), accounting: bundle.accounting }, null, 2), 'RESULTS.md': lines.join('\n') }
for (const [name, content] of Object.entries(exports)) await writeFile(output + name, content)
await writeFile(output + 'SHA256SUMS', Object.entries(exports).map(([name, content]) => `${sha(content)}  ${name}\n`).join(''))
console.log(JSON.stringify({ summary: bundle.summary.map(({ failures, perType, ...s }) => s), accounting: bundle.accounting }, null, 2))
