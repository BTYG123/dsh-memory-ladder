# Capacity stress protocol

Baseline runtime: reviewed release `23456b4` (v0.2.1). The exact original archive implementation is frozen in `bench/capacity-baseline/archive.js`; later capacity-guard changes do not overwrite baseline results.

The exploratory test uses three English archive scales (100, 1000, 5000 entries), plus an additional 5000-entry Chinese fixture. Background text is intentionally large and repetitive to exercise byte volume, full scans, long-record excerpts and cold reload. Questions use exact identifiers and a small number of canonical facts. This is not a random sample of real conversations or a preregistered generalization trial.

Build and resume run in different Node processes. Every recovered recall payload must match the original payload hash. API tests send only the bounded recall output to Flash/Pro; they do not send the whole archive or model-generated fixture answers. Full input, raw response, usage, failures and cost are saved. The 32MiB boundary test is reported separately from within-capacity accuracy.

See [results and compressed evidence](evidence/capacity-v1/RESULTS.md). Regenerate on a fresh run directory:

The follow-up [incremental index and long-task evaluation](LONG_TASKS.md) addresses the full-scan cost measured here; the original capacity results remain unchanged.

```sh
node bench/capacity.js --phase build
node bench/capacity.js --phase resume
# DEEPSEEK_API_KEY is read from the environment, never committed.
node bench/capacity.js --phase models --budget-file /path/to/authorized-budget.json
node bench/capacity-zh.js --budget-file /path/to/authorized-budget.json
node bench/capacity-guard.js
node bench/capacity-report.js
```

The shared $10 ledger includes earlier exploration and reviewed-release evaluation. Importing the reviewed evaluation deduplicated call IDs before adding its costs; budget was not reset. No API charges are incurred by build, resume, guard regression or report generation.

The guard patch intentionally fails compaction before an unarchivable raw span can be replaced. It does not automatically expand the configured disk cap, rotate archives, repair previously omitted records, or guarantee the task can continue once the remaining model window is exhausted.
