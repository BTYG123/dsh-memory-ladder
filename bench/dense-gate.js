import { readFile, mkdir, appendFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { denseFixture } from './dense-fixture.js'
import { RecallIndex, recallText } from '../lib/archive.js'
import { compactRecall } from '../lib/recall-wire.js'
import { Client, parseJSON } from './support/client.js'
import { BudgetAccount, atomicJSON, readJSON } from './support/storage.js'
import { normalize } from './cases.js'

const root = 'bench/runs/dense-gate-v1/'
const protocol = JSON.parse(await readFile('bench/dense-protocol.json'))
const config = JSON.parse(await readFile('bench/protocol.json'))
const files = ['bench/dense-gate.js', 'bench/dense-fixture.js', 'bench/dense-protocol.json', 'lib/archive.js', 'lib/recall-wire.js', 'bench/support/client.js', 'bench/protocol.json']
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const sourceHash = hash(Buffer.concat(await Promise.all(files.map(f => readFile(f)))))
await mkdir(root, { recursive: true })
const fixtures = protocol.seeds.map(seed => denseFixture(seed, protocol.entities))
const fixtureHash = hash(JSON.stringify(fixtures))
const cases = fixtures.flatMap(f => {
  const index = new RecallIndex()
  return f.probes.map(p => {
    const context = recallText(f.entries, p.query, protocol.recallMaxBytes, new Set(), index)
    const ids = new Set(JSON.parse(context || '{"events":[]}').events.map(e => e.id))
    return { ...p, context, sourceCoverage: p.required.every(id => ids.has(id)), missingSources: p.required.filter(id => !ids.has(id)) }
  })
})
if (process.argv.includes('--build-only')) {
  await atomicJSON(root + 'fixtures.json', fixtures)
  await atomicJSON(root + 'cases.json', cases)
  console.log(JSON.stringify({ fixtureHash, entitiesPerSeed: protocol.entities, recordsPerSeed: fixtures[0].entries.length, cases: cases.length, sourceCovered: cases.filter(c => c.sourceCoverage).length }))
} else {
  const at = process.argv.indexOf('--budget-file')
  if (at < 0) throw Error('Supply shared authorized --budget-file')
  const budget = await BudgetAccount.open(process.argv[at + 1], { limit: 10 })
  let manifest = await readJSON(root + 'manifest.json', null)
  if (manifest && (manifest.sourceHash !== sourceHash || manifest.fixtureHash !== fixtureHash)) throw Error('Registered trial changed')
  if (!manifest) {
    manifest = { sourceHash, fixtureHash, files, protocol, initialSpent: budget.spent, created: new Date().toISOString() }
    await atomicJSON(root + 'manifest.json', manifest)
    await atomicJSON(root + 'fixtures.json', fixtures); await atomicJSON(root + 'cases.json', cases)
  }
  const system = '只输出JSON对象{"narrative":"一句简短进展","answer":"最简精确答案"}。正式原始记录优先于模型旧回答、传闻和纸条引文。当前用户明确给出的新裁决优先于历史状态。区分最初与当前；遵守否定规则。证据不足回答UNKNOWN。'
  const choice = '\n你可以检索历史归档。若现有上下文已足够，直接输出上述答案JSON；若缺少必要证据、需要核实旧状态或检查归档，只输出{"action":"retrieve"}。不要猜测未提供的历史。检索结果将在下一次调用提供。'
  async function execute(model) {
    const client = new Client(model, budget)
    const rows = await readJSON(root + model.model + '.json', [])
    async function call(request, purpose) {
      if (budget.spent - manifest.initialSpent > protocol.trialAllocationUSD - .05) throw Error('Trial allocation reached')
      const start = performance.now()
      try {
        const raw = await client.call(request, protocol.maxOutputTokens, `dense-gate-v1:${model.model}:${purpose}`)
        const result = { request, raw, ...client.lastResponse, ms: performance.now() - start }
        await appendFile(root + model.model + '-trace.jsonl', JSON.stringify({ purpose, ...result }) + '\n')
        return result
      } catch (e) {
        await appendFile(root + model.model + '-trace.jsonl', JSON.stringify({ purpose, request, error: e.message }) + '\n')
        throw e
      }
    }
    for (const [i, item] of cases.entries()) for (let j = 0; j < protocol.arms.length; j++) {
      const arm = protocol.arms[(i + j) % protocol.arms.length]
      if (rows.some(r => r.id === item.id && r.arm === arm)) continue
      const wire = compactRecall(item.context)
      const request = context => [{ role: 'system', content: system }, ...(context ? [{ role: 'user', content: 'Historical archive context:\n' + context }] : []),
        { role: 'user', content: item.visible }, { role: 'user', content: item.query }]
      const row = { id: item.id, arm, calls: [], expected: item.expected, sourceCoverage: item.sourceCoverage, type: item.type }
      try {
        let output
        if (arm === 'baseline' || arm === 'compact') {
          output = await call(request(arm === 'baseline' ? item.context : wire.text), `${item.id}:${arm}:answer`); row.calls.push(output)
        } else {
          if (arm === 'guarded-choice' && item.visible.includes('后续归档尚未核对')) {
            row.retrieved = true; row.guardReason = 'stale-context'
          } else {
            const messages = request(''); messages[0].content += choice
            const decision = await call(messages, `${item.id}:${arm}:decision`); row.calls.push(decision)
            let parsed
            try { parsed = parseJSON(decision.raw) } catch { row.invalidDecision = true }
            const validAnswer = parsed && typeof parsed.answer === 'string'
            row.retrieved = parsed?.action === 'retrieve' || !validAnswer
            if (!row.retrieved && arm === 'guarded-choice' && normalize(parsed.answer) === 'unknown') {
              row.retrieved = true; row.guardReason = 'abstention'
            }
            if (!row.retrieved) output = decision
          }
          if (row.retrieved) { output = await call(request(wire.text), `${item.id}:${arm}:answer`); row.calls.push(output) }
        }
        row.answer = parseJSON(output.raw).answer
      } catch (e) { row.error = e.message }
      row.correct = normalize(row.answer) === normalize(item.expected)
      rows.push(row); await atomicJSON(root + model.model + '.json', rows)
      console.log(`${model.model} ${rows.length}/${cases.length * 4} ${item.id} ${arm} ${row.correct ? 'OK' : 'FAIL'}${row.guardReason ? ' guard=' + row.guardReason : ''}`)
      if (row.error?.includes('allocation') || row.error?.includes('Budget exhausted')) throw Error(row.error)
    }
  }
  await Promise.all(config.models.map(execute))
}
