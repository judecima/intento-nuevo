# Kernel V1 — historical replay corpus binding

Date: 2026-09-07

## Correction

The 2,000-row historical `benchmark_project_v10.csv` belongs to the `parte1` source partition, not to `resto`.

Therefore two physical corpora have distinct roles in Kernel V1 certification:

- `--historicalCorpus`: extracted `parte1`. It validates `HISTORICAL_VALIDITY_V1` infeasible classification against the historical evidence. The replay must bind all 2,000 benchmark filenames, classify the 1,550 non-SKIP project cases, and reproduce the exact 60 historical physically-infeasible filenames.
- `--corpus`: extracted `resto`. It is the exact certification cohort source: 8,669 physical XML, 19 current-parser exclusions, 8,650 accepted identities, SHA-256 `36d005421ae79b01867e0bba377c1bf526801bcd4dcfa2b0180e12cf354458f3`.

The historical 60-case replay validates the classifier; it does **not** impose an expected infeasible count on `resto`. The number of expected-infeasible cases in `resto` is an output of applying the validated classifier to that cohort, not an extrapolated target.

No optimizer heuristic, canonical parser policy, deterministic budget, or Worker behavior changes as part of this correction.
