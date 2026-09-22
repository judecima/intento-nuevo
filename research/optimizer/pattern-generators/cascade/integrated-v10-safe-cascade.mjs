import { createRequire } from "node:module";
import { optimizarV10ConMonotypeV2Frozen } from "../monotype/integrated-v10-monotype-v2-frozen.mjs";
import { optimizarV10ConGuideRowR3MV4 } from "../guide-row/integrated-v10-r3m-v4.mjs";

const require=createRequire(import.meta.url);
const {optimizarV10,nuevasMetricas}=
  require("../../../../src/lib/optimizer/legacy/v10.cjs");

export const SAFE_FAST_PATH_CASCADE_VERSION="safe-fast-path-cascade-v1-20260922";

function routeFor(lines){
  if(Array.isArray(lines)&&lines.length===1)return "MONOTYPE_V2";
  if(Array.isArray(lines)&&lines.length>=2&&lines.length<=3)return "R3M_V4";
  return "V3";
}

/**
 * Research-only composition of the strongest frozen fast paths.
 *
 * Routing is disjoint:
 * - one type -> externally validated Monotype-v2 frozen envelope
 * - two/three types -> frozen R3-M-v4 candidate
 * - everything else -> current V3
 *
 * Each child owns its own certification and V3 fallback. The cascade never
 * turns a child miss into an acceptance.
 */
export function optimizarV10ConSafeFastPathCascade(
  lines,
  config,
  metricas=nuevasMetricas(),
){
  const started=process.hrtime.bigint();

  if(config?.safeFastPathCascadeExperimental!==true){
    const result=optimizarV10(lines,config,metricas);
    return {
      ...result,
      safeCascade:{
        version:SAFE_FAST_PATH_CASCADE_VERSION,
        route:"V3",
        certified:false,
        reason:"FLAG_OFF",
        wallMs:Number(process.hrtime.bigint()-started)/1e6,
      },
    };
  }

  const route=routeFor(lines);

  if(route==="MONOTYPE_V2"){
    const result=optimizarV10ConMonotypeV2Frozen(
      lines,
      {
        ...config,
        monotypeV2FrozenExperimental:true,
      },
      metricas,
    );
    return {
      ...result,
      safeCascade:{
        version:SAFE_FAST_PATH_CASCADE_VERSION,
        route,
        certified:Boolean(result?.monotypeV2Frozen?.certified),
        reason:result?.monotypeV2Frozen?.reason||"UNKNOWN",
        wallMs:Number(process.hrtime.bigint()-started)/1e6,
      },
    };
  }

  if(route==="R3M_V4"){
    const result=optimizarV10ConGuideRowR3MV4(
      lines,
      {
        ...config,
        guideRowR3MV4Experimental:true,
      },
      metricas,
    );
    return {
      ...result,
      safeCascade:{
        version:SAFE_FAST_PATH_CASCADE_VERSION,
        route,
        certified:Boolean(result?.guideRowR3MV4?.certified),
        reason:result?.guideRowR3MV4?.reason||"UNKNOWN",
        wallMs:Number(process.hrtime.bigint()-started)/1e6,
      },
    };
  }

  const result=optimizarV10(lines,config,metricas);
  return {
    ...result,
    safeCascade:{
      version:SAFE_FAST_PATH_CASCADE_VERSION,
      route:"V3",
      certified:false,
      reason:"NO_FAST_PATH",
      wallMs:Number(process.hrtime.bigint()-started)/1e6,
    },
  };
}
