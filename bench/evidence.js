import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { makeCase } from './cases.js'

const directory = resolve('bench/runs/holdout-v1')
const report = JSON.parse(await readFile(join(directory, 'report.json'), 'utf8'))
const expectedRuns = report.protocol.models.length * report.protocol.holdoutSeeds.length * report.protocol.arms.length
if (report.status === 'running' || report.runs.length !== expectedRuns) throw new Error('Holdouts incomplete; refuse to publish a partial success selection')
const rows = []
for (const model of report.protocol.models) for (const arm of report.protocol.arms) {
  const runs = report.runs.filter(r => r.model === model.model && r.arm === arm)
  rows.push({ model: model.model, arm, cases: runs.length, correct: runs.reduce((s, r) => s + r.probes.filter(p => p.correct).length, 0),
    total: runs.length * 8, failedRuns: runs.filter(r => r.status !== 'complete').length,
    cost: runs.reduce((s, r) => s + r.costUSD, 0), compactions: runs.reduce((s, r) => s + r.compactions, 0),
    calls: runs.reduce((s, r) => s + r.calls.length, 0) })
}
let randomState = 20261106
const random = () => { randomState = (1664525 * randomState + 1013904223) >>> 0; return randomState / 2 ** 32 }
const intervals = []
for (const m of report.protocol.models) {
  const diffs = report.protocol.holdoutSeeds.map(seed => {
    const score = arm => report.runs.find(r => r.model === m.model && r.seed === seed && r.arm === arm).probes.filter(p => p.correct).length / 8
    return score('archive-recall') - score('original')
  })
  const boot = Array.from({ length: 10000 }, () => diffs.reduce(s => s + diffs[Math.floor(random() * diffs.length)], 0) / diffs.length).sort((a, b) => a - b)
  intervals.push({ model: m.model, delta: diffs.reduce((s, x) => s + x, 0) / diffs.length, low: boot[250], high: boot[9749], cases: diffs.length })
}
const lines = ['# Native v0.1.0 / v0.2.0 holdout comparison', '',
  `Baseline: ${report.protocol.baselineCommit}. Protocol SHA-256: ${report.protocolHash}. Fixture SHA-256: ${report.fixtureHash}.`,
  '12 synthetic cases × 8 questions × 4 arms × 2 models. All runs and all errors are included. Development seed 17 is excluded.', '',
  '| Model | Arm | Correct | Accuracy | Cost USD | Compactions | Calls | Failed runs |',
  '|---|---|---:|---:|---:|---:|---:|---:|',
  ...rows.map(r => `| ${r.model} | ${r.arm} | ${r.correct}/${r.total} | ${(r.correct / r.total * 100).toFixed(1)}% | ${r.cost.toFixed(6)} | ${r.compactions} | ${r.calls} | ${r.failedRuns} |`), '',
  '## Paired case-level uncertainty', '',
  ...intervals.map(i => `${i.model}: archive-recall minus original = ${(i.delta * 100).toFixed(1)} percentage points; seeded 10,000-resample case bootstrap interval [${(i.low * 100).toFixed(1)}, ${(i.high * 100).toFixed(1)}]. These are related synthetic templates; the interval is conditional on this test set, not a population guarantee.`), '',
  '## Measured tradeoffs', '',
];
for (const m of report.protocol.models) {
  const find = arm => rows.find(r => r.model === m.model && r.arm === arm)
  const archive = find('archive-recall'), original = find('original'), full = find('full')
  lines.push(`${m.model}: archive recall cost versus original ${(100 * (archive.cost / original.cost - 1)).toFixed(1)}%; versus full ${(100 * (archive.cost / full.cost - 1)).toFixed(1)}%. This is a quality/cost tradeoff, not an unconditional claim of cost reduction.`)
}
lines.push('', '## Scope and residual failures', '',
  'Real Harness Session, token-meter, compaction transaction and dynamic-context services; metered HTTP bridge, not the complete AgentLoop/provider stack. Manual compaction every20 records; 32k window; newestFraction0.03; maxSummaryTokens1024. The baseline output ceiling bug is preserved and measured. This does not establish default1M automatic-loop performance or open-ended narrative quality. See ../../EVALUATION.md.', '',
  `Cumulative spend at completion (including earlier exploration): $${report.cumulativeBudget.spent.toFixed(6)} / $${report.cumulativeBudget.limit}. Published estimates use peak cache-miss prices and ignore discounts.`, '',
  ...report.runs.flatMap(r => [ ...(r.error ? [`- RUN FAILURE ${r.id}: ${r.error}`] : []), ...r.probes.filter(p => !p.correct).map(p => `- ${r.id} / ${p.id}: ${JSON.stringify(p.answer)}; expected ${JSON.stringify(p.expected)}${p.error ? '; ' + p.error : ''}`) ]), '',
  'Compressed evidence contains the exact protocol, every generated case, run report, source checksums and every request/response trace. It contains synthetic data only and no authorization headers. Missing/failed calls remain charged in the ledger records.',
)
const output = resolve('docs/evidence/native-v1')
await mkdir(output, { recursive: true })
const traces = []
for (const name of (await readdir(directory)).filter(n => n.endsWith('.jsonl')).sort()) traces.push({ path: name, text: await readFile(join(directory, name), 'utf8') })
const manifest = JSON.parse(await readFile(join(directory, 'source-manifest.json'), 'utf8'))
const releaseReplay = JSON.parse(await readFile(join(directory, 'release-replay.json'), 'utf8'))
const developmentBatches = []
for (const name of ['development-v1', 'release-smoke-v1']) {
  const path = resolve('bench/runs', name)
  const developmentReport = JSON.parse(await readFile(join(path, 'report.json'), 'utf8'))
  const developmentTraces = []
  for (const file of (await readdir(path)).filter(n => n.endsWith('.jsonl')).sort()) developmentTraces.push({ path: file, text: await readFile(join(path, file), 'utf8') })
  developmentBatches.push({ name, exploratory: true, report: developmentReport, traces: developmentTraces })
}
const releaseSourceManifest = { ...manifest, files: await Promise.all(manifest.files.map(async f => ({ path: f.path, sha256: createHash('sha256').update((await readFile(f.path, 'utf8')).replace(/\r\n/g, '\n')).digest('hex') }))) }
lines.push('', '## Release compatibility verification', '',
  `After the live run, release hardening fixed minimum-tier allocation under small output ceilings, oversized-record excerpt focus, exact raw-output logging, unique per-attempt billing tags, and the development Zod override. Offline replay of the final code and Zod ${releaseReplay.zod} reproduced all ${releaseReplay.matchedRuns}/${releaseReplay.totalRuns} registered runs, including the expected compaction failure, with identical model request content and output limits after normalizing fresh UUID/session identities. Recorded model responses were reused; this is compatibility regression, not another live quality result.`,
  'The evidence includes both tested and release-source checksums. Changes affecting default/small-ceiling tiers and large-record excerpts also have dedicated unit tests; those inputs were not covered by the live holdout matrix.',
  'The capped-only failed case is scored as a failed benchmark pipeline. A failed manual compaction preserves the raw surface; the production automatic hook can continue after such an error. Therefore the failed-run score is not evidence of raw-history loss.',
)
const bundle = JSON.stringify({ protocol: report.protocol, report, sourceManifest: manifest, releaseSourceManifest, releaseReplay, developmentBatches, cases: report.protocol.holdoutSeeds.map(makeCase), traces })
if (process.env.DEEPSEEK_API_KEY && bundle.includes(process.env.DEEPSEEK_API_KEY)) throw new Error('Credential found in evidence; refusing export')
const compressed = gzipSync(bundle, { level: 9 })
await writeFile(join(output, 'evidence.json.gz'), compressed)
await writeFile(join(output, 'SHA256SUMS'), createHash('sha256').update(compressed).digest('hex') + '  evidence.json.gz\n')
await writeFile(join(output, 'RESULTS.md'), lines.join('\n'))
const gate = report.protocol.models.every(m => rows.find(r => r.model === m.model && r.arm === 'archive-recall').correct >= rows.find(r => r.model === m.model && r.arm === 'original').correct)
await writeFile(join(output, 'summary.json'), JSON.stringify({ protocolHash: report.protocolHash, rows, intervals, qualityGatePassed: gate }, null, 2))
console.log(lines.slice(0, 30).join('\n'))
console.log(`Quality gate: ${gate}; evidence bytes: ${compressed.length}`)
