import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RecallIndex, recallText } from '../lib/archive.js'
test('indexed recall exactly matches reference across appends, exclusions, mutations, excerpts and truncation', () => {
  const entries = [], index = new RecallIndex()
  for (let i = 0; i < 80; i++) {
    entries.push({ id: `e${i}`, order: i, role: i % 9 === 0 ? 'assistant' : 'user', text: i % 7 === 0 ? '谁持有钥匙？' : `Vault-${i % 5} 初始持有人甲，password code-${i}。` + '背景文字😀 repeated words. '.repeat(i % 6 * 20) })
    for (const query of ['Vault-2 password', '钥匙持有人', '不存在的物品', 'repeated words']) for (const budget of [512, 1024, 4096]) {
      const excluded = new Set(i % 3 === 0 ? ['e1', 'e4', `e${i}`] : [])
      assert.equal(recallText(entries, query, budget, excluded, index), recallText(entries, query, budget, excluded))
    }
  }
  entries[1].text = 'Vault-2 corrected password: new-code'
  entries[2].role = 'assistant'; entries[3] = { ...entries[3], order: 999 }
  entries.splice(20)
  assert.equal(recallText(entries, 'Vault-2 password', 4096, new Set(), index), recallText(entries, 'Vault-2 password'))
})
