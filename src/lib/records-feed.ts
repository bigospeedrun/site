import {ranked,boundPrecision,boundExponent,scientificSaving} from './ranking.ts';
import {evidenceName,evidenceLevels} from './evidence.ts';
import {otherBoundLeader} from './other-leader.ts';
import type {Problem,RecordEntry} from './types';

export interface FeedRecord {id:string; score:string; relation:string; evidence:string; authors:string[]; bound:string}
// table: the landing-page table of the board. 'big-o' (also when absent, in older
// snapshots) posts to the Big O records channel; 'other-bounds' to the Other bounds one.
export type FeedTable='big-o'|'other-bounds';
export interface FeedBoard {slug:string; name:string; url:string; leader:string|null; records:FeedRecord[]; table?:FeedTable}
export interface FeedSnapshot {schema_version:1; boards:FeedBoard[]}
export interface FeedState {schema_version:1; snapshot:FeedSnapshot; reserved:string[]; deferred?:{key:string;slug:string;authors:string[]}[]}
export interface FeedMessage {key:string; content:string; x_text?:string; authors?:string[]; table?:FeedTable}
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
 // An open endpoint never posts as attained: n^(a+o(1)) is O(n^(a + epsilon)), not O(n^a).
 if(slug==='subset-sum')return epsilon?`O(2^((${value} + epsilon)n))${epsilon}`:`O(2^(${value}n))`;
 return epsilon?`O(n^(${value} + epsilon))${epsilon}`:`O(n^${value})`;
}
export function feedBoard(problem:Pick<Problem,'slug'|'direction'>,records:Pick<RecordEntry,'id'|'score'|'scoreRelation'|'date'|'repoId'|'evidenceLevel'|'authors'>[],name:string):FeedBoard {
 const digits=boundPrecision(records.map(r=>r.score),problem.slug==='integer-multiplication'||problem.slug==='exact-dft');
 return {slug:problem.slug,name,url:`https://bigospeedrun.com/${problem.slug}`,leader:ranked(records,problem.direction)[0]?.record.id??null,
 records:records.map(r=>({id:r.id,score:r.score,relation:r.scoreRelation??'attained',evidence:evidenceName(r.evidenceLevel),authors:r.authors.map(a=>a.name),bound:plainBound(problem.slug,r.score,r.scoreRelation,digits)}))};
}
// A plain-text form of a site bound (KaTeX source) for Discord and X posts.
export function plainTex(tex:string):string {
 let s=tex.replace(/\{,\}/g,',');
 for(let i=0;i<3;i++){
  s=s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g,(all,a,b)=>`${/^[\w.]+$/.test(a)?a:'('+a+')'}/${/^[\w.]+$/.test(b)?b:'('+b+')'}`);
  s=s.replace(/\\mathbb\{([^{}]*)\}/g,' $1').replace(/\\(?:text|mathrm|operatorname|mathbf|mathit)\{([^{}]*)\}/g,'$1');
  s=s.replace(/\\sqrt\{([^{}]*)\}/g,' sqrt($1)');
 }
 s=s.replace(/\\sqrt\s*([A-Za-z0-9])/g,' sqrt($1)').replace(/\\lfloor\s*/g,' floor(').replace(/\s*\\rfloor/g,')');
 const symbols:Record<string,string>={le:'≤',leq:'≤',ge:'≥',geq:'≥',approx:'≈',cdot:'·',times:' × ',theta:'θ',mu:'μ',eta:'η',gamma:'γ',sigma:'σ',dagger:'†',
  varepsilon:'ε',epsilon:'ε',infty:'∞',lt:'<',gt:'>'};
 s=s.replace(/\\([A-Za-z]+)( ?)/g,(all,w,space)=>w in symbols?symbols[w]:w+space);
 s=s.replace(/([_^])\{([^{}]*)\}/g,(all,op,e)=>op+(/^[\w.]+$/.test(e)?e:'('+e+')'));
 s=s.replace(/[{}\\]/g,'');
 return s.replace(/\s*(≤|≥|≈|<|>|=)\s*/g,' $1 ').replace(/\(\s+/g,'(').replace(/\s+\)/g,')').replace(/\s+/g,' ').trim();
}
// An Other bounds row (src/lib/other-bounds.json) as a feed board. Its slug is 'other-<slug>',
// so it never meets a Big O slug. A claim's id is its author handle and exact value: a later
// date edit keeps the id. The leader is the row's newest claim by its best author.
export interface OtherClaim {handle:string; value:string; display:string; bound:string; evidence:string; date:string; authors:{name:string}[]}
export interface OtherRow {slug:string; name:string; bestHandle:string; claims:OtherClaim[]}
export function otherFeedBoard(row:OtherRow):FeedBoard {
 const id=(c:OtherClaim)=>c.handle+':'+c.value;
 const level=(e:string)=>evidenceLevels.some(l=>l.id===e)?evidenceName(e as typeof evidenceLevels[number]['id']):'Claimed';
 const leader=otherBoundLeader(row);
 return {slug:'other-'+row.slug,name:row.name,url:`https://bigospeedrun.com/other/${row.slug}`,leader:leader?id(leader):null,table:'other-bounds',
  records:row.claims.map(c=>({id:id(c),score:c.value,relation:c.display.startsWith('<')?'strict-upper-bound':'attained',evidence:level(c.evidence),
   authors:c.authors.map(a=>a.name),bound:plainTex(c.bound)}))};
}
const isOther=(slug:string)=>slug.startsWith('other-');
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
// The value a post showed: its X 'New value' or 'Value' line, else the bound in the Discord text.
function postedValue(post:Partial<RecordPost>):string|undefined {
 return post.x_text?.match(/^(?:New value|Value): (.*)$/m)?.[1]??post.text?.match(/`([^`]*)`/)?.[1];
}
export function plan(previous:FeedState,snapshot:FeedSnapshot,posts:(Pick<RecordPost,'key'>&Partial<RecordPost>)[]=[],now=Date.now()):{state:FeedState;messages:FeedMessage[]} {
 const reserved=new Set(previous.reserved),messages:FeedMessage[]=[];
 const announced=new Set(posts.map(post=>postedBoundKey(post.key)));
 // Shown values have a display cap, so a new leader can show the same value as the last
 // post for its board. That post would say nothing new, and X refuses it as a duplicate.
 const lastValue=new Map<string,string>();
 for(const post of posts){const value=postedValue(post);if(value)lastValue.set(JSON.parse(post.key.slice(0,post.key.lastIndexOf(':')))[0],value)}
 const deferred=new Map((previous.deferred??[]).map(entry=>[entry.key,entry]));
 // The throttle group: on a Big O board, the board and its exact author list (3 hours from
 // that group's last accepted post); on an Other bounds board, the board alone (at most one
 // post per race every 3 hours, whoever leads).
 const authorKey=(slug:string,authors:string[])=>isOther(slug)?JSON.stringify([slug]):JSON.stringify([slug,authors]);
 const lastAccepted=new Map<string,number>();
 for(const post of posts){
  const at=Date.parse(post.posted_at??'');
  if(!Number.isFinite(at))continue;
  const [slug,id,score,relation]=JSON.parse(post.key.slice(0,post.key.lastIndexOf(':'))) as string[];
  const oldRecord=[...previous.snapshot.boards,...snapshot.boards].filter(b=>b.slug===slug).flatMap(b=>b.records).find(r=>r.id===id&&r.score===score&&r.relation===relation);
  const authorLine=post.x_text?.match(/^Players?: (.*)$/m)?.[1];
  const authors=post.authors??(authorLine?authorLine.split(', '):oldRecord?.authors)??(isOther(slug)?[]:undefined);
  if(!authors)continue;
  const group=authorKey(slug,authors);
  lastAccepted.set(group,Math.max(lastAccepted.get(group)??-Infinity,at));
 }
 for(const board of snapshot.boards){
  const old=previous.snapshot.boards.find(b=>b.slug===board.slug);
  // An Other bounds board seen for the first time is seeded, as the baseline does: its
  // current leader and Lean records are reserved and nothing posts. Only later leaders post.
  if(!old&&isOther(board.slug)){
   for(const r of board.records)if(r.id===board.leader||r.evidence==='Lean Verified')reserved.add(eventKey(board,r));
   continue;
  }
  for(const record of board.records){
   const prior=old?.records.find(r=>identity(old,r)===identity(board,record));
   const oldLeader=old?.records.find(r=>r.id===old.leader);
   const newLeader=record.id===board.leader&&(!oldLeader||identity(old!,oldLeader)!==identity(board,record));
   const gainedLean=record.evidence==='Lean Verified'&&prior?.evidence!=='Lean Verified';
   const key=eventKey(board,record);
   const waiting=record.id===board.leader&&deferred.has(key);
   // Rows imported from prove2.me (data/prove2me_import.py) are old results. When its
   // LEAN_VERIFIED switch flips, a row that does not lead its board posts nothing.
   if(gainedLean&&!newLeader&&!waiting&&record.id.startsWith('prove2me-')&&record.id!==board.leader){reserved.add(key);continue;}
   if((newLeader||gainedLean||waiting)&&!reserved.has(key)){
    const boundKey=postedBoundKey(key);
    if(announced.has(boundKey)){reserved.add(key);deferred.delete(key);continue;}
    const verifiedUpgrade=gainedLean&&announced.has(postedBoundKey(identity(board,record)+':record'));
    const isNew=(newLeader||waiting)&&!verifiedUpgrade;
    if(isNew&&lastValue.get(board.slug)===record.bound){reserved.add(key);deferred.delete(key);continue;}
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
    messages.push({key,content:message(board,record,isNew),x_text:xMessage(board,record,isNew),authors:record.authors,...(board.table?{table:board.table}:{})});
   }
  }
 }
 return {state:{schema_version:1,snapshot,reserved:[...reserved],...(deferred.size?{deferred:[...deferred.values()]}:{})},messages};
}

const otherBoundsColor=0x64748B;
export const discordRecordColors:Readonly<Record<string,number>>={
 'integer-multiplication':0xF59E0B,
 'matrix-multiplication':0x8B5CF6,
 'exact-dft':0x06B6D4,
 '3sum':0x22C55E,
 'apsp':0xEF4444,
 'subset-sum':0x3B82F6,
};
// The webhook of each table's records channel: #records-big-o and #records-other-bounds.
const validWebhook=(url:string|undefined)=>/^https:\/\/discord\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(url??'');
export async function deliver(webhook:string,messages:FeedMessage[],send:typeof fetch=fetch,onAccepted?:(entry:FeedMessage)=>void,otherWebhook?:string):Promise<{sent:number;failed:number}> {
 if(!validWebhook(webhook))throw new Error('Missing or invalid records webhook');
 if(messages.some(m=>m.table==='other-bounds')&&!validWebhook(otherWebhook))throw new Error('Missing or invalid Other bounds records webhook');
 let sent=0,failed=0,logFailed=false;
 for(const entry of messages){
  let accepted=false;
  const target=entry.table==='other-bounds'?otherWebhook!:webhook;
  try {
   // Event keys start with the board slug. Unrecognized boards get an uncolored embed.
   const slug=entry.key.match(/^\["([^"]+)"/)?.[1]??'';
   const color=discordRecordColors[slug]??(isOther(slug)?otherBoundsColor:undefined);
   const response=await send(target+'?wait=true',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json'},body:JSON.stringify({content:'',embeds:[{description:entry.content,color}],allowed_mentions:{parse:[]}})});
   if(response.ok){sent++;accepted=true;}else failed++;
  }catch{failed++;} // Never log a URL, response body or exception containing a secret.
  // Keep sending the reserved batch even if the local acceptance log fails.
  if(accepted&&onAccepted){try{onAccepted(entry);}catch{logFailed=true;}}
 }
 if(logFailed)throw new Error('Accepted Discord message log could not be saved');
 return {sent,failed};
}
