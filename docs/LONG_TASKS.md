# Incremental recall and long-task evaluation

The archive now keeps an in-memory lexical index per session. Only newly appended eligible entries are tokenized; candidate terms, weights, document frequency and floating-point accumulation order preserve the reference algorithm. Excluding currently visible messages also adjusts document frequency and document count. Editing, replacing or truncating old records rebuilds the cache. No extra API or vector database is required.

The JSONL archive and serialized recall schema are unchanged. Cold startup still reads the archive and builds an index on the first query. The cache uses additional memory. Query work includes validating the existing prefix, scanning excluded-document metadata and copying term frequencies; this is not constant-time retrieval or unlimited storage. The default disk cap remains 32 MiB.

See [measured results, failures and evidence](evidence/long-native-v2/RESULTS.md). The report distinguishes offline output equivalence, local timing and actual model scores. It also retains an invalid driver pilot rather than counting it as model evidence.

The follow-up [token reduction and model-directed recall](TOKEN_GATE.md) compares prompt formats and retrieval decisions, including an opt-in compact-format engine and a new dynamic trajectory.

To reproduce from fresh run directories, first create the English capacity fixture as described in [CAPACITY.md](CAPACITY.md). For the bilingual timing comparison also run the Chinese capacity fixture. Then:

```sh
node bench/index-speed.js
# Each phase must finish before starting the next command in a new process.
# DEEPSEEK_API_KEY stays in the environment.
node bench/long-native.js --phase 1 --budget-file /path/to/authorized-budget.json
node bench/long-native.js --phase 2 --budget-file /path/to/authorized-budget.json
node bench/long-native.js --phase 3 --budget-file /path/to/authorized-budget.json
node bench/long-report.js --budget-file /path/to/authorized-budget.json
```

Published evidence can be checked without API access or seed archives: `node bench/verify-long.js`. CI checks file hashes, registered implementation hash, raw-response scores, process restoration records and usage-based costs on Node 22 and 24. This audit verifies internal consistency; it is not an independent rerun of the remote models.

The 120-turn/model protocol uses real Harness Session, TokenMeter, compaction transactions and prompt-context services. A metered transport bridge calls the actual model; the full AgentLoop and production provider adapter are outside scope. The host supplies canonical world events and models answer factual questions. This is a bounded project/role-playing state test, not an autonomous campaign or narrative-quality assessment. There is no unassisted-model long-task control in this trial.

The two models share the existing cumulative budget with earlier experiments. Summary calls and invalid pilot calls remain charged. Runtime traces are generated under ignored `bench/runs/`; synthetic published evidence is compressed separately, and the private account file is never exported.
