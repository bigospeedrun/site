import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {markTweetDeleted} from '../src/lib/x-posts.ts';
import type {XLog} from '../src/lib/x-posts.ts';
import type {RecordPost} from '../src/lib/records-feed.ts';
// Offline, no secrets: node --experimental-strip-types scripts/mark-deleted.ts <tweet id> <reason> [YYYY-MM-DD or ISO time].
// After a delete (workflow x-delete.yml), the agent that ran it marks the post in data/x-posts.json and
// data/records-posts.json, then commits that in a reviewed site commit (see scripts/x-records.md).
const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
const write=(path:string,value:unknown)=>{writeFileSync(path+'.tmp',JSON.stringify(value,null,2)+'\n');renameSync(path+'.tmp',path);};
try{
 const [id='',reason='',at=new Date().toISOString()]=process.argv.slice(2);
 if(!/^\d{4}-\d\d-\d\d(T[\d:.]+Z)?$/.test(at))throw new Error('Invalid time');
 const marked=markTweetDeleted(read('data/x-posts.json') as XLog,read('data/records-posts.json') as RecordPost[],id,at,reason);
 write('data/x-posts.json',marked.log);write('data/records-posts.json',marked.posts);
 console.log('Marked as deleted');
}catch(error){console.error('Mark refused: '+(error instanceof Error?error.message:'error'));process.exitCode=1;}
