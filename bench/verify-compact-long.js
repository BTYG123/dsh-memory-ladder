import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import assert from 'node:assert/strict'
import { normalize } from './cases.js'
import { parseJSON } from './support/client.js'
import BaseEngine from '../index.js'
import CompactEngine from '../lib/compact-engine.js'
import { compactRecall } from '../lib/recall-wire.js'
const root = 'docs/evidence/long-compact-v1/'
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
const protocol = JSON.parse(await readFile('bench/long-compact-protocol.json', 'utf8'))
const sourceHash = sha((await readFile('bench/long-compact.js', 'utf8')) + (await readFile('lib/archive.js', 'utf8')) + (await readFile('index.js', 'utf8')) + JSON.stringify(protocol) + (await readFile('lib/recall-wire.js', 'utf8')))
assert.equal(sourceHash, data.manifest.sourceHash)
const prices = JSON.parse(await readFile('bench/protocol.json', 'utf8')).models
// Audit every recorded context, then compare the packaged opt-in hook with the benchmark adapter.
assert.ok(CompactEngine.prototype instanceof BaseEngine)
const seen = new Set()
let totalCost = 0, correct = 0, calls = 0
for (const trial of data.models) {
  const state = trial.state, price = prices.find(p => p.model === trial.model)
  const summary = data.summary.find(s => s.model === trial.model)
  assert.equal(state.completed, 120)
  assert.equal(state.turns.length, 120)
  assert.equal(new Set(state.restarts.map(r => r.pid)).size, 3)
  assert.deepEqual(state.restarts.map(r => r.phase), [1, 2, 3])
  assert.deepEqual(state.restarts.map(r => r.resumed), [false, true, true])
  assert.equal(state.turns.filter(t => t.referenceMatch === true).length, 6)
  assert.equal(state.compactions.filter(c => c.committed).length, 12)
  let score = 0
  const sourceMap = new Map(trial.sources.map(s => [s.order, s]))
  for (const turn of state.turns) {
    const trace = trial.trace.filter(t => t.purpose === `turn${turn.turn}`)
    assert.equal(trace.length, 1)
    assert.equal(trace[0].raw, turn.raw)
    assert.equal(parseJSON(trace[0].raw).answer, turn.answer)
    assert.deepEqual(trace[0].usage, turn.usage)
    assert.equal(turn.correct, normalize(turn.answer) === normalize(turn.expected))
    score += Number(turn.correct)
    const text = trace[0].request[1].content[0].text
    const wire = JSON.parse(text.slice(text.indexOf('{"kind":"memory-ladder-recall"')))
    for (const event of wire.events) {
      const source = sourceMap.get(event[0])
      assert.ok(source, `Missing source order ${event[0]}`)
      assert.equal(event[1], source.role)
      if (!event[3]) assert.equal(event[2], source.text)
      else assert.equal(event[2], Array.from(source.text).slice(...event[4]).join(''))
    }
  }
  assert.equal(score, summary.correct)
  correct += score
  assert.equal(trial.calls.length, trial.trace.length)
  let cost = 0, input = 0, output = 0
  for (const [i, call] of trial.calls.entries()) {
    assert.ok(!seen.has(call.id)); seen.add(call.id)
    assert.equal(call.purpose, `long-compact-v1:${trial.model}:phase${trial.trace[i].phase}:${trial.trace[i].purpose}`)
    assert.deepEqual(call.usage, trial.trace[i].usage)
    assert.ok(Math.abs(call.cost - (call.usage.prompt_tokens * price.inputPerMillion + call.usage.completion_tokens * price.outputPerMillion) / 1e6) < 1e-12)
    cost += call.cost; input += call.usage.prompt_tokens; output += call.usage.completion_tokens; calls++
  }
  assert.equal(input, summary.current.input)
  assert.equal(output, summary.current.output)
  assert.ok(Math.abs(cost - summary.current.costUSD) < 1e-12)
  // The class is exactly the benchmark adapter: no extra trimming or changes to the base engine.
  const fake = Object.create(CompactEngine.prototype)
  fake.archiveOptions = { enabled: true, maxBytes: 4096 }
  fake._archive = () => ({ load: async () => ({ entries: trial.sources }) })
  const agent = { session: { deriveMessages: () => [] } }
  for (const query of ['星渡最初口令是什么？', '星渡当前持有人是谁？']) {
    assert.equal(await fake.recallFor(agent, query), compactRecall(await BaseEngine.prototype.recallFor.call(fake, agent, query)).text)
  }
  totalCost += cost
}
assert.ok(Math.abs(totalCost - data.accounting.trialCostUSD) < 1e-12)
console.log(JSON.stringify({ integrity: true, correct, turns: 240, calls, trialCostUSD: totalCost, sourceHash }))
