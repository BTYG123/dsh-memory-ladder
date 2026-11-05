import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import assert from 'node:assert/strict'
import { normalize } from './cases.js'
const directory = 'docs/evidence/native-v1'
const compressed = await readFile(`${directory}/evidence.json.gz`)
const checksum = (await readFile(`${directory}/SHA256SUMS`, 'utf8')).split(/\s/u)[0]
assert.equal(createHash('sha256').update(compressed).digest('hex'), checksum)
const evidence = JSON.parse(gunzipSync(compressed))
assert.equal(createHash('sha256').update(JSON.stringify(evidence.protocol)).digest('hex'), evidence.report.protocolHash)
assert.equal(createHash('sha256').update(await readFile('bench/cases.js')).digest('hex'), evidence.report.fixtureHash)
let traced = 0
for (const file of evidence.traces) traced += file.text.trim().split('\n').length
const charged = evidence.report.runs.reduce((s, r) => s + r.calls.length, 0)
assert.equal(traced, charged)
for (const run of evidence.report.runs) for (const p of run.probes) assert.equal(p.correct, normalize(p.answer) === normalize(p.expected))
for (const file of evidence.releaseSourceManifest.files) {
  const source = (await readFile(file.path, 'utf8')).replace(/\r\n/g, '\n')
  assert.equal(createHash('sha256').update(source).digest('hex'), file.sha256, file.path)
}
assert.equal(evidence.releaseReplay.matchedRuns, evidence.releaseReplay.totalRuns)
console.log(JSON.stringify({ checksumVerified: true, requestResponseTraces: traced, registeredRuns: evidence.report.runs.length,
  offlineReleaseReplay: evidence.releaseReplay.matchedRuns, developmentBatches: evidence.developmentBatches.length, releaseSourcesVerified: true }))
