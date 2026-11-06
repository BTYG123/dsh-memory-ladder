// Check published experiment integrity and scores without APIs or private run files.
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import assert from 'node:assert/strict'
import { compactRecall } from '../lib/recall-wire.js'
import { normalize } from './cases.js'
import { parseJSON } from './support/client.js'
import { factualAudit } from './support/answer-audit.js'
const root = 'docs/evidence/token-gate-v1/'
const sha = data => createHash('sha256').update(data).digest('hex')
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
const prices = JSON.parse(await readFile('bench/protocol.json', 'utf8')).models
let results = 0, calls = 0, cost = 0
const ids = new Set()
for (const model of data.models) {
  const price = prices.find(p => p.model === model.model)
  assert.equal(model.cases.length, 54)
  assert.equal(model.rows.length, 216)
  assert.equal(new Set(model.rows.map(r => r.id + ':' + r.arm)).size, 216)
  for (const fixture of model.cases) {
    const wire = compactRecall(fixture.context)
    const original = JSON.parse(fixture.context)
    const encoded = JSON.parse(wire.text)
    assert.deepEqual(encoded.events, original.events.map(e => [e.order, e.role, e.text, ...(e.excerpt ? [true, e.offsetChars] : [])]))
    for (const arm of data.manifest.protocol.arms) {
      const row = model.rows.find(r => r.id === fixture.id && r.arm === arm)
      assert.equal(row.expected, fixture.expected)
      assert.equal(row.correct, normalize(row.answer) === normalize(fixture.expected))
      assert.deepEqual(row.sourceIds, wire.sourceIds)
      if (!row.error) assert.equal(parseJSON(row.calls.at(-1).raw).answer, row.answer)
      if (arm === 'baseline' && fixture.originalRequest) assert.deepEqual(row.calls[0].request, fixture.originalRequest)
      const injected = row.calls.at(-1)?.request[1]?.content?.[0]?.text
      if (arm === 'compact' || (arm === 'model-choice' && row.retrieved)) assert.ok(injected?.endsWith(wire.text))
      for (const [i, call] of row.calls.entries()) {
        const suffix = arm === 'model-choice' && i === 0 ? 'decision' : 'answer'
        const purpose = `${fixture.id}:${arm}:${suffix}`
        const raw = model.traces.filter(t => t.purpose === purpose)
        assert.equal(raw.length, 1)
        assert.equal(raw[0].raw, call.raw)
        assert.deepEqual(raw[0].request, call.request)
        const charge = model.accountCalls.find(c => c.purpose === `token-gate-v1:${model.model}:${purpose}`)
        assert.ok(charge)
        assert.deepEqual(charge.usage, call.usage)
      }
      results++
    }
  }
  for (const call of model.accountCalls) {
    assert.ok(!ids.has(call.id)); ids.add(call.id)
    if (call.usage) assert.ok(Math.abs(call.cost - (call.usage.prompt_tokens * price.inputPerMillion + call.usage.completion_tokens * price.outputPerMillion) / 1e6) < 1e-12)
    cost += call.cost; calls++
  }
  for (const arm of data.manifest.protocol.arms) {
    const summary = data.summary.find(r => r.model === model.model && r.arm === arm)
    const rows = model.rows.filter(r => r.arm === arm)
    const account = model.accountCalls.filter(c => c.purpose.includes(`:${arm}:`))
    assert.equal(summary.correct, rows.filter(r => r.correct).length)
    assert.equal(summary.factualCorrect, rows.filter(r => factualAudit(r).correct).length)
    assert.equal(summary.formatErrors, rows.filter(r => factualAudit(r).formatError).length)
    assert.equal(summary.inputTokens, account.reduce((n, c) => n + (c.usage?.prompt_tokens ?? 0), 0))
    assert.equal(summary.outputTokens, account.reduce((n, c) => n + (c.usage?.completion_tokens ?? 0), 0))
    assert.ok(Math.abs(summary.costUSD - account.reduce((n, c) => n + c.cost, 0)) < 1e-12)
  }
}
assert.ok(Math.abs(cost - data.accounting.trialCostUSD) < 1e-12)
console.log(JSON.stringify({ integrity: true, results, calls, trialCostUSD: cost, sourceHash: data.manifest.sourceHash }))
