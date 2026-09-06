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

function nuevasMetricas() {
  const m = () => ({ activaciones: 0, ganancias: 0, placasAhorradas: 0,
                     invalidos: 0, ms: 0, peorMs: 0 });
  return {
    oneboard: m(), master: m(), multislice: m(), compactacion: m(),
    lowerBound: {
      externalUsed: 0,
      externalViolation: 0,
      certifiedAfterBaseline: 0,
      cheapRuns: 0,
      cheapCertified: 0,
      cheapViolation: 0,
      cheapErrors: 0,
      cheapMs: 0,
      cheapValue: 0,
      cheapReason: null,
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
  return envFlag('OPTIMIZER_V10_STAGED_EXPERIMENTAL') &&
         envFlag('OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL');
}

function calcularCotaBarataPostBaseline(lineas, config, baseline, metricas) {
  const t0 = process.hrtime.bigint();
  metricas.lowerBound.cheapRuns++;
  try {
    // Require dinamico: el legacy productivo no carga codigo experimental salvo
    // que el flag V20 este activado explicitamente.
    const { computeHybridLowerBound } = require('../experimental/hybrid-lower-bound.cjs');
    const r = computeHybridLowerBound(
      lineas,
      baseline?.opts || config,
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

  // Primer corte: si area/external LB ya certifican, ni siquiera calculamos la
  // cheap LB. Esto cubre los casos baratos baseline == areaLB.
  if (
    certificarTemprano &&
    baseline?.resumen &&
    baseline.resumen.placas <= cota
  ) {
    metricas.lowerBound.certifiedAfterBaseline++;
    metricas.total.ms += Date.now() - t0;
    return { plan: baseline, metricas, cota, cotaArea };
  }

  // V20 experimental: sólo para los que NO cerraron por área. Calcula la misma
  // Hybrid Cheap LB validada en V15-V19, explícitamente sin Raster. Si iguala
  // al incumbente físico, el número de placas queda certificado y cortamos
  // compactación + MultiSlice + OneBoard + Master.
  if (usarCheap && baseline?.resumen) {
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
      metricas.total.ms += Date.now() - t0;
      return { plan: baseline, metricas, cota, cotaArea };
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

  // ---- si ya esta en la cota, ningun rescate de PLACAS puede aportar
  if (mejor.resumen.placas <= cota) {
    metricas.total.ms += Date.now() - t0;
    return { plan: mejor, metricas, cota, cotaArea };
  }

  // ---- multi-rebanada: plan alternativo completo
  if (config.usarMultiSlice !== false) {
    const t = Date.now();
    const alt = planMultiSlice(lineas, config);
    if (alt) probar('multislice', alt, Date.now() - t);
  }

  // ---- rescate de una placa: solo cuando por area todo podria entrar en una
  if (config.usarOneBoard !== false && cotaArea === 1 && mejor.resumen.placas > 1) {
    const t = Date.now();
    const res = rescatarUnaPlaca(lineas, config);
    if (res.exito) probar('oneboard', res.plan, Date.now() - t);
    else registrar(metricas.oneboard, Date.now() - t, false, 0, false);
  }

  // ---- pattern master: generar pool, resolver cobertura, materializar
  if (config.usarMaster !== false && mejor.resumen.placas > cota) {
    const t = Date.now();
    try {
      const pool = generarPatrones(lineas, config, config.rondasPatrones || 40)
        .concat(patronesMonotipo(lineas, config));
      const s = resolverCobertura(pool, lineas.map(l => l.cant), areaPlaca,
                                  mejor.resumen.placas, config.msMaster || 8000);
      const sol = s ? s.resolver(lineas.map(l => l.base * l.altura)) : null;
      const cand = sol && sol.plan ? materializar(sol.plan, lineas, baseline.opts) : null;
      if (cand) probar('master', cand, Date.now() - t);
      else registrar(metricas.master, Date.now() - t, false,0,false);
    } catch (e) {
      registrar(metricas.master, Date.now() - t, false, 0, false);
    }
  }

  metricas.total.ms += Date.now() - t0;
  return { plan: mejor, metricas, cota, cotaArea };
}

module.exports = { optimizarV10, nuevasMetricas, validarPlanIndustrial };