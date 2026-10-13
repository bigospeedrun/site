export const avatarStorageKey='bigospeedrun-show-avatars';

// Initials for players without a personal GitHub avatar: organizations, papers and plain names.
// Only the first named author counts, so "A and B (2019), Title" gives the initials of A.
export function initials(name:string):string{
 const lead=name.split(/;|,|\(| and | with | & /)[0].trim();
 const words=lead.split(/\s+/).filter(word=>/^\p{L}/u.test(word));
 if(!words.length)return '?';
 const first=Array.from(words[0])[0];
 if(words.length>1)return (first+Array.from(words.at(-1)!)[0]).toUpperCase();
 // One word: add its next capital letter, so OpenAI gives OA.
 const capital=Array.from(words[0]).slice(1).find(letter=>/\p{Lu}/u.test(letter));
 return (first+(capital??'')).toUpperCase();
}

export function parseShowAvatars(value:string|null):boolean{return value!=='false'}

// The inline script in Layout applies the stored value before the first paint.
export function getShowAvatars():boolean{
 if(typeof document!=='undefined')return document.documentElement.dataset.avatars!=='off';
 return true;
}
export function setShowAvatars(show:boolean):void{
 document.documentElement.dataset.avatars=show?'on':'off';
 try{localStorage.setItem(avatarStorageKey,String(show))}catch{/* The setting still applies to this page. */}
 window.dispatchEvent(new CustomEvent('avatar-preference-change',{detail:{show}}));
}
export function subscribeShowAvatars(callback:()=>void):()=>void{
 window.addEventListener('avatar-preference-change',callback);
 return ()=>window.removeEventListener('avatar-preference-change',callback);
}
