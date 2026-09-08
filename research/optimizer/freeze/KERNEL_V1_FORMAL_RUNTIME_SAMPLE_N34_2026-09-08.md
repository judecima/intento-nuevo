# Kernel V1 — formal runtime random sample checkpoint (n=34)

Date: 2026-09-08
Kernel candidate: `4063963260abb10c8d68d0e553942899c925cc2f`
Sampling order: reproducible random order over the physical `resto` feasible cohort
Execution isolation: fresh Node process per optimized feasible case

## Purpose

Estimate the wall-clock cost of the two formal Kernel V1 passes without using the deliberately biased work-first calibration cohort or the 213-case historical hotspot tail.

The formal accepted cohort remains 8,650 identities. Under the historical execution binding, 482 are `EXPECTED_INFEASIBLE` and are classified but are not sent to `optimizeProject`; therefore the expensive optimization denominator per formal pass is 8,168 feasible executions.

## Preliminary n=34 result

Fresh-process overhead:

- mean: 75 ms
- p50: 72 ms
- max: 121 ms
- approximately 1.0% of end-to-end measured time

Optimizer-only runtime:

- mean: 7,360 ms
- p50: 1,124 ms
- p90: 9,826 ms
- max: 89,942 ms

Whole fresh-process runtime:

- mean: 7,434 ms
- p50: 1,196 ms
- p90: 9,911 ms
- max: 90,063 ms

Projection over 8,168 optimized feasible cases:

- one formal pass: approximately 16.9 hours serial
- correctness + determinism repeat: approximately 33.7 hours serial

These values are preliminary because n=34 is still tail-sensitive. The mean is about 6.5x the median and the current maximum is about 80x the median. A single additional heavy random observation can materially move the mean.

## Fresh-process decision

The measured process-start/import/IPC/shutdown overhead is operationally negligible relative to optimizer work (~1%). Kernel V1 formal execution therefore retains `freshProcessPerFeasibleCase=true`.

Multi-case batching in one Node process is rejected for the freeze because the expected gain is about 1% while it would introduce a new proof obligation: every mutable/global/cache/random state would need an explicit reset-equivalence proof between cases.

## Parallelism decision boundary

If wall-clock reduction is required, use sharding across independent cases while retaining one fresh process per case. Do not weaken process isolation merely to improve throughput.

The exact shard concurrency is not fixed at n=34. It must be chosen after the random sample reaches at least n=100 and the runtime estimator reports the bootstrap interval and mean stability.

Formal watchdog evidence is valid only for the declared execution environment and concurrency. Parallelism can create CPU contention and trigger a wall-clock watchdog that would not fire in an isolated run, so the final certification record must bind:

- reference machine / CPU / Node runtime;
- shard count / maximum concurrent optimizer processes;
- production deterministic budgets and watchdog values;
- zero watchdog hits under that exact configuration.

Idealized arithmetic (not a commitment): 33.7 serial hours divided by four perfectly scaling shards would be about 8.4 hours total for both passes. Real throughput must be measured because heavy-tail imbalance and CPU contention prevent assuming linear scaling.

## Tail handling

Formal correctness and determinism still include every feasible case, including the known extreme tails. Random sampling estimates total runtime; it does not replace or exempt the tails.

Known extreme-tail orders remain explicitly tracked and should be scheduled late within each formal pass so long individual cases do not block early coverage reporting.

## Next gate

Allow the same seeded random sample to reach n=100. Then compare:

- n=34 vs n=100 mean;
- bootstrap 95% interval for mean end-to-end runtime;
- p50/p90/p95/p99/max;
- fresh-process overhead share;
- whether any known extreme tail entered the sample.

If the mean is reasonably stable, choose the formal shard count and execution machine. If it moves materially, continue the same reproducible sample toward n=200 before locking the execution plan.

This checkpoint is planning evidence only. It does not change the optimizer runtime, candidate identity, correctness predicate, deterministic budgets, or formal certification gate.
