import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { ArchiveStore, recallText } from '../lib/archive.js'
import { atomicJSON } from './support/storage.js'
const en = JSON.parse(await readFile('bench/runs/capacity-v1/report.json'))
const zh = JSON.parse(await readFile('bench/runs/capacity-zh-v1/report.json'))
const cases = [
  { label: 'en', path: 'bench/runs/capacity-v1/archives', session: 'scale-5000', probes: en.scales.find(s => s.count === 5000).probes },
  { label: 'zh', path: 'bench/runs/capacity-zh-v1/archive', session: 'zh-heldout', probes: zh.probes.map(p => ({ ...p, maxBytes: 4096 })) },
]
const report = { kind: 'OFFLINE_INDEX_EQUIVALENCE_AND_TIMING', created: new Date().toISOString(), cases: [] }
for (const c of cases) {
  const store = await new ArchiveStore(c.path, c.session).load()
  const memoryBefore = process.memoryUsage()
  const start = performance.now()
  store.index.sync(store.entries)
  const row = { language: c.label, entries: store.entries.length, archiveBytes: store.sizeBytes, buildIndexMs: performance.now() - start,
    memoryBefore, memoryAfter: process.memoryUsage(), probes: [] }
  for (const p of c.probes) {
    const timings = []
    let same = true
    for (let repeat = 0; repeat < 5; repeat++) {
      const begin = performance.now()
      const result = recallText(store.entries, p.query, p.maxBytes, new Set(), store.index)
      timings.push(performance.now() - begin)
      if (result !== p.context) same = false
    }
    let referenceMs
    if (p.maxBytes === 4096 && ['old-secret', 'resource', 'long-tail'].includes(p.id)) {
      const begin = performance.now()
      const result = recallText(store.entries, p.query, p.maxBytes)
      referenceMs = performance.now() - begin
      if (result !== p.context) same = false
    }
    row.probes.push({ id: p.id, maxBytes: p.maxBytes, same, timingsMs: timings, referenceMs })
  }
  report.cases.push(row)
  console.log(JSON.stringify({ language: row.language, buildIndexMs: row.buildIndexMs, allIdentical: row.probes.every(p => p.same), hotRange: [Math.min(...row.probes.flatMap(p => p.timingsMs)), Math.max(...row.probes.flatMap(p => p.timingsMs))] }))
}
await mkdir('bench/runs/index-v1', { recursive: true })
await atomicJSON('bench/runs/index-v1/report.json', report)
if (report.cases.some(c => c.probes.some(p => !p.same))) process.exitCode = 1
