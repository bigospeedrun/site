import {test} from 'node:test';
import assert from 'node:assert/strict';
import data from './other-bounds.json' with {type: 'json'};
import {otherBoundLeader} from './other-leader.ts';
import {createKnowledge} from './chat-knowledge.ts';

type Rational = {n: bigint; d: bigint};
const gcd = (a: bigint, b: bigint): bigint => b ? gcd(b, a % b) : (a < 0n ? -a : a);
const make = (n: bigint, d: bigint): Rational => { if (!d) throw new Error('zero'); const g = gcd(n, d) * (d < 0n ? -1n : 1n); return {n: n / g, d: d / g}; };
const compare = (a: Rational, b: Rational) => Math.sign(Number(a.n * b.d - b.n * a.d));

// Parse an exact TeX number: integers, decimals, {,} separators, + - \cdot /,
// parentheses and integer powers. Anything else (symbols, roots, "=") is not exact.
export function exactValue(tex: string): Rational | null {
  const s = tex.replace(/\{,\}/g, '').replace(/\s+/g, '');
  let i = 0;
  const eat = (token: string) => s.startsWith(token, i) ? (i += token.length, true) : false;
  const expr = (): Rational => {
    let value = term();
    for (;;) {
      if (eat('+')) { const t = term(); value = make(value.n * t.d + t.n * value.d, value.d * t.d); }
      else if (eat('-')) { const t = term(); value = make(value.n * t.d - t.n * value.d, value.d * t.d); }
      else return value;
    }
  };
  const term = (): Rational => {
    let value = power();
    for (;;) {
      if (eat('\\cdot') || eat('*')) { const p = power(); value = make(value.n * p.n, value.d * p.d); }
      else if (eat('/')) { const p = power(); value = make(value.n * p.d, value.d * p.n); }
      else return value;
    }
  };
  const power = (): Rational => {
    const base = primary();
    if (!eat('^')) return base;
    const braced = eat('{');
    const match = /^-?\d+/.exec(s.slice(i));
    if (!match || (!braced && match[0].length > 1)) throw new Error('exponent');
    i += match[0].length;
    if (braced && !eat('}')) throw new Error('exponent');
    const e = BigInt(match[0]), k = e < 0n ? -e : e;
    const value = make(base.n ** k, base.d ** k);
    return e < 0n ? make(value.d, value.n) : value;
  };
  const primary = (): Rational => {
    if (eat('-')) { const p = primary(); return make(-p.n, p.d); }
    if (eat('(')) { const value = expr(); if (!eat(')')) throw new Error(')'); return value; }
    if (eat('{')) { const value = expr(); if (!eat('}')) throw new Error('}'); return value; }
    const match = /^(\d+)(?:\.(\d+))?/.exec(s.slice(i));
    if (!match) throw new Error('number');
    i += match[0].length;
    const fraction = match[2] ?? '';
    return make(BigInt(match[1] + fraction), 10n ** BigInt(fraction.length));
  };
  try { const value = expr(); return i === s.length ? value : null; } catch { return null; }
}

// A leader whose exact value has a symbol uses its displayed bound, such as
// \le0.87488664704. Other claims are compared only when exact.
const displayed = (tex: string) => exactValue(tex.replace(/^(\\le|\\approx|<)/, ''));

test('exact TeX values parse, and symbolic values do not', () => {
  assert.deepEqual(exactValue('1/(498\\cdot379^{17}+7)'), make(1n, 498n * 379n ** 17n + 7n));
  assert.deepEqual(exactValue('2^{-38}'), make(1n, 2n ** 38n));
  assert.deepEqual(exactValue('3.83'), make(383n, 100n));
  assert.deepEqual(exactValue('80{,}000'), make(80000n, 1n));
  for (const tex of ['\\sigma^{\\dagger}', '11/12-\\ell/4', '8\\cdot4=32', '80{,}000d^{17}', '+\\infty']) assert.equal(exactValue(tex), null, tex);
});

test('every Other bounds row shows its best claim by the row direction', () => {
  const chatRows = createKnowledge([], '', undefined, data).otherBounds.rows;
  for (const row of data.families) {
    const leader = otherBoundLeader(row);
    assert.ok(leader, row.slug);
    // findLast relies on date order: the best author's claims need distinct dates.
    const dates = row.claims.filter(c => c.handle === row.bestHandle).map(c => Date.parse(c.date));
    assert.equal(new Set(dates).size, dates.length, `${row.slug}: two ${row.bestHandle} claims share a date`);
    assert.equal(Date.parse(leader.date), Math.max(...dates), `${row.slug}: leader is not the newest ${row.bestHandle} claim`);
    const best = exactValue(leader.value) ?? displayed(leader.display);
    for (const claim of row.claims) {
      const value = exactValue(claim.value);
      if (!value || claim === leader) continue;
      // An exact rival needs a leader value to compare against.
      assert.ok(best, `${row.slug}: leader ${leader.value} does not parse, so it cannot be compared with ${claim.value}`);
      const order = compare(value, best) * (row.direction === 'higher' ? 1 : -1);
      assert.ok(order <= 0, `${row.slug}: ${claim.handle} ${claim.value} beats the shown leader ${leader.value}`);
    }
    assert.equal(chatRows.find(r => r.path === '/other/' + row.slug)?.current.bound, leader.bound, `${row.slug}: chat leader`);
  }
});
