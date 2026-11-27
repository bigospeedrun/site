import {compare,decimal} from './ranking.ts';
import {isBreakthroughRecord} from './evidence.ts';
import {baselineClaim,isTableBreakthrough} from './other-table.ts';
import {compareDegree,parseDegreeClaim} from './other-rank.ts';
import otherBounds from './other-bounds.json' with {type:'json'};
import {isModelBoardSlug,type FeedSnapshot} from './records-feed.ts';
import type {XEntry} from './x-posts.ts';

// Nil, 2026-11-02: X never announces a Lean Verified result whose bound is worse than the breakthrough that started the
// race on that board. The bar is the board's race-start row (isBreakthroughRecord) when OpenAI or Anthropic made it:
// the feed's own data names it, no list of boards is kept here. A bound equal to or better than the bar posts as
// before. Boards whose race-start row has another author are not touched. Discord is not touched either.
const BREAKTHROUGH_AUTHORS=['OpenAI','Anthropic'];
// Races whose record posts never go to X.
export const DISCORD_ONLY:readonly string[]=['integer-factoring-randomized'];
// An Other bounds row (Lead, 2026-11-07, prime gaps: a Lean Verified 246 is worse than OpenAI's 186): the bar is the
// row's Agent breakthrough as its table labels it (isTableBreakthrough): OpenAI's baseline, or on a row with a Classic
// baseline its first claim by agents. It counts only when OpenAI or Anthropic made it.
// Fail closed (Lead, 2026-11-08, Heilbronn: X posted a Lean Verified 7.21e-237 below OpenAI's 3.18e-236, because that
// value is an expression and gave no bar): the bar is the family's reviewed xBar when it has one, else the value when it
// is an exact rational or an A d^p claim. A row with no such bar gives null, and its Lean Verified posts are held back.
// An xBar is a rational at most the true value on a higher-is-better row, at least it on a lower-is-better row, so a
// bound that is worse than the bar is worse than the breakthrough. A breakthrough at +infinity on a lower-is-better row
// (Catalan) is beaten by every finite bound: no bar. A score that is the breakthrough's own value text (the Lean Verified
// row of that breakthrough, Anthropic's critical-line expression) is the same bound: `same`.
type Bar={score:string;direction:'lower'|'higher';same?:string};
type OtherFamily=Parameters<typeof isTableBreakthrough>[0]&{slug:string;direction?:string;baseline?:Parameters<typeof baselineClaim>[0];
 xBar?:{value:string;source:string};claims:{value:string;authors?:{name:string}[]}[]};
const RATIONAL=/^-?(?:0|[1-9][0-9]*)(?:\/[1-9][0-9]*)?$/;
export function otherBreakthroughBar(slug:string,families:readonly OtherFamily[]=otherBounds.families as OtherFamily[]):Bar|null|undefined {
 const family=families.find(f=>'other-'+f.slug===slug);
 if(!family||(family.direction!=='lower'&&family.direction!=='higher'))return undefined;
 const base=baselineClaim(family.baseline);
 const row=[...(base?[base]:[]),...family.claims].find(c=>isTableBreakthrough(family,c));
 if(!row||!row.authors?.some(a=>BREAKTHROUGH_AUTHORS.some(name=>a.name===name||a.name.startsWith(name+' '))))return undefined;
 if(family.direction==='lower'&&row.value==='+\\infty')return undefined;
 if(family.xBar)return RATIONAL.test(family.xBar.value)?{score:family.xBar.value,direction:family.direction,same:row.value}:null;
 return RATIONAL.test(row.value)||parseDegreeClaim(row.value)?{score:row.value,direction:family.direction,same:row.value}:null;
}
// A score as an exact rational: a rational, or a plain decimal ('2.007', prove2.me rows). Anything else is undefined.
function exact(score:string):string|undefined {
 if(RATIONAL.test(score))return score;
 const m=/^(-?)(0|[1-9][0-9]*)\.([0-9]+)$/.exec(score);
 return m?`${m[1]}${BigInt(m[2]+m[3])}/${10n**BigInt(m[3].length)}`:undefined;
}
// A score for a log line: a long exact rational as a decimal (Heilbronn has 236 digits), other long text cut.
const shown=(score:string)=>score.length<=40?score:exact(score)?'about '+decimal(exact(score)!):score.slice(0,40)+'...';
// The order of a score against a bar (negative: smaller), or undefined when they cannot be compared.
function compareToBar(score:string,bar:string):number|undefined {
 const a=exact(score),b=exact(bar);
 if(a!==undefined&&b!==undefined)return compare(a,b);
 const da=parseDegreeClaim(score),db=parseDegreeClaim(bar);
 return da&&db?compareDegree(da,db):undefined;
}
export function breakthroughBar(snapshot:FeedSnapshot|undefined,slug:string):Bar|null|undefined {
 const board=snapshot?.boards.find(b=>b.slug===slug);
 if(slug.startsWith('other-'))return snapshot?otherBreakthroughBar(slug):undefined;
 if(!board?.direction)return undefined;
 const row=board.records.find(r=>isBreakthroughRecord(slug,r.id)&&r.authors.some(a=>BREAKTHROUGH_AUTHORS.includes(a)));
 return row?{score:row.score,direction:board.direction}:undefined;
}
// The reason to skip the post, or undefined when it may go out. On a Big O board a score that is not a rational logs a
// warning and never stops the plan: that post goes out as before. On an Other bounds row with a bar it is held back.
export function worseThanBreakthrough(post:XEntry,snapshot:FeedSnapshot|undefined):string|undefined {
 const lean=post.key.endsWith(':lean')||/^Status: Lean Verified$/m.test(post.x_text??'');
 // The board of a later model of a race (apsp/randomized-word-ram, <race>/<model>) posts to Discord only (Lead decision 2026-11-20; Nil's GO of the same day made the launch Discord only). Fail closed: by the
 // key alone, so a missing snapshot cannot let one through.
 try{if(isModelBoardSlug(JSON.parse(post.key.slice(0,post.key.lastIndexOf(':')))[0]))return 'This board posts to Discord only (Lead decision, 2026-11-20): no X post';}catch{}
 // The randomized integer factoring race (Nil's GO, 2026-11-27: no X announcement) posts to Discord only, by the key as above.
 try{if(DISCORD_ONLY.includes(JSON.parse(post.key.slice(0,post.key.lastIndexOf(':')))[0]))return 'This race posts to Discord only (Nil, 2026-11-27): no X post';}catch{}
 // Directed SSSP (Lead, 2026-11-03 and 2026-11-06): X only for a Lean Verified record row, a frontier row that is faster
 // than every row at its density, the function rows (classic Dijkstra, papers) too: recordRows of the saved snapshot. A
 // snapshot without that list posts nothing.
 if(post.key.startsWith('["directed-sssp",')){
  if(!lean)return 'Directed shortest paths posts on X only for a Lean Verified record row (Lead, 2026-11-03): no X post';
  let id:unknown;
  try{[,id]=JSON.parse(post.key.slice(0,post.key.lastIndexOf(':')));}catch{id=undefined;}
  const board=snapshot?.boards.find(b=>b.slug==='directed-sssp');
  if(typeof id!=='string'||!board?.recordRows?.includes(id))return 'Directed shortest paths: a row that a function row (classic Dijkstra or a paper) matches or beats at its density is no record (Lead, 2026-11-06): no X post';
 }
 if(!lean)return undefined;
 let slug:unknown,score:unknown;
 try{[slug,,score]=JSON.parse(post.key.slice(0,post.key.lastIndexOf(':')));}catch{return undefined;}
 if(typeof slug!=='string'||typeof score!=='string')return undefined;
 const bar=breakthroughBar(snapshot,slug);
 if(bar===null)return 'This row has a breakthrough by OpenAI or Anthropic but no bar to compare with (Lead, 2026-11-08, fail closed): no X post';
 if(!bar)return undefined;
 let order:number|undefined;
 if(slug.startsWith('other-')){
  order=score===bar.same?0:compareToBar(score,bar.score);
  if(order===undefined)return `Lean Verified ${shown(score)} cannot be compared with the breakthrough bound ${shown(bar.score)} (Lead, 2026-11-08, fail closed): no X post`;
 }else{
  try{order=compare(score,bar.score);}catch{console.warn(`X skip rule: cannot compare the score of ${post.key.slice(0,80)}; the post is left unchanged`);return undefined;}
 }
 const worse=bar.direction==='lower'?order>0:order<0;
 return worse?`Lean Verified ${shown(score)} is worse than the breakthrough bound ${shown(bar.score)} that started the race on this board (Nil, 2026-11-02): no X post`:undefined;
}
