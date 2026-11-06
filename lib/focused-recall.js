// Experimental identifier-linked retrieval. Deliberately not a production default,\n// not exported from package.json, and only exercised by bench/ and test/ files.
import { RecallIndex, recallText } from './archive.js'
const size = text => Buffer.byteLength(text)
const tokens = text => new Set((text.toLowerCase().match(/[a-z0-9_-]+|[\p{Script=Han}]+/gu) ?? []).flatMap(s =>
  /\p{Script=Han}/u.test(s) ? Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2)) : [s]))
const identifiers = text => [...text.matchAll(/\b[A-Za-z][A-Za-z0-9]*(?:[-_][A-Za-z0-9]+)+\b/gu)].map(m => m[0].toLowerCase())

export function focusedRecall(entries, query, maxBytes = 4096, excluded = new Set()) {
  const eligible = entries.filter(e => !excluded.has(e.id))
  const ids = new Set(identifiers(query))
  let linked = false
  // Only use explicit alias queries with a distinctive numeric alias anchor for this first prototype.
  if (!ids.size && /俗称|别名|alias/iu.test(query)) {
    const anchors = [...tokens(query)].filter(t => /^\d{4,}$/u.test(t))
    for (const e of eligible) {
      if (e.role !== 'user' || !anchors.some(a => tokens(e.text).has(a))) continue
      for (const id of identifiers(e.text)) ids.add(id)
    }
    linked = ids.size > 0
  }
  if (!ids.size || ids.size > 4) return { text: recallText(entries, query, maxBytes, excluded, new RecallIndex()), linked: false, scoped: false }
  const pool = eligible.filter(e => identifiers(e.text).some(id => ids.has(id)))
  if (!pool.length) return { text: recallText(entries, query, maxBytes, excluded, new RecallIndex()), linked: false, scoped: false }
  const expanded = query + ' ' + [...ids].join(' '), q = tokens(expanded)
  const df = new Map()
  for (const e of pool) for (const t of tokens(e.text)) df.set(t, (df.get(t) ?? 0) + 1)
  const offsets = new Map()
  const preview = pool.map(e => {
    if (size(e.text) <= 600) return e
    const chars = Array.from(e.text), starts = new Set([0, Math.max(0, chars.length - 160)])
    for (const t of q) {
      let at = -1
      while ((at = e.text.toLowerCase().indexOf(t, at + 1)) >= 0) {
        starts.add(Math.min(Math.max(0, chars.length - 160), Math.max(0, Array.from(e.text.slice(0, at)).length - 40)))
      }
    }
    let best = { score: -1, start: 0, text: '' }
    for (const start of starts) {
      const text = chars.slice(start, start + 160).join(''), present = tokens(text)
      const score = [...q].reduce((sum, t) => sum + (present.has(t) ? Math.log(1 + pool.length / (df.get(t) ?? 1)) : 0), 0)
      if (score > best.score || (score === best.score && start > best.start)) best = { score, start, text }
    }
    offsets.set(e.id, best.start)
    return { ...e, text: best.text, excerpt: true, offsetChars: [0, Array.from(best.text).length] }
  })
  const raw = recallText(preview, expanded, maxBytes, new Set(), new RecallIndex())
  if (!raw) return { text: '', linked, scoped: true }
  const data = JSON.parse(raw)
  for (const e of data.events) if (offsets.has(e.id)) e.offsetChars = e.offsetChars.map(n => n + offsets.get(e.id))
  // Larger absolute offsets may add digits. Omit a chronological tail entry if needed.
  while (size(JSON.stringify(data)) > maxBytes && data.events.length) data.events.pop()
  return { text: data.events.length ? JSON.stringify(data) : '', linked, scoped: true }
}
