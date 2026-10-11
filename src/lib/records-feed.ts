import {ranked} from './ranking.ts';
import {evidenceName} from './evidence.ts';
import type {Problem,RecordEntry} from './types';

export interface FeedRecord {id:string; score:string; relation:string; evidence:string; authors:string[]; bound:string}
export interface FeedBoard {slug:string; name:string; url:string; leader:string|null; records:FeedRecord[]}
export interface FeedSnapshot {schema_version:1; boards:FeedBoard[]}
export interface FeedState {schema_version:1; snapshot:FeedSnapshot; reserved:string[]}
export interface FeedMessage {key:string; content:string}

// Exact plain-text powers; never round a bound to a stronger result.
export function plainBound(slug:string,score:string,relation='attained'):string {
 const epsilon=relation==='strict-upper-bound'?', for every fixed epsilon > 0':'';
 if(slug==='integer-multiplication'||slug==='exact-dft')return `O(n * log(n)^(1 - ${score}${epsilon? ' + epsilon':''}))${epsilon}`;
 if(slug==='matrix-multiplication')return `O(n^(${score} + epsilon)), for every fixed epsilon > 0`;
 if(slug==='subset-sum')return `O(2^((${score}) * n))`;
 return `O(n^(${score}))`;
}
export function feedBoard(problem:Pick<Problem,'slug'|'direction'>,records:Pick<RecordEntry,'id'|'score'|'scoreRelation'|'date'|'repoId'|'evidenceLevel'|'authors'>[],name:string):FeedBoard {
 return {slug:problem.slug,name,url:`https://bigospeedrun.com/${problem.slug}`,leader:ranked(records,problem.direction)[0]?.record.id??null,
 records:records.map(r=>({id:r.id,score:r.score,relation:r.scoreRelation??'attained',evidence:evidenceName(r.evidenceLevel),authors:r.authors.map(a=>a.name),bound:plainBound(problem.slug,r.score,r.scoreRelation)}))};
}
function identity(board:FeedBoard,record:FeedRecord):string {return JSON.stringify([board.slug,record.id,record.score,record.relation]);}
function eventKey(board:FeedBoard,record:FeedRecord):string {return identity(board,record)+':'+(record.evidence==='Lean Verified'?'lean':'record');}
function clean(text:string):string {return text.replace(/[\r\n\t<>@`*_~|\\]/g,' ').replace(/\s+/g,' ').trim();}
export function message(board:FeedBoard,record:FeedRecord):string {
 const authors=clean(record.authors.join(', ')).slice(0,1000)||'Unknown author';
 return `${clean(board.name)}: ${record.bound}. ${record.evidence}. ${authors}.\n${board.url}`;
}
export function baseline(snapshot:FeedSnapshot):FeedState {
 const reserved:string[]=[];
 for(const board of snapshot.boards)for(const r of board.records)if(r.id===board.leader||r.evidence==='Lean Verified')reserved.push(eventKey(board,r));
 return {schema_version:1,snapshot,reserved};
}
export function plan(previous:FeedState,snapshot:FeedSnapshot):{state:FeedState;messages:FeedMessage[]} {
 const reserved=new Set(previous.reserved),messages:FeedMessage[]=[];
 for(const board of snapshot.boards){
  const old=previous.snapshot.boards.find(b=>b.slug===board.slug);
  for(const record of board.records){
   const prior=old?.records.find(r=>identity(old,r)===identity(board,record));
   const oldLeader=old?.records.find(r=>r.id===old.leader);
   const newLeader=record.id===board.leader&&(!oldLeader||identity(old!,oldLeader)!==identity(board,record));
   const gainedLean=record.evidence==='Lean Verified'&&prior?.evidence!=='Lean Verified';
   const key=eventKey(board,record);
   if((newLeader||gainedLean)&&!reserved.has(key)){reserved.add(key);messages.push({key,content:message(board,record)});}
  }
 }
 return {state:{schema_version:1,snapshot,reserved:[...reserved]},messages};
}

export async function deliver(webhook:string,messages:FeedMessage[],send:typeof fetch=fetch):Promise<{sent:number;failed:number}> {
 if(!/^https:\/\/discord\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(webhook))throw new Error('Missing or invalid records webhook');
 let sent=0,failed=0;
 for(const entry of messages){
  try {
   const response=await send(webhook+'?wait=true',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json'},body:JSON.stringify({content:entry.content,allowed_mentions:{parse:[]},flags:4})});
   if(response.ok)sent++;else failed++;
  }catch{failed++;} // Never log a URL, response body or exception containing a secret.
 }
 return {sent,failed};
}
