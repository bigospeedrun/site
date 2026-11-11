import {test} from 'node:test';
import assert from 'node:assert/strict';
import data from './other-bounds.json' with {type: 'json'};
import {otherClaimNumber, parseDegreeClaim, rankOtherClaims} from './other-rank.ts';
import {otherBoundLeader} from './other-leader.ts';

const claim = (display: string, value = display, date = '2026-10-10T00:00:00Z') => ({display, value, date});

test('the number of a claim is read from its display, then from its exact value', () => {
  assert.equal(otherClaimNumber(claim('\\approx6.14\\cdot10^{-11}', '1/2')), 6.14e-11);
  assert.equal(otherClaimNumber(claim('2^{-38}', '2^{-38}')), 2 ** -38);
  assert.equal(otherClaimNumber(claim('\\le0.87488664704', '11/12-\\ell/4')), 0.87488664704);
  assert.equal(otherClaimNumber(claim('10499/12000', '10499/12000')), 10499 / 12000);
  assert.equal(otherClaimNumber(claim('3.762', '1881/500')), 3.762);
  assert.equal(otherClaimNumber(claim('80{,}000d^{17}', '80{,}000d^{17}')), null);
});

test('best first by direction, ties share a rank, earliest first', () => {
  const rows = [claim('3.83', '3.83', '2026-10-09'), claim('3.762', '1881/500', '2026-10-16'), claim('3.762', '1881/500', '2026-10-18'), claim('3.192', '399/125', '2026-10-19')];
  assert.deepEqual(rankOtherClaims(rows, 'lower').map(r => [r.claim.display, r.rank, r.tie]), [['3.192', 1, false], ['3.762', 2, false], ['3.762', 2, true], ['3.83', 4, false]]);
  assert.deepEqual(rankOtherClaims(rows, 'higher').map(r => [r.claim.display, r.rank]), [['3.83', 1], ['3.762', 2], ['3.762', 2], ['3.192', 4]]);
  // Small values keep their precision: 5.107e-10 beats 5.100e-10, which an absolute tolerance would tie.
  const matroid = rankOtherClaims([claim('\\approx5.10\\cdot10^{-10}'), claim('\\approx5.107\\cdot10^{-10}')], 'higher');
  assert.deepEqual(matroid.map(r => [r.claim.display, r.rank]), [['\\approx5.107\\cdot10^{-10}', 1], ['\\approx5.10\\cdot10^{-10}', 2]]);
});

test('a claim whose number cannot be read puts the row newest first', () => {
  const rows = [claim('see the note', 'see the note', '2026-10-01'), claim('also unread', 'also unread', '2026-10-05')];
  assert.deepEqual(rankOtherClaims(rows, 'lower').map(r => [r.claim.display, r.rank, r.tie]), [['also unread', 1, false], ['see the note', 2, false]]);
});

// site#9 (darkhipo; PR #12 was not read, this is our own code): d^p dominates A, so the order is by p, then by A.
test('an A d^p claim is read only from the whole display, A exact', () => {
  assert.deepEqual(parseDegreeClaim('80{,}000d^{17}'), {a: [80000n, 1n], p: 17n});
  assert.deepEqual(parseDegreeClaim('2.5d^{-3}'), {a: [25n, 10n], p: -3n});
  for (const text of [' 80{,}000d^{17}', '80{,}000d^{17} ', '8{,}00d^{17}', 'c80{,}000d^{17}', '80{,}000d^{17}+1', '80,000d^{17}', 'd^{17}', '80{,}000d^17']) assert.equal(parseDegreeClaim(text), null, text);
  assert.equal(otherClaimNumber(claim('80{,}000.5d^{17}')), null);
});

test('A d^p claims are ordered by p, then by A, in the row direction, whatever their dates', () => {
  const a70 = (date: string) => claim('70{,}000d^{17}', '70{,}000d^{17}', date), a80 = (date: string) => claim('80{,}000d^{17}', '80{,}000d^{17}', date);
  for (const [first, second] of [['2026-10-01', '2026-10-05'], ['2026-10-05', '2026-10-01']]) {
    const rows = [a80(first), a70(second)];
    assert.deepEqual(rankOtherClaims(rows, 'lower').map(r => [r.claim.display, r.rank, r.tie]), [['70{,}000d^{17}', 1, false], ['80{,}000d^{17}', 2, false]], first);
    assert.deepEqual(rankOtherClaims(rows, 'higher').map(r => [r.claim.display, r.rank]), [['80{,}000d^{17}', 1], ['70{,}000d^{17}', 2]], first);
  }
  // A smaller exponent beats any constant: 80{,}000d^{17} is above 2d^{18}.
  const rows = [claim('2d^{18}', '2d^{18}', '2026-10-09'), claim('80{,}000d^{17}', '80{,}000d^{17}', '2026-10-08'), claim('98{,}560d^{126}', '98{,}560d^{126}', '2026-10-07')];
  assert.deepEqual(rankOtherClaims(rows, 'lower').map(r => [r.claim.display, r.rank]), [['80{,}000d^{17}', 1], ['2d^{18}', 2], ['98{,}560d^{126}', 3]]);
  // A decimal constant is exact: 2.5d^{3} is above 2.50001d^{3} and ties with 2.50d^{3}.
  const exact = rankOtherClaims([claim('2.50001d^{3}', '', '2026-10-01'), claim('2.5d^{3}', '', '2026-10-02'), claim('2.50d^{3}', '', '2026-10-03')], 'lower');
  assert.deepEqual(exact.map(r => [r.claim.display, r.rank, r.tie]), [['2.5d^{3}', 1, false], ['2.50d^{3}', 1, true], ['2.50001d^{3}', 3, false]]);
});

test('equal A d^p claims tie and share a rank, earliest first', () => {
  const rows = [claim('80{,}000d^{17}', '80{,}000d^{17}', '2026-10-08'), claim('80000d^{17}', '80000d^{17}', '2026-10-12')];
  assert.deepEqual(rankOtherClaims(rows, 'lower').map(r => [r.claim.date, r.rank, r.tie]), [['2026-10-08', 1, false], ['2026-10-12', 1, true]]);
});

test('an A d^p claim mixed with a plain number puts the row newest first', () => {
  const rows = [claim('80{,}000d^{17}', '80{,}000d^{17}', '2026-10-01'), claim('3.762', '1881/500', '2026-10-05'), claim('70{,}000d^{17}', '70{,}000d^{17}', '2026-10-09')];
  assert.deepEqual(rankOtherClaims(rows, 'lower').map(r => [r.claim.display, r.rank, r.tie]), [['70{,}000d^{17}', 1, false], ['3.762', 2, false], ['80{,}000d^{17}', 3, false]]);
});

test('the live contingency tables row keeps its order', () => {
  const family = data.families.find(f => f.slug === 'contingency-tables')!;
  assert.deepEqual(rankOtherClaims(family.claims, family.direction).map(r => [r.claim.display, r.rank, r.tie]), [['80{,}000d^{17}', 1, false]]);
});

// The rule of the rows is that a listed claim was the best when it appeared, and the leader is a row's newest
// claim of its best handle. So the first rank of every row is its leader.
test('on every Other bounds row, rank 1 is the leader', () => {
  for (const family of data.families) {
    const ranked = rankOtherClaims(family.claims, family.direction, (family as {rankBy?: string[]}).rankBy);
    const leader = otherBoundLeader(family)!;
    assert.equal(ranked.length, family.claims.length, family.slug);
    assert.ok(ranked.filter(r => r.rank === 1).some(r => r.claim === leader || (r.claim.value === leader.value && r.claim.handle === leader.handle)), `${family.slug}: rank 1 is not the leader ${leader.value}`);
  }
});

test('claims closer than a float can tell are ordered by their exact fractions', () => {
  const rows = [claim('0.8733819666133', '8733819666133/10000000000000', '2026-10-30'), claim('0.87338196661320752', '5458637291332547/6250000000000000', '2026-10-31'), claim('0.87338196661320751993', '87338196661320751993/100000000000000000000', '2026-10-31T17')];
  assert.deepEqual(rankOtherClaims(rows, 'lower').map(r => [r.claim.display, r.rank, r.tie]), [['0.87338196661320751993', 1, false], ['0.87338196661320752', 2, false], ['0.8733819666133', 3, false]]);
  // Equal exact values still tie, earliest first; a value that disagrees with its display keeps the float order.
  const equal = rankOtherClaims([claim('0.5', '1/2', '2026-10-01'), claim('0.5', '2/4', '2026-10-02')], 'lower');
  assert.deepEqual(equal.map(r => [r.claim.date, r.rank, r.tie]), [['2026-10-01', 1, false], ['2026-10-02', 1, true]]);
  const odd = rankOtherClaims([claim('0.5', '1/3', '2026-10-01'), claim('0.4999999999', '1/2', '2026-10-02')], 'lower');
  assert.deepEqual(odd.map(r => [r.claim.display, r.rank, r.tie]), [['0.5', 1, false], ['0.4999999999', 1, true]]);
});

import {compareMeasures, parseMeasure, rankByMeasures} from './other-rank.ts';
test('a measure is a whole number or a stated upper bound; bounds compare as their value (Nil, 2026-11-06)', () => {
  const lt = (a: string, b: string) => assert.equal(compareMeasures({m: a}, {m: b}, ['m']), -1, `${a} < ${b}`);
  lt('4', '685783949153203534233601'); lt('685783949153203534233601', '<2^80'); lt('<2^80', '<2^(2^45)'); lt('<2^(2^45)', '<2^^7'); lt('<2^^7', '<2^^8');
  lt('12{,}504', '211,983,774,909');
  assert.equal(compareMeasures({m: '<2^80'}, {m: '1208925819614629174706176'}, ['m']), 0, 'an exact value equal to a bound ties with it');
  assert.equal(compareMeasures({m: '<2^(2^45)'}, {m: '<2^(2^45)'}, ['m']), 0);
  assert.equal(compareMeasures({m: '4'}, {}, ['m']), -1, 'a missing measure ranks last');
  assert.equal(compareMeasures({}, {m: '<2^^7'}, ['m']), 1);
  assert.equal(parseMeasure('about 4'), null);
  assert.deepEqual(parseMeasure('<2^^1'), {magnitude: 2n, bound: true});
});
test('a row with rankBy ranks by its measures in order, then evidence level, then the earlier claim', () => {
  const claims = [
    {handle: 'a', display: '1', value: '1', date: '2026-01-01T00:00:00Z', measures: {degree: '<2^^7', variables: '1'}},
    {handle: 'b', display: '2', value: '2', date: '2026-01-02T00:00:00Z', measures: {degree: '4', variables: '2', terms: '9'}},
    {handle: 'c', display: '3', value: '3', date: '2026-01-03T00:00:00Z', measures: {degree: '4', variables: '2'}},
    {handle: 'd', display: '4', value: '4', date: '2026-01-04T00:00:00Z', measures: {degree: '4', variables: '2', terms: '9'}, evidence: 'lean-verified'},
    {handle: 'e', display: '5', value: '5', date: '2026-01-05T00:00:00Z', measures: {degree: '4', variables: '2', terms: '9'}},
  ];
  const ranked = rankByMeasures(claims, ['degree', 'variables', 'terms']);
  assert.deepEqual(ranked.map(r => [r.claim.handle, r.rank, r.tie]), [['d', 1, false], ['b', 1, true], ['e', 1, true], ['c', 4, false], ['a', 5, false]]);
  assert.deepEqual(rankOtherClaims(claims, 'lower', ['degree', 'variables', 'terms']).map(r => r.claim.handle), ['d', 'b', 'e', 'c', 'a']);
  assert.deepEqual(rankOtherClaims(claims, 'lower').map(r => r.claim.handle), ['a', 'b', 'c', 'd', 'e'], 'without rankBy the display number ranks');
});
test('a measure A*B^(X) in another base compares by its size in bits (the 64*3^(2^28) coefficient height)', () => {
  const lt = (a: string, b: string) => assert.equal(compareMeasures({m: a}, {m: b}, ['m']), -1, `${a} < ${b}`);
  lt('<2^80', '<2^9566673'); lt('<2^9566673', '64*3^(2^28)'); lt('64*3^(2^28)', '<2^(2^45)'); lt('<2^(2^86098382)', '<2^^7');
  assert.equal(compareMeasures({m: '64*3^(2^28)'}, {m: '64*3^(2^28)'}, ['m']), 0);
  assert.deepEqual(parseMeasure('3^(4)'), {magnitude: 81n, bound: false});
  assert.deepEqual(parseMeasure('5*2^(3)'), {magnitude: 40n, bound: false});
});
test('Z is Diophantine in Q with the claims of 2026-11-06 to 2026-11-10: quartics by variables, then the rest by degree bound', () => {
  const f = data.families.find(x => x.slug === 'z-diophantine-in-q')! as any;
  assert.deepEqual(rankOtherClaims(f.claims as {handle: string; display: string; value: string; date: string}[], f.direction, f.rankBy).map(r => [r.claim.handle, r.rank]),
    [['josebrox-262', 1], ['josebrox-265', 2], ['z-in-q-version-14', 3], ['z-in-q-version-14-decimal', 4], ['josebrox-322', 5], ['josebrox-342', 6], ['josebrox-351', 7], ['josebrox-370', 8], ['josebrox-389', 9], ['josebrox-392', 10], ['z-in-q-version-13', 11], ['josebrox-456', 12], ['z-in-q-version-9', 13], ['z-in-q-version-6', 14], ['z-in-q-version-5', 15], ['josebrox-1315', 16], ['z-in-q-version-4', 17], ['z-in-q-version-3', 18], ['z-in-q-version-2', 19], ['josebrox-27-l20483', 20], ['josebrox-27', 21], ['josebrox-29-degree89', 22], ['josebrox-29-degree157', 23], ['josebrox-29-degree161', 24], ['josebrox-29-degree166', 25], ['josebrox-29-degree174', 26], ['josebrox-31', 27], ['josebrox-43', 28], ['josebrox-41', 29], ['qqwref', 30], ['elliotglazer', 31]]);
  assert.equal(otherBoundLeader(f)!.handle, 'josebrox-262');
});

import {compareExactValues, parseExact, shownBound} from './other-rank.ts';
// Lead, 2026-11-11, quasi-Riemann #129: Joe Richey's exact contact point B2 = (777-sqrt(1081))/852 is about 2.16e-254 below
// #103's bound T, the closest 256-character fraction above it. Both show the same 30 decimals.
const T = '2804966284017490358030969257914123810640482798488248385236764587735806455694206308975383836842958115341512355256943573632654341/3211614609922119834694179379888743028634953588197852962423516288191911449231164741438582626063161096341458934143644085157872271';
const B2 = '\\frac{777-\\sqrt{1081}}{852}';
test('a \\frac{a\\pm b\\sqrt{c}}{d} value compares exactly with a fraction and with another such value', () => {
  const x = (v: string) => parseExact(v)!;
  assert.deepEqual(x(B2), {a: 777n, b: -1n, c: 1081n, d: 852n});
  assert.deepEqual(x('\\frac{75+3\\sqrt{1081}}{852}'), {a: 75n, b: 3n, c: 1081n, d: 852n});
  assert.deepEqual(x('7/8'), {a: 7n, b: 0n, c: 0n, d: 8n});
  for (const bad of ['\\frac{777-\\sqrt{1081}}{0}', '1/0', '\\sqrt{2}', '\\frac{1}{\\sqrt2}', '777-\\sqrt{1081}/852']) assert.equal(parseExact(bad), null, bad);
  assert.equal(compareExactValues(x(B2), x(T)), -1, 'B2 is below T');
  assert.equal(compareExactValues(x(T), x(B2)), 1);
  // Equal values in other forms tie: a scaled surd, and a surd of a square against its fraction.
  assert.equal(compareExactValues(x(B2), x('\\frac{1554-2\\sqrt{1081}}{1704}')), 0);
  assert.equal(compareExactValues(x('\\frac{2+\\sqrt{4}}{2}'), x('2')), 0);
  assert.equal(compareExactValues(x('\\frac{1+\\sqrt{2}}{1}'), x('\\frac{0+1\\sqrt{8}}{2}')), 1, '1+sqrt2 > sqrt2');
  assert.equal(compareExactValues(x('\\frac{0+\\sqrt{2}}{1}'), x('\\frac{0+1\\sqrt{8}}{2}')), 0, 'sqrt2 = sqrt8/2');
  assert.equal(compareExactValues(x('\\frac{3-\\sqrt{2}}{1}'), x('\\frac{0+\\sqrt{3}}{1}')), -1, '3-sqrt2 < sqrt3');
  // Transitive and antisymmetric on a mixed set (checked against a 60-digit decimal order).
  const values = [B2, T, '\\frac{1554-2\\sqrt{1081}}{1704}', '8733819666132075/10000000000000000', '8733819666132076/10000000000000000', '\\frac{75+\\sqrt{1081}}{852}', '1/2', '\\frac{1+\\sqrt{2}}{3}', '\\frac{5-\\sqrt{3}}{4}', '4/5'];
  for (const a of values) for (const b of values) {
    assert.equal(compareExactValues(x(a), x(b)) + compareExactValues(x(b), x(a)), 0);
    for (const c of values) if (compareExactValues(x(a), x(b)) <= 0 && compareExactValues(x(b), x(c)) <= 0) assert.ok(compareExactValues(x(a), x(c)) <= 0, `${a} ${b} ${c}`);
  }
});

test('#129 ranks above #103 on the quasi-Riemann row, and equal exact values tie', () => {
  const rows = [claim('0.873381966613207519929026778643', T, '2026-11-01'), claim('0.873381966613207519929026778643', B2, '2026-11-10'), claim('\\approx0.874957019420099', '\\sigma^{\\dagger}', '2024-01-01')];
  assert.deepEqual(rankOtherClaims(rows, 'lower').map(r => [r.claim.value, r.rank, r.tie]), [[B2, 1, false], [T, 2, false], ['\\sigma^{\\dagger}', 3, false]]);
  const equal = rankOtherClaims([claim('0.8733819666', B2, '2026-11-10'), claim('0.8733819666', '\\frac{1554-2\\sqrt{1081}}{1704}', '2026-11-11')], 'lower');
  assert.deepEqual(equal.map(r => [r.claim.date, r.rank, r.tie]), [['2026-11-10', 1, false], ['2026-11-11', 1, true]]);
  // A surd that disagrees with its display is not read: the claim ranks by its display.
  assert.deepEqual(rankOtherClaims([claim('0.9', B2, '2026-11-10'), claim('0.88', '22/25', '2026-11-11')], 'lower').map(r => r.claim.display), ['0.88', '0.9']);
});

test('a row cell shows a surd value before its decimal display; other claims show their display', () => {
  assert.equal(shownBound(claim('0.873381966613207519929026778643', B2)), B2 + '\\approx0.873381966613207519929026778643');
  assert.equal(shownBound(claim('0.873381966613207519929026778643', T)), '0.873381966613207519929026778643');
  assert.equal(shownBound(claim('\\le0.87488664704', '11/12-\\ell/4')), '\\le0.87488664704');
  assert.equal(shownBound(claim('2', '\\frac{2+\\sqrt{4}}{2}')), '2');
});
