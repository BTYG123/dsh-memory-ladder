// Offline audit of the published synthetic evidence. No API key or runtime archives required.
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import assert from 'node:assert/strict'
import { normalize } from './cases.js'
import { parseJSON } from './support/client.js'

const root = 'docs/evidence/long-native-v2/'
const sha = data => createHash('sha256').update(data).digest('hex')
for (const line of (await readFile(root + 'SHA256SUMS', 'utf8')).trim().split(/\r?\n/u)) {
  const [expected, file] = line.split('  ')
  assert.ok(['evidence.json.gz', 'summary.json', 'RESULTS.md'].includes(file))
  assert.equal(sha(await readFile(root + file)), expected, file)
}
const data = JSON.parse(gunzipSync(await readFile(root + 'evidence.json.gz')))
assert.deepEqual(data.summary, JSON.parse(await readFile(root + 'summary.json', 'utf8')))
const protocol = JSON.parse(await readFile('bench/long-native-protocol.json', 'utf8'))
const sourceHash = sha((await readFile('bench/long-native.js', 'utf8')) + (await readFile('lib/archive.js', 'utf8')) + (await readFile('index.js', 'utf8')) + JSON.stringify(protocol))
assert.equal(sourceHash, data.summary.manifest.sourceHash, 'Evidence must match the registered implementation')
const prices = JSON.parse(await readFile('bench/protocol.json', 'utf8')).models
let correct = 0, turns = 0, cost = 0
const ids = new Set()
for (const state of data.states) {
  const summary = data.summary.models.find(m => m.model === state.model)
  const trace = data.traces[state.model]
  const price = prices.find(m => m.model === state.model)
  assert.equal(state.completed, 120)
  assert.equal(state.turns.length, 120)
  assert.equal(new Set(state.restarts.map(r => r.pid)).size, 3)
  assert.deepEqual(state.restarts.map(r => r.phase), [1, 2, 3])
  assert.equal(state.turns.filter(t => t.referenceMatch === true).length, 6)
  assert.equal(state.compactions.filter(c => c.committed).length, summary.compactions)
  let score = 0
  for (const turn of state.turns) {
    const calls = trace.filter(t => t.purpose === `turn${turn.turn}`)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].raw, turn.raw)
    assert.deepEqual(calls[0].usage, turn.usage)
    const answer = parseJSON(calls[0].raw).answer
    assert.equal(answer, turn.answer)
    const matched = normalize(answer) === normalize(turn.expected)
    assert.equal(matched, turn.correct)
    assert.equal(turn.windowExceeded, calls[0].usage.prompt_tokens > protocol.contextWindow)
    score += Number(matched)
  }
  assert.equal(score, summary.correct)
  assert.equal(trace.length, state.calls.length)
  let modelCost = 0
  for (const [i, call] of state.calls.entries()) {
    assert.equal(call.purpose, `long-native-v2:${state.model}:phase${trace[i].phase}:${trace[i].purpose}`)
    assert.deepEqual(call.usage, trace[i].usage)
    assert.ok(!ids.has(call.id)); ids.add(call.id)
    const expectedCost = (call.usage.prompt_tokens * price.inputPerMillion + call.usage.completion_tokens * price.outputPerMillion) / 1e6
    assert.ok(Math.abs(expectedCost - call.cost) < 1e-12)
    modelCost += call.cost
  }
  assert.ok(Math.abs(modelCost - summary.costUSD) < 1e-12)
  cost += modelCost; correct += score; turns += state.turns.length
}
assert.ok(Math.abs(cost - data.summary.trialCostUSD) < 1e-12)
assert.ok(data.index.cases.every(c => c.probes.every(p => p.same)))
assert.ok(Object.keys(data.pilot).length > 0, 'Invalid pilot must remain available')
console.log(JSON.stringify({ integrity: true, correct, turns, modelCalls: ids.size, trialCostUSD: cost, sourceHash }))
