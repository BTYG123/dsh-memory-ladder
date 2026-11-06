import { test } from 'node:test'
import assert from 'node:assert/strict'
import { denseFixture } from '../bench/dense-fixture.js'
import { focusedRecall } from '../lib/focused-recall.js'
import { recallText } from '../lib/archive.js'

test('experimental scoped recall preserves original source ranges and respects budget and exclusions', () => {
  const fixture = denseFixture(7901)
  const sources = new Map(fixture.entries.map(e => [e.id, e]))
  for (const probe of fixture.probes) {
    const result = focusedRecall(fixture.entries, probe.query)
    assert.ok(Buffer.byteLength(result.text) <= 4096)
    for (const event of JSON.parse(result.text).events) {
      const source = sources.get(event.id)
      assert.equal(event.role, source.role)
      assert.equal(event.order, source.order)
      assert.equal(event.text, event.excerpt ? Array.from(source.text).slice(...event.offsetChars).join('') : source.text)
    }
  }
  const probe = fixture.probes.find(p => p.type === 'tail-anchor')
  assert.ok(focusedRecall(fixture.entries, probe.query).text.includes(probe.expected))
  const excluded = new Set(probe.required)
  const text = focusedRecall(fixture.entries, probe.query, 512, excluded).text
  assert.ok(Buffer.byteLength(text) <= 512)
  assert.ok(!text.includes(probe.expected))
  const generic = '未命名项目的制造者是什么？'
  assert.equal(focusedRecall(fixture.entries, generic).text, recallText(fixture.entries, generic))
})
