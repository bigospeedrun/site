import {evidenceOrder} from './evidence.ts';
// Scores remain exact until display or chart coordinate calculation.
export function compare(a: string, b: string): number {
 const [an,ad='1']=a.split('/').map(String),[bn,bd='1']=b.split('/').map(String);
 const d=BigInt(an)*BigInt(bd)-BigInt(bn)*BigInt(ad);return d<0n?-1:d>0n?1:0;
}
// Number() of a part above about 309 digits is Infinity, so a long exact score
// would become NaN. Divide with BigInt to 20 significant digits first.
export function scoreNumber(score: string): number {
 const [n,d='1']=score.split('/');const num=BigInt(n),den=BigInt(d);
 if(num===0n)return 0;
 const abs=num<0n?-num:num;const shift=20-(abs.toString().length-den.toString().length);
 const q=shift>=0?abs*10n**BigInt(shift)/den:abs/(den*10n**BigInt(-shift));
 return Number(`${num<0n?'-':''}${q}e${-shift}`);
}
export function decimal(score: string): string {
 const value=scoreNumber(score);
 return Math.abs(value)<0.000001 && value!==0?value.toExponential(6):Number(value.toPrecision(10)).toString();
}
// Positive when a beats b. An open endpoint is weaker than an attained value at the same
// score in both directions: a kappa endpoint gives every saving below it, an exponent
// endpoint every exponent above it (n^(a+o(1)) is weaker than O(n^a)).
// At an equal score and relation, the constant c of L_N[theta, c] decides (lConstantOrder).
function better(a:{score:string;scoreRelation?:string;lConstant?:string},b:{score:string;scoreRelation?:string;lConstant?:string},direction:string):number {
 const open=(r:{scoreRelation?:string})=>r.scoreRelation==='strict-upper-bound'?1:0;
 return (direction==='higher-is-better'?1:-1)*compare(a.score,b.score)||open(b)-open(a)||lConstantOrder(a,b);
}
// The randomized integer factoring board (Lead, 2026-11-27): rows with the same theta rank by the constant c of their
// bound L_N[theta, c] = e^{(c+o(1))(ln N)^theta (ln ln N)^{1-theta}}, lower is better. A row with no stated c ranks after
// every row with one. Positive when a beats b; 0 when neither row states c (every other board).
export function lConstantOrder(a:{lConstant?:string},b:{lConstant?:string}):number {
 if(a.lConstant===undefined||b.lConstant===undefined)return (a.lConstant===undefined?0:1)-(b.lConstant===undefined?0:1);
 return compare(b.lConstant,a.lConstant);
}
// Best first. Of equal bounds, the higher evidence level first (evidenceOrder), then the earlier row. Equal bounds share a rank.
export function ranked<T extends {score:string;scoreRelation?:string;lConstant?:string;date:string;repoId:number;id:string;evidenceLevel?:string}>(records:T[], direction:string, level:(record:T)=>string|undefined=record=>record.evidenceLevel) {
 const sorted=[...records].sort((a,b)=>better(b,a,direction)||evidenceOrder(level(b))-evidenceOrder(level(a))||a.date.localeCompare(b.date)||a.repoId-b.repoId||a.id.localeCompare(b.id));
 let rank=1;return sorted.map((record,i)=>{if(i&&better(record,sorted[i-1],direction)!==0)rank=i+1;return {record,rank,tie:i>0&&better(record,sorted[i-1],direction)===0}});
}
export function progression<T extends {score:string;scoreRelation?:string;lConstant?:string;date:string;repoId:number;id:string}>(records:T[], direction:string):T[]{
 const ordered=[...records].sort((a,b)=>a.date.localeCompare(b.date)||a.repoId-b.repoId||a.id.localeCompare(b.id));
 const best:T[]=[];for(const r of ordered){const prev=best.at(-1);if(!prev||better(r,prev,direction)>0)best.push(r)}return best;
}

// Increase display precision only when rounding would hide a distinct nearby score.
export function scorePrecision(score:string, peers:string[]):number {
 const value=(s:string)=>{const [a,b='1']=s.split('/');return Number(a)/Number(b)};
 const n=value(score);const distinct=peers.filter(p=>compare(score,p)!==0).map(value);
 for(let digits=3;digits<15;digits++)if(!distinct.some(p=>p.toExponential(digits)===n.toExponential(digits)))return digits;
 return 15;
}

// Main-branch selected checkpoints need no merged-PR status.
export function acceptedRaceRecord(record:{eligible:boolean;upstreamStatus:string;upstreamSelected?:boolean}):boolean {
 return record.eligible&&(record.upstreamStatus==='merged'||(record.upstreamSelected===true&&record.upstreamStatus==='not-applicable'));
}

// Round an exponent upward so the displayed big-O bound is never stronger.
export function logExponent(score:string,precision=15):string {
 const [n,d=1n]=score.split('/').map(BigInt);
 const denominator=d??1n;
 const scale=10n**BigInt(precision);
 const numerator=denominator-n;
 const rounded=(numerator*scale+denominator-1n)/denominator;
 if(rounded===scale&&n>0n)return `1-\\frac{${n}}{${denominator}}`;
 const digits=rounded.toString().padStart(precision+1,'0');
 return (digits.slice(0,-precision)+'.'+digits.slice(-precision)).replace(/\.?0+$/,'');
}

// Use one precision across the table, retaining exact scores for ordering and details.
export function boundExponent(score:string,kappa:boolean,digits:number):string {
 const [n,d=1n]=score.split('/').map(BigInt);
 const numerator=kappa?d-n:n;
 const scale=10n**BigInt(digits);
 const rounded=(numerator*scale+d-1n)/d;
 if(digits===0)return String(rounded);
 const value=String(rounded).padStart(digits+1,'0');
 return value.slice(0,-digits)+'.'+value.slice(-digits);
}
// Return the exact number of decimal places, or null for a repeating decimal.
function decimalPlaces(score:string):number|null {
 let [n,d=1n]=score.split('/').map(BigInt);
 const gcd=(a:bigint,b:bigint):bigint=>b===0n?a:gcd(b,a%b);
 d/=gcd(n,d);
 let twos=0,fives=0;
 while(d%2n===0n){d/=2n;twos++}
 while(d%5n===0n){d/=5n;fives++}
 return d===1n?Math.max(twos,fives):null;
}
// Display caps (Nil, 2026-10-14): the varying part of a shown bound has at most this
// many significant digits. Exact scores stay in the data, in ranking and in each
// row's Exact score tooltip. Scores that agree up to the cap show the same label.
export const displayDigits={landing:10,table:20} as const;

// The fewest significant digits (at least 3) that keep distinct scores apart, up to the cap.
// Exponent boards count decimal places instead; their exponents are below 10.
export function boundPrecision(scores:string[],kappa:boolean,cap:number=displayDigits.table):number {
 if(kappa){
  const unique=scores.filter((score,index)=>scores.findIndex(peer=>compare(score,peer)===0)===index);
  for(let digits=3;digits<cap;digits++)if(new Set(unique.map(score=>scientificSaving(score,digits))).size===unique.length)return digits;
  return cap;
 }
 return Math.min(cap-1,Math.max(0,...scores.map(score=>decimalPlaces(score)??0)));
}
// Exact when short enough; otherwise rounded up, so the shown bound is never stronger.
function exactExponent(score:string,cap:number):string {
 const places=decimalPlaces(score);
 const [n,d='1']=score.split('/');
 const room=Math.max(0,cap-String(BigInt(n)/BigInt(d)).length);
 if(places!==null&&places<=room)return boundExponent(score,false,places);
 if(places===null&&n.length+d.length<=cap)return `\\frac{${n}}{${d}}`;
 return boundExponent(score,false,room).replace(/\.0+$|(\.\d*?)0+$/,'$1');
}
// A higher-is-better exponent: exact when short enough, otherwise rounded down, so the shown bound is never stronger.
function exactExponentDown(score:string,cap:number):string {
 const places=decimalPlaces(score);
 const [n,d='1']=score.split('/');
 const room=Math.max(0,cap-String(BigInt(n)/BigInt(d)).length);
 if(places!==null&&places<=room)return boundExponent(score,false,places);
 if(places===null&&n.length+d.length<=cap)return `\\frac{${n}}{${d}}`;
 const digits=String(BigInt(n)*10n**BigInt(room)/BigInt(d)).padStart(room+1,'0');
 return (room?digits.slice(0,-room)+'.'+digits.slice(-room):digits).replace(/\.0+$|(\.\d*?)0+$/,'$1');
}
// Integer factoring (Lead, 2026-10-30) uses one scale for how subexponential a bound is:
// score -c is time N^{c+o(1)}, score 0 is N^{o(1)} = 2^{o(b)}, score alpha > 0 is 2^{b/(log b)^{alpha-o(1)}}.
// Every shown bound is in N (Nil, 2026-11-04): b = log2 N + O(1), so log b = log log N + O(1), and the o(1) in the
// exponent takes up the constant factors: 2^{b/(log b)^{alpha-o(1)}} = N^{1/(log log N)^{alpha-o(1)}}.
// A short fraction whose denominator is not a power of 10 shows as that fraction (1/2, not 0.5: Lead, 2026-11-04);
// any other score as a decimal rounded down. Used for the -o(1) exponents of integer factoring and 3-SAT.
export function shortFraction(score:string,cap:number=displayDigits.table):string|undefined {
 const [n,d]=score.split('/');
 return d!==undefined&&!/^10*$/.test(d)&&n.length+d.length<=cap?`${n}/${d}`:undefined;
}
// The theta band (Lead and Nil, 2026-11-26): time 2^{b^{theta+o(1)}} with 0 <= theta < 1 scores 101 - theta, so
// every theta row (s in (100, 101]) ranks above every alpha row (s <= 100), and a lower theta scores higher. In N:
// b^{theta+o(1)} = (log N)^{theta+o(1)}, since b = log2 N + O(1) and the o(1) takes up the constant factors.
// factoringTheta gives theta as a reduced fraction for a score in the band, or undefined for any other score.
export const FACTORING_THETA_FLOOR='100';
export function factoringTheta(score:string):string|undefined {
 if(compare(score,FACTORING_THETA_FLOOR)<=0)return undefined;
 const [ns,ds='1']=score.split('/');
 const n=BigInt(ns),d=BigInt(ds),num=101n*d-n;
 const gcd=(a:bigint,b:bigint):bigint=>b===0n?a:gcd(b,a%b);
 const g=gcd(num<0n?-num:num,d)||1n;
 return d/g===1n?String(num/g):`${num/g}/${d/g}`;
}
// The band of a factoring score and its value there, for readers of the raw score (the chat): -1/5 is N^{1/5+o(1)}
// (band 'N-exponent', value 1/5), 0 is N^{o(1)}, 1/2 is alpha = 1/2, 401/4 is theta = 3/4.
export type FactoringBand = {band: 'N-exponent' | 'N^o(1)' | 'alpha' | 'theta'; value: string};
export function factoringBand(score:string):FactoringBand {
 const sign=compare(score,'0');
 if(sign<0)return {band:'N-exponent',value:score.slice(1)};
 if(sign===0)return {band:'N^o(1)',value:'0'};
 const theta=factoringTheta(score);
 return theta===undefined?{band:'alpha',value:score}:{band:'theta',value:theta};
}
// theta is lower-is-better: exact when short, otherwise rounded up, so the shown bound is never stronger.
function factoringThetaText(theta:string,cap:number):string {
 return shortFraction(theta,cap)??exactExponent(theta,cap).replace(/^\\frac\{(\d+)\}\{(\d+)\}$/,'$1/$2');
}
function factoringAlpha(score:string,cap:number):string {
 return shortFraction(score,cap)??exactExponentDown(score,cap).replace(/^\\frac\{(\d+)\}\{(\d+)\}$/,'$1/$2');
}
// The time 2^{(log N)^{theta+o(1)}} of a theta (the deterministic board's theta band, and the score of the randomized board).
export function thetaBound(theta:string,cap:number=displayDigits.table):string {
 return theta==='0'?'2^{(\\log N)^{o(1)}}':`2^{(\\log N)^{${factoringThetaText(theta,cap)}+o(1)}}`;
}
export function thetaPlainBound(theta:string,cap:number=displayDigits.table):string {
 return theta==='0'?'2^((log N)^o(1))':`2^((log N)^(${factoringThetaText(theta,cap)} + o(1)))`;
}
// The constant c of L_N[theta, c], exact: an integer, a finite decimal, else a fraction.
function lConstantText(c:string,latex:boolean):string {
 const [n,d=1n]=c.split('/').map(BigInt);
 let rest=d;for(const p of [2n,5n])while(rest%p===0n)rest/=p;
 if(rest!==1n)return latex?`\\tfrac{${n}}{${d}}`:`${n}/${d}`;
 let places=0;while(n*10n**BigInt(places)%d!==0n)places++;
 const digits=(n*10n**BigInt(places)/d).toString().padStart(places+1,'0');
 return places?digits.slice(0,-places)+'.'+digits.slice(-places):digits;
}
// The bound L_N[theta, c] of a row that states c (the randomized integer factoring board), in KaTeX and as plain text.
export function lBound(theta:string,c:string,cap:number=displayDigits.table):string {
 return `L_N[${factoringThetaText(theta,cap)},\\,${lConstantText(c,true)}]`;
}
export function lPlainBound(theta:string,c:string,cap:number=displayDigits.table):string {
 return `L_N[${factoringThetaText(theta,cap)}, ${lConstantText(c,false)}]`;
}
export function factoringBound(score:string,cap:number=displayDigits.table):string {
 const sign=compare(score,'0');
 if(sign===0)return 'N^{o(1)}';
 if(sign<0)return `N^{${exactExponent(score.slice(1),cap)}+o(1)}`;
 const theta=factoringTheta(score);
 if(theta!==undefined)return thetaBound(theta,cap);
 return `N^{1/(\\log\\log N)^{${factoringAlpha(score,cap)}-o(1)}}`;
}
// The same bound as plain text, for record posts.
export function factoringPlainBound(score:string,cap:number=displayDigits.table):string {
 const value=(s:string)=>exactExponent(s,cap).replace(/^\\frac\{(\d+)\}\{(\d+)\}$/,'$1/$2');
 const sign=compare(score,'0');
 if(sign===0)return 'N^o(1)';
 if(sign<0)return `N^(${value(score.slice(1))} + o(1))`;
 const theta=factoringTheta(score);
 if(theta!==undefined)return thetaPlainBound(theta,cap);
 return `N^(1/(log log N)^(${factoringAlpha(score,cap)} - o(1)))`;
}
const factoringForm=/N\^|\\log b|\\log N\)\^/;
// scoreScale 'theta': the score is theta itself (the randomized integer factoring board), not a point of the deterministic scale.
export function tableBound(record:{score:string;scoreRelation?:string;bound:string;scoreScale?:'theta';lConstant?:string},kappa:boolean,digits:number,cap:number=displayDigits.table):string {
 if(record.scoreScale==='theta')return record.lConstant!==undefined?lBound(record.score,record.lConstant,cap):thetaBound(record.score,cap);
 if(factoringForm.test(record.bound))return factoringBound(record.score,cap);
 const exponent=kappa?'1-'+scientificSaving(record.score,Math.min(digits,cap)).replace(/10\^\{/g,'10^{\\scriptstyle '):exactExponent(record.score,cap);
 const power=exponent+(record.scoreRelation==='strict-upper-bound'||record.bound.includes('\\varepsilon')?'+\\varepsilon':'');
 // 3-SAT alpha is higher-is-better: round it down.
 if(record.bound.includes('-o(1)'))return `O^*(2^{n/(\\log n)^{${shortFraction(record.score,cap)??exactExponentDown(record.score,cap)}-o(1)}})`;
 if(kappa||record.bound.includes('\\log'))return `O(n \\log^{${power}} n)`;
 if(record.bound.includes('2^{'))return `O${record.bound.startsWith('O^*')?'^*':''}(2^{${power.includes('+')?`(${power})`:power}n})`;
 return `O(n^{${power}})`;
}


// Format a nonnegative rational saving with exact downward rounding.
export function scientificSaving(score:string,significantDigits:number):string {
 const [n,d=1n]=score.split('/').map(BigInt);
 if(n===0n)return '0';
 let exponent=n.toString().length-d.toString().length;
 const atLeastPower=(power:number)=>power>=0?n>=d*10n**BigInt(power):n*10n**BigInt(-power)>=d;
 while(!atLeastPower(exponent))exponent--;
 while(atLeastPower(exponent+1))exponent++;
 const shift=significantDigits-1-exponent;
 const units=shift>=0?n*10n**BigInt(shift)/d:n/(d*10n**BigInt(-shift));
 const raw=String(units).padStart(significantDigits,'0');
 const coefficient=(raw[0]+(significantDigits>1?'.'+raw.slice(1):'')).replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');
 if(exponent===0)return coefficient;
 // A saving from 0.1 up to 1 reads as a decimal: "1-0.5+\varepsilon", not "1-5\cdot 10^{-1}+\varepsilon" (OpenAI multitape row, kappa < 1/2, 2026-11-25).
 if(exponent===-1)return '0.'+coefficient.replace('.','');
 return (coefficient==='1'?'':coefficient+'\\cdot ')+`10^{${exponent}}`;
}
