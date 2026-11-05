import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Engine from '../index.js'
import { ArchiveStore, recallText } from '../lib/archive.js'
import { tierBudgets } from '../lib/pure.js'
import { nativeRuntime } from './native-runtime.mjs'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { renderContextSnapshot } from '@deepseek-ai/dsh-system-prompt'
import { Session } from '@deepseek-ai/dsh-session'

test('actual Harness transaction archives original messages and restores recall after restart', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'native-ladder-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  let requested = 0
  const runtime = nativeRuntime(Engine, directory, async function* (options) {
    requested = options.maxTokens
    yield { type: 'text-delta', index: 0, text: '## Tier 0 — the newest round, condensed\n任务继续，早期口令见归档。\n## Archive pointer\n[memory:test]' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }, { maxSummaryTokens: 512 })
  const secret = runtime.append('队伍的准确口令是月潮-824。' + '旧剧情细节。'.repeat(400))
  runtime.append('继续冒险，保留最新消息。')
  const result = await runtime.engine.compactNow(runtime.agent, new AbortController().signal)
  assert.ok(result)
  assert.ok(requested <= 512)
  assert.ok(!runtime.session.deriveMessages().some(m => m.id === secret.data.id))
  const recalled = await runtime.engine.recallFor(runtime.agent, '队伍的准确口令是什么？')
  assert.match(recalled, /月潮-824/u)
  const store = new ArchiveStore(directory, runtime.session.id)
  await store.load()
  assert.ok(store.entries.some(e => e.id === secret.data.id))
  assert.match(recallText(store.entries, '准确口令'), /月潮-824/u)
  assert.ok(Buffer.byteLength(recalled, 'utf8') <= 4096)
  await new Promise(resolve => setImmediate(resolve))
  await runtime.ctx.waterfall('agent/pre-step', { agent: runtime.agent, messages: [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '准确口令是什么？' }] })], signal: new AbortController().signal }, async () => undefined)
  const assembly = await runtime.ctx.systemPrompt.assemble({ agent: runtime.agent })
  assert.match(renderContextSnapshot(assembly), /月潮-824/u)
  const resumed = nativeRuntime(Engine, directory, async function* () {}, { maxSummaryTokens: 512 })
  resumed.agent.session = Session.create(runtime.session.id, runtime.session.snapshotEvents())
  assert.match(await resumed.engine.recallFor(resumed.agent, '准确口令'), /月潮-824/u)
})

test('archive deduplicates identities, isolates sessions, and excludes checkpoints and system instructions', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'native-isolate-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const archive = new ArchiveStore(directory, '../../first')
  const message = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '口令是海风42。' }] })
  await archive.remember([message, message, { id: 'system', role: 'system', content: [{ type: 'text', text: 'private system' }] }, { id: 'checkpoint', role: 'user', source: { kind: 'compact-checkpoint' }, content: [{ type: 'text', text: 'old summary' }] }])
  assert.equal(archive.entries.length, 1)
  assert.equal((await new ArchiveStore(directory, 'second').load()).entries.length, 0)
  const recalled = recallText(archive.entries, '口令', 512)
  assert.ok(Buffer.byteLength(recalled) <= 512)
  assert.match(recalled, /海风42/u)
})

test('tier allocation stays within configured output ceiling at a 1M window', () => {
  const budgets = tierBudgets(1048576, { newestFraction: 1 / 3, tierCount: 6, minTierTokens: 200, maxSummaryTokens: 1024 })
  assert.ok(budgets.reduce((a, b) => a + b, 0) <= 768)
  assert.ok(budgets[0] > budgets[1])
  assert.ok(budgets.every(n => n >= 200))
  assert.deepEqual(tierBudgets(32768, { newestFraction: 0.03, tierCount: 4, minTierTokens: 50, maxSummaryTokens: 1024 }), [410, 204, 101, 50])
})

test('oversized English records focus on rare query terms instead of common words', () => {
  const text = 'The log is ordinary. '.repeat(2000) + 'The access password is sapphire-991.'
  const result = recallText([{ id: 'large', role: 'tool', order: 0, text }], 'What is the access password?', 768)
  assert.match(result, /sapphire-991/u)
  assert.ok(JSON.parse(result).events[0].excerpt)
  assert.ok(Buffer.byteLength(result) <= 768)
})

test('archive write failure leaves the original surface intact and makes no model call', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'native-write-fail-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const blocked = join(directory, 'not-a-directory')
  await writeFile(blocked, 'occupied')
  let calls = 0
  const runtime = nativeRuntime(Engine, blocked, async function* () { calls++ })
  const original = runtime.append('不可丢失的原始记录。'.repeat(400))
  runtime.append('继续')
  await assert.rejects(runtime.engine.compactNow(runtime.agent, new AbortController().signal))
  assert.ok(runtime.session.deriveMessages().some(m => m.id === original.data.id))
  assert.equal(calls, 0)
})
