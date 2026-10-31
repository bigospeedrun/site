import {test} from 'node:test';
import assert from 'node:assert/strict';
import data from './other-bounds.json' with {type: 'json'};
import {boardUrl} from './board.ts';
import {rankOtherClaims} from './other-rank.ts';
import {classifyOtherEvidence} from './evidence.ts';
import {sitemapPaths} from './seo.ts';

const row = data.families.find(f => f.slug === 'binary-polynomial-multiplication')!;

test('binary race retains the unscored historical benchmark and one board', () => {
  assert.ok(row);
  assert.equal(row.baseline.label, 'Historical benchmark');
  assert.equal(row.baseline.value, 'O(n\\log n\\,4^{\\log^*n})');
  assert.equal(row.baseline.date, '2019');
  assert.equal(row.baseline.datePrecision, 'year');
  assert.equal(row.family, undefined);
  assert.equal(boardUrl('other-' + row.slug), 'https://board.bigospeedrun.com/other-binary-polynomial-multiplication');
  assert.equal(sitemapPaths.filter(path => path === '/other/' + row.slug).length, 1);
});

test('binary saving is exact and does not inherit verification from odd finite checks', () => {
  assert.equal(row.exactScores, true);
  assert.equal(row.claims.length, 1);
  const claim = rankOtherClaims(row.claims, row.direction, true)[0].claim;
  assert.equal(claim.value, '1/274877906944');
  assert.equal(274877906944n, 2n ** 38n);
  assert.equal(claim.lean, false);
  assert.equal(claim.evidence, 'claimed');
  assert.equal(classifyOtherEvidence(undefined, claim), 'claimed');
  assert.match(claim.proofScope, /does not verify this binary multiplier/);
  assert.match(claim.url, /fb94421e3e6d9f8348a6e5b963b5a62d9c525e95\/papers\/03-best-binary\/paper\.pdf$/);
  assert.equal(claim.dateKind, 'snapshot');
});
