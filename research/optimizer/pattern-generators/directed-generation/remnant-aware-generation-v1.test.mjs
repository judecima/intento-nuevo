import assert from 'node:assert/strict';import test from 'node:test';
import{certifiedAugmentEquivalentPatterns}from'./remnant-aware-generation-v1.mjs';
const r=a=>({w:a,h:1});const p=(id,restos,uso=[[0,1]],area=100)=>({uso:new Map(uso),area,placa:{restos:restos.map(r),arbol:null,colocadas:[],cortes:[]},provenance:{id}});const cfg={restoMin:0,restoMax:0};
test('replaces only certified equivalent vector',()=>{const a=p('a',[100,80]),b=p('b',[110,90]);const x=certifiedAugmentEquivalentPatterns([a],[b],cfg);assert.equal(x.patterns[0].provenance.id,'b');assert.equal(x.stats.certifiedReplacements,1)});
test('ignores candidate with a new coverage vector',()=>{const a=p('a',[100]),b=p('b',[200],[[1,1]]);const x=certifiedAugmentEquivalentPatterns([a],[b],cfg);assert.equal(x.patterns[0].provenance.id,'a');assert.equal(x.stats.ignoredNewVectors,1)});
test('rejects equivalent candidate with remnant regression',()=>{const a=p('a',[100,90]),b=p('b',[110,80]);const x=certifiedAugmentEquivalentPatterns([a],[b],cfg);assert.equal(x.patterns[0].provenance.id,'a');assert.equal(x.stats.rejectedUncertified,1)});
