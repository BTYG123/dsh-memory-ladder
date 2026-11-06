import { readFile, writeFile } from 'node:fs/promises'
import { ArchiveStore, recallText } from '../lib/archive.js'
const base = 'bench/runs/capacity-v1'
const prior = JSON.parse(await readFile(base + '/report.json'))
const results = { kind: 'NO_API_CAPACITY_GUARD_REGRESSION', sourcesUnchanged: [], boundary: {} }
for (const scale of prior.scales) {
  const store = await new ArchiveStore(base + '/archives', `scale-${scale.count}`).load()
  const old = (await import('./capacity-baseline/archive.js')).recallText
  results.sourcesUnchanged.push({ count: scale.count, allMatch: scale.probes.every(p => recallText(store.entries, p.query, p.maxBytes) === old(store.entries, p.query, p.maxBytes)) })
}
const store = await new ArchiveStore(base + '/boundary', 'boundary').load()
results.boundary.fullAfterReload = store.full
try { await store.remember([{ id: 'guarded-new-correction', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'VAULT-5000 now belongs to Iris.' }] }]) }
catch (e) { results.boundary.rejected = e.code === 'ARCHIVE_CAPACITY'; results.boundary.code = e.code }
results.boundary.fileBytes = store.sizeBytes
await writeFile(base + '/guard.json', JSON.stringify(results, null, 2))
console.log(JSON.stringify(results))
if (!results.boundary.rejected || results.sourcesUnchanged.some(s => !s.allMatch)) process.exitCode = 1
