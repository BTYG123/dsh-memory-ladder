/**
 * Dependency-free helpers for the memory ladder.
 *
 * These are the parts worth testing without a Harness runtime: tier trimming and
 * the budget-bounded span selection. `index.js` delegates to them so the same
 * code runs in production and in tests.
 */

/** Rough token price of one text, matching the meter's character heuristic. */
export function estimateText(text) {
  return Math.ceil(text.length / 4)
}

/**
 * Drop the deepest tiers until the ladder fits, keeping tier 0 and the archive
 * pointer. Deeper tiers are the least valuable, so they go first.
 *
 * @param {string} text ladder markdown
 * @param {number} totalBudget token budget of the whole ladder
 * @returns {string} trimmed ladder
 */
export function trimLadder(text, totalBudget) {
  const limit = totalBudget * 1.25
  if (estimateText(text) <= limit) return text
  const sections = text.split(/\n(?=## )/u)
  while (sections.length > 2 && estimateText(sections.join('\n')) > limit) {
    let dropIndex = -1
    for (let index = sections.length - 1; index >= 0; index -= 1) {
      const heading = /^## Tier (\d+)/u.exec(sections[index])
      if (heading === null || heading[1] === '0') continue
      dropIndex = index
      break
    }
    if (dropIndex === -1) break
    sections.splice(dropIndex, 1)
  }
  return sections.join('\n')
}

/**
 * Cap a span so the sleep request itself (which replays the span) still fits the
 * window. Returns the last index that stays inside `maxTokens`, never below
 * `firstIdx`.
 *
 * @param {readonly {tokens: number}[]} nodes priced surface nodes
 * @param {number} firstIdx first shadowable index
 * @param {number} endIdx last candidate index (inclusive)
 * @param {number} maxTokens span budget; non-positive means "no cap"
 * @returns {number} capped end index, or `firstIdx - 1` when nothing fits
 */
export function boundSpanEnd(nodes, firstIdx, endIdx, maxTokens) {
  if (!Number.isFinite(maxTokens) || maxTokens <= 0) return endIdx
  let accumulated = 0
  let limitIdx = firstIdx
  for (; limitIdx <= endIdx; limitIdx += 1) {
    accumulated += nodes[limitIdx].tokens
    if (accumulated > maxTokens) break
  }
  return Math.min(endIdx, limitIdx - 1)
}

/**
 * Pick the tier count and budgets: the newest tier is half the round cap, and
 * every deeper tier halves again until the floor is reached.
 *
 * @param {number} window context window in tokens
 * @param {{newestFraction: number, tierCount: number, minTierTokens: number}} options
 * @returns {number[]} budgets, newest first
 */
export function tierBudgets(window, options) {
  const budgets = []
  let budget = Math.max(1, Math.floor((window * options.newestFraction) / 2))
  for (let index = 0; index < options.tierCount && budget >= options.minTierTokens; index += 1) {
    budgets.push(budget)
    budget = Math.floor(budget / 2)
  }
  if (budgets.length === 0) budgets.push(Math.max(options.minTierTokens, budget))
  return budgets
}
