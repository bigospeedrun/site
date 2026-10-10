import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyEvidence,evidenceLevels,isBoardEntry,isBreakthroughRecord,isVisibleAtEvidence,breakthroughLabel} from './evidence.ts';
import {logExponent} from './ranking.ts';
test('review levels follow the named repository and proof gates',()=>{
 const base={slug:'integer-multiplication',repo:'CrocSwap/integer-mult-bounds',proofPassed:false};
 assert.equal(classifyEvidence({...base,upstreamStatus:'merged'}),'human-verified');
 assert.equal(classifyEvidence({...base,upstreamStatus:'open'}),'claimed');
 assert.equal(classifyEvidence({...base,upstreamSelected:true}),'human-verified');
 assert.equal(classifyEvidence({...base,repo:'Swapnil-jain/integer-mult-kappa',upstreamStatus:'merged'}),'claimed');
 assert.equal(classifyEvidence({...base,proofPassed:true}),'lean-verified');
 assert.equal(evidenceLevels.length,3);
});
test('displayed logarithmic exponents preserve small savings and round conservatively',()=>{
 assert.equal(logExponent('6685733/10000000000'),'0.9993314267');
 assert.equal(logExponent('1/3'),'0.666666666666667');
 assert.equal(logExponent('1/100000000000000000000'),'1-\\frac{1}{100000000000000000000}');
});

test('open review submissions join the board as Claimed; rejected results and reproductions stay off',()=>{
 const r={repo:'CrocSwap/integer-mult-bounds',upstreamStatus:'open'};
 assert.equal(isBoardEntry('integer-multiplication',r),true);
 assert.equal(classifyEvidence({...r,slug:'integer-multiplication',proofPassed:false}),'claimed');
 assert.equal(isBoardEntry('integer-multiplication',{...r,reproductionOf:'prior-result'}),false);
 assert.equal(isBoardEntry('integer-multiplication',{...r,upstreamStatus:'closed-unmerged'}),false);
 assert.equal(isBoardEntry('integer-multiplication',{...r,upstreamStatus:'merged'}),true);
 assert.equal(isBoardEntry('integer-multiplication',{...r,upstreamStatus:'not-applicable'}),true);
 assert.equal(isBoardEntry('integer-multiplication',{repo:'Swapnil-jain/integer-mult-kappa',upstreamStatus:'not-applicable'}),true);
 assert.equal(isBoardEntry('exact-dft',{repo:'eumemic/exact-dft-bounds',upstreamStatus:'not-applicable'}),true);
 assert.equal(isBoardEntry('3sum',{repo:'anthropics/formal-math',upstreamStatus:'not-applicable',reproductionOf:'original'}),false);
});

test('table bounds keep conservative rounding and strict endpoint notation',async()=>{
 const {boundPrecision,boundExponent,tableBound}=await import('./ranking.ts');
 assert.equal(boundPrecision(['1/10','1/5'],true),3);
 assert.equal(boundExponent('1/3',true,8),'0.66666667');
 assert.equal(boundPrecision(['1/10000000000000','1/50000000000','0'],true),3);
 assert.equal(boundExponent('0',true,8),'1.00000000');
 assert.equal(tableBound({score:'1/50000000000',scoreRelation:'strict-upper-bound',bound:''},true,1),'O(n \\log^{1-2\\cdot 10^{\\scriptstyle -11}+\\varepsilon} n)');
});

test('scientific savings round down, preserve tiny improvements, and separate close records',async()=>{
 const {scientificSaving,boundPrecision}=await import('./ranking.ts');
 assert.equal(scientificSaving('607/1250000',3),'4.85\\cdot 10^{-4}');
 assert.equal(scientificSaving('6685733/10000000000',4),'6.685\\cdot 10^{-4}');
 assert.equal(scientificSaving('1/10000000000000',4),'10^{-13}');
 assert.equal(scientificSaving('1/6129982163463555433433388108601236734474956488734408704',4),'1.631\\cdot 10^{-55}');
 assert.equal(boundPrecision(['6685733/10000000000','6685732/10000000000'],true),7);
 const leaders=['744728650221677/1000000000000000000','372359941334341/500000000000000000','186178624839407/250000000000000000'];
 const digits=boundPrecision(leaders,true);
 assert.equal(digits,6);
 assert.equal(new Set(leaders.map(score=>scientificSaving(score,digits))).size,3);
 assert.equal(scientificSaving(leaders[0],6),'7.44728\\cdot 10^{-4}');
 assert.equal(isBoardEntry('exact-dft',{id:'classical-baseline',repo:'',upstreamStatus:'not-applicable'}),false);
});

test('every board keeps only its first breakthrough when all evidence checkboxes are off',()=>{
 assert.equal(breakthroughLabel,'First breakthrough');
 for(const [slug,id] of [['integer-multiplication','openai-original-109'],['exact-dft','exact-dft-2026'],['3sum','anthropic-2026'],['apsp','anthropic-2026'],['subset-sum','subset-sum-2026']]) {
  const records=[{id,evidenceLevel:'claimed',isBreakthrough:isBreakthroughRecord(slug,id)},{id:'later',evidenceLevel:'lean-verified',isBreakthrough:isBreakthroughRecord(slug,'later')}];
  assert.deepEqual(records.filter(r=>isVisibleAtEvidence(r,[])).map(r=>r.id),[id]);
 }
});
