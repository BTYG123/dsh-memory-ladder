# Dense evidence, guarded retrieval and a focused prototype

The earlier large archive contained mostly repeated background and few active facts. This follow-up tests 120 interleaved entities per seed, 12 records per entity, including multiple owners, passwords and rule revisions, numeric bookkeeping, original/current questions, alias links, forged instructions and long-record tail anchors. Four seeds and four arms give 512 scored requests across Flash and Pro.

See [dense-gate-v1 results and complete evidence](evidence/dense-gate-v1/RESULTS.md). The primary score requires the JSON answer field; the secondary score additionally accepts a complete bare exact answer. Neither is an unrestricted semantic judge. Transport failures, format failures and all costs remain recorded.

The guarded policy retrieves immediately if the visible cache explicitly says later archives are unchecked. Otherwise it lets the model choose but requires retrieval before UNKNOWN or after an invalid decision. It does not inspect gold answers or required source IDs. It recovered much of the completely autonomous policy's lost accuracy, but did not establish non-regression:

| Normalized exact answer score | Baseline | Autonomous | Guarded |
|---|---:|---:|---:|
| Flash | 44/64 | 31/64 | 43/64 |
| Pro | 44/64 | 30/64 | 43/64 |

More importantly, the unchanged lexical retriever sometimes omitted later revisions, failed to follow an alias to its entity's later records, or returned a long-record source ID without its tail fact. Calling that same retriever more often cannot supply missing evidence. Compact serialization also has paired regressions under the recorded exact scoring, so the earlier smaller trial is not evidence of universal non-regression.

## Experimental focused retrieval

`lib/focused-recall.js` is a repository-only prototype, excluded from package files and exports. It scopes retrieval to explicit identifier links, supports a limited numeric-alias lookup from original user records, and chooses weighted query-term windows inside long records. It retains source IDs, roles, chronology and exact original character ranges. For unsupported queries it falls back to original recall. It uses no model calls or gold answers.

The candidate was designed after observing dense-v1 weaknesses and tested on two new seeds from the same template, not an independently authored distribution. See [focused-gate-v1 results and complete evidence](evidence/focused-gate-v1/RESULTS.md). Required fact coverage improved from 24/32 to 32/32; normalized answer scores rose from 21 to 30 for Flash and 20 to 29 for Pro, each out of 32. Format and interpretation failures remain. It performs full scans and has not been optimized or tested for native 30 MiB long trajectories. It is not enabled in either plugin entry.

One numeric fixture says “current fuel 73, this round consumes 7”; this can be read as a before/after balance ambiguity. Its original gold answer and scores remain intact, but it must not independently establish a causal arithmetic regression. Future fixtures should say “before consumption” and “after consumption” explicitly. Similarly, correct numbers with an extra unit or a full arithmetic expression may fail exact protocol checks; raw responses are preserved to make that distinction reviewable.

## Reproduction

```sh
# Offline fixture construction and model-independent retrieval diagnostics:
node bench/dense-gate.js --build-only
node bench/focused-gate.js --build-only
# DEEPSEEK_API_KEY stays in the environment; use the existing authorized account:
node bench/dense-gate.js --budget-file /path/to/shared-account.json
node bench/focused-gate.js --budget-file /path/to/shared-account.json
node bench/dense-report.js --budget-file /path/to/shared-account.json
node bench/focused-report.js --budget-file /path/to/shared-account.json
# Published evidence audits, with no API key or local run files:
node bench/verify-dense.js
node bench/verify-dense.js --focused
```

Each trial registers code and fixture hashes before API use, rotates arm order and resumes without discarding failures. The combined trials cost an estimated $0.647755 including failed-request reservations; the project ledger reached $6.433297/$10. These are fixed peak/cache-miss usage estimates, not provider invoices. There were no new summarization calls or full AgentLoop runs. Production defaults, archive schema and the compact plugin entry remain unchanged.
