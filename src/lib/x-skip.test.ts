import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {breakthroughBar,otherBreakthroughBar,worseThanBreakthrough} from './x-skip.ts';
import {prepare} from './x-posts.ts';
import type {FeedSnapshot,FeedBoard} from './records-feed.ts';
const row=(id:string,score:string,authors:string[]=['Alice'])=>({id,score,relation:'attained',evidence:'Claimed',authors,bound:''});
const board=(slug:string,direction:'lower'|'higher',records:FeedBoard['records']):FeedBoard=>({slug,name:slug,url:'',leader:null,records,direction});
const snapshot:FeedSnapshot={schema_version:1,boards:[
 board('subset-sum','lower',[row('subset-sum-2026','49/100',['OpenAI']),row('a-claim','12/25')]),
 board('exact-dft','higher',[row('exact-dft-2026','1/10000000000000',['OpenAI'])]),
 board('3sum','lower',[row('anthropic-2026','2499/1250',['Josh Alman and Virginia Vassilevska Williams','Anthropic'])]),
 board('apsp','lower',[row('anthropic-2026','149971/50000',['Anthropic'])]),
 board('integer-factoring','higher',[row('rudich-rousseau-2026','0',['Isaac Rudich','Louis-Martin Rousseau'])]),
 board('other-catalan','lower',[row('a-claim','1/2')])]};
const lean=(slug:string,id:string,score:string)=>({key:JSON.stringify([slug,id,score,'attained'])+':lean',x_text:`Record verified!\n\nProblem: ${slug}\nValue: x\nPlayer: Bob\nStatus: Lean Verified`});
test('a Lean Verified bound worse than the breakthrough bound has no X post',()=>{
 for(const score of ['3/4','1/2'])assert.match(worseThanBreakthrough(lean('subset-sum','direct-issue-1',score),snapshot)!,/worse than the breakthrough bound 49\/100/);
});
test('a Lean Verified bound equal to or better than the breakthrough bound posts',()=>{
 for(const score of ['49/100','12/25'])assert.equal(worseThanBreakthrough(lean('subset-sum','direct-issue-1',score),snapshot),undefined);
});
test('a higher-is-better board compares the other way',()=>{
 assert.ok(worseThanBreakthrough(lean('exact-dft','direct-pr-1','1/100000000000000'),snapshot));
 assert.equal(worseThanBreakthrough(lean('exact-dft','direct-pr-1','1/10000000000000'),snapshot),undefined);
 assert.equal(worseThanBreakthrough(lean('exact-dft','direct-pr-1','1/1000000000000'),snapshot),undefined);
});
test('an Anthropic race-start row is a bar too (3SUM, APSP): worse is held back, equal or better posts',()=>{
 assert.match(worseThanBreakthrough(lean('3sum','direct-issue-2','9/4'),snapshot)!,/worse than the breakthrough bound 2499\/1250/);
 assert.equal(worseThanBreakthrough(lean('3sum','direct-issue-2','2499/1250'),snapshot),undefined);
 assert.equal(worseThanBreakthrough(lean('3sum','direct-issue-92','96013971/50000000'),snapshot),undefined);
 assert.ok(worseThanBreakthrough(lean('apsp','direct-issue-4','3/1'),snapshot));
 assert.equal(worseThanBreakthrough(lean('apsp','direct-issue-4','149971/50000'),snapshot),undefined);
 assert.equal(worseThanBreakthrough(lean('apsp','direct-issue-4','29/10'),snapshot),undefined);
});
test('boards whose race-start row has another author, other boards and unknown boards are unchanged',()=>{
 assert.equal(worseThanBreakthrough(lean('integer-factoring','direct-issue-5','0'),snapshot),undefined);
 assert.equal(worseThanBreakthrough(lean('other-catalan','direct-issue-3','9/1'),snapshot),undefined);
 assert.equal(worseThanBreakthrough(lean('unknown-board','direct-issue-4','9/1'),snapshot),undefined);
 assert.equal(worseThanBreakthrough(lean('subset-sum','direct-issue-1','3/4'),undefined),undefined);
});
test('a score that is not a rational logs a warning and leaves the post unchanged',t=>{
 const warn=t.mock.method(console,'warn',()=>{});
 assert.equal(worseThanBreakthrough(lean('subset-sum','direct-issue-1','not a score'),snapshot),undefined);
 assert.equal(warn.mock.callCount(),1);
 assert.match(String(warn.mock.calls[0].arguments[0]),/cannot compare the score/);
});
test('only Lean Verified events are held back; a Claimed or Human Verified post is not',()=>{
 const claim={key:JSON.stringify(['subset-sum','x','3/4','attained'])+':record',x_text:'New claim!\n\nStatus: Claimed (not verified)'};
 assert.equal(worseThanBreakthrough(claim,snapshot),undefined);
 assert.equal(worseThanBreakthrough({...claim,x_text:'New record!\n\nStatus: Human Verified'},snapshot),undefined);
 // A new-record post of a row that already has Lean Verified (key ends :record) is held back as well.
 assert.ok(worseThanBreakthrough({...claim,x_text:'New record!\n\nStatus: Lean Verified'},snapshot));
 assert.equal(worseThanBreakthrough({key:'not json:lean'},snapshot),undefined);
});
test('prepare logs the skip with its reason, uses no batch slot, and never posts it later',()=>{
 const at='2026-11-02T00:00:00.000Z',worse=lean('subset-sum','direct-issue-94','3/4'),better=lean('subset-sum','direct-issue-9','12/25');
 const skip=(post:{key:string;x_text?:string})=>worseThanBreakthrough(post,snapshot);
 const first=prepare([worse,better],{},at,skip);
 assert.deepEqual(first.batch,[better]);
 assert.equal(first.log[worse.key].status,'skipped');assert.match(first.log[worse.key].reason!,/worse than the breakthrough bound/);
 assert.equal(first.log[better.key].status,'unknown');
 // Even without the rule later (or with another snapshot), the logged entry stays skipped.
 assert.deepEqual(prepare([worse],first.log,at).batch,[]);
 // The first run still baselines everything without calling the rule.
 assert.equal(prepare([worse],undefined,at,skip).log[worse.key].reason,'before API start');
});
test('the real feed names the breakthrough bar of each board from its own data',()=>{
 const real=JSON.parse(readFileSync('data/discord-records.json','utf8')).snapshot as FeedSnapshot;
 assert.deepEqual(breakthroughBar(real,'subset-sum'),{score:'49/100',direction:'lower'});
 assert.equal(breakthroughBar(real,'exact-dft')?.direction,'higher');
 assert.equal(breakthroughBar(real,'3sum')?.score,'2499/1250');
 assert.equal(breakthroughBar(real,'apsp')?.direction,'lower');
 assert.equal(breakthroughBar(real,'integer-factoring'),undefined);
 assert.equal(breakthroughBar(real,'other-catalan'),undefined);
});
test('an Other bounds row: the bar is its Agent breakthrough by OpenAI or Anthropic (Lead, 2026-11-07)',()=>{
 // Prime gaps has a Classic baseline (Polymath, 246); its Agent breakthrough is OpenAI's 186, its first claim by agents.
 assert.deepEqual(otherBreakthroughBar('other-prime-gaps'),{score:'186',direction:'lower'});
 assert.match(worseThanBreakthrough(lean('other-prime-gaps','direct-issue-200','246'),snapshot)!,/worse than the breakthrough bound 186/);
 for(const score of ['186','182'])assert.equal(worseThanBreakthrough(lean('other-prime-gaps','direct-issue-200',score),snapshot),undefined);
 // A row with an OpenAI baseline: the baseline is its Agent breakthrough (Snaky: 21 Maker moves; van der Waerden: higher is better).
 assert.deepEqual(otherBreakthroughBar('other-snaky'),{score:'21',direction:'lower'});
 assert.ok(worseThanBreakthrough(lean('other-snaky','direct-issue-201','22'),snapshot));
 for(const score of ['21','20'])assert.equal(worseThanBreakthrough(lean('other-snaky','direct-issue-201',score),snapshot),undefined);
 assert.ok(worseThanBreakthrough(lean('other-van-der-waerden','openai','1/200000'),snapshot));
 assert.equal(worseThanBreakthrough(lean('other-van-der-waerden','openai','1/100000'),snapshot),undefined);
 // A Claimed post is not held back; a bar that is not an exact rational (Catalan: +infinity) or a row whose
 // breakthrough has another author (binary polynomial multiplication: Árpád Csizmadia) gives no bar; no snapshot, no bar.
 assert.equal(worseThanBreakthrough({key:JSON.stringify(['other-prime-gaps','x','246','attained'])+':record',x_text:'Status: Claimed (not verified)'},snapshot),undefined);
 assert.equal(otherBreakthroughBar('other-catalan'),undefined);
 assert.equal(otherBreakthroughBar('other-binary-polynomial-multiplication'),undefined);
 assert.equal(otherBreakthroughBar('other-unknown'),undefined);
 assert.equal(worseThanBreakthrough(lean('other-prime-gaps','direct-issue-200','246'),undefined),undefined);
 // A fixed family list: an Anthropic Agent breakthrough on a Classic-baseline row counts too.
 const fam=[{slug:'row',direction:'higher',baseline:{label:'Classic baseline',value:'1/3',exactValue:'1/3',bound:'',url:'',date:'2020'},
  claims:[{handle:'a',display:'1/2',value:'1/2',date:'2026-10-01T00:00:00Z',agent:true,authors:[{name:'Anthropic (Claude)'}]},
          {handle:'b',display:'2/3',value:'2/3',date:'2026-10-02T00:00:00Z',agent:true,authors:[{name:'OpenAI'}]}]}];
 assert.deepEqual(otherBreakthroughBar('other-row',fam),{score:'1/2',direction:'higher'});
});
