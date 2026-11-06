import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { renderContextSections } from '@deepseek-ai/dsh-system-prompt'
import Engine from '../lib/compact-engine.js'
import { recallText } from '../lib/archive.js'
import { compactRecall } from '../lib/recall-wire.js'
import { nativeRuntime } from './native-runtime.mjs'

test('opt-in compact engine publishes preserved source text through the real Harness context hook', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ladder-compact-'))
  const runtime = nativeRuntime(Engine, directory, async function* () { throw Error('Recall must not call model') })
  try {
    const original = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '项目松岭原始口令是霜-831，不得公开原始卷宗。' }] })
    const store = runtime.engine._archive(runtime.agent)
    await store.remember([original])
    const query = '项目松岭原始口令是什么？'
    const message = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: query }] })
    await runtime.ctx.waterfall('agent/pre-step', { agent: runtime.agent, messages: [message], signal: new AbortController().signal }, async () => undefined)
    const assembly = await runtime.ctx.systemPrompt.assemble({ agent: runtime.agent })
    const text = renderContextSections(assembly).find(s => s.name === 'memory-ladder-recall').text
    const expected = compactRecall(recallText(store.entries, query))
    assert.equal(text, expected.text)
    assert.equal(JSON.parse(text).events[0][2], original.content[0].text)
    assert.equal(store.entries[0].id, original.id)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
