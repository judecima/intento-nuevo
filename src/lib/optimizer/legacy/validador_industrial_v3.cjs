// Generated mechanically from Optimizador_V10_Interactivo_Remante_Lepton.html.
// Do not edit these legacy files by hand; update the extractor if the source changes.
"use strict";

function validarPlacaIndustrial(placa, opts){
  const eps=1e-6, saw=opts.sierra||0, W=placa.ancho, H=placa.alto;
  const ps=placa.colocadas||[];
  const errores=[];

  for(const c of ps){
    if(c.x < -eps || c.y < -eps || c.x+c.base > W+eps || c.y+c.altura > H+eps)
      errores.push(`pieza_fuera:${c.pieza?.id}`);
    const m=c.pieza?._corte;
    if(m){
      const normal=Math.abs(c.base-m.base)<eps && Math.abs(c.altura-m.altura)<eps;
      const rot=Math.abs(c.base-m.altura)<eps && Math.abs(c.altura-m.base)<eps;
      if(!(normal||rot)) errores.push(`dimension_inconsistente:${c.pieza?.id}`);
      if(opts.materialConVeta && c.pieza?.veta && !normal) errores.push(`veta_rotada:${c.pieza?.id}`);
    }
  }

  for(let i=0;i<ps.length;i++) for(let j=i+1;j<ps.length;j++){
    const a=ps[i],b=ps[j];
    if(a.x < b.x+b.base-eps && a.x+a.base > b.x+eps && a.y < b.y+b.altura-eps && a.y+a.altura > b.y+eps)
      errores.push(`overlap:${a.pieza?.id}:${b.pieza?.id}`);
  }

  // Simulación independiente de la secuencia exportada. Un corte debe atravesar
  // una región actualmente libre de borde a borde. Si un corte terminal queda
  // muy cerca del borde, el kerf puede salir fuera del subpanel hacia el descarte.
  let regiones=[{x:0,y:0,w:W,h:H}];
  let secuenciaValida=true, corteFallido=-1;
  const cortes=placa.cortes||[];
  for(let ci=0;ci<cortes.length;ci++){
    const c=cortes[ci];
    const vertical=Math.abs(c.x1-c.x2)<eps;
    const horizontal=Math.abs(c.y1-c.y2)<eps;
    let idx=-1;
    for(let r=0;r<regiones.length;r++){
      const g=regiones[r];
      if(vertical && Math.abs(c.y1-g.y)<eps && Math.abs(c.y2-(g.y+g.h))<eps && c.x1>g.x-eps && c.x1<g.x+g.w-eps){idx=r;break;}
      if(horizontal && Math.abs(c.x1-g.x)<eps && Math.abs(c.x2-(g.x+g.w))<eps && c.y1>g.y-eps && c.y1<g.y+g.h-eps){idx=r;break;}
    }
    if(idx<0 || (!vertical && !horizontal)){secuenciaValida=false;corteFallido=ci;break;}
    const g=regiones[idx]; regiones.splice(idx,1);
    if(vertical){
      const lw=c.x1-g.x, rx=c.x1+saw, rw=(g.x+g.w)-rx;
      if(lw>eps) regiones.push({x:g.x,y:g.y,w:lw,h:g.h});
      if(rw>eps) regiones.push({x:rx,y:g.y,w:rw,h:g.h});
    }else{
      const th=c.y1-g.y, by=c.y1+saw, bh=(g.y+g.h)-by;
      if(th>eps) regiones.push({x:g.x,y:g.y,w:g.w,h:th});
      if(bh>eps) regiones.push({x:g.x,y:by,w:g.w,h:bh});
    }
  }

  let liberadas=0;
  if(secuenciaValida){
    for(const p of ps){
      const cont=regiones.filter(g=>p.x>=g.x-eps&&p.y>=g.y-eps&&p.x+p.base<=g.x+g.w+eps&&p.y+p.altura<=g.y+g.h+eps);
      if(cont.length===1){
        const g=cont[0];
        if(Math.abs(g.x-p.x)<eps&&Math.abs(g.y-p.y)<eps&&Math.abs(g.w-p.base)<eps&&Math.abs(g.h-p.altura)<eps) liberadas++;
      }
    }
  }
  const secuenciaCompleta=secuenciaValida && liberadas===ps.length;

  return {
    geometriaValida:errores.length===0,
    errores,
    secuenciaValida,
    secuenciaCompleta,
    liberadas,
    piezas:ps.length,
    corteFallido,
    terminales:cortes.filter(c=>c.terminal).length,
  };
}

function validarPlanIndustrial(resultado, expectedPieceCount){
  const opts=resultado.opts||{};
  const placas=resultado.placas||[];
  const placasVal=placas.map(p=>validarPlacaIndustrial(p,opts));
  const ids=[];
  for(const p of placas) for(const c of (p.colocadas||[])) ids.push(c.pieza?.id);
  const validIds=ids.filter(id=>id!==undefined&&id!==null);
  const unicos=new Set(validIds);
  const duplicados=validIds.filter((id,i,a)=>a.indexOf(id)!==i);
  const totalEsperado=expectedPieceCount ?? resultado.resumen?.piezas ?? validIds.length;
  const coberturaCompleta=validIds.length===totalEsperado && unicos.size===totalEsperado;
  const ok=placasVal.every(v=>v.geometriaValida&&v.secuenciaCompleta) && coberturaCompleta;
  return {
    ok,
    placas:placas.length,
    piezasEsperadas:totalEsperado,
    piezasColocadas:validIds.length,
    idsUnicos:unicos.size,
    duplicados:[...new Set(duplicados)],
    coberturaCompleta,
    geometriaValida:placasVal.every(v=>v.geometriaValida),
    secuenciaCompleta:placasVal.every(v=>v.secuenciaCompleta),
    cortesTerminales:placasVal.reduce((s,v)=>s+v.terminales,0),
    detallePlacas:placasVal,
  };
}

if(typeof module!=='undefined') module.exports={validarPlacaIndustrial,validarPlanIndustrial};
