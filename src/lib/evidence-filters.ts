import {evidenceLevels, type EvidenceLevel} from './evidence.ts';
export const evidenceStorageKey='bigospeedrun-evidence-levels';
const allLevels=()=>evidenceLevels.map(level=>level.id);
export function parseEvidenceLevels(value:string|null):EvidenceLevel[]{
 if(value===null)return allLevels();
 try{
  const parsed:unknown=JSON.parse(value);
  if(!Array.isArray(parsed)||!parsed.every(level=>evidenceLevels.some(item=>item.id===level)))return allLevels();
  return allLevels().filter(level=>parsed.includes(level));
 }catch{return allLevels()}
}
let selected:EvidenceLevel[]|undefined;
export function getEvidenceLevels():EvidenceLevel[]{
 if(!selected){try{selected=parseEvidenceLevels(localStorage.getItem(evidenceStorageKey))}catch{selected=allLevels()}}
 return [...selected];
}
export function setEvidenceLevels(levels:EvidenceLevel[]):void{
 selected=allLevels().filter(level=>levels.includes(level));
 try{localStorage.setItem(evidenceStorageKey,JSON.stringify(selected))}catch{/* Filters still work when storage is unavailable. */}
 window.dispatchEvent(new CustomEvent('evidence-filter-change',{detail:{levels:getEvidenceLevels()}}));
}
export function subscribeEvidenceLevels(callback:()=>void):()=>void{
 window.addEventListener('evidence-filter-change',callback);
 return ()=>window.removeEventListener('evidence-filter-change',callback);
}
if(typeof window!=='undefined')window.addEventListener('storage',event=>{
 if(event.key===evidenceStorageKey||event.key===null){
  selected=parseEvidenceLevels(event.key===null?null:event.newValue);
  window.dispatchEvent(new CustomEvent('evidence-filter-change',{detail:{levels:getEvidenceLevels()}}));
 }
});
// History navigation can restore checkbox values after custom elements initialize.
// Reapply stored state after the browser restores the document's form controls.
if(typeof window!=='undefined')window.addEventListener('pageshow',()=>{
 requestAnimationFrame(()=>{
  selected=undefined;
  window.dispatchEvent(new CustomEvent('evidence-filter-change',{detail:{levels:getEvidenceLevels()}}));
 });
});
