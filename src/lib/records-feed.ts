import {ranked,boundPrecision,boundExponent,scientificSaving,displayDigits} from './ranking.ts';
import {evidenceName,evidenceLevels} from './evidence.ts';
import {otherBoundLeader} from './other-leader.ts';
import type {Problem,RecordEntry} from './types';

// verification: a Claimed direct submission (bigospeedrun/verifier issue or PR) whose Lean check has not
// passed: 'pending' while it runs (since: the submission time), 'failed' after a final failed outcome,
// 'held' while a maintainer reviews it (derivation hold or the verifier's review label).
export interface FeedVerification {state:'pending'|'failed'|'held'; since:string}
export interface FeedRecord {id:string; score:string; relation:string; evidence:string; authors:string[]; bound:string; display?:string; verification?:FeedVerification}
// table: the landing-page table of the board. 'big-o' (also when absent, in older
// snapshots) posts to the Big O records channel; 'other-bounds' to the Other bounds one.
export type FeedTable='big-o'|'other-bounds';
// direction: which score is better on the board. Absent in older snapshots: then no row of the board is superseded (see plan).
export type FeedDirection='lower'|'higher';
export interface FeedBoard {slug:string; name:string; url:string; leader:string|null; records:FeedRecord[]; table?:FeedTable; direction?:FeedDirection}
export interface FeedSnapshot {schema_version:1; boards:FeedBoard[]}
export interface FeedState {schema_version:1; snapshot:FeedSnapshot; reserved:string[]; deferred?:{key:string;slug:string;authors:string[];hold?:true}[]}
export interface FeedMessage {key:string; content:string; x_text?:string; authors?:string[]; table?:FeedTable}
// deleted_at: the post was taken down by hand (or by the x-delete workflow). The planner then treats it as never
// announced: it no longer blocks the same bound (announced) or the same shown value (lastValue).
export interface RecordPost {key:string; text:string; x_text:string; posted_at:string; authors?:string[]; deleted_at?:string; deleted_reason?:string}
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
export function plainBound(slug:string,score:string,relation='attained',digits?:number,shown?:string):string {
 const kappa=slug==='integer-multiplication'||slug==='exact-dft';
 const precision=digits??boundPrecision([score],kappa);
 const rounded=shown??(kappa?decimalSaving(score,precision):boundExponent(score,false,precision));
 const value=rounded.includes('.')?rounded.replace(/0+$/,'').replace(/\.$/,''):rounded;
 const epsilon=relation==='strict-upper-bound'?', for every fixed epsilon > 0':'';
 if(kappa)return `O(n log^(1 - ${value}${epsilon? ' + epsilon':''}) n)${epsilon}`;
 if(slug==='matrix-multiplication')return `O(n^(${value} + epsilon)), for every fixed epsilon > 0`;
 // An open endpoint never posts as attained: n^(a+o(1)) is O(n^(a + epsilon)), not O(n^a).
 if(slug==='3sat')return `O*(2^(n/(log n)^(${value} - o(1))))`;
 if(slug==='subset-sum')return epsilon?`O(2^((${value} + epsilon)n))${epsilon}`:`O(2^(${value}n))`;
 return epsilon?`O(n^(${value} + epsilon))${epsilon}`:`O(n^${value})`;
}
export function feedBoard(problem:Pick<Problem,'slug'|'direction'>,records:(Pick<RecordEntry,'id'|'score'|'scoreRelation'|'date'|'repoId'|'evidenceLevel'|'authors'>&Partial<Pick<RecordEntry,'verification'>>)[],name:string):FeedBoard {
 const digits=boundPrecision(records.map(r=>r.score),problem.slug==='integer-multiplication'||problem.slug==='exact-dft');
 return {slug:problem.slug,name,url:`https://bigospeedrun.com/${problem.slug}`,leader:ranked(records,problem.direction)[0]?.record.id??null,direction:problem.direction==='higher-is-better'?'higher':'lower',
 records:records.map(r=>({id:r.id,score:r.score,relation:r.scoreRelation??'attained',evidence:evidenceName(r.evidenceLevel),authors:r.authors.map(a=>a.name),bound:plainBound(problem.slug,r.score,r.scoreRelation,digits),
  ...(r.verification&&evidenceName(r.evidenceLevel)==='Claimed'?{verification:r.verification}:{})}))};
}
// A post's value never claims more than the proof (Lead, 2026-10-24): rounded down on a higher-is-better
// kappa board, up on a lower-is-better exponent board. sig: significant digits; places: decimal places.
export function directedDecimal(score:string,up:boolean,{sig,places}:{sig?:number;places?:number}):string {
 const [ns,ds='1']=score.split('/');const n=BigInt(ns),d=BigInt(ds);
 if(n===0n)return '0';
 let shift:number;
 if(places!==undefined)shift=places;
 else{
  let e:number;const q=n/d;
  if(q>0n)e=q.toString().length-1;
  else{let k=0,t=n*10n;while(t<d){t*=10n;k++;}e=-(k+1);}
  shift=(sig??3)-1-e;
 }
 const num=shift>=0?n*10n**BigInt(shift):n,den=shift>=0?d:d*10n**BigInt(-shift);
 let m=num/den;if(up&&m*den!==num)m+=1n;
 let text=m.toString();
 if(shift<=0)return text+'0'.repeat(-shift);
 if(text.length<=shift)text='0'.repeat(shift-text.length+1)+text;
 return (text.slice(0,text.length-shift)+'.'+text.slice(text.length-shift)).replace(/0+$/,'').replace(/\.$/,'');
}
// The bound text of a post on a Big O board: digits from the new bound and the row it beats (the best other
// row), at least 3, and more while the two would look equal, up to the site's table cap (displayDigits.table),
// so rows that agree beyond the cap still show the same value. The site tables keep their board precision.
export function postBound(board:FeedBoard,record:FeedRecord,minDigits=3):string {
 const kappa=board.slug==='integer-multiplication'||board.slug==='exact-dft';
 const up=!kappa;
 const others=board.records.filter(r=>r.score!==record.score||r.relation!==record.relation);
 const better=(a:string,b:string)=>{const [an,ad='1']=a.split('/'),[bn,bd='1']=b.split('/');const x=BigInt(an)*BigInt(bd),y=BigInt(bn)*BigInt(ad);return kappa?x>y:x<y;};
 const beaten=others.reduce<FeedRecord|undefined>((best,r)=>!best||better(r.score,best.score)?r:best,undefined);
 const shown=(score:string,digits:number)=>directedDecimal(score,up,kappa?{sig:digits}:{places:digits});
 let digits=Math.min(minDigits,displayDigits.table);
 while(beaten&&digits<displayDigits.table&&shown(record.score,digits)===shown(beaten.score,digits))digits++;
 return plainBound(board.slug,record.score,record.relation,digits,shown(record.score,digits));
}
// The bound text of a Lean Verified post on an Other bounds board (Lead, 2026-10-24, after the #62 post that showed the
// same 3.76154 as the #58 post): the same digits rule as postBound. The row it beats is the best Lean Verified row of the
// board before this pass (old). The claim's display decimal in the bound is replaced by the fewest decimal places (at
// least 3) that separate the new score from that row, rounded toward the weaker bound: up on a lower-is-better board,
// down on a higher-is-better one. minPlaces raises the floor (the safety net in plan). Returns the bound unchanged when
// there is no such row, no direction, no plain decimal display in the bound, or a score that is not a number.
export function otherPostBound(board:FeedBoard,old:FeedBoard|undefined,record:FeedRecord,minPlaces=0):string {
 const display=record.display,value=ratio(record.score);
 if(!board.direction||!display||!value||!/^\d+\.\d+$/.test(display)||record.bound.split(display).length!==2)return record.bound;
 const up=board.direction==='lower';
 const fraction=(score:string)=>{const v=ratio(score);return v?`${v[0]}/${v[1]}`:null;};
 const mine=fraction(record.score)!;
 let beaten:string|undefined;
 for(const r of old?.records??[]){
  if(r.evidence!=='Lean Verified'||identity(old!,r)===identity(board,record))continue;
  const other=ratio(r.score);
  if(!other)continue;
  if(!beaten)beaten=fraction(r.score)!;
  else{const [bn,bd]=ratio(beaten)!,x=other[0]*bd,y=bn*other[1];if(board.direction==='higher'?x>y:x<y)beaten=fraction(r.score)!;}
 }
 if(!beaten&&!minPlaces)return record.bound;
 const shown=(score:string,places:number)=>directedDecimal(score,up,{places});
 let places=Math.min(displayDigits.table,Math.max(3,minPlaces));
 while(beaten&&places<displayDigits.table&&shown(mine,places)===shown(beaten,places))places++;
 const text=shown(mine,places);
 return record.bound.replace(display,text.includes('.')?text:text+'.0');
}
// A plain-text form of a site bound (KaTeX source) for Discord and X posts.
export function plainTex(tex:string):string {
 let s=tex.replace(/\{,\}/g,',');
 s=s.replace(/\\[,;:!]/g,' '); // TeX thin spaces are spacing, not punctuation
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
export interface OtherRow {slug:string; name:string; bestHandle:string; claims:OtherClaim[]; direction?:string}
export function otherFeedBoard(row:OtherRow):FeedBoard {
 const id=(c:OtherClaim)=>c.handle+':'+c.value;
 const level=(e:string)=>evidenceLevels.some(l=>l.id===e)?evidenceName(e as typeof evidenceLevels[number]['id']):'Claimed';
 const leader=otherBoundLeader(row);
 return {slug:'other-'+row.slug,name:row.name,url:`https://bigospeedrun.com/other/${row.slug}`,leader:leader?id(leader):null,table:'other-bounds',...(row.direction==='lower'||row.direction==='higher'?{direction:row.direction}:{}),
  records:row.claims.map(c=>({id:id(c),score:c.value,relation:c.display.startsWith('<')?'strict-upper-bound':'attained',evidence:level(c.evidence),
   authors:c.authors.map(a=>a.name),bound:plainTex(c.bound),...(c.display?{display:c.display}:{})}))};
}
const isOther=(slug:string)=>slug.startsWith('other-');
export const HOLD_LIMIT=24*60*60*1000;
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
// A score as a fraction: 'n', 'n/d' or a decimal 'n.m'. null for any other text.
function ratio(score:string):[bigint,bigint]|null {
 const fraction=score.match(/^(\d+)\/(\d+)$/),decimal=score.match(/^(\d+)(?:\.(\d+))?$/);
 if(fraction&&BigInt(fraction[2])>0n)return [BigInt(fraction[1]),BigInt(fraction[2])];
 if(decimal)return [BigInt(decimal[1]+(decimal[2]??'')),10n**BigInt((decimal[2]??'').length)];
 return null;
}
// Burst of sharpenings (darkhipo's average-sensitivity rounds #60-#63, 2026-10-24, Lead): rows of one board with the
// exact same author list that gain Lean Verified post only the best by the board's direction. Returns the event keys
// of the others, which are reserved without a post. Two cases: (1) in one pass, only the best of the rows that gain
// Lean Verified posts; (2) a row that gains Lean Verified does not post when a row with the same author list was
// already Lean Verified in the saved state and is at least as good (so a late row of a burst posts nothing).
// Only rows that would post count as gaining (not reserved, not announced). A board without direction, or a score
// that is not a number, supersedes nothing.
function superseded(board:FeedBoard,old:FeedBoard|undefined,reserved:Set<string>,announced:Set<string>):Set<string> {
 const result=new Set<string>();
 if(!board.direction)return result;
 const wasLean=(record:FeedRecord)=>old?.records.find(r=>identity(old,r)===identity(board,record))?.evidence==='Lean Verified';
 const groups=new Map<string,FeedRecord[]>();
 const existing=new Map<string,FeedRecord[]>();
 for(const record of board.records){
  if(record.evidence!=='Lean Verified')continue;
  const group=JSON.stringify(record.authors);
  if(wasLean(record)){existing.set(group,[...(existing.get(group)??[]),record]);continue;}
  const key=eventKey(board,record);
  if(reserved.has(key)||announced.has(postedBoundKey(key)))continue;
  groups.set(group,[...(groups.get(group)??[]),record]);
 }
 // Is the score of record a better than b by the direction? At an equal score: an attained row beats an open endpoint.
 const better=(a:FeedRecord,b:FeedRecord)=>{
  const [an,ad]=ratio(a.score)!,[bn,bd]=ratio(b.score)!,x=an*bd,y=bn*ad;
  if(x!==y)return board.direction==='higher'?x>y:x<y;
  return a.relation==='attained'&&b.relation!=='attained';
 };
 // At least as good: not worse, whatever the relation.
 const atLeastAsGood=(a:FeedRecord,b:FeedRecord)=>{
  const [an,ad]=ratio(a.score)!,[bn,bd]=ratio(b.score)!,x=an*bd,y=bn*ad;
  return x===y||(board.direction==='higher'?x>y:x<y);
 };
 for(const [group,gaining] of groups){
  const prior=(existing.get(group)??[]).filter(r=>ratio(r.score));
  let rows=gaining.filter(r=>ratio(r.score));
  if(rows.length<gaining.length&&gaining.length>1)continue;
  for(const record of rows)if(prior.some(p=>atLeastAsGood(p,record)))result.add(eventKey(board,record));
  rows=rows.filter(r=>!result.has(eventKey(board,r)));
  if(rows.length<2)continue;
  // The best score; at an equal score an attained row beats an open endpoint, then the first row stays.
  let best=0;
  for(let i=1;i<rows.length;i++)if(better(rows[i],rows[best]))best=i;
  rows.forEach((record,i)=>{if(i!==best)result.add(eventKey(board,record));});
 }
 return result;
}
export function plan(previous:FeedState,snapshot:FeedSnapshot,posts:(Pick<RecordPost,'key'>&Partial<RecordPost>)[]=[],now=Date.now()):{state:FeedState;messages:FeedMessage[]} {
 const reserved=new Set(previous.reserved),messages:FeedMessage[]=[];
 // A deleted post (Lead, 2026-10-24, after #5270) says nothing public any more, so it is no announcement.
 // It still counts for the 3 h throttle below: the post did reach its channel for a while.
 const live=posts.filter(post=>!post.deleted_at);
 const announced=new Set(live.map(post=>postedBoundKey(post.key)));
 // Shown values have a display cap, so a new leader can show the same value as the last
 // post for its board. That post would say nothing new, and X refuses it as a duplicate.
 const lastValue=new Map<string,string>();
 for(const post of live){const value=postedValue(post);if(value)lastValue.set(JSON.parse(post.key.slice(0,post.key.lastIndexOf(':')))[0],value)}
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
  const lesser=superseded(board,old,reserved,announced);
  for(const record of board.records){
   const prior=old?.records.find(r=>identity(old,r)===identity(board,record));
   const oldLeader=old?.records.find(r=>r.id===old.leader);
   const newLeader=record.id===board.leader&&(!oldLeader||identity(old!,oldLeader)!==identity(board,record));
   const gainedLean=record.evidence==='Lean Verified'&&prior?.evidence!=='Lean Verified';
   const key=eventKey(board,record);
   if(lesser.has(key)){reserved.add(key);deferred.delete(key);continue;}
   const waiting=record.id===board.leader&&deferred.has(key);
   // A held direct claim (below) that now leads with Lean Verified posts once, as a new record.
   const held=record.id===board.leader&&key!==identity(board,record)+':record'&&deferred.get(identity(board,record)+':record')?.hold===true;
   // Rows imported from prove2.me (data/prove2me_import.py) are old results. When its
   // LEAN_VERIFIED switch flips, a row that does not lead its board posts nothing.
   if(gainedLean&&!newLeader&&!waiting&&record.id.startsWith('prove2me-')&&record.id!==board.leader){reserved.add(key);continue;}
   if((newLeader||gainedLean||waiting||held)&&!reserved.has(key)){
    const boundKey=postedBoundKey(key);
    if(announced.has(boundKey)){reserved.add(key);deferred.delete(key);continue;}
    const verifiedUpgrade=gainedLean&&announced.has(postedBoundKey(identity(board,record)+':record'));
    const isNew=(newLeader||waiting||held)&&!verifiedUpgrade;
    // Nil, 2026-10-23: a direct submission goes to verification automatically, so its new-leader
    // post waits until verification ends: a pass posts once (above), a failure never posts, and a
    // check still running after HOLD_LIMIT posts as Claimed. The hold is a deferred entry, not a
    // reservation, and is decided again on every plan.
    const hold=record.verification;
    if(isNew&&hold&&record.evidence==='Claimed'){
     if(hold.state==='failed'){reserved.add(key);deferred.delete(key);continue;}
     const since=Date.parse(hold.since);
     // A held submission (a suspected copy under review) never posts as a claim; after approval it
     // gains Lean Verified and posts once as a new record.
     if(hold.state==='held'||!Number.isFinite(since)||now-since<HOLD_LIMIT){deferred.set(key,{key,slug:board.slug,authors:record.authors,hold:true});continue;}
    }
    // Digits (Lead, 2026-10-24): a Lean Verified post shows the digits that separate it from the best Lean Verified row
    // before this pass. Safety net: when the text still equals a live post, one more digit each round; if no round gives a
    // new text, nothing posts (X refuses an identical text; the #62 post of 2026-10-24 got a 403 that way).
    const build=(extra:number)=>{
     const places=extra&&record.display?.includes('.')?record.display.split('.')[1].length+extra:0;
     const row=isOther(board.slug)?(record.evidence==='Lean Verified'?{...record,bound:otherPostBound(board,old,record,places)}:record):{...record,bound:postBound(board,record,3+extra)};
     return {row,content:message(board,row,isNew),x_text:xMessage(board,row,isNew)};
    };
    let built=build(0);
    const boardPosts=live.filter(post=>JSON.parse(post.key.slice(0,post.key.lastIndexOf(':')))[0]===board.slug);
    const taken=(m:{content:string;x_text:string})=>boardPosts.some(post=>post.text===m.content||post.x_text===m.x_text);
    for(let extra=1;extra<=displayDigits.table&&taken(built);extra++)built=build(extra);
    if(taken(built)){reserved.add(key);deferred.delete(key);continue;}
    const posted=built.row;
    if(isNew&&lastValue.get(board.slug)===posted.bound){reserved.add(key);deferred.delete(key);continue;}
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
    messages.push({key,content:built.content,x_text:built.x_text,authors:record.authors,...(board.table?{table:board.table}:{})});
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
 '3sat':0xEC4899,
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
