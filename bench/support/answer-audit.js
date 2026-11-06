import { normalize } from '../cases.js'
import { parseJSON } from './client.js'

// Secondary factual score accepts a bare exact answer. Never searches prose for gold text.
// The registered primary score continues to require the JSON answer field.
export function factualAudit(row) {
  const raw = row.calls.at(-1)?.raw
  if (typeof raw !== 'string') return { correct: false, formatError: true }
  try {
    const parsed = parseJSON(raw)
    const valid = parsed !== null && typeof parsed === 'object' && typeof parsed.answer === 'string'
    const answer = valid ? parsed.answer : (typeof parsed === 'number' || typeof parsed === 'string' ? String(parsed) : undefined)
    return { correct: answer !== undefined && normalize(answer) === normalize(row.expected), formatError: !valid }
  } catch {
    return { correct: normalize(raw) === normalize(row.expected), formatError: true }
  }
}
