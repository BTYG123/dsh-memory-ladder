# Evaluation and release evidence

The earlier independent `memory-ladder-lab` prototype was exploratory. Its high scores are **not** evidence that the original dsh plugin itself improved. Long interactive tests also reversed the early preference for multi-hop retrieval: old questions and model-generated answers contaminated later retrieval. This release therefore implements simple source-weighted archival recall, not the prototype's experimental graph expansion.

## Native comparison

`bench/protocol.json` registers the baseline commit (`f5a1cdf`), fixture SHA-256, untouched holdout seeds, models, output limits, compaction schedule and release gate. `bench/baseline/` contains the original MIT implementation and pure helpers. Development seed 17 is separate from release holdouts 401–412.

Four arms use identical records and questions:

1. Original v0.1.0 engine.
2. Candidate with only the corrected output ceiling, archive recall disabled.
3. Candidate with the corrected ceiling and archive recall.
4. Full original history without compaction.

Each model has 12 holdout cases and eight questions per case. Cases cover Chinese and English synthetic campaign, release coordination and investigation records. They test early exact strings, historical/current ownership, resource arithmetic across records, revised requirements, unknown information and negative permissions. These are related synthetic templates, **not** real repository engineering tasks or independent open-ended campaigns.

The test creates real Harness `Session`, token-meter and projection services. It invokes the real `BasicCompactionEngine` transaction through `/compact`'s public `compactNow()` path. Recall is assembled through the real `systemPrompt.context` interface. Model transport uses a small metered Chat Completions bridge, **not the complete AgentLoop or a production provider adapter**. No tools, images, permissions UI, shell execution or production persistence adapter are exercised.

For comparability compaction is requested every 20 records. The settings intentionally stress a 32k context with a small newest-round fraction and a 1024-token summary ceiling. Skipped compactions, shrink failures, malformed model replies and API failures must remain in the report. The test does not establish quality or throughput for the default 1M automatic-compaction workload.

The baseline can exceed the nominal output ceiling because its implementation treats it as a lower bound. We do not silently clamp the baseline: its actual requested output limits and all resulting calls are recorded. The capped-only arm separates this behavior correction from archival recall.

## Scoring and cost

A manual compaction failure leaves the original surface intact. This benchmark aborts that case and counts the unasked questions as failed pipeline outcomes; the production automatic hook instead logs the error and can continue. Do not interpret that scoring rule as evidence of data loss.

- The summarizer and retriever never receive the gold answers or future questions.
- Probe answers are not appended back into the fixture, so probes cannot teach later probes.
- Primary score is strict normalized exact match. Report every failure and missing/invalid answer, including failed runs. Eight questions share one case; uncertainty estimates must resample **cases**, not pretend all questions are independent.
- Count every summary and answer call, including original-engine retries. A failed/unknown request retains its budget reservation.
- Costs conservatively use the published peak cache-miss prices, ignoring discounts. Raw token usage is retained. These figures can exceed actual account charges.
- Price source checked on 2026-11-06: [DeepSeek official model pricing](https://api-docs.deepseek.com/quick_start/pricing/). Exact per-million rates and model IDs are frozen in the protocol.
- A quality improvement and a cost improvement are separate claims. Recall may cost more than the original compressed context while costing less than full history.
- Keep raw requests, responses, budgets, checksums, fixture source and errors. Publish all synthetic holdout records; never publish credentials or private session archives.

## Reproduce

Requires Node 22+ and the pinned peer dependencies:

```sh
npm ci --ignore-scripts
npm test
# Configure DEEPSEEK_API_KEY in the environment; never store it in this repository.
# The budget ledger must already contain the authorized cumulative limit.
npm run bench:native -- --development --budget-file /path/to/budget.json
npm run bench:native -- --budget-file /path/to/budget.json
# Fresh reruns use distinct IDs to keep artifacts and per-attempt charges separate.
npm run bench:native -- --development --run-id another-run --budget-file /path/to/budget.json
node bench/replay.js
node bench/evidence.js
```

The budget cap is a spending limit, not an instruction to consume the full balance. Live benchmark output belongs under ignored `bench/runs/`; reviewed synthetic artifacts are packaged separately under `docs/evidence/`. Previous exploration spent approximately $0.9464; the authorized cumulative limit was explicitly increased to $10 on 2026-11-06 without resetting that spend.

## Promotion gate

Tests and package checks must pass. Per-model archive-recall accuracy must not fall below the original on the registered holdouts. Report all cost increases and residual errors. Passing this narrow gate supports a release candidate with measured tradeoffs, not a claim that it improves every long task. Native automatic-loop behavior, full open-ended campaigns, larger independent task sets and other providers remain follow-up validation.
