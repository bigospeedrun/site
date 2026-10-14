import {test} from 'node:test';
import assert from 'node:assert/strict';
import {boundPrecision, tableBound, displayDigits, compare} from './ranking.ts';
import {plainBound} from './records-feed.ts';

// Significant digits in the varying part of a shown bound: the kappa mantissa, or the exponent.
const kappaDigits = (bound: string) => bound.match(/\\log\^\{1-([0-9.]+)/)![1].replace('.', '').replace(/^0+/, '').length;
const exponentDigits = (bound: string) => bound.match(/\^\{([0-9.]+)/)![1].replace('.', '').replace(/^0+/, '').length;
// Two kappa scores that agree in their first 118 significant digits, like CrocSwap PR #1485 and #1601.
const longA = '16313261169996311316775735273141368889252910645' + '1'.repeat(150) + '/1' + '0'.repeat(200);
const longB = '16313261169996311316775735273141368889252910645' + '1'.repeat(150) + '2/1' + '0'.repeat(201);
const kappa = (score: string, digits: number, cap?: number) => tableBound({score, bound: 'O(n \\log^{1-\\kappa} n)'}, true, digits, cap);

test('long exact scores are capped at 20 significant digits in tables and 10 on the landing page', () => {
 assert.ok(longA.length > 190 && compare(longA, longB) !== 0);
 const digits = boundPrecision([longA, longB, '1/1000'], true);
 assert.equal(digits, displayDigits.table);
 assert.equal(kappaDigits(kappa(longA, digits)), 20);
 assert.equal(kappaDigits(kappa(longA, digits, displayDigits.landing)), 10);
 assert.ok(kappa(longA, digits).length < 80);
});

test('scores that agree up to the cap show the same label, and short boards keep short labels', () => {
 const digits = boundPrecision([longA, longB], true);
 assert.equal(kappa(longA, digits), kappa(longB, digits));
 assert.equal(kappa(longA, digits, displayDigits.landing), kappa(longB, digits, displayDigits.landing));
 // Distinct short scores still get the fewest digits that separate them.
 assert.equal(boundPrecision(['1/1000', '2/1000'], true), 3);
 assert.equal(boundPrecision(['12345/10000000', '12346/10000000'], true), 5);
});

test('a capped label never claims a stronger bound than the exact score', () => {
 // Kappa is a saving: its shown value rounds down.
 const shown = kappa('2/3', 20);
 assert.match(shown, /1-6\.6666666666666666666\\cdot 10\^\{\\scriptstyle -1\}/);
 // An exponent rounds up; a short exact exponent or fraction stays exact.
 const exponent = (score: string, cap?: number) => tableBound({score, bound: 'O(n^{2})'}, false, 0, cap);
 assert.equal(exponent('981/500'), 'O(n^{1.962})');
 assert.equal(exponent('7/3'), 'O(n^{\\frac{7}{3}})');
 const long = '2' + '3'.repeat(40) + '1/' + '1' + '0'.repeat(41);
 assert.equal(exponentDigits(exponent(long)), 20);
 assert.equal(exponent(long), 'O(n^{2.3333333333333333334})');
 assert.equal(exponent(long, displayDigits.landing), 'O(n^{2.333333334})');
 const longFraction = '7' + '0'.repeat(30) + '1/3' + '0'.repeat(30);
 assert.equal(exponentDigits(exponent(longFraction)), 20);
});

test('posts use the same cap', () => {
 const digits = boundPrecision([longA, longB], true);
 const post = plainBound('integer-multiplication', longA, 'attained', digits);
 assert.equal(post, 'O(n log^(1 - 0.00016313261169996311316) n)');
 assert.equal(boundPrecision([longA], true), 3);
});
