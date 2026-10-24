import {createHmac,randomBytes} from 'node:crypto';
export const endpoint='https://api.x.com/2/tweets';
export const secretNames=['X_API_KEY','X_API_KEY_SECRET','X_ACCESS_TOKEN','X_ACCESS_TOKEN_SECRET'] as const;
export interface Credentials {key:string;secret:string;token:string;tokenSecret:string}
export type XLog=Record<string,{status:'posted'|'skipped'|'unknown'|'failed';at:string;id?:string;reason?:string;code?:number}>;
export interface XEntry {key:string;x_text?:string}
export function credentials(env:Record<string,string|undefined>):Credentials|undefined {
 if(secretNames.some(name=>!env[name]?.trim()))return;
 return {key:env.X_API_KEY!,secret:env.X_API_KEY_SECRET!,token:env.X_ACCESS_TOKEN!,tokenSecret:env.X_ACCESS_TOKEN_SECRET!};
}
const encode=(value:string)=>encodeURIComponent(value).replace(/[!'()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());
export function oauthHeader(c:Credentials,url=endpoint,nonce=randomBytes(24).toString('hex'),timestamp=String(Math.floor(Date.now()/1000)),form:Record<string,string>={},method='POST'):string {
 const oauth:Record<string,string>={oauth_consumer_key:c.key,oauth_nonce:nonce,oauth_signature_method:'HMAC-SHA1',oauth_timestamp:timestamp,oauth_token:c.token,oauth_version:'1.0'};
 const parsed=new URL(url);
 const parameters=[...parsed.searchParams,...Object.entries(form),...Object.entries(oauth)].map(([k,v])=>[encode(k),encode(v)]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:a[1]<b[1]?-1:a[1]>b[1]?1:0).map(pair=>pair.join('=')).join('&');
 // JSON request bodies are not included in OAuth 1.0a signature parameters.
 const base=[method,parsed.origin+parsed.pathname,parameters].map(encode).join('&');
 oauth.oauth_signature=createHmac('sha1',encode(c.secret)+'&'+encode(c.tokenSecret)).update(base).digest('base64');
 return 'OAuth '+Object.entries(oauth).sort().map(([k,v])=>`${encode(k)}="${encode(v)}"`).join(', ');
}
export function prepare(posts:XEntry[],previous:XLog|undefined,at:string):{log:XLog;batch:XEntry[]} {
 const log:XLog={...previous},batch:XEntry[]=[];
 if(previous===undefined){
  for(const post of posts)log[post.key]={status:'skipped',at,reason:'before API start'};
  return {log,batch};
 }
 for(const post of posts){
  if(Object.hasOwn(log,post.key))continue;
  if(batch.length===5)break;
  log[post.key]={status:'unknown',at,reason:'reserved before API send'};
  batch.push(post);
 }
 return {log,batch};
}
export async function sendBatch(c:Credentials,batch:XEntry[],log:XLog,save:(log:XLog)=>void,options:{send?:typeof fetch;sleep?:(ms:number)=>Promise<void>;report?:(line:string)=>void;now?:()=>string}={}):Promise<void> {
 const send=options.send??fetch,sleep=options.sleep??(ms=>new Promise(resolve=>setTimeout(resolve,ms))),report=options.report??console.log,now=options.now??(()=>new Date().toISOString());
 for(const [index,entry] of batch.slice(0,5).entries()){
  // Only the freshly reserved batch may be sent. Later plans skip unknown keys.
  if(log[entry.key]?.status!=='unknown'||log[entry.key]?.reason!=='reserved before API send')continue;
  if(index)await sleep(2000);
  const text=entry.x_text?.replace(/\n\nhttps?:\/\/\S+\s*$/,'');
  if(!text||/https?:\/\/|www\./i.test(text)){
   log[entry.key]={status:'failed',at:now(),reason:'missing x_text or contains a link'};save(log);report('X failed: invalid text');continue;
  }
  log[entry.key]={status:'unknown',at:now(),reason:'request outcome unknown'};save(log);
  let response:Response;
  try{
   response=await send(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:oauthHeader(c),'Content-Type':'application/json'},body:JSON.stringify({text})});
  }catch{report('X unknown outcome; key will not be retried');continue;}
  let billing=response.status===402;
  if(response.status===403||response.status===429){
   // Inspect only for classification; never print an API error body.
   try{billing=/credit|billing|payment|insufficient[\s_-]*(?:funds|balance)|spend(?:ing)?[\s_-]*(?:cap|limit)/i.test(await response.text());}catch{}
  }
  if(billing){
   delete log[entry.key];save(log);report(`X pending: credits or billing blocked HTTP ${response.status}; reservation released`);continue;
  }
  if(response.status===429||response.status>=500){
   delete log[entry.key];save(log);report(`X pending: HTTP ${response.status}`);continue;
  }
  if(!response.ok){
   log[entry.key]={status:'failed',at:now(),code:response.status};save(log);report(`X failed: HTTP ${response.status}`);continue;
  }
  try{
   const body=await response.json() as {data?:{id?:string}};
   if(!body.data?.id||!/^\d+$/.test(body.data.id))throw new Error('Invalid confirmation');
   log[entry.key]={status:'posted',at:now(),id:body.data.id};
  }catch{report('X unknown outcome; invalid confirmation; key will not be retried');}
  save(log);
 }
}

// A one-off correction (Lead, 2026-10-24, after #5270): delete a post that this repository sent. Only an id that
// data/x-posts.json logs as posted may be deleted, and a response body is never printed.
export async function deleteTweet(c:Credentials,id:string,log:XLog,send:typeof fetch=fetch):Promise<string> {
 if(!/^[1-9][0-9]{0,24}$/.test(id))throw new Error('Invalid tweet id');
 if(!Object.values(log).some(entry=>entry.status==='posted'&&entry.id===id))throw new Error('The id is not a post of this repository');
 const url=`https://api.x.com/2/tweets/${id}`;
 const response=await send(url,{method:'DELETE',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:oauthHeader(c,url,undefined,undefined,{},'DELETE')}});
 if(!response.ok)return `X delete failed: HTTP ${response.status}`;
 try{
  const body=await response.json() as {data?:{deleted?:boolean}};
  return body.data?.deleted===true?'X post deleted':'X delete: unexpected confirmation';
 }catch{return 'X delete: unexpected confirmation';}
}
