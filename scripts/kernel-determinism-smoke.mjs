import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Coverage = require('../src/lib/optimizer/legacy/cobertura.cjs');
const Motor = require('../src/lib/optimizer/legacy/motor.cjs');
const OneBoard = require('../src/lib/optimizer/legacy/oneboard.cjs');

function step0() {
  return {
    beam: { calls:0, expansionsTotal:0, expansionsMax:0, wallMsTotal:0, wallMsMax:0, timeoutHits:0, budgetHits:0, watchdogHits:0 },
    master:{ runs:0, nodesTotal:0, nodesMax:0, wallMsTotal:0, wallMsMax:0, timeoutHits:0, budgetHits:0, watchdogHits:0 },
    oneboard:{ runs:0, attemptsTotal:0, attemptsMax:0, wallMsTotal:0, wallMsMax:0, timeoutHits:0, budgetHits:0, watchdogHits:0 },
    composition:{ optimizarCalls:0, armarPlacasCalls:0, stageCalls:0 },
  };
}

// Coverage: terminal reached by the last admitted node must survive the budget.
{
  const patrones = [{ uso:[[0,1]], area:1, placa:{ id:'p' } }];
  const demanda = [2];
  const areas = [1];

  const t1 = step0();
  const s1 = Coverage.resolverCobertura(patrones, demanda, 1, 3, 60_000, {
    telemetry:t1,
    maxNodos:1,
    watchdogMs:60_000,
  }).resolver(areas);
  assert.equal(s1.nodos, 1);
  assert.equal(s1.agotado, true);
  assert.equal(s1.plan, null);
  assert.equal(t1.master.budgetHits, 1);
  assert.equal(t1.master.watchdogHits, 0);

  const t2 = step0();
  const s2 = Coverage.resolverCobertura(patrones, demanda, 1, 3, 60_000, {
    telemetry:t2,
    maxNodos:2,
    watchdogMs:60_000,
  }).resolver(areas);
  assert.equal(s2.nodos, 2);
  assert.equal(s2.agotado, false);
  assert.equal(s2.placas, 2);
  assert.equal(s2.plan?.length, 2);
  assert.equal(t2.master.budgetHits, 0);
  assert.equal(t2.master.watchdogHits, 0);

  // Flags OFF: resolver remains usable with the historical clock contract.
  const legacy = Coverage.resolverCobertura(patrones, demanda, 1, 3, 60_000, {
    telemetry:step0(),
  }).resolver(areas);
  assert.equal(legacy.placas, 2);
  assert.equal(legacy.plan?.length, 2);
}

// Beam: deterministic work cap must stop by expansions, not by the legacy clock.
{
  const telemetry = step0();
  const plan = Motor.optimizar([
    { ref:'A', detalle:'A', cant:2, base:60, altura:60, veta:false },
  ], {
    placaBase:100,
    placaAltura:100,
    refiladoX:0,
    refiladoY:0,
    sierra:0,
    etapas:2,
    materialConVeta:false,
    descontarCanto:false,
    cantoEspesor:0,
    restoMin:10,
    restoMax:20,
    ruido:0,
    pases:1,
    restartsPorPlaca:1,
    beamWidth:2,
    maxPiezasBeam:10,
    presupuestoBeamMs:1,
    maxExpansionesBeam:1,
    watchdogBeamMs:60_000,
    usarRescue:false,
    multiVariantes:false,
    _step0Telemetry:telemetry,
  });
  assert.equal(plan.resumen.placas, 2);
  assert.ok(telemetry.beam.calls >= 1);
  assert.equal(telemetry.beam.expansionsMax, 1);
  assert.ok(telemetry.beam.budgetHits >= 1);
  assert.equal(telemetry.beam.watchdogHits, 0);
}

// OneBoard: isolate the attempt controller from geometry. Four independent runs
// must consume exactly the configured deterministic work budget.
{
  const originalOptimizar = Motor.optimizar;
  const originalEmpacar = Motor.empacarPlaca;
  try {
    Motor.optimizar = () => ({
      placas:[{},{}],
      resumen:{ placas:2, piezas:1 },
      opts:{},
    });
    Motor.empacarPlaca = () => ({
      colocadas:[], cortes:[], restos:[], arbol:null, area:0, areaResto:0,
    });

    const attempts = [];
    for (let i=0; i<4; i++) {
      const telemetry = step0();
      const r = OneBoard.rescatarUnaPlaca([
        { ref:'A', detalle:'A', cant:1, base:100, altura:100, veta:false },
      ], {
        placaBase:1000,
        placaAltura:1000,
        refiladoX:0,
        refiladoY:0,
        sierra:0,
        etapas:2,
        materialConVeta:false,
        descontarCanto:false,
        cantoEspesor:0,
        restoMin:10,
        restoMax:20,
        semillasRescate:6,
        msRescate:1,
        maxIntentosRescate:3,
        watchdogRescateMs:60_000,
        _step0Telemetry:telemetry,
      });
      attempts.push(r.intentos);
      assert.equal(telemetry.oneboard.budgetHits, 1);
      assert.equal(telemetry.oneboard.watchdogHits, 0);
    }
    assert.deepEqual(attempts, [3,3,3,3]);
  } finally {
    Motor.optimizar = originalOptimizar;
    Motor.empacarPlaca = originalEmpacar;
  }
}

console.log('kernel determinism smoke: PASS');
