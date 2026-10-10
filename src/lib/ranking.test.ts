import { test } from 'node:test';import assert from 'node:assert/strict';import { compare, ranked, progression, scorePrecision } from './ranking.ts';
test('rational comparisons do not round large integers',()=>{assert.equal(compare('9007199254740993/9007199254740992','1'),1);assert.equal(compare('2/4','1/2'),0);assert.equal(compare('-1/2','0'),-1)});
const rows=[{id:'a',repoId:1,date:'2026-10-01',score:'1/2'},{id:'b',repoId:2,date:'2026-10-02',score:'2/4'},{id:'c',repoId:2,date:'2026-10-03',score:'3/4'}];
test('ties share rank and skip the next rank',()=>assert.deepEqual(ranked(rows,'lower-is-better').map(r=>r.rank),[1,1,3]));
test('progression ignores ties and regressions',()=>{assert.deepEqual(progression(rows,'higher-is-better').map(r=>r.id),['a','c']);assert.deepEqual(progression(rows,'lower-is-better').map(r=>r.id),['a'])});

test('exact ties mark the later entry, including shuffled input',()=>{
 const result=ranked([rows[1],rows[2],rows[0]],'lower-is-better');
 assert.deepEqual(result.map(r=>[r.record.id,r.rank,r.tie]),[['a',1,false],['b',1,true],['c',3,false]]);
});
test('nearby CrocSwap scores retain different ranks and visible values',()=>{
 const scores=['25508460085039/500000000000000000','5101691/100000000000'];
 const records=scores.map((score,i)=>({id:String(i),date:'2026-10-08',repoId:1,score}));
 assert.deepEqual(ranked(records,'higher-is-better').map(r=>[r.rank,r.tie]),[[1,false],[2,false]]);
 const rendered=scores.map(s=>{const [a,b='1']=s.split('/');return (Number(a)/Number(b)).toExponential(scorePrecision(s,scores))});
 assert.notEqual(rendered[0],rendered[1]);assert.equal(scorePrecision(scores[0],scores),6);
});

test('strict endpoints do not tie attained scores or become attained improvements',()=>{
 const base={date:'2026-10-09',repoId:1,score:'1/50000000000'};
 const endpoint={...base,id:'frontier',scoreRelation:'strict-upper-bound'};
 const attained={...base,id:'attained'};
 const result=ranked([endpoint,attained],'higher-is-better');
 assert.equal(result[0].record.id,'attained');assert.equal(result[1].rank,2);assert.equal(result[1].tie,false);
 assert.equal(progression([attained,{...endpoint,date:'2026-10-10'}],'higher-is-better').length,1);
});


test('polynomial table bounds preserve singleton improvements and exact decimal exponents',async()=>{
 const {boundPrecision,tableBound}=await import('./ranking.ts');
 const subsetDigits=boundPrecision(['49/100'],false);
 assert.equal(subsetDigits,2);
 assert.equal(tableBound({score:'49/100',bound:'O(2^{0.49n})'},false,subsetDigits),'O(2^{0.49n})');
 assert.equal(boundPrecision(['997891/500000','2499/1250'],false),6);
 assert.equal(tableBound({score:'997891/500000',bound:'O(n^{1.995782})'},false,6),'O(n^{1.995782})');
});
