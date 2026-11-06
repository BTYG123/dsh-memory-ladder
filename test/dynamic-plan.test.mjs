import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialGame, dynamicStep } from '../bench/dynamic-plan.js'

test('dynamic host truth explicitly distinguishes before/after balances and survives serialized restoration', () => {
  let game = initialGame(20399), before = 0, after = 0
  for (let i = 0; i < 90; i++) {
    const prior = structuredClone(game), step = dynamicStep(i, game, 20399)
    assert.deepEqual(game, prior)
    if (step.type === 'balance-before') {
      before++; assert.ok(step.update.includes('消耗前')); assert.ok(step.update.includes(String(game[step.target].balance)))
      assert.equal(Number(step.expected), game[step.target].balance - (4 + Math.floor(i / 10) % 4))
    }
    if (step.type === 'balance-after') {
      after++; assert.ok(step.update.includes('已经计入')); assert.ok(step.update.includes(step.expected))
    }
    game = JSON.parse(JSON.stringify(step.game))
  }
  assert.equal(before, 5); assert.equal(after, 4)
})
