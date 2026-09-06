// Generated mechanically from Optimizador_V10_Interactivo_Modos_Validacion_XML_Lepton.html.
// Do not edit these legacy files by hand; update the extractor if the source changes.
"use strict";

/* ==========================================================================
   MOTOR DE OPTIMIZACIÓN
   Genera un árbol de cortes guillotina por etapas: cada corte atraviesa el
   bloque de lado a lado y la dirección alterna por nivel, que es como corta
   una seccionadora. Contempla veta, tapacantos, refilado y ancho de sierra.
   ========================================================================== */
const DIR_X='x', DIR_Y='y';
const ejeLargo = r => r.dir===DIR_X ? r.w : r.h;
const ejePerp  = r => r.dir===DIR_X ? r.h : r.w;

function medidaCorte(p, opts){
  let b=p.base, h=p.altura;
  if(opts.descontarCanto && p.cantos){
    const e=opts.cantoEspesor;
    b -= (p.cantos.izq?e:0)+(p.cantos.der?e:0);
    h -= (p.cantos.arr?e:0)+(p.cantos.aba?e:0);
  }
  return {base:b, altura:h};
}
function orientaciones(p, conVeta){
  const m=p._corte, base={base:m.base, altura:m.altura, rotada:false};
  if((conVeta && p.veta) || m.base===m.altura) return [base];
  return [base, {base:m.altura, altura:m.base, rotada:true}];
}
const dims = (o,dir) => dir===DIR_X ? [o.base,o.altura] : [o.altura,o.base];

/* Elige qué pieza define la próxima rebanada. El lado perpendicular ya quedó
   fijado por el corte anterior: lo que sobra ahí no se recupera. */
/* Compara dos encajes segun el criterio activo. Devuelve true si u es mejor. */
function mejorEncaje(u, v, criterio){
  if(criterio==='perp')  return u.sobra!==v.sobra ? u.sobra<v.sobra : (u.a!==v.a ? u.a>v.a : u.area>v.area);
  if(criterio==='area')  return u.area!==v.area ? u.area>v.area : u.sobra<v.sobra;
  if(criterio===='largo') return u.a!==v.a ? u.a>v.a : u.sobra<v.sobra;
  if(u.exacta!==v.exacta) return u.exacta<v.exacta;
  if(u.sobra!==v.sobra)  return u.sobra<v.sobra;
  return u.area>v.area;
}

/* Camino caliente del optimizador: se llama una vez por cada intento de corte.
   Recorre el pool en una sola pasada, sin ordenar ni crear objetos por pieza. */
/* Un generador propio por configuracion. Con un unico generador compartido,
   quitar o reordenar una estrategia corre el flujo de todas las siguientes:
   dos corridas que solo difieren en una config podada dejan de ser comparables
   y ninguna ablacion se puede medir. Derivando la semilla de la identidad de
   cada config, cada una recibe siempre los mismos numeros. */
function mezclar(...nums){
  let h=2166136261>>>0;
  for(const n of nums){
    h^=(n>>>0); h=Math.imul(h,16777619)>>>0;
    h^=h>>>13;  h=Math.imul(h,2654435761)>>>0;
  }
  return h>>>0;
}
function hashTexto(t){
  let h=2166136261>>>0;
  for(let i=0;i<t.length;i++){ h^=t.charCodeAt(i); h=Math.imul(h,16777619)>>0; }
  return h>>>0;
}
function rngDesde(semilla){
  let s=semilla>>>0;
  return ()=>{ s=(Math.imul(s,1664525)+1013904223)>>>0; return s/4294967296; };
}
const rngPara=(opts,pase,cfg,restart,placa)=>
  rngDesde(mezclar(opts.semilla, pase, cfg._id, restart, placa));

function elegir(pool, region, restante, perp, opts, rnd, nivel){
  const criterio = (opts.criterios && opts.criterios[Math.min((nivel-1), opts.criterios.length-1)]) || opts.criterio;
  const enX = region.dir===DIR_X;

  // pasada unica: cuenta por firma y guarda un representante de cada medida
  const cuenta=opts._cuenta; cuenta.clear();
  const reps=opts._reps; reps.length=0;
  for(let i=0;i<pool.length;i++){
    const p=pool[i], c=cuenta.get(p._sig);
    if(c===undefined){ cuenta.set(p._sig,1); p._pos=i; reps.push(p); }
    else cuenta.set(p._sig,c+1);
  }

  let m1=null,m2=null,m3=null;

  // Variante de compactación de franjas.
  // No modifica el V8 baseline: sólo se activa en una corrida alternativa.
  // Si una candidata ancha t haría que una pieza de MAYOR área, algo más
  // angosta, deje una franja residual menor que restoMin, la marcamos como
  // riesgosa. Ejemplo real: 622 (Tapas V1) conteniendo 578 (Superior/Inferior)
  // deja 622-578-4.5 = 39.5 mm de material muerto entre dos kerfs.
  const cmpCand=(u,v)=>{
    if(opts.penalizarFranjaMuerta && nivel<=2){
      const ru=u.riesgoFranja||0, rv=v.riesgoFranja||0;
      if((ru>0)!==(rv>0)) return ru===0;
      if(ru!==rv) return ru<rv;
    }
    return mejorEncaje(u,v,criterio);
  };

  const considerar=(cand)=>{
    if(!m1 || cmpCand(cand,m1)){ m3=m2; m2=m1; m1=cand; }
    else if(!m2 || cmpCand(cand,m2)){ m3=m2; m2=cand; }
    else if(!m3 || cmpCand(cand,m3)){ m3=cand; }
  };

  // medidas disponibles sobre el eje de avance, para la prueba de compatibilidad
  const medidas=opts._medidas; medidas.length=0;
  if(opts.multiRebanada && nivel<opts.etapas)
    for(const p of reps) for(const o of p._ors) medidas.push(enX?o.base:o.altura);

  for(let r=0;r<reps.length;r++){
    const p=reps[r], ors=p._ors, disp=cuenta.get(p._sig);
    for(let k=0;k<ors.length;k+){
      const o = ors[k];
      const a = enX ? o.base : o.altura;
      const b = enX ? o.altura : o.base;
      if(a>restante+1e-9 || b>perp+1e-9) continue;
      const sobra=perp-b;

      let riesgoFranja=0;
      if(opts.penalizarFranjaMuerta && nivel<=2){
        const areaCand=a*b;
        const deltas=Array.isArray(opts.deltasEstructurales)?opts.deltasEstructurales:[];

        for(let rr=0;rr<reps.length;rr++){
          const qp=reps[rr], qcnt=cuenta.get(qp._sig)||1;
          for(const qo of qp._ors){
            const d=enX?qo.base:qo.altura;
            const qb=enX?qo.altura:qo.base;

            if(qb>perp+1e-9 || d>=a-1e-9) continue;

            // Material real que quedaría dentro del padre: a-d.
            // El kerf queda entre bloques, no debe restarse de esta diferencia.
            const resid=a-d;
            if(resid<=Math.max(opts.sierra,10) || resid>=opts.restoMin) continue;

            const qa=d*qb;

            // Señal A: caso ya validado (Tapas V1 622 vs Superior/Inferior 578).
            // Una pieza de mayor área quedaría atrapada dentro de una rebanada
            // más ancha y dejaría una franja inútil.
            if(qa>areaCand*1.05)
              riesgoFranja=Math.max(riesgoFranja,resid*qa*qcnt);

            // Señal B: diferencia dimensional repetida en el pedido.
            // Ej. Placard: delta 36 mm aparece entre varias parejas techo/piso.
            // Pedimos además dimensiones perpendiculares casi iguales para que
            // la relación corresponda realmente a la misma familia de rebanada.
            const deltaRep=deltas.find(x=>Math.abs(x.delta-resid)<=0.6);
            if(
              deltaRep &&
              Math.abs(qb-b)<=Math.max(1,opts.sierra+0.5)
            ){
              // Penalización fuerte pero sólo en esta corrida alternativa.
              // La multiplicidad del delta aumenta la señal estructural.
              const peso=resid*Math.max(areaCand,qa)*Math.max(2,deltaRep.n)*qcnt;
              riesgoFranja=Math.max(riesgoFranja,peso);
            }
          }
        }
      }

      considerar({
        i:p._pos, o, a, b,sobra,
        exacta:sobra<1e-9?0:1,
        area:a*b, mult:1, riesgoFranja
      });

      // agrupar k piezas iguales solo si abre espacio que k=1 no permitia
      if(opts.multiRebanada && nivel<opts.etapas && disp>=2){
        for(let mk=2; mk<=Math.min(3,disp); mk++){
          const t = mk*a 