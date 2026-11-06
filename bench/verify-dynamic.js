import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import assert from 'node:assert/strict'
import { initialGame, dynamicStep } from './dynamic-plan.js'
import { factualAudit } from './support/answer-audit.js'
import { parseJSON } from './support/client.js'
import { normalize } from './cases.js'
const root = 'docs/evidence/dynamic-focused-v1/'
const sha = b => createHash('sha256').update(b).digest('hex')
for (const line of (await readFile(root + 'SHA256SUMS', 'utf8')).trim().split(/\r?\n/u)) {
  const [hash, file] = line.split('  ')
  assert.ok(['evidence.json.gz', 'summary.json', 'RESULTS.md'].includes(file))
  assert.equal(sha(await readFile(root + file)), hash)
}
const data = JSON.parse(gunzipSync(await readFile(root + 'evidence.json.gz')))
const published = JSON.parse(await readFile(root + 'summary.json', 'utf8'))
assert.deepEqual(data.summary, published.summary)
assert.deepEqual(data.accounting, published.accounting)
for (const manifest of [data.manifest, data.clarity.manifest]) assert.equal(sha(Buffer.concat(await Promise.all(manifest.files.map(f => readFile(f))))), manifest.sourceHash)
const prices = JSON.parse(await readFile('bench/protocol.json', 'utf8')).models
const seen = new Set()
let results = 0, calls = 0, trajectoryCost = 0, clarityCost = 0
function charge(account, model) {
  const price = prices.find(p => p.model === model)
  assert.ok(!seen.has(account.id)); seen.add(account.id)
  if (account.usage) assert.ok(Math.abs(account.cost - (account.usage.prompt_tokens * price.inputPerMillion + account.usage.completion_tokens * price.outputPerMillion) / 1e6) < 1e-12)
  calls++; return account.cost
}
assert.equal(data.trials.length, 4)
for (const trial of data.trials) {
  const state = trial.state, summary = data.summary.find(s => s.id === trial.id)
  assert.equal(state.completed, 90); assert.equal(state.turns.length, 90)
  assert.deepEqual(state.restarts.map(r => r.phase), [1, 2, 3])
  assert.deepEqual(state.restarts.map(r => r.resumed), [false, true, true])
  assert.equal(new Set(state.restarts.map(r => r.pid)).size, 3)
  assert.equal(state.turns.filter(t => t.referenceMatch === true).length, 3)
  assert.equal(state.compactions.filter(c => c.committed).length, 9)
  assert.ok(state.archiveBytes <= 33554432)
  const sources = new Map(trial.sources.map(e => [e.order, e]))
  let game = initialGame(data.manifest.protocol.seed), score = 0
  for (const turn of state.turns) {
    const step = dynamicStep(turn.turn, game, data.manifest.protocol.seed); game = step.game
    assert.equal(turn.query, step.query); assert.equal(turn.expected, step.expected); assert.equal(turn.type, step.type)
    assert.equal(turn.correct, normalize(turn.answer) === normalize(step.expected))
    const trace = trial.traces.filter(t => t.purpose === `turn${turn.turn}`)
    assert.equal(trace.length, 1)
    if (turn.raw) {
      assert.equal(trace[0].raw, turn.raw)
      assert.deepEqual(trace[0].usage, turn.usage)
      if (!turn.error) assert.equal(parseJSON(turn.raw).answer, turn.answer)
    }
    assert.ok(trace[0].request.at(-1).content.some(c => c.text === step.query))
    for (const e of JSON.parse(turn.section || '{"events":[]}').events) {
      const source = sources.get(e[0]); assert.ok(source, `Missing source order ${e[0]}`)
      assert.equal(source.role, e[1])
      assert.equal(e[2], e[3] ? Array.from(source.text).slice(...e[4]).join('') : source.text)
      assert.ok(e[0] < turn.archiveCount)
    }
    score += Number(turn.correct); results++
  }
  assert.deepEqual(game, state.game)
  assert.equal(summary.strictCorrect, score)
  assert.equal(summary.factualCorrect, state.turns.filter(t => factualAudit(t).correct).length)
  assert.equal(summary.inputTokens, trial.calls.reduce((n, c) => n + (c.usage?.prompt_tokens ?? 0), 0))
  assert.equal(summary.outputTokens, trial.calls.reduce((n, c) => n + (c.usage?.completion_tokens ?? 0), 0))
  assert.equal(trial.calls.length, trial.traces.length)
  let cost = 0
  for (const call of trial.calls) {
    const suffix = call.purpose.split(`dynamic-focused-v1:${trial.id}:`)[1]
    const trace = trial.traces.find(t => `phase${t.phase}:${t.purpose}` === suffix)
    assert.ok(trace)
    if (call.usage) assert.deepEqual(call.usage, trace.usage)
    cost += charge(call, state.model)
  }
  assert.ok(Math.abs(cost - summary.costUSD) < 1e-12); trajectoryCost += cost
}
for (const model of data.clarity.models) {
  assert.equal(model.rows.length, 24)
  assert.equal(new Set(model.rows.map(r => r.id + ':' + r.arm)).size, 24)
  for (const row of model.rows) {
    const item = data.clarity.cases.find(c => c.id === row.id)
    const [i, mode] = row.id.split('-'), [value, spent] = data.clarity.manifest.protocol.values[Number(i)]
    assert.equal(row.expected, String(mode === 'before' ? value - spent : value))
    assert.equal(item.expected, row.expected)
    assert.equal(row.correct, normalize(row.answer) === normalize(item.expected))
    const call = row.calls[0]
    if (call) {
      assert.equal(call.request.at(-1).content, item.query)
      assert.equal(call.request.at(-2).content, item.visible)
      assert.equal(parseJSON(call.raw).answer, row.answer)
      const account = model.calls.find(c => c.purpose === `balance-clarity-v1:${model.model}:${row.id}:${row.arm}`)
      assert.deepEqual(account.usage, call.usage)
    }
    results++
  }
  for (const call of model.calls) clarityCost += charge(call, model.model)
}
assert.ok(Math.abs(trajectoryCost - data.accounting.trajectoryCostUSD) < 1e-12)
assert.ok(Math.abs(clarityCost - data.accounting.clarityCostUSD) < 1e-12)
console.log(JSON.stringify({ integrity: true, results, calls, trajectoryCostUSD: trajectoryCost, clarityCostUSD: clarityCost }))
