import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {factoringBound,factoringPlainBound,tableBound,ranked,progression} from './ranking.ts';
import {chartWindowScale,chartWindow,chartRecords,type ChartEntry} from './chart.ts';
import {plainBound,postBound,feedBoard,message,xMessage,plan,baseline} from './records-feed.ts';
import {landingRecords} from './landing-records.ts';
import type {RecordEntry} from './types.ts';

// Integer factoring scores one scale (Lead, 2026-10-30): N^{c+o(1)} scores -c, N^{o(1)} = 2^{o(b)} scores 0,
// 2^{b/(log b)^{alpha-o(1)}} scores alpha; higher is better. The classic bound scores -1/5.
test('factoring bounds show each part of the scale and never claim more than the score',()=>{
 assert.equal(factoringBound('-1/5'),'N^{0.2+o(1)}');
 assert.equal(factoringBound('-1/2'),'N^{0.5+o(1)}');
 assert.equal(factoringBound('-1/3'),'N^{\\frac{1}{3}+o(1)}');
 assert.equal(factoringBound('0'),'N^{o(1)}');
 assert.equal(factoringBound('1/2'),'2^{b/(\\log b)^{0.5-o(1)}}');
 // Rounding goes toward the weaker bound: c up, alpha down.
 assert.equal(factoringBound('-123456789/1000000000',6),'N^{0.12346+o(1)}');
 assert.equal(factoringBound('123456789/1000000000',6),'2^{b/(\\log b)^{0.12345-o(1)}}');
 assert.equal(factoringPlainBound('-1/5'),'N^(0.2 + o(1))');
 assert.equal(factoringPlainBound('-1/3'),'N^(1/3 + o(1))');
 assert.equal(factoringPlainBound('0'),'N^o(1)');
 assert.equal(factoringPlainBound('1/2'),'2^(b/(log b)^(0.5 - o(1)))');
 for(const score of ['-1/5','0','1/2'])assert.equal(tableBound({score,bound:factoringBound(score)},false,0),factoringBound(score));
});

test('a negative score ranks below zero, and zero below a positive alpha',()=>{
 const row=(id:string,score:string,date:string)=>({id,score,date,repoId:0});
 const rows=[row('classic','-1/5','2022-01-01'),row('claim','0','2026-10-28'),row('rate','1/2','2026-11-01'),row('tie','0','2026-10-29')];
 assert.deepEqual(ranked(rows,'higher-is-better').map(r=>[r.record.id,r.rank,r.tie]),[['rate',1,false],['claim',2,false],['tie',2,true],['classic',4,false]]);
 assert.deepEqual(progression(rows,'higher-is-better').map(r=>r.id),['classic','claim','rate']);
});

test('the chart fits the classic bound -1/5 and the claim at 0 on a linear scale',()=>{
 const entry=(id:string,score:string,time:number):ChartEntry=>({id,score,repoId:0,level:'claimed',time,date:new Date(time).toISOString(),author:'A',boundHtml:'',url:'#',isBreakthrough:id==='claim'});
 const entries=[entry('claim','0',Date.parse('2026-10-28T02:58:40Z'))];
 const levels=new Set(['claimed','human-verified','lean-verified']);
 assert.deepEqual(chartRecords(entries,levels,true).map(e=>e.id),['claim']);
 const scale=chartWindowScale(chartWindow(entries,levels,true),-1/2,false,-1/5);
 assert.equal(scale.log,false);
 assert.ok(scale.lo<-0.2&&scale.hi>0);
 assert.deepEqual(scale.ticks.map(t=>t.tex),['-0.2','-0.15','-0.1','-0.05','0']);
});

test('record posts and the landing table handle -1/5',()=>{
 assert.equal(plainBound('integer-factoring','-1/5'),'N^(0.2 + o(1))');
 const author=(name:string)=>({name,url:'https://example.org/'+name});
 const records=[
  {id:'older',score:'-1/5',scoreRelation:'attained',date:'2026-10-27T00:00:00Z',repoId:0,evidenceLevel:'claimed',authors:[author('Old')]},
  {id:'claim',score:'0',scoreRelation:'attained',date:'2026-10-28T02:58:40Z',repoId:0,evidenceLevel:'claimed',authors:[author('New')]},
 ] as any[];
 const board={...feedBoard({slug:'integer-factoring',direction:'higher-is-better'},records,'Integer Factoring'),table:'big-o' as const};
 assert.equal(board.leader,'claim');
 assert.deepEqual(board.records.map(r=>r.bound),['N^(0.2 + o(1))','N^o(1)']);
 const claim=board.records.find(r=>r.id==='claim')!;
 assert.equal(postBound(board,claim),'N^o(1)');
 assert.match(message(board,claim),/`N\^o\(1\)` \| by New \| Claimed/);
 assert.match(xMessage(board,claim),/New value: N\^o\(1\)/);
 // Seeding the board (the state the site commits) posts nothing; a later rate posts once.
 const seeded=baseline({schema_version:1,boards:[board]} as any);
 assert.equal(plan(seeded,{schema_version:1,boards:[board]} as any).messages.length,0);
 const rate={id:'rate',score:'1/2',scoreRelation:'attained',date:'2026-11-01T00:00:00Z',repoId:0,evidenceLevel:'claimed',authors:[author('Rate')]};
 const next={...feedBoard({slug:'integer-factoring',direction:'higher-is-better'},[...records,rate],'Integer Factoring'),table:'big-o' as const};
 const posted=plan(seeded,{schema_version:1,boards:[next]} as any).messages;
 assert.equal(posted.length,1);
 assert.match(posted[0].content,/2\^\(b\/\(log b\)\^\(0\.5 - o\(1\)\)\)/);
 const landing=(id:string,score:string,extra:Partial<RecordEntry>={})=>({id,score,evidenceLevel:'claimed',date:'2026-10-28T02:58:40Z',repoId:0,dateLabel:'Commit date',...extra} as RecordEntry);
 assert.deepEqual(landingRecords([landing('classic','-1/5',{date:'2026-10-20T00:00:00Z'}),landing('claim','0',{isBreakthrough:true})],'higher-is-better').map(r=>r.id),['classic']);
 assert.deepEqual(landingRecords([landing('classic','-1/5',{date:'2026-10-20T00:00:00Z'}),landing('claim','0')],'higher-is-better').map(r=>r.id),['claim']);
});

// The Rudich and Rousseau row is Lean Verified since the maintainer run 41010705006 (verifier 30d083a, 2026-10-30).
test('the integer factoring data: classic -1/5, breakthrough 0, both Lean rows Lean Verified, same copy under src/data',()=>{
 const data=JSON.parse(readFileSync(new URL('../data/integer-factoring.json',import.meta.url),'utf8'));
 assert.equal(readFileSync(new URL('../data/integer-factoring.json',import.meta.url),'utf8'),readFileSync(new URL('../../data/integer-factoring.json',import.meta.url),'utf8'));
 assert.equal(data.score.direction,'higher-is-better');
 const byId=Object.fromEntries(data.records.map((r:any)=>[r.id,r]));
 assert.equal(byId['classical-baseline'].score,'-1/5');
 assert.equal(byId['rudich-rousseau-2026'].score,'0');
 assert.equal(byId['rudich-rousseau-2026'].tier,'verified');
 assert.equal(data.record_metadata['rudich-rousseau-2026'].site_tier,'verified');
 assert.equal(byId['rudich-rousseau-2026'].rerun_status.state,'passed');
 assert.equal(data.record_metadata['rudich-rousseau-2026'].receipt_url,'https://github.com/bigospeedrun/verifier/actions/runs/41010705006');
 // 1337isnot1337's Lean theorem is Lean Verified since the maintainer run 41108289491 (verifier e6f6793, 2026-10-30).
 assert.equal(byId['1337isnot1337-half-2026'].score,'1/2');
 assert.equal(byId['1337isnot1337-half-2026'].tier,'verified');
 assert.equal(data.record_metadata['1337isnot1337-half-2026'].site_tier,'verified');
 assert.equal(byId['1337isnot1337-half-2026'].submitted_at,'2026-10-30T04:31:52Z');
 assert.equal(byId['1337isnot1337-half-2026'].rerun_status.state,'passed');
 assert.equal(data.record_metadata['1337isnot1337-half-2026'].receipt_url,'https://github.com/bigospeedrun/verifier/actions/runs/41108289491');
});
