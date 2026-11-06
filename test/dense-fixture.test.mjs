import { test } from 'node:test'
import assert from 'node:assert/strict'
import { denseFixture } from '../bench/dense-fixture.js'
import { recallText, RecallIndex } from '../lib/archive.js'
import { compactRecall } from '../lib/recall-wire.js'

test('dense benchmark keeps complete ground-truth source references and public freshness labels', () => {
  const fixture = denseFixture(2027)
  assert.equal(fixture.entries.length, 1440)
  assert.equal(fixture.probes.length, 16)
  const ids = new Set(fixture.entries.map(e => e.id))
  const index = new RecallIndex()
  for (const p of fixture.probes) {
    assert.ok(p.required.every(id => ids.has(id)))
    assert.equal(p.staleVisible, p.visible.includes('后续归档尚未核对'))
    const text = recallText(fixture.entries, p.query, 4096, new Set(), index)
    assert.ok(Buffer.byteLength(text) <= 4096)
    const wire = JSON.parse(compactRecall(text).text)
    const original = JSON.parse(text)
    assert.deepEqual(wire.events.map(e => e[2]), original.events.map(e => e.text))
  }
  const targets = fixture.probes.filter(p => p.type === 'fuel' || p.type === 'joint')
  assert.equal(targets[0].expected, String(287 - 3 * 6 + 13))
  assert.ok(targets[1].required.length === 3)
})
