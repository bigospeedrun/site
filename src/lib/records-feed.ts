import {ranked,boundPrecision,boundExponent,scientificSaving} from './ranking.ts';
import {evidenceName} from './evidence.ts';
import type {Problem,RecordEntry} from './types';

export interface FeedRecord {id:string; score:string; relation:string; evidence:string; authors:string[]; bound:string}
export interface FeedBoard {slug:string; name:string; url:string; leader:string|null; records:FeedRecord[]}
export interface FeedSnapshot {schema_version:1; boards:FeedBoard[]}
export interface FeedState {schema_version:1; snapshot:FeedSnapshot; reserved:string[]; deferred?:{key:string;slug:string;authors:string[]}[]}
export interface FeedMessage {key:string; content:string; x_text?:string; authors?:string[]}
export interface RecordPost {key:string; text:string; x_text:string; posted_at:string; authors?:string[]}
export function appendRecordPost(previous:RecordPost[],entry:FeedMessage,postedAt:string):RecordPost[] {
 if(previous.some(post=>post.key===entry.key))return previous.slice(-500);
 return [...previous,{key:entry.key,text:entry.content,x_text:entry.x_text??entry.content,posted_at:postedAt,...(entry.authors?{authors:entry.authors}:{})}].slice(-500);
}

// Expand the site's scientific saving into decimal text without floating-point rounding.
function decimalSaving(score:string,digits:number):string {
 const rendered=scientificSaving(score,digits);
 const match=rendered.match(/^(?:(.+)\\cdot )?10\^\{(-?\d+)\}$/);
 if(!match)return rendered;
 const coefficient=match[1]??'1',exponent=Number(match[2]);
 const [whole,fraction='']=coefficient.split('.'),raw=whole+fraction,point=whole.length+exponent;
 if(point<=0)return '0.'+'0'.repeat(-point)+raw;
 if(point>=raw.length)return raw+'0'.repeat(point-raw.length);
 return raw.slice(0,point)+'.'+raw.slice(point);
}
export function plainBound(slug:string,score:string,relation='attained',digits?:number):string {
 const kappa=slug==='integer-multiplication'||slug==='exact-dft';
 const precision=digits??boundPrecision([score],kappa);
 const rounded=kappa?decimalSaving(score,precision):boundExponent(score,false,precision);
 const value=rounded.includes('.')?rounded.replace(/0+$/,'').replace(/\.$/,''):rounded;
 const epsilon=relation==='strict-upper-bound'?', for every fixed epsilon > 0':'';
 if(kappa)return `O(n log^(1 - ${value}${epsilon? ' + epsilon':''}) n)${epsilon}`;
 if(slug==='matrix-multiplication')return `O(n^(${value} + epsilon)), for every fixed epsilon > 0`;
 if(slug==='subset-sum')return `O(2^(${value}n))`;
 return `O(n^${value})`;
}
export function feedBoard(problem:Pick<Problem,'slug'|'direction'>,records:Pick<RecordEntry,'id'|'score'|'scoreRelation'|'date'|'repoId'|'evidenceLevel'|'authors'>[],name:string):FeedBoard {
 const digits=boundPrecision(records.map(r=>r.score),problem.slug==='integer-multiplication'||problem.slug==='exact-dft');
 return {slug:problem.slug,name,url:`https://bigospeedrun.com/${problem.slug}`,leader:ranked(records,problem.direction)[0]?.record.id??null,
 records:records.map(r=>({id:r.id,score:r.score,relation:r.scoreRelation??'attained',evidence:evidenceName(r.evidenceLevel),authors:r.authors.map(a=>a.name),bound:plainBound(problem.slug,r.score,r.scoreRelation,digits)}))};
}
function identity(board:FeedBoard,record:FeedRecord):string {return JSON.stringify([board.slug,record.id,record.score,record.relation]);}
function eventKey(board:FeedBoard,record:FeedRecord):string {return identity(board,record)+':'+(record.evidence==='Lean Verified'?'lean':'record');}
function clean(text:string):string {return text.replace(/[<>@]/g,' ').replace(/\s+/g,' ').trim();}
function discordText(text:string):string {return text.replace(/[\\`*_~|[\]()]/g,'\\$&');}
function headline(record:FeedRecord,newRecord:boolean):string {
 return newRecord?(record.evidence==='Claimed'?'New claim':'New record'):'Record verified';
}
export function message(board:FeedBoard,record:FeedRecord,newRecord=true):string {
 const names=record.authors.map(clean).filter(Boolean);
 const joined=names.length<2?names.join(''):names.slice(0,-1).join(', ')+' and '+names.at(-1);
 const authors=discordText(joined.slice(0,500)||'Unknown author');
 return `**${headline(record,newRecord)}** | **${discordText(clean(board.name))}** | \`${record.bound}\` | by ${authors} | ${record.evidence} | [${board.url.replace(/^https?:\/\//,'')}](${board.url})`;
}
// Count each URL as X's fixed 23 characters; count Unicode code points elsewhere.
export function xPostLength(text:string):number {
 return Array.from(text.replace(/https?:\/\/\S+/g,'x'.repeat(23))).length;
}
export function xMessage(board:FeedBoard,record:FeedRecord,newRecord=true):string {
 const names=record.authors.map(name=>name.replace(/[\r\n\t]+/g,' ').trim());
 const status=record.evidence==='Claimed'?'Claimed (not verified)':record.evidence;
 return `${headline(record,newRecord)}!\n\nProblem: ${board.name}\n${newRecord?'New value':'Value'}: ${record.bound}\n${names.length>1?'Players':'Player'}: ${names.join(', ')||'Unknown author'}\nStatus: ${status}`;
}
export function baseline(snapshot:FeedSnapshot):FeedState {
 const reserved:string[]=[];
 for(const board of snapshot.boards)for(const r of board.records)if(r.id===board.leader||r.evidence==='Lean Verified')reserved.push(eventKey(board,r));
 return {schema_version:1,snapshot,reserved};
}
// Accepted posts retain the original event key; omit only the submission ID for deduplication.
function postedBoundKey(key:string):string {
 const split=key.lastIndexOf(':');
 const [slug,,score,relation]=JSON.parse(key.slice(0,split)) as string[];
 return JSON.stringify([slug,score,relation,key.slice(split+1)]);
}
export function plan(previous:FeedState,snapshot:FeedSnapshot,posts:(Pick<RecordPost,'key'>&Partial<RecordPost>)[]=[],now=Date.now()):{state:FeedState;messages:FeedMessage[]} {
 const reserved=new Set(previous.reserved),messages:FeedMessage[]=[];
 const announced=new Set(posts.map(post=>postedBoundKey(post.key)));
 const deferred=new Map((previous.deferred??[]).map(entry=>[entry.key,entry]));
 const authorKey=(slug:string,authors:string[])=>JSON.stringify([slug,authors]);
 const lastAccepted=new Map<string,number>();
 for(const post of posts){
  const at=Date.parse(post.posted_at??'');
  if(!Number.isFinite(at))continue;
  const [slug,id,score,relation]=JSON.parse(post.key.slice(0,post.key.lastIndexOf(':'))) as string[];
  const oldRecord=[...previous.snapshot.boards,...snapshot.boards].filter(b=>b.slug===slug).flatMap(b=>b.records).find(r=>r.id===id&&r.score===score&&r.relation===relation);
  const authorLine=post.x_text?.match(/^Players?: (.*)$/m)?.[1];
  const authors=post.authors??(authorLine?authorLine.split(', '):oldRecord?.authors);
  if(!authors)continue;
  const group=authorKey(slug,authors);
  lastAccepted.set(group,Math.max(lastAccepted.get(group)??-Infinity,at));
 }
 for(const board of snapshot.boards){
  const old=previous.snapshot.boards.find(b=>b.slug===board.slug);
  for(const record of board.records){
   const prior=old?.records.find(r=>identity(old,r)===identity(board,record));
   const oldLeader=old?.records.find(r=>r.id===old.leader);
   const newLeader=record.id===board.leader&&(!oldLeader||identity(old!,oldLeader)!==identity(board,record));
   const gainedLean=record.evidence==='Lean Verified'&&prior?.evidence!=='Lean Verified';
   const key=eventKey(board,record);
   const waiting=record.id===board.leader&&deferred.has(key);
   if((newLeader||gainedLean||waiting)&&!reserved.has(key)){
    const boundKey=postedBoundKey(key);
    if(announced.has(boundKey)){reserved.add(key);deferred.delete(key);continue;}
    const verifiedUpgrade=gainedLean&&announced.has(postedBoundKey(identity(board,record)+':record'));
    const isNew=(newLeader||waiting)&&!verifiedUpgrade;
    const group=authorKey(board.slug,record.authors);
    if(isNew&&now-(lastAccepted.get(group)??-Infinity)<3*60*60*1000){
     deferred.set(key,{key,slug:board.slug,authors:record.authors});continue;
    }
    reserved.add(key);deferred.delete(key);
    if(!isNew){
     const claimKey=identity(board,record)+':record';
     if(deferred.delete(claimKey))reserved.add(claimKey);
    }
    if(isNew){
     for(const [oldKey,entry] of deferred)if(authorKey(entry.slug,entry.authors)===group){
      reserved.add(oldKey);deferred.delete(oldKey);
     }
    }
    messages.push({key,content:message(board,record,isNew),x_text:xMessage(board,record,isNew),authors:record.authors});
   }
  }
 }
 return {state:{schema_version:1,snapshot,reserved:[...reserved],...(deferred.size?{deferred:[...deferred.values()]}:{})},messages};
}

export async function deliver(webhook:string,messages:FeedMessage[],send:typeof fetch=fetch,onAccepted?:(entry:FeedMessage)=>void):Promise<{sent:number;failed:number}> {
 if(!/^https:\/\/discord\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(webhook))throw new Error('Missing or invalid records webhook');
 let sent=0,failed=0,logFailed=false;
 for(const entry of messages){
  let accepted=false;
  try {
   const response=await send(webhook+'?wait=true',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json'},body:JSON.stringify({content:entry.content,allowed_mentions:{parse:[]},flags:4})});
   if(response.ok){sent++;accepted=true;}else failed++;
  }catch{failed++;} // Never log a URL, response body or exception containing a secret.
  // Keep sending the reserved batch even if the local acceptance log fails.
  if(accepted&&onAccepted){try{onAccepted(entry);}catch{logFailed=true;}}
 }
 if(logFailed)throw new Error('Accepted Discord message log could not be saved');
 return {sent,failed};
}
