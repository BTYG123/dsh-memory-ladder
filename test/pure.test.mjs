import assert from 'node:assert/strict'
import test from 'node:test'

import { boundSpanEnd, estimateText, tierBudgets, trimLadder } from '../lib/pure.js'

const ladder = [
  '## Tier 0 — newest\n' + 'a'.repeat(2000),
  '## Tier 1 — depth 1\n' + 'b'.repeat(2000),
  '## Tier 2 — depth 2\n' + 'c'.repeat(2000),
  '## Tier 3 — depth 3\n' + 'd'.repeat(2000),
  '## Archive pointer\n[memory:session-x]',
].join('\n\n')

test('estimateText prices four characters as one token', () => {
  assert.equal(estimateText('a'.repeat(400)), 100)
  assert.equal(estimateText(''), 0)
})

test('trimLadder leaves a ladder inside budget untouched', () => {
  assert.equal(trimLadder(ladder, 10_000), ladder)
})

test('trimLadder drops the deepest tiers first and keeps tier 0 plus the pointer', () => {
  const trimmed = trimLadder(ladder, 900)
  const tiers = [...trimmed.matchAll(/## Tier (\d+)/gu)].map((match) => match[1])
  assert.deepEqual(tiers, ['0', '1'])
  assert.match(trimmed, /Archive pointer/)
  assert.ok(trimmed.length < ladder.length)
})

test('trimLadder never removes tier 0 even when it alone exceeds the budget', () => {
  const tiny = [
    '## Tier 0 — newest\n' + 'a'.repeat(4000),
    '## Tier 1 — depth 1\n' + 'b'.repeat(4000),
    '## Archive pointer\n[memory:session-x]',
  ].join('\n\n')
  const trimmed = trimLadder(tiny, 100)
  assert.match(trimmed, /## Tier 0/)
  assert.doesNotMatch(trimmed, /## Tier 1/)
})

test('boundSpanEnd caps the span at the token budget', () => {
  const nodes = Array.from({ length: 10 }, () => ({ tokens: 1000 }))
  assert.equal(boundSpanEnd(nodes, 1, 9, 2500), 2)
  assert.equal(boundSpanEnd(nodes, 1, 9), 9)
})

test('boundSpanEnd reports an empty span when nothing fits', () => {
  const nodes = Array.from({ length: 4 }, () => ({ tokens: 5000 }))
  assert.equal(boundSpanEnd(nodes, 1, 3, 100), 0)
})

test('tierBudgets halves each tier and stops at the floor', () => {
  const budgets = tierBudgets(1_048_576, { newestFraction: 1 / 3, tierCount: 6, minTierTokens: 200 })
  assert.deepEqual(budgets, [174762, 87381, 43690, 21845, 10922, 5461])
  const capped = tierBudgets(30_000, { newestFraction: 0.01, tierCount: 6, minTierTokens: 100 })
  assert.deepEqual(capped, [150])
})
