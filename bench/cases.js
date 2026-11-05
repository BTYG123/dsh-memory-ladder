// Three synthetic task families. Gold answers are never sent to retrieval or summarization.
// Release holdouts are 401..412; smoke/development uses seed 17 and is reported separately.
export function makeCase(seed) {
  const family = ['campaign', 'coding', 'investigation'][seed % 3]
  const english = seed % 2 === 0
  const labels = family === 'campaign' ? ['moon-key', 'silver guild', 'mana'] : family === 'coding' ? ['release-token', 'backend team', 'retry budget'] : ['archive-key', 'review board', 'sample budget']
  const [item, group, resource] = labels
  const password = `K-${seed * 37 + 109}`
  const owner = ['Mira', 'Lena', 'Iris'][seed % 3]
  const updated = ['Asha', 'Nora', 'Tara'][seed % 3]
  const limit = 17 + seed % 7
  const unit = 2 + seed % 3
  const left = limit - 2 * unit
  const key = english ? `Record: ${item} unlock code is ${password}.` : `正式记录：${item}的解锁口令是${password}。`
  const facts = new Map([
    [1, key],
    [4, english ? `Rule: each action costs ${unit} units of ${resource}.` : `规则：每次操作消耗${unit}单位${resource}。`],
    [8, english ? `${item} was originally held by ${owner}.` : `${item}最初由${owner}持有。`],
    [13, english ? `${group} uses signal tide-${seed}.` : `${group}的联络暗号为tide-${seed}。`],
    [29, english ? `Correction: ${owner} transferred ${item} to ${updated}; ${updated} remains its current holder.` : `正式纠正：${owner}已把${item}转交给${updated}，现在由${updated}持有。`],
    [42, english ? `Resource audit: ${resource} started at ${limit}, then exactly two actions occurred. No other changes.` : `资源审计：${resource}起始值为${limit}，随后恰好执行两次操作，无其他消耗或恢复。`],
    [59, english ? `Commitment revised: wait for 7 bells before entering. The old 3-bell rule is void.` : '约定正式修订：等待7声钟响才可进入，旧的3声要求作废。'],
    [67, english ? 'The founder name was never disclosed. Do not invent it.' : '创始人姓名从未披露，不得编造。'],
    [74, english ? 'Copies may be published, but the original must not be published.' : '副本可以公开，原本不得公开。'],
  ])
  const records = Array.from({ length: 100 }, (_, i) => facts.get(i + 1) ?? (english
    ? `Background ${seed}-${i}: the team checks district ${i}, examines ordinary crates, discusses weather and meal prices, and moves on. No confirmed code, ownership, resource or policy changes occurred. `
    : `背景${seed}-${i}：队伍查看普通货箱，讨论天气与食物价格，继续穿过街巷。没有改变任何已确认的口令、持有人、资源数值、规则或约定。`))
  const probes = [
    { id: 'early-code', query: english ? `What is the exact unlock code for ${item}?` : `${item}的准确解锁口令是什么？`, expected: password },
    { id: 'current-owner', query: english ? `Who currently holds ${item}? Name only.` : `${item}当前由谁持有？只给姓名。`, expected: updated },
    { id: 'historical-owner', query: english ? `Who originally held ${item}? Name only.` : `${item}最初由谁持有？只给姓名。`, expected: owner },
    { id: 'signal', query: english ? `What signal does ${group} use?` : `${group}的联络暗号是什么？`, expected: `tide-${seed}` },
    { id: 'resource', query: english ? `How much ${resource} remains after the two actions? Number only.` : `两次操作之后${resource}剩余多少？只给数字。`, expected: String(left) },
    { id: 'revised-rule', query: english ? 'How many bells are now required before entering? Number only.' : '现在需要几声钟响才可进入？只给数字。', expected: '7' },
    { id: 'unknown', query: english ? 'What is the founder name? If not disclosed, answer UNKNOWN.' : '创始人姓名是什么？未披露就回答UNKNOWN。', expected: 'UNKNOWN' },
    { id: 'negative-rule', query: english ? 'May the original be published? Answer YES or NO.' : '原本可以公开吗？回答YES或NO。', expected: 'NO' },
  ]
  if (family !== 'campaign') {
    const coding = family === 'coding'
    records[58] = english
      ? (coding ? 'Release policy revised: deployment requires 7 passing checks. The old 3-check gate is void.' : 'Review protocol revised: publication needs 7 reviewer votes. The old 3-vote gate is void.')
      : (coding ? '发布策略正式修订：部署需要7项检查通过，旧的3项门槛作废。' : '审查协议正式修订：发布结论需要7票审查同意，旧的3票门槛作废。')
    probes.find(p => p.id === 'revised-rule').query = english
      ? (coding ? 'How many passing checks are now required for deployment? Number only.' : 'How many reviewer votes are now required for publication? Number only.')
      : (coding ? '部署现在需要通过几项检查？只给数字。' : '发布结论现在需要几票审查同意？只给数字。')
    records[66] = english
      ? (coding ? 'The responsible maintainer legal name was never disclosed.' : 'The witness real name was never disclosed.')
      : (coding ? '负责维护者的法定姓名从未披露。' : '证人的真实姓名从未披露。')
    probes.find(p => p.id === 'unknown').query = english
      ? (coding ? 'What is the responsible maintainer legal name? If undisclosed answer UNKNOWN.' : 'What is the witness real name? If undisclosed answer UNKNOWN.')
      : (coding ? '负责维护者的法定姓名是什么？未披露就回答UNKNOWN。' : '证人真实姓名是什么？未披露就回答UNKNOWN。')
    records[73] = english
      ? (coding ? 'Sanitized report copies may be published; the original production config must stay private.' : 'Redacted copies may be published; original witness statements must stay private.')
      : (coding ? '脱敏报告副本可以公开，原始生产配置不得公开。' : '脱敏副本可以公开，原始证人陈述不得公开。')
    probes.find(p => p.id === 'negative-rule').query = english
      ? (coding ? 'May the original production config be published? Answer YES or NO.' : 'May original witness statements be published? Answer YES or NO.')
      : (coding ? '原始生产配置可以公开吗？回答YES或NO。' : '原始证人陈述可以公开吗？回答YES或NO。')
  }
  return { seed, family, language: english ? 'en' : 'zh', records, probes }
}
export const normalize = value => String(value).normalize('NFKC').replace(/[\s。！!，,「」“”"']/gu, '').toLowerCase()
