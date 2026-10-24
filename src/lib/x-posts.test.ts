import {test} from 'node:test';
import assert from 'node:assert/strict';
import {credentials,secretNames,oauthHeader,prepare,sendBatch,endpoint,deleteTweet} from './x-posts.ts';
import type {XLog} from './x-posts.ts';
const c={key:'test-key',secret:'test-secret',token:'test-token',tokenSecret:'test-token-secret'};
const posts=Array.from({length:7},(_,i)=>({key:String(i),x_text:'New claim!\n\nProblem: 3SUM\nNew value: O(n^1.962)\nPlayer: Alice\nStatus: Claimed (not verified)'}));
const at='2026-10-12T00:00:00.000Z';
// Public, invalid example credentials from X's OAuth signing guide, not real secrets.
// https://docs.x.com/fundamentals/authentication/oauth-1-0a/creating-a-signature
test('OAuth signature matches the published X fixture',()=>{
 const example={key:'xvz1evFS4wEEPTGEFPHBog',secret:'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw',token:'370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb',tokenSecret:'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE'};
 const header=oauthHeader(example,'https://api.x.com/1.1/statuses/update.json?include_entities=true','kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg','1318622958',{status:'Hello Ladies + Gentlemen, a signed OAuth request!'});
 assert.ok(header.includes('oauth_signature="'+encodeURIComponent('Ls93hJiZbQ3akF3HF3x1Bz8/zU4=')+'"'));
});
test('missing any secret disables X',()=>{
 const env=Object.fromEntries(secretNames.map(name=>[name,'test']));
 assert.ok(credentials(env));
 for(const name of secretNames)assert.equal(credentials({...env,[name]:''}),undefined);
});
test('first run baselines all posts, later runs reserve at most five and dedupe all statuses',()=>{
 const baseline=prepare(posts,undefined,at);
 assert.equal(baseline.batch.length,0);assert.equal(Object.keys(baseline.log).length,7);
 assert.deepEqual(baseline.log['0'],{status:'skipped',at,reason:'before API start'});
 assert.equal(prepare(posts,baseline.log,at).batch.length,0);
 const planned=prepare(posts,{},at);assert.equal(planned.batch.length,5);
 assert.equal(prepare(posts,planned.log,at).batch.length,2);
 const log:XLog={'0':{status:'posted',at,id:'123'},'1':{status:'failed',at,code:403},'2':{status:'unknown',at}};
 assert.deepEqual(prepare(posts.slice(0,3),log,at).batch,[]);
});
test('sender signs JSON, removes legacy URL, confirms IDs, and waits two seconds',async()=>{
 const {log,batch}=prepare(posts,{},at);batch[0]={...batch[0],x_text:batch[0].x_text+'\n\nhttps://bigospeedrun.com/3sum'};
 const waits:number[]=[];let calls=0,saves=0;
 await sendBatch(c,batch,log,()=>{saves++},{sleep:async ms=>{waits.push(ms);},send:(async(url,options)=>{
  assert.equal(url,endpoint);assert.equal(options?.redirect,'error');
  assert.match((options?.headers as Record<string,string>).Authorization,/^OAuth /);
  assert.equal(log[String(calls)].status,'unknown');
  assert.deepEqual(JSON.parse(String(options?.body)),{text:posts[calls].x_text});
  calls++;return new Response(JSON.stringify({data:{id:String(100+calls)}}),{status:201});
 }) as typeof fetch,report:()=>{}});
 assert.equal(calls,5);assert.equal(saves,10);assert.deepEqual(waits,[2000,2000,2000,2000]);
 assert.deepEqual(prepare(posts.slice(0,5),log,at).batch,[]);assert.equal(log['0'].id,'101');
});
test('timeout and malformed success remain unknown and cannot be retried',async()=>{
 for(const send of [async()=>{throw new Error('secret-bearing network exception');},async()=>new Response('bad json',{status:201})]){
  const {log,batch}=prepare(posts.slice(0,1),{},at);const reports:string[]=[];
  await sendBatch(c,batch,log,()=>{},{send:send as typeof fetch,report:line=>reports.push(line)});
  assert.equal(log['0'].status,'unknown');assert.equal(prepare(posts.slice(0,1),log,at).batch.length,0);
  assert.ok(reports.some(line=>line.includes('unknown')));assert.ok(!reports.join('').includes('secret-bearing'));
 }
});
test('429 and 5xx leave pending; other errors fail without retry',async()=>{
 for(const status of [429,500,503,400,403]){
  const {log,batch}=prepare(posts.slice(0,1),{},at);
  await sendBatch(c,batch,log,()=>{},{send:(async()=>new Response('',{status})) as typeof fetch,report:()=>{}});
  if(status===429||status>=500){assert.equal(log['0'],undefined);assert.equal(prepare(posts.slice(0,1),log,at).batch.length,1);}
  else{assert.equal(log['0'].status,'failed');assert.equal(log['0'].code,status);assert.equal(prepare(posts.slice(0,1),log,at).batch.length,0);}
 }
});
test('missing secrets CLI writes nothing',async()=>{
 const {mkdtempSync,readdirSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {spawnSync}=await import('node:child_process');
 const root=mkdtempSync(join(tmpdir(),'x-unconfigured-'));
 try{
  const env={...process.env};for(const key of secretNames)delete env[key];
  const result=spawnSync(process.execPath,['--experimental-strip-types',new URL('../../scripts/x-records.ts',import.meta.url).pathname,'plan','batch.json'],{cwd:root,env,encoding:'utf8'});
  assert.equal(result.status,0);assert.equal(result.stdout.trim(),'X not configured');assert.deepEqual(readdirSync(root),[]);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('a failed status save prevents sending; consumed unknown entries are not sent twice',async()=>{
 const {log,batch}=prepare(posts.slice(0,1),{},at);let calls=0;
 const send=(async()=>{calls++;throw new Error('lost response');}) as typeof fetch;
 await assert.rejects(sendBatch(c,batch,log,()=>{throw new Error('disk full');},{send}));
 assert.equal(calls,0);
 const retry=prepare(posts.slice(0,1),{},at);
 await sendBatch(c,retry.batch,retry.log,()=>{},{send,report:()=>{}});
 await sendBatch(c,retry.batch,retry.log,()=>{},{send,report:()=>{}});
 assert.equal(calls,1);
});
test('missing text and remaining links fail without a request',async()=>{
 for(const x_text of [undefined,'See https://example.com now']){
  const {log,batch}=prepare([{key:'a',x_text}],{},at);
  await sendBatch(c,batch,log,()=>{},{send:(async()=>{assert.fail('must not send');}) as typeof fetch,report:()=>{}});
  assert.equal(log.a.status,'failed');
 }
});
test('402 and billing-related 403/429 release reservations for a later run',async()=>{
 for(const [status,body] of [
  [402,''],[402,'not JSON'],
  [403,JSON.stringify({title:'CreditsDepleted',type:'https://api.x.com/2/problems/credits'})],
  [403,JSON.stringify({type:'https://api.x.com/2/problems/credits-depleted'})],
  [403,'Billing account requires payment'],[403,'Insufficient balance'],[403,'Spending limit reached'],
  [429,JSON.stringify({detail:'Your account does not have any credits to fulfill this request.'})],
 ] as const){
  const {log,batch}=prepare(posts.slice(0,1),{},at);const reports:string[]=[];let calls=0;
  await sendBatch(c,batch,log,()=>{},{send:(async()=>{calls++;return new Response(body,{status});}) as typeof fetch,report:line=>reports.push(line)});
  assert.equal(calls,1);assert.equal(log['0'],undefined);
  assert.equal(prepare(posts.slice(0,1),log,at).batch.length,1);
  assert.deepEqual(reports,[`X pending: credits or billing blocked HTTP ${status}; reservation released`]);
 }
});
test('non-billing 403 remains failed and response text never reaches logs',async()=>{
 const {log,batch}=prepare(posts.slice(0,1),{},at);const reports:string[]=[];
 await sendBatch(c,batch,log,()=>{},{send:(async()=>new Response('{"detail":"Permission denied: private-value"}',{status:403})) as typeof fetch,report:line=>reports.push(line)});
 assert.equal(log['0'].status,'failed');assert.equal(log['0'].code,403);
 assert.deepEqual(reports,['X failed: HTTP 403']);
});

// Lead, 2026-10-24: a one-off delete of a post this repository sent (CrocSwap #5270 was posted by mistake).
test('a one-off delete signs a DELETE, only deletes a logged post, and never prints a body',async()=>{
 const log:XLog={'k':{status:'posted',at,id:'2113819596109070789'},'u':{status:'unknown',at,id:'42'}};
 const calls:{url:string;method?:string;auth:string}[]=[];
 const send=(status:number,body:unknown)=>(async(url:RequestInfo|URL,init?:RequestInit)=>{calls.push({url:String(url),method:init?.method,auth:String((init?.headers as Record<string,string>).Authorization)});return new Response(JSON.stringify(body),{status});}) as typeof fetch;
 assert.equal(await deleteTweet(c,'2113819596109070789',log,send(200,{data:{deleted:true}})),'X post deleted');
 assert.deepEqual([calls[0].url,calls[0].method],['https://api.x.com/2/tweets/2113819596109070789','DELETE']);
 // The signature base uses DELETE, not POST.
 const post=oauthHeader(c,calls[0].url,'n','1');const del=oauthHeader(c,calls[0].url,'n','1',{},'DELETE');
 assert.notEqual(post,del);
 assert.equal(await deleteTweet(c,'2113819596109070789',log,send(403,{detail:'secret body'})),'X delete failed: HTTP 403');
 assert.equal(await deleteTweet(c,'2113819596109070789',log,send(200,{data:{deleted:false}})),'X delete: unexpected confirmation');
 // Refused before any request: a bad id, an id that is not logged as posted, an unfinished entry.
 const before=calls.length;
 for(const id of ['','abc','0','12/34','1'.repeat(26),'999','42'])await assert.rejects(deleteTweet(c,id,log,send(200,{})));
 assert.equal(calls.length,before);
});
