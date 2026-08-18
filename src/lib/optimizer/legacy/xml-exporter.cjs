// Generated mechanically from Optimizador_V10_Interactivo_Modos_Validacion_XML_Lepton.html.
// Do not edit these legacy files by hand; update the extractor if the source changes.
"use strict";

const DIR_X='x', DIR_Y='y';

const xmlEsc=v=>String(v??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function xmlNum(v){
  const n=+v;
  if(!Number.isFinite(n)) return '0';
  const r=Math.round(n*1000)/1000;
  return Number.isInteger(r)?String(r):String(r).replace(/0+$/,'').replace(/\.$/,'');
}
function espesorDesdeMaterial(material, fallback=18){
  const ms=[...String(material||'').matchAll(/(\d+(?:[.,]\d+)?)\s*MM\b/gi)];
  return ms.length ? parseFloat(ms[ms.length-1][1].replace(',','.')) : fallback;
}
function trimNodo(n,opts){
  if(n.nivel>2) return 0;
  return n.dir===DIR_X ? opts.refiladoX : opts.refiladoY;
}
function dimsNodoXml(n,opts){
  let l=n.dir===DIR_X?n.w:n.h;
  let w=n.dir===DIR_X?n.h:n.w;
  if(n.nivel===1){
    l += n.dir===DIR_X ? opts.refiladoX : opts.refiladoY;
    w += n.dir===DIR_X ? opts.refiladoY : opts.refiladoX;
  }else if(n.nivel===2){
    l += n.dir===DIR_X ? opts.refiladoX : opts.refiladoY;
  }
  return [l,w];
}
function asignarIdsXml(n,estado){
  for(const p of n.partes){
    p._xmlId=estado.id++;
    p.hijo._xmlId=p._xmlId;
  }
  for(let i=n.partes.length-1;i>=0;i--) asignarIdsXml(n.partes[i].hijo,estado);
}
function serializarNodoXml(n,opts,estado,lineas){
  const tag=`no.${estado.no++}`;
  const [l,w]=dimsNodoXml(n,opts);
  lineas.push(`<${tag} l="${xmlNum(l)}" w="${xmlNum(w)}" trim="${xmlNum(trimNodo(n,opts))}" x="${xmlNum(n.x)}" y="${xmlNum(n.y)}" layer="${n.nivel}" id="${n._xmlId??0}">`);
  for(const p of n.partes){
    const code=p.type===1 && p.pieza ? (p.pieza._codigoXml||'') : '';
    lineas.push(`<part cut="${xmlNum(p.cut)}" num="1" type="${p.type}" id="${p._xmlId}" code="${xmlEsc(code)}" />`);
  }
  lineas.push(`</${tag}>`);
  for(let i=n.partes.length-1;i>=0;i--) serializarNodoXml(n.partes[i].hijo,opts,estado,lineas);
}
function exportarProjectXml(res,meta={}){
  if(!res?.placas?.length) throw new Error('No hay un plan para exportar.');
  for(const [i,p] of res.placas.entries()) if(!p.arbol) throw new Error(`La placa ${i+1} no contiene árbol guillotina exportable.`);
  const opts=res.opts;
  const material=meta.material||'MATERIAL';
  const thickness=meta.thickness??espesorDesdeMaterial(material,18);
  const lineas=['<?xml version="1.0" encoding="UTF-8" ?>','<project>'];
  let nextId=1, nextNo=1;
  for(let i=0;i<res.placas.length;i++){
    const placa=res.placas[i], arbol=placa.arbol;
    arbol._xmlId=0;
    const ids={id:nextId}; asignarIdsXml(arbol,ids); nextId=ids.id;
    lineas.push(`<panel${i+1} l="${xmlNum(opts.placaBase)}" w="${xmlNum(opts.placaAltura)}" material="${xmlEsc(material)}" thickness="${xmlNum(thickness)}" saw="${xmlNum(opts.sierra)}" num="1">`);
    const ns={no:nextNo}; serializarNodoXml(arbol,opts,ns,lineas); nextNo=ns.no;
    lineas.push(`</panel${i+1}>`);
  }
  lineas.push('</project>');
  return lineas.join('\n');
}


module.exports = { exportarProjectXml, espesorDesdeMaterial };
