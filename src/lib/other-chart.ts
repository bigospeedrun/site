// The record chart of an Other bounds page (Nil, 2026-11-04: "Snaky should have a plot like big O bounds"): the chart
// of the Big O boards (chart.ts), drawn from the rows of the table. A page gets one only when every row of its table has
// a number that the ranking reads (other-rank.ts otherClaimNumber), and a Classic baseline has one too: a value such
// as +\infty, \log(20)/784 or A d^p has no point on an axis. Each point carries an exact score, so the chart ranks
// by the rules of the Big O boards (ranking.ts), which give the order of the table for the same numbers.
import {initials} from './avatars.ts';
import {otherClaimNumber, compareMeasures, parseExact, exactNumber, type Measures} from './other-rank.ts';
import {otherTableRows, isTableBreakthrough, isClassicBaseline, shownLevel} from './other-table.ts';
import type {ChartEntry} from './chart.ts';

type Author = {name: string; avatar?: string};
type Claim = {handle: string; display: string; value: string; bound: string; date: string; dateKind?: string; url: string; measures?: Measures;
  evidence?: string; agent?: boolean; authors: Author[]};
type Family = {direction: string; claims: Claim[]; rankBy?: string[];
  baseline?: {label?: string; value: string; display?: string; exactValue: string; bound: string; url: string; date: string}};

const fraction = (text: string) => /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(text);
const whole = (text: string) => /^\s*(\d+)\s*$/.exec(text);

// The number as an exact score "n" or "n/d": the shortest decimal that gives the same float.
export function exactScore(value: number): string {
  const [mantissa, exponent] = value.toExponential().split('e');
  const sign = mantissa.startsWith('-') ? '-' : '';
  const [int, frac = ''] = mantissa.replace('-', '').split('.');
  const shift = Number(exponent) - frac.length;
  const digits = BigInt(int + frac);
  return shift >= 0 ? sign + (digits * 10n ** BigInt(shift)) : sign + digits + '/' + 10n ** BigInt(-shift);
}

// floor(sqrt(n)) for n >= 0.
function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  // Newton from 2^ceil(bits/2) >= sqrt(n) decreases to floor(sqrt(n)).
  let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2));
  for (;;) { const y = (x + n / x) / 2n; if (y >= x) return x; x = y; }
}
// A (a + b sqrt(c)) / d value (other-rank.ts parseExact) as a fraction with SURD_DIGITS decimals, rounded down. Quasi-Riemann
// #129 (Lead, 2026-11-11) is 2.16e-254 below #103's fraction, so a float score would chart it as the same value.
const SURD_DIGITS = 300;
export function surdScore(x: {a: bigint; b: bigint; c: bigint; d: bigint}): string {
  const scale = 10n ** BigInt(SURD_DIGITS);
  // b sqrt(c) * scale = sign(b) sqrt(b^2 c scale^2): its floor for b > 0, its ceiling for b < 0 (subtracted).
  const root = isqrt(x.b * x.b * x.c * scale * scale);
  const exactRoot = root * root === x.b * x.b * x.c * scale * scale;
  const term = x.b >= 0n ? root : -(exactRoot ? root : root + 1n);
  const numerator = x.a * scale + term;
  const q = numerator >= 0n ? numerator / x.d : -((-numerator + x.d - 1n) / x.d);
  return q + '/' + scale;
}

// The score of a row: its exact fraction or integer when that agrees with the number the ranking reads, a surd as
// surdScore, else that number. Null when the ranking reads no number.
export function claimScore(claim: Pick<Claim, 'display' | 'value'>): string | null {
  const number = otherClaimNumber(claim);
  if (number === null || !Number.isFinite(number)) return null;
  const exact = fraction(claim.value);
  if (exact && BigInt(exact[2]) !== 0n && Math.abs(Number(exact[1]) / Number(exact[2]) - number) <= 1e-6 * Math.abs(number)) return exact[1] + '/' + exact[2];
  const integer = whole(claim.value);
  if (integer && Number(integer[1]) === number) return integer[1];
  const surd = parseExact(claim.value);
  if (surd && surd.c !== 0n && surd.b !== 0n && Math.abs(exactNumber(surd) - number) <= 1e-6 * Math.abs(number)) return surdScore(surd);
  return exactScore(number);
}

// The classic bound for the dashed line, or undefined for a row whose baseline is OpenAI's release (it is a row).
const classicNumber = (baseline: NonNullable<Family['baseline']>) => otherClaimNumber({display: baseline.display ?? baseline.value, value: baseline.exactValue});

// `integer`: every point and the classic bound are whole numbers, so the axis shows whole-number ticks only.
// A unique id per table row. One author has several rows (one handle), and chartRecords starts a new step only when
// the id changes, so the handle alone would drop a step where an author beats their own row. The id is the handle and
// the exact value, as in records-feed.ts; a second row with both the same also gets its place in the table.
export function otherChartIds(rows: Pick<Claim, 'handle' | 'value'>[]): string[] {
  const seen = new Set<string>();
  return rows.map((claim, i) => {
    const id = claim.handle + ':' + claim.value;
    const unique = seen.has(id) ? id + '#' + i : id;
    seen.add(unique);
    return unique;
  });
}

export type OtherChart = {entries: ChartEntry[]; higher: boolean; classic?: number; classicBound?: string; omitted: number; integer: boolean};

// The chart of a page, or undefined when a row has no number. `reviewed` says whether a claim's review pull request
// is known (the page's Human Verified link), as for the level the table shows; `render` makes the HTML of a bound.
// A row dated by a snapshot (the day we read it) stays in the table only, as an Observed date on the Big O boards.
export function otherChart(family: Family, reviewed: (claim: object) => boolean, render: (tex: string) => string = tex => tex): OtherChart | undefined {
  // A row ranked by measures (rankBy) charts its one number only for the claims that share the leader's first
  // measure (Z in Q: the degree-4 results), plus its Agent breakthrough row, so the chart ends at the table's first row at
  // every set of evidence levels, as on every page.
  const all = otherTableRows(family).map(r => r.claim);
  const rows = family.rankBy?.length && all.length ? all.filter(c => isTableBreakthrough(family as never, c) || compareMeasures((c as Claim).measures, (all[0] as Claim).measures, family.rankBy!.slice(0, 1)) === 0) : all;
  const scores = rows.map(claimScore);
  const ids = otherChartIds(rows);
  if (!rows.length || scores.some(s => s === null)) return undefined;
  const classic = family.baseline && isClassicBaseline(family.baseline) ? classicNumber(family.baseline) : undefined;
  if (isClassicBaseline(family.baseline) && (classic === null || classic === undefined)) return undefined;
  const entries = rows.flatMap((claim, i): ChartEntry[] => {
    if (claim.dateKind === 'snapshot') return [];
    const author = claim.authors[0] as Author | undefined;
    const date = new Date(claim.date).toISOString();
    return [{id: ids[i], repoId: i, score: scores[i]!, level: shownLevel(claim, reviewed(claim)), time: Date.parse(date), date,
      author: claim.authors.map(a => a.name).join(', '), boundHtml: render(claim.bound), url: claim.url,
      isBreakthrough: isTableBreakthrough(family as never, claim), avatar: author?.avatar, initials: initials(author?.name ?? '')}];
  });
  return {entries, higher: family.direction === 'higher', classic: classic ?? undefined,
    classicBound: classic === undefined ? undefined : family.baseline?.bound, omitted: rows.length - entries.length,
    integer: entries.every(e => /^\d+$/.test(e.score)) && (classic === undefined || classic === null || Number.isInteger(classic))};
}
