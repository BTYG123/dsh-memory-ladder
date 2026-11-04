/**
 * memory-ladder — tiered "sleep" compaction backend for DeepSeek Harness.
 *
 * Policy (all fractions of the routed model's context window `T`):
 *   newest round cap = T/3, previous = T/6, one sleep older = T/12, … (each halves).
 * When the newest round — everything since the last checkpoint — reaches its cap,
 * the agent "sleeps": one model call rewrites the whole shadowed history into a
 * memory ladder that keeps that 2:1 geometric ratio, the raw history is replaced
 * by that single checkpoint message, and the turn continues from it.
 *
 * The transaction (bracket, lock, shrink validation, surface replacement) is
 * inherited from BasicCompactionEngine; only the policy and the summarizer
 * differ, which the base class documents as its sole subclass hook.
 */
import z from '@deepseek-ai/schemastery'
import { BasicCompactionEngine } from '@deepseek-ai/dsh-compaction-basic'
import { toolPairingBalancedAfter, toolPairingBalancedBefore } from '@deepseek-ai/dsh-compaction'
import { BlockAssembler, CONTEXT_WINDOW_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm'
import { boundSpanEnd, estimateText, tierBudgets, trimLadder } from './lib/pure.js'

export const name = 'memory-ladder'

export const Config = z.object({
  /** Newest-round budget as a fraction of the context window; sleep at T/3 by default. */
  newestFraction: z.number().min(0.0001).max(0.95).default(1 / 3),
  /** How many ladder tiers the checkpoint describes. */
  tierCount: z.natural().min(1).max(12).default(6),
  /** Deeper tiers below this budget collapse into the archive pointer. */
  minTierTokens: z.natural().min(50).default(200),
  /** Output cap of the sleep request. */
  maxSummaryTokens: z.natural().min(256).default(8192),
  /** Manual /compact is skipped below this much surface history. */
  minCompactionTokens: z.natural().min(0).default(512),
  /** Optional summarizer route; empty uses the latest routed request. */
  summarizationProvider: z.string().default(''),
  summarizationModel: z.string().default(''),
  /** Master switch for automatic sleep; manual `/compact` keeps working. */
  auto: z.boolean().default(true),
})

export default class MemoryLadderEngine extends BasicCompactionEngine {
  static Config = Config

  static inject = ['llm', 'tokenMeter', 'sessions']

  constructor(ctx, config = {}) {
    const settings = config ?? {}
    // Two backends would register the same `compaction` service; refuse loudly
    // instead of letting registration order decide which policy runs.
    if (ctx.get('compaction') !== undefined) {
      throw new Error(
        'memory-ladder: another compaction backend is already mounted on this context; ' +
          'disable the `compaction-basic` row (or whichever backend provides ctx.compaction) before mounting memory-ladder',
      )
    }
    super(ctx, {
      auto: false,
      maxTokens: settings.maxSummaryTokens ?? 8192,
      summarizationProvider: settings.summarizationProvider ?? '',
      summarizationModel: settings.summarizationModel ?? '',
    })
    /** Overflow recoveries consumed by one agent since the last idle transition. */
    this.overflowRetries = new WeakMap()
    this.ladder = {
      newestFraction: settings.newestFraction ?? 1 / 3,
      tierCount: settings.tierCount ?? 6,
      minTierTokens: settings.minTierTokens ?? 200,
      maxSummaryTokens: settings.maxSummaryTokens ?? 8192,
      minCompactionTokens: settings.minCompactionTokens ?? 512,
      summarizationProvider: settings.summarizationProvider ?? '',
      summarizationModel: settings.summarizationModel ?? '',
      auto: settings.auto ?? true,
    }
    if (this.ladder.auto) this._registerSleep()
  }

  /** Register the between-step sleep check and one overflow recovery attempt. */
  _registerSleep() {
    const { ctx } = this
    ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
      if (!signal.aborted) {
        try {
          const result = await this.compactIfNeeded(agent, 'pressure', signal)
          if (result !== null) {
            ctx.logger.info(
              `memory-ladder: slept — shadowed ${result.shadowedSeqs.length} nodes ` +
                `(~${result.shadowedTokenCount} tokens) into one ladder checkpoint`,
            )
          }
        } catch (error) {
          if (!signal.aborted) {
            const message = error instanceof Error ? error.message : String(error)
            ctx.logger.warn(`memory-ladder: sleep failed: ${message}; continuing the turn`)
            if (process.env.MEMORY_LADDER_DEBUG === '1') process.stderr.write(`memory-ladder: sleep failed: ${message}\n`)
          }
        }
      }
      return next()
    })

    ctx.on('agent/request-error', async ({ agent, failure, signal }, next) => {
      if (failure.code !== CONTEXT_WINDOW_EXCEEDED_CODE || signal.aborted) return next()
      // One recovery attempt per overflow: a ladder that cannot shrink the request
      // (an oversized system prompt, say) must surface the original error instead
      // of retrying forever.
      if ((this.overflowRetries.get(agent) ?? 0) >= 1) return next()
      const generation = agent.session.surface.replaceGeneration
      try {
        await this.compactIfNeeded(agent, 'context-overflow', signal)
      } catch {
        return next()
      }
      if (agent.session.surface.replaceGeneration <= generation) return next()
      this.overflowRetries.set(agent, (this.overflowRetries.get(agent) ?? 0) + 1)
      return { kind: 'retry' }
    })

    ctx.on('agent/status', ({ agent, status }) => {
      if (status === 'idle') this.overflowRetries.delete(agent)
    })
  }

  /**
   * Sleep when the newest round reaches its tier cap, or when the provider
   * confirms the request no longer fits.
   */
  async compactIfNeeded(agent, trigger, signal) {
    const session = agent.session
    const context = session.requestContext()
    const window = context?.contextWindow
    const debug = process.env.MEMORY_LADDER_DEBUG === '1'
    if (debug) process.stderr.write(`memory-ladder[debug]: requestContext=${JSON.stringify(context)}\n`)
    if (typeof window !== 'number' || !(window > 0)) return null

    const cap = Math.floor(window * this.ladder.newestFraction)
    const forced = trigger === 'context-overflow'
    const probe = this._probe(session, window, cap)
    if (probe === null) return null
    if (debug) {
      process.stderr.write(
        `memory-ladder[debug]: nodes=${probe.nodes.length} roundStart=${probe.roundStart} ` +
          `roundTokens=${probe.roundTokens} cap=${cap} window=${window} total=${probe.total}\n`,
      )
    }

    // Deterministic, model-free relief first: the shipped pruner only runs when a
    // compaction backend calls it, and disabling compaction-basic would otherwise
    // leave oversized tool results untouched.
    let current = probe
    const pruner = this.ctx.get('toolResultPruner')
    if (pruner !== undefined) {
      try {
        pruner.pruneSession(session)
        current = this._probe(session, window, cap) ?? probe
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.ctx.logger.warn(`memory-ladder: tool-result pruning failed: ${message}`)
      }
      if (debug) {
        process.stderr.write(
          `memory-ladder[debug]: after prune roundTokens=${current.roundTokens} total=${current.total}\n`,
        )
      }
    }
    if (!forced && current.roundTokens < cap) return null

    const range = this._selectRange(session, current.nodes, current.firstIdx, Math.floor(window * 0.6))
    if (range === null) return null

    // A round dominated by one indivisible trailing node cannot be repaired by a
    // checkpoint: the ladder's own framing costs more than the span it replaces.
    // Skipping here avoids a failing summarization call on every single step.
    const shadowed = this._spanTokens(current.nodes, range)
    const floor = Math.max(this.ladder.minCompactionTokens, 400)
    if (shadowed < floor) {
      if (debug) {
        process.stderr.write(`memory-ladder[debug]: skip — compactable span ${shadowed} < floor ${floor}\n`)
      }
      return null
    }

    this.ctx.logger.info(
      `memory-ladder: sleeping (${trigger}) — newest round ${current.roundTokens} tokens vs cap ${cap} ` +
        `of window ${window}; shadowing ${shadowed} tokens (seqs ${range.start}..${range.end})`,
    )
    return this.compactRegion(range.start, range.end, agent, signal)
  }

  /** Priced size of one selected span. */
  _spanTokens(nodes, range) {
    let total = 0
    for (let index = range.startIdx; index <= range.endIdx; index += 1) total += nodes[index].tokens
    return total
  }

  /** Price the current surface and locate the live round inside it. */
  _probe(session, window, cap) {
    const measurement = this.ctx.tokenMeter.measure(session)
    const nodes = measurement.nodes
    if (nodes.length === 0) return null
    const firstIdx = this._firstPayloadIndex(session, nodes)
    const roundStart = this._currentRoundStart(session, nodes, firstIdx)
    let roundTokens = 0
    for (let index = roundStart; index < nodes.length; index += 1) roundTokens += nodes[index].tokens
    return { nodes, firstIdx, roundStart, roundTokens, total: measurement.totalTokens, cap }
  }

  /** Index of the first node that may be shadowed: a system head at node 0 never is. */
  _firstPayloadIndex(session, nodes) {
    const head = session.eventAt(nodes[0].seq)
    return head !== undefined && head.type === 'system/message' ? 1 : 0
  }

  /** Index one past the newest checkpoint node; everything after it is the live round. */
  _currentRoundStart(session, nodes, firstIdx) {
    for (let index = nodes.length - 1; index >= firstIdx; index -= 1) {
      const event = session.eventAt(nodes[index].seq)
      if (event === undefined || event.type !== 'user/message') continue
      const source = event.data?.source
      if (source !== undefined && source.kind === 'compact-checkpoint') return index + 1
    }
    return firstIdx
  }

  /**
   * Span to shadow: starts at the first non-system node and ends on a
   * tool-pairing-balanced cut, keeping the newest node. `maxShadowTokens` bounds
   * the span so the sleep request itself — which replays the span — always fits
   * the window; when the history is larger than that, the oldest part is slept
   * first and a later sleep takes the rest.
   */
  _selectRange(session, nodes, firstIdx, maxShadowTokens) {
    let keepFromIdx = nodes.length - 1
    if (keepFromIdx <= firstIdx) return null
    while (keepFromIdx > firstIdx) {
      if (toolPairingBalancedBefore(session, nodes[keepFromIdx].seq)) break
      keepFromIdx -= 1
    }
    if (keepFromIdx <= firstIdx) return null

    let endIdx = boundSpanEnd(nodes, firstIdx, keepFromIdx - 1, maxShadowTokens)
    if (Number.isFinite(maxShadowTokens) && maxShadowTokens > 0) {
      // Keep the cut balanced after the cap so a tool pair is never split.
      while (endIdx > firstIdx && !toolPairingBalancedAfter(session, nodes[endIdx].seq)) endIdx -= 1
    }
    if (endIdx < firstIdx) return null
    return { start: nodes[firstIdx].seq, end: nodes[endIdx].seq, startIdx: firstIdx, endIdx }
  }

  /** Tier budgets: T/6, T/12, T/24 … (the newest tier is half the round cap). */
  _tierBudgets(window) {
    return tierBudgets(window, this.ladder)
  }

  /** Summarizer hook: one model call that rewrites the shadowed span as a ladder. */
  async summarize(input, agent, signal) {
    const window = agent.session.requestContext()?.contextWindow ?? 0
    const budgets = this._tierBudgets(window)
    const total = budgets.reduce((sum, value) => sum + value, 0)

    const target = this._resolveTarget(agent)
    if (target === undefined) {
      throw new Error(
        'memory-ladder: no provider/model available for the sleep request: route one request or set summarizationProvider/summarizationModel',
      )
    }

    const maxTokens = Math.min(16384, Math.max(this.ladder.maxSummaryTokens, total + 2048))
    let result
    let text = ''
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const instruction = this._instruction(total, budgets, agent.session.id, attempt > 0)
      result = await this._call(target, input, instruction, agent, maxTokens, signal)
      text = result.text
      if (text.trim().length === 0) {
        throw new Error(
          `memory-ladder: the sleep request produced no text (finish=${result.finish}, blocks=${result.blocks})`,
        )
      }
      if (estimateText(text) <= total * 1.25) break
      if (attempt === 1) break
    }

    text = this._trim(text, total)
    text = this._dropEmptyTiers(text)
    if (text.trim().length === 0) throw new Error('memory-ladder: the sleep request produced no text')

    return {
      summary: [{ type: 'text', text }],
      rawOutput: [{ type: 'text', text }],
      llmStreamCall: true,
      provider: target.provider,
      model: target.model,
      maxTokens,
      ...(result?.usage === undefined ? {} : { usage: result.usage }),
    }
  }

  /** Route for the sleep request: configured pair, else the last routed request. */
  _resolveTarget(agent) {
    const configured = this.ladder
    if (configured.summarizationProvider.length > 0 && configured.summarizationModel.length > 0) {
      return { provider: configured.summarizationProvider, model: configured.summarizationModel }
    }
    const latest = agent.session.requestHeader()?.config
    if (latest !== undefined && typeof latest.provider === 'string' && latest.provider.length > 0) {
      return { provider: latest.provider, model: latest.model }
    }
    const options = agent.options
    if (
      options?.provider !== undefined &&
      options.provider.length > 0 &&
      options.model !== undefined &&
      options.model.length > 0
    ) {
      return { provider: options.provider, model: options.model }
    }
    return undefined
  }

  /** One sleep request over the replayed prefix, mirroring the base summarizer envelope. */
  async _call(target, input, instruction, agent, maxTokens, signal) {
    const assembler = new BlockAssembler()
    const options = {
      provider: target.provider,
      model: target.model,
      messages: [...input.messages, { role: 'user', content: [{ type: 'text', text: instruction }] }],
      toolHistory: agent.session.toolHistory(),
      ...(input.tools === undefined ? {} : { tools: [...input.tools] }),
      maxTokens,
      sessionId: agent.session.id,
      purpose: 'compaction',
      ...(signal === undefined ? {} : { signal }),
    }
    for await (const chunk of this.ctx.llm.stream(options)) assembler.push(chunk)
    const finish = assembler.finish
    if (finish !== undefined && finish.kind === 'error') {
      throw new Error(`memory-ladder: sleep request failed: ${finish.failure?.message ?? 'unknown provider error'}`)
    }
    const blocks = assembler.blocks()
    const text = blocks
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim()
    return {
      text,
      usage: assembler.usage,
      finish: finish === undefined ? 'none' : finish.kind,
      blocks: blocks.map((block) => block.type).join(','),
    }
  }

  /** The sleep directive: shift existing tiers down, condense the raw round into tier 0. */
  _instruction(total, budgets, sessionId, retry) {
    const headings = budgets.map(
      (budget, index) => `## Tier ${index} — ${index === 0 ? 'the newest round, condensed' : `depth ${index}`}`,
    )
    const budgetLine = budgets.map((budget, index) => `Tier ${index} ≤ ${budget}`).join(', ')
    const lines = [
      'You are the sleep engine of a tiered memory. Everything above this message is about to be deleted from the context; only the ladder you write survives. Another model continues the work from it.',
      '',
      'Rewrite the conversation above as one memory ladder whose tiers halve in size, newest first.',
      '',
      'Shift rule: if the conversation above already contains a ladder (headings like "## Tier 0 —"), it is older memory. Push every existing tier down one level: its Tier 0 becomes the new Tier 1, its Tier 1 becomes the new Tier 2, and so on. The deepest tier is dropped into the archive pointer. Only the newest, still-raw stretch of the conversation becomes the new Tier 0.',
      '',
      'Output EXACTLY these headings, in this order, with nothing before the first one:',
      ...headings,
      '## Archive pointer',
      '',
      'Rules:',
      `- Hard budgets in tokens: ${budgetLine}. The whole answer must stay under ${total} tokens.`,
      '- Never merge two tiers, never reorder them, never drop a heading; write "无" / "(none)" under an empty tier.',
      '- Tier 0 carries the operational detail of the newest round: what was asked, what changed or was found, exact paths, commands, identifiers, numbers, error strings, and open threads.',
      '- Each deeper tier keeps only what still matters from that age: decisions, constraints, user corrections, current state. Drop superseded detail.',
      '- Never repeat one fact at two tiers: if it appears in a deeper tier, delete it from the shallower one.',
      `- The archive pointer is exactly one Markdown link, copied verbatim, plus at most one clause naming what lives there: [memory:${sessionId}]`,
      '- Write the body in the language the conversation uses. Keep the English heading text unchanged. Terse bullets, no prose padding, no code fences, no tool calls, no preamble.',
      retry ? '- The previous attempt broke the budget. Compress harder: keep every tier strictly under its limit.' : '',
    ].filter((line) => line.length > 0)
    return lines.join('\n')
  }

  /**
   * Remove tiers the model left empty. The structure is a contract, but an empty
   * tier still costs a heading and a line, and on a short session that fixed
   * overhead can exceed the whole shadowed span — which the transaction rejects
   * because a checkpoint must be smaller than what it replaces.
   */
  _dropEmptyTiers(text) {
    const sections = text.split(/\n(?=## )/u)
    const kept = sections.filter((section) => {
      const heading = /^## Tier (\d+)/u.exec(section)
      if (heading === null || heading[1] === '0') return true
      const body = section
        .split('\n')
        .slice(1)
        .join(' ')
        .replace(/[。.，,\s]/gu, '')
      return body.length > 0 && !/^(无|none|\(none\)|—|-|暂无)$/iu.test(body)
    })
    return kept.join('\n')
  }

  /**
   * Manual `/compact` is a no-op when the selected span is too small to shrink:
   * the checkpoint preamble and headings are a fixed cost, so a short session can
   * only fail the shrink check.
   */
  async compactNow(agent, signal, sourceCommandId) {
    const probe = this._probe(agent.session, 0, 0)
    if (probe === null) return null
    const range = this._selectRange(agent.session, probe.nodes, probe.firstIdx)
    if (range === null) return null
    const shadowed = this._spanTokens(probe.nodes, range)
    const floor = Math.max(this.ladder.minCompactionTokens, 400)
    if (shadowed < floor) {
      this.ctx.logger.info(
        `memory-ladder: /compact skipped — compactable span ${shadowed} tokens is below ${floor}`,
      )
      return null
    }
    return super.compactNow(agent, signal, sourceCommandId)
  }

  /**
   * Drop the deepest tiers until the ladder fits; `trimLadder` owns the rule and
   * is covered by `test/pure.test.mjs`.
   */
  _trim(text, totalBudget) {
    return trimLadder(text, totalBudget)
  }
}
