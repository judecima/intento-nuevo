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
  if(criterio==='largo') return u.a!==v.a ? u.a>v.a : u.sobra<v.sobra;
  if(u.exacta!==v.exacta) return u.exacta<v.exacta;
  if(u.sobra!==v.sobra)   return u.sobra<v.sobra;
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
  for(let i=0;i<t.length;i++){ h^=t.charCodeAt(i); h=Math.imul(h,16777619)>>>0; }
  return h>>>0;
}
function rngDesde(semilla){
  let s=semilla>>>0;
  return ()=>{ s=(Math.imul(s,1664525)+1013904223)>>>0; return s/4294967296; };
}
const rngPara=(opts,pase,cfg,restart,placa)=>
  rngDesde(mezclar(opts.semilla, pase, cfg._id, restart, placa));

function elegir(pool, region, restante, perp, opts, rnd, nivel){
  const criterio = (opts.criterios && opts.criterios[Math.min(nivel-1, opts.criterios.length-1)]) || opts.criterio;
  const enX = region.dir===DIR_X;

  // pasada unica: cuenta por firma y guarda un representante de cada medida
  const cuenta=opts._cuenta; cuenta.clear();
  const reps=opts._reps; reps.length=0;
  for(let i=0;i<pool.length;i++){
    const p=pool[i], c=cuenta.get(p._sig);
    if(c===undefined){ cuenta.set(p._sig,1); p._pos=i; reps.push(p); }
    else cuenta.set(p._sig,c+1);
  }

  let m1=null, m2=null, m3=null;

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
    for(let k=0;k<ors.length;k++){
      const o=ors[k];
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
        i:p._pos, o, a, b, sobra,
        exacta:sobra<1e-9?0:1,
        area:a*b, mult:1, riesgoFranja
      });

      // agrupar k piezas iguales solo si abre espacio que k=1 no permitia
      if(opts.multiRebanada && nivel<opts.etapas && disp>=2){
        for(let mk=2; mk<=Math.min(3,disp); mk++){
          const t = mk*a + (mk-1)*opts.sierra;
          if(t>restante+1e-9) continue;
          let sirve=false;
          for(let z=0;z<medidas.length;z++){ const d=medidas[z]; if(d>a+1e-9 && d<=t+1e-9){ sirve=true; break; } }
          if(!sirve) continue;
          considerar({i:p._pos, o, a:t, b, sobra, exacta:1, area:t*b, mult:mk});
        }
      }
    }
  }
  if(!m1) return null;
  if(rnd && m2 && rnd()<opts.ruido) return (m3 && rnd()<0.5) ? m3 : m2;
  return m1;
}

function nuevoNodoArbol(region,nivel,diagPath=null){
  return {
    x:region.x,y:region.y,w:region.w,h:region.h,dir:region.dir,nivel,partes:[],
    _diagPath:Array.isArray(diagPath)?diagPath.slice():[]
  };
}

/* -------------------------------------------------------------------------
   CONTRACCIÓN REAL DE REBANADA

   La pieza ancla sólo propone un espesor inicial `t`.
   Si la recursión termina usando menos ancho/alto, la rebanada se contrae al
   máximo realmente ocupado y el material liberado vuelve al padre para que lo
   use la rebanada hermana siguiente.

   Esto evita el "ancho fantasma":
     ancla 622 -> contenido real máximo 578 -> columna real 578.
   ------------------------------------------------------------------------- */
function medirEspesorUsado(bloque, dirPadre, colocadas, desde){
  let usado=0;
  for(let i=desde;i<colocadas.length;i++){
    const c=colocadas[i];
    if(dirPadre===DIR_X){
      usado=Math.max(usado,(c.x+c.base)-bloque.x);
    }else{
      usado=Math.max(usado,(c.y+c.altura)-bloque.y);
    }
  }
  return usado;
}

function recortarRectARebanada(r,dirPadre,limite){
  if(!r) return false;
  if(dirPadre===DIR_X){
    if(r.x>=limite-1e-9) return false;
    r.w=Math.max(0,Math.min(r.x+r.w,limite)-r.x);
    return r.w>1e-9 && r.h>1e-9;
  }else{
    if(r.y>=limite-1e-9) return false;
    r.h=Math.max(0,Math.min(r.y+r.h,limite)-r.y);
    return r.w>1e-9 && r.h>1e-9;
  }
}

function recortarArbolARebanada(nodo,dirPadre,limite){
  if(!nodo) return;
  if(dirPadre===DIR_X){
    nodo.w=Math.max(0,Math.min(nodo.x+nodo.w,limite)-nodo.x);
  }else{
    nodo.h=Math.max(0,Math.min(nodo.y+nodo.h,limite)-nodo.y);
  }

  const nuevas=[];
  for(const p of nodo.partes||[]){
    if(!p||!p.bloque) continue;
    if(!recortarRectARebanada(p.bloque,dirPadre,limite)) continue;

    // Si el eje que estamos contrayendo coincide con el eje de avance de este
    // nodo, su `cut` físico también debe coincidir con el bloque ya recortado.
    if(nodo.dir===dirPadre){
      p.cut=dirPadre===DIR_X ? p.bloque.w : p.bloque.h;
    }

    if(p.hijo) recortarArbolARebanada(p.hijo,dirPadre,limite);
    nuevas.push(p);
  }
  nodo.partes=nuevas;
}

function recortarCortesARebanada(cortes,desde,dirPadre,limite){
  const eps=1e-9;
  for(let i=cortes.length-1;i>=desde;i--){
    const c=cortes[i];

    if(dirPadre===DIR_X){
      if(c.x1>limite+eps && c.x2>limite+eps){
        cortes.splice(i,1);
        continue;
      }

      c.x1=Math.min(c.x1,limite);
      c.x2=Math.min(c.x2,limite);

      // Si el antiguo corte interno vertical quedó exactamente sobre el nuevo
      // borde derecho de la rebanada, ya no separa material: el corte padre
      // exterior es suficiente y éste debe desaparecer de la secuencia.
      if(
        Math.abs(c.x1-c.x2)<=eps &&
        Math.abs(c.x1-limite)<=eps
      ){
        cortes.splice(i,1);
        continue;
      }
    }else{
      if(c.y1>limite+eps && c.y2>limite+eps){
        cortes.splice(i,1);
        continue;
      }

      c.y1=Math.min(c.y1,limite);
      c.y2=Math.min(c.y2,limite);

      // Simétrico para una fila contraída: un corte horizontal que queda
      // exactamente sobre el nuevo borde inferior es redundante.
      if(
        Math.abs(c.y1-c.y2)<=eps &&
        Math.abs(c.y1-limite)<=eps
      ){
        cortes.splice(i,1);
        continue;
      }
    }

    c.largo=Math.abs(c.x2-c.x1)+Math.abs(c.y2-c.y1);
    if(c.largo<=eps) cortes.splice(i,1);
  }
}

function recortarRestosARebanada(restos,desde,dirPadre,limite){
  for(let i=restos.length-1;i>=desde;i--){
    if(!recortarRectARebanada(restos[i],dirPadre,limite)){
      restos.splice(i,1);
      continue;
    }
    const r=restos[i];
    if(r._diag){
      r._diag.bloque={
        x:r._diag.bloque?.x??r.x,
        y:r._diag.bloque?.y??r.y,
        w:dirPadre===DIR_X
          ? Math.min(r._diag.bloque?.w??r.w,Math.max(0,limite-(r._diag.bloque?.x??r.x)))
          : (r._diag.bloque?.w??r.w),
        h:dirPadre===DIR_Y
          ? Math.min(r._diag.bloque?.h??r.h,Math.max(0,limite-(r._diag.bloque?.y??r.y)))
          : (r._diag.bloque?.h??r.h)
      };
    }
  }
}

function actualizarDiagContraccion(colocadas,desde,nivel,bloque,tOriginal,tReal,dirPadre){
  if(!(tReal<tOriginal-1e-9)) return;
  for(let i=desde;i<colocadas.length;i++){
    for(const d of colocadas[i]._diagPath||[]){
      if(
        d &&
        d.nivel===nivel &&
        d.bloque &&
        Math.abs(d.bloque.x-bloque.x)<1e-9 &&
        Math.abs(d.bloque.y-bloque.y)<1e-9
      ){
        d.rebanadaProvisional=tOriginal;
        d.rebanada=tReal;
        d.contraida=tOriginal-tReal;
        if(dirPadre===DIR_X) d.bloque.w=tReal;
        else d.bloque.h=tReal;
      }
    }
  }
}

function llenar(region, pool, colocadas, nivel, opts, rnd, cortes, restos, arbol=null){
  const perp=ejePerp(region), total=ejeLargo(region);
  let pos=0;
  while(pos < total-1e-9){
    const sel=elegir(pool, region, total-pos, perp, opts, rnd, nivel);
    if(!sel) break;
    const tPropuesto=sel.a;
    let t=tPropuesto;
    const piezaAncla = pool[sel.i] || null;
    const diagDecision = {
      nivel,
      dir:region.dir,
      region:{x:region.x,y:region.y,w:region.w,h:region.h},
      bloque:null,
      rebanada:t,
      piezaAncla:piezaAncla ? (piezaAncla.detalle||'') : '',
      refAncla:piezaAncla && piezaAncla.ref!=null ? piezaAncla.ref : '',
      baseAncla:sel.o ? sel.o.base : null,
      alturaAncla:sel.o ? sel.o.altura : null,
      rotadaAncla:sel.o ? !!sel.o.rotada : false,
      mult:sel.mult||1,
      sobra:sel.sobra,
      sierra:opts.sierra
    };
    const bloque = region.dir===DIR_X
      ? {x:region.x+pos, y:region.y, w:t, h:perp}
      : {x:region.x, y:region.y+pos, w:perp, h:t};
    diagDecision.bloque={x:bloque.x,y:bloque.y,w:bloque.w,h:bloque.h};

    if(sel.mult===1 && (sel.sobra<1e-9 || nivel>=opts.etapas)){
      const p=pool.splice(sel.i,1)[0];
      colocadas.push({
        x:bloque.x, y:bloque.y, base:sel.o.base, altura:sel.o.altura,
        rotada:sel.o.rotada, pieza:p, nivel,
        _diagPath:[
          ...((arbol&&Array.isArray(arbol._diagPath))?arbol._diagPath:[]),
          {...diagDecision, tipo:'COLOCACIÓN FINAL', piezaFinal:p?.detalle||'', refFinal:p?.ref??''}
        ]
      });

      if(arbol){
        const dirHijo=region.dir===DIR_X?DIR_Y:DIR_X;
        const hijo=nuevoNodoArbol(
          {...bloque,dir:dirHijo},
          nivel+1,
          [...(arbol._diagPath||[]), {...diagDecision, tipo:'REBANADA PADRE'}]
        );
        if(sel.sobra>1e-9 && nivel>=opts.etapas){
          // El XML <project> expresa el corte terminal como un nivel físico real:
          // el bloque actual sigue subdividiéndose y recién el hijo es type=1.
          const piezaBloque = region.dir===DIR_X
            ? {x:bloque.x,y:bloque.y,w:t,h:sel.b}
            : {x:bloque.x,y:bloque.y,w:sel.b,h:t};
          const hoja=nuevoNodoArbol(
            {...piezaBloque,dir:region.dir},
            nivel+2,
            [...(hijo._diagPath||[]), {
              nivel:nivel+1, tipo:'CORTE TERMINAL', dir:dirHijo,
              region:{x:bloque.x,y:bloque.y,w:bloque.w,h:bloque.h},
              bloque:{x:piezaBloque.x,y:piezaBloque.y,w:piezaBloque.w,h:piezaBloque.h},
              rebanada:sel.b, piezaAncla:p?.detalle||'', refAncla:p?.ref??'',
              sierra:opts.sierra
            }]
          );
          hijo.partes.push({cut:sel.b,type:1,pieza:p,bloque:piezaBloque,hijo:hoja,terminal:true});
          arbol.partes.push({cut:t,type:2,pieza:null,bloque,hijo,terminal:true});
        }else{
          arbol.partes.push({cut:t,type:1,pieza:p,bloque,hijo});
        }
      }

      // lo que queda al costado de la pieza dentro del bloque
      if(sel.sobra>1e-9){
        // Corte terminal: al alcanzar el máximo de etapas la estrategia deja de
        // subdividir, pero físicamente la pieza todavía debe separarse del residuo.
        if(nivel>=opts.etapas){
          cortes.push(region.dir===DIR_X
            ? {x1:bloque.x, y1:bloque.y+sel.b, x2:bloque.x+t, y2:bloque.y+sel.b,
               nivel:nivel+1, largo:t, terminal:true}
            : {x1:bloque.x+sel.b, y1:bloque.y, x2:bloque.x+sel.b, y2:bloque.y+t,
               nivel:nivel+1, largo:t, terminal:true});
        }
        const r = region.dir===DIR_X
          ? {x:bloque.x, y:bloque.y+sel.b+opts.sierra, w:t, h:perp-sel.b-opts.sierra}
          : {x:bloque.x+sel.b, y:bloque.y, w:perp-sel.b-opts.sierra, h:t};
        if(r.w>1e-9 && r.h>1e-9){
          r._diag={
            tipo:'RESTO LATERAL DE REBANADA',
            nivel,
            dir:region.dir,
            region:{x:region.x,y:region.y,w:region.w,h:region.h},
            bloque:{x:bloque.x,y:bloque.y,w:bloque.w,h:bloque.h},
            rebanada:t,
            piezaPerp:sel.b,
            mult:sel.mult||1,
            sierra:opts.sierra,
            pieza:(p&&p.detalle)||'',
            ref:(p&&p.ref)!=null?p.ref:'',
            causa:'La rebanada elegida es mayor que la dimensión perpendicular ocupada por la pieza.'
          };
          restos.push(r);
        }
      }
    }else{
      const sub={...bloque, dir: region.dir===DIR_X?DIR_Y:DIR_X};
      const antes=colocadas.length;
      const marcaR=restos.length;
      const marcaC=cortes.length;

      const hijo=arbol?nuevoNodoArbol(
        sub,
        nivel+1,
        [...(arbol._diagPath||[]), {...diagDecision, tipo:'REBANADA PADRE'}]
      ):null;

      llenar(sub, pool, colocadas, nivel+1, opts, rnd, cortes, restos, hijo);

      if(colocadas.length===antes){
        restos.length=marcaR;
        cortes.length=marcaC;
        break;
      }

      /* La ancla no queda reservada. Por eso el t definitivo debe salir del
         contenido REAL que terminó dentro de esta rebanada. */
      if(opts.contraerRebanadaReal!==false){
        const usado=medirEspesorUsado(bloque,region.dir,colocadas,antes);
        if(usado>1e-9 && usado<t-1e-9){
          const limite=region.dir===DIR_X ? bloque.x+usado : bloque.y+usado;

          // Recortar todos los artefactos producidos por esta recursión.
          recortarCortesARebanada(cortes,marcaC,region.dir,limite);
          recortarRestosARebanada(restos,marcaR,region.dir,limite);
          if(hijo) recortarArbolARebanada(hijo,region.dir,limite);

          actualizarDiagContraccion(
            colocadas,antes,nivel,bloque,t,usado,region.dir
          );

          t=usado;
          if(region.dir===DIR_X) bloque.w=t;
          else bloque.h=t;

          diagDecision.rebanadaProvisional=tPropuesto;
          diagDecision.rebanada=t;
          diagDecision.contraida=tPropuesto-t;
          diagDecision.bloque={
            x:bloque.x,y:bloque.y,w:bloque.w,h:bloque.h
          };
        }
      }

      if(arbol) arbol.partes.push({cut:t,type:2,pieza:null,bloque,hijo});
    }
    if(pos+t < total-1e-9){
      const k=pos+t;
      cortes.push(region.dir===DIR_X
        ? {x1:region.x+k, y1:region.y, x2:region.x+k, y2:region.y+perp, nivel, largo:perp}
        : {x1:region.x, y1:region.y+k, x2:region.x+perp, y2:region.y+k, nivel, largo:perp});
    }
    pos += t + opts.sierra;
  }
  if(pos < total-1e-9){
    const r = region.dir===DIR_X
      ? {x:region.x+pos, y:region.y, w:total-pos, h:perp}
      : {x:region.x, y:region.y+pos, w:perp, h:total-pos};
    if(r.w>1e-9 && r.h>1e-9){
      r._diag={
        tipo:'RESTO DE FIN DE REGIÓN',
        nivel,
        dir:region.dir,
        region:{x:region.x,y:region.y,w:region.w,h:region.h},
        posicionConsumida:pos,
        largoRegion:total,
        sierra:opts.sierra,
        causa:'La región terminó sin otra pieza/rebanada factible para ocupar esta cola.'
      };
      restos.push(r);
    }
  }
}

/* Un recorte sirve si supera la medida minima que el taller quiera guardar. */
const esUtil = (r,o) => Math.min(r.w,r.h) >= o.restoMin && Math.max(r.w,r.h) >= o.restoMax;
const areaUtil = (rs,o) => rs.reduce((s,r)=> s + (esUtil(r,o) ? r.w*r.h : 0), 0);

/* Clave canonica del pool: cuenta por medida, no lista de piezas. Dos pools con
   las mismas medidas producen el mismo corte, sin importar el orden ni que
   objetos concretos los compongan. Se arma en una pasada, sin ordenar. */
function clavePool(pool, opts){
  const n=opts._nSigs, cuenta=new Uint16Array(n);
  for(let i=0;i<pool.length;i++) cuenta[pool[i]._sig]++;
  let k='';
  for(let i=0;i<n;i++) if(cuenta[i]) k+=i+':'+cuenta[i]+',';
  return k+'#'+(opts.criterios?opts.criterios.join(''):opts.criterio)+'#'+opts.dirInicial;
}

/* Reasigna un corte cacheado a las piezas del pool actual. Las piezas de igual
   medida son intercambiables, asi que basta tomar una libre de cada firma. */
function reasignar(res, pool){
  const porSig=new Map();
  for(const p of pool){
    if(!porSig.has(p._sig)) porSig.set(p._sig, []);
    porSig.get(p._sig).push(p);
  }
  const colocadas=[];
  for(const c of res.colocadas){
    const libres=porSig.get(c.pieza._sig);
    if(!libres || !libres.length) return null;   // el pool no coincide: no usar caché
    colocadas.push({...c, pieza:libres.pop()});
  }
  return {...res, colocadas};
}

function empacarPlaca(pool, opts, rnd){
  // Solo se cachean los cortes deterministas; los que usan ruido no se repiten.
  let clave=null;
  if(!rnd && opts._cache){
    clave=clavePool(pool, opts);
    const hit=opts._cache.get(clave);
    if(hit){
      const r=reasignar(hit, pool);
      if(r){ opts._stats.hits++; return r; }
    }
  }
  const copia=pool.slice();
  const region={x:0, y:0, w:opts.anchoUtil, h:opts.altoUtil, dir:opts.dirInicial};
  const colocadas=[], cortes=[], restos=[];
  const arbol=nuevoNodoArbol(region,1);
  llenar(region, copia, colocadas, 1, opts, rnd, cortes, restos, arbol);
  cortes.sort((a,b)=>a.nivel-b.nivel);
  const res={colocadas, cortes, restos, arbol,
             area:colocadas.reduce((s,c)=>s+c.base*c.altura,0),
             areaResto:areaUtil(restos,opts)};
  if(clave && opts._cache){ opts._cache.set(clave, res); opts._stats.fallos++; }
  return res;
}

/* Para cada placa prueba todas las estrategias sobre lo que queda. Primero
   busca la que mas superficie coloca; entre las que empatan (o quedan muy
   cerca) elige la que deja el recorte mas grande de una pieza, para que el
   desperdicio vuelva al stock en vez de irse en tiras finas. */
function generarCandidatosPlaca(pool, opts, configs, pase, placa){
  const porUso=new Map();
  for(const cfg of configs){
    const o={...opts, ...cfg};
    const reps = cfg.ruido>0 ? opts.restartsPorPlaca : 1;
    for(let r=0;r<reps;r++){
      const res=empacarPlaca(pool, o, cfg.ruido>0?rngPara(opts,pase,cfg,r,placa):null);
      if(!res.colocadas.length) continue;

      // Para la búsqueda global importa qué piezas quedan. Si dos layouts usan
      // exactamente el mismo conjunto, conservamos el que deja mejor sobrante.
      const ids=res.colocadas.map(c=>c.pieza.id).sort((a,b)=>a-b);
      const firma=ids.join(',');
      const prev=porUso.get(firma);
      if(!prev || mejorCandidatoPlaca(res,prev,opts) ||
        (compararCalidad(calidadRestos(res.restos||[],opts),calidadRestos(prev.restos||[],opts))===0 && res.area>prev.area+1e-6)){
        porUso.set(firma,res);
      }
    }
  }

  const areaPlaca=opts.anchoUtil*opts.altoUtil;
  const candidatos=[];
  for(const res of porUso.values()){
    const usados=new Set(res.colocadas.map(c=>c.pieza.id));
    const restante=pool.filter(p=>!usados.has(p.id));
    const areaPendiente=restante.reduce((s,p)=>s+p._corte.base*p._corte.altura,0);
    candidatos.push({
      ...res,
      restante,
      lbAdicional:Math.ceil(Math.max(0,areaPendiente)/areaPlaca),
    });
  }

  // No reducimos todo a "placa más llena": primero preservamos candidatos que
  // dejan un futuro prometedor; área y sobrante quedan como desempates.
  candidatos.sort((a,b)=>{
    const prim=a.lbAdicional-b.lbAdicional || b.area-a.area;
    if(prim) return prim;
    return -compararCalidad(calidadRestos(a.restos||[],opts),calidadRestos(b.restos||[],opts));
  });
  return candidatos.slice(0, Math.max(opts.beamWidth*3, opts.beamWidth));
}

/* Beam Search entre placas. El constructor interno sigue siendo el mismo;
   la diferencia es que ya no comprometemos todo el pedido con la placa local
   más atractiva. Conservamos varios planes parciales y los expandimos. */
function armarPlacasBeam(piezas, opts, configs, pase){
  const areaPlaca=opts.anchoUtil*opts.altoUtil;
  const t0=Date.now();
  let beam=[{pool:piezas.slice(), placas:[], util:0}];
  let completas=[];
  let guarda=0;

  while(beam.length && guarda++<300){
    // El costo de Beam crece con el numero de placas; sin techo, un pedido
    // grande lo multiplica por cuatro sin mejorar el resultado.
    if(Date.now()-t0 > opts.presupuestoBeamMs) break;
    const siguientes=[];

    for(const estado of beam){
      if(!estado.pool.length){ completas.push(estado); continue; }

      const cands=generarCandidatosPlaca(estado.pool,opts,configs,pase,estado.placas.length);
      if(!cands.length) continue;

      for(const c of cands){
        const placa={ancho:opts.anchoUtil, alto:opts.altoUtil, colocadas:c.colocadas,
                     cortes:c.cortes, restos:c.restos, arbol:c.arbol};
        siguientes.push({
          pool:c.restante,
          placas:estado.placas.concat(placa),
          util:estado.util+c.areaResto,
        });
      }
    }

    if(completas.length){
      const minCompleta=Math.min(...completas.map(e=>e.placas.length));
      // Ningún estado cuyo límite inferior ya sea peor puede superar la mejor completa.
      for(let i=siguientes.length-1;i>=0;i--){
        const e=siguientes[i];
        const areaPend=e.pool.reduce((s,p)=>s+p._corte.base*p._corte.altura,0);
        const lb=e.placas.length+Math.ceil(Math.max(0,areaPend)/areaPlaca);
        if(lb>minCompleta) siguientes.splice(i,1);
      }
    }

    siguientes.sort((a,b)=>{
      const areaA=a.pool.reduce((s,p)=>s+p._corte.base*p._corte.altura,0);
      const areaB=b.pool.reduce((s,p)=>s+p._corte.base*p._corte.altura,0);
      const lbA=a.placas.length+Math.ceil(Math.max(0,areaA)/areaPlaca);
      const lbB=b.placas.length+Math.ceil(Math.max(0,areaB)/areaPlaca);
      const prim=lbA-lbB || a.pool.length-b.pool.length;
      if(prim) return prim;
      return -compararCalidad(calidadPlanPlacas(a.placas,opts),calidadPlanPlacas(b.placas,opts));
    });

    // Deduplicamos por conjunto restante: dos estados con las mismas piezas por
    // cortar tienen el mismo futuro; conservamos el que llegó con mejor historial.
    const unicos=[]; const firmas=new Set();
    for(const e of siguientes){
      const firma=e.pool.map(p=>p.id).sort((a,b)=>a-b).join(',');
      if(firmas.has(firma)) continue;
      firmas.add(firma); unicos.push(e);
      if(unicos.length>=opts.beamWidth) break;
    }
    beam=unicos;
  }

  completas=completas.concat(beam.filter(e=>!e.pool.length));
  if(!completas.length){
    const p=beam[0]?.pool?.[0] || piezas[0];
    throw new Error(`No se pudo completar el plan con Beam Search${p ? `; revisar la pieza "${p.detalle||'sin nombre'}" (${p.base}\u00d7${p.altura} mm)` : ''}.`);
  }

  completas.sort((a,b)=>{
    const d=a.placas.length-b.placas.length;
    if(d) return d;
    return -compararCalidad(calidadPlanPlacas(a.placas,opts),calidadPlanPlacas(b.placas,opts));
  });
  return completas[0].placas;
}

/* Calidad industrial del remanente.
   Se usa SOLO como desempate cuando la cantidad de placas ya es igual.
   Prioridad: mayor bloque -> segundo mayor -> menos fragmentos -> mayor area total. */
function calidadRestos(restos,opts){
  const areas=[];
  let total=0;
  for(const r of restos||[]){
    if(!esUtil(r,opts)) continue;
    const a=r.w*r.h;
    areas.push(a); total+=a;
  }
  areas.sort((a,b)=>b-a);
  return {mayor:areas[0]||0, segundo:areas[1]||0, fragmentos:areas.length, total, areas};
}
function compararCalidad(a,b,eps=1e-6){
  if(a.mayor>b.mayor+eps) return 1;
  if(b.mayor>a.mayor+eps) return -1;
  if(a.segundo>b.segundo+eps) return 1;
  if(b.segundo>a.segundo+eps) return -1;
  if(a.fragmentos!==b.fragmentos) return a.fragmentos<b.fragmentos?1:-1;
  if(a.total>b.total+eps) return 1;
  if(b.total>a.total+eps) return -1;
  return 0;
}
function calidadPlanPlacas(placas,opts){
  const restos=[];
  for(const p of placas||[]) for(const r of p.restos||[]) restos.push(r);
  return calidadRestos(restos,opts);
}

/* Profundidad de máquina.
   `etapas` es el máximo de búsqueda permitido, no un objetivo a consumir.
   Entre planes con la MISMA cantidad de placas preferimos el árbol más corto,
   como hace Lepton en los casos donde 5 placas son posibles con layer 4 aunque
   una variante más profunda también entre en 5.

   Orden de desempate:
     1) menor maxXmlLayer
     2) menor maxType2Layer (subdivisiones que continúan)
     3) menor maxType1Layer
     4) menos nodos type=2
     5) recién después, mejor remanente comercial.
*/
function metricasProfundidadPlacas(placas){
  let maxXmlLayer=0,maxType2Layer=0,maxType1Layer=0,type2Nodes=0;
  const visitar=n=>{
    if(!n) return;
    maxXmlLayer=Math.max(maxXmlLayer,+n.nivel||0);
    for(const p of n.partes||[]){
      if(p.type===2){ maxType2Layer=Math.max(maxType2Layer,+n.nivel||0); type2Nodes++; }
      else if(p.type===1) maxType1Layer=Math.max(maxType1Layer,+n.nivel||0);
      visitar(p.hijo);
    }
  };
  for(const placa of placas||[]) visitar(placa.arbol);
  return {maxXmlLayer,maxType2Layer,maxType1Layer,type2Nodes};
}
function compararProfundidadPlan(a,b){
  const A=metricasProfundidadPlacas(a), B=metricasProfundidadPlacas(b);
  if(A.maxXmlLayer!==B.maxXmlLayer) return A.maxXmlLayer<B.maxXmlLayer?1:-1;
  if(A.maxType2Layer!==B.maxType2Layer) return A.maxType2Layer<B.maxType2Layer?1:-1;
  if(A.maxType1Layer!==B.maxType1Layer) return A.maxType1Layer<B.maxType1Layer?1:-1;
  if(A.type2Nodes!==B.type2Nodes) return A.type2Nodes<B.type2Nodes?1:-1;
  return 0;
}
function mejorPlanIgualPlacas(a,b,opts){
  if(opts.preferirMenorProfundidad!==false){
    const d=compararProfundidadPlan(a,b);
    if(d!==0) return d>0;
  }
  return compararCalidad(calidadPlanPlacas(a,opts),calidadPlanPlacas(b,opts))>0;
}
function mejorCandidatoPlaca(a,b,opts){
  return compararCalidad(calidadRestos(a.restos||[],opts),calidadRestos(b.restos||[],opts))>0;
}

function armarPlacasGreedy(piezas, opts, configs, pase){
  let pool=piezas.slice(); const placas=[]; let guarda=0;
  while(pool.length && guarda++<300){
    const cands=[];
    for(const cfg of configs){
      const o={...opts, ...cfg};
      const reps = cfg.ruido>0 ? opts.restartsPorPlaca : 1;
      for(let r=0;r<reps;r++){
        const res=empacarPlaca(pool, o, cfg.ruido>0?rngPara(opts,pase,cfg,r,placas.length):null);
        if(res.colocadas.length) cands.push(res);
      }
    }
    if(!cands.length){
      const p=pool[0];
      throw new Error(`La pieza "${p.detalle||'sin nombre'}" (${p.base}\u00d7${p.altura} mm) no entra en la placa.`);
    }
    // Si alguna disposicion coloca todo lo que queda, ninguna otra puede usar
    // menos placas: se cierra ahi sin dejar que el criterio de sobrante lo pise.
    const cierran=cands.filter(c=>c.colocadas.length===pool.length);
    if(cierran.length){
      cierran.sort((a,b)=>{
        const c=compararCalidad(calidadRestos(b.restos||[],opts),calidadRestos(a.restos||[],opts));
        return c || (b.area-a.area);
      });
      const c=cierran[0];
      placas.push({ancho:opts.anchoUtil, alto:opts.altoUtil, colocadas:c.colocadas,
                   cortes:c.cortes, restos:c.restos, arbol:c.arbol});
      pool=[]; continue;
    }
    const maxArea=Math.max(...cands.map(c=>c.area));
    const umbral=maxArea*(1-opts.tolerancia);
    let mejor=null;
    for(const c of cands){
      if(c.area < umbral) continue;
      if(!mejor || mejorCandidatoPlaca(c,mejor,opts) ||
        (compararCalidad(calidadRestos(c.restos||[],opts),calidadRestos(mejor.restos||[],opts))===0 && c.area>mejor.area+1e-6)) mejor=c;
    }
    const usados=new Set(mejor.colocadas.map(c=>c.pieza.id));
    pool=pool.filter(p=>!usados.has(p.id));
    placas.push({ancho:opts.anchoUtil, alto:opts.altoUtil, colocadas:mejor.colocadas,
                 cortes:mejor.cortes, restos:mejor.restos, arbol:mejor.arbol});
  }
  return placas;
}

const utilidadPlan=(placas,opts)=>calidadPlanPlacas(placas,opts).total;

/* Modo seguro: Beam Search compite contra el constructor original. Nunca se
   acepta una búsqueda global que use más placas; con igual número, gana el
   plan que deja más sobrante utilizable. */
function armarPlacas(piezas, opts, configs, pase){
  const greedy=armarPlacasGreedy(piezas,opts,configs,pase);

  // Cota inferior por area: si el greedy ya la alcanza, ninguna busqueda puede
  // usar menos placas y correr Beam seria gastar tiempo sin premio posible.
  const areaTotal=piezas.reduce((s,p)=>s+p._corte.base*p._corte.altura,0);
  const cota=Math.ceil(areaTotal/(opts.anchoUtil*opts.altoUtil));
  if(greedy.length<=cota) return greedy;
  if(piezas.length>opts.maxPiezasBeam) return greedy;

  let beam=null;
  try{
    beam=armarPlacasBeam(piezas,opts,configs,pase);
  }catch(err){
    // degradar a greedy es correcto, pero en silencio oculta bugs del Beam
    if(typeof console!=='undefined') console.warn('Beam Search falló, se usa greedy:', err.message);
    beam=null;
  }

  const ganaBeam=beam && (
    beam.length<greedy.length ||
    (beam.length===greedy.length && mejorPlanIgualPlacas(beam,greedy,opts))
  );
  return ganaBeam ? beam : greedy;
}

function optimizar(lineas, config){
  const opts={placaBase:2750, placaAltura:1830, refiladoX:10, refiladoY:10,
              sierra:4.5, etapas:4, materialConVeta:false,
              descontarCanto:false, cantoEspesor:0,
              ruido:.3, pases:4, restartsPorPlaca:14,
              restoMin:250, restoMax:400, tolerancia:0.02,
              beamWidth:5, maxPiezasBeam:120, presupuestoBeamMs:1500,
              maxPiezasCache:0, semilla:20260812,
              // `etapas` es un techo. Por defecto se prueban también profundidades
              // menores y, a igualdad de placas, gana el árbol más simple.
              preferirMenorProfundidad:true,
              usarRescue:true, maxPiezasRescue:30, presupuestoRescueMs:300, multiRebanada:false, multiVariantes:false, ...config};

  const piezas=[]; let id=0;
  lineas.forEach((l,idx)=>{
    const codigoXml=String(l.ref!==undefined && l.ref!==null && l.ref!=='' ? l.ref : idx+1);
    for(let k=0;k<l.cant;k++)
      piezas.push({id:id++, base:+l.base, altura:+l.altura, detalle:l.detalle||'',
                   veta:!!l.veta, cantos:l.cantos||null, ref:l.ref, _codigoXml:codigoXml});
  });
  if(!piezas.length) throw new Error('No hay piezas cargadas.');
  for(const p of piezas){
    if(!(p.base>0) || !(p.altura>0))
      throw new Error(`La pieza "${p.detalle||'sin nombre'}" tiene medidas inválidas.`);
    p._corte=medidaCorte(p,opts);
  }
  // Precalculo: orientaciones y firma de equivalencia. Hacerlo por llamada
  // dominaba el tiempo en pedidos grandes.
  const sigs=new Map();
  for(const p of piezas){
    p._ors=orientaciones(p,opts.materialConVeta);
    const k=p._corte.base+'|'+p._corte.altura+'|'+(p.veta?1:0);
    if(!sigs.has(k)) sigs.set(k, sigs.size);
    p._sig=sigs.get(k);
  }
  opts._vistas=new Set();
  opts._cuenta=new Map();
  opts._reps=[];
  opts._medidas=[];
  opts._nSigs=sigs.size;
  // La cache rinde con pools chicos, donde los pases repiten cortes. En pedidos
  // grandes armar la clave y reasignar piezas cuesta mas que recalcular.
  const cacheConviene = opts.usarCache!==undefined ? opts.usarCache : piezas.length<=opts.maxPiezasCache;  // ver nota: medido sin ganancia
  opts._cache = cacheConviene ? new Map() : null;
  opts._stats={hits:0, fallos:0};   // objeto compartido: las copias de opts lo mutan igual

  const anchoUtil=opts.placaBase-opts.refiladoX, altoUtil=opts.placaAltura-opts.refiladoY;
  if(!(anchoUtil>0 && altoUtil>0)) throw new Error('El refilado no puede superar la medida de la placa.');
  for(const p of piezas){
    const entra=orientaciones(p,opts.materialConVeta).some(o=>o.base<=anchoUtil+1e-9 && o.altura<=altoUtil+1e-9);
    if(!entra) throw new Error(
      `La pieza "${p.detalle||'sin nombre'}" (${p.base}×${p.altura} mm) no entra en una placa útil de ${anchoUtil}×${altoUtil} mm.`);
  }
  opts.anchoUtil=anchoUtil; opts.altoUtil=altoUtil;

  // El costo por placa crece con el pool; sin ajustar, un pedido de 300 piezas
  // gasta el mismo esfuerzo por colocacion que uno de 20 y tarda minutos.
  if(config.restartsPorPlaca===undefined)
    opts.restartsPorPlaca=Math.max(3, Math.round(opts.restartsPorPlaca*60/Math.max(60,piezas.length)));



  /* Espacio de configuraciones podado con datos de uso real:
       - 'largo' en nivel 2 gana el 2% de las placas: se descarta como segundo.
       - 'exacta' solo rinde emparejado consigo mismo: sin cruces.
       - los pares simetricos son los que mas ganan y llevan reinicios con ruido.
       - se conservan los cruces que si aparecen en planes elegidos. */
  const SIMETRICOS=['perp','exacta','area','largo'];
  const CRUCES=[['largo','perp'],['perp','area'],['area','perp'],['largo','area']];
  const configs=[];
  for(const c of SIMETRICOS)
    for(const dirInicial of [DIR_Y,DIR_X]){
      configs.push({criterios:[c,c], criterio:c, dirInicial, ruido:0});
      configs.push({criterios:[c,c], criterio:c, dirInicial, ruido:opts.ruido});
    }
  for(const [c1,c2] of CRUCES)
    for(const dirInicial of [DIR_Y,DIR_X])
      configs.push({criterios:[c1,c2], criterio:c1, dirInicial, ruido:0});

  if(opts.multiVariantes!==false)
    for(const cfg of configs.slice())
      configs.push({...cfg, multiRebanada:true});

  // La identidad sale del contenido, no del indice: podar una config no altera
  // los numeros aleatorios que reciben las demas.
  for(const cfg of configs)
    cfg._id=hashTexto(cfg.criterios.join('>')+'|'+cfg.dirInicial+'|'+(cfg.ruido>0?'rnd':'det')+(cfg.multiRebanada?'|multi':''));

  // Permite ablacion reproducible: excluir estrategias por nombre.
  const nombreCfg=c=>c.criterios.join('>')+'|'+c.dirInicial+'|'+(c.ruido>0?'rnd':'det');
  // Sin victorias en el corpus de 1.247 pedidos. Con generadores independientes
  // por configuracion, quitarlas no altera el comportamiento de las demas.
  const MUERTAS=['exacta>exacta|y|det','exacta>exacta|x|det','largo>largo|y|det',
                 'perp>area|y|det','perp>area|x|det'];
  const excluir=new Set([...MUERTAS, ...(opts.excluirConfigs||[])]);
  const configsUsadas=configs.filter(c=>!excluir.has(nombreCfg(c)));
  const ordenes=[
    (a,b)=>b.base*b.altura-a.base*a.altura,
    (a,b)=>Math.max(b.base,b.altura)-Math.max(a.base,a.altura),
    (a,b)=>b.altura-a.altura||b.base-a.base,
    (a,b)=>b.base-a.base||b.altura-a.altura,
  ];

  let mejor=null;
  const etapasMax=Math.max(2,Math.floor(+opts.etapas||4));
  const etapasPrueba=opts.preferirMenorProfundidad===false
    ? [etapasMax]
    : Array.from({length:etapasMax-1},(_,i)=>i+2); // 2..etapasMax

  for(let pase=0; pase<opts.pases; pase++){
    for(const etapasActual of etapasPrueba){
      // No reducimos la capacidad del motor: seguimos probando la profundidad
      // elegida por el usuario, pero también alternativas más simples.
      const oEtapas={...opts,etapas:etapasActual};
      const placas=armarPlacas(
        piezas.slice().sort(ordenes[pase%ordenes.length]),
        oEtapas,configsUsadas,pase
      );
      if(placas.reduce((s,p)=>s+p.colocadas.length,0) < piezas.length) continue;
      const util=placas.reduce((s,p)=>s+areaUtil(p.restos,oEtapas),0);
      if(!mejor || placas.length<mejor.placas.length ||
        (placas.length===mejor.placas.length && mejorPlanIgualPlacas(placas,mejor.placas,oEtapas))){
        mejor={placas,util,etapasUsadas:etapasActual};
      }
    }
  }
  if(!mejor) throw new Error('No se pudo armar un plan completo con estos parámetros.');

  /* Rescue metaheurístico de tercer nivel.
     Sólo se ejecuta cuando el plan queda por encima de la cota inferior por área
     y el pedido es pequeño/mediano. Es una segunda búsqueda más intensa, no un
     reemplazo del constructor: si no mejora el objetivo jerárquico, se descarta. */
  let rescueIntentado=false, rescueGano=false, rescueMs=0;
  const areaTotalGlobal=piezas.reduce((s,p)=>s+p._corte.base*p._corte.altura,0);
  const cotaGlobal=Math.ceil(areaTotalGlobal/(opts.anchoUtil*opts.altoUtil));
  if(opts.usarRescue && mejor.placas.length>cotaGlobal && piezas.length<=opts.maxPiezasRescue){
    rescueIntentado=true;
    const tr0=Date.now();
    const rescueConfigs=[
      {criterios:['largo','largo','perp'], criterio:'largo', dirInicial:DIR_X, ruido:opts.ruido},
      {criterios:['largo','largo','perp'], criterio:'largo', dirInicial:DIR_Y, ruido:opts.ruido},
      {criterios:['largo','largo','perp'], criterio:'largo', dirInicial:DIR_Y, ruido:0},
      {criterios:['area','area','largo'], criterio:'area', dirInicial:DIR_X, ruido:opts.ruido},
      {criterios:['area','area','exacta'], criterio:'area', dirInicial:DIR_X, ruido:opts.ruido},
      {criterios:['exacta','exacta','exacta'], criterio:'exacta', dirInicial:DIR_X, ruido:opts.ruido},
      {criterios:['area','area','perp'], criterio:'area', dirInicial:DIR_X, ruido:opts.ruido},
      {criterios:['perp','perp','exacta'], criterio:'perp', dirInicial:DIR_Y, ruido:opts.ruido},
      {criterios:['perp','perp','perp'], criterio:'perp', dirInicial:DIR_X, ruido:opts.ruido},
    ];
    for(const cfg of rescueConfigs)
      cfg._id=hashTexto(cfg.criterios.join('>')+'|'+cfg.dirInicial+'|'+(cfg.ruido>0?'rnd':'det'));

    const ro={...opts, beamWidth:Math.max(opts.beamWidth,8),
              presupuestoBeamMs:opts.presupuestoRescueMs,
              restartsPorPlaca:Math.max(opts.restartsPorPlaca,18)};
    let mejorRescue=null;
    for(let pase=0;pase<opts.pases;pase++){
      try{
        const placas=armarPlacas(piezas.slice().sort(ordenes[pase%ordenes.length]),ro,rescueConfigs,pase+100);
        if(placas.reduce((s,p)=>s+p.colocadas.length,0)<piezas.length) continue;
        const util=placas.reduce((s,p)=>s+areaUtil(p.restos,ro),0);
        if(!mejorRescue || placas.length<mejorRescue.placas.length ||
          (placas.length===mejorRescue.placas.length && mejorPlanIgualPlacas(placas,mejorRescue.placas,ro)))
          mejorRescue={placas,util};
      }catch(_err){}
    }
    if(mejorRescue && (mejorRescue.placas.length<mejor.placas.length ||
      (mejorRescue.placas.length===mejor.placas.length && mejorPlanIgualPlacas(mejorRescue.placas,mejor.placas,opts)))){
      mejor=mejorRescue;
      rescueGano=true;
    }
    rescueMs=Date.now()-tr0;
  }

  const cortado=mejor.placas.reduce((s,p)=>s+p.colocadas.reduce((a,c)=>a+c.base*c.altura,0),0);
  const bruto=mejor.placas.length*opts.placaBase*opts.placaAltura;
  let mlCanto=0, ladosCanto=0;
  for(const p of piezas){
    if(!p.cantos) continue;
    for(const [lado,on] of Object.entries(p.cantos)){
      if(!on) continue;
      ladosCanto++; mlCanto += (lado==='izq'||lado==='der' ? p.altura : p.base)/1000;
    }
  }
  const sobrantes=[];
  mejor.placas.forEach((p,i)=>p.restos.forEach(r=>{ if(esUtil(r,opts)) sobrantes.push({...r, placa:i+1}); }));
  sobrantes.sort((a,b)=>b.w*b.h-a.w*a.h);
  const calidadRemanente=calidadPlanPlacas(mejor.placas,opts);
  const profundidad=metricasProfundidadPlacas(mejor.placas);
  return {placas:mejor.placas, opts, sobrantes, resumen:{
    placas:mejor.placas.length, piezas:piezas.length,
    m2Totales:bruto/1e6, m2Cortados:cortado/1e6,
    aprovechamiento:cortado/bruto*100, desperdicio:(1-cortado/bruto)*100,
    mlCanto, ladosCanto,
    cortes:mejor.placas.reduce((s,p)=>s+p.cortes.length,0),
    metrosSierra:mejor.placas.reduce((s,p)=>s+p.cortes.reduce((a,c)=>a+c.largo,0),0)/1000,
    cacheHits:opts._stats.hits, cacheFallos:opts._stats.fallos,
    sobrantes:sobrantes.length, m2Sobrantes:sobrantes.reduce((s,r)=>s+r.w*r.h,0)/1e6,
    mayorSobranteM2:calidadRemanente.mayor/1e6,
    segundoSobranteM2:calidadRemanente.segundo/1e6,
    fragmentosComerciales:calidadRemanente.fragmentos,
    maxXmlLayer:profundidad.maxXmlLayer,
    maxType2Layer:profundidad.maxType2Layer,
    maxType1Layer:profundidad.maxType1Layer,
    type2Nodes:profundidad.type2Nodes,
    etapasUsadas:mejor.etapasUsadas??opts.etapas,
    rescueIntentado, rescueGano, rescueMs,
  }};
}


/* ==========================================================================
   EXPORTADOR XML COMPATIBLE CON EL FORMATO <project> DE LEPTON
   Cada part apunta por id a un nodo hijo <no.N>. type=1 es pieza final;\n   type=2 es bloque que continúa subdividiéndose.
   ========================================================================== */


module.exports = { optimizar, empacarPlaca, orientaciones, medidaCorte, hashTexto, DIR_X, DIR_Y, calidadRestos, compararCalidad, calidadPlanPlacas, mejorPlanIgualPlacas, mejorCandidatoPlaca };
