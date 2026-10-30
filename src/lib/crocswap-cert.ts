import {compare} from './ranking.ts';
// Human Verified on a CrocSwap pull request row (Lead ruling b3, 2026-10-30; data/crocswap_cert.py keeps the file).
// A merged row is Claimed when CrocSwap's own ledger says partially_reviewed (archival intake) and main does not certify its
// kappa. It is Human Verified when main certifies its kappa (a revision of certificates/selected-result.json with the row's
// kappa that lists the pull request in source_prs, or certificates/checkpoints/frontier<PR>.json with the row's kappa), or the
// ledger says incorporated, or it merged before CrocSwap's archival-intake text (CONTRIBUTING.md, commit 43f5722f) and the
// ledger has no entry. A merge after that with no entry is Claimed. A row that is not merged is Human Verified only when certified.
export interface CrocswapCertifications {
  selected_revisions: {commit:string; committed_at:string; kappa:string; source_prs:number[]}[];
  frontiers: Record<string,{commit:string; committed_at:string; kappa:string}>;
  // The dispositions of the two ledger files by name; pr-intake-decisions wins over pr-ledger.
  ledger?: Record<string,{blob:string; dispositions:Record<string,number[]>}>;
}
export const archivalIntakePolicyAt='2026-10-16T13:32:45Z';
export type CrocswapBasis='selected-result'|'frontier'|'ledger'|'before-ledger';
export interface CrocswapCertification {commit?:string; at:string; via:CrocswapBasis}
export const noCertifications:CrocswapCertifications={selected_revisions:[],frontiers:{}};
// The earliest certifying commit of the row, or undefined. Its time is the time of Human Verified.
export function crocswapCertification(certifications:CrocswapCertifications,pr:number,score:string):CrocswapCertification|undefined {
 const found:CrocswapCertification[]=[];
 for(const revision of certifications.selected_revisions)
  if(revision.source_prs.includes(pr)&&compare(revision.kappa,score)===0)found.push({commit:revision.commit,at:revision.committed_at,via:'selected-result'});
 const frontier=certifications.frontiers[String(pr)];
 if(frontier&&compare(frontier.kappa,score)===0)found.push({commit:frontier.commit,at:frontier.committed_at,via:'frontier'});
 return found.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))[0];
}
// PR number to ledger disposition; the newer file overrides the older one.
const dispositionMaps=new WeakMap<CrocswapCertifications,Map<number,string>>();
export function ledgerDisposition(certifications:CrocswapCertifications,pr:number):string|undefined {
 let map=dispositionMaps.get(certifications);
 if(!map){
  map=new Map();
  for(const name of ['pr-ledger','pr-intake-decisions'])
   for(const [disposition,numbers] of Object.entries(certifications.ledger?.[name]?.dispositions??{}))for(const n of numbers)map.set(n,disposition);
  dispositionMaps.set(certifications,map);
 }
 return map.get(pr);
}
// Why a CrocSwap PR row is Human Verified, or undefined when it is Claimed. at: the time of Human Verified (the certifying
// commit; for the ledger or an early merge, the merge).
export function crocswapVerification(certifications:CrocswapCertifications,row:{pr:number;score:string;upstreamStatus:string;mergedAt?:string}):CrocswapCertification|undefined {
 const certified=crocswapCertification(certifications,row.pr,row.score);
 if(certified)return certified;
 if(row.upstreamStatus!=='merged'||!row.mergedAt)return undefined;
 const disposition=ledgerDisposition(certifications,row.pr);
 if(disposition==='incorporated')return {at:row.mergedAt,via:'ledger'};
 if(disposition===undefined&&Date.parse(row.mergedAt)<Date.parse(archivalIntakePolicyAt))return {at:row.mergedAt,via:'before-ledger'};
 return undefined;
}
