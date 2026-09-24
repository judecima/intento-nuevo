// Generated mechanically from Optimizador_V10_Interactivo_Modos_Validacion_XML_Lepton.html.
// Do not edit these legacy files by hand; update the extractor if the source changes.
"use strict";

/* V10-experimental: capa de rescate sobre V8, que queda congelado.
   ==================================================================
   V8 produce el baseline y nunca se toca. Cada rescate propone un candidato
   FISICO que debe pasar el validador industrial V3 y usar menos placas para
   reemplazarlo. Cualquier otra cosa conserva V8.

   Por eso esta capa no puede degradar nada: en el peor caso cuesta tiempo.

   Los contadores por modulo se llevan desde la primera corrida. Medirlos
   despues obliga a repetir un benchmark que tarda horas. */
const { optimizar, compararCalidad, calidadPlanPlacas } = require('./motor.cjs');
const { generarPatrones, patronesMonotipo } = require('./patrones.cjs');
const { resolverCobertura } = require('./cobertura.cjs');
const { materializar, aceptar } = require('./materializar.cjs');
const { rescatarUnaPlaca } = require('./oneboard.cjs');
const { validarPlanIndustrial } = require('./validador_industrial_v3.cjs');

function nuevaTelemetriaStep0(){
  return {
    beam:{calls:0,expansionsTotal:0,expansionsMax:0,wallMsTotal:0,wallMsMax:0,timeoutHits:0,budgetHits:0,watchdogHits:0},
    master:{runs:0,nodesTotal:0,nodesMax:0,wallMsTotal:0,wallMsMax:0,timeoutHits:0,budgetHits:0,watchdogHits:0},
    oneboard:{runs:0,attemptsTotal:0,attemptsMax:0,wallMsTotal:0,wallMsMax:0,timeoutHits:0,budgetHits:0,watchdogHits:0},
    composition:{optimizarCalls:0,armarPlacasCalls:0,stageCalls:0},
  };
}

function nuevasMetricas() {
  const m = () => ({ activaciones: 0, ganancias: 0, placasAhorradas: 0,
                     invalidos: 0, ms: 0, peorMs: 0 });
  return {
    oneboard: m(), master: m(), multislice: m(), compactacion: m(),
    lowerBound: {
      externalUsed: 0,
      externalViolation: 0,
      certifiedAfterBaseline: 0,
      certifiedAfterCompactation: 0,
      postCompactRuns: 0,
      postCompactCertified: 0,
      postCompactViolation: 0,
      postCompactErrors: 0,
      postCompactMs: 0,
      postCompactValue: 0,
      postCompactReason: null,
      cheapRuns: 0,
      cheapCertified: 0,
      cheapViolation: 0,
      cheapErrors: 0,
      cheapMs: 0,
      cheapValue: 0,
      cheapReason: null,
    },
    remnantPolish: {
      runs: 0,
      valid: 0,
      changed: 0,
      attemptedBoards: 0,
      improvedBoards: 0,
      rejectedBoards: 0,
      invalidFinal: 0,
      errors: 0,
      skipped: 0,
      ms: 0,
    },
    effortController: {
      mode: "fixed",
      enteredMaster: false,
      preMasterBoards: null,
      safeLowerBound: null,
      roundsExecuted: 0,
      blocks: [],
      stopReason: null,
      finalBoards: null,
      generationCpuMs: 0,
    },
    total: { casos: 0, ms: 0 }
  };
}

function registrar(m, ms, gano, ahorro, invalido) {
  m.activaciones++; m.ms += ms; m.peorMs = Math.max(m.peorMs, ms);
  if (gano) { m.ganancias++; m.placasAhorradas += ahorro; }
  if (invalido) m.invalidos++;
}

function envFlag(name) {
  return /^(1|true|yes|on)$/i.test(String(process.env[name] || ''));
}

function usarCotaBarataPostBaseline(config) {
  if (config.usarCotaBarataAntesCompactacion === true) return true;
  // El flag V20 es independiente del pipeline staged para poder hacer un A/B
  // contra el V10 legacy cambiando una sola variable.
  return envFlag('OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL');
}

function usarCotaBarataPostCompactacion(config) {
  if (config.usarCotaBarataPostCompactacion === true) return true;
  return envFlag('OPTIMIZER_POST_COMPACT_CHEAP_LB_EXPERIMENTAL');
}

function usarDffFs0PostCompactacion(config) {
  if (config.usarDffFs0PostCompactacion === true) return true;
  return envFlag('OPTIMIZER_DFF_FS0_LB_EXPERIMENTAL');
}

function calcularCotaBarataPostCompactacion(lineas, config, incumbente, metricas) {
  const t0 = process.hrtime.bigint();
  const m = metricas.lowerBound;
  m.postCompactRuns++;
  try {
    const optsLB = incumbente?.opts || config;
    const trimValido = (v) => v !== null && v !== '' && Number.isFinite(+v);
    if (!trimValido(optsLB?.refiladoX) || !trimValido(optsLB?.refiladoY)) {
      m.postCompactErrors++;
      m.postCompactReason = 'invalid-trim';
      return 0;
    }

    const { computeHybridLowerBound } = require('../experimental/hybrid-lower-bound.cjs');
    const r = computeHybridLowerBound(
      lineas,
      optsLB,
      incumbente?.resumen?.placas,
      {
        useRaster: false,
        claude: {
          usarRaster: false,
          usarDffFs0: usarDffFs0PostCompactacion(config),
        },
      },
    );
    const value = Math.max(0, Math.floor(Number(r?.cheapLowerBound ?? r?.lowerBound ?? 0)));
    m.postCompactValue = value;
    m.postCompactReason = r?.reason || null;
    return value;
  } catch (_) {
    m.postCompactErrors++;
    return 0;
  } finally {
    m.postCompactMs += Number(process.hrtime.bigint() - t0) / 1e6;
  }
}

function intentarPolishV20(plan, config, piezasEsperadas, metricas, options = {}) {
  const m = metricas.remnantPolish;
  const t0 = process.hrtime.bigint();
  m.runs++;
  try {
    // Explicit false is a rollback switch. Safety means falling through to the
    // legacy compactation path, never returning early without objective #2.
    if (config.usarDefragRemanentePorPlaca === false) {
      m.skipped++;
      return { valido: false, plan };
    }
    const { defragmentarPlanPorPlaca } = require('../experimental/per-board-remnant-defrag.cjs');
    const r = defragmentarPlanPorPlaca(plan, { piezasEsperadas, ...options });
    m.attemptedBoards += +r.attemptedBoards || 0;
    m.improvedBoards += +r.improvedBoards || 0;
    m.rejectedBoards += +r.rejectedBoards || 0;
    if (r.invalidFinal) {
      m.invalidFinal++;
      return { valido: false, plan };
    }
    const v = validarPlanIndustrial(r.plan, piezasEsperadas);
    if (!v || !v.ok) {
      m.invalidFinal++;
      return { valido: false, plan };
    }
    m.valid++;
    if (r.changed) m.changed++;
    return { valido: true, plan: r.plan };
  } catch (_) {
    m.errors++;
    return { valido: false, plan };
  } finally {
    m.ms += Number(process.hrtime.bigint() - t0) / 1e6;
  }
}

function calcularCotaBarataPostBaseline(lineas, config, baseline, metricas) {
  const t0 = process.hrtime.bigint();
  metricas.lowerBound.cheapRuns++;
  try {
    const optsLB = baseline?.opts || config;
    const trimValido = (v) => v !== null && v !== '' && Number.isFinite(+v);
    if (!trimValido(optsLB?.refiladoX) || !trimValido(optsLB?.refiladoY)) {
      metricas.lowerBound.cheapErrors++;
      metricas.lowerBound.cheapReason = 'invalid-trim';
      return 0;
    }

    // Require dinamico: el legacy productivo no carga codigo experimental salvo
    // que el flag V20 este activado explicitamente.
    const { computeHybridLowerBound } = require('../experimental/hybrid-lower-bound.cjs');
    const r = computeHybridLowerBound(
      lineas,
      optsLB,
      baseline?.resumen?.placas,
      {
        useRaster: false,
        claude: { usarRaster: false },
      },
    );
    const value = Math.max(0, Math.floor(Number(r?.cheapLowerBound ?? r?.lowerBound ?? 0)));
    metricas.lowerBound.cheapValue = value;
    metricas.lowerBound.cheapReason = r?.reason || null;
    return value;
  } catch (_) {
    metricas.lowerBound.cheapErrors++;
    return 0;
  } finally {
    metricas.lowerBound.cheapMs += Number(process.hrtime.bigint() - t0) / 1e6;
  }
}

/* Multi-rebanada como PLAN ALTERNATIVO completo, nunca mezclada dentro del
   selector: medimos que mezclar candidatos empeora 6 de 14 casos. */
function planMultiSlice(lineas, O) {
  try { return optimizar(lineas, { ...O, multiVariantes: true }); }
  catch (e) { return null; }
}

/* Detecta de forma barata si existe al menos una relación dimensional con
   riesgo de generar una franja muerta. Es sólo una compuerta de CPU: la
   aceptación final sigue dependiendo del plan completo + validador. */
function hayRiesgoFranjaMuerta(lineas, O){
  const saw=+O.sierra||0;
  const restoMin=+O.restoMin||0;
  if(!(restoMin>Math.max(saw,10))) return false;

  const ors=[];
  for(const l of lineas){
    const base=+l.base, altura=+l.altura;
    const area=base*altura;
    ors.push({a:base,b:altura,area});
    if(!(O.materialConVeta && l.veta) && Math.abs(base-altura)>1e-9)
      ors.push({a:altura,b:base,area});
  }

  for(const u of ors) for(const v of ors){
    if(v.area<=u.area*1.05) continue;
    const resid=u.a-v.a-saw;
    if(resid>Math.max(saw,10) && resid<restoMin) return true;
  }
  return false;
}

function detectarDeltasEstructurales(lineas,O){
  const restoMin=+O.restoMin||60;
  const saw=+O.sierra||0;
  const candidatos=[];

  // Trabajamos sobre orientaciones posibles, pero agrupamos por dimensión
  // perpendicular similar. Eso evita relacionar medidas que nunca compartirían
  // una misma rebanada.
  for(let i=0;i<lineas.length;i++){
    const li=lineas[i];
    const oriI=[{a:+li.base,b:+li.altura}];
    if(!(O.materialConVeta && li.veta) && Math.abs(+li.base-(+li.altura))>1e-9)
      oriI.push({a:+li.altura,b:+li.base});

    for(let j=i+1;j<lineas.length;j++){
      const lj=lineas[j];
      const oriJ=[{a:+lj.base,b:+lj.altura}];
      if(!(O.materialConVeta && lj.veta) && Math.abs(+lj.base-(+lj.altura))>1e-9)
        oriJ.push({a:+lj.altura,b:+lj.base});

      for(const oi of oriI) for(const oj of oriJ){
        // Sólo relaciones razonables dentro de la misma "familia de altura".
        // Toleramos hasta un kerf para no perder parejas por pequeñas diferencias.
        if(Math.abs(oi.b-oj.b)>Math.max(1,saw+0.5)) continue;

        const delta=Math.abs(oi.a-oj.a);
        if(delta<=Math.max(10,saw) || delta>=restoMin) continue;

        candidatos.push(delta);
      }
    }
  }

  // Agrupación por décima de mm. Un delta debe repetirse al menos dos veces
  // para considerarse señal estructural del pedido.
  const cnt=new Map();
  for(const d of candidatos){
    const k=Math.round(d*10)/10;
    cnt.set(k,(cnt.get(k)||0)+1);
  }

  return [...cnt.entries()]
    .filter(([,n])=>n>=2)
    .map(([delta,n])=>({delta,n}))
    .sort((a,b)=>b.n-a.n || a.delta-b.delta);
}

function planCompactacionFranjas(lineas,O){
  try{
    const deltasEstructurales=detectarDeltasEstructurales(lineas,O);
    const r=optimizar(lineas,{
      ...O,
      multiVariantes:false,
      penalizarFranjaMuerta:true,
      deltasEstructurales
    });
    if(r){
      r._deltasEstructurales=deltasEstructurales;
      if(r.resumen) r.resumen.deltasEstructurales=deltasEstructurales;
    }
    return r;
  }catch(e){ return null; }
}

function areaRemanenteComercial(plan){
  const O=plan&&plan.opts||{};
  const min=+O.restoMin||0, max=+O.restoMax||0;
  let area=0;
  for(const p of (plan&&plan.placas)||[])
    for(const r of p.restos||[])
      if(Math.min(r.w,r.h)>=min && Math.max(r.w,r.h)>=max)
        area+=r.w*r.h;
  return area;
}
function calidadRemanentePlan(plan){
  const O=plan&&plan.opts||{};
  return calidadPlanPlacas((plan&&plan.placas)||[],O);
}
function mejorRemanentePlan(candidato,base){
  return compararCalidad(calidadRemanentePlan(candidato),calidadRemanentePlan(base))>0;
}

function optimizarV10(lineas, config, metricas = nuevasMetricas()) {
  const t0 = Date.now();
  if(config.instrumentarStep0===true){
    const telemetry=config._step0Telemetry||nuevaTelemetriaStep0();
    config={...config,_step0Telemetry:telemetry};
    metricas.step0=telemetry;
  }
  const piezasEsperadas = lineas.reduce((s, l) => s + l.cant, 0);
  const areaTotal = lineas.reduce((s, l) => s + l.cant * l.base * l.altura, 0);
  const areaPlaca = (config.placaBase - (config.refiladoX || 0)) *
                    (config.placaAltura - (config.refiladoY || 0));
  const cotaArea = Math.ceil(areaTotal / areaPlaca - 1e-9);
  let cota = cotaArea;

  // ---- baseline V8, congelado
  const baseline = optimizar(lineas, { ...config, multiVariantes: false });
  let mejor = baseline;
  metricas.total.casos++;

  // Cota externa opcional. Sólo se acepta si no supera al incumbente físico ya
  // construido. Si lo supera, hay una violación de seguridad y se ignora.
  const externaRaw = Number(config.cotaInferiorExterna);
  if (Number.isFinite(externaRaw) && externaRaw > 0) {
    const externa = Math.floor(externaRaw);
    if (baseline?.resumen && externa <= baseline.resumen.placas) {
      cota = Math.max(cota, externa);
      metricas.lowerBound.externalUsed++;
    } else {
      metricas.lowerBound.externalViolation++;
    }
  }

  const usarCheap = usarCotaBarataPostBaseline(config);
  const certificarTemprano = config.certificarAntesCompactacion === true || usarCheap;
  const certificadoInicial = !!(
    certificarTemprano &&
    baseline?.resumen &&
    baseline.resumen.placas <= cota
  );
  let polishCertificado = null;
  const obtenerPolishCertificado = () => {
    if (polishCertificado === null)
      polishCertificado = intentarPolishV20(baseline, config, piezasEsperadas, metricas);
    return polishCertificado;
  };

  // Primer corte: fuera de V20 conserva exactamente el retorno histórico.
  // Con V20, una certificación de placas no puede saltarse silenciosamente el
  // objetivo #2: primero se ejecuta el polish por placa; si falla, continuamos
  // hacia compactación legacy en lugar de devolver el baseline.
  if (certificadoInicial) {
    metricas.lowerBound.certifiedAfterBaseline++;
    if (!usarCheap) {
      metricas.total.ms += Date.now() - t0;
      return { plan: baseline, metricas, cota, cotaArea };
    }
    const polished = obtenerPolishCertificado();
    if (polished.valido) {
      metricas.total.ms += Date.now() - t0;
      return { plan: polished.plan, metricas, cota, cotaArea };
    }
  }

  // V20 experimental: sólo para los que NO cerraron por área. Calcula la misma
  // Hybrid Cheap LB validada en V15-V19, explícitamente sin Raster. Si iguala
  // al incumbente físico, el número de placas queda certificado. El fast return
  // sólo se permite después de un polish válido; de lo contrario cae al camino
  // legacy de compactación.
  if (usarCheap && baseline?.resumen && !certificadoInicial) {
    const cheap = calcularCotaBarataPostBaseline(lineas, config, baseline, metricas);
    if (cheap > 0) {
      if (cheap <= baseline.resumen.placas) {
        cota = Math.max(cota, cheap);
      } else {
        // Una cota inferior no puede superar una solución física factible.
        // No se usa: queda registrada para detectar cualquier bug de la cota.
        metricas.lowerBound.cheapViolation++;
      }
    }

    if (baseline.resumen.placas <= cota) {
      metricas.lowerBound.cheapCertified++;
      metricas.lowerBound.certifiedAfterBaseline++;
      const polished = obtenerPolishCertificado();
      if (polished.valido) {
        metricas.total.ms += Date.now() - t0;
        return { plan: polished.plan, metricas, cota, cotaArea };
      }
    }
  }

  const probar = (mod, candidato, ms, permitirMismas=false) => {
    let r;

    if(
      permitirMismas &&
      candidato &&
      candidato.resumen &&
      mejor.resumen &&
      candidato.resumen.placas===mejor.resumen.placas
    ){
      const v=validarPlanIndustrial(candidato,piezasEsperadas);
      const gana=v.ok && mejorRemanentePlan(candidato,mejor);

      r=gana
        ? {aceptado:true,plan:candidato,motivo:'mismas placas + remanente mas grande/continuo'}
        : {aceptado:false,plan:mejor,motivo:v.ok?'sin mejora de remanente':'candidato invalido'};
    }else{
      r=aceptar(mejor,candidato,piezasEsperadas,validarPlanIndustrial);
    }

    const ahorro=r.aceptado
      ? Math.max(0,mejor.resumen.placas-candidato.resumen.placas)
      : 0;

    registrar(
      metricas[mod],ms,r.aceptado,ahorro,
      !r.aceptado && /invalido/.test(r.motivo)
    );

    if(r.aceptado) mejor=r.plan;
    return r;
  };

  // ---- compactación de franjas muertas.
  // Se corre antes del retorno por cota porque también puede mejorar la
  // calidad del remanente manteniendo exactamente la misma cantidad de placas.
  const nPiezas=lineas.reduce((s,l)=>s+(+l.cant||0),0);
  if(
    config.usarCompactacion!==false &&
    nPiezas<=120 &&
    lineas.length<=40 &&
    hayRiesgoFranjaMuerta(lineas,config)
  ){
    const t=Date.now();
    const alt=planCompactacionFranjas(lineas,config);
    if(alt){
      if(alt.resumen) alt.resumen.origen='compactacion-franjas';
      probar('compactacion',alt,Date.now()-t,true);
    }else{
      registrar(metricas.compactacion,Date.now()-t,false,0,false);
    }
  }

  // ---- polish local de remanente para pedidos que quedaron fuera de la
  // compactacion global por tamaño/variedad. A esta altura la cantidad de
  // placas ya esta certificada: cada placa se repaca de forma independiente,
  // nunca se mueven piezas entre placas y el plan completo se revalida.
  if (
    config.usarPolishRemanentePorPlacaV2 === true &&
    mejor.resumen.placas <= cota &&
    (lineas.length > 40 || nPiezas > 120)
  ) {
    const polished = intentarPolishV20(
      mejor,
      { ...config, usarDefragRemanentePorPlaca: true },
      piezasEsperadas,
      metricas,
      {
        multiVariantes: true,
        maxBoards: Number(config.polishRemanenteMaxPlacas) || 2,
        requireRelocationOpportunity: true,
        useStructuralDeltas: false,
        seedOffsets: [0],
        seedBaseOffset: 900000,
      },
    );
    if (
      polished.valido &&
      polished.plan &&
      polished.plan.resumen &&
      polished.plan.resumen.placas === mejor.resumen.placas &&
      mejorRemanentePlan(polished.plan, mejor)
    ) {
      mejor = polished.plan;
    }
  }

  // ---- si ya esta en la cota, ningun rescate de PLACAS puede aportar
  if (mejor.resumen.placas <= cota) {
    metricas.total.ms += Date.now() - t0;
    return { plan: mejor, metricas, cota, cotaArea };
  }

  // ---- cota barata DESPUES de compactacion.
  // A esta altura el unico modulo que acepta mejoras de remanente con igual
  // numero de placas ya corrio. MultiSlice, OneBoard y Master solo reemplazan
  // el incumbente si reducen placas. Por eso, si una cota inferior valida
  // alcanza al incumbente fisico post-compactacion, las etapas posteriores no
  // pueden mejorar el objetivo primario y se pueden omitir sin perder el
  // remanente que compactacion ya haya mejorado.
  if (usarCotaBarataPostCompactacion(config) && mejor?.resumen) {
    const cheapPostCompact = calcularCotaBarataPostCompactacion(lineas, config, mejor, metricas);
    if (cheapPostCompact > 0) {
      if (cheapPostCompact <= mejor.resumen.placas) {
        cota = Math.max(cota, cheapPostCompact);
      } else {
        // Nunca usar una cota que contradiga el incumbente fisico factible.
        metricas.lowerBound.postCompactViolation++;
      }
    }

    if (mejor.resumen.placas <= cota) {
      metricas.lowerBound.postCompactCertified++;
      metricas.lowerBound.certifiedAfterCompactation++;
      metricas.total.ms += Date.now() - t0;
      return { plan: mejor, metricas, cota, cotaArea };
    }
  }

  // ---- multi-rebanada: plan alternativo completo
  // Experimental conservative gate: skip MultiSlice only below a caller-supplied
  // piece-count threshold. Default remains 0, preserving historical behavior.
  const minPiezasMultiSliceRaw = Number(config.minPiezasMultiSliceExperimental);
  const minPiezasMultiSlice = Number.isFinite(minPiezasMultiSliceRaw) && minPiezasMultiSliceRaw > 0
    ? Math.floor(minPiezasMultiSliceRaw)
    : 0;
  const maxPiezasMultiSliceRaw = Number(config.maxPiezasMultiSliceExperimental);
  const maxPiezasMultiSlice = Number.isFinite(maxPiezasMultiSliceRaw) && maxPiezasMultiSliceRaw > 0
    ? Math.floor(maxPiezasMultiSliceRaw)
    : Number.POSITIVE_INFINITY;
  if (
    config.usarMultiSlice !== false &&
    piezasEsperadas >= minPiezasMultiSlice &&
    piezasEsperadas <= maxPiezasMultiSlice
  ) {
    const t = Date.now();
    const alt = planMultiSlice(lineas, config);
    if (alt) probar('multislice', alt, Date.now() - t);
  }

  // ---- rescate de una placa: solo cuando por area todo podria entrar en una
  if (config.usarOneBoard !== false && cotaArea === 1 && mejor.resumen.placas > 1) {
    const t = Date.now();
    // El baseline de V10 es equivalente al baseline interno de OneBoard salvo
    // que un caller fuerce multiVariantes=true. En ese caso conservamos el
    // recalculo historico para no cambiar semantica fuera del flujo productivo.
    const baselineOneBoard = config.multiVariantes === true ? null : baseline;
    const res = rescatarUnaPlaca(lineas, config, baselineOneBoard);
    if (res.exito) probar('oneboard', res.plan, Date.now() - t);
    else registrar(metricas.oneboard, Date.now() - t, false, 0, false);
  }

  // ---- pattern master: generar pool, resolver cobertura, materializar
  if (config.usarMaster !== false && mejor.resumen.placas > cota) {
    const t = Date.now();
    try {
      const configuredMasterRounds = config.rondasPatrones || 40;
      const highTypesP3Experimental =
        config.masterHighTypesP3Experimental === true ||
        process.env.OPTIMIZER_MASTER_HIGH_TYPES_P3_EXPERIMENTAL === '1';
      const industrialRulesV3Experimental =
        config.masterIndustrialRulesV3Experimental === true ||
        process.env.OPTIMIZER_MASTER_INDUSTRIAL_RULES_V3_EXPERIMENTAL === '1';
      const typeCount = lineas.length;
      const piecesPerType = typeCount > 0 ? piezasEsperadas / typeCount : 0;
      const forceFull40 = config.masterForceFull40 === true;
      const highTypesP3 =
        !forceFull40 &&
        (highTypesP3Experimental || industrialRulesV3Experimental) &&
        typeCount > 40;
      // P3-B (20-40 types with >=4 pieces/type) was retired after the
      // sealed full-runtime validation found a real board-count regression:
      // case 5431340 produced 39 boards in Auto/P3-B versus 38 in both V1 and
      // Advanced/Full40. Keep only the independently safer high-type P3-A gate
      // while the full holdout is re-certified.
      const industrialP3 = highTypesP3;
      const masterRounds =
        industrialP3
          ? Math.min(3, configuredMasterRounds)
          : configuredMasterRounds;

      const autoEnabled =
        config.autoEffortController === true &&
        industrialRulesV3Experimental &&
        configuredMasterRounds === 40;

      metricas.effortController.mode = autoEnabled
        ? "auto"
        : forceFull40
          ? "advanced"
          : "fixed";
      metricas.effortController.enteredMaster = true;
      metricas.effortController.preMasterBoards = mejor.resumen.placas;
      metricas.effortController.safeLowerBound = cota;

      if (autoEnabled) {
        const { createIncrementalRustMasterGenerator } = require('./rust/incremental-master.cjs');
        const incremental = createIncrementalRustMasterGenerator(lineas, config, configuredMasterRounds, 7);
        const mono = patronesMonotipo(lineas, config);
        const preMasterBoards = mejor.resumen.placas;
        const blocks = industrialP3
          ? [Array.from({ length: Math.min(3, configuredMasterRounds) }, (_, i) => i)]
          : [
              Array.from({ length: 16 }, (_, i) => i),
              Array.from({ length: Math.max(0, configuredMasterRounds - 16) }, (_, i) => i + 16),
            ];

        let previousGenerationCpuMs = 0;
        for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
          const rounds = blocks[blockIndex].filter(r => r < configuredMasterRounds);
          if (!rounds.length) continue;

          const tb = Date.now();
          const exec = incremental.execute(rounds);
          const generationCpuMs = incremental.generationCpuMs;
          const generationDeltaCpuMs = Math.max(0, generationCpuMs - previousGenerationCpuMs);
          previousGenerationCpuMs = generationCpuMs;

          // Auto has only two Master checkpoints:
          //   P16 = tiny feasibility probe against safeLB
          //   P40 = exact/reference solve over the complete generated pool
          // The certified 50-case Master cohort produced every early closure
          // at structural rescue or P16; none closed at 20/24/28/32/36.
          // Intermediate solves also cannot improve the final P40 search bound:
          // the final solver deliberately uses preMasterBoards. Therefore the
          // remaining rounds are generated in one cumulative batch and solved
          // once, preserving Full40 quality while removing redundant work.
          const isFirstCheckpoint = blockIndex === 0;
          const isFinalCheckpoint = blockIndex === blocks.length - 1;
          const structuralShortCircuit = incremental.structuralShortCircuit === true;
          const shouldSolve =
            isFirstCheckpoint ||
            isFinalCheckpoint ||
            industrialP3 ||
            structuralShortCircuit;

          let pool = null;
          let sol = null;
          let cand = null;
          if (shouldSolve) {
            const masterPatterns = incremental.patterns();
            pool = masterPatterns.concat(mono);
            const fullNodeCapRaw = Number(config.maxNodosMaster);
            const fullNodeCap =
              Number.isFinite(fullNodeCapRaw) && fullNodeCapRaw > 0
                ? Math.floor(fullNodeCapRaw)
                : null;
            const checkpointNodeCapRaw = Number(config.autoCheckpointMaxNodes);
            const checkpointNodeCap =
              Number.isFinite(checkpointNodeCapRaw) && checkpointNodeCapRaw > 0
                ? Math.floor(checkpointNodeCapRaw)
                : 128;
            const solveNodeCap = isFinalCheckpoint
              ? fullNodeCap
              : fullNodeCap === null
                ? checkpointNodeCap
                : Math.min(fullNodeCap, checkpointNodeCap);
            const s = resolverCobertura(
              pool,
              lineas.map(l => l.cant),
              areaPlaca,
              preMasterBoards,
              config.msMaster || 8000,
              {
                telemetry: config._step0Telemetry || null,
                maxNodos: solveNodeCap,
                watchdogMs: config.watchdogMasterMs,
                targetBoards: isFinalCheckpoint ? null : cota
              }
            );
            sol = s ? s.resolver(lineas.map(l => l.base * l.altura)) : null;
            cand = sol && sol.plan ? materializar(sol.plan, lineas, baseline.opts) : null;
          }

          const blockMs = Date.now() - tb;
          if (shouldSolve) {
            if (cand) probar('master', cand, blockMs, true);
            else registrar(metricas.master, blockMs, false, 0, false);
          } else {
            // Preserve generation cost in the controller telemetry without
            // pretending an additional Master solve/activation occurred.
            metricas.master.ms += blockMs;
            metricas.master.peorMs = Math.max(metricas.master.peorMs, blockMs);
          }

          const executedRounds = incremental.executedRounds();
          metricas.effortController.roundsExecuted = executedRounds.length;
          metricas.effortController.generationCpuMs = generationCpuMs;
          metricas.effortController.blocks.push({
            blockIndex,
            requestedRounds: rounds,
            newlyExecuted: exec?.newlyExecuted || [],
            executedRounds: executedRounds.length,
            solved: shouldSolve,
            poolSize: pool?.length ?? null,
            candidateCount: incremental.candidateCount,
            generationDeltaCpuMs,
            generationCpuMs,
            solverNodes: sol?.nodos || 0,
            solverExhausted: !!sol?.agotado,
            solverTargetReached: !!sol?.targetReached,
            solverNodeCap: shouldSolve
              ? (isFinalCheckpoint
                  ? (Number.isFinite(Number(config.maxNodosMaster)) ? Number(config.maxNodosMaster) : null)
                  : (Number.isFinite(Number(config.autoCheckpointMaxNodes))
                      ? Number(config.autoCheckpointMaxNodes)
                      : 128))
              : null,
            candidateBoards: cand?.resumen?.placas ?? null,
            incumbentBoards: mejor?.resumen?.placas ?? null,
            safeLowerBound: cota,
            wallMs: blockMs,
            structuralShortCircuit,
          });

          if (mejor?.resumen?.placas <= cota) {
            metricas.effortController.stopReason =
              structuralShortCircuit
                ? "structural-safe-lb"
                : "safe-lb";
            break;
          }

          // A/B are already externally certified P3 rules. Auto must not
          // spend Full40 after those rules decide the Master budget.
          if (industrialP3) {
            metricas.effortController.stopReason = "certified-industrial-p3";
            break;
          }
        }

        if (!metricas.effortController.stopReason) {
          metricas.effortController.stopReason =
            metricas.effortController.roundsExecuted >= configuredMasterRounds
              ? "advanced-exhausted"
              : "schedule-exhausted";
        }
        metricas.effortController.finalBoards = mejor?.resumen?.placas ?? null;
      } else {
        let masterPatterns;
        if (industrialRulesV3Experimental && configuredMasterRounds === 40) {
          const { createIncrementalRustMasterGenerator } = require('./rust/incremental-master.cjs');
          const incremental = createIncrementalRustMasterGenerator(lineas, config, configuredMasterRounds, 7);
          const rounds = Array.from({ length: masterRounds }, (_, i) => i);
          incremental.execute(rounds);
          masterPatterns = incremental.patterns(rounds);
          metricas.effortController.roundsExecuted = incremental.executedRounds().length;
          metricas.effortController.generationCpuMs = incremental.generationCpuMs;
        } else {
          masterPatterns = generarPatrones(lineas, config, masterRounds);
          metricas.effortController.roundsExecuted = masterRounds;
        }
        const pool = masterPatterns.concat(patronesMonotipo(lineas, config));
        const s = resolverCobertura(pool, lineas.map(l => l.cant), areaPlaca,
                                    mejor.resumen.placas, config.msMaster || 8000,
                                    { telemetry: config._step0Telemetry || null,
                                      maxNodos: config.maxNodosMaster,
                                      watchdogMs: config.watchdogMasterMs });
        const sol = s ? s.resolver(lineas.map(l => l.base * l.altura)) : null;
        const cand = sol && sol.plan ? materializar(sol.plan, lineas, baseline.opts) : null;
        if (cand) probar('master', cand, Date.now() - t);
        else registrar(metricas.master, Date.now() - t, false,0,false);
        metricas.effortController.stopReason = industrialP3 ? "certified-industrial-p3" : "fixed-budget";
        metricas.effortController.finalBoards = mejor?.resumen?.placas ?? null;
      }
    } catch (e) {
      metricas.effortController.stopReason = "master-error";
      registrar(metricas.master, Date.now() - t, false, 0, false);
    }
  }

  metricas.total.ms += Date.now() - t0;
  return { plan: mejor, metricas, cota, cotaArea };
}

module.exports = { optimizarV10, nuevasMetricas, nuevaTelemetriaStep0, validarPlanIndustrial };
