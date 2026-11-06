import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Engine from '../index.js'
import { ArchiveStore } from '../lib/archive.js'
import { nativeRuntime } from './native-runtime.mjs'

test('capacity rejection prevents real Harness compaction from replacing unarchived original messages', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'archive-capacity-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  let calls = 0
  const runtime = nativeRuntime(Engine, directory, async function* () { calls++ }, { archiveMaxBytes: 65536 })
  const a = runtime.append('重要事实甲'.repeat(2500))
  const b = runtime.append('重要事实乙'.repeat(2500))
  runtime.append('最后一条保留消息')
  await assert.rejects(runtime.engine.compactNow(runtime.agent, new AbortController().signal))
  const visible = new Set(runtime.session.deriveMessages().map(m => m.id))
  assert.ok(visible.has(a.data.id)); assert.ok(visible.has(b.data.id))
  assert.equal(runtime.engine._archive(runtime.agent).entries.length, 1)
  assert.equal(calls, 0)
})

test('capacity state is recomputed after reload and over-limit writes reject explicitly', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'archive-full-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new ArchiveStore(directory, 'full', 256)
  const base = { id: 'initial', role: 'user', order: 0, text: '' }
  const overhead = Buffer.byteLength(JSON.stringify(base) + '\n')
  const entry = { ...base, text: 'a'.repeat(256 - overhead) }
  await writeFile(store.path, JSON.stringify(entry) + '\n')
  await store.load()
  assert.equal(store.full, true)
  await assert.rejects(store.remember([{ id: 'new', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'new correction' }] }]), e => e.code === 'ARCHIVE_CAPACITY')
  assert.equal(store.entries.length, 1)
  assert.equal(store.sizeBytes, 256)
})
