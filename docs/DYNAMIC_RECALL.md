# Dynamic focused-recall evaluation

The static dense tests exposed missing evidence and motivated an identifier-linked retrieval prototype. This follow-up runs four real Harness Session trajectories: Flash/Pro × compact/focused, 90 turns each, on the same 29.63 MiB capacity background plus 1,440 interleaved dense-history records. Every ten turns compacts the actual surface; every thirty turns exits and restores in a new Node process. Each process hosts four isolated sessions.

See [results, all failures and evidence](evidence/dynamic-focused-v1/RESULTS.md). Model-written summaries evolve independently in each arm. Cross-project queries revisit older owners and credentials; balances explicitly distinguish consumption-before and already-settled-after amounts. Host events decide world truth, while model responses remain part of the next real context. This is not the complete AgentLoop, autonomous adjudication or a free-form campaign quality test.

The focused candidate improves aggregate factual answering here, but it still produces individual regressions, can misread newer evidence despite retrieving it, and performs full archive scans on each query. Its latency must be evaluated together with token and cost changes. It remains repository-only research; both packaged plugin entries retain their previous behavior.

A separate seed tests three numeric pairs under explicit before/after wording, with four context conditions and two models (48 answers). This clarity check validates the new unambiguous fixtures; the earlier ambiguous scores remain unchanged.

```sh
# Prepare capacity-v1 archives first. These phases must be separate Node processes.
node bench/dynamic-focused.js --phase 1 --budget-file /path/to/shared-budget.json
node bench/dynamic-focused.js --phase 2 --budget-file /path/to/shared-budget.json
node bench/dynamic-focused.js --phase 3 --budget-file /path/to/shared-budget.json
node bench/balance-clarity.js --budget-file /path/to/shared-budget.json
node bench/dynamic-report.js --budget-file /path/to/shared-budget.json
# Offline: no API key, private account or runtime archives required.
node bench/verify-dynamic.js
```

API keys come from `DEEPSEEK_API_KEY` and never enter evidence. Registered source and seed hashes prevent changing implementations mid-run. The shared $10 account includes all prior work and all summary calls, model replies and failed reservations. Model-independent audit checks source ranges, host truth replay, responses, process phases and usage-based charges; it is not an independent remote-model rerun. Seed background is reproducible with the capacity scripts and is not duplicated in published evidence.
