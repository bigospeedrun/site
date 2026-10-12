import {existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {credentials,prepare,sendBatch} from '../src/lib/x-posts.ts';
import type {XLog,XEntry} from '../src/lib/x-posts.ts';
const path='data/x-posts.json';
const read=(file:string)=>JSON.parse(readFileSync(file,'utf8'));
const write=(file:string,value:unknown)=>{writeFileSync(file+'.tmp',JSON.stringify(value,null,2)+'\n');renameSync(file+'.tmp',file);};
async function main(){
 const c=credentials(process.env);
 if(!c){console.log('X not configured');return;}
 const [mode,batchPath]=process.argv.slice(2);
 if(!batchPath||!['plan','send'].includes(mode))throw new Error('Invalid mode');
 if(mode==='plan'){
  const posts:XEntry[]=existsSync('data/records-posts.json')?read('data/records-posts.json'):[];
  const previous:XLog|undefined=existsSync(path)?read(path):undefined;
  const {log,batch}=prepare(posts,previous,new Date().toISOString());
  write(path,log);write(batchPath,batch);
  console.log(previous===undefined?'X baseline saved; existing entries skipped':`X reserved ${batch.length} entries`);
 }else{
  if(!existsSync(batchPath)){console.log('No X batch');return;}
  // Consume the batch before sending: even a repeated CLI invocation cannot resend it.
  const batch:XEntry[]=read(batchPath);write(batchPath,[]);
  await sendBatch(c,batch,read(path),log=>write(path,log));
 }
}
main().catch(()=>{console.error('X records step failed; inspect saved status log');process.exitCode=1;});
