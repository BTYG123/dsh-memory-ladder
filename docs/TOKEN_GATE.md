# Token reduction and model-directed recall

The experimental `lib/recall-wire.js` representation preserves every selected source text, role, chronological order and excerpt range. Session-local event orders replace UUIDs in the prompt; full source IDs remain in the audit map. It does not remove evidence, change ranking or shorten the retrieval budget.

The experiment compares baseline JSON, compact JSON, model-directed retrieval and no retrieval. A model-directed call can either answer directly or request evidence; when it requests evidence, the second call and its full repeated input are charged. Skipping retrieval is evaluated against factual ground truth, including stale summaries that hide later corrections.

See the [static results and evidence](evidence/token-gate-v1/RESULTS.md) and the follow-up [full dynamic compact-format trajectory](evidence/long-compact-v1/RESULTS.md). The static experiment uses existing long-task snapshots plus new fixtures. Summary generation and trajectories are shared there, so only request-stage differences are tested. The follow-up independently regenerates summaries and subsequent state across 120 turns/model. Neither establishes universal quality preservation. Production defaults remain unchanged.

## Opt-in engine

The compact engine is available through the package subpath `dsh-memory-ladder/compact`. It has the same exported `Config` and `name` and inherits the original engine's services, archive, ranking and compaction behavior. For programmatic registration, use:

```js
import CompactMemoryLadderEngine from 'dsh-memory-ladder/compact'
// Register this engine in place of the default engine, using the same configuration.
```

For a host that supports package subpaths in profile plugin names, the corresponding engine row is `name: 'dsh-memory-ladder/compact'` instead of `name: 'dsh-memory-ladder'`. This profile-loader path has not been tested end to end here; the package import and real Harness context hook have been tested. Use one engine row; this is an alternative backend, not an additional plugin to run beside it. The default bundle patch keeps the original name. Revert the row name to restore the original format; stored archives are compatible in both directions. The compact wire module remains an internal helper and is included in the package.

Model-directed retrieval is deliberately not exposed as a production backend: the trial found cases where it skipped evidence and answered incorrectly.

Measured in the fixed static comparison, compact input tokens fell about 23.7% for both models without a paired regression. Model-directed retrieval reduced input further but introduced two Flash errors on stale-state questions. In the subsequent native 120-turn/model run, compact retained 240/240 correct with 22.7–24.1% fewer total input+output tokens, including summary calls. These are samples on the stated synthetic tasks, not a statistical guarantee of general non-regression.

The later [dense evidence and guarded retrieval study](DENSE_RECALL.md) found additional paired regressions and retrieval limits with many active facts. Its failures qualify the earlier simpler results. Guarded retrieval and the focused retriever remain research prototypes; neither changes this opt-in entry.

The fixed protocol is `bench/token-gate-protocol.json`. Prepare the earlier `long-native-v2` runs, then run:

```sh
# API key comes from DEEPSEEK_API_KEY; use the existing authorized cumulative account.
node bench/token-gate.js --budget-file /path/to/authorized-budget.json
node bench/token-gate-report.js --budget-file /path/to/authorized-budget.json
# Published evidence can be checked offline:
node bench/verify-token-gate.js
```

The trial registers source hashes before API calls, resumes by case/arm without dropping failures, rotates arm order, and uses the same model parameters in all arms. All decision and answer calls count toward the budget. No production retrieval policy should be selected solely because its average score or cost looks favorable; inspect paired regressions and then test a new dynamic trajectory independently.
