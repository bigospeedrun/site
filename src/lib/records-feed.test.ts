import {test} from 'node:test';
import assert from 'node:assert/strict';
import {baseline,plan,plainBound,message,deliver,feedBoard,appendRecordPost} from './records-feed.ts';
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
test('decimal plain bounds preserve site precision and strict endpoints for all six problems',()=>{
 assert.equal(plainBound('3sum','997891/500000'),'O(n^1.995782)');
 assert.equal(plainBound('apsp','2995943/1000000'),'O(n^2.995943)');
 assert.match(plainBound('matrix-multiplication','9/4'),/2\.25 \+ epsilon/);
 assert.match(plainBound('subset-sum','49/100'),/2\^\(0\.49n\)/);
 assert.match(plainBound('integer-multiplication','1/999999999999999999999'),/1 - 0\.000000000000000000001/);
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
 const text=message(board(),record);assert.match(text,/Fourier Transform: new record O\(n/);assert.match(text,/Claimed/);assert.match(text,/Alice/);assert.match(text,/https:\/\/bigospeedrun.com\/exact-dft$/);assert.ok(!text.includes('@'));
});
test('webhook delivery disables mentions, confirms sends, and fails soft without retry',async()=>{
 const messages=[{key:'a',content:'One'},{key:'b',content:'Two'},{key:'c',content:'Three'}];let calls=0;
 const send=async(url:unknown,options:any)=>{assert.match(String(url),/\?wait=true$/);assert.equal(options.redirect,'error');assert.deepEqual(JSON.parse(options.body).allowed_mentions,{parse:[]});calls++;if(calls===1)return new Response('',{status:200});if(calls===2)return new Response('',{status:429});throw new Error('connection lost');};
 assert.deepEqual(await deliver('https://discord.com/api/webhooks/123/fake',messages,send as typeof fetch),{sent:1,failed:2});assert.equal(calls,3);
 await assert.rejects(deliver('https://example.com/token',messages,send as typeof fetch),/invalid/);
});

test('decimal saving expansion and author wording follow the requested message format',()=>{
 assert.equal(plainBound('exact-dft','47171/62500000','attained',6),'O(n log^(1 - 0.000754736) n)');
 const record=row();record.authors=['jacobalansussman','chafreaky'];record.bound=plainBound('exact-dft','47171/62500000','attained',6);
 assert.equal(message(board(),record),'Fourier Transform: new record O(n log^(1 - 0.000754736) n). Claimed. By jacobalansussman and chafreaky. https://bigospeedrun.com/exact-dft');
 assert.match(message(board(),record,false),/: record verified /);
});


test('only Discord-accepted messages enter the log, before the next send',async()=>{
 const messages=[{key:'a',content:'Exact text.\nhttps://bigospeedrun.com/exact-dft'},{key:'b',content:'Rejected'},{key:'c',content:'Lost response'},{key:'d',content:'Last accepted.'}];
 let posts:ReturnType<typeof appendRecordPost>=[];
 let calls=0;
 const send=async()=>{
  calls++;
  if(calls>1)assert.equal(posts[0].text,messages[0].content);
  if(calls===2)return new Response('',{status:429});
  if(calls===3)throw new Error('connection lost');
  return new Response('',{status:200});
 };
 const result=await deliver('https://discord.com/api/webhooks/123/fake',messages,send as typeof fetch,entry=>{
  posts=appendRecordPost(posts,entry,'2026-10-11T17:00:00.000Z');
 });
 assert.deepEqual(result,{sent:2,failed:2});
 assert.deepEqual(posts,[{key:'a',text:messages[0].content,posted_at:'2026-10-11T17:00:00.000Z'},
  {key:'d',text:'Last accepted.',posted_at:'2026-10-11T17:00:00.000Z'}]);
});

test('record post log keeps the newest 500 exact texts and deduplicates keys',()=>{
 let posts:ReturnType<typeof appendRecordPost>=[];
 for(let n=0;n<502;n++)posts=appendRecordPost(posts,{key:String(n),content:'Post '+n},new Date(n*1000).toISOString());
 assert.equal(posts.length,500);assert.equal(posts[0].key,'2');assert.equal(posts.at(-1)?.key,'501');
 const repeated=appendRecordPost(posts,{key:'501',content:'Changed'},'2099-01-01T00:00:00.000Z');
 assert.deepEqual(repeated,posts);
 assert.equal(posts.at(-1)?.text,'Post 501');
});

test('log failure does not retry or interrupt Discord sends',async()=>{
 let calls=0;
 await assert.rejects(deliver('https://discord.com/api/webhooks/123/fake',
  [{key:'a',content:'One'},{key:'b',content:'Two'}],
  (async()=>{calls++;return new Response('',{status:200});}) as typeof fetch,
  ()=>{throw new Error('disk failure');}),/log could not be saved/);
 assert.equal(calls,2);
});


test('send CLI persists accepted posts even when another Discord send fails',async()=>{
 const {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const {spawnSync}=await import('node:child_process');
 const root=mkdtempSync(join(tmpdir(),'records-posts-test-'));
 try{
  mkdirSync(join(root,'data'));
  writeFileSync(join(root,'data/records-posts.json'),'[]\n');
  const content='Exact Discord punctuation. https://bigospeedrun.com/exact-dft';
  writeFileSync(join(root,'batch.json'),JSON.stringify([{key:'accepted',content},{key:'failed',content:'Not posted'}]));
  const script=new URL('../../scripts/discord-records.ts',import.meta.url).href;
  const code=`process.chdir(${JSON.stringify(root)});process.argv=['node','script','send','batch.json'];let calls=0;globalThis.fetch=async()=>new Response('',{status:++calls===1?200:500});await import(${JSON.stringify(script)});`;
  const result=spawnSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',code],
   {encoding:'utf8',env:{...process.env,DISCORD_RECORDS_WEBHOOK:'https://discord.com/api/webhooks/123/fake'}});
  assert.equal(result.status,1,result.stderr);
  assert.match(result.stdout,/1 sent, 1 failed/);
  const posts=JSON.parse(readFileSync(join(root,'data/records-posts.json'),'utf8'));
  assert.equal(posts.length,1);assert.equal(posts[0].key,'accepted');assert.equal(posts[0].text,content);
  assert.equal(new Date(posts[0].posted_at).toISOString(),posts[0].posted_at);
 }finally{rmSync(root,{recursive:true,force:true});}
});
