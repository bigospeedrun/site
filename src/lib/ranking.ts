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
function better(a:{score:string;scoreRelation?:string},b:{score:string;scoreRelation?:string},direction:string):number {
 const open=(r:{scoreRelation?:string})=>r.scoreRelation==='strict-upper-bound'?1:0;
 return (direction==='higher-is-better'?1:-1)*compare(a.score,b.score)||open(b)-open(a);
}
export function ranked<T extends {score:string;scoreRelation?:string;date:string;repoId:number;id:string}>(records:T[], direction:string) {
 const sorted=[...records].sort((a,b)=>better(b,a,direction)||a.date.localeCompare(b.date)||a.repoId-b.repoId||a.id.localeCompare(b.id));
 let rank=1;return sorted.map((record,i)=>{if(i&&better(record,sorted[i-1],direction)!==0)rank=i+1;return {record,rank,tie:i>0&&better(record,sorted[i-1],direction)===0}});
}
export function progression<T extends {score:string;scoreRelation?:string;date:string;repoId:number;id:string}>(records:T[], direction:string):T[]{
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
export function factoringBound(score:string,cap:number=displayDigits.table):string {
 const sign=compare(score,'0');
 if(sign===0)return 'N^{o(1)}';
 if(sign<0)return `N^{${exactExponent(score.slice(1),cap)}+o(1)}`;
 return `2^{b/(\\log b)^{${exactExponentDown(score,cap)}-o(1)}}`;
}
// The same bound as plain text, for record posts.
export function factoringPlainBound(score:string,cap:number=displayDigits.table):string {
 const value=(s:string,down=false)=>(down?exactExponentDown:exactExponent)(s,cap).replace(/^\\frac\{(\d+)\}\{(\d+)\}$/,'$1/$2');
 const sign=compare(score,'0');
 if(sign===0)return 'N^o(1)';
 if(sign<0)return `N^(${value(score.slice(1))} + o(1))`;
 return `2^(b/(log b)^(${value(score,true)} - o(1)))`;
}
const factoringForm=/N\^|\\log b/;
export function tableBound(record:{score:string;scoreRelation?:string;bound:string},kappa:boolean,digits:number,cap:number=displayDigits.table):string {
 if(factoringForm.test(record.bound))return factoringBound(record.score,cap);
 const exponent=kappa?'1-'+scientificSaving(record.score,Math.min(digits,cap)).replace(/10\^\{/g,'10^{\\scriptstyle '):exactExponent(record.score,cap);
 const power=exponent+(record.scoreRelation==='strict-upper-bound'||record.bound.includes('\\varepsilon')?'+\\varepsilon':'');
 if(record.bound.includes('-o(1)'))return `O^*(2^{n/(\\log n)^{${exactExponent(record.score,cap)}-o(1)}})`;
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
 return (coefficient==='1'?'':coefficient+'\\cdot ')+`10^{${exponent}}`;
}
