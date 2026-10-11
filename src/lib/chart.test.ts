import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chartDate, chartRecords, chartScale, chartWindowScale, chartWindow, chartTimeTicks, type ChartEntry } from './chart.ts';
import { ranked } from './ranking.ts';
import { classifyEvidence, evidenceLevels, isBoardEntry, isBreakthroughRecord } from './evidence.ts';
const e=(id:string,score:string,time:number,level='claimed',scoreRelation='attained'):ChartEntry=>({id,repoId:0,score,time,level,scoreRelation,date:new Date(time).toISOString(),author:'',boundHtml:'',url:''});
const allLevels=new Set(evidenceLevels.map(l=>l.id));

// Read pinned board regression fixtures. Only the adapter fields required for admission,
// source-date selection and table ranking are needed by these regression tests.
function boardEntries(slug:string) {
 const source=JSON.parse(readFileSync(new URL('./fixtures/board-regressions.json',import.meta.url),'utf8'))[slug];
 return source.records.map((r:any)=>{
  const m=source.record_metadata?.[r.id]??{};
  const repo=(m.source_url??r.source?.url??r.submission_url)?.match(/^https:\/\/github.com\/([^/]+\/[^/]+)/)?.[1]??'';
  const announcementDate=['openai-original-109','exact-dft-2026','subset-sum-2026'].includes(r.id)&&!m.publication_date?'2026-10-06':undefined;
  const sourceDate=r.id==='directed-sssp-2026'&&!m.publication_date?'2026-09-21T06:31:30Z':undefined;
  const date=m.publication_date??announcementDate??sourceDate??r.submitted_at??r.site_observed_at;
  const record={id:r.id,isBreakthrough:isBreakthroughRecord(slug,r.id),repo,repoId:0,score:r.score,scoreRelation:r.score_relation,upstreamStatus:r.upstream_status??'not-applicable',reproductionOf:m.reproduction_of,date,
   publicationYear:m.publication_date_precision==='year'?m.publication_year:undefined,
   dateLabel:announcementDate?'Announcement date':sourceDate?'Commit date':m.publication_date_role?.toLowerCase().includes('commit')?'Commit date':m.publication_date_role?.includes('paper')?'Paper date':m.publication_date?'Source date':m.date_precision?.includes('observation')||r.submitted_at===r.site_observed_at?'Observed':'Source date',
   raceEventAt:m.race_event_at??(m.publication_date_precision==='date-time'?m.publication_date:undefined)??(m.upstream_selected?r.submitted_at:undefined),
   level:classifyEvidence({slug,repo,upstreamStatus:r.upstream_status,upstreamSelected:m.upstream_selected===true,proofPassed:m.site_tier==='verified'&&r.rerun_status?.state==='passed'&&Boolean(r.rerun_status?.receipt_path)}),
   author:'',boundHtml:'',url:''};
  return record;
 }).filter((r:any)=>isBoardEntry(slug,r));
}
function checkBoardProgression(slug:string, higher:boolean) {
 const board=boardEntries(slug);
 const dated:ChartEntry[]=board.filter((r:any)=>chartDate(r)!==undefined).map((r:any)=>({...r,time:Date.parse(chartDate(r)!)}));
 const direction=higher?'higher-is-better':'lower-is-better';
 const marks=chartRecords(dated,allLevels,higher);
 const top=ranked(board,direction)[0].record;
 assert.ok(chartDate(top as any),'The current table leader has a source date');
 assert.equal(marks.at(-1)?.id,top.id,'Last chart record must be table rank 1');
 for(const mark of marks){
  const available=dated.filter(r=>r.time<=mark.time);
  assert.equal(mark.id,ranked(available,direction)[0].record.id);
 }
 assert.ok(!dated.some(r=>r.id==='classical-baseline'));
 return {dated,marks};
}

test('each fixture board progression ends at its current table leader',()=>{
 for(const slug of ['matrix-multiplication','integer-multiplication','exact-dft','3sum','apsp','subset-sum','directed-sssp']){
  checkBoardProgression(slug,['integer-multiplication','exact-dft'].includes(slug));
 }
});

test('a historical stronger claim beats a later reviewed entry; filters rebuild the line',()=>{
 const regression=[
  e('earlier-claim','472154791/1000000000000',1),
  e('historical-claim','6685733/10000000000',2),
  e('later-reviewed','330942774629799/500000000000000000',3,'human-verified'),
 ];
 const marks=chartRecords(regression,allLevels,true);
 assert.deepEqual(marks.map(r=>r.id),['earlier-claim','historical-claim']);
 assert.equal(marks.at(-1)?.level,'claimed');
 const reviewed=chartRecords(regression,new Set(['human-verified','lean-verified']),true);
 assert.deepEqual(reviewed.map(r=>r.id),['later-reviewed']);
});

test('DFT strict endpoints and attained improvements follow score order',()=>{
 const regression=[
  e('original-endpoint','1/50000000000',1,'lean-verified','strict-upper-bound'),
  e('attained-improvement','73/1000000',2),
  e('improved-endpoint','607/1250000',3,'claimed','strict-upper-bound'),
 ];
 const marks=chartRecords(regression,allLevels,true);
 assert.deepEqual(marks.map(r=>r.id),['original-endpoint','attained-improvement','improved-endpoint']);
 assert.equal(marks[0].scoreRelation,'strict-upper-bound');
 assert.equal(marks.at(-1)?.scoreRelation,'strict-upper-bound');
 assert.deepEqual(chartRecords(regression,new Set(['lean-verified']),true).map(r=>r.id),['original-endpoint']);
});

test('record selection uses table endpoint and tie rules; filters rebuild the line',()=>{
 const entries=[e('a','1/100',1),e('b','2/100',2,'human-verified'),e('c','15/1000',3),e('tie','2/100',4),e('open','1/10',5,'claimed','strict-upper-bound'),e('attained','1/10',6)];
 assert.deepEqual(chartRecords(entries,allLevels,true).map(e=>e.id),['a','b','open','attained']);
 assert.deepEqual(chartRecords(entries,new Set(['claimed']),true).map(e=>e.id),['a','c','tie','open','attained']);
 assert.deepEqual(chartRecords(entries,new Set(),true),[]);
});

test('simultaneous results keep table rank 1 and lower-is-better uses the same table rule',()=>{
 const entries=[e('a','2',1),e('b','1',1),e('c','3/2',2),e('d','1/2',3)];
 assert.deepEqual(chartRecords(entries,allLevels,false).map(e=>e.id),['b','d']);
 assert.equal(chartRecords(entries,allLevels,false).at(-1)?.id,ranked(entries,'lower-is-better')[0].record.id);
});

test('source dates remain valid without priority dates; observations and year-only dates stay off axis',()=>{
 const source={date:'2026-10-09T13:03:10Z',dateLabel:'Source date'};
 assert.equal(chartDate(source),source.date);
 assert.equal(chartDate({...source,dateLabel:'Observed'}),undefined);
 assert.equal(chartDate({...source,publicationYear:2026}),undefined);
 assert.equal(chartDate({...source,date:'not a date'}),undefined);
});

test('scale includes the reference limit; zero and single values stay finite',()=>{
 for(const [values,limit] of [[[.000001,.0006],1],[[.49],0],[[0],1]] as [number[],number][]){
  const s=chartScale(values,limit),v=s.log?Math.log10(limit):limit;
  assert.ok(Number.isFinite(s.lo)&&Number.isFinite(s.hi)&&s.lo<v&&s.hi>v);
 }
 assert.equal(chartScale([.000001,.0006],1).log,true);
});


test('each public race begins with its dated breakthrough',()=>{
 for(const slug of ['matrix-multiplication','integer-multiplication','exact-dft','subset-sum','3sum','apsp']){
  const dated=boardEntries(slug).filter((r:any)=>chartDate(r)).map((r:any)=>({...r,time:Date.parse(chartDate(r)!)}));
  const breakthrough=dated.find((r:any)=>r.isBreakthrough);
  assert.ok(breakthrough,slug+' has a dated breakthrough');
  const first=chartRecords(dated,allLevels,['integer-multiplication','exact-dft'].includes(slug))[0];
  assert.equal(first?.id,breakthrough.id,slug+' begins with its breakthrough');
  assert.equal(first.time,Date.parse(chartDate(breakthrough)!));
 }
});

test('zoom carries the prior record line without inventing a mark at the range boundary',()=>{
 const day=86400000;
 const entries=[e('start','1/1000000000000',0),e('old','1/10000',day),e('recent','1/100',3*day),e('best','1/10',4*day)];
 const full=chartWindow(entries,allLevels,true);
 assert.equal(full.records[0].id,'start');
 assert.equal(full.carry,undefined);
 const zoom=chartWindow(entries,allLevels,true,24);
 assert.equal(zoom.start,3*day);
 assert.equal(zoom.carry?.id,'old');
 assert.deepEqual(zoom.records.map(r=>r.id),['recent','best']);
 const fullScale=chartScale(full.records.map(r=>Number(r.score.split('/')[0])/Number(r.score.split('/')[1])),1);
 const zoomScale=chartScale([zoom.carry!,...zoom.records].map(r=>Number(r.score.split('/')[0])/Number(r.score.split('/')[1])),1);
 assert.ok(zoomScale.lo>fullScale.lo,'zoom rescales the visible record values');
});


test('multi-day date ticks are unique local midnights; short ranges retain distinct minute labels',()=>{
 const start=new Date(2026,9,6,7,23).getTime(),end=new Date(2026,9,9,6,23).getTime();
 const full=chartTimeTicks(start,end,6);
 assert.equal(full.showTimes,false);
 assert.deepEqual(full.times.map(t=>new Date(t).getDate()),[7,8,9]);
 assert.ok(full.times.every(t=>new Date(t).getHours()===0&&new Date(t).getMinutes()===0));
 const short=chartTimeTicks(end-86400000,end,3);
 assert.equal(short.showTimes,true);
 assert.equal(new Set(short.times.map(t=>Math.floor(t/60000))).size,short.times.length);
 assert.equal(chartTimeTicks(end,end,6).times.length,1);
});


test('zoom scales fit visible marks without the limit or offscreen carried record',()=>{
 const entries=[e('old','1/1000000000000',0),e('a','1/10000',3*86400000),e('b','2/10000',4*86400000)];
 const view=chartWindow(entries,allLevels,true,24);
 const zoom=chartWindowScale(view,1,true);
 assert.equal(zoom.log,false);
 assert.ok(zoom.lo>0&&zoom.lo<.0001&&zoom.hi>.0002&&zoom.hi<.001);
 const full=chartWindowScale(chartWindow(entries,allLevels,true),1,false);
 assert.ok(full.hi>0&&full.log);
 for(const values of [[],[0],[.49]]){
  const scale=chartScale(values);
  assert.ok(Number.isFinite(scale.lo)&&Number.isFinite(scale.hi)&&scale.hi>scale.lo);
 }
});


test('breakthrough remains the start of progression for every evidence filter combination',()=>{
 const start={...e('breakthrough','1/1000000000000',0),isBreakthrough:true};
 const entries=[start,e('claim','1/100',1),e('review','1/10',2,'human-verified'),e('proof','1/5',3,'lean-verified')];
 for(let mask=0;mask<8;mask++){
  const levels=new Set<string>(evidenceLevels.filter((_,i)=>mask&(1<<i)).map(l=>l.id));
  const records=chartRecords(entries,levels,true);
  assert.equal(records[0].id,start.id);
  assert.ok(records.slice(1).every(r=>levels.has(r.level)));
  if(!mask)assert.deepEqual(records.map(r=>r.id),[start.id]);
  const view=chartWindow(entries,levels,true);
  assert.equal(view.records[0].id,start.id);
  const scale=chartWindowScale(view,1,false);
  assert.ok(scale.lo<Math.log10(1e-12));
 }
});


test('fixture problem boards retain only their breakthrough when all evidence filters are off',()=>{
 for(const slug of ['matrix-multiplication','integer-multiplication','exact-dft','3sum','apsp','subset-sum']){
  const board=boardEntries(slug);
  const dated=board.filter((r:any)=>chartDate(r)).map((r:any)=>({...r,time:Date.parse(chartDate(r)!)}));
  const records=chartRecords(dated,new Set(),['integer-multiplication','exact-dft'].includes(slug));
  assert.equal(records.length,1,slug);
  assert.equal(records[0].isBreakthrough,true,slug);
  assert.equal(records[0].id,board.find((r:any)=>r.isBreakthrough).id,slug);
 }
});


test('nearby exponent ticks have distinct labels at their actual plotted values',()=>{
 for(const values of [[2.995943,2.99942],[2.995943,2.9959431],[.00000000005101691,.00000000005101692]]){
  const {ticks}=chartScale(values);
  assert.equal(new Set(ticks.map(t=>t.tex)).size,ticks.length);
  for(const tick of ticks){
   const decimal=tick.tex.replace(/\\cdot 10\^\{(-?\d+)\}/,'e$1');
   assert.equal(Number(decimal),tick.value);
  }
 }
});


test('APSP and 3SUM separate small improvements without forcing the trivial limit onto the axis',()=>{
 for(const [first,current,classic,limit] of [[2.99942,2.995943,3,2],[1.9992,1.995782,2,1]]){
  const entries=[e('first',`${Math.round(first*1e6)}/1000000`,0),e('current',`${Math.round(current*1e6)}/1000000`,4*86400000)];
  for(const hours of [0,72,24]){
   const scale=chartWindowScale(chartWindow(entries,allLevels,false,hours),limit,hours>0,classic);
   assert.equal(scale.log,false);
   assert.ok(scale.lo>limit&&scale.hi>classic);
   assert.ok(scale.lo<current&&scale.hi>first);
   // Even a 250px plot must separate these records by at least 100px.
   assert.ok((first-current)/(scale.hi-scale.lo)*250>100);
  }
 }
});


test('multi-day ticks respect the phone limit and retain the first and last days',()=>{
 const start=new Date(2026,9,6,7,23).getTime(),end=new Date(2026,9,11,6,23).getTime();
 const ticks=chartTimeTicks(start,end,3);
 assert.deepEqual(ticks.times.map(t=>new Date(t).getDate()),[7,9,11]);
 assert.equal(chartTimeTicks(start,end,1).times.length,1);
});
