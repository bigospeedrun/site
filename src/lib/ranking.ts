// Scores remain exact until display or chart coordinate calculation.
export function compare(a: string, b: string): number {
 const [an,ad='1']=a.split('/').map(String),[bn,bd='1']=b.split('/').map(String);
 const d=BigInt(an)*BigInt(bd)-BigInt(bn)*BigInt(ad);return d<0n?-1:d>0n?1:0;
}
export function decimal(score: string): string {
 const [n,d='1']=score.split('/');const value=Number(n)/Number(d);
 return Math.abs(value)<0.000001 && value!==0?value.toExponential(6):Number(value.toPrecision(10)).toString();
}
// An open endpoint is distinct from an attained value at the same score.
function compareEntries(a:{score:string;scoreRelation?:string},b:{score:string;scoreRelation?:string}):number {
 return compare(a.score,b.score)||(a.scoreRelation==='strict-upper-bound'?-1:0)-(b.scoreRelation==='strict-upper-bound'?-1:0);
}
export function ranked<T extends {score:string;scoreRelation?:string;date:string;repoId:number;id:string}>(records:T[], direction:string) {
 const sorted=[...records].sort((a,b)=>(direction==='higher-is-better'?-1:1)*compareEntries(a,b)||a.date.localeCompare(b.date)||a.repoId-b.repoId||a.id.localeCompare(b.id));
 let rank=1;return sorted.map((record,i)=>{if(i&&compareEntries(record,sorted[i-1])!==0)rank=i+1;return {record,rank,tie:i>0&&compareEntries(record,sorted[i-1])===0}});
}
export function progression<T extends {score:string;scoreRelation?:string;date:string;repoId:number;id:string}>(records:T[], direction:string):T[]{
 const ordered=[...records].sort((a,b)=>a.date.localeCompare(b.date)||a.repoId-b.repoId||a.id.localeCompare(b.id));
 const best:T[]=[];for(const r of ordered){const prev=best.at(-1);if(!prev||(direction==='higher-is-better'?compareEntries(r,prev)>0:compareEntries(r,prev)<0))best.push(r)}return best;
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
export function boundPrecision(scores:string[],kappa:boolean):number {
 if(kappa){
  const unique=scores.filter((score,index)=>scores.findIndex(peer=>compare(score,peer)===0)===index);
  for(let digits=3;digits<6;digits++)if(new Set(unique.map(score=>scientificSaving(score,digits))).size===unique.length)return digits;
  return 6;
 }
 // Preserve the value of terminating decimal exponents, even when there is only one row.
 // Other rationals retain eight decimal places with conservative upward rounding.
 return Math.max(0,...scores.map(score=>{
  const [n,d=1n]=score.split('/').map(BigInt);
  for(let digits=0;digits<8;digits++)if(n*10n**BigInt(digits)%d===0n)return digits;
  return 8;
 }));
}
export function tableBound(record:{score:string;scoreRelation?:string;bound:string},kappa:boolean,digits:number):string {
 const exponent=kappa?'1-'+scientificSaving(record.score,digits).replace(/10\^\{/g,'10^{\\scriptstyle '):boundExponent(record.score,false,digits);
 const power=exponent+(record.scoreRelation==='strict-upper-bound'?'+\\varepsilon':'');
 if(kappa||record.bound.includes('\\log'))return `O(n \\log^{${power}} n)`;
 if(record.bound.includes('2^{'))return `O${record.bound.startsWith('O^*')?'^*':''}(2^{${power}n})`;
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
