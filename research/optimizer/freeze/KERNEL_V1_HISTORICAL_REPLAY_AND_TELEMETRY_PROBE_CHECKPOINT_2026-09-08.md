# Kernel V1 — Historical replay closed / telemetry probe selection corrected

Date: 2026-09-08

Kernel candidate remains unchanged:

`4063963260abb10c8d68d0e553942899c925cc2f`

## Historical infeasible replay — PASS

The physical `parte1` replay using `physical-xml-historical-validity-v1` passed the exact historical gate:

```text
embeddedParte1Records          2001
embeddedParte1DistinctXml      2000
historicalCorpusXml            2000
benchmarkRows                  2000
benchmarkFilesPresent          2000
attemptedProjectCases          1550
historicalExpectedInfeasible     60
detectedInHistoricalSample       60
exactSetMatch                  true
```

This empirically validates the project execution binding used by the replay, including first-root trim with historical default 10, against the exact 60 historically infeasible filenames. The duplicate embedded identity `4011957__Maximiliano_Santoro4011957.xml` does not create two replay cases: the replay is keyed by physical filename and `parseCanonicalXml(project)` aggregates all panels in the XML into one canonical demand.

## Step 0 telemetry — wiring proven, probe selection corrected

The first telemetry-probe attempt produced valid composition telemetry in all attempted cases but selected cheap historical cases that did not enter Beam, Master or OneBoard. That is a probe-selection failure, not an instrumentation failure.

The probe now selects from the versioned `experiencia/v6/hotspot-all.jsonl` evidence where either:

- `metricas.master.activaciones > 0`, or
- `metricas.oneboard.activaciones > 0`.

Among those historically activated feasible cases, it tries the cheapest historical `engineMs` first, up to eight candidates. Historical activation is only selection evidence: PASS still requires a fresh current run that is valid, has live composition telemetry, and actually increments at least one current Beam/Master/OneBoard counter.

This avoids using extreme-tail cases merely to prove that a work-budgeted path is wired.

## Methodological boundary

No optimizer runtime, parser, heuristic, scoring rule, search behavior, deterministic budget or watchdog value is changed by this checkpoint. The Kernel V1 candidate remains unchanged. Production deterministic budgets are still uncalibrated; formal correctness/determinism certification must not start until they are versioned from calibration evidence.

## Next gate

Re-run `kernel-budget-calibration-v3.mjs` with the same extracted `parte1` and `resto` corpora. The historical replay should remain 60/60, the telemetry probe must now exercise a current budgeted path, and only then may calibration rows begin to accumulate.
