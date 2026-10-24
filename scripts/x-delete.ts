import {existsSync,readFileSync} from 'node:fs';
import {credentials,deleteTweet} from '../src/lib/x-posts.ts';
import type {XLog} from '../src/lib/x-posts.ts';
// One-off correction: node --experimental-strip-types scripts/x-delete.ts <tweet id> (workflow x-delete.yml).
async function main(){
 const c=credentials(process.env);
 if(!c){console.log('X not configured');process.exitCode=1;return;}
 const id=process.argv[2]??'';
 const log:XLog=existsSync('data/x-posts.json')?JSON.parse(readFileSync('data/x-posts.json','utf8')):{};
 const line=await deleteTweet(c,id,log);
 console.log(line);
 if(line!=='X post deleted')process.exitCode=1;
}
main().catch(error=>{console.error('X delete refused: '+(error instanceof Error?error.message:'error'));process.exitCode=1;});
