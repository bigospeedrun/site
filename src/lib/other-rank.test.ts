import {test} from 'node:test';
import assert from 'node:assert/strict';
import data from './other-bounds.json' with {type: 'json'};
import {isCanonicalRationalScore, otherClaimNumber, rankOtherClaims} from './other-rank.ts';
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
  const rows = [claim('80{,}000d^{17}', '80{,}000d^{17}', '2026-10-01'), claim('70{,}000d^{17}', '70{,}000d^{17}', '2026-10-05')];
  assert.deepEqual(rankOtherClaims(rows, 'lower').map(r => [r.claim.display, r.rank, r.tie]), [['70{,}000d^{17}', 1, false], ['80{,}000d^{17}', 2, false]]);
});

test('exact-score rows rank canonical rationals instead of rounded displays', () => {
  const rows = [claim('same rounded label', '1/1000000000000001'), claim('same rounded label', '1/1000000000000000')];
  assert.deepEqual(rankOtherClaims(rows, 'higher', true).map(r => [r.claim.value, r.rank]), [
    ['1/1000000000000000', 1], ['1/1000000000000001', 2],
  ]);
  assert.deepEqual(rankOtherClaims(rows, 'lower', true).map(r => r.claim.value), ['1/1000000000000001', '1/1000000000000000']);
  const tiny = [claim('2^{-39}', '1/549755813888'), claim('2^{-38}', '1/274877906944')];
  assert.deepEqual(rankOtherClaims(tiny, 'higher', true).map(r => [r.claim.value, r.rank]), [
    ['1/274877906944', 1], ['1/549755813888', 2],
  ]);
});

test('exact-score ties require equality of the rationals and retain the earliest date', () => {
  const later = claim('different display', '1/274877906944', '2026-10-12');
  const earlier = claim('2^{-38}', '1/274877906944', '2026-10-10');
  assert.deepEqual(rankOtherClaims([later, earlier], 'higher', true).map(r => [r.claim.date, r.rank, r.tie]), [
    ['2026-10-10', 1, false], ['2026-10-12', 1, true],
  ]);
  const utcLater = claim('same', '1/2', '2026-10-10T01:00:00Z');
  const offsetEarlier = claim('same', '1/2', '2026-10-10T02:00:00+02:00');
  assert.equal(rankOtherClaims([utcLater, offsetEarlier], 'higher', true)[0].claim, offsetEarlier);
});

test('exact-score rows reject invalid or noncanonical rationals without display fallback', () => {
  for (const score of ['0', '1', '-1', '1/274877906944', '-1/2']) assert.ok(isCanonicalRationalScore(score), score);
  for (const score of ['2^{-38}', '0.5', '2/4', '1/1', '0/2', '-0', '01', '1/0', '1/-2', '1/02', ' 1/2', '+1']) {
    assert.equal(isCanonicalRationalScore(score), false, score);
    assert.throws(() => rankOtherClaims([claim('999.9', score)], 'higher', true), /canonical rational/, score);
  }
});

// The rule of the rows is that a listed claim was the best when it appeared, and the leader is a row's newest
// claim of its best handle. So the first rank of every row is its leader.
test('on every Other bounds row, rank 1 is the leader', () => {
  for (const family of data.families) {
    const ranked = rankOtherClaims(family.claims, family.direction, 'exactScores' in family && family.exactScores === true);
    const leader = otherBoundLeader(family)!;
    assert.equal(ranked.length, family.claims.length, family.slug);
    assert.ok(ranked.filter(r => r.rank === 1).some(r => r.claim === leader || (r.claim.value === leader.value && r.claim.handle === leader.handle)), `${family.slug}: rank 1 is not the leader ${leader.value}`);
  }
});
