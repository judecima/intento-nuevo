# Kernel V1 Beam fallback calibration checkpoint

Date: 2026-09-08
Kernel candidate: `4063963260abb10c8d68d0e553942899c925cc2f`

`4052960__Guillermo_Morales4052960.xml` demonstrated a controlled Beam no-complete-plan fallback after substantial measured work. The final greedy fallback plan remained industrially valid and matched the full historical terminal-dimension demand multiset (114/114 pieces, 14 boards).

Observed Beam telemetry: 149 calls, 89,104 aggregate expansions, 1,010 max expansions per invocation, 1,805 ms max invocation wall time, and one historical timeout hit. Calibration v4 runs V10 through the benchmark default `balanced` profile, so the historical Beam ceiling is 1,500 ms; the timeout observation is therefore consistent and marks that case as containing time-censored Beam work.

Calibration v4 now accepts only the candidate's explicit controlled `No se pudo completar el plan con Beam Search` fallback when the final result is valid and Beam work/terminal-control accounting is live. Other Beam exception messages remain fatal. No expansion-count threshold is used to classify fallback legitimacy.

The same case produced the first naturally completed Master observation: one run, 580 nodes, about 19 ms. After the case is re-run under the corrected gate and becomes `pass=true`, the censoring analyzer will include it in the uncensored Master population.

No optimizer runtime, parser, heuristic, scoring, search behavior, production budget, or watchdog value was changed.
