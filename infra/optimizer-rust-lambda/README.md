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
