import {readFileSync,writeFileSync,existsSync,renameSync} from 'node:fs';
import {baseline,plan,deliver,appendRecordPost,xPostLength} from '../src/lib/records-feed.ts';
import type {FeedSnapshot,FeedState,FeedMessage,RecordPost} from '../src/lib/records-feed.ts';
const statePath='data/discord-records.json';
const postsPath='data/records-posts.json';
const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
const write=(path:string,value:unknown)=>{writeFileSync(path+'.tmp',JSON.stringify(value,null,2)+'\n');renameSync(path+'.tmp',path);};
async function main(){
 const [mode,batch]=process.argv.slice(2);
 if(mode==='send'){
  if(!batch||!existsSync(batch)){console.log('No reserved Discord batch.');return;}
  const messages:FeedMessage[]=read(batch);
  for(const entry of messages){
   const length=xPostLength(entry.x_text??entry.content);
   if(length>280)console.warn(`X post exceeds 280 characters (${length}): ${entry.key}; full text retained.`);
  }
  let posts:RecordPost[]=existsSync(postsPath)?read(postsPath):[];
  const result=await deliver(process.env.DISCORD_RECORDS_WEBHOOK??'',messages,fetch,entry=>{
   posts=appendRecordPost(posts,entry,new Date().toISOString());
   write(postsPath,posts);
  });
  console.log(`Discord records: ${result.sent} sent, ${result.failed} failed. Reserved events will not be sent twice.`);
  if(result.failed)process.exitCode=1;
  return;
 }
 const snapshot:FeedSnapshot=read('dist/records-feed.json');
 if(mode==='baseline'){write(statePath,baseline(snapshot));console.log('Saved initial records feed baseline; no posts.');return;}
 if(!['plan','dry-run'].includes(mode)||!batch)throw new Error('Expected baseline, plan BATCH, dry-run BATCH or send BATCH');
 const previous:FeedState=read(statePath);
 const result=plan(previous,snapshot);
 if(mode==='dry-run'){for(const m of result.messages)console.log(m.content);console.log(`${result.messages.length} planned messages; no writes or posts.`);return;}
 if(!process.env.DISCORD_RECORDS_WEBHOOK){console.log('Records webhook is not configured; notification state retained.');return;}
 write(statePath,result.state);write(batch,result.messages);
 console.log(`Reserved ${result.messages.length} Discord record notifications.`);
}
main().catch(()=>{console.error('Discord records step failed; data refresh continues.');process.exitCode=1;});
