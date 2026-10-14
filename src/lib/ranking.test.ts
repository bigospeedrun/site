import { test } from 'node:test';import assert from 'node:assert/strict';import { compare, ranked, progression, scorePrecision, scoreNumber, decimal, scientificSaving } from './ranking.ts';
test('long exact scores give finite numbers and short decimals',()=>{
 // CrocSwap PR 1485 (2026-10-14) and a 4096-char score: parts far above 10^308.
 const pr1485='20960690363391523577580709653432407743905609243880940785042064888139458190150120618947308645517306787411594297629927718189245834345548007/125'+'0'.repeat(137);
 assert.equal(pr1485.length,278);assert.equal(decimal(pr1485),'0.001676855229');assert.equal(scientificSaving(pr1485,3),'1.67\\cdot 10^{-3}');
 const huge='3'.repeat(2046)+'/'+'1'+'0'.repeat(2048);assert.equal(huge.length,4096);
 assert.ok(Math.abs(scoreNumber(huge)/0.0033333333333333335-1)<1e-15);
 assert.equal(scoreNumber('-'+huge),-scoreNumber(huge));
 for(const s of ['0','1','1/3','-7/2','330942774629799/500000000000000000','9007199254740993/9007199254740992'])
  assert.ok(Math.abs(scoreNumber(s)-Number(s.split('/')[0])/Number(s.split('/')[1]??'1'))<=Math.abs(scoreNumber(s))*1e-15,s);
});
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


test('bound exponents retain all source digits and exact repeating fractions',async()=>{
 const {tableBound}=await import('./ranking.ts');
 for(const [score,expected] of [['2995943/1000000','2.995943'],['149971/50000','2.99942'],['1999999999999999999/1000000000000000000','1.999999999999999999'],['1/3','\\frac{1}{3}']]){
  assert.equal(tableBound({score,bound:'O(n^{x})'},false,4),`O(n^{${expected}})`);
 }
});

test('pinned problem fixtures keep distinct scores visible and never overstate a saving',async()=>{
 const {readFileSync}=await import('node:fs');
 const {boundPrecision,tableBound,scientificSaving}=await import('./ranking.ts');
 for(const slug of ['matrix-multiplication','integer-multiplication','exact-dft','3sum','apsp','subset-sum','directed-sssp']){
  const data=JSON.parse(readFileSync(new URL('./fixtures/board-regressions.json',import.meta.url),'utf8'))[slug];
  const kappa=data.score.symbol==='kappa';
  const scores:string[]=data.records.map((r:any)=>r.score);
  const digits=boundPrecision(scores,kappa);
  const labels=new Map<string,string>();
  for(const score of scores){
   const label=tableBound({score,bound:'O(n^{x})'},kappa,digits);
   if(labels.has(label))assert.equal(compare(score,labels.get(label)!),0,`${slug}: distinct scores share ${label}`);
   labels.set(label,score);
   if(kappa){
    const tex=scientificSaving(score,digits);
    const match=tex.match(/^(?:(\d+(?:\.\d+)?)\\cdot )?10\^\{(-?\d+)\}$/);
    const coefficient=match?match[1]??'1':tex;
    const exponent=match?Number(match[2]):0;
    const decimals=coefficient.split('.')[1]?.length??0;
    const n=BigInt(coefficient.replace('.',''));
    const shift=exponent-decimals;
    const shown=shift>=0?`${n*10n**BigInt(shift)}`:`${n}/${10n**BigInt(-shift)}`;
    assert.ok(compare(shown,score)<=0,`${slug}: saving exceeds the source`);
   }
  }
 }
});
