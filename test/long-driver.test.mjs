import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { renderContextSections } from '@deepseek-ai/dsh-system-prompt'
import Engine from '../index.js'
import { recallText } from '../lib/archive.js'
import { nativeRuntime } from './native-runtime.mjs'
test('long-task driver emits real step boundaries and compares raw recall sections rather than wrapped snapshots', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'long-driver-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const r = nativeRuntime(Engine, directory, async function* () {
    yield { type: 'text-delta', index: 0, text: '## Tier 0 — newest\n继续。\n## Archive pointer\n[memory:test]' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }, { minTierTokens: 50, tierCount: 4, maxSummaryTokens: 1024, newestFraction: 0.03 })
  r.append('星渡口令为星钥-123。' + '早期背景记录。'.repeat(400))
  r.session.append('turn/start', { turn: 1 }); r.session.append('step/start', { turn: 1, step: 0 })
  r.append('当前状态是什么？')
  r.session.append('assistant/message', { turn: 1, step: 0, message: createAssistantMessage({ source: { provider: 'test', model: 'test-model' }, content: [{ type: 'text', text: '继续' }] }), stream: [] }, { surfaceOp: 'append' })
  r.session.append('step/end', { turn: 1, step: 0 }); r.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  r.append('最新保留记录')
  assert.ok(await r.engine.compactNow(r.agent, new AbortController().signal))
  await new Promise(resolve => setImmediate(resolve))
  const query = '星渡口令是什么？'
  await r.ctx.waterfall('agent/pre-step', { agent: r.agent, signal: new AbortController().signal, messages: [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: query }] })] }, async () => undefined)
  const assembly = await r.ctx.systemPrompt.assemble({ agent: r.agent })
  const section = renderContextSections(assembly).find(s => s.name === 'memory-ladder-recall')?.text ?? ''
  const archive = await r.engine._archive(r.agent).load()
  assert.equal(section, recallText(archive.entries, query, 4096, new Set(r.session.deriveMessages().map(m => m.id))))
})
