import {getEvidenceLevels} from '../../lib/evidence-filters';
import { breakthroughLabel } from '../../lib/evidence';
import { chartWindow, chartWindowScale, chartTimeTicks, chartMaxDays, scoreValue, type ChartEntry } from '../../lib/chart';
interface Payload {
 entries: ChartEntry[]; higher: boolean; limit: number; classic?: number;
 // KaTeX renders at build time; the browser looks up each tick label by its TeX.
 tickHtml: Record<string,string>;
 levels: Record<string,string>;
}
const NS='http://www.w3.org/2000/svg';
// Avatar geometry: photo radius, a level ring outside it, and a surface halo between neighbors.
const RING=3,halo=(r:number)=>r+RING+1.5;
function svg<K extends keyof SVGElementTagNameMap>(tag:K,attrs:Record<string,string|number>={}) {
 const el=document.createElementNS(NS,tag);
 for(const [key,value] of Object.entries(attrs))el.setAttribute(key,String(value));
 return el;
}
class ProgressChart extends HTMLElement {
 private data!:Payload;
 private observer?:ResizeObserver;
 // 0 shows all results; N shows the last N days before the latest result.
 private days=0;
 private pinnedId?:string;
 private hoverId?:string;
 // Visible marks of the last draw, in time order, for pointer hit tests and arrow keys.
 private marks:{entry:ChartEntry;x:number;y:number;point:SVGGElement}[]=[];
 private hitRadius=0;
 private onDocumentClick=(event:MouseEvent)=>{
  const target=event.target;
  if(!(target instanceof Element))return;
  if(this.contains(target)&&target.closest('.plot-point, .plot-tooltip'))return;
  this.unpin();
 };
 private onDocumentKeydown=(event:KeyboardEvent)=>{if(event.key==='Escape')this.unpin()};
 private onPointerLeave=()=>{this.setHover(undefined);if(!this.pinnedId)this.closeTooltip()};
 private levels:string[]=[];
 private onEvidenceChange=(event:Event)=>{
  const levels=(event as CustomEvent<{levels:string[]}>).detail?.levels;
  if(!Array.isArray(levels))return;
  this.levels=levels.filter(level=>Object.hasOwn(this.data.levels,level));
  this.draw();
 };
 connectedCallback(){
  this.data=JSON.parse(this.dataset.chart!);
  this.levels=getEvidenceLevels();
  window.addEventListener('evidence-filter-change',this.onEvidenceChange);
  this.setupRange();
  const plot=this.querySelector<SVGSVGElement>('svg.progress-svg')!;
  // One pointer handler for the whole plot: the record nearest to the pointer wins,
  // so a record partly under newer avatars is reachable on its visible part.
  plot.addEventListener('pointermove',event=>{
   const mark=this.markAt(event);
   this.setHover(mark?.entry.id);
   if(mark&&!this.pinnedId)this.showMark(mark);
   else if(!mark&&!this.pinnedId)this.closeTooltip();
  });
  plot.addEventListener('click',event=>{const mark=this.markAt(event);if(mark)this.toggle(mark)});
  document.addEventListener('click',this.onDocumentClick);
  document.addEventListener('keydown',this.onDocumentKeydown);
  this.addEventListener('pointerleave',this.onPointerLeave);
  this.observer=new ResizeObserver(()=>this.draw());
  this.observer.observe(this);
  this.draw();
  void document.fonts.ready.then(()=>{if(this.isConnected)this.draw()});
 }
 disconnectedCallback(){
  this.observer?.disconnect();
  window.removeEventListener('evidence-filter-change',this.onEvidenceChange);
  document.removeEventListener('click',this.onDocumentClick);
  document.removeEventListener('keydown',this.onDocumentKeydown);
  this.removeEventListener('pointerleave',this.onPointerLeave);
 }
 private unpin(){
  this.pinnedId=undefined;
  this.querySelectorAll('.plot-point').forEach(point=>point.setAttribute('aria-pressed','false'));
  this.closeTooltip();
 }
 private closeTooltip(){this.querySelector<HTMLElement>('.plot-tooltip')!.hidden=true}
 private setupRange(){
  const form=this.querySelector<HTMLFormElement>('[data-range-form]')!;
  const all=form.querySelector<HTMLButtonElement>('[data-range-all]')!;
  const label=form.querySelector<HTMLElement>('[data-range-days]')!;
  const input=form.querySelector<HTMLInputElement>('input')!;
  const unit=form.querySelector<HTMLElement>('[data-days-unit]')!;
  const max=chartMaxDays(this.data.entries);
  const render=()=>{all.setAttribute('aria-pressed',String(this.days===0));label.toggleAttribute('data-active',this.days>0)};
  const apply=(clamp:boolean)=>{
   const value=Number(input.value);
   if(!Number.isInteger(value)||value<1||value>max){
    if(!clamp)return;
    input.value=String(Math.min(max,Math.max(1,Math.round(value)||1)));
   }
   const days=Number(input.value);
   unit.textContent=days===1?'day':'days';
   this.days=days;render();this.draw();
  };
  all.addEventListener('click',()=>{this.days=0;render();this.draw()});
  input.addEventListener('input',()=>apply(false));
  input.addEventListener('change',()=>apply(true));
  // Enter also applies the value shown, including the initial one.
  form.addEventListener('submit',event=>{event.preventDefault();apply(true)});
  render();
 }
 private markAt(event:MouseEvent){
  const box=this.querySelector<SVGSVGElement>('svg.progress-svg')!.getBoundingClientRect();
  const px=event.clientX-box.left,py=event.clientY-box.top;
  let best:(typeof this.marks)[number]|undefined,distance=this.hitRadius;
  for(const mark of this.marks){const d=Math.hypot(mark.x-px,mark.y-py);if(d<=distance){best=mark;distance=d}}
  return best;
 }
 private setHover(id?:string){
  if(this.hoverId===id)return;
  this.hoverId=id;
  for(const mark of this.marks)mark.point.toggleAttribute('data-hover',mark.entry.id===id);
 }
 private toggle(mark:(typeof this.marks)[number]){
  if(this.pinnedId===mark.entry.id){this.unpin();return}
  this.pinnedId=mark.entry.id;
  this.marks.forEach(other=>other.point.setAttribute('aria-pressed',String(other===mark)));
  this.showMark(mark);
 }
 private showMark(mark:(typeof this.marks)[number]){
  const plot=this.querySelector<SVGSVGElement>('svg.progress-svg')!;
  this.showEntry(mark.entry,mark.x,mark.y,this.clientWidth,plot.getBoundingClientRect().height);
 }
 private draw(){
  const {entries,higher,limit,classic}=this.data;
  const levels=new Set(this.levels);
  const view=chartWindow(entries,levels,higher,this.days*24);
  const {start,end,carry,records}=view;
  const scale=chartWindowScale(view,limit,this.days>0,classic);
  this.querySelectorAll('[data-scale-name]').forEach(label=>label.textContent=scale.log?'log':'linear');
  const plot=this.querySelector<SVGSVGElement>('svg.progress-svg')!;
  const labels=this.querySelector<HTMLElement>('.plot-labels')!;
  const state=this.querySelector<HTMLElement>('.plot-state')!;
  const reference=this.querySelector<HTMLElement>('.plot-reference')!;
  plot.replaceChildren();labels.replaceChildren();this.closeTooltip();
  const width=this.clientWidth;
  if(!width)return;
  const mobile=width<600,height=mobile?380:330,right=width-(mobile?12:20),top=26;
  const tickStep=mobile?Math.max(1,Math.ceil((scale.ticks.length-1)/3)):1;
  const yTicks=scale.ticks.filter((_,i)=>i%tickStep===0||i===scale.ticks.length-1);
  const tickLabels=yTicks.map(tick=>{
   const label=document.createElement('span');label.className='axis-tick';label.innerHTML=this.data.tickHtml[tick.tex]??tick.tex;labels.append(label);
   return label;
  });
  // Reserve space for the rendered KaTeX labels, their padding, and the rotated title.
  const axisTitle=this.querySelector<HTMLElement>('.plot-axis-title')!;
  const titleRight=axisTitle.getClientRects().length?axisTitle.getBoundingClientRect().right-plot.getBoundingClientRect().left:0;
  const widestTick=Math.max(0,...tickLabels.map(label=>label.getBoundingClientRect().width));
  const left=Math.ceil(Math.max(mobile?60:108,widestTick+(titleRight?titleRight+12:4)));
  const ticks=chartTimeTicks(start,end,mobile?3:Math.min(6,Math.max(3,Math.floor((right-left)/155))));
  const dateOnlyAxis=entries.every(e=>/^\d{4}-\d{2}-\d{2}$/.test(e.date));
  const times=dateOnlyAxis&&end-start<=86400000?[...new Set([start,end])]:ticks.times;
  const showTimes=ticks.showTimes&&entries.some(e=>e.time>=start&&!/^\d{4}-\d{2}-\d{2}$/.test(e.date));
  const bottom=height-(showTimes?53:36);
  plot.setAttribute('viewBox',`0 0 ${width} ${height}`);
  const transform=(v:number)=>scale.log?Math.log10(v):v;
  const y=(v:number)=>bottom-(transform(v)-scale.lo)/(scale.hi-scale.lo)*(bottom-top);
  const x=(time:number)=>start===end?(left+right)/2:left+(time-start)/(end-start)*(right-left);
  let previousTickBottom=-Infinity;
  for(let index=yTicks.length-1;index>=0;index--){
   const py=y(yTicks[index].value),label=tickLabels[index];
   const halfHeight=label.getBoundingClientRect().height/2;
   // A final log-scale tick can be much closer than the regular tick step.
   if(py-halfHeight<previousTickBottom+8){label.remove();continue}
   previousTickBottom=py+halfHeight;
   plot.append(svg('line',{x1:left,x2:right,y1:py,y2:py,class:'plot-grid'}));
   label.style.left=`${left}px`;label.style.top=`${py}px`;
  }
  reference.hidden=classic!==undefined||this.days>0;
  if(classic!==undefined||this.days===0){
   const limitY=y(classic??limit);
   plot.append(svg('line',{x1:left,x2:right,y1:limitY,y2:limitY,class:'plot-limit'}));
   reference.style.left=`${left}px`;
   reference.style.top=`${Math.max(0,limitY-28)}px`;
  }
  if(entries.length){
   const count=times.length;
   let previousLabelRight=-Infinity;
   for(let i=0;i<count;i++){
    const time=times[i],px=x(time);
    plot.append(svg('line',{x1:px,x2:px,y1:top,y2:bottom,class:'plot-grid'}));
    const labelX=Math.max(30,Math.min(width-30,px));
    const tick=svg('text',{x:labelX,y:bottom+18,'text-anchor':'middle',class:'plot-date'});
    const d=new Date(time);
    const dateOnly=dateOnlyAxis||entries.some(e=>e.time===time&&/^\d{4}-\d{2}-\d{2}$/.test(e.date));
    tick.textContent=new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',...(dateOnly?{timeZone:'UTC'}:{})}).format(d);plot.append(tick);
    const tickLabels=[tick];
    if(showTimes&&!dateOnly){const t=svg('text',{x:labelX,y:bottom+35,'text-anchor':tick.getAttribute('text-anchor')!,class:'plot-date'});t.textContent=new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(d);plot.append(t);tickLabels.push(t)}
    // Measure the rendered text, including localized month names and time rows.
    const halfWidth=Math.max(...tickLabels.map(label=>label.getBBox().width))/2;
    const center=Math.max(halfWidth+4,Math.min(width-halfWidth-4,labelX));
    if(center-halfWidth<previousLabelRight+10){
     tickLabels.forEach(label=>label.remove());
    }else{
     tickLabels.forEach(label=>label.setAttribute('x',String(center)));
     previousLabelRight=center+halfWidth;
    }
   }
   const axis=svg('text',{x:(left+right)/2,y:height-3,'text-anchor':'middle',class:'plot-date'});
   axis.textContent=dateOnlyAxis?'Date':'Date (local time)';plot.append(axis);
  }
  if(records.length||carry){
   const path=(carry?`M ${left} ${y(scoreValue(carry.score))} `:'')+records.map((e,i)=>`${i||carry?'H':'M'} ${x(e.time)} ${i||carry?'V':''} ${y(scoreValue(e.score))}`).join(' ')+` H ${right}`;
   const clipId=`chart-clip-${crypto.randomUUID()}`;
   const clip=svg('clipPath',{id:clipId});clip.append(svg('rect',{x:left,y:top,width:right-left,height:bottom-top}));plot.append(clip);
   plot.append(svg('path',{d:path,class:'plot-record','clip-path':`url(#${clipId})`}));
  }
  // Every record is an avatar at its true position, drawn in date order: newer on top.
  const radius=mobile?10:11;
  this.hitRadius=radius+RING;
  const avatarClip=`avatar-clip-${crypto.randomUUID()}`;
  const clip=svg('clipPath',{id:avatarClip,clipPathUnits:'objectBoundingBox'});clip.append(svg('circle',{cx:.5,cy:.5,r:.5}));plot.append(clip);
  this.marks=[];
  records.forEach((entry,index)=>{
   const px=x(entry.time),py=y(scoreValue(entry.score));
   const point=svg('g',{transform:`translate(${px},${py})`,class:`plot-point ${entry.level}`,tabindex:0,role:'button','aria-pressed':String(this.pinnedId===entry.id),'aria-label':`Player: ${entry.author}, ${this.entryLevel(entry)}. Show bound and source.`, 'data-entry-id':entry.id});
   this.drawAvatar(point,entry,radius,avatarClip);
   const mark={entry,x:px,y:py,point};
   this.marks.push(mark);
   point.addEventListener('focus',()=>{if(!this.pinnedId)this.showMark(mark)});
   point.addEventListener('keydown',event=>{
    if(event.key==='Enter'||event.key===' '){event.preventDefault();if(!event.repeat)this.toggle(mark)}
    // Arrow keys reach every record, including one that newer avatars cover.
    if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();this.marks[index+(event.key==='ArrowLeft'?-1:1)]?.point.focus()}
   });
   plot.append(point);
   if(this.pinnedId===entry.id)this.showMark(mark);
  });
  this.hoverId=undefined;
  if(this.pinnedId&&!records.some(entry=>entry.id===this.pinnedId))this.unpin();
  state.textContent=!entries.length?'No publication dates are known for these entries. See the table for their bounds.':!records.length&&!carry?'No dated results match the selected evidence levels.':'';
 }
 // The ring color encodes the evidence level; its lightness differs per level too.
 // A halo in the surface color keeps overlapping avatars apart.
 private drawAvatar(point:SVGGElement,entry:ChartEntry,r:number,clipId:string){
  point.append(svg('circle',{r:halo(r)+2.5,class:'avatar-focus'}),svg('circle',{r:halo(r),class:'avatar-ring'}));
  point.append(svg('circle',{r,class:'avatar-initials'}));
  if(entry.avatar)point.append(svg('image',{href:entry.avatar,x:-r,y:-r,width:2*r,height:2*r,preserveAspectRatio:'xMidYMid slice','clip-path':`url(#${clipId})`}));
  else{
   const text=svg('text',{class:'avatar-text','text-anchor':'middle','dominant-baseline':'central','font-size':9});text.textContent=entry.initials??'?';
   point.append(text);
  }
  point.append(svg('circle',{r:r+RING/2,class:`avatar-outline ${entry.level}`}));
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
  const tooltipWidth=tooltip.offsetWidth,tooltipHeight=tooltip.offsetHeight;
  const left=x+16+tooltipWidth<=width-4?x+16:x-16-tooltipWidth;
  const top=y+16+tooltipHeight<=height-4?y+16:y-16-tooltipHeight;
  tooltip.style.left=`${Math.max(4,Math.min(left,width-tooltipWidth-4))}px`;
  tooltip.style.top=`${Math.max(4,Math.min(top,height-tooltipHeight-4))}px`;
 }
}
if(!customElements.get('progress-chart'))customElements.define('progress-chart',ProgressChart);
