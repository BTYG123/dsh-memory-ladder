import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { resolve, join, basename } from 'node:path'
const source = 'docs/evidence/native-v1'
const bytes = await readFile(join(source, 'evidence.json.gz'))
const expected = (await readFile(join(source, 'SHA256SUMS'), 'utf8')).split(/\s/u)[0]
if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('Evidence checksum mismatch')
const evidence = JSON.parse(gunzipSync(bytes))
const directory = resolve('bench/runs/published-native-v1')
if (await stat(directory).catch(e => { if (e.code === 'ENOENT') return null; throw e })) throw new Error('Published replay directory already exists; keep it or choose a fresh checkout')
await mkdir(directory, { recursive: true })
await writeFile(join(directory, 'report.json'), JSON.stringify(evidence.report, null, 2))
await writeFile(join(directory, 'source-manifest.json'), JSON.stringify(evidence.sourceManifest, null, 2))
for (const trace of evidence.traces) {
  if (basename(trace.path) !== trace.path || !trace.path.endsWith('.jsonl')) throw new Error('Unsafe trace filename')
  await writeFile(join(directory, trace.path), trace.text)
}
console.log(`Restored ${evidence.traces.length} synthetic traces into ${directory}; no API requests made`)
