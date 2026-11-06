// Export synthetic trial data only; the shared account and API key are never bundled.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import assert from 'node:assert/strict'
import { normalize } from './cases.js'

const read = async path => JSON.parse(await readFile(path, 'utf8'))
const sha = data => createHash('sha256').update(data).digest('hex')
const quantile = (values, p) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * p)]
const root = 'bench/runs/long-native-v2'
const manifest = await read(join(root, 'manifest.json'))
const protocol = await read('bench/long-native-protocol.json')
const sourceHash = sha((await readFile('bench/long-native.js', 'utf8')) + (await readFile('lib/archive.js', 'utf8')) + (await readFile('index.js', 'utf8')) + JSON.stringify(protocol))
assert.equal(sourceHash, manifest.sourceHash, 'Registered implementation changed')
const budgetIndex = process.argv.indexOf('--budget-file')
assert.ok(budgetIndex >= 0, 'Supply --budget-file for final cumulative accounting')
const budget = await read(process.argv[budgetIndex + 1])
const index = await read('bench/runs/index-v1/report.json')
assert.ok(index.cases.every(c => c.probes.every(p => p.same)))
const states = [], traces = {}, summaries = []
for (const model of protocol.models) {
  const name = typeof model === 'string' ? model : model.model
  const s = await read(join(root, name + '.json'))
  assert.equal(s.completed, 120)
  assert.equal(s.turns.length, 120)
  assert.equal(s.restarts.length, 3)
  assert.equal(new Set(s.restarts.map(r => r.pid)).size, 3)
  assert.deepEqual(s.restarts.map(r => r.phase), [1, 2, 3])
  assert.deepEqual(s.restarts.map(r => r.resumed), [false, true, true])
  assert.equal(s.turns.filter(t => t.referenceMatch === true).length, 6)
  for (const t of s.turns) assert.equal(t.correct, normalize(t.answer) === normalize(t.expected))
  traces[name] = (await readFile(join(root, name + '-trace.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse)
  const calls = budget.calls.filter(c => c.purpose?.startsWith(`long-native-v2:${name}:`))
  assert.equal(calls.length, traces[name].length)
  const warm = s.turns.filter(t => ![0, 40, 80].includes(t.turn)).map(t => t.recallMs)
  summaries.push({ model: name, correct: s.turns.filter(t => t.correct).length, total: s.turns.length,
    compactions: s.compactions.filter(c => c.committed).length, compactionAttempts: s.compactions.length,
    compactionErrors: s.compactions.filter(c => c.error), restarts: s.restarts, archiveBytes: s.archiveBytes,
    windowExceeded: s.turns.filter(t => t.windowExceeded).length,
    maxPromptTokens: Math.max(...s.turns.map(t => t.usage?.prompt_tokens ?? 0)),
    warmRecallP50Ms: quantile(warm, .5), warmRecallP95Ms: quantile(warm, .95),
    coldRecallMs: s.turns.filter(t => [0, 40, 80].includes(t.turn)).map(t => t.recallMs),
    calls: calls.length, costUSD: calls.reduce((n, c) => n + c.cost, 0),
    failures: s.turns.filter(t => !t.correct) })
  states.push(s)
}
const pilot = {}
for (const file of await readdir('bench/runs/long-native-v1')) {
  if (!/\.(json|jsonl)$/u.test(file)) continue
  const text = await readFile(join('bench/runs/long-native-v1', file), 'utf8')
  pilot[file] = file.endsWith('.jsonl') ? text.trim().split('\n').map(JSON.parse) : JSON.parse(text)
}
const pilotCalls = budget.calls.filter(c => c.purpose?.startsWith('long-native-v1:'))
const pilotCostUSD = pilotCalls.reduce((n, c) => n + c.cost, 0)
const indexSummary = index.cases.map(c => ({ language: c.language, entries: c.entries, archiveBytes: c.archiveBytes,
  buildIndexMs: c.buildIndexMs, heapDeltaMiB: (c.memoryAfter.heapUsed - c.memoryBefore.heapUsed) / 1048576,
  rssDeltaMiB: (c.memoryAfter.rss - c.memoryBefore.rss) / 1048576,
  identical: c.probes.filter(p => p.same).length, probes: c.probes.length,
  hotP50Ms: quantile(c.probes.flatMap(p => p.timingsMs), .5), hotP95Ms: quantile(c.probes.flatMap(p => p.timingsMs), .95),
  referenceP50Ms: quantile(c.probes.filter(p => p.referenceMs !== undefined).map(p => p.referenceMs), .5) }))
const summary = { manifest, models: summaries, index: indexSummary, pilotCostUSD,
  trialCostUSD: summaries.reduce((n, s) => n + s.costUSD, 0), cumulativeUSD: budget.spent, limitUSD: budget.limit }
const lines = ['# 增量索引与跨进程长任务测试', '',
  '基于审核后的 v0.2.1（23456b4）及容量保护补丁。索引仅缓存原有分词和排序所需数据，不增加向量服务或模型调用。', '',
  '## 近 30 MiB 档案检索', '',
  '| 数据 | 首次建索引 ms | 热检索 p50 / p95 ms | 原算法配对查询中位数 ms | heap / RSS 增量 MiB | 完全相同 |',
  '|---|---:|---:|---:|---:|---:|',
  ...indexSummary.map(s => `| ${s.language} | ${s.buildIndexMs.toFixed(1)} | ${s.hotP50Ms.toFixed(2)} / ${s.hotP95Ms.toFixed(2)} | ${s.referenceP50Ms.toFixed(1)} | ${s.heapDeltaMiB.toFixed(1)} / ${s.rssDeltaMiB.toFixed(1)} | ${s.identical}/${s.probes} |`), '',
  '22 个查询条件各重复 5 次；原算法额外配对 3 个默认预算查询/语言。速度为本机单次运行样本，非通用性能承诺，也不是模型响应延迟。heap 与 RSS 是建索引前后采样差，受 GC 影响，不代表峰值。索引不持久化，每次新进程首次查询重新构建；每次查询仍检查记录和排除集合，并复制词频表，并非常数复杂度。', '',
  '## 持续任务：每模型 120 轮', '',
  '先向每模型会话归档种入 5,000 条、29.63 MiB 的旧档案，再进行中文项目/跑团状态管理。10 类任务循环 12 次：交接、余额计算、规则更新、最初口令、人物别名、禁止公开、未知信息、伪造指令、最初持有人及四项联合核对。每 10 轮真实压缩，每 40 轮退出并启动新进程，从真实 Session 事件及归档恢复。', '',
  '| 模型 | 正确 | 压缩成功/尝试 | 新进程数 | 最大 prompt tokens | 热检索 p50 / p95 ms | API 估算 USD |',
  '|---|---:|---:|---:|---:|---:|---:|',
  ...summaries.map(s => `| ${s.model} | ${s.correct}/${s.total} | ${s.compactions}/${s.compactionAttempts} | ${s.restarts.length} | ${s.maxPromptTokens} | ${s.warmRecallP50Ms.toFixed(2)} / ${s.warmRecallP95Ms.toFixed(2)} | ${s.costUSD.toFixed(6)} |`), '',
  `正式试验费用 $${summary.trialCostUSD.toFixed(6)}，包括初始化摘要、逐轮回答及定期摘要；无效驱动试跑另计 $${pilotCostUSD.toFixed(6)}。整个项目累计账本 $${budget.spent.toFixed(6)} / $${budget.limit}。按记录的 usage 和既定峰值/缓存未命中单价估算，不是账户账单。种子档案由程序生成，不包含生成 30 MiB 历史的模型费用。`, '',
  `检索默认 4096 UTF-8 字节，模型窗口 32768 tokens；窗口超出共 ${summaries.reduce((n, s) => n + s.windowExceeded, 0)} 次。每模型 6 次与无索引算法逐字核对，共 12 次通过；这些核对不计入模型正确率。`, '',
  '## 失败与范围', '',
  '先前 long-native-v1 驱动遗漏 assistant 的 step 边界，导致 TokenMeter 拒绝压缩；还把带展示包装的上下文与原始检索段比较，错误报出分歧。因此停止该试跑，其数据全部保留在证据 pilot 字段，不计入能力分数。修正驱动后注册 long-native-v2，三阶段使用相同 sourceHash；没有中途改题或改实现。', '',
  ...summaries.flatMap(s => s.failures.map(t => `- ${s.model} turn ${t.turn}: ${JSON.stringify({ expected: t.expected, answer: t.answer, error: t.error })}`)),
  ...summaries.flatMap(s => s.compactionErrors.map(c => `- ${s.model} compaction: ${JSON.stringify(c)}`)), '',
  '这是合成、重复任务，仅有少量活动事实，也没有无插件长任务对照组。权威事件由宿主脚本推进，模型回答不改变裁决；不能证明自由跑团的叙事质量、自主规划、任意语义改写或无限容量。本测试运行真实 Harness Session、TokenMeter、系统提示和压缩服务，通过计费传输桥接调用模型，未运行完整 AgentLoop 或生产供应商适配器。归档仍受默认 32 MiB 限制，满后拒绝压缩以保留原始记录。', '',
  '## 复现与证据', '',
  '先按 docs/CAPACITY.md 生成种子档案；运行 node bench/index-speed.js。配置 DEEPSEEK_API_KEY 后，以同一授权预算账本依次在三个独立进程执行 node bench/long-native.js --phase 1（随后 2、3）--budget-file <账本>。运行目录存在时按已保存进度继续，正式试验 sourceHash 变化会拒绝继续。', '',
  'node bench/long-report.js --budget-file <账本> 导出报告。evidence.json.gz 包含完整请求/响应、usage、状态事件、恢复 PID、原算法耗时及失败试跑；不提交可重建的 30 MiB 种子文件。SHA256SUMS 用于验证文件完整性。', '']
const output = 'docs/evidence/long-native-v2'
await mkdir(output, { recursive: true })
const bundle = JSON.stringify({ summary, index, states, traces, pilot })
assert.ok(!/sk-[A-Za-z0-9]{20,}/u.test(bundle), 'Possible API credential in evidence')
const files = { 'evidence.json.gz': gzipSync(bundle, { level: 9 }), 'summary.json': JSON.stringify(summary, null, 2), 'RESULTS.md': lines.join('\n') }
for (const [name, content] of Object.entries(files)) await writeFile(join(output, name), content)
await writeFile(join(output, 'SHA256SUMS'), Object.entries(files).map(([name, content]) => `${sha(content)}  ${name}\n`).join(''))
console.log(JSON.stringify(summary, null, 2))
