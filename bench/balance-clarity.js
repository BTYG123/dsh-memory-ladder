import { readFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { denseFixture } from './dense-fixture.js'
import { recallText, RecallIndex } from '../lib/archive.js'
import { compactRecall } from '../lib/recall-wire.js'
import { focusedRecall } from '../lib/focused-recall.js'
import { Client, parseJSON } from './support/client.js'
import { BudgetAccount, atomicJSON, readJSON } from './support/storage.js'
import { normalize } from './cases.js'
const root = 'bench/runs/balance-clarity-v1/'
await mkdir(root, { recursive: true })
const at = process.argv.indexOf('--budget-file'); if (at < 0) throw Error('Supply shared budget')
const config = JSON.parse(await readFile('bench/protocol.json'))
const account = await BudgetAccount.open(process.argv[at + 1], { limit: 10 })
const files = ['bench/balance-clarity.js', 'bench/dense-fixture.js', 'lib/archive.js', 'lib/recall-wire.js', 'lib/focused-recall.js', 'bench/support/client.js', 'bench/protocol.json']
const sourceHash = createHash('sha256').update(Buffer.concat(await Promise.all(files.map(f => readFile(f))))).digest('hex')
const protocol = { version: 'balance-clarity-v1', seed: 24179, arms: ['no-recall', 'baseline', 'compact', 'focused'], values: [[73, 7], [157, 11], [218, 13]], cases: 6, allocationUSD: .15 }
let manifest = await readJSON(root + 'manifest.json', null)
if (manifest && manifest.sourceHash !== sourceHash) throw Error('Registered clarity trial changed')
if (!manifest) { manifest = { sourceHash, files, protocol, initialSpent: account.spent, created: new Date().toISOString() }; await atomicJSON(root + 'manifest.json', manifest) }
const fixture = denseFixture(protocol.seed), cases = []
for (const [i, [value, spent]] of protocol.values.entries()) for (const mode of ['before', 'after']) {
  const code = `MIST-${protocol.seed}-E${[1, 35, 87][i]}`, query = `${code} 本次消耗后的余额是多少？answer只给数字。`
  cases.push({ id: `${i}-${mode}`, mode, query, expected: String(mode === 'before' ? value - spent : value),
    visible: mode === 'before' ? `${code} 最新正式裁决：消耗前余额恰好为${value}；随后恰好消耗${spent}，没有其他收支。`
      : `${code} 最新正式裁决：消耗后已结算余额恰好为${value}。本次消耗${spent}已计入这个余额，不得再次扣减。`,
    baseline: recallText(fixture.entries, query, 4096, new Set(), new RecallIndex()), focused: focusedRecall(fixture.entries, query).text })
}
await atomicJSON(root + 'cases.json', cases)
const system = '只输出JSON对象{"narrative":"简短进展","answer":"最简精确答案"}。当前最新正式裁决优先于所有历史及模型旧回答。区分消耗前与消耗后，已经结算的余额不得重复扣减。数字答案不加单位。证据不足回答UNKNOWN。'
async function execute(model) {
  const client = new Client(model, account), rows = await readJSON(root + model.model + '.json', [])
  for (const [i, item] of cases.entries()) for (let j = 0; j < protocol.arms.length; j++) {
    const arm = protocol.arms[(i + j) % protocol.arms.length]
    if (rows.some(r => r.id === item.id && r.arm === arm)) continue
    if (account.spent - manifest.initialSpent > protocol.allocationUSD - .03) throw Error('Clarity allocation reached')
    const context = arm === 'no-recall' ? '' : arm === 'baseline' ? item.baseline : compactRecall(arm === 'compact' ? item.baseline : item.focused).text
    const request = [{ role: 'system', content: system }, ...(context ? [{ role: 'user', content: 'Historical archive context:\n' + context }] : []),
      { role: 'user', content: item.visible }, { role: 'user', content: item.query }]
    const row = { id: item.id, mode: item.mode, arm, expected: item.expected, calls: [] }
    try {
      const raw = await client.call(request, 128, `balance-clarity-v1:${model.model}:${item.id}:${arm}`)
      row.calls.push({ request, raw, ...client.lastResponse }); row.answer = parseJSON(raw).answer
    } catch (e) { row.error = e.message }
    row.correct = normalize(row.answer) === normalize(item.expected)
    rows.push(row); await atomicJSON(root + model.model + '.json', rows)
    console.log(`${model.model} clarity ${rows.length}/24 ${row.correct ? 'OK' : 'FAIL'}`)
  }
}
await Promise.all(config.models.map(execute))
