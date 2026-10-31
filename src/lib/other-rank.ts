// The order of the claims of an Other bounds row, best first, by the row's direction. A claim has no
// single exact format ('\approx6.14\cdot10^{-11}', '2^{-38}', '10499/12000', '\le0.87488664704'), so its
// number is read from its display, then from its exact value. Claims that tie share a rank, the earliest
// first, as on the Big O pages. When a number cannot be read for some claim, the row keeps the newest
// first. That is only a fallback: a claim listed by hand was the best when it appeared, but a prove2.me
// claim needs only to beat the best Lean Verified claim at its time (data/prove2me_import.py), so the
// newest claim is not always the best.
// Rows opting into exactScores instead compare canonical rational values without display rounding.
import {compare} from './ranking.ts';

type Claim = {display: string; value: string; date: string};

// Exact-score rows use reduced integer/fraction strings, never rounded display text.
export function isCanonicalRationalScore(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4096 || !/^-?(0|[1-9][0-9]*)(\/[1-9][0-9]*)?$/.test(value)) return false;
  const [numerator, denominator = 1n] = value.split('/').map(BigInt);
  let a = numerator < 0n ? -numerator : numerator, b = denominator;
  while (b !== 0n) { const remainder = a % b; a = b; b = remainder; }
  return a === 1n && (denominator !== 1n || value === numerator.toString());
}

export function otherClaimNumber(claim: Pick<Claim, 'display' | 'value'>): number | null {
  const power10 = /(\d+(?:\.\d+)?)\s*\\cdot\s*10\^\{?\s*(-?\d+)\s*\}?/.exec(claim.display);
  if (power10) return Number(power10[1] + 'e' + power10[2]);
  const power = /\b(\d+)\^\{\s*(-?\d+)\s*\}/.exec(claim.display);
  if (power) return Number(power[1]) ** Number(power[2]);
  const decimal = /\d+\.\d+/.exec(claim.display);
  if (decimal) return Number(decimal[0]);
  const fraction = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(claim.value);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const whole = /^\s*(\d+)\s*$/.exec(claim.display) ?? /^\s*(\d+)\s*$/.exec(claim.value);
  return whole ? Number(whole[1]) : null;
}

const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b));

export function rankOtherClaims<C extends Claim>(claims: C[], direction: string, exactScores = false): {claim: C; rank: number; tie: boolean}[] {
  if (exactScores) {
    if (!claims.every(claim => isCanonicalRationalScore(claim.value))) throw new Error('Exact-score rows require canonical rational values');
    const sign = direction === 'higher' ? -1 : 1;
    const sorted = claims.map((claim, index) => ({claim, index}))
      .sort((a, b) => sign * compare(a.claim.value, b.claim.value) || Date.parse(a.claim.date) - Date.parse(b.claim.date) || a.index - b.index);
    let rank = 0;
    return sorted.map(({claim}, index) => {
      const tie = index > 0 && compare(claim.value, sorted[index - 1].claim.value) === 0;
      if (!tie) rank = index + 1;
      return {claim, rank, tie};
    });
  }
  const entries = claims.map((claim, index) => ({claim, index, number: otherClaimNumber(claim)}));
  const sign = direction === 'higher' ? -1 : 1;
  const known = entries.every(e => e.number !== null);
  const sorted = [...entries].sort((a, b) => known
    ? sign * (a.number! - b.number!) * (same(a.number!, b.number!) ? 0 : 1) || a.index - b.index
    : b.index - a.index);
  let rank = 0;
  return sorted.map((entry, i) => {
    const prev = sorted[i - 1];
    const tie = known && i > 0 && same(entry.number!, prev.number!);
    if (!tie) rank = i + 1;
    return {claim: entry.claim, rank, tie};
  });
}
