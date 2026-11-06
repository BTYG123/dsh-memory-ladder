import MemoryLadderEngine from '../index.js'
import { compactRecall } from './recall-wire.js'

export { Config, name } from '../index.js'

/** Opt-in transport format; storage, ranking, compaction and recall budget are inherited. */
export default class CompactMemoryLadderEngine extends MemoryLadderEngine {
  async recallFor(agent, query) {
    return compactRecall(await super.recallFor(agent, query)).text
  }
}
