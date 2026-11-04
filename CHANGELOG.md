# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
