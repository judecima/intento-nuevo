# Pre-registered Master rules for the next independent holdout

Date: 2026-09-22

This file fixes the candidate rules before evaluating any future independent ~20k corpus.
Thresholds in this document must not be changed after seeing that holdout.

## Rule 1 — High type-count P3

Condition:
- Master is active.
- typeCount > 40.

Action:
- use production rounds 0, 1, 2 only (P3) instead of Full40.

Current status:
- internally validated on the existing corpus;
- implementation E2E: 20,841 valid cases, 1,118 affected, 0 board losses, 0 equal-board quality differences;
- global CPU saving 11.10%;
- not yet independently validated on future wins.

Independent-holdout primary metric:
- among cases where Full40 beats the pre-Master incumbent, count how often Full40 beats P3.

## Rule 2 — Mid type-count / high repetition P3

Condition:
- Master is active.
- 20 <= typeCount <= 40.
- totalPieces / typeCount >= 4.0.

Action:
- use P3 instead of Full40.

Thresholds are fixed here before independent validation.
Do not tune 20, 40 or 4.0 using the future holdout.

Current status:
- discovery only on the existing corpus;
- discovery cohort: 124 active cases, 0 historical Full40 wins;
- internal P3-vs-Full40 validation is pending.

Independent-holdout primary metric:
- board losses versus Full40.
Secondary:
- CPU saving and equal-board quality differences.

## Rule 3 — Certified P3 early stop

Condition:
- Master is active.
- run P3 first.
- P3 reaches the certified lower bound already available to V10.

Action:
- stop Master immediately.
- otherwise continue through Full40.

This rule has no learned geometric threshold. Its safety premise is mathematical:
a feasible solution equal to a valid lower bound cannot be improved in board count.

Current status:
- benchmark of CPU economics and quality parity pending.

Independent-holdout primary metrics:
- board losses must be zero;
- equal-board quality must not be worse than Full40;
- CPU saving must remain positive.

## Validation discipline

The future independent corpus is evaluation-only:
- no threshold changes after inspecting results;
- report all affected cases;
- report Full40 wins separately from non-wins;
- report board losses case by case;
- report equal-board quality differences;
- report CPU total and p50/p95/p99.
