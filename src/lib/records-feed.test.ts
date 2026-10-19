import {test} from 'node:test';
import assert from 'node:assert/strict';
import {baseline,plan,plainBound,message,deliver,feedBoard,appendRecordPost,xMessage,xPostLength,otherFeedBoard,plainTex} from './records-feed.ts';
import type {OtherClaim,OtherRow} from './records-feed.ts';
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
test('a prove2.me switch flip posts nothing for nonleader imported rows, and normally for a leader',()=>{
 const initial=baseline(snapshot(board([row(),row('prove2me-exact-dft-0-001','Claimed','1/1100'),row('prove2me-exact-dft-0-002','Claimed','1/500')],'a')));
 const flipped=snapshot(board([row(),row('prove2me-exact-dft-0-001','Lean Verified','1/1100'),row('prove2me-exact-dft-0-002','Lean Verified','1/500')],'a'));
 const result=plan(initial,flipped);assert.equal(result.messages.length,0);
 assert.equal(plan(result.state,flipped).messages.length,0);
 const leading=baseline(snapshot(board([row(),row('prove2me-exact-dft-0-002','Claimed','1/500')],'prove2me-exact-dft-0-002')));
 const flippedLeader=plan(leading,snapshot(board([row(),row('prove2me-exact-dft-0-002','Lean Verified','1/500')],'prove2me-exact-dft-0-002')));
 assert.equal(flippedLeader.messages.length,1);
 assert.match(flippedLeader.messages[0].content,/Record verified/);
});
test('accepted bound suppresses a new submission ID, but later Lean verification posts',()=>{
 const accepted=[{key:'["exact-dft","a","1/1000","attained"]:record'}];
 const previous=baseline(snapshot());
 const resubmitted=snapshot(board([row('b')],'b'));
 const result=plan(previous,resubmitted,accepted);
 assert.deepEqual(result.messages,[]);
 assert.ok(result.state.reserved.includes('["exact-dft","b","1/1000","attained"]:record'));
 const verified=snapshot(board([row('b','Lean Verified')],'b'));
 const upgrade=plan(result.state,verified,accepted);
 assert.equal(upgrade.messages.length,1);
 assert.equal(upgrade.messages[0].key,'["exact-dft","b","1/1000","attained"]:lean');
 assert.ok(upgrade.messages[0].content.startsWith('**Record verified**'));
 assert.ok(upgrade.messages[0].x_text?.startsWith('Record verified!'));
 // Also use upgrade wording if the resubmission first appears with its proof.
 assert.ok(plan(previous,verified,accepted).messages[0].content.startsWith('**Record verified**'));
 const posted=[...accepted,{key:upgrade.messages[0].key}];
 assert.deepEqual(plan(upgrade.state,snapshot(board([row('c','Lean Verified')],'c')),posted).messages,[]);
});
test('accepted bound matching survives snapshot removal and keeps board, score and relation distinct',()=>{
 const accepted=[{key:'["exact-dft","a","1/1000","attained"]:record'}];
 const previous=baseline({schema_version:1,boards:[]});
 assert.deepEqual(plan(previous,snapshot(board([row('b')],'b')),accepted).messages,[]);
 for(const b of [
  {...board([row('b')],'b'),slug:'integer-multiplication'},
  board([row('b','Claimed','1/900')],'b'),
  board([{...row('b'),relation:'strict-upper-bound'}],'b'),
 ])assert.equal(plan(previous,snapshot(b),accepted).messages.length,1);
 // A reservation without acceptance does not suppress a different submission ID.
 assert.equal(plan(baseline(snapshot()),snapshot(board([row('b')],'b')),[]).messages.length,1);
});
test('Human Verified upgrade or author-name edit alone does not post',()=>{
 const initial=baseline(snapshot());const changed=board([row('a','Human Verified')]);changed.records[0].authors=['Alice Example'];
 assert.equal(plan(initial,snapshot(changed)).messages.length,0);
});
test('decimal plain bounds preserve site precision and strict endpoints for all six problems',()=>{
 assert.equal(plainBound('apsp','5989/2000','strict-upper-bound'),'O(n^(2.9945 + epsilon)), for every fixed epsilon > 0');
 assert.equal(plainBound('3sum','3989/2000','strict-upper-bound',6),'O(n^(1.9945 + epsilon)), for every fixed epsilon > 0');
 assert.equal(plainBound('subset-sum','49/100','strict-upper-bound',6),'O(2^((0.49 + epsilon)n)), for every fixed epsilon > 0');
 assert.equal(plainBound('3sum','997891/500000'),'O(n^1.995782)');
 assert.equal(plainBound('apsp','2995943/1000000'),'O(n^2.995943)');
 assert.match(plainBound('matrix-multiplication','9/4'),/2\.25 \+ epsilon/);
 assert.match(plainBound('subset-sum','49/100'),/2\^\(0\.49n\)/);
 assert.match(plainBound('integer-multiplication','1/999999999999999999999'),/1 - 0\.000000000000000000001/);
 assert.match(plainBound('exact-dft','1/1000','strict-upper-bound'),/\+ epsilon.*every fixed epsilon > 0/);
 assert.equal(plainBound('exact-dft','1/1000').includes('epsilon'),false);
});
test('plain bounds trim decimal padding after rounding at board precision',()=>{
 assert.equal(plainBound('3sum','981/500','attained',6),'O(n^1.962)');
 assert.equal(plainBound('3sum','997891/500000','attained',6),'O(n^1.995782)');
 assert.equal(plainBound('apsp','3','attained',6),'O(n^3)');
 assert.equal(plainBound('apsp','10','attained',0),'O(n^10)');
 assert.equal(plainBound('matrix-multiplication','9/4','attained',6),'O(n^(2.25 + epsilon)), for every fixed epsilon > 0');
 assert.equal(plainBound('subset-sum','49/100','attained',6),'O(2^(0.49n))');
 assert.equal(plainBound('exact-dft','1/1000','attained',6),'O(n log^(1 - 0.001) n)');
 assert.equal(plainBound('integer-multiplication','1/1000','strict-upper-bound',6),'O(n log^(1 - 0.001 + epsilon) n), for every fixed epsilon > 0');
 assert.equal(plainBound('3sum','19619994/10000000','attained',6),'O(n^1.962)');
 assert.equal(plainBound('3sum','19620006/10000000','attained',6),'O(n^1.962001)');
});
test('bound display changes preserve reservations and do not post again',()=>{
 const before=board([{...row(),bound:'O(n log^(1 - 0.00100000) n)'}]);
 const initial=baseline(snapshot(before));
 const result=plan(initial,snapshot(board()));
 assert.deepEqual(result.messages,[]);
 assert.deepEqual(result.state.reserved,initial.reserved);
});
test('feed leader uses the site exact ranking and ties',()=>{
 const records=[{...row('b'),scoreRelation:'attained',date:'2026-10-11',repoId:0,evidenceLevel:'claimed',authors:[{name:'Alice',url:'https://github.com/alice'}]},
 {...row('a'),scoreRelation:'attained',date:'2026-10-10',repoId:0,evidenceLevel:'claimed',authors:[{name:'Alice',url:'https://github.com/alice'}]}] satisfies Parameters<typeof feedBoard>[1];
 const result=feedBoard({slug:'exact-dft',direction:'higher-is-better'},records,'Fourier Transform');
 assert.equal(result.leader,'a');assert.equal(result.records[0].evidence,'Claimed');
});
test('message contains problem, exact bound, evidence, author and link without mentions',()=>{
 const record=row();record.authors=['@everyone <@123>\nAlice'];
 const text=message(board(),record);assert.ok(text.startsWith('**New claim** | **Fourier Transform** | `O(n'));assert.match(text,/Claimed/);assert.match(text,/Alice/);assert.match(text,/https:\/\/bigospeedrun.com\/exact-dft\)$/);assert.ok(!text.includes('@'));
});
test('webhook delivery disables mentions, confirms sends, and fails soft without retry',async()=>{
 const messages=[{key:'a',content:'One'},{key:'b',content:'Two'},{key:'c',content:'Three'}];let calls=0;
 const send=async(url:unknown,options:any)=>{assert.match(String(url),/\?wait=true$/);assert.equal(options.redirect,'error');assert.deepEqual(JSON.parse(options.body).allowed_mentions,{parse:[]});assert.equal(JSON.parse(options.body).flags,undefined);assert.equal(JSON.parse(options.body).content,'');assert.deepEqual(JSON.parse(options.body).embeds,[{description:messages[calls].content}]);calls++;if(calls===1)return new Response('',{status:200});if(calls===2)return new Response('',{status:429});throw new Error('connection lost');};
 assert.deepEqual(await deliver('https://discord.com/api/webhooks/123/fake',messages,send as typeof fetch),{sent:1,failed:2});assert.equal(calls,3);
 await assert.rejects(deliver('https://example.com/token',messages,send as typeof fetch),/invalid/);
});

test('decimal saving expansion and author wording follow the requested message format',()=>{
 assert.equal(plainBound('exact-dft','47171/62500000','attained',6),'O(n log^(1 - 0.000754736) n)');
 const record=row();record.authors=['jacobalansussman','chafreaky'];record.bound=plainBound('exact-dft','47171/62500000','attained',6);
 assert.equal(message(board(),record),'**New claim** | **Fourier Transform** | `O(n log^(1 - 0.000754736) n)` | by jacobalansussman and chafreaky | Claimed | [bigospeedrun.com/exact-dft](https://bigospeedrun.com/exact-dft)');
 assert.ok(message(board(),record,false).startsWith('**Record verified** | '));
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
 assert.deepEqual(posts,[{key:'a',text:messages[0].content,x_text:messages[0].content,posted_at:'2026-10-11T17:00:00.000Z'},
  {key:'d',text:'Last accepted.',x_text:'Last accepted.',posted_at:'2026-10-11T17:00:00.000Z'}]);
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


test('dry-run CLI loads accepted posts to suppress a resubmission',async()=>{
 const {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const {spawnSync}=await import('node:child_process');
 const root=mkdtempSync(join(tmpdir(),'records-dedupe-test-'));
 try{
  mkdirSync(join(root,'data'));mkdirSync(join(root,'dist'));
  const state=JSON.stringify(baseline(snapshot()));
  const posts=JSON.stringify([{key:'["exact-dft","a","1/1000","attained"]:record',text:'Previously accepted',posted_at:'2026-10-12T00:00:00.000Z'}]);
  writeFileSync(join(root,'data/discord-records.json'),state);
  writeFileSync(join(root,'data/records-posts.json'),posts);
  writeFileSync(join(root,'dist/records-feed.json'),JSON.stringify(snapshot(board([row('b')],'b'))));
  const script=new URL('../../scripts/discord-records.ts',import.meta.url).pathname;
  const result=spawnSync(process.execPath,['--experimental-strip-types',script,'dry-run','batch.json'],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/0 planned messages; no writes or posts/);
  assert.equal(readFileSync(join(root,'data/discord-records.json'),'utf8'),state);
  assert.equal(readFileSync(join(root,'data/records-posts.json'),'utf8'),posts);
 }finally{rmSync(root,{recursive:true,force:true});}
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
  const xText=xMessage(board(),{...row(),bound:'O(n^0.'+'1'.repeat(300)+')'});
  writeFileSync(join(root,'batch.json'),JSON.stringify([{key:'accepted',content,x_text:xText},{key:'failed',content:'Not posted'}]));
  const script=new URL('../../scripts/discord-records.ts',import.meta.url).href;
  const code=`process.chdir(${JSON.stringify(root)});process.argv=['node','script','send','batch.json'];let calls=0;globalThis.fetch=async()=>new Response('',{status:++calls===1?200:500});await import(${JSON.stringify(script)});`;
  const result=spawnSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',code],
   {encoding:'utf8',env:{...process.env,DISCORD_RECORDS_WEBHOOK:'https://discord.com/api/webhooks/123/fake'}});
  assert.equal(result.status,1,result.stderr);
  assert.match(result.stdout,/1 sent, 1 failed/);
  const posts=JSON.parse(readFileSync(join(root,'data/records-posts.json'),'utf8'));
  assert.equal(posts.length,1);assert.equal(posts[0].key,'accepted');assert.equal(posts[0].text,content);
  assert.equal(posts[0].x_text,xText);assert.match(result.stderr,/X post exceeds 280 characters/);
  assert.equal(new Date(posts[0].posted_at).toISOString(),posts[0].posted_at);
 }finally{rmSync(root,{recursive:true,force:true});}
});


test('X new-record wording matches the approved template and preserves Discord text',()=>{
 const b={...board(),name:'Integer Multiplication',url:'https://bigospeedrun.com/integer-multiplication'};
 const r={...row(),authors:['sreekanth nair'],bound:'O(n log^(1 - 0.00137255015936798) n)'};
 const text=xMessage(b,r);
 assert.equal(text,'New claim!\n\nProblem: Integer Multiplication\nNew value: O(n log^(1 - 0.00137255015936798) n)\nPlayer: sreekanth nair\nStatus: Claimed (not verified)');
 assert.ok(xPostLength(text)<=280);
 const planned=plan(baseline({schema_version:1,boards:[]}),snapshot({...b,records:[r]})).messages[0];
 assert.equal(planned.content,message(b,r));assert.equal(planned.x_text,text);
 const saved=appendRecordPost([],planned,'2026-10-11T00:00:00.000Z')[0];
 assert.equal(saved.text,message(b,r));assert.equal(saved.x_text,text);
});

test('X verified posts use Value, the site evidence label, and comma-separated Players',()=>{
 const r={...row('a','Lean Verified'),authors:['Alice','Bob','Carol']};
 const text=xMessage(board(),r,false);
 assert.equal(text,`Record verified!\n\nProblem: Fourier Transform\nValue: ${r.bound}\nPlayers: Alice, Bob, Carol\nStatus: Lean Verified`);
 assert.match(xMessage(board(),{...r,evidence:'Human Verified'},false),/Status: Human Verified/);
 const upgrade=plan(baseline(snapshot()),snapshot(board([r]))).messages[0];
 assert.equal(upgrade.x_text,text);assert.equal(upgrade.content,message(board(),r,false));
 assert.ok(xPostLength(text)<=280);
});

test('X length counts URLs as 23 and retains oversized bounds for review',t=>{
 assert.equal(xPostLength('https://bigospeedrun.com/integer-multiplication'),23);
 assert.equal(xPostLength('A https://bigospeedrun.com/exact-dft B'),27);
 assert.equal(xPostLength('x'.repeat(257)+'https://example.com'),280);
 const bound='O(n log^(1 - 0.'+'1'.repeat(300)+') n)';
 const text=xMessage(board(),{...row(),bound});
 assert.ok(text.includes(bound));assert.ok(xPostLength(text)>280);
 t.diagnostic(`Oversized bound fixture: ${xPostLength(text)} characters; kept in full for manual review.`);
});


test('Discord escapes author markdown, removes mentions, and stays on one line',()=>{
 const r={...row(),authors:['@a_b*c~d`e|f\\g[h](i)\nnext\tname','Bob']};
 const text=message(board(),r);
 assert.ok(text.includes('by a\\_b\\*c\\~d\\`e\\|f\\\\g\\[h\\]\\(i\\) next name and Bob |'));
 assert.doesNotMatch(text,/[\r\n\t@]/);
 const long=message(board(),{...r,authors:['_'.repeat(1200)]});
 assert.ok(long.length<2000);assert.ok(long.includes(' | Claimed | ['));
});

test('Discord and X headlines follow evidence; upgrades retain Record verified',()=>{
 for(const evidence of ['Claimed','Human Verified','Lean Verified']){
  const r=row('a',evidence),title=evidence==='Claimed'?'New claim':'New record';
  assert.ok(message(board(),r).startsWith(`**${title}** | `));
  assert.ok(xMessage(board(),r).startsWith(`${title}!\n\nProblem: `));
  assert.ok(message(board(),r,false).startsWith('**Record verified** | '));
  assert.ok(xMessage(board(),r,false).startsWith('Record verified!\n\nProblem: '));
 }
});

test('format changes retain old event keys and accepted post text',()=>{
 const b=board(),r=b.records[0];
 const key='["exact-dft","a","1/1000","attained"]:record';
 const initial=baseline(snapshot(b));assert.ok(initial.reserved.includes(key));
 assert.deepEqual(plan(initial,snapshot(b)).messages,[]);
 const entry={key,content:message(b,r),x_text:xMessage(b,r)};
 const old=[{key,text:'Old Discord format',x_text:'Old X format',posted_at:'2026-10-11T00:00:00.000Z'}];
 assert.deepEqual(appendRecordPost(old,entry,'2026-10-12T00:00:00.000Z'),old);
 const first=plan(baseline({schema_version:1,boards:[]}),snapshot(b)).messages[0];
 assert.equal(first.key,key);
});

test('three same-author leaders post first and defer to the latest after three hours',()=>{
 const start=Date.parse('2026-10-13T00:00:00Z');
 const a=row('a','Claimed','1/1000'),b=row('b','Claimed','1/900'),c=row('c','Claimed','1/800');
 const first=plan(baseline({schema_version:1,boards:[]}),snapshot(board([a],'a')),[],start);
 assert.equal(first.messages.length,1);
 const posts=appendRecordPost([],first.messages[0],new Date(start).toISOString());
 assert.deepEqual(posts[0].authors,['Alice']);
 const second=plan(first.state,snapshot(board([a,b],'b')),posts,start+3600000);
 assert.equal(second.messages.length,0);assert.equal(second.state.deferred?.length,1);
 assert.ok(!second.state.reserved.includes(second.state.deferred![0].key));
 const third=plan(second.state,snapshot(board([a,b,c],'c')),posts,start+7200000);
 assert.equal(third.messages.length,0);assert.equal(third.state.deferred?.length,2);
 assert.equal(plan(third.state,snapshot(board([a,b,c],'c')),posts,start+10800000-1).messages.length,0);
 const later=plan(third.state,snapshot(board([a,c],'c')),posts,start+10800000);
 assert.equal(later.messages.length,1);assert.ok(later.messages[0].key.includes('"c"'));
 assert.ok(later.messages[0].content.startsWith('**New claim**'));assert.equal(later.state.deferred,undefined);
 // Superseded b is reserved even though it disappeared from the snapshot.
 assert.ok(later.state.reserved.some(key=>key.includes('"b"')));
 assert.equal(plan(later.state,snapshot(board([a,b,c],'b')),posts,start+21600000).messages.length,0);
});

test('author lists and boards have separate clocks; only a deferred current leader may post',()=>{
 const start=Date.parse('2026-10-13T00:00:00Z');
 const a=row(),b=row('b','Claimed','1/900'),bob={...row('bob','Claimed','1/800'),authors:['Bob']};
 const first=plan(baseline({schema_version:1,boards:[]}),snapshot(board([a])),[],start);
 const posts=appendRecordPost([],first.messages[0],new Date(start).toISOString());
 const waiting=plan(first.state,snapshot(board([a,b],'b')),posts,start+1000);
 const interleaved=plan(waiting.state,snapshot(board([a,b,bob],'bob')),posts,start+2000);
 assert.equal(interleaved.messages.length,1);assert.deepEqual(interleaved.messages[0].authors,['Bob']);
 assert.equal(plan(interleaved.state,snapshot(board([a,b,bob],'bob')),posts,start+10800000).messages.length,0);
 const team={...row('team','Claimed','1/700'),authors:['Alice','Bob']};
 assert.equal(plan(interleaved.state,snapshot(board([team],'team')),posts,start+3000).messages.length,1);
 const other={...board([b],'b'),slug:'integer-multiplication'};
 assert.equal(plan(waiting.state,snapshot(other),posts,start+3000).messages.length,1);
});

test('Lean upgrades bypass the author window; legacy accepted X text supplies authors',()=>{
 const start=Date.parse('2026-10-13T00:00:00Z');
 const a=row();const first=plan(baseline({schema_version:1,boards:[]}),snapshot(board([a])),[],start);
 const posts=appendRecordPost([],first.messages[0],new Date(start).toISOString());
 const {authors,...legacy}=posts[0];assert.deepEqual(authors,['Alice']);
 const next=snapshot(board([row('b','Claimed','1/900')],'b'));
 assert.equal(plan(first.state,next,[legacy],start+1000).messages.length,0);
 const verified=plan(first.state,snapshot(board([row('a','Lean Verified')])),posts,start+1000);
 assert.equal(verified.messages.length,1);assert.ok(verified.messages[0].content.startsWith('**Record verified**'));
 const newId=plan(first.state,snapshot(board([row('replacement','Lean Verified')],'replacement')),posts,start+1000);
 assert.ok(newId.messages[0].content.startsWith('**Record verified**'));
 const waiting=plan(first.state,next,posts,start+1000);
 const upgraded=plan(waiting.state,snapshot(board([row('b','Lean Verified','1/900')],'b')),posts,start+2000);
 assert.ok(upgraded.messages[0].content.startsWith('**Record verified**'));
 assert.equal(upgraded.state.deferred,undefined);
 assert.equal(plan(upgraded.state,next,posts,start+10800000).messages.length,0);
});

test('all six boards send one compact colored embed and keep exact accepted and X text',async()=>{
 const colors={'integer-multiplication':0xF59E0B,'matrix-multiplication':0x8B5CF6,'exact-dft':0x06B6D4,'3sum':0x22C55E,apsp:0xEF4444,'subset-sum':0x3B82F6};
 for(const [slug,color] of Object.entries(colors)){
  const b={...board(),slug,url:`https://bigospeedrun.com/${slug}`};
  const entry=plan(baseline({schema_version:1,boards:[]}),snapshot(b)).messages[0];
  const posts:ReturnType<typeof appendRecordPost>=[];
  const result=await deliver('https://discord.com/api/webhooks/123/fake',[entry],(async(_url,options)=>{
   const payload=JSON.parse(String(options?.body));
   assert.deepEqual(payload,{content:'',embeds:[{description:message(b,b.records[0]),color}],allowed_mentions:{parse:[]}});
   assert.doesNotMatch(payload.embeds[0].description,/\n/);
   return new Response('',{status:200});
  }) as typeof fetch,accepted=>posts.push(...appendRecordPost([],accepted,'2026-10-13T00:00:00.000Z')));
  assert.deepEqual(result,{sent:1,failed:0});assert.equal(posts.length,1);
  assert.equal(posts[0].text,entry.content);assert.equal(posts[0].x_text,xMessage(b,b.records[0]));
  assert.equal(posts[0].key,entry.key);
 }
});

// Other bounds rows (the landing page's second table).
const claim=(handle:string,value:string,name=handle):OtherClaim=>({handle,value,display:value,bound:`\\theta\\le ${value}`,evidence:'claimed',date:'2026-10-16T00:00:00Z',authors:[{name}]});
const otherRow=(claims:OtherClaim[],best:string):OtherRow=>({slug:'quasi-riemann',name:'Quasi-Riemann hypothesis',bestHandle:best,claims});
const both=(...boards:FeedBoard[]):FeedSnapshot=>({schema_version:1,boards});
test('an Other bounds row becomes a feed board with its own slug, table, leader and plain bound',()=>{
 const b=otherFeedBoard(otherRow([claim('alice','0.8749'),claim('bob','0.8748')],'bob'));
 assert.equal(b.slug,'other-quasi-riemann');assert.equal(b.table,'other-bounds');assert.equal(b.url,'https://bigospeedrun.com/other/quasi-riemann');
 assert.equal(b.leader,'bob:0.8748');assert.equal(b.records[1].bound,'θ ≤ 0.8748');assert.equal(b.records[1].evidence,'Claimed');
 assert.equal(plainTex('W_r(k)>k^{k\\lfloor\\log_2r\\rfloor/9}'),'W_r(k) > k^(k floor(log_2r)/9)');
 assert.equal(plainTex('\\mathbb{E}[R]\\ge \\frac{1}{2}\\mathbb{E}[\\mathrm{OPT}]'),'E[R] ≥ 1/2 E[OPT]');
 assert.equal(plainTex('\\mathrm{AS}(f)\\le 3.762d\\sqrt n'),'AS(f) ≤ 3.762d sqrt(n)');
 assert.equal(plainTex('\\mathbb{E}[R]\\ge 5.1\\cdot10^{-10}\\,\\mathbb{E}[\\mathrm{OPT}]'),'E[R] ≥ 5.1·10^(-10) E[OPT]');
 assert.equal(plainTex('1{,}000'),'1,000');
});
test('Other bounds boards are seeded on first sight: old leaders never post, a later leader posts to its table',()=>{
 const main=board();const start=Date.parse('2026-10-16T00:00:00Z');
 const before=baseline(both(main));   // the state before this deploy has no Other bounds boards
 const seeded=plan(before,both(main,otherFeedBoard(otherRow([claim('alice','0.8749')],'alice'))),[],start);
 assert.deepEqual(seeded.messages,[]);
 assert.ok(seeded.state.reserved.includes('["other-quasi-riemann","alice:0.8749","0.8749","attained"]:record'));
 const next=both(main,otherFeedBoard(otherRow([claim('alice','0.8749'),claim('bob','0.8748')],'bob')));
 const result=plan(seeded.state,next,[],start+60000);
 assert.equal(result.messages.length,1);assert.equal(result.messages[0].table,'other-bounds');
 assert.match(result.messages[0].content,/\*\*Quasi-Riemann hypothesis\*\* \| `θ ≤ 0\.8748` \| by bob \| Claimed \| \[bigospeedrun\.com\/other\/quasi-riemann\]/);
 assert.match(result.messages[0].x_text!,/Problem: Quasi-Riemann hypothesis\nNew value: θ ≤ 0\.8748\nPlayer: bob/);
 assert.equal(plan(result.state,next,[],start+120000).messages.length,0);
 // Big O boards keep posting their first leader as before (no seeding).
 assert.equal(plan(baseline(both()),both(main)).messages.length,1);
});
test('Other bounds: at most one post per race every 3 hours, whoever leads; a deferred leader posts later',()=>{
 const start=Date.parse('2026-10-16T00:00:00Z');
 const a=claim('alice','0.8749'),b=claim('bob','0.8748'),c=claim('carol','0.8747');
 const seeded=plan(baseline(both()),both(otherFeedBoard(otherRow([a],'alice'))),[],start).state;
 const first=plan(seeded,both(otherFeedBoard(otherRow([a,b],'bob'))),[],start);
 assert.equal(first.messages.length,1);
 const posts=appendRecordPost([],first.messages[0],new Date(start).toISOString());
 // A different author within 3 hours is deferred (on Big O boards, author lists have separate clocks).
 const second=plan(first.state,both(otherFeedBoard(otherRow([a,b,c],'carol'))),posts,start+3600000);
 assert.equal(second.messages.length,0);assert.equal(second.state.deferred?.length,1);
 assert.equal(plan(second.state,both(otherFeedBoard(otherRow([a,b,c],'carol'))),posts,start+10800000-1).messages.length,0);
 const later=plan(second.state,both(otherFeedBoard(otherRow([a,b,c],'carol'))),posts,start+10800000);
 assert.equal(later.messages.length,1);assert.ok(later.messages[0].key.includes('carol'));assert.equal(later.state.deferred,undefined);
 // A deferred leader that lost the lead does not post.
 const lost=plan(second.state,both(otherFeedBoard(otherRow([a,b,c],'bob'))),posts,start+10800000);
 assert.equal(lost.messages.length,0);
});
test('delivery sends each table to its own channel webhook and needs the second one only for Other bounds',async()=>{
 const urls:string[]=[];const send=async(url:unknown,options:any)=>{urls.push(String(url));assert.equal(JSON.parse(options.body).embeds[0].color,String(url).includes('/2/')?0x64748B:0x06B6D4);return new Response('',{status:200});};
 const messages=[{key:'["exact-dft","a","1","attained"]:record',content:'A'},{key:'["other-quasi-riemann","b","1","attained"]:record',content:'B',table:'other-bounds' as const}];
 assert.deepEqual(await deliver('https://discord.com/api/webhooks/1/main',messages,send as typeof fetch,undefined,'https://discord.com/api/webhooks/2/other'),{sent:2,failed:0});
 assert.deepEqual(urls,['https://discord.com/api/webhooks/1/main?wait=true','https://discord.com/api/webhooks/2/other?wait=true']);
 await assert.rejects(deliver('https://discord.com/api/webhooks/1/main',messages,send as typeof fetch),/Other bounds/);
 assert.deepEqual(await deliver('https://discord.com/api/webhooks/1/main',[messages[0]],send as typeof fetch),{sent:1,failed:0});
});

test('an exponent endpoint never posts as attained and never leads an attained tie',()=>{
 const rec=(id:string,scoreRelation:'attained'|'strict-upper-bound',date:string)=>({id,score:'5989/2000',scoreRelation,date,repoId:1,evidenceLevel:'claimed' as const,authors:[{name:id}]});
 const apsp=feedBoard({slug:'apsp',direction:'lower-is-better'},[rec('open','strict-upper-bound','2026-10-12'),rec('closed','attained','2026-10-13')] as any,'APSP');
 assert.equal(apsp.leader,'closed');
 const open=apsp.records.find(r=>r.id==='open')!;
 assert.equal(open.relation,'strict-upper-bound');assert.equal(open.bound,'O(n^(2.9945 + epsilon)), for every fixed epsilon > 0');
 assert.match(message(apsp,open),/epsilon/);assert.match(xMessage(apsp,open),/epsilon/);
 const worse={...rec('worse','attained','2026-10-11'),score:'2995561/1000000'};
 const before=feedBoard({slug:'apsp',direction:'lower-is-better'},[worse] as any,'APSP');
 const after=feedBoard({slug:'apsp',direction:'lower-is-better'},[worse,rec('open','strict-upper-bound','2026-10-12')] as any,'APSP');
 assert.equal(after.leader,'open');
 const posted=plan(baseline({schema_version:1,boards:[before]}),{schema_version:1,boards:[after]}).messages;
 assert.equal(posted.length,1);assert.match(posted[0].content,/epsilon/);assert.match(posted[0].x_text??'',/epsilon/);
});
