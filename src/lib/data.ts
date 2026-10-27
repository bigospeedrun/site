import profiles from './author-profiles.json';
import avatars from './author-avatars.json';
import {authorFromProfile, recordEvidenceUrl} from './record-links';
import {classifyEvidence,isBoardEntry,isBreakthroughRecord} from './evidence';
import type {Problem,RecordEntry,Repo} from './types';
import {methodNoteFor,type MethodNotes} from './method-notes';
import {decimal,logExponent,boundPrecision,tableBound,displayDigits} from './ranking';
// This is the boundary adapter for the reviewed, data-only snapshot. No repo code runs.
const files=import.meta.glob('../data/*.json',{eager:true,import:'default'});
const read=(file:string):any=>files['../data/'+file];
const registry=read('registry.json');
// Reviewed prove2.me links by board and row id (data/prove2me_import.py). Older bundles have no file.
const prove2me=read('prove2me.json')??{boards:{}};
// Reviewed notes on how a record is proved, by board and row id (data/method-notes.json). Older bundles have no file.
const methodNotes:MethodNotes=read('method-notes.json')??{};
const prove2meLink=(slug:string,id:string):string|undefined=>{const url=prove2me.boards?.[slug]?.links?.[id];return typeof url==='string'&&url.startsWith('https://prove2.me/theorems/')?url:undefined;};
export const dataUpdatedAt:string=[registry.updated_at,...registry.problems.map((p:any)=>read(p.data_file).updated_at)].sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1);
const titles:Record<string,string>={'matrix-multiplication':'Matrix Multiplication','3sum':'3SUM',apsp:'All-pairs shortest paths','subset-sum':'Subset Sum','integer-multiplication':'Integer multiplication','exact-dft':'Exact discrete Fourier transform','directed-sssp':'Directed shortest paths','3sat':'3-SAT'};
const repoName=(url:string):string=>url?.match(/^https:\/\/github.com\/([^/]+\/[^/]+)/)?.[1]??'';
const bound=(slug:string,score:string,relation?:string)=>{
 const value=decimal(score);const [n,d]=score.split('/');const exact=d?`\\frac{${n}}{${d}}`:n;
 const open=relation==='strict-upper-bound';
 if(slug==='integer-multiplication'||slug==='exact-dft'){
  if(open)return `O(n \\log^{1-\\kappa} n),\\quad \\kappa < ${exact}`;
  return score==='0'?'O(n \\log n)':`O(n \\log^{${logExponent(score)}} n)`;
 }
 if(slug==='matrix-multiplication')return `O(n^{${value}+\\varepsilon})`;
 // An open endpoint: every exponent above the score is proved, not the score itself.
 if(slug==='subset-sum')return `O(2^{${open?`(${value}+\\varepsilon)`:value}n})`;
 if(slug==='directed-sssp')return `O(n \\log^{${exact}} n)`;
 if(slug==='3sat')return `O^*(2^{n/(\\log n)^{${value}-o(1)}})`;
 return `O(n^{${value}${open?'+\\varepsilon':''}})`;
};
export const problems:Problem[]=registry.problems.map((p:any)=>{
 const data=read(p.data_file);const rawRepos=registry.repositories.filter((r:any)=>r.problem_ids.includes(p.problem_id)&&r.listing_mode!=='planned');
 const repos:Repo[]=rawRepos.map((r:any)=>({name:r.repo,owner:r.owner,url:r.url,ownerUrl:'https://github.com/'+r.owner,open:r.repo===p.race_repo,submission:r.repo===p.race_repo?(r.submission_url??r.url+'/pulls'):undefined,rules:r.rules_url??(r.repo===p.race_repo?r.url+'/blob/main/CONTRIBUTING.md':undefined),agents:r.agents_url??undefined,mode:r.opted_in?'Listed race':r.listing_mode==='research-artifact'?'Research artifact · not an open race':'Independent read-only listing; not opted in'}));
 const records:RecordEntry[]=data.records.map((r:any)=>{
 const meta=data.record_metadata?.[r.id]??{};const repo=repoName(meta.source_url??r.source?.url??r.submission_url);const entry=rawRepos.find((x:any)=>x.repo===repo);
 // The site assigns evidence levels from the problem review rule and proof receipts.
 const evidenceLevel=classifyEvidence({slug:p.slug,repo,upstreamStatus:r.upstream_status,upstreamSelected:meta.upstream_selected===true,proofPassed:meta.site_tier==='verified'&&r.rerun_status?.state==='passed'&&Boolean(r.rerun_status?.receipt_path)});
 const prove2meUrl=prove2meLink(p.slug,r.id);
 // The Oct 6 announcement is the known public date when the snapshot has no publication date.
 const announcementDate=['openai-original-109','exact-dft-2026','subset-sum-2026'].includes(r.id)&&!meta.publication_date?'2026-10-06':undefined;
 const sourceDate=r.id==='directed-sssp-2026'&&!meta.publication_date?'2026-09-21T06:31:30Z':undefined;
 const evidence=meta.source_url_public===false?[{name:'Local source',url:'/'+(r.artifact?.path??r.rerun_status.receipt_path)}]:[{name:'Source',url:meta.source_url??r.source?.url??r.submission_url}];
 if(r.evidence.paper_url)evidence.push({name:'Paper',url:r.evidence.paper_url});
 if(r.evidence.certificate_path&&repo&&r.source_commit)evidence.push({name:'Certificate',url:`https://github.com/${repo}/blob/${r.source_commit}/${r.evidence.certificate_path}`});
 if(meta.source_url_public!==false&&r.source_commit&&repo)evidence.push({name:'Commit',url:`https://github.com/${repo}/tree/${r.source_commit}`});
 if(prove2meUrl)evidence.push({name:'prove2.me',url:prove2meUrl});
 return {id:r.id,reproductionOf:meta.reproduction_of,score:r.score,scoreRelation:r.score_relation??'attained',evidenceLevel,evidenceUrl:recordEvidenceUrl(evidenceLevel,r,evidence[0]?.url,meta.prove2me===true?meta.source_url:meta.receipt_url),title:r.title,date:meta.publication_date??announcementDate??sourceDate??r.submitted_at??r.site_observed_at,publicationYear:meta.publication_date_precision==='year'?meta.publication_year:undefined,dateLabel:announcementDate?'Announcement date':sourceDate?'Commit date':meta.publication_date_role?.toLowerCase().includes('commit')?'Commit date':meta.publication_date_role?.includes('paper')?'Paper date':meta.publication_date?'Source date':meta.date_precision?.includes('observation')||r.submitted_at===r.site_observed_at?'Observed':'Source date',repo:meta.source_url_public===false?'':repo,repoId:entry?.repo_id??0,authors:r.authors.map((a:any)=>{
 const url=r.id==="crocswap-selected-75ea36bd581c1c02"?"https://github.com/Dugongue":a.url;
 return authorFromProfile({...a,url},profiles,avatars);
}),bound:p.slug==="subset-sum"&&r.id==="classical-baseline"?"O^*(2^{n/2})":p.slug==="3sat"&&r.id==="classical-baseline"?"O^*(1.307031578^n)":bound(p.slug,r.score,r.score_relation),evidence,predecessors:r.predecessors,dependencies:r.dependencies,status:meta.proof_status??'Not independently rerun',comparisonNote:meta.comparison_status??'',creditNote:typeof meta.credit_note==='string'?meta.credit_note:undefined,methodNote:methodNoteFor(methodNotes,p.slug,r.id,repo),upstreamStatus:r.upstream_status??'not-applicable',upstreamSelected:meta.upstream_selected===true,comparison:meta.comparison_key??(r.dependencies.length?repo||r.id:'Reported model'),eligible:meta.eligible_for_record!==false,raceEventAt:meta.race_event_at??(meta.publication_date_precision==='date-time'?meta.publication_date:undefined)??(meta.upstream_selected?r.submitted_at:undefined),rerunStatus:r.rerun_status,provenance:r.provenance,prove2me:meta.prove2me===true||meta.prove2me_upgrade===true,prove2meUrl,
  ...(meta.direct_submission===true&&['pending','failed','held'].includes(meta.verification)&&typeof meta.publication_date==='string'?{verification:{state:meta.verification,since:meta.publication_date}}:{})};
 });
 const kappa=data.score.symbol==='kappa';
 const digits=boundPrecision(records.filter(r=>isBoardEntry(p.slug,r)).map(r=>r.score),kappa);
 // Desktop tables, charts and posts use the table cap; the landing page and phone tables use the landing cap.
 for(const record of records)if(record.id!=='classical-baseline'){
  record.shortBound=tableBound(record,kappa,digits,displayDigits.landing);
  record.bound=tableBound(record,kappa,digits);
 }
 return {slug:p.slug,title:titles[p.slug],model:data.model.id.replaceAll('-',' '),modelId:data.model.id,scope:data.model.description,direction:data.score.direction,symbol:data.score.symbol==='kappa'?'kappa':'exponent',repos,records,lastDataCheck:data.updated_at,lastProofCheck:records.filter(r=>r.rerunStatus?.checked_at&&['passed','failed'].includes(r.rerunStatus.state)).map(r=>r.rerunStatus!.checked_at!).filter(Boolean).sort().at(-1)??null,sourceFetch:data.checked_at,pending:'Independent checks have not run. No site proof badges.',notes:[],};
});

// All views admit open review submissions as Claimed through the shared admission rule.
// These sources claim the same scored problem; evidence strength does not change score units.
export const boardRecords=(problem:Problem):RecordEntry[]=>problem.records.filter(record=>isBoardEntry(problem.slug,record)).map(record=>({...record,isBreakthrough:isBreakthroughRecord(problem.slug,record.id)}));
