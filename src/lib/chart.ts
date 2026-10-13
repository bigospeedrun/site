import { ranked } from './ranking.ts';

export interface ChartEntry {
 id: string; repoId: number; score: string; scoreRelation?: string; level: string; time: number;
 date: string; author: string; boundHtml: string; url: string; isBreakthrough?: boolean;
 // The first author's avatar path, or initials when the author has no personal GitHub avatar.
 avatar?: string; initials?: string;
}

export const scoreValue = (score: string): number => {
 const [n, d = '1'] = score.split('/');
 return Number(n) / Number(d);
};

// A source or commit date is usable even when scientific priority is unknown.
// Observation timestamps and publication years do not establish a dated result.
export function chartDate(record: {date:string;dateLabel:string;publicationYear?:number;raceEventAt?:string}): string | undefined {
 if(record.publicationYear || (!record.raceEventAt && record.dateLabel==='Observed'))return;
 const date=record.raceEventAt??record.date;
 return Number.isFinite(Date.parse(date))?date:undefined;
}

// At each timestamp use the table's rank-1 entry, including its endpoint and tie rules.
export function chartRecords(entries: ChartEntry[], levels: Set<string>, higher: boolean): ChartEntry[] {
 const ordered = entries.filter(e => e.isBreakthrough || levels.has(e.level)).sort((a,b) => a.time-b.time);
 const result: ChartEntry[] = [];
 const seen:ChartEntry[]=[];
 for (let i=0;i<ordered.length;i++) {
  seen.push(ordered[i]);
  if(ordered[i+1]?.time===ordered[i].time)continue;
  const best=ranked(seen,higher?'higher-is-better':'lower-is-better')[0].record;
  if(best.id!==result.at(-1)?.id)result.push(best);
 }
 return result;
}

export const chartRanges = [
 {id:'all', name:'All', hours:0},
 {id:'3d', name:'Last 3 days', hours:72},
 {id:'24h', name:'Last 24 h', hours:24},
] as const;

// Zoom preserves the record that was in force at the left edge, without moving
// its dot to a made-up date. Presets end at the latest known result, not today.
export function chartWindow(entries: ChartEntry[], levels: Set<string>, higher: boolean, hours=0) {
 const times=entries.map(e=>e.time);
 const end=times.length?Math.max(...times):0;
 const first=times.length?Math.min(...times):0;
 const start=hours?Math.max(first,end-hours*3600000):first;
 const progression=chartRecords(entries,levels,higher);
 const carry=progression.filter(e=>e.time<start).at(-1);
 const records=progression.filter(e=>e.time>=start);
 return {start,end,carry,records};
}

// Multi-day axes use calendar midnights in the viewer's timezone, including DST.
// Short ranges use unique minute-resolution ticks with dates and times.
export function chartTimeTicks(start:number,end:number,maxTicks:number) {
 const span=end-start;
 if(span>86400000){
  const day=new Date(start);day.setHours(0,0,0,0);
  if(day.getTime()<start)day.setDate(day.getDate()+1);
  const times:number[]=[];
  while(day.getTime()<=end){times.push(day.getTime());day.setDate(day.getDate()+1)}
  const count=Math.max(1,Math.floor(maxTicks));
  const selected=times.length<=count?times:Array.from({length:count},(_,i)=>times[count===1?0:Math.round(i*(times.length-1)/(count-1))]);
  return {showTimes:false,times:selected};
 }
 const count=span===0?1:Math.min(maxTicks,Math.floor(span/60000)+1);
 const times=Array.from({length:count},(_,i)=>count===1?start:start+span*i/(count-1));
 return {showTimes:true,times};
}

export function chartWindowScale(view: ReturnType<typeof chartWindow>, limit: number, zoomed: boolean, classic?: number) {
 // Polynomial races have tiny improvements near the classic exponent. Keep
 // their distant trivial limit outside the axis, and retain the entering record
 // so zoom never clips the horizontal line or hides its next improvement.
 if(classic!==undefined){
  const records=[...(view.carry?[view.carry]:[]),...view.records];
  return chartScale(records.map(r=>scoreValue(r.score)),classic);
 }
 const records=view.records.length?view.records:view.carry?[view.carry]:[];
 return chartScale(records.map(r=>scoreValue(r.score)),zoomed?undefined:limit);
}

export function chartScale(values: number[], limit?: number) {
 const all = limit===undefined?[...values]:[...values,limit];
 if(!all.length)all.push(0);
 const min = Math.min(...all), max = Math.max(...all);
 const log = min > 0 && max/min > 100;
 if (log) {
  const lo = Math.floor(Math.log10(min)), hi = Math.ceil(Math.log10(max));
  const step = Math.max(1, Math.ceil((hi-lo)/5));
  const ticks = [lo];
  for (let e=lo+step;e<hi;e+=step) ticks.push(e);
  ticks.push(hi);
  return { log, lo: lo-.2, hi: hi+.35, ticks: ticks.map(e=>({value:10**e,tex:e===0?'1':`10^{${e}}`})) };
 }
 const span = max-min || Math.abs(max)*.1 || 1;
 const step = 10**Math.floor(Math.log10(span/4));
 const nice = [1,2,5,10].map(n=>n*step).find(n=>span/n<=5)!;
 const lo = Math.floor(min/nice)*nice, hi = Math.ceil(max/nice)*nice;
 const ticks = [];
 // Label the same value used for placement. Precision follows the tick step,
 // not a fixed significant-digit cap that can merge nearby tick labels.
 const places=Math.max(0,-Math.floor(Math.log10(nice)));
 for(let i=0;i<=Math.round((hi-lo)/nice);i++){
  const value=Number((lo+i*nice).toFixed(Math.min(100,places)));
  const tex=String(value).replace(/e([+-]?\d+)/,(_,e)=>`\\cdot 10^{${Number(e)}}`);
  ticks.push({value,tex});
 }
 return {log,lo:lo-span*.04,hi:hi+span*.1,ticks};
}
