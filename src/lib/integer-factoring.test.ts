import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {factoringBound,factoringPlainBound,factoringTheta,factoringBand,tableBound,ranked,progression} from './ranking.ts';
import {chartWindowScale,chartWindow,chartRecords,scoreValue,bandLabel,type ChartEntry} from './chart.ts';
import {plainBound,postBound,feedBoard,message,xMessage,plan,baseline} from './records-feed.ts';
import {landingRecords} from './landing-records.ts';
import type {RecordEntry} from './types.ts';

// Integer factoring scores one scale (Lead, 2026-10-30): N^{c+o(1)} scores -c, N^{o(1)} = 2^{o(b)} scores 0,
// 2^{b/(log b)^{alpha-o(1)}} scores alpha; higher is better. The classic bound scores -1/5.
// Every shown bound is in N (Nil, 2026-11-04): a positive alpha shows as N^{1/(log log N)^{alpha-o(1)}}.
test('factoring bounds show each part of the scale and never claim more than the score',()=>{
 assert.equal(factoringBound('-1/5'),'N^{0.2+o(1)}');
 assert.equal(factoringBound('-1/2'),'N^{0.5+o(1)}');
 assert.equal(factoringBound('-1/3'),'N^{\\frac{1}{3}+o(1)}');
 assert.equal(factoringBound('0'),'N^{o(1)}');
 assert.equal(factoringBound('1/2'),'N^{1/(\\log\\log N)^{1/2-o(1)}}');
 assert.equal(factoringBound('1/3'),'N^{1/(\\log\\log N)^{1/3-o(1)}}');
 // Rounding goes toward the weaker bound: c up, alpha down.
 assert.equal(factoringBound('-123456789/1000000000',6),'N^{0.12346+o(1)}');
 assert.equal(factoringBound('123456789/1000000000',6),'N^{1/(\\log\\log N)^{0.12345-o(1)}}');
 assert.equal(factoringPlainBound('-1/5'),'N^(0.2 + o(1))');
 assert.equal(factoringPlainBound('-1/3'),'N^(1/3 + o(1))');
 assert.equal(factoringPlainBound('0'),'N^o(1)');
 assert.equal(factoringPlainBound('1/2'),'N^(1/(log log N)^(1/2 - o(1)))');
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
 assert.match(posted[0].content,/`N\^\(1\/\(log log N\)\^\(1\/2 - o\(1\)\)\)`/);
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

// The theta band (Lead and Nil, 2026-11-26): time 2^{b^{theta+o(1)}} = 2^{(log N)^{theta+o(1)}} with 0 <= theta < 1 scores
// 101 - theta. Every theta row ranks above every alpha row (alpha <= 100), and a lower theta ranks higher.
test('a theta score shows as 2^{(log N)^{theta+o(1)}}, and alpha up to 100 stays alpha',()=>{
 assert.equal(factoringTheta('401/4'),'3/4');
 assert.equal(factoringTheta('301/3'),'2/3');
 assert.equal(factoringTheta('101'),'0');
 assert.equal(factoringTheta('100'),undefined);
 assert.equal(factoringTheta('1/2'),undefined);
 assert.equal(factoringTheta('-1/5'),undefined);
 assert.equal(factoringBound('401/4'),'2^{(\\log N)^{3/4+o(1)}}');
 assert.equal(factoringBound('301/3'),'2^{(\\log N)^{2/3+o(1)}}');
 assert.equal(factoringBound('101'),'2^{(\\log N)^{o(1)}}');
 assert.equal(factoringBound('1007/10'),'2^{(\\log N)^{0.3+o(1)}}');
 assert.equal(factoringBound('100'),'N^{1/(\\log\\log N)^{100-o(1)}}');
 assert.equal(factoringPlainBound('401/4'),'2^((log N)^(3/4 + o(1)))');
 assert.equal(factoringPlainBound('101'),'2^((log N)^o(1))');
 assert.equal(plainBound('integer-factoring','301/3'),'2^((log N)^(2/3 + o(1)))');
 // A long theta rounds up, so the shown bound is never stronger than the score.
 assert.equal(factoringBound('1009999999/10000000',6),'2^{(\\log N)^{0.00001+o(1)}}');
 for(const score of ['401/4','301/3','101'])assert.equal(tableBound({score,bound:factoringBound(score)},false,0),factoringBound(score));
 assert.deepEqual(['-1/5','0','1/2','401/4'].map(factoringBand),[{band:'N-exponent',value:'1/5'},{band:'N^o(1)',value:'0'},{band:'alpha',value:'1/2'},{band:'theta',value:'3/4'}]);
});

test('every theta row ranks above every alpha row; a lower theta ranks higher; ties go by evidence, then date',()=>{
 const row=(id:string,score:string,date:string,evidenceLevel='claimed')=>({id,score,date,repoId:0,evidenceLevel});
 const rows=[row('classic','-1/5','2022-01-01'),row('zero','0','2026-10-28'),row('alpha','1/2','2026-11-01'),row('alpha-max','100','2026-11-02'),
  row('theta34','401/4','2026-11-20'),row('theta23','301/3','2026-11-25'),row('theta23-lean','301/3','2026-11-26','lean-verified')];
 assert.deepEqual(ranked(rows,'higher-is-better').map(r=>[r.record.id,r.rank]),
  [['theta23-lean',1],['theta23',1],['theta34',3],['alpha-max',4],['alpha',5],['zero',6],['classic',7]]);
 assert.deepEqual(progression(rows,'higher-is-better').map(r=>r.id),['classic','zero','alpha','alpha-max','theta34','theta23']);
});

test('the chart puts the three bands on one ordered axis, with ticks named by band values',()=>{
 assert.deepEqual(['-1/2','-1/5','0','1/2','1','401/4','301/3','101'].map(s=>Number(scoreValue(s,'bands').toFixed(6))),[-0.5,-0.2,0,0.333333,0.5,1.25,1.333333,2]);
 // Without the axis, every other board keeps the plain score.
 assert.equal(scoreValue('401/4'),100.25);
 assert.deepEqual([-0.5,0,1/3,1.25,2].map(bandLabel),['N^{1/2}','N^{o(1)}','\\alpha=1/2','\\theta=3/4','\\theta=0']);
 const entry=(id:string,score:string,time:number):ChartEntry=>({id,score,repoId:0,level:'claimed',time,date:new Date(time).toISOString(),author:'A',boundHtml:'',url:'#'});
 const entries=[entry('alpha','1/2',Date.parse('2026-11-01T00:00:00Z')),entry('theta','401/4',Date.parse('2026-11-20T00:00:00Z')),entry('theta2','301/3',Date.parse('2026-11-25T00:00:00Z'))];
 const levels=new Set(['claimed','human-verified','lean-verified']);
 const scale=chartWindowScale(chartWindow(entries,levels,true),-1/2,false,-1/5,false,'bands');
 assert.equal(scale.log,false);
 // The classic bound is on the board, so the trial-division limit N^{1/2} stays outside the axis (as on the other boards).
 assert.deepEqual(scale.ticks.map(t=>t.tex),['N^{1/5}','N^{o(1)}','\\alpha=1/2','\\theta=3/4','\\theta=2/3']);
 assert.ok(scale.lo<-0.2&&scale.lo>-0.5&&scale.hi>4/3);
 // Without a classic bound, the limit is on the axis.
 assert.ok(chartWindowScale(chartWindow(entries,levels,true),-1/2,false,undefined,false,'bands').ticks.some(t=>t.tex==='N^{1/2}'));
});

test('a first theta row posts as a record over alpha 1/2, with its bound in N',()=>{
 const author=(name:string)=>({name,url:'https://example.org/'+name});
 const records=[{id:'alpha',score:'1/2',scoreRelation:'attained',date:'2026-11-01T00:00:00Z',repoId:0,evidenceLevel:'lean-verified',authors:[author('Alpha')]}] as any[];
 const board={...feedBoard({slug:'integer-factoring',direction:'higher-is-better'},records,'Integer Factoring'),table:'big-o' as const};
 const seeded=baseline({schema_version:1,boards:[board]} as any);
 const theta={id:'theta',score:'401/4',scoreRelation:'attained',date:'2026-11-25T00:00:00Z',repoId:0,evidenceLevel:'claimed',authors:[author('Theta')]};
 const next={...feedBoard({slug:'integer-factoring',direction:'higher-is-better'},[...records,theta],'Integer Factoring'),table:'big-o' as const};
 assert.equal(next.leader,'theta');
 const posted=plan(seeded,{schema_version:1,boards:[next]} as any).messages;
 assert.equal(posted.length,1);
 assert.match(posted[0].content,/`2\^\(\(log N\)\^\(3\/4 \+ o\(1\)\)\)` \| by Theta \| Claimed/);
});

test('the board data allows the theta band: score version 2, maximum 101',()=>{
 const data=JSON.parse(readFileSync(new URL('../data/integer-factoring.json',import.meta.url),'utf8'));
 assert.equal(data.score.version,'2');
 assert.equal(data.score.maximum,'101');
 assert.match(data.score.definition,/scores 101 - theta/);
});

test('the chat knowledge names the band of each factoring row and the scale, on that board only',async()=>{
 const {createKnowledge}=await import('./chat-knowledge.ts');
 const rec=(id:string,score:string)=>({id,score,scoreRelation:'attained',evidenceLevel:'claimed',authors:[],evidence:[],predecessors:[],dependencies:[],date:'2026-11-25T00:00:00Z',dateLabel:'Commit date',repoId:0,bound:factoringBound(score),comparisonNote:''});
 const problem=(slug:string,records:unknown[])=>({slug,title:slug,scope:'',symbol:'s',direction:'higher-is-better',lastDataCheck:'2026-11-26',records,repos:[]});
 const rows=createKnowledge([problem('integer-factoring',[rec('alpha','1/2'),rec('theta','401/4')]),problem('3sum',[])] as any,'2026-11-26').problems as any[];
 const factoring=rows.find(r=>r.path==='/integer-factoring');
 assert.match(factoring.scoreScale,/scores 101 - theta/);
 assert.deepEqual(factoring.current.map((r:any)=>[r.id,r.bound,r.exactScore,r.scaleBand]),[['theta','2^{(\\log N)^{3/4+o(1)}}','401/4',{band:'theta',value:'3/4'}]]);
 assert.deepEqual(rows.filter(r=>'scoreScale' in r).map(r=>r.path),['/integer-factoring']);
});
