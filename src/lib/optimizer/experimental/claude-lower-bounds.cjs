"use strict";

// Recovered V15-V17 lower-bound cascade: area + kerf + raster/normal positions
// + dual-feasible functions + projection + incompatibility clique.
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeLowerBound = computeLowerBound;
exports.strongLowerBound = strongLowerBound;
exports.computeLowerBoundCascade = computeLowerBoundCascade;

const EPS = 1e-9;
const DEFAULTS = {
  usarKerf: true,
  usarDff: true,
  usarRaster: true,
  usarProyeccion: true,
  usarClique: true,
  maxCandidatosDff: 24,
  maxTiposClique: 400,
  rasterMaxPiezas: 40,
  rasterMaxTipos: 16,
  maxCeldasRaster: 200000,
  escalaRaster: 10,
  maxModulosRaster: 512,
};

function medidaCorte(line, opts) {
  let base = +line.base;
  let altura = +line.altura;
  if (opts.descontarCanto && line.cantos) {
    const e = +(opts.cantoEspesor ?? 0);
    base -= (line.cantos.izq ? e : 0) + (line.cantos.der ? e : 0);
    altura -= (line.cantos.arr ? e : 0) + (line.cantos.aba ? e : 0);
  }
  return { base, altura };
}

function orientacionesUtiles(item, W, H) {
  const out = [];
  if (item.w <= W + EPS && item.h <= H + EPS) out.push([item.w, item.h]);
  if (item.rota && Math.abs(item.w - item.h) > EPS && item.h <= W + EPS && item.w <= H + EPS)
    out.push([item.h, item.w]);
  return out;
}

function cotaArea(items, W, H) {
  const areaPlaca = W * H;
  if (!(areaPlaca > 0)) return 0;
  const areaTotal = items.reduce((sum, it) => sum + it.cant * it.w * it.h, 0);
  return Math.ceil(areaTotal / areaPlaca - EPS);
}

function cotaKerf(items, W, H, s) {
  if (!(s > 0)) return 0;
  const areaTotal = items.reduce((sum, it) => sum + it.cant * (it.w + s) * (it.h + s), 0);
  const areaPlaca = (W + s) * (H + s);
  return areaPlaca > 0 ? Math.ceil(areaTotal / areaPlaca - EPS) : 0;
}

function alcanzableMaximo(modulos, capacidad) {
  const reach = new Uint8Array(capacidad + 1);
  reach[0] = 1;
  let maximo = 0;
  for (const { unidad, mult } of modulos) {
    if (unidad <= 0 || unidad > capacidad) continue;
    let restante = Math.min(mult, Math.floor(capacidad / unidad));
    let bloque = 1;
    while (restante > 0) {
      const copias = Math.min(bloque, restante);
      const paso = unidad * copias;
      if (paso <= capacidad) {
        for (let t = capacidad - paso; t >= 0; t--) {
          if (reach[t] && !reach[t + paso]) {
            reach[t + paso] = 1;
            if (t + paso > maximo) maximo = t + paso;
          }
        }
      }
      restante -= copias;
      bloque *= 2;
    }
  }
  return maximo;
}

function criba(items, W, H, s, cfg) {
  const fallback = { aplicado: false, anchoEfectivo: W, altoEfectivo: H };
  if (!cfg.usarRaster) return fallback;
  const escala = cfg.escalaRaster;
  const entero = (x) => {
    const v = x * escala, r = Math.round(v);
    return Math.abs(v - r) <= 1e-6 ? r : null;
  };
  const capX = entero(W + s), capY = entero(H + s);
  if (capX === null || capY === null) return fallback;
  if (capX + 1 > cfg.maxCeldasRaster || capY + 1 > cfg.maxCeldasRaster) return fallback;
  const modX = new Map(), modY = new Map();
  const sumar = (mapa, unidad, mult) => mapa.set(unidad, (mapa.get(unidad) ?? 0) + mult);
  for (const item of items) {
    const ors = orientacionesUtiles(item, W, H);
    if (!ors.length) return fallback;
    for (const [a, b] of ors) {
      const ua = entero(a + s), ub = entero(b + s);
      if (ua === null || ub === null) return fallback;
      sumar(modX, ua, item.cant); sumar(modY, ub, item.cant);
    }
  }
  if (modX.size > cfg.maxModulosRaster || modY.size > cfg.maxModulosRaster) return fallback;
  const listar = (mapa) => [...mapa.entries()].map(([unidad, mult]) => ({ unidad, mult })).sort((a,b)=>a.unidad-b.unidad);
  const maxX = alcanzableMaximo(listar(modX), capX), maxY = alcanzableMaximo(listar(modY), capY);
  if (maxX <= 0 || maxY <= 0) return fallback;
  const anchoEfectivo = Math.min(W, maxX / escala - s), altoEfectivo = Math.min(H, maxY / escala - s);
  if (!(anchoEfectivo > 0) || !(altoEfectivo > 0)) return fallback;
  return { aplicado: true, anchoEfectivo, altoEfectivo };
}

function u(x, e) {
  if (e <= 0) return x;
  if (x > 1 - e + 1e-12) return 1;
  if (x < e - 1e-12) return 0;
  return x;
}

function candidatos(valores, tope) {
  const set = new Set([0, 0.5]);
  for (const v of valores) {
    if (v > 0 && v <= 0.5 + 1e-12) set.add(Math.min(v, 0.5));
    const c = 1 - v;
    if (c > 0 && c <= 0.5 + 1e-12) set.add(Math.min(c, 0.5));
  }
  const orden = [...set].sort((a,b)=>a-b);
  if (orden.length <= tope) return orden;
  const salida = [];
  for (let i=0;i<tope;i++) salida.push(orden[Math.round((i*(orden.length-1))/(tope-1))]);
  return [...new Set(salida)];
}

function cotaDff(items, W, H, s, tope) {
  const anchoPlaca = W + s, altoPlaca = H + s;
  if (!(anchoPlaca > 0) || !(altoPlaca > 0)) return 0;
  const normalizadas = [], vx = [], vy = [];
  for (const item of items) {
    const ors = orientacionesUtiles(item, W, H).map(([a,b]) => [(a+s)/anchoPlaca, (b+s)/altoPlaca]);
    if (!ors.length) return 0;
    normalizadas.push({ cant: item.cant, ors });
    for (const [x,y] of ors) { vx.push(x); vy.push(y); }
  }
  const es = candidatos(vx, tope), ds = candidatos(vy, tope);
  let mejor = 0;
  for (const e of es) for (const d of ds) {
    let total = 0;
    for (const { cant, ors } of normalizadas) {
      let min = Infinity;
      for (const [x,y] of ors) min = Math.min(min, u(x,e) * u(y,d));
      total += cant * min;
    }
    if (total > mejor) mejor = total;
  }
  return Math.ceil(mejor - EPS);
}

function cotaProyeccion(items, W, H, s, eje) {
  const limite = (eje === "x" ? H : W) / 2;
  const capacidad = (eje === "x" ? W : H) + s;
  if (!(capacidad > 0)) return 0;
  let total = 0;
  for (const item of items) {
    const ors = orientacionesUtiles(item, W, H);
    if (!ors.length) return 0;
    let califica = true, menor = Infinity;
    for (const [a,b] of ors) {
      const perpendicular = eje === "x" ? b : a;
      const paralelo = eje === "x" ? a : b;
      if (perpendicular <= limite + EPS) { califica = false; break; }
      if (paralelo < menor) menor = paralelo;
    }
    if (califica) total += item.cant * (menor + s);
  }
  return total > 0 ? Math.ceil(total / capacidad - EPS) : 0;
}

function cabenJuntas(a, b, W, H, s) {
  for (const [a1,b1] of orientacionesUtiles(a,W,H)) for (const [a2,b2] of orientacionesUtiles(b,W,H)) {
    if (a1+s+a2 <= W+EPS && Math.max(b1,b2) <= H+EPS) return true;
    if (b1+s+b2 <= H+EPS && Math.max(a1,a2) <= W+EPS) return true;
  }
  return false;
}

function cotaClique(items, W, H, s, maxTipos) {
  if (items.length > maxTipos) return 0;
  const n = items.length;
  const incompatible = Array.from({length:n},()=>new Array(n).fill(false));
  for (let i=0;i<n;i++) for (let j=i;j<n;j++) {
    const choque = !cabenJuntas(items[i],items[j],W,H,s);
    incompatible[i][j]=choque; incompatible[j][i]=choque;
  }
  const peso = items.map((item,i)=>incompatible[i][i] ? item.cant : 1);
  const grado = items.map((_,i)=>{ let g=0; for(let j=0;j<n;j++) if(j!==i && incompatible[i][j]) g++; return g; });
  const ordenes = [
    [...items.keys()].sort((a,b)=>peso[b]-peso[a] || grado[b]-grado[a] || a-b),
    [...items.keys()].sort((a,b)=>grado[b]-grado[a] || peso[b]-peso[a] || a-b),
  ];
  let mejor = 0;
  for (const orden of ordenes) {
    const clique=[]; let total=0;
    for (const i of orden) {
      if (clique.some(j=>!incompatible[i][j])) continue;
      clique.push(i); total += peso[i];
    }
    mejor=Math.max(mejor,total);
  }
  return mejor;
}

function computeLowerBound(lineas, opts, config = {}) {
  const cfg={...DEFAULTS,...config};
  const s=Math.max(0,+(opts.sierra??0));
  const W=+opts.placaBase-+(opts.refiladoX??0), H=+opts.placaAltura-+(opts.refiladoY??0);
  const vacio={area:0,kerf:0,raster:0,dff:0,proyeccion:0,clique:0,best:0,binding:"area",ancho:W,alto:H,anchoEfectivo:W,altoEfectivo:H,rasterAplicado:false,factible:true};
  if (!(W>0) || !(H>0) || !lineas.length) return vacio;
  const items=[];
  for (const linea of lineas) {
    const cant=Math.max(0,Math.floor(+linea.cant)); if(!cant) continue;
    const {base,altura}=medidaCorte(linea,opts); if(!(base>0)||!(altura>0)) return vacio;
    items.push({w:base,h:altura,cant,rota:!(opts.materialConVeta&&linea.veta)});
  }
  if(!items.length) return vacio;
  const factible=items.every(item=>orientacionesUtiles(item,W,H).length>0);
  if(!factible) return {...vacio,factible:false};
  const area=cotaArea(items,W,H);
  const kerf=cfg.usarKerf?cotaKerf(items,W,H,s):0;
  const raster=criba(items,W,H,s,cfg), Wf=raster.anchoEfectivo, Hf=raster.altoEfectivo;
  const cotaRaster=raster.aplicado?cotaKerf(items,Wf,Hf,s):0;
  const dff=cfg.usarDff?cotaDff(items,Wf,Hf,s,cfg.maxCandidatosDff):0;
  const proyeccion=cfg.usarProyeccion?Math.max(cotaProyeccion(items,Wf,Hf,s,"x"),cotaProyeccion(items,Wf,Hf,s,"y")):0;
  const clique=cfg.usarClique?cotaClique(items,Wf,Hf,s,cfg.maxTiposClique):0;
  let best=area,binding="area";
  for(const [valor,fuente] of [[kerf,"kerf"],[cotaRaster,"raster"],[dff,"dff"],[proyeccion,"proyeccion"],[clique,"clique"]])
    if(valor>best){best=valor;binding=fuente;}
  return {area,kerf,raster:cotaRaster,dff,proyeccion,clique,best,binding,ancho:W,alto:H,anchoEfectivo:Wf,altoEfectivo:Hf,rasterAplicado:raster.aplicado,factible:true};
}

function strongLowerBound(lineas, opts, config) { return computeLowerBound(lineas,opts,config).best; }

function computeLowerBoundCascade(lineas, opts, incumbente, config = {}) {
  const cfg={...DEFAULTS,...config};
  const barata=computeLowerBound(lineas,opts,{...config,usarRaster:false});
  const piezas=lineas.reduce((total,l)=>total+Math.max(0,Math.floor(+l.cant)),0), tipos=lineas.length;
  const excedeTamano=piezas>cfg.rasterMaxPiezas || tipos>cfg.rasterMaxTipos;
  const certifica=incumbente!==undefined && barata.best>=incumbente;
  if(certifica || config.usarRaster===false || !barata.factible || excedeTamano)
    return {...barata,etapa:"barata",rasterCorrio:false,rasterOmitidoPorPolitica:excedeTamano&&!certifica&&config.usarRaster!==false&&barata.factible,bestBarata:barata.best};
  const completa=computeLowerBound(lineas,opts,config);
  return {...completa,best:Math.max(completa.best,barata.best),etapa:"completa",rasterCorrio:completa.rasterAplicado,rasterOmitidoPorPolitica:false,bestBarata:barata.best};
}
