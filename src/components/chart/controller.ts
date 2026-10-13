import {getEvidenceLevels} from '../../lib/evidence-filters';
import { breakthroughLabel } from '../../lib/evidence';
import { getShowAvatars, subscribeShowAvatars } from '../../lib/avatars';
import { chartWindow, chartRanges, chartTimeTicks, scoreValue, type ChartEntry } from '../../lib/chart';
interface Payload {
 entries: ChartEntry[]; higher: boolean; limit: number; classic?: number;
 scales: Record<string,{log:boolean;lo:number;hi:number;ticks:{value:number;html:string}[]}>;
 levels: Record<string,string>;
}
const NS='http://www.w3.org/2000/svg';
const STAR='M0 -9 L2.6 -3 L8.6 -2.8 L4.2 1.4 L5.3 7.3 L0 4.5 L-5.3 7.3 L-4.2 1.4 L-8.6 -2.8 L-2.6 -3 Z';
function svg<K extends keyof SVGElementTagNameMap>(tag:K,attrs:Record<string,string|number>={}) {
 const el=document.createElementNS(NS,tag);
 for(const [key,value] of Object.entries(attrs))el.setAttribute(key,String(value));
 return el;
}
class ProgressChart extends HTMLElement {
 private data!:Payload;
 private observer?:ResizeObserver;
 private range="all";
 private pinnedId?:string;
 private onDocumentClick=(event:MouseEvent)=>{
  const target=event.target;
  if(!(target instanceof Element))return;
  if(this.contains(target)&&target.closest('.plot-point, .plot-tooltip'))return;
  this.unpin();
 };
 private onDocumentKeydown=(event:KeyboardEvent)=>{if(event.key==='Escape')this.unpin()};
 private onPointerLeave=()=>{if(!this.pinnedId)this.closeTooltip()};
 private levels:string[]=[];
 private unsubscribeAvatars?:()=>void;
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
  this.unsubscribeAvatars=subscribeShowAvatars(()=>this.draw());
  this.querySelectorAll<HTMLButtonElement>('[data-range]').forEach(button=>button.addEventListener('click',()=>{
   this.range=button.dataset.range!;
   this.querySelectorAll('[data-range]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
   this.draw();
  }));
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
  this.unsubscribeAvatars?.();
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
 private draw(){
  const {entries,higher,limit,classic}=this.data;
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
  const mobile=width<600,height=mobile?380:330,right=width-(mobile?12:20),top=26;
  const tickStep=mobile?Math.max(1,Math.ceil((scale.ticks.length-1)/3)):1;
  const yTicks=scale.ticks.filter((_,i)=>i%tickStep===0||i===scale.ticks.length-1);
  const tickLabels=yTicks.map(tick=>{
   const label=document.createElement('span');label.className='axis-tick';label.innerHTML=tick.html;labels.append(label);
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
  reference.hidden=classic!==undefined||this.range!=='all';
  if(classic!==undefined||this.range==='all'){
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
  const avatars=getShowAvatars(),radius=mobile?10:11;
  const avatarClip=`avatar-clip-${crypto.randomUUID()}`;
  if(avatars){const clip=svg('clipPath',{id:avatarClip,clipPathUnits:'objectBoundingBox'});clip.append(svg('circle',{cx:.5,cy:.5,r:.5}));plot.append(clip)}
  // Records are in time order, so the current leader is drawn last, on top of older marks.
  // Newest first, an avatar keeps full size only if no newer full avatar covers much of it.
  // Crowded older entries shrink to their evidence-level shape, so each visible face stays readable.
  const fullAvatars=new Set<ChartEntry>(),placed:[number,number][]=[];
  if(avatars)for(const entry of [...records].reverse()){
   const px=x(entry.time),py=y(scoreValue(entry.score));
   if(placed.some(([ax,ay])=>Math.hypot(ax-px,ay-py)<radius*1.7))continue;
   fullAvatars.add(entry);placed.push([px,py]);
  }
  // The legend adds the shapes only when the plot shows shrunken marks.
  this.toggleAttribute('data-shrunk',avatars&&fullAvatars.size<records.length);
  // Shrunken marks sit in a lower layer, so they never cover a full avatar.
  const shapeLayer=svg('g'),avatarLayer=svg('g');plot.append(shapeLayer,avatarLayer);
  for(const entry of records){
   const px=x(entry.time),py=y(scoreValue(entry.score)),endpoint=entry.scoreRelation==='strict-upper-bound';
   const point=svg('g',{transform:`translate(${px},${py})`,class:`plot-point ${entry.isBreakthrough?'breakthrough':entry.level}${endpoint?' endpoint':''}`,tabindex:0,role:'button','aria-pressed':String(this.pinnedId===entry.id),'aria-label':`Player: ${entry.author}, ${this.entryLevel(entry)}. Show bound and source.`, 'data-entry-id':entry.id});
   point.append(svg('circle',{r:13,fill:'transparent'}));
   if(fullAvatars.has(entry))this.drawAvatar(point,entry,radius,avatarClip,endpoint);
   else if(entry.isBreakthrough)point.append(svg('path',{d:STAR,class:'mark'}));
   else if(entry.level==='human-verified')point.append(svg('rect',{x:-5,y:-5,width:10,height:10,class:'mark'}));
   else if(entry.level==='lean-verified')point.append(svg('path',{d:'M 0 -7 L 7 0 L 0 7 L -7 0 Z',class:'mark'}));
   else point.append(svg('circle',{r:5.5,class:'mark'}));
   const show=()=>this.showEntry(entry,px,py,width,height);
   const preview=()=>{if(!this.pinnedId)show()};
   const toggle=()=>{
    if(this.pinnedId===entry.id){this.unpin();return}
    this.pinnedId=entry.id;
    this.querySelectorAll('.plot-point').forEach(mark=>mark.setAttribute('aria-pressed',String(mark===point)));
    show();
   };
   point.addEventListener('pointerenter',preview);point.addEventListener('focus',preview);
   point.addEventListener('click',toggle);
   point.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();if(!event.repeat)toggle()}});
   (fullAvatars.has(entry)?avatarLayer:shapeLayer).append(point);
   if(this.pinnedId===entry.id)show();
  }
  if(this.pinnedId&&!records.some(entry=>entry.id===this.pinnedId))this.unpin();
  state.textContent=!entries.length?'No publication dates are known for these entries. See the table for their bounds.':!records.length&&!carry?'No dated results match the selected evidence levels.':'';
 }
 // The outline encodes the evidence level, so the mark does not depend on color alone.
 // A ring in the surface color keeps overlapping avatars apart.
 private drawAvatar(point:SVGGElement,entry:ChartEntry,r:number,clipId:string,endpoint:boolean){
  point.append(svg('circle',{r:r+6,class:'avatar-focus'}),svg('circle',{r:r+4,class:'avatar-ring'}));
  if(entry.avatar){
   const image=svg('image',{href:entry.avatar,x:-r,y:-r,width:2*r,height:2*r,preserveAspectRatio:'xMidYMid slice','clip-path':`url(#${clipId})`});
   point.append(svg('circle',{r,class:'avatar-initials'}),image);
  }else{
   const text=svg('text',{class:'avatar-text','text-anchor':'middle','dominant-baseline':'central'});text.textContent=entry.initials??'?';
   point.append(svg('circle',{r,class:'avatar-initials'}),text);
  }
  point.append(svg('circle',{r:r+(entry.level==='lean-verified'?2:1.5),class:`avatar-outline ${entry.level}`}));
  if(entry.isBreakthrough)point.append(svg('path',{d:STAR,class:'avatar-star',transform:`translate(${r*.85} ${-r*.85}) scale(.6)`}));
  if(endpoint)point.append(svg('circle',{cx:r*.85,cy:r*.85,r:4,class:`avatar-endpoint ${entry.level}`}));
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
