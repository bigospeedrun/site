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
    [['josebrox-262', 1], ['z-in-q-version-14', 2], ['z-in-q-version-14-decimal', 3], ['z-in-q-version-6', 4], ['z-in-q-version-5', 5], ['josebrox-1315', 6], ['z-in-q-version-4', 7], ['z-in-q-version-3', 8], ['z-in-q-version-2', 9], ['josebrox-41', 10], ['qqwref', 11], ['elliotglazer', 12]]);
  assert.equal(otherBoundLeader(f)!.handle, 'josebrox-262');
});
