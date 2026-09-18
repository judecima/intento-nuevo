# Rust Pattern Generator Spike

Branch: `feature/optimizer-rust-pattern-generator`

## Scope

This branch migrates the combinatorial B0.1 AND/OR pattern-search core to Rust while deliberately keeping the trusted JavaScript physical materializer, industrial validator, independent-slice validator and XML roundtrip checks.

The production V10 path is **not switched by default**. The Rust generator is an experimental server-side module until corpus-level quality and performance gates are complete.

## Architecture

```text
Next.js / Node worker
        |
        | N-API
        v
Rust pattern search
        |
        | compact cut-tree roots
        v
existing JS physical materializer
        |
        +--> industrial validator
        +--> independent-slice validator
        +--> XML export / reimport
```

The native search receives the existing B0 context in exact 0.001 mm integer units. It implements the existing `piece-multiples-v1` coordinate policy, exact piece/terminal alternatives, alternating guillotine stages, usage-vector demand checks, memoized geometry states, bounded variants per usage vector and deterministic work limits.

## Build

Requirements:

- Node.js 22
- stable Rust toolchain
- a native Node runtime (not Edge)

```bash
npm run optimizer:rust:build
npm run optimizer:rust:test
```

The build produces `native/optimizer-pattern-generator/optimizer_pattern_generator.node`. The binary is ignored by Git and must be built for the target OS/architecture.

## Next.js deployment

Next.js remains the application runtime. The Rust addon is server-only and can be loaded from Node workers/server routes.

For a VM or Docker deployment, compile the addon in the same Linux/architecture as production. For serverless providers, native-addon tracing and target compatibility must be verified. Edge Runtime cannot load Node native addons.

The current production path remains JavaScript when the addon is absent because no production import points at the experimental adapter.

## Validation gate

The Rust-specific test suite requires the native addon and checks the nine established H2 fixtures:

1. canonical root grammar matches the JS B0.1 generator;
2. physical pattern pools match after the existing materializer;
3. every Rust-generated physical pattern passes industrial validation;
4. independent slice validation passes;
5. XML export/reimport preserves piece demand;
6. repeated native runs are deterministic;
7. work limits return `WORK_LIMIT` rather than false completion.

Promotion to V10 requires a later real-corpus gate with zero board-count regressions and measured CPU improvement. This branch does not make that promotion claim.
