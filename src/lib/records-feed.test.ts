import {test} from 'node:test';
import assert from 'node:assert/strict';
import {baseline,plan,plainBound,message,deliver,feedBoard} from './records-feed.ts';
import type {FeedSnapshot,FeedBoard,FeedRecord} from './records-feed.ts';
const row=(id='a',evidence='Claimed',score='1/1000'):FeedRecord=>({id,evidence,score,relation:'attained',authors:['Alice'],bound:plainBound('exact-dft',score)});
const board=(records=[row()],leader='a'):FeedBoard=>({slug:'exact-dft',name:'Fourier Transform',url:'https://bigospeedrun.com/exact-dft',leader,records});
const snapshot=(b=board()):FeedSnapshot=>({schema_version:1,boards:[b]});
test('baseline and unchanged refresh send nothing; a new leader sends once',()=>{
 const initial=baseline(snapshot());assert.equal(plan(initial,snapshot()).messages.length,0);
 const next=snapshot(board([row(),row('b','Claimed','1/900')],'b'));
 const result=plan(initial,next);assert.equal(result.messages.length,1);
 assert.equal(plan(result.state,next).messages.length,0);
 const restored=plan(plan(result.state,snapshot()).state,next);assert.equal(restored.messages.length,0);
});
test('Lean upgrade posts once, including a nonleader; leader plus upgrade is one post',()=>{
 const initial=baseline(snapshot(board([row(),row('b')])));
 const upgraded=snapshot(board([row('a','Lean Verified'),row('b','Lean Verified')],'b'));
 const result=plan(initial,upgraded);assert.equal(result.messages.length,2);
 assert.equal(plan(result.state,upgraded).messages.length,0);
 const downgraded=plan(result.state,snapshot(board([row(),row('b')])));
 assert.equal(plan(downgraded.state,upgraded).messages.length,0);
});
test('Human Verified upgrade or author-name edit alone does not post',()=>{
 const initial=baseline(snapshot());const changed=board([row('a','Human Verified')]);changed.records[0].authors=['Alice Example'];
 assert.equal(plan(initial,snapshot(changed)).messages.length,0);
});
test('exact plain bounds preserve fractions and strict endpoints for all six problems',()=>{
 assert.equal(plainBound('3sum','997891/500000'),'O(n^(997891/500000))');
 assert.equal(plainBound('apsp','2995943/1000000'),'O(n^(2995943/1000000))');
 assert.match(plainBound('matrix-multiplication','9/4'),/9\/4 \+ epsilon/);
 assert.match(plainBound('subset-sum','49/100'),/2\^\(\(49\/100\) \* n\)/);
 assert.match(plainBound('integer-multiplication','1/999999999999999999999'),/1 - 1\/999999999999999999999/);
 assert.match(plainBound('exact-dft','1/1000','strict-upper-bound'),/\+ epsilon.*every fixed epsilon > 0/);
 assert.equal(plainBound('exact-dft','1/1000').includes('epsilon'),false);
});
test('feed leader uses the site exact ranking and ties',()=>{
 const records=[{...row('b'),scoreRelation:'attained',date:'2026-10-11',repoId:0,evidenceLevel:'claimed',authors:[{name:'Alice',url:'https://github.com/alice'}]},
 {...row('a'),scoreRelation:'attained',date:'2026-10-10',repoId:0,evidenceLevel:'claimed',authors:[{name:'Alice',url:'https://github.com/alice'}]}] satisfies Parameters<typeof feedBoard>[1];
 const result=feedBoard({slug:'exact-dft',direction:'higher-is-better'},records,'Fourier Transform');
 assert.equal(result.leader,'a');assert.equal(result.records[0].evidence,'Claimed');
});
test('message contains problem, exact bound, evidence, author and link without mentions',()=>{
 const record=row();record.authors=['@everyone <@123>\nAlice'];
 const text=message(board(),record);assert.match(text,/Fourier Transform: O\(n/);assert.match(text,/Claimed/);assert.match(text,/Alice/);assert.match(text,/https:\/\/bigospeedrun.com\/exact-dft$/);assert.ok(!text.includes('@'));
});
test('webhook delivery disables mentions, confirms sends, and fails soft without retry',async()=>{
 const messages=[{key:'a',content:'One'},{key:'b',content:'Two'},{key:'c',content:'Three'}];let calls=0;
 const send=async(url:unknown,options:any)=>{assert.match(String(url),/\?wait=true$/);assert.equal(options.redirect,'error');assert.deepEqual(JSON.parse(options.body).allowed_mentions,{parse:[]});calls++;if(calls===1)return new Response('',{status:200});if(calls===2)return new Response('',{status:429});throw new Error('connection lost');};
 assert.deepEqual(await deliver('https://discord.com/api/webhooks/123/fake',messages,send as typeof fetch),{sent:1,failed:2});assert.equal(calls,3);
 await assert.rejects(deliver('https://example.com/token',messages,send as typeof fetch),/invalid/);
});
