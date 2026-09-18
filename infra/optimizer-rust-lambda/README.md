# Optimizer Rust Lambda POC

This experiment starts from the frozen worker candidate at `425ebba5de48eb0105d5cb46b08594b3dc50ff49` and does not change optimizer heuristics, Pattern Master scheduling, acceptance policy, or the production worker default.

The goal is narrower: execute the already-certified `generarPatronesLegacyRustHybrid` path on AWS Lambda under both `x86_64` and `arm64`, then compare runtime behavior without changing the algorithm.

## Shape

```text
Lambda Node.js 22 / Amazon Linux 2023
        |
        | CommonJS
        v
rust-patrones.cjs
        |
        +--> rust-hybrid.cjs
        +--> rust-packer.cjs
        |       |
        |       v
        |    N-API addon
        |
        +--> existing motor.cjs helpers
```

The handler accepts the same `lineas`, optimizer options, round count and seed used by Pattern Master. It returns timing/memory telemetry plus a SHA-256 digest of the normalized physical pattern pool. The digest lets the x86_64 and arm64 runs prove output parity without returning the full pattern payload.

Generator timing intentionally excludes digest computation. `generatorWallMs` and `generatorCpuMs` therefore measure the Pattern Master call itself; `digestMs` is reported separately.

## CI compatibility gate

`.github/workflows/optimizer-rust-lambda-poc.yml` runs on native GitHub x64 and arm64 Linux runners. For both architectures it:

1. runs the Rust crate tests;
2. builds the native addon;
3. executes the 4057401 Pattern Master smoke directly on the host;
4. builds the Lambda Node.js 22 container image for the matching architecture;
5. invokes it through the Lambda Runtime Interface Emulator.

This proves packaging/runtime compatibility. It is not an AWS Lambda performance benchmark because GitHub runners are different hardware.

## Local image

x86_64:

```bash
docker buildx build --platform linux/amd64 --provenance=false --load \
  -f infra/optimizer-rust-lambda/Dockerfile \
  -t optimizer-rust-lambda-poc:x64 .
```

arm64:

```bash
docker buildx build --platform linux/arm64 --provenance=false --load \
  -f infra/optimizer-rust-lambda/Dockerfile \
  -t optimizer-rust-lambda-poc:arm64 .
```

Run one image locally:

```bash
docker run --rm -p 9000:8080 optimizer-rust-lambda-poc:x64
```

Then invoke:

```bash
curl http://localhost:9000/2015-03-31/functions/function/invocations \
  --data-binary @infra/optimizer-rust-lambda/fixtures/4057401.json
```

## AWS A/B contract

Deploy two separate Lambda functions, one per architecture, from the corresponding single-architecture image. Keep all other settings identical. The initial comparison should use the same region, memory, timeout and fixture set.

Recommended first pass for this CPU-bound workload:

- Node.js 22 Lambda container image;
- 4096 MB memory on both functions;
- 120 s timeout for the current Master-active cohort;
- reserved concurrency kept small during the POC;
- no database access and no production queue integration yet.

The POC handler has no Supabase dependency and no write path. It only accepts a Pattern Master payload and returns telemetry/digest.

## Remote benchmark

Requirements:

- AWS CLI authenticated against the account/region containing both functions;
- two already-deployed Lambda functions built from this branch.

Set:

```bash
export OPTIMIZER_LAMBDA_X64=optimizer-rust-poc-x64
export OPTIMIZER_LAMBDA_ARM64=optimizer-rust-poc-arm64
export OPTIMIZER_LAMBDA_SAMPLES=10
```

Then run:

```bash
node scripts/benchmark-optimizer-lambda.mjs \
  infra/optimizer-rust-lambda/fixtures/4057401.json
```

The benchmark checks deterministic output inside each architecture and exact digest/pattern-count parity across architectures. It reports p50/p90/p95/p99 for generator wall/CPU time and Lambda duration, any observed cold-start `Init Duration`, max memory, and billed GB-seconds.

`billedGbSeconds` is intentionally reported instead of hard-coding a Lambda price. It can be multiplied by the current regional/architecture GB-second price when the AWS run is performed.

## Promotion rule

Do not route production jobs to Lambda from this branch. Promotion requires real AWS measurements on the same real-order cohort used for the worker candidate, with at minimum:

- zero pattern digest/quality regressions attributable to architecture;
- 4/4 historical winners still green through the existing end-to-end validator path;
- 323/323 Master-active cases completed and persisted per case;
- cold-start, p50, p90, p95, p99, max-memory and billed-GB-second measurements for both architectures;
- no global switch of inline/preview paths.


## Full Optimize Lambda boundary

The Pattern Generator handler above remains unchanged as the focused hotspot microbenchmark. A second, separate artifact now exercises the complete domain boundary:

```text
full-optimize-wrapper.mjs
        |
        v
bundled full-optimize-handler.ts
        |
        v
optimizeProject(canonicalInput, {
  patternGenerator: "rust",
  bypassCache: true,
  rustCertification: true
})
        |
        v
V10 -> Pattern Master Rust when reached -> coverage solver
    -> materialization -> V10 acceptance -> industrial validation
    -> independent-slices validation -> normalized OptimizationResult
```

The Full handler accepts an `OptimizationInput` directly (or under an AWS `input` envelope). It does not accept `lines/options` as its domain boundary.

### Packaging

The Full image is built by `Dockerfile.full`, independently from the existing Pattern Generator `Dockerfile`.

- Bundler: esbuild `0.25.10`.
- Source entrypoint: `infra/optimizer-rust-lambda/full-optimize-handler.ts`.
- Bundle output: `src/lib/optimizer/engine/full-optimize-handler.mjs`.
- Runtime wrapper: `infra/optimizer-rust-lambda/full-optimize-wrapper.mjs`.
- Bundled TypeScript dependencies include `legacy-engine.ts`, schema validation (including zod), types needed at build time, and the independent-slices validator.
- Legacy CJS modules and the experimental directory remain physical runtime files so the existing `createRequire(import.meta.url)` relative resolution in `legacy-engine.ts` is preserved.
- The certified N-API addon is built from the same `native/optimizer-pattern-generator` source and copied unchanged into the final image.

The bundle is intentionally emitted under the same `src/lib/optimizer/engine` directory shape as the application source. This preserves the existing relative `../legacy/*` module resolution instead of recreating the optimizer entrypoint.

Image byte size is recorded by CI from `docker image inspect`; it is evidence produced by the architecture gate, not a hard-coded value in this document.

### Rust certification mode

Full Optimize benchmarking uses runtime-only diagnostic options. Production callers do not set them.

The certification contract requires all of the following after `optimizeProject()` returns from V10:

```text
rustRequested = true
rustExecuted = true
rustSucceeded = true
rustFallbackJs = false
rustMasterSwallowedError = false
```

The Pattern Master routing records execution/success/fallback in an optional diagnostics sink. The V10 Master catch also records whether it swallowed an exception. In certification mode, the domain entrypoint checks those invariants after V10 and throws if any is false.

The normal worker remains unchanged: when certification mode is absent, its existing Rust-to-JS fallback policy remains in force.

### Cache isolation

`bypassCache: true` skips both the in-process optimizer cache lookup and cache population for that invocation. It does not change production cache keys. Full Optimize telemetry reports both `cacheHit` and `cacheBypassed`, and the benchmark gate rejects any run where `cacheHit !== false` or `cacheBypassed !== true`.

### Full timing boundary

`domainWallMs` and `domainCpuMs` wrap only the call to `optimizeProject(...)`.

- `domainWallMs`: elapsed wall time from `performance.now()`.
- `domainCpuMs`: Node process CPU delta from `process.cpuUsage()`, user + system, including the in-process Rust N-API work.
- Lambda `Duration` is an external AWS metric and is intentionally not synthesized from these values.

Module import time is reported separately as `moduleInitMs` by the wrapper. RIE timing is compatibility/diagnostic evidence only, not an AWS cold-start benchmark.

### Result digest

The Full digest hashes the normalized public optimization result: boards, placements, cuts, remnants, deterministic metrics, validations, algorithm version and input identity. It excludes only runtime metadata that is expected to vary between executions (`engineMs` and `cacheHit`) and does not hash the raw V10 telemetry object, because that contains elapsed-time counters.

Semantic geometry, materialization, validation and remnant differences are not normalized away.

### Full CI gate

The same workflow now has separate Pattern Generator and Full Optimize jobs on native x64 and arm64 runners. The Full gate:

1. executes the exact domain `optimizeProject()` as the reference;
2. builds the matching Lambda image;
3. invokes the image through the Runtime Interface Emulator three times per real winner;
4. requires Rust participation, no fallback, no cache hit and valid output;
5. requires historical board counts for 4050594, 4056900, 4057401 and 4059200;
6. compares materialized result digest and remnant metrics against the domain reference;
7. verifies repeated-run determinism;
8. uploads an architecture result and performs a final x64-vs-arm64 parity gate.

This gate does not deploy AWS resources and does not execute the 323-case cohort.
