import type {RecordEntry} from './types.ts';
import {ranked} from './ranking.ts';
// Keep the landing's post-announcement publication rule. An observation is not a publication.
// The breakthrough has its own column, so it is never also the latest result.
export function landingRecords(records:RecordEntry[],direction:string):RecordEntry[]{
 const seen=new Set<string>();
 return ranked(records,direction).map(row=>row.record).filter(record=>{
  if(record.isBreakthrough||record.publicationYear||record.dateLabel==='Observed'||record.date.slice(0,10)<='2026-10-06'||seen.has(record.evidenceLevel))return false;
  seen.add(record.evidenceLevel);return true;
 });
}
export function firstSelected<T extends {evidenceLevel:string}>(records:readonly T[],levels:readonly string[]):T|undefined{
 return records.find(record=>levels.includes(record.evidenceLevel));
}
