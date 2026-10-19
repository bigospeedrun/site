import {test} from 'node:test';
import assert from 'node:assert/strict';
import data from './other-bounds.json' with {type: 'json'};
import {otherClaimNumber, rankOtherClaims} from './other-rank.ts';
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

// The rule of the rows is that a listed claim was the best when it appeared, and the leader is a row's newest
// claim of its best handle. So the first rank of every row is its leader.
test('on every Other bounds row, rank 1 is the leader', () => {
  for (const family of data.families) {
    const ranked = rankOtherClaims(family.claims, family.direction);
    const leader = otherBoundLeader(family)!;
    assert.equal(ranked.length, family.claims.length, family.slug);
    assert.ok(ranked.filter(r => r.rank === 1).some(r => r.claim === leader || (r.claim.value === leader.value && r.claim.handle === leader.handle)), `${family.slug}: rank 1 is not the leader ${leader.value}`);
  }
});
