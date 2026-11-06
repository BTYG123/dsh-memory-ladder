# Native v0.1.0 / v0.2.0 holdout comparison

Baseline: f5a1cdf. Protocol SHA-256: 13ebc4b135d4043fbc77b76330d3acb781a8efcbe64a043d0335248f678a04ee. Fixture SHA-256: d9f18f8a4c934392c6fe7189efae48e3fc3f4fedeb098d9792977e0ad84434cf.
12 synthetic cases × 8 questions × 4 arms × 2 models. All runs and all errors are included. Development seed 17 is excluded.

| Model | Arm | Correct | Accuracy | Cost USD | Compactions | Calls | Failed runs |
|---|---|---:|---:|---:|---:|---:|---:|
| deepseek-flash | original | 74/96 | 77.1% | 0.060141 | 54 | 150 | 0 |
| deepseek-flash | capped-only | 71/96 | 74.0% | 0.059766 | 54 | 150 | 0 |
| deepseek-flash | archive-recall | 90/96 | 93.8% | 0.077915 | 54 | 150 | 0 |
| deepseek-flash | full | 96/96 | 100.0% | 0.111260 | 0 | 96 | 0 |
| deepseek-v4-pro | original | 75/96 | 78.1% | 0.224012 | 49 | 138 | 1 |
| deepseek-v4-pro | capped-only | 80/96 | 83.3% | 0.243232 | 54 | 150 | 0 |
| deepseek-v4-pro | archive-recall | 93/96 | 96.9% | 0.329417 | 54 | 150 | 0 |
| deepseek-v4-pro | full | 96/96 | 100.0% | 0.488643 | 0 | 96 | 0 |

## Paired case-level uncertainty

deepseek-flash: archive-recall minus original = 16.7 percentage points; seeded 10,000-resample case bootstrap interval [8.3, 27.1]. These are related synthetic templates; the interval is conditional on this test set, not a population guarantee.
deepseek-v4-pro: archive-recall minus original = 18.8 percentage points; seeded 10,000-resample case bootstrap interval [8.3, 33.3]. These are related synthetic templates; the interval is conditional on this test set, not a population guarantee.

## Measured tradeoffs

deepseek-flash: archive recall cost versus original 29.6%; versus full -30.0%. This is a quality/cost tradeoff, not an unconditional claim of cost reduction.
deepseek-v4-pro: archive recall cost versus original 47.1%; versus full -32.6%. This is a quality/cost tradeoff, not an unconditional claim of cost reduction.

## Scope and residual failures

Real Harness Session, token-meter, compaction transaction and dynamic-context services; metered HTTP bridge, not the complete AgentLoop/provider stack. Manual compaction every20 records; 32k window; newestFraction0.03; maxSummaryTokens1024. The baseline output ceiling bug is preserved and measured. This does not establish default1M automatic-loop performance or open-ended narrative quality. See ../../EVALUATION.md.

Cumulative spend at completion (including earlier exploration): $4.161352 / $10. Published estimates use peak cache-miss prices and ignore discounts.

- deepseek-flash-401-original / resource: undefined; expected "11"
- deepseek-flash-401-capped-only / historical-owner: "Tara"; expected "Iris"
- deepseek-flash-401-capped-only / resource: undefined; expected "11"
- deepseek-flash-401-archive-recall / resource: undefined; expected "11"
- deepseek-flash-402-original / resource: undefined; expected "16"
- deepseek-flash-402-capped-only / resource: null; expected "16"; Unexpected token 'U', "UNKNOWN" is not valid JSON
- deepseek-flash-402-capped-only / revised-rule: undefined; expected "7"
- deepseek-flash-403-original / resource: undefined; expected "15"
- deepseek-flash-403-capped-only / historical-owner: "Nora"; expected "Lena"
- deepseek-flash-403-capped-only / resource: undefined; expected "15"
- deepseek-flash-404-original / early-code: "UNKNOWN"; expected "K-15057"
- deepseek-flash-404-original / historical-owner: "UNKNOWN"; expected "Iris"
- deepseek-flash-404-original / signal: null; expected "tide-404"; Unexpected token 'U', "UNKNOWN" is not valid JSON
- deepseek-flash-404-original / resource: undefined; expected "14"
- deepseek-flash-404-capped-only / current-owner: null; expected "Tara"; Unexpected token 'T', "Tara" is not valid JSON
- deepseek-flash-404-capped-only / resource: undefined; expected "14"
- deepseek-flash-404-capped-only / revised-rule: undefined; expected "7"
- deepseek-flash-405-original / resource: undefined; expected "19"
- deepseek-flash-405-original / revised-rule: undefined; expected "7"
- deepseek-flash-405-capped-only / historical-owner: "UNKNOWN"; expected "Mira"
- deepseek-flash-405-capped-only / resource: undefined; expected "19"
- deepseek-flash-405-capped-only / revised-rule: undefined; expected "7"
- deepseek-flash-405-archive-recall / resource: undefined; expected "19"
- deepseek-flash-406-original / resource: undefined; expected "11"
- deepseek-flash-406-original / revised-rule: undefined; expected "7"
- deepseek-flash-406-capped-only / resource: undefined; expected "11"
- deepseek-flash-406-capped-only / revised-rule: undefined; expected "7"
- deepseek-flash-407-original / resource: undefined; expected "10"
- deepseek-flash-407-original / revised-rule: undefined; expected "7"
- deepseek-flash-407-capped-only / resource: undefined; expected "10"
- deepseek-flash-407-archive-recall / resource: undefined; expected "10"
- deepseek-flash-408-original / resource: undefined; expected "15"
- deepseek-flash-408-capped-only / early-code: "UNKNOWN"; expected "K-15205"
- deepseek-flash-408-capped-only / resource: undefined; expected "15"
- deepseek-flash-408-capped-only / revised-rule: undefined; expected "7"
- deepseek-flash-409-original / historical-owner: "Nora"; expected "Lena"
- deepseek-flash-409-original / resource: undefined; expected "14"
- deepseek-flash-409-capped-only / historical-owner: "Nora"; expected "Lena"
- deepseek-flash-409-capped-only / resource: undefined; expected "14"
- deepseek-flash-409-archive-recall / resource: undefined; expected "14"
- deepseek-flash-410-original / resource: undefined; expected "13"
- deepseek-flash-410-capped-only / resource: undefined; expected "13"
- deepseek-flash-410-archive-recall / resource: undefined; expected "13"
- deepseek-flash-411-original / current-owner: null; expected "Asha"; Unexpected token 'A', "Asha" is not valid JSON
- deepseek-flash-411-original / historical-owner: "Asha"; expected "Mira"
- deepseek-flash-411-original / resource: undefined; expected "18"
- deepseek-flash-411-original / revised-rule: undefined; expected "7"
- deepseek-flash-411-capped-only / resource: undefined; expected "18"
- deepseek-flash-411-capped-only / revised-rule: undefined; expected "7"
- deepseek-flash-412-original / resource: undefined; expected "17"
- deepseek-flash-412-capped-only / resource: undefined; expected "17"
- deepseek-flash-412-capped-only / revised-rule: undefined; expected "7"
- deepseek-flash-412-archive-recall / resource: undefined; expected "17"
- deepseek-v4-pro-401-original / resource: "UNKNOWN"; expected "11"
- deepseek-v4-pro-401-capped-only / resource: "3"; expected "11"
- deepseek-v4-pro-402-original / historical-owner: null; expected "Mira"; Unexpected token 'U', "UNKNOWN" is not valid JSON
- deepseek-v4-pro-402-original / resource: undefined; expected "16"
- deepseek-v4-pro-402-original / revised-rule: undefined; expected "7"
- deepseek-v4-pro-402-capped-only / resource: "4"; expected "16"
- deepseek-v4-pro-402-capped-only / revised-rule: null; expected "7"; Unexpected token 'U', "UNKNOWN" is not valid JSON
- RUN FAILURE deepseek-v4-pro-404-original: manual compaction could not produce a smaller summary
- deepseek-v4-pro-404-capped-only / resource: null; expected "14"; Unexpected non-whitespace character after JSON at position 3 (line 1 column 4)
- deepseek-v4-pro-404-capped-only / revised-rule: undefined; expected "7"
- deepseek-v4-pro-404-archive-recall / historical-owner: null; expected "Iris"; Unexpected token 'I', "Iris" is not valid JSON
- deepseek-v4-pro-405-original / resource: "UNKNOWN"; expected "19"
- deepseek-v4-pro-405-original / revised-rule: undefined; expected "7"
- deepseek-v4-pro-406-original / resource: undefined; expected "11"
- deepseek-v4-pro-406-original / revised-rule: null; expected "7"; Unexpected token 'U', "UNKNOWN" is not valid JSON
- deepseek-v4-pro-406-capped-only / revised-rule: undefined; expected "7"
- deepseek-v4-pro-406-archive-recall / revised-rule: undefined; expected "7"
- deepseek-v4-pro-407-capped-only / historical-owner: "UNKNOWN"; expected "Iris"
- deepseek-v4-pro-407-capped-only / resource: undefined; expected "10"
- deepseek-v4-pro-407-capped-only / negative-rule: null; expected "NO"; Unexpected token 'N', "NO" is not valid JSON
- deepseek-v4-pro-408-original / resource: undefined; expected "15"
- deepseek-v4-pro-408-original / revised-rule: null; expected "7"; Unexpected token 'U', "UNKNOWN" is not valid JSON
- deepseek-v4-pro-408-capped-only / revised-rule: undefined; expected "7"
- deepseek-v4-pro-408-archive-recall / revised-rule: undefined; expected "7"
- deepseek-v4-pro-409-capped-only / resource: "8"; expected "14"
- deepseek-v4-pro-410-original / revised-rule: undefined; expected "7"
- deepseek-v4-pro-411-original / revised-rule: undefined; expected "7"
- deepseek-v4-pro-411-capped-only / historical-owner: "UNKNOWN"; expected "Mira"
- deepseek-v4-pro-411-capped-only / revised-rule: undefined; expected "7"
- deepseek-v4-pro-412-original / resource: "UNKNOWN"; expected "17"
- deepseek-v4-pro-412-capped-only / current-owner: "UNKNOWN"; expected "Nora"
- deepseek-v4-pro-412-capped-only / historical-owner: "UNKNOWN"; expected "Lena"
- deepseek-v4-pro-412-capped-only / revised-rule: undefined; expected "7"

Compressed evidence contains the exact protocol, every generated case, run report, source checksums and every request/response trace. It contains synthetic data only and no authorization headers. Missing/failed calls remain charged in the ledger records.

## Release compatibility verification

After the live run, release hardening fixed minimum-tier allocation under small output ceilings, oversized-record excerpt focus, exact raw-output logging, unique per-attempt billing tags, and the development Zod override. Offline replay of the final code and Zod 4.6.6 reproduced all 96/96 registered runs, including the expected compaction failure, with identical model request content and output limits after normalizing fresh UUID/session identities. Recorded model responses were reused; this is compatibility regression, not another live quality result.
The evidence includes both tested and release-source checksums. Changes affecting default/small-ceiling tiers and large-record excerpts also have dedicated unit tests; those inputs were not covered by the live holdout matrix.
The capped-only failed case is scored as a failed benchmark pipeline. A failed manual compaction preserves the raw surface; the production automatic hook can continue after such an error. Therefore the failed-run score is not evidence of raw-history loss.