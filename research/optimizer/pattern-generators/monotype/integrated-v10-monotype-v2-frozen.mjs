import { createRequire } from "node:module";
import { optimizarV10ConMonotypeRemnantFirst } from "./integrated-v10-monotype-remnant-first.mjs";

const require=createRequire(import.meta.url);
const {optimizarV10,nuevasMetricas}=
  require("../../../../src/lib/optimizer/legacy/v10.cjs");

export const MONOTYPE_V2_FROZEN_VERSION="monotype-remnant-first-v2-frozen-20260922";

function pieceCount(lines){
  return lines.reduce((s,l)=>s+Number(l?.cant||0),0);
}

/**
 * Frozen externally-validated geometry envelope for Monotype v2.
 *
 * This wrapper deliberately restricts the broader research v3 implementation
 * back to the exact v2 envelope that passed the 13,839-case sealed holdout:
 * - exactly one logical type
 * - 1..300 pieces
 * - non-directional
 * - explicit rotation not locked
 * - trim 0/0
 *
 * Outside the envelope it delegates directly to current V3.
 */
export function optimizarV10ConMonotypeV2Frozen(
  lines,
  config,
  metricas=nuevasMetricas(),
){
  const started=process.hrtime.bigint();

  let reason=null;
  if(config?.monotypeV2FrozenExperimental!==true)reason="FLAG_OFF";
  else if(!Array.isArray(lines)||lines.length!==1)reason="NOT_MONOTYPE";
  else if(pieceCount(lines)<1||pieceCount(lines)>300)reason="PIECES_OUTSIDE_1_300";
  else if(config?.materialConVeta===true)reason="DIRECTIONAL_EXCLUDED";
  else if(lines[0]?.canRotate===false||lines[0]?.veta===true)reason="ROTATION_LOCKED_EXCLUDED";
  else if(Number(config?.refiladoX||0)!==0||Number(config?.refiladoY||0)!==0)
    reason="TRIM_OUTSIDE_FROZEN_V2";

  if(reason){
    const result=optimizarV10(lines,config,metricas);
    return {
      ...result,
      monotypeV2Frozen:{
        version:MONOTYPE_V2_FROZEN_VERSION,
        attempted:false,
        certified:false,
        reason,
        wallMs:Number(process.hrtime.bigint()-started)/1e6,
      },
    };
  }

  const result=optimizarV10ConMonotypeRemnantFirst(
    lines,
    {
      ...config,
      monotypeRemnantFirstExperimental:true,
    },
    metricas,
  );

  return {
    ...result,
    monotypeV2Frozen:{
      version:MONOTYPE_V2_FROZEN_VERSION,
      attempted:Boolean(result?.monotypeRemnantFirst?.attempted),
      certified:Boolean(result?.monotypeRemnantFirst?.certified),
      reason:result?.monotypeRemnantFirst?.reason||"UNKNOWN",
      lowerBound:result?.monotypeRemnantFirst?.lowerBound||null,
      quality:result?.monotypeRemnantFirst?.quality||null,
      wallMs:Number(process.hrtime.bigint()-started)/1e6,
    },
  };
}
