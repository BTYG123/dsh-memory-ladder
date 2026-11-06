# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] — 2026-11-06

Opt-in retrieval formats and a capacity guard.

### Added

- `RecallIndex`: incremental lexical index inside `ArchiveStore`. At a 29.6 MiB
  archive the retrieval step drops from a full scan to an indexed lookup while
  all 30 benchmark queries stay byte-identical to the baseline.
- `./compact` export (`lib/compact-engine.js` + `lib/recall-wire.js`): a
  drop-in engine subclass that transports the same retrieved events with
  session-local event orders instead of UUIDs. Measured −23.7% input tokens on
  the static protocol and −24.1% / −22.7% total tokens on the dynamic long run,
  with no new wrong answers. **Not the default**; mount it only if you want the
  smaller transport.
- `docs/CAPACITY.md`, `docs/TOKEN_GATE.md`, `docs/DENSE_RECALL.md`,
  `docs/DYNAMIC_RECALL.md`, `docs/LONG_TASKS.md` and six evidence packages with
  checksums and offline verification.

### Fixed

- **Silent archive overflow.** At exactly `archiveMaxBytes` the old code kept
  returning success from `remember()` without storing the new message, and a
  reload reset `full` to false — so recall could serve stale state (an outdated
  owner, a superseded number) while looking healthy. It now throws
  `ARCHIVE_CAPACITY`; the compaction transaction then refuses to replace the raw
  messages and no summarization call is spent. Retry after raising
  `archiveMaxBytes`, rotating the archive, or disabling `archiveRecall`.
  See the limit note in the README: a full archive means that session can no
  longer compact until you act.

### Note

`lib/focused-recall.js` is experimental, not exported, and there only for the
benchmark harness; it ships in the tarball so a future export cannot break the
package.
## [0.2.1] — 2026-11-06

Re-measured on the released code. No runtime behaviour changed.

### Changed

- `docs/evidence/native-v1/` regenerated from a full run of this tree
  (96 runs, 1,080 request/response traces, offline replay 96/96, source
  checksums taken from the released files). The previous package was measured
  on `f838773`, which carried the discarded sleep budget.
- Archive recall holds up on the released code: 93.8% vs 77.1% (deepseek-flash,
  +16.7pp, bootstrap [8.3, 27.1]) and 96.9% vs 78.1% (deepseek-v4-pro, +18.8pp,
  bootstrap [8.3, 33.3]) against the original engine. Cost is 29.6% / 47.1%
  above the original arm and 30.0% / 32.6% below full history.
- `bench/evidence.js` tolerates a batch that was not run instead of failing on a
  missing development directory.

### Note

The deepseek-v4-pro original arm scored 78.1% in this run because one case
(`404-original`) failed to compact an indivisible oversized record; that run
counts as eight failed questions. Excluding it the arm is 85.2%, in line with
the previous run.
## [0.2.0] — 2026-11-06

### Added

- Session-isolated original-text archive persisted before compaction commits, with stable message identities and restart recovery.
- Source-weighted, bounded archival recall through Harness's logged dynamic-context channel, without request mutation or extra retrieval-model calls.
- Bounded excerpts for large archived messages, with source offsets; explicit opt-out and archive-directory settings.
- Actual Harness transaction and context-assembly integration tests, pinned v0.1.0 baseline, registered synthetic holdouts, cost accounting and auditable request/response evidence.

### Fixed

- `maxSummaryTokens` is an output ceiling instead of a lower bound. Tier allocation now accounts for that ceiling.
- One compaction result corresponds to exactly one auxiliary model call; no hidden second summarization attempt.
- Keep exact model output in the auxiliary call record, separately from the trimmed checkpoint summary.
- Patched root Zod override with native compatibility replay; host applications still manage their own overrides.

### Scope

- Holdout evidence covers explicit compaction of synthetic records, not the complete automatic AgentLoop, real repository work or narrative quality. Accuracy gains and cost increases are both retained in the evidence.

## [0.3.0] — 2026-11-06

Opt-in retrieval formats and a capacity guard.

### Added

- `RecallIndex`: incremental lexical index inside `ArchiveStore`. At a 29.6 MiB
  archive the retrieval step drops from a full scan to an indexed lookup while
  all 30 benchmark queries stay byte-identical to the baseline.
- `./compact` export (`lib/compact-engine.js` + `lib/recall-wire.js`): a
  drop-in engine subclass that transports the same retrieved events with
  session-local event orders instead of UUIDs. Measured −23.7% input tokens on
  the static protocol and −24.1% / −22.7% total tokens on the dynamic long run,
  with no new wrong answers. **Not the default**; mount it only if you want the
  smaller transport.
- `docs/CAPACITY.md`, `docs/TOKEN_GATE.md`, `docs/DENSE_RECALL.md`,
  `docs/DYNAMIC_RECALL.md`, `docs/LONG_TASKS.md` and six evidence packages with
  checksums and offline verification.

### Fixed

- **Silent archive overflow.** At exactly `archiveMaxBytes` the old code kept
  returning success from `remember()` without storing the new message, and a
  reload reset `full` to false — so recall could serve stale state (an outdated
  owner, a superseded number) while looking healthy. It now throws
  `ARCHIVE_CAPACITY`; the compaction transaction then refuses to replace the raw
  messages and no summarization call is spent. Retry after raising
  `archiveMaxBytes`, rotating the archive, or disabling `archiveRecall`.
  See the limit note in the README: a full archive means that session can no
  longer compact until you act.

### Note

`lib/focused-recall.js` is experimental, not exported, and there only for the
benchmark harness; it ships in the tarball so a future export cannot break the
package.
## [0.2.1] — 2026-11-06

Re-measured on the released code. No runtime behaviour changed.

### Changed

- `docs/evidence/native-v1/` regenerated from a full run of this tree
  (96 runs, 1,080 request/response traces, offline replay 96/96, source
  checksums taken from the released files). The previous package was measured
  on `f838773`, which carried the discarded sleep budget.
- Archive recall holds up on the released code: 93.8% vs 77.1% (deepseek-flash,
  +16.7pp, bootstrap [8.3, 27.1]) and 96.9% vs 78.1% (deepseek-v4-pro, +18.8pp,
  bootstrap [8.3, 33.3]) against the original engine. Cost is 29.6% / 47.1%
  above the original arm and 30.0% / 32.6% below full history.
- `bench/evidence.js` tolerates a batch that was not run instead of failing on a
  missing development directory.

### Note

The deepseek-v4-pro original arm scored 78.1% in this run because one case
(`404-original`) failed to compact an indivisible oversized record; that run
counts as eight failed questions. Excluding it the arm is 85.2%, in line with
the previous run.
## [0.2.0] — 2026-11-06

### Added

- **Archive recall.** Before a sleep replaces history, the raw span is appended
  to a session-isolated JSONL archive; every pre-step then recalls the entries
  that lexically match the current request and injects them as *retrieved data*
  with an explicit "not instructions, not independent evidence" notice.
- `lib/archive.js` (archive store + recall ranking) with `archiveRecall`,
  `archiveDirectory`, `recallMaxBytes` and `archiveMaxBytes` settings.
- `bench/` evaluation harness and `docs/evidence/native-v1/`: 12 synthetic
  cases x 8 questions x 4 arms x 2 models, published with checksums, a replay
  path that needs no API access, and every failed sample listed.
- `docs/EVALUATION.md` describing the protocol and its limits.

### Fixed

- **Sleep summarization keeps its retry and headroom.** This branch originally
  dropped the second attempt and halved the output budget; on a
  reasoning-heavy model the sleep request then hit `finish=max-tokens` with only
  reasoning blocks and failed twice in three attempts. The two-attempt loop and
  `min(16384, max(maxSummaryTokens, total + 2048))` are restored.
- **Bounded archive growth.** `archiveMaxBytes` (default 32 MB per session)
  stops appends instead of letting one long session fill the workspace.
## [0.1.0] — 2026-11-04

First public release.

### Added

- Tiered sleep-compaction policy: the newest round owns `T/3` of the routed
  model's context window, and every older tier halves (`T/6`, `T/12`, …).
- One model call rewrites "old ladder + this round's raw transcript" into a new
  ladder; the compaction transaction then replaces the shadowed span with a
  single checkpoint message.
- Bundle packaging: `dsh.bundle.patch` disables `compaction-basic` and inserts
  this backend's row, so one install command is enough.
- Configurable policy: `newestFraction`, `tierCount`, `minTierTokens`,
  `maxSummaryTokens`, `minCompactionTokens`, `summarizationProvider/Model`,
  `auto`.
- Deterministic tool-result pruning before a sleep, so oversized tool output is
  trimmed without spending a model call.
- Bounded shadow span (`0.6 × window`), so the summarization request itself can
  never overflow the window.
- Manual `/compact` support with a minimum-span floor; short sessions return
  "no compactable history" instead of failing the shrink check.
- Reconnect/backoff handling and overflow recovery bounded to one retry.
- `refactor`: no longer reads the parent class's private `config` field.
- Dependency-free `lib/pure.js` with unit tests (`node --test`), also wired into
  the production code path so tests cover what runs.
- GitHub Actions: unit tests on Node 22 and 24.

### Known limits

- An indivisible oversized message cannot be repaired by surface compaction.
- Each sleep costs one full-context model request.
- Older tiers decay by design; the plugin is lossy.

### Measured

Same task, two windows: default `T/3` on a 1M window triggered 0 sleeps at
185,359 peak tokens; a 32k-equivalent window triggered 10 sleeps and peaked at
32,636 tokens (5.7× reduction) while core early facts survived all ten sleeps.
Details: [`docs/experiment.md`](docs/experiment.md).

[0.1.0]: https://github.com/BTYG123/dsh-memory-ladder/releases/tag/v0.1.0
