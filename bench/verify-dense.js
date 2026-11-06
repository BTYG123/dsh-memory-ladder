import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import assert from 'node:assert/strict'
import { denseFixture } from './dense-fixture.js'
import { recallText, RecallIndex } from '../lib/archive.js'
import { focusedRecall } from '../lib/focused-recall.js'
import { compactRecall } from '../lib/recall-wire.js'
import { factualAudit } from './support/answer-audit.js'
import { normalize } from './cases.js'
const kind = process.argv.includes('--focused') ? 'focused-gate-v1' : 'dense-gate-v1'
const root = `docs/evidence/${kind}/`
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
for (const line of (await readFile(root + 'SHA256SUMS', 'utf8')).trim().split(/\r?\n/u)) {
  const [hash, file] = line.split('  ')
  assert.ok(['evidence.json.gz', 'summary.json', 'RESULTS.md'].includes(file))
  assert.equal(sha(await readFile(root + file)), hash)
}
const data = JSON.parse(gunzipSync(await readFile(root + 'evidence.json.gz')))
const published = JSON.parse(await readFile(root + 'summary.json', 'utf8'))
assert.deepEqual(published.summary, data.summary)
assert.deepEqual(published.accounting, data.accounting)
assert.equal(sha(Buffer.concat(await Promise.all(data.manifest.files.map(f => readFile(f))))), data.manifest.sourceHash)
const fixtures = data.manifest.protocol.seeds.map(seed => denseFixture(seed, data.manifest.protocol.entities))
assert.equal(sha(JSON.stringify(fixtures)), data.manifest.fixtureHash)
assert.deepEqual(fixtures, data.fixtures)
const variants = new Map()
for (const fixture of fixtures) {
  const index = new RecallIndex()
  for (const probe of fixture.probes) {
    const saved = data.cases.find(c => c.id === probe.id)
    assert.equal(saved.expected, probe.expected)
    assert.equal(saved.context, recallText(fixture.entries, probe.query, 4096, new Set(), index))
    const focused = kind === 'focused-gate-v1' ? focusedRecall(fixture.entries, probe.query).text : ''
    for (const text of [saved.context, focused].filter(Boolean)) {
      assert.ok(Buffer.byteLength(text) <= 4096)
      for (const event of JSON.parse(text).events) {
        const original = fixture.entries.find(e => e.id === event.id)
        assert.ok(original)
        assert.equal(original.order, event.order)
        assert.equal(original.role, event.role)
        assert.equal(event.text, event.excerpt ? Array.from(original.text).slice(...event.offsetChars).join('') : original.text)
      }
    }
    variants.set(probe.id, { baseline: saved.context, compact: compactRecall(saved.context).text, focused: focused ? compactRecall(focused).text : '' })
  }
}
const prices = JSON.parse(await readFile('bench/protocol.json', 'utf8')).models
let totalCost = 0, results = 0, calls = 0
const seen = new Set()
for (const model of data.models) {
  const price = prices.find(p => p.model === model.model)
  assert.equal(model.rows.length, data.cases.length * data.manifest.protocol.arms.length)
  assert.equal(new Set(model.rows.map(r => r.id + ':' + r.arm)).size, model.rows.length)
  for (const row of model.rows) {
    const fixture = data.cases.find(c => c.id === row.id)
    assert.equal(row.expected, fixture.expected)
    assert.equal(row.correct, normalize(row.answer) === normalize(row.expected))
    const final = row.calls.at(-1)
    if (['baseline', 'compact', 'focused'].includes(row.arm) || row.retrieved) {
      if (final && !final.request[0].content.includes('你可以检索历史归档')) assert.equal(final.request[1].content, 'Historical archive context:\n' + variants.get(row.id)[row.arm === 'baseline' ? 'baseline' : row.arm === 'focused' ? 'focused' : 'compact'])
    }
    if (row.arm === 'guarded-choice' && fixture.visible.includes('后续归档尚未核对')) {
      assert.equal(row.guardReason, 'stale-context'); assert.equal(row.retrieved, true); assert.equal(row.calls.length, 1)
    }
    for (const [i, call] of row.calls.entries()) {
      const decision = ['model-choice', 'guarded-choice'].includes(row.arm) && row.guardReason !== 'stale-context' && i === 0
      const purpose = `${row.id}:${row.arm}:${decision ? 'decision' : 'answer'}`
      const traces = model.traces.filter(t => t.purpose === purpose)
      assert.equal(traces.length, 1)
      assert.equal(traces[0].raw, call.raw)
      assert.deepEqual(traces[0].request, call.request)
      const account = model.calls.find(c => c.purpose === `${kind}:${model.model}:${traces[0].purpose}`)
      assert.ok(account)
      assert.deepEqual(account.usage, call.usage)
    }
    results++
  }
  for (const arm of data.manifest.protocol.arms) {
    const rows = model.rows.filter(r => r.arm === arm), s = data.summary.find(s => s.model === model.model && s.arm === arm)
    const account = model.calls.filter(c => c.purpose.includes(`:${arm}:`))
    assert.equal(s.strictCorrect, rows.filter(r => r.correct).length)
    assert.equal(s.factualCorrect, rows.filter(r => factualAudit(r).correct).length)
    assert.equal(s.inputTokens, account.reduce((n, c) => n + (c.usage?.prompt_tokens ?? 0), 0))
    assert.equal(s.outputTokens, account.reduce((n, c) => n + (c.usage?.completion_tokens ?? 0), 0))
    assert.ok(Math.abs(s.costUSD - account.reduce((n, c) => n + c.cost, 0)) < 1e-12)
  }
  for (const call of model.calls) {
    assert.ok(!seen.has(call.id)); seen.add(call.id)
    if (call.usage) assert.ok(Math.abs(call.cost - (call.usage.prompt_tokens * price.inputPerMillion + call.usage.completion_tokens * price.outputPerMillion) / 1e6) < 1e-12)
    totalCost += call.cost; calls++
  }
}
assert.ok(Math.abs(totalCost - data.accounting.trialCostUSD) < 1e-12)
console.log(JSON.stringify({ integrity: true, kind, results, calls, costUSD: totalCost }))
