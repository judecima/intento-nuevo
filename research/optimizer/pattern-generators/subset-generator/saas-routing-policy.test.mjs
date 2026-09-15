import assert from 'node:assert/strict';
import {
  P13_SAAS_ROUTING_POLICY,
  routeAfterFast,
  routeAfterP13,
  routeBeforeFast,
  shouldRunP13Synchronously,
} from './saas-routing-policy.mjs';

const base = { fastBoards: 6, lowerBound: 5, pieceQty: 50, logicalPieceTypes: 20 };

assert.equal(P13_SAAS_ROUTING_POLICY.syncBudgetMs, 1500);
assert.equal(P13_SAAS_ROUTING_POLICY.fastSyncMaxPieceQty, 350);
assert.equal(P13_SAAS_ROUTING_POLICY.deepRescueMaxPieceQty, 160);

assert.equal(routeBeforeFast({ pieceQty: 350 }), 'SYNC_FAST');
assert.equal(routeBeforeFast({ pieceQty: 351 }), 'BACKGROUND_FAST');
assert.equal(routeBeforeFast({ pieceQty: Number.NaN }), 'BACKGROUND_FAST');

assert.equal(shouldRunP13Synchronously(base), true);
assert.equal(shouldRunP13Synchronously({ ...base, pieceQty: 51 }), false);
assert.equal(shouldRunP13Synchronously({ ...base, logicalPieceTypes: 21 }), false);
assert.equal(shouldRunP13Synchronously({ ...base, fastBoards: 7 }), false);
assert.equal(shouldRunP13Synchronously({ ...base, fastBoards: 5 }), false);
assert.equal(shouldRunP13Synchronously({ ...base, lowerBound: Number.NaN }), false);

assert.equal(routeAfterFast({ ...base, fastBoards: 5 }), 'DONE_FAST_CERTIFIED');
assert.equal(routeAfterFast(base), 'SYNC_P13');
assert.equal(routeAfterFast({ ...base, pieceQty: 51 }), 'BACKGROUND_RESCUE28');
assert.equal(routeAfterFast({ ...base, pieceQty: 161 }), 'BACKGROUND_LARGE_CASE');
assert.equal(routeAfterFast(null), 'BACKGROUND_LARGE_CASE');

assert.equal(routeAfterP13({ p13Boards: 5, lowerBound: 5, pieceQty: 40 }), 'DONE_P13_CERTIFIED');
assert.equal(routeAfterP13({ p13Boards: 6, lowerBound: 5, pieceQty: 40 }), 'BACKGROUND_RESCUE28');
assert.equal(routeAfterP13({ p13Boards: 6, lowerBound: 5, pieceQty: 200 }), 'BACKGROUND_LARGE_CASE');

console.log('saas-routing-policy: 19/19 PASS');
