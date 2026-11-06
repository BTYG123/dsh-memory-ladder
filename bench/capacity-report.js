import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'
const read = async path => JSON.parse(await readFile(path, 'utf8'))
const report = await read('bench/runs/capacity-v1/report.json')
const zh = await read('bench/runs/capacity-zh-v1/report.json')
const guard = await read('bench/runs/capacity-v1/guard.json')
const boundaryRestore = await read('bench/runs/capacity-v1/boundary-restore.json')
if (report.status !== 'complete' || zh.status !== 'complete' || report.modelRuns.length !== 60 || zh.answers.length !== 16) throw Error('Incomplete trials')
const defaultModels = report.modelRuns.filter(x => x.maxBytes === 4096)
const money = report.modelRuns.reduce((s, x) => s + x.costUSD, 0) + zh.answers.reduce((s, x) => s + x.costUSD, 0)
const rows = report.scales.map(scale => {
  const p = scale.probes.filter(x => x.maxBytes === 4096)
  const answers = defaultModels.filter(x => x.count === scale.count)
  return { count: scale.count, mib: scale.archiveBytes / 1048576, sources: p.filter(x => x.required.length && x.rawSourceIdsPresent).length, sourceTotal: p.filter(x => x.required.length).length,
    correct: answers.filter(x => x.correct).length, total: answers.length,
    minMs: Math.min(...p.map(x => x.recallMs)), maxMs: Math.max(...p.map(x => x.recallMs)), reloadMs: scale.reloadMs,
    identical: scale.resumeIdentical, costUSD: answers.reduce((s, x) => s + x.costUSD, 0) }
})
rows.push({ language: 'zh', count: zh.count, mib: zh.archiveBytes / 1048576, sources: zh.probes.filter(p => p.required.length && p.rawSourceIdsPresent).length, sourceTotal: zh.probes.filter(p => p.required.length).length,
  correct: zh.answers.filter(x => x.correct).length, total: zh.answers.length, minMs: Math.min(...zh.probes.map(x => x.recallMs)),
  maxMs: Math.max(...zh.probes.map(x => x.recallMs)), costUSD: zh.answers.reduce((s, x) => s + x.costUSD, 0) })
const lines = ['# v0.2.1 容量与精度压力测试', '',
  '基线为审核版23456b4；没有重新训练或修改检索算法来适配答案。按需提供归档摘录给Flash/Pro，默认每次4096 UTF-8字节。归档容量不是模型上下文窗口。', '',
  '| 数据 | 记录数 | 归档 MiB | 原文ID齐全 | 两模型正确题数 | 检索耗时范围 ms | 该组API费用 USD |',
  '|---|---:|---:|---:|---:|---:|---:|',
  ...rows.map(r => `| ${r.language ?? 'en'} | ${r.count} | ${r.mib.toFixed(2)} | ${r.sources}/${r.sourceTotal} | ${r.correct}/${r.total} | ${r.minMs.toFixed(0)}–${r.maxMs.toFixed(0)} | ${r.costUSD.toFixed(6)} |`), '',
  `默认4096字节下正确 ${(defaultModels.filter(x => x.correct).length + zh.answers.filter(x => x.correct).length)}/64。英文最大规模额外对三题比较1024/8192字节，合并全部条件 ${report.modelRuns.filter(x => x.correct).length + zh.answers.filter(x => x.correct).length}/76。本轮API费用$${money.toFixed(6)}，累计账本$${zh.budget.spent.toFixed(6)} / $10，包含按调用ID补记审核方1080次评测调用的费用。`, '',
  '## 大容量下的优势与代价', '',
  '- 最早口令、中部编号、长消息末尾暗号、最新/历史持有人、资源变化、否定规则和未知信息均纳入测试。27个英文有来源要求的查询条件的必要原文ID全部召回；另3个未知信息问题不定义原文召回率。ID齐全不自动等于答案正确。',
  '- 英文三个规模由新进程重新载入，所有查询上下文哈希与原进程完全一致。报告保留各阶段PID和载入耗时。',
  '- 模型看到的只是有界摘录，而不是把数十MiB原文全发给模型。费用不包含之前生成这些历史或执行压缩的成本，不能直接外推整场跑团开销。',
  '- 当前检索每次重新扫描并分词。在接近30MiB时约秒级耗时；这是下一步建立增量索引的依据，不是“容量越大完全没代价”。内存指标只是测试进程的RSS采样，不是完整宿主的峰值。', '',
  '## 精度边界与修复', '',
  '原发布实现恰好到达33554432字节后，remember()仍正常返回但没有存入一条最新持有人纠正，检索结果完全不变。新进程载入后full标志还会恢复成false。真实Harness原始日志未因此丢失，但归档可能把旧状态呈现给模型。',
  '本分支修复为明确抛出ARCHIVE_CAPACITY。由于归档写入发生在摘要调用之前，真实Harness事务会拒绝替换，保留原始消息，不产生该次摘要模型调用。已用部分消息写入成功、下一条超限的真实事务测试覆盖。重新载入也能识别文件已经到达上限。',
  '这是一种保留精度的失败方式，不是无限扩容：满后仍需增大archiveMaxBytes、外部归档轮转，或显式选择停用归档。继续保留原始上下文最终可能达到模型窗口上限。此补丁不自动修复旧版本已经遗漏的历史。',
  `32MiB实文件边界回归：${JSON.stringify(guard.boundary)}。三个规模的全部30个查询输出与基线逐字一致；没有把补丁回归当成新模型能力测试。`, '',
  '## 失败明细', '',
  ...report.modelRuns.filter(x => !x.correct).map(x => `- ${x.id}：回答${JSON.stringify(x.answer)}，期望${x.expected}。请求中原始算式事实齐全；属于模型计算/推断错误，不应归因于原文未召回。`),
  ...zh.answers.filter(x => !x.correct).map(x => `- 中文 ${x.model}/${x.id}：回答${JSON.stringify(x.answer)}，期望${x.expected}。`), '',
  '## 局限与复现', '',
  '这是探索性压力测试，不是预注册泛化评测。背景大量重复，查询多为准确词面匹配，仅少量事实；不能由满分推导对任意语义改写、自由叙事或所有长任务都精确。1024字节条件中的单个错误不足以证明小窗口导致系统性退化。',
  '运行：node bench/capacity.js --phase build；新进程运行 --phase resume；配置密钥后运行 --phase models --budget-file 已授权账本。中文测试：node bench/capacity-zh.js --budget-file 已授权账本。固定baseline位于bench/capacity-baseline/archive.js。运行目录已存在时不会覆盖原始结果。',
  '证据包含每题实际输入、原始响应、usage、耗时、必要来源ID、进程恢复结果、失败及边界记录。出于体积不提交数十MiB重复背景文件；生成代码与字节计数均保留。',
]
const output = 'docs/evidence/capacity-v1'
await mkdir(output, { recursive: true })
const bundle = JSON.stringify({ report, zh, guard, boundaryRestore })
if (process.env.DEEPSEEK_API_KEY && bundle.includes(process.env.DEEPSEEK_API_KEY)) throw Error('Credential found; refusing export')
const bytes = gzipSync(bundle, { level: 9 })
await writeFile(join(output, 'evidence.json.gz'), bytes)
await writeFile(join(output, 'SHA256SUMS'), createHash('sha256').update(bytes).digest('hex') + '  evidence.json.gz\n')
await writeFile(join(output, 'RESULTS.md'), lines.join('\n'))
await writeFile(join(output, 'summary.json'), JSON.stringify({ rows, costUSD: money, cumulativeUSD: zh.budget.spent, guard }, null, 2))
console.log(lines.slice(0, 16).join('\n'))
