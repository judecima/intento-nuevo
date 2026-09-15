import { generateSubsetPatterns, solvePatternPool } from '../subset-generator/rescue-generator.mjs';

export const P13_FROZEN_ROUNDS = Object.freeze([0,7,11,12,14,15,16,17,18,19,21,26,35]);
export const P13_AFTER_ROUND0 = Object.freeze(P13_FROZEN_ROUNDS.filter((round) => round !== 0));
const DEFAULT_GENERATION_OPTIONS = Object.freeze({ passes:2,restartsPerBoard:14,rescue:true,beam:false });

export function runDirectedP13(lines, config, { lowerBound, incumbentBoards, earlyMasterLimitMs=1500, fullMasterLimitMs=20000 }={}) {
  if (!Number.isFinite(lowerBound) || !Number.isFinite(incumbentBoards)) throw new TypeError('runDirectedP13 requires finite lowerBound and incumbentBoards');
  const round0=generateSubsetPatterns(lines,config,{maskRounds:[0],...DEFAULT_GENERATION_OPTIONS});
  const early=solvePatternPool(lines,config,round0.patterns,{incumbentBoards,masterLimitMs:earlyMasterLimitMs,includeMonotypes:true});
  if(early.placas===lowerBound)return{...early,certified:true,stage:'ROUND0',selectedRounds:[0],generationCpuMs:round0.generationCpuMs};
  const rest=generateSubsetPatterns(lines,config,{maskRounds:P13_AFTER_ROUND0,...DEFAULT_GENERATION_OPTIONS});
  const final=solvePatternPool(lines,config,[...round0.patterns,...rest.patterns],{incumbentBoards,masterLimitMs:fullMasterLimitMs,includeMonotypes:true});
  return{...final,certified:final.placas===lowerBound,stage:'P13_FULL',selectedRounds:[...P13_FROZEN_ROUNDS],generationCpuMs:round0.generationCpuMs+rest.generationCpuMs};
}
