import { breakthroughLabel } from '../../lib/evidence';
import { chartWindow, chartRanges, chartTimeTicks, scoreValue, type ChartEntry } from '../../lib/chart';
interface Payload {
 entries: ChartEntry[]; higher: boolean; limit: number;
 scales: Record<string,{log:boolean;lo:number;hi:number;ticks:{value:number;html:string}[]}>;
 levels: Record<string,string>;
}
const NS='http://www.w3.org/2000/svg';
function svg<K extends keyof SVGElementTagNameMap>(tag:K,attrs:Record<string,string|number>={}) {
 const el=document.createElementNS(NS,tag);
 for(const [key,value] of Object.entries(attrs))el.setAttribute(key,String(value));
 return el;
}
class ProgressChart extends HTMLElement {
 private data!:Payload;
 private observer?:ResizeObserver;
 private range="all";
 private levels:string[]=[];
 private onEvidenceChange=(event:Event)=>{
  const levels=(event as CustomEvent<{levels:string[]}>).detail?.levels;
  if(!Array.isArray(levels))return;
  this.levels=levels.filter(level=>Object.hasOwn(this.data.levels,level));
  this.draw();
 };
 connectedCallback(){
  this.data=JSON.parse(this.dataset.chart!);
  const board=document.querySelector<HTMLElement>('evidence-board');
  this.levels=board?.dataset.selectedLevels?JSON.parse(board.dataset.selectedLevels):Object.keys(this.data.levels);
  window.addEventListener('evidence-filter-change',this.onEvidenceChange);
  this.querySelectorAll<HTMLButtonElement>('[data-range]').forEach(button=>button.addEventListener('click',()=>{
   this.range=button.dataset.range!;
   this.querySelectorAll('[data-range]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
   this.draw();
  }));
  this.addEventListener('keydown',event=>{if(event.key==='Escape')this.closeTooltip()});
  this.addEventListener('pointerleave',()=>this.closeTooltip());
  this.observer=new ResizeObserver(()=>this.draw());
  this.observer.observe(this);
  this.draw();
 }
 disconnectedCallback(){this.observer?.disconnect();window.removeEventListener('evidence-filter-change',this.onEvidenceChange)}
 private closeTooltip(){this.querySelector<HTMLElement>('.plot-tooltip')!.hidden=true}
 private draw(){
  const {entries,higher,limit}=this.data;
  const levels=new Set(this.levels);
  const scale=this.data.scales[`${this.range}:${[...levels].sort().join(',')}`];
  this.querySelectorAll('[data-scale-name]').forEach(label=>label.textContent=scale.log?'log':'linear');
  const {start,end,carry,records}=chartWindow(entries,levels,higher,chartRanges.find(r=>r.id===this.range)!.hours);
  const plot=this.querySelector<SVGSVGElement>('svg.progress-svg')!;
  const labels=this.querySelector<HTMLElement>('.plot-labels')!;
  const state=this.querySelector<HTMLElement>('.plot-state')!;
  const reference=this.querySelector<HTMLElement>('.plot-reference')!;
  plot.replaceChildren();labels.replaceChildren();this.closeTooltip();
  const width=this.clientWidth;
  if(!width)return;
  const mobile=width<600,height=mobile?380:330,left=mobile?(scale.log?60:80):108,right=width-(mobile?12:20),top=26;
  const ticks=chartTimeTicks(start,end,mobile?3:Math.min(6,Math.max(3,Math.floor((right-left)/155))));
  const showTimes=ticks.showTimes&&entries.some(e=>e.time>=start&&!/^\d{4}-\d{2}-\d{2}$/.test(e.date));
  const bottom=height-(showTimes?53:36);
  plot.setAttribute('viewBox',`0 0 ${width} ${height}`);
  const transform=(v:number)=>scale.log?Math.log10(v):v;
  const y=(v:number)=>bottom-(transform(v)-scale.lo)/(scale.hi-scale.lo)*(bottom-top);
  const x=(time:number)=>start===end?(left+right)/2:left+(time-start)/(end-start)*(right-left);
  const tickStep=mobile?Math.max(1,Math.ceil((scale.ticks.length-1)/3)):1;
  const yTicks=scale.ticks.filter((_,i)=>i%tickStep===0||i===scale.ticks.length-1);
  for(const tick of yTicks){
   const py=y(tick.value);
   plot.append(svg('line',{x1:left,x2:right,y1:py,y2:py,class:'plot-grid'}));
   const label=document.createElement('span');label.className='axis-tick';label.style.left=`${left}px`;label.style.top=`${py}px`;label.innerHTML=tick.html;labels.append(label);
  }
  reference.hidden=this.range!=='all';
  if(this.range==='all'){
   const limitY=y(limit);
   plot.append(svg('line',{x1:left,x2:right,y1:limitY,y2:limitY,class:'plot-limit'}));
   reference.style.top=`${Math.max(0,limitY-28)}px`;
  }
  if(entries.length){
   const count=ticks.times.length;
   for(let i=0;i<count;i++){
    const time=ticks.times[i],px=x(time);
    plot.append(svg('line',{x1:px,x2:px,y1:top,y2:bottom,class:'plot-grid'}));
    const labelX=Math.max(30,Math.min(width-30,px));
    const tick=svg('text',{x:labelX,y:bottom+18,'text-anchor':'middle',class:'plot-date'});
    const d=new Date(time);
    const dateOnly=entries.some(e=>e.time===time&&/^\d{4}-\d{2}-\d{2}$/.test(e.date));
    tick.textContent=new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',...(dateOnly?{timeZone:'UTC'}:{})}).format(d);plot.append(tick);
    if(showTimes&&!dateOnly){const t=svg('text',{x:labelX,y:bottom+35,'text-anchor':tick.getAttribute('text-anchor')!,class:'plot-date'});t.textContent=new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(d);plot.append(t)}
   }
   const axis=svg('text',{x:(left+right)/2,y:height-3,'text-anchor':'middle',class:'plot-date'});
   axis.textContent='Date (local time)';plot.append(axis);
  }
  if(records.length||carry){
   const path=(carry?`M ${left} ${y(scoreValue(carry.score))} `:'')+records.map((e,i)=>`${i||carry?'H':'M'} ${x(e.time)} ${i||carry?'V':''} ${y(scoreValue(e.score))}`).join(' ')+` H ${right}`;
   const clipId=`chart-clip-${crypto.randomUUID()}`;
   const clip=svg('clipPath',{id:clipId});clip.append(svg('rect',{x:left,y:top,width:right-left,height:bottom-top}));plot.append(clip);
   plot.append(svg('path',{d:path,class:'plot-record','clip-path':`url(#${clipId})`}));
  }
  for(const entry of records){
   const px=x(entry.time),py=y(scoreValue(entry.score)),endpoint=entry.scoreRelation==='strict-upper-bound';
   const point=svg('g',{transform:`translate(${px},${py})`,class:`plot-point ${entry.isBreakthrough?'breakthrough':entry.level}${endpoint?' endpoint':''}`,tabindex:0,role:'button','aria-label':`Player: ${entry.author}, ${this.entryLevel(entry)}. Show bound and source.`, 'data-entry-id':entry.id});
   point.append(svg('circle',{r:13,fill:'transparent'}));
   if(entry.isBreakthrough)point.append(svg('path',{d:'M0 -9 L2.6 -3 L8.6 -2.8 L4.2 1.4 L5.3 7.3 L0 4.5 L-5.3 7.3 L-4.2 1.4 L-8.6 -2.8 L-2.6 -3 Z',class:'mark'}));
   else if(entry.level==='human-verified')point.append(svg('rect',{x:-5,y:-5,width:10,height:10,class:'mark'}));
   else if(entry.level==='lean-verified')point.append(svg('path',{d:'M 0 -7 L 7 0 L 0 7 L -7 0 Z',class:'mark'}));
   else point.append(svg('circle',{r:5.5,class:'mark'}));
   const show=()=>this.showEntry(entry,px,py,width,height);
   point.addEventListener('pointerenter',show);point.addEventListener('focus',show);point.addEventListener('click',show);
   point.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();show()}});
   plot.append(point);
  }
  state.textContent=!entries.length?'No publication dates are known for these entries. See the table for their bounds.':!records.length&&!carry?'No dated results match the selected evidence levels.':'';
 }
 private entryLevel(entry:ChartEntry){return entry.isBreakthrough?breakthroughLabel+(entry.level==='lean-verified'?' · Lean Verified':''):this.data.levels[entry.level]}
 private showEntry(entry:ChartEntry,x:number,y:number,width:number,height:number){
  const tooltip=this.querySelector<HTMLElement>('.plot-tooltip')!;
  tooltip.replaceChildren();tooltip.hidden=false;
  const author=document.createElement('strong');author.textContent=`Player: ${entry.author}`;
  const bound=document.createElement('p');bound.className='plot-bound';bound.innerHTML=entry.boundHtml;
  const dateOnly=/^\d{4}-\d{2}-\d{2}$/.test(entry.date);
  const date=document.createElement('p');date.textContent=new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',...(dateOnly?{timeZone:'UTC'}:{hour:'numeric',minute:'2-digit'} as const)}).format(new Date(entry.time));
  const level=document.createElement('p');level.textContent=this.entryLevel(entry);
  const link=document.createElement('a');link.href=entry.url;link.textContent='Read the source';
  if(new URL(entry.url,location.href).hostname==='github.com'){link.target='_blank';link.rel='noopener'}
  tooltip.append(author,bound,date,level);
  if(entry.scoreRelation==='strict-upper-bound'){const note=document.createElement('p');note.textContent='This endpoint is not attained.';tooltip.append(note)}
  tooltip.append(link);
  tooltip.style.left=`${Math.max(4,Math.min(x+16,width-tooltip.offsetWidth-4))}px`;
  tooltip.style.top=`${Math.max(4,Math.min(y+16,height-tooltip.offsetHeight-4))}px`;
 }
}
if(!customElements.get('progress-chart'))customElements.define('progress-chart',ProgressChart);
