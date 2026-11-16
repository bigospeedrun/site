import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyEvidence,classifyOtherEvidence,otherReviewPrUrl,evidenceLevels,isBoardEntry,isBreakthroughRecord,isVisibleAtEvidence,breakthroughLabel} from './evidence.ts';
import {logExponent} from './ranking.ts';
test('review levels follow the named repository and proof gates',()=>{
 const base={slug:'integer-multiplication',repo:'CrocSwap/integer-mult-bounds',proofPassed:false};
 // Lead ruling b3, 2026-10-30: a merge alone is not review (crocswapVerification decides certified).
 assert.equal(classifyEvidence({...base,certified:true}),'human-verified');
 assert.equal(classifyEvidence({...base,certified:false}),'claimed');
 assert.equal(classifyEvidence({...base}),'claimed');
 assert.equal(classifyEvidence({...base,upstreamSelected:true}),'human-verified');
 assert.equal(classifyEvidence({...base,repo:'Swapnil-jain/integer-mult-kappa',certified:true}),'claimed');
 assert.equal(classifyEvidence({...base,slug:'exact-dft',certified:true}),'claimed');
 assert.equal(classifyEvidence({...base,certified:true,proofPassed:true}),'lean-verified');
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
 assert.equal(tableBound({score:'5989/2000',scoreRelation:'strict-upper-bound',bound:'O(n^{2.9945+\\varepsilon})'},false,4),'O(n^{2.9945+\\varepsilon})');
 // The exponent multiplies n as a whole: 2^{(a+eps)n}, never 2^{a+eps n}.
 assert.equal(tableBound({score:'49/100',scoreRelation:'strict-upper-bound',bound:'O(2^{(0.49+\\varepsilon)n})'},false,2),'O(2^{(0.49+\\varepsilon)n})');
 assert.equal(tableBound({score:'49/100',bound:'O(2^{0.49n})'},false,2),'O(2^{0.49n})');
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

test('every board keeps only its agent breakthrough when all evidence checkboxes are off',()=>{
 assert.equal(breakthroughLabel,'Agent breakthrough');
 for(const [slug,id] of [['integer-multiplication','openai-original-109'],['exact-dft','exact-dft-2026'],['3sum','anthropic-2026'],['apsp','anthropic-2026'],['subset-sum','subset-sum-2026']]) {
  const records=[{id,evidenceLevel:'claimed',isBreakthrough:isBreakthroughRecord(slug,id)},{id:'later',evidenceLevel:'lean-verified',isBreakthrough:isBreakthroughRecord(slug,'later')}];
  assert.deepEqual(records.filter(r=>isVisibleAtEvidence(r,[])).map(r=>r.id),[id]);
 }
});

test('an Other bounds claim is Human Verified only when its row names a review repository and that repository merged the pull request',()=>{
 const repo={name:'GTimG/QuasiRiemannTracker',url:'https://github.com/GTimG/QuasiRiemannTracker'};
 const claim=(status:string,evidence='claimed')=>({evidence,review:{pr:63,status}});
 assert.equal(classifyOtherEvidence(repo,claim('merged')),'human-verified');
 assert.equal(classifyOtherEvidence(repo,claim('open')),'claimed');
 assert.equal(classifyOtherEvidence(repo,claim('closed')),'claimed');
 assert.equal(classifyOtherEvidence(repo,{evidence:'claimed'}),'claimed');
 assert.equal(classifyOtherEvidence(undefined,claim('merged')),'claimed');
 assert.equal(classifyOtherEvidence(repo,claim('merged','lean-verified')),'lean-verified');
 assert.equal(classifyOtherEvidence(undefined,{evidence:'lean-verified'}),'lean-verified');
 assert.equal(otherReviewPrUrl(repo,{pr:63,status:'merged'}),'https://github.com/GTimG/QuasiRiemannTracker/pull/63');
});

test('each refile or port line on the site links to its definition on the About page (Nil, 2026-11-15)',async()=>{
 const {creditLines,creditLine,creditLineUrl}=await import('./evidence.ts');
 assert.deepEqual(creditLines.map(c=>c.id),['ported','refiled']);
 assert.equal(creditLineUrl('Ported by Big O Speedrun'),'/about#ported');
 assert.equal(creditLineUrl('Ported by MultiAgency swarm'),'/about#ported');
 assert.equal(creditLineUrl('Refiled by MultiAgency swarm'),'/about#refiled');
 assert.equal(creditLineUrl('Something else'),'/about#credit-lines');
 for(const c of creditLines)assert.match(c.definition,/is not an author\.$/);
 assert.equal(creditLine('Refiled by X')?.name,'Refiled by');
 // Every line in the data has a definition.
 const {readFileSync}=await import('node:fs');
 const lines=new Set<string>();
 const {readdirSync}=await import('node:fs');
 for(const file of ['data/direct-notes.json','data/direct-other.json','data/prove2me.json'])for(const m of readFileSync(file,'utf8').matchAll(/"refiledBy": "([^"]+)"/g))lines.add(m[1]);
 // Every board file, so a porter line on a new board is covered too (Reviewer note on 17e21573).
 for(const file of readdirSync('src/data').filter(f=>f.endsWith('.json')))for(const m of readFileSync('src/data/'+file,'utf8').matchAll(/"refiled_by": "([^"]+)"/g))lines.add(m[1]);
 assert.ok(lines.size>=3);
 for(const line of lines)assert.ok(creditLine(line),line);
});
