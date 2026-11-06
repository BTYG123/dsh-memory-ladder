import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compactRecall } from '../lib/recall-wire.js'

test('experimental compact transport preserves evidence, chronology, roles and excerpt ranges', () => {
  const events = [
    { id: 'source-original-uuid', order: 17, role: 'user', text: '旧状态不可公开。😀\n"引文"' },
    { id: 'source-guess-uuid', order: 19, role: 'assistant', text: '猜测可以公开', excerpt: true, offsetChars: [30, 40] },
  ]
  const result = compactRecall(JSON.stringify({ kind: 'memory-ladder-recall', events }))
  const data = JSON.parse(result.text)
  assert.deepEqual(data.events, [[17, 'user', events[0].text], [19, 'assistant', events[1].text, true, [30, 40]]])
  assert.deepEqual(result.sourceIds, { 17: events[0].id, 19: events[1].id })
  assert.throws(() => compactRecall(JSON.stringify({ kind: 'memory-ladder-recall', events: [events[0], events[0]] })))
  assert.deepEqual(compactRecall(''), { text: '', sourceIds: {} })
})
