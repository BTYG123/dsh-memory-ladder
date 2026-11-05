import { Context } from '@deepseek-ai/cordis'
import { Session } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection'
import { TokenMeter } from '@deepseek-ai/dsh-token-meter'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'

export function nativeRuntime(Engine, directory, stream, settings = {}) {
  const ctx = new Context()
  ctx.provide('llm', { stream })
  ctx.provide('sessions', { flush: async () => {} })
  new SessionProjectionRegistry(ctx)
  new TokenMeter(ctx)
  new SystemPrompt(ctx, { toolOrder: ['<unlisted-tools>'], includeHarnessIdentity: false })
  const engine = new Engine(ctx, { auto: false, archiveDirectory: directory, ...settings })
  const session = Session.create('native-test-' + Math.random().toString(16).slice(2))
  session.append('request/context', { provider: 'test', model: 'test-model', contextWindow: 32768 })
  const agent = { session, options: { provider: 'test', model: 'test-model' }, runMaintenance: task => task(new AbortController().signal) }
  return { ctx, engine, session, agent, append(text) {
    return session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }), { surfaceOp: 'append' })
  } }
}
