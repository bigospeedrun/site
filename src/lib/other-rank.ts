// The order of the claims of an Other bounds row, best first, by the row's direction. A claim has no
// single exact format ('\approx6.14\cdot10^{-11}', '2^{-38}', '10499/12000', '\le0.87488664704'), so its
// number is read from its display, then from its exact value. Claims that tie share a rank, the higher
// evidence level first, then the earliest, as on the Big O pages. When a number cannot be read for some claim, the row keeps the newest
// first. That is only a fallback: a claim listed by hand was the best when it appeared, but a prove2.me
// claim needs only to beat the best Lean Verified claim at its time (data/prove2me_import.py), so the
// newest claim is not always the best.
//
// A claim of the form A d^p ('80{,}000d^{17}', the contingency tables row) has no single number: d^p dominates
// A for large d, so its order is lexicographic, by the exponent p first, then by the constant A (site#9, darkhipo).
// It is read only from the whole display, and the row uses that order only when every one of its claims is such a claim.
//
// Of claims that tie, the one with the higher evidence level ranks first (Nil, 2026-11-04; evidenceOrder), then the earlier one.
//
// Exact values (Lead, 2026-11-11, quasi-Riemann #129: the contact point (777-\sqrt{1081})/852, about 2.16e-254 below
// #103's fraction): a value p/q, a whole number, or \frac{a\pm b\sqrt{c}}{d} is read exactly (parseExact) when it
// agrees with the display's number, and claims compare by these values in integer arithmetic (compareExactValues). A
// claim without such a value compares as its display's number, which is itself an exact binary fraction. So the order
// is the order of real numbers, and transitive; two claims tie only when they are equal.
type Claim = {display: string; value: string; date: string; evidence?: string};

import {evidenceOrder} from './evidence.ts';

const DEGREE_CLAIM = /^(\d+(?:\{,\}\d{3})*(?:\.\d+)?)d\^\{(-?\d+)\}$/;

// A d^p as the exact rational A (numerator, denominator) and the exponent p, or null for any other display.
export function parseDegreeClaim(display: string): {a: [bigint, bigint]; p: bigint} | null {
  const m = DEGREE_CLAIM.exec(display);
  if (!m) return null;
  const [whole, fraction = ''] = m[1].replaceAll('{,}', '').split('.');
  return {a: [BigInt(whole + fraction), 10n ** BigInt(fraction.length)], p: BigInt(m[2])};
}

// A d^p has no single number (see above), so it stays unread here, even when A has a decimal point.
export function otherClaimNumber(claim: Pick<Claim, 'display' | 'value'>): number | null {
  if (parseDegreeClaim(claim.display)) return null;
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

// An exact value (a + b sqrt(c)) / d, with integers c >= 0 and d > 0. A fraction p/q is (p + 0 sqrt(0)) / q.
export type Exact = {a: bigint; b: bigint; c: bigint; d: bigint};
const RATIONAL_VALUE = /^\s*(\d+)\s*(?:\/\s*(\d+))?\s*$/;
const SURD_VALUE = /^\s*\\frac\{\s*(\d+)\s*([+-])\s*(\d*)\s*\\sqrt\{\s*(\d+)\s*\}\s*\}\{\s*(\d+)\s*\}\s*$/;
export function parseExact(value: string): Exact | null {
  const r = RATIONAL_VALUE.exec(value);
  if (r) { const d = BigInt(r[2] ?? '1'); return d === 0n ? null : {a: BigInt(r[1]), b: 0n, c: 0n, d}; }
  const s = SURD_VALUE.exec(value);
  if (!s || BigInt(s[5]) === 0n) return null;
  return {a: BigInt(s[1]), b: (s[2] === '-' ? -1n : 1n) * BigInt(s[3] || '1'), c: BigInt(s[4]), d: BigInt(s[5])};
}
export const exactNumber = (x: Exact) => (Number(x.a) + Number(x.b) * Math.sqrt(Number(x.c))) / Number(x.d);
const signOf = (x: bigint) => x < 0n ? -1 : x > 0n ? 1 : 0;
// The sign of A + B sqrt(c), by squaring when the two terms have opposite signs.
function signSurd(A: bigint, B: bigint, c: bigint): number {
  const sa = signOf(A), sb = c === 0n ? 0 : signOf(B);
  if (sb === 0) return sa;
  if (sa === 0 || sa === sb) return sb;
  const d = A * A - B * B * c;
  return d === 0n ? 0 : d > 0n ? sa : sb;
}
// The order of two exact values: the sign of x - y, which is the sign of u + v with u = P + Q sqrt(c1) and v = R sqrt(c2)
// (both denominators are positive). When u and v have opposite signs, |u| and |v| compare by u^2 - v^2, again A + B sqrt(c1).
export function compareExactValues(x: Exact, y: Exact): number {
  const P = x.a * y.d - y.a * x.d, Q = x.b * y.d, R = -y.b * x.d;
  const su = signSurd(P, Q, x.c), sv = y.c === 0n ? 0 : signOf(R);
  if (sv === 0) return su;
  if (su === 0 || su === sv) return sv;
  const s = signSurd(P * P + Q * Q * x.c - R * R * y.c, 2n * P * Q, x.c);
  return s === 0 ? 0 : s > 0 ? su : sv;
}
// A finite double as the exact binary fraction it is.
function binary(x: number): Exact {
  let d = 1n;
  while (!Number.isInteger(x)) { x *= 2; d *= 2n; }
  return {a: BigInt(x), b: 0n, c: 0n, d};
}
// The exact value of a claim: its value when parseExact reads one that agrees with the number of the display (relative
// 1e-6), else that number. An infinite number (no exact value) stays a number.
function claimExact(claim: Claim, number: number | null): Exact | number | null {
  if (number === null) return null;
  const x = parseExact(claim.value);
  if (x) { const n = exactNumber(x); if (Math.abs(n - number) <= 1e-6 * Math.max(Math.abs(n), Math.abs(number))) return x; }
  return Number.isFinite(number) ? binary(number) : number;
}
function compareKeys(a: Exact | number, b: Exact | number): number {
  if (typeof a === 'number' || typeof b === 'number') {
    const x = typeof a === 'number' ? a : exactNumber(a), y = typeof b === 'number' ? b : exactNumber(b);
    return x < y ? -1 : x > y ? 1 : 0;
  }
  return compareExactValues(a, b);
}
// The value a row cell shows (Lead, 2026-11-11, quasi-Riemann #129): a \frac{a\pm b\sqrt{c}}{d} value with a plain decimal
// display shows both, the exact value first ("\frac{777-\sqrt{1081}}{852}\approx0.8733..."), so that it does not look
// equal to a fraction with the same decimals. Every other claim shows its display.
export function shownBound(claim: Pick<Claim, 'display' | 'value'>): string {
  const x = parseExact(claim.value);
  return x && x.b !== 0n && x.c !== 0n && /^\d+\.\d+$/.test(claim.display) ? `${claim.value.trim()}\\approx${claim.display}` : claim.display;
}
export const compareExact = (a: [bigint, bigint], b: [bigint, bigint]) => { const d = a[0] * b[1] - b[0] * a[1]; return d < 0n ? -1 : d > 0n ? 1 : 0; };

export const compareDegree = (a: {a: [bigint, bigint]; p: bigint}, b: {a: [bigint, bigint]; p: bigint}) =>
  a.p !== b.p ? (a.p < b.p ? -1 : 1) : compareExact(a.a, b.a);

export function rankOtherClaims<C extends Claim>(claims: C[], direction: string, rankBy?: string[]): {claim: C; rank: number; tie: boolean}[] {
  if (rankBy?.length) return rankByMeasures(claims, rankBy);
  const degrees = claims.map(claim => parseDegreeClaim(claim.display));
  if (claims.length > 0 && degrees.every(d => d !== null)) {
    const sign = direction === 'higher' ? -1 : 1;
    const items = claims.map((claim, index) => ({claim, index, degree: degrees[index]!}));
    const sorted = [...items].sort((a, b) => sign * compareDegree(a.degree, b.degree) || evidenceOrder(b.claim.evidence) - evidenceOrder(a.claim.evidence) || a.index - b.index);
    let rank = 0;
    return sorted.map((item, i) => {
      const tie = i > 0 && compareDegree(item.degree, sorted[i - 1].degree) === 0;
      if (!tie) rank = i + 1;
      return {claim: item.claim, rank, tie};
    });
  }
  const entries = claims.map((claim, index) => {
    const number = otherClaimNumber(claim);
    return {claim, index, number, key: claimExact(claim, number)};
  });
  const sign = direction === 'higher' ? -1 : 1;
  const known = entries.every(e => e.number !== null);
  const order = (a: typeof entries[number], b: typeof entries[number]) => sign * compareKeys(a.key!, b.key!);
  const sorted = [...entries].sort((a, b) => known ? order(a, b) || evidenceOrder(b.claim.evidence) - evidenceOrder(a.claim.evidence) || a.index - b.index : b.index - a.index);
  let rank = 0;
  return sorted.map((entry, i) => {
    const prev = sorted[i - 1];
    const tie = known && i > 0 && order(entry, prev) === 0;
    if (!tie) rank = i + 1;
    return {claim: entry.claim, rank, tie};
  });
}

// A row with `rankBy` (Z is Diophantine in Q; Nil, 2026-11-06: degree first, then variables, then nonzero terms, then
// largest absolute coefficient) ranks its claims by those measures in that order, each lower is better, instead of by
// the one number of the display. A claim's `measures` map each name to an exact whole number ("4", "12504") or to a
// stated upper bound ("<2^80", "<2^(2^45)", "<2^^7", a tower of twos): a bound compares as its value, so an exact
// value beats it only when smaller, and an equal one ties with it. A missing measure (a term count nobody stated)
// ranks after every stated one. Claims equal on every measure tie: the higher evidence level first, then the earlier.
export type Measures = Record<string, string | undefined>;
type Magnitude = bigint | {exp: Magnitude};

// The magnitude of a measure, with its upper bound flag; null for text the grammar does not know.
export function parseMeasure(text: string): {magnitude: Magnitude; bound: boolean} | null {
  const bound = text.trim().startsWith('<');
  const magnitude = parseMagnitude(text.trim().replace(/^<\s*/, '').replaceAll('{,}', '').replaceAll(/[\s,]/g, ''));
  return magnitude === null ? null : {magnitude, bound};
}
function parseMagnitude(text: string): Magnitude | null {
  if (/^\d+$/.test(text)) return BigInt(text);
  const tower = /^2\^\^(\d+)$/.exec(text);
  if (tower) { let m: Magnitude = 2n; for (let i = 1; i < Number(tower[1]); i++) m = {exp: m}; return normal(m); }
  const power = /^2\^\(?(.+?)\)?$/.exec(text);
  if (power) { const inner = parseMagnitude(power[1]); return inner === null ? null : normal({exp: inner}); }
  // A*B^(X) with another base ("64*3^(2^28)", the Version 5 and 6 quartics): its size is log2(A) + X log2(B), a plain
  // number when that is at most 4096 bits, else a tower whose exponent is that logarithm rounded. The rounding is the
  // same for equal text, so equal heights tie; it could misorder two heights within one bit of each other.
  const product = /^(?:(\d+)\*)?(\d+)\^\(?(.+?)\)?$/.exec(text);
  if (product) {
    const a = BigInt(product[1] ?? '1'), b = BigInt(product[2]), x = parseMagnitude(product[3]);
    if (x === null || b < 2n) return null;
    if (typeof x !== 'bigint') return {exp: x};
    const bits = Math.log2(Number(a)) + Number(x) * Math.log2(Number(b));
    return bits <= 4096 ? a * b ** x : {exp: BigInt(Math.round(bits))};
  }
  return null;
}
// 2^n with n at most 4096 is a plain whole number, so that "2^80" and a 24-digit coefficient compare exactly.
const normal = (m: Magnitude): Magnitude => typeof m === 'bigint' ? m : (() => { const e = normal(m.exp); return typeof e === 'bigint' && e <= 4096n ? 2n ** e : {exp: e}; })();
// A tower with an exponent over 4096 counts as larger than any plain number (none in the data has 1234 digits).
export function compareMagnitude(a: Magnitude, b: Magnitude): number {
  if (typeof a === 'bigint' && typeof b === 'bigint') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'bigint') return -1;
  if (typeof b === 'bigint') return 1;
  return compareMagnitude(a.exp, b.exp);
}
// Lower is better for every measure; a missing or unreadable one ranks last.
export function compareMeasures(a: Measures | undefined, b: Measures | undefined, rankBy: string[]): number {
  for (const name of rankBy) {
    const x = a?.[name] === undefined ? null : parseMeasure(a[name]!), y = b?.[name] === undefined ? null : parseMeasure(b[name]!);
    if (x === null && y === null) continue;
    if (x === null) return 1;
    if (y === null) return -1;
    const c = compareMagnitude(x.magnitude, y.magnitude);
    if (c) return c;
  }
  return 0;
}
export function rankByMeasures<C extends Claim & {measures?: Measures}>(claims: C[], rankBy: string[]): {claim: C; rank: number; tie: boolean}[] {
  const items = claims.map((claim, index) => ({claim, index}));
  const order = (a: typeof items[number], b: typeof items[number]) => compareMeasures(a.claim.measures, b.claim.measures, rankBy);
  const sorted = [...items].sort((a, b) => order(a, b) || evidenceOrder(b.claim.evidence) - evidenceOrder(a.claim.evidence) || a.index - b.index);
  let rank = 0;
  return sorted.map((item, i) => {
    const tie = i > 0 && order(item, sorted[i - 1]) === 0;
    if (!tie) rank = i + 1;
    return {claim: item.claim, rank, tie};
  });
}
