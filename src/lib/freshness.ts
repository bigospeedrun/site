import {acceptedRaceRecord} from './ranking.ts';
import type {Problem} from './types';
export function localTimeFallback(value:string):string {
 if(/^\d{4}-\d{2}-\d{2}$/.test(value))return new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'short',day:'numeric'}).format(new Date(value));
 return new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value))+' PT';
}
export function latestRaceRecord(p:Problem):string|undefined {
 if(p.slug!=='integer-multiplication')return;
 const race=p.repos.find(r=>r.open);
 return p.records.filter(r=>r.repo===race?.name&&acceptedRaceRecord(r)&&!r.reproductionOf)
  .map(r=>r.raceEventAt).filter((v):v is string=>Boolean(v)&&Number.isFinite(Date.parse(v!))).sort().at(-1);
}
export function isLiveRace(timestamp:string|undefined,now=Date.now()):boolean {
 const age=now-Date.parse(timestamp??'');
 return age>=0&&age<24*60*60*1000;
}
