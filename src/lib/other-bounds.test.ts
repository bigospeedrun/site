import {test} from 'node:test';
import assert from 'node:assert/strict';
import data from './other-bounds.json' with {type: 'json'};
import {applyReviews} from './other-merge.ts';
import {classifyOtherEvidence, otherReviewPrUrl, type OtherClaimReview, type OtherReviewRepository} from './evidence.ts';

// Other bounds pages render these texts with inlineMath through set:html.
// inlineMath escapes only the math, so plain text must not hold HTML.
export const unsafeOutsideMath = (text: string) =>
  text.replace(/\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/g, '').match(/[<>&]/g) ?? [];

test('notes, proof scopes and statements hold no <, > or & outside math', () => {
  assert.deepEqual(unsafeOutsideMath('\\(\\mu(G)<2715\\) and \\[a>b\\]'), []);
  assert.deepEqual(unsafeOutsideMath('a < b \\(c\\) & d'), ['<', '&']);
  assert.deepEqual(unsafeOutsideMath('\\(open < math'), ['<']);
  for (const row of data.families) {
    const texts: [string, string][] = [
      [`${row.slug} statement`, row.statement],
      ...('note' in row ? [[`${row.slug} note`, row.note?.text ?? ""] as [string, string]] : []),
      ...('closedStatus' in row ? [[`${row.slug} closed status`, row.closedStatus?.text ?? ''] as [string, string]] : []),
      ...row.claims.map((c): [string, string] => [`${row.slug} claim ${c.handle} ${c.date} note`, c.note]),
      ...row.claims.map((c): [string, string] => [`${row.slug} claim ${c.handle} ${c.date} proof scope`, c.proofScope]),
      ...row.repos.map((r): [string, string] => [`${row.slug} repo ${r.name} note`, 'note' in r ? String(r.note ?? '') : '']),
    ];
    for (const [where, text] of texts) assert.deepEqual(unsafeOutsideMath(text), [], where);
  }
});

// A row's review repository decides Human Verified: the data holds the pull request and its status,
// and the stored evidence level must be what classifyOtherEvidence derives from it.
const reviewed = data.families as {slug: string; reviewRepository?: OtherReviewRepository;
  claims: {handle: string; evidence: string; dateSource: string; review?: OtherClaimReview}[]}[];
test('only a row with a review repository has reviews; the stored evidence matches the review', () => {
  for (const row of reviewed) {
    for (const c of row.claims) {
      const where = `${row.slug} ${c.handle}`;
      assert.equal(c.evidence, classifyOtherEvidence(row.reviewRepository, c), `${where}: evidence is not the derived level`);
      if (!c.review) continue;
      assert.ok(row.reviewRepository, `${where}: review without a review repository`);
      assert.ok(Number.isInteger(c.review.pr) && c.review.pr > 0, `${where}: review pull request number`);
      assert.ok(['open', 'merged', 'closed'].includes(c.review.status), `${where}: review status`);
      // A claim that dates from a pull request of the review repository reviews that pull request.
      const dated = c.dateSource.startsWith(row.reviewRepository.url + '/pull/');
      if (dated) assert.equal(c.dateSource, otherReviewPrUrl(row.reviewRepository, c.review), `${where}: dateSource and review differ`);
    }
  }
});
test('the quasi-Riemann row reviews through GTimG/QuasiRiemannTracker: merged pull requests are Human Verified, the open one is Claimed', () => {
  const row = reviewed.find(r => r.slug === 'quasi-riemann')!;
  assert.equal(row.reviewRepository?.name, 'GTimG/QuasiRiemannTracker');
  assert.equal(reviewed.filter(r => r.reviewRepository).length, 1);
  const by = (pr: number) => row.claims.find(c => c.review?.pr === pr)!;
  for (const pr of [62, 63, 66]) { assert.equal(by(pr).review!.status, 'merged', `#${pr}`); assert.equal(by(pr).evidence, 'human-verified', `#${pr}`); }
  assert.equal(by(67).review!.status, 'open'); assert.equal(by(67).evidence, 'claimed');
  // A claim from a repository outside the tracker has no review.
  assert.equal(row.claims.find(c => c.handle === 'aster2024')!.review, undefined);
  assert.equal(row.claims.find(c => c.handle === 'aster2024')!.evidence, 'claimed');
});
test('applyReviews derives the level from the review and leaves other rows as they are', () => {
  const repo = {name: 'o/r', url: 'https://github.com/o/r'};
  const out = applyReviews({families: [
    {reviewRepository: repo, claims: [{evidence: 'claimed', review: {pr: 1, status: 'merged' as const}}, {evidence: 'claimed', review: {pr: 2, status: 'open' as const}}, {evidence: 'lean-verified'}]},
    {claims: [{evidence: 'claimed', review: {pr: 3, status: 'merged' as const}}]}]});
  assert.deepEqual(out.families.map(f => f.claims.map(c => c.evidence)), [['human-verified', 'claimed', 'lean-verified'], ['claimed']]);
});

test('a status read from GitHub replaces the stored status of a pull request that is not merged yet', () => {
  const repo = {name: 'o/r', url: 'https://github.com/o/r'};
  const rows = {families: [{slug: 'row', reviewRepository: repo, claims: [
    {evidence: 'claimed', review: {pr: 1, status: 'open'}}, {evidence: 'claimed', review: {pr: 2, status: 'open'}},
    {evidence: 'human-verified', review: {pr: 3, status: 'merged'}}, {evidence: 'claimed'}]}]};
  const levels = (state: Parameters<typeof applyReviews>[1]) => applyReviews(rows, state).families[0].claims.map(c => c.evidence);
  assert.deepEqual(levels(undefined), ['claimed', 'claimed', 'human-verified', 'claimed']);
  assert.deepEqual(levels({rows: {row: {'1': {status: 'merged'}}}}), ['human-verified', 'claimed', 'human-verified', 'claimed']);
  // A closed pull request stays Claimed; a merged one is final even if a stale read says open; other rows are not touched.
  assert.deepEqual(levels({rows: {row: {'2': {status: 'closed'}, '3': {status: 'open'}}, other: {'1': {status: 'merged'}}}}), ['claimed', 'claimed', 'human-verified', 'claimed']);
  assert.equal(applyReviews(rows, {rows: {row: {'1': {status: 'merged'}}}}).families[0].claims[0].review!.status, 'merged');
});
test('the claims in other-bounds.json hold no status text that a merge would make stale', () => {
  for (const row of reviewed) for (const c of row.claims.filter(c => c.review?.status === 'open')) {
    const text = JSON.stringify(c);
    assert.doesNotMatch(text, /Open PR|is still open|had not finished/i, `${row.slug} ${c.handle}`);
  }
});

// A closed race (Nil, 2026-11-20) shows a status line under its title. Only Quasi-Riemann is closed, and it stays true
// only while its best claim is the exact bound the line names: the line says theta = 1/2 is the best possible value.
test('only Quasi-Riemann has a closed status, and its best claim is exactly 1/2', () => {
  const closed = data.families.filter(f => 'closedStatus' in f).map(f => f.slug);
  assert.deepEqual(closed, ['quasi-riemann']);
  const row = data.families.find(f => f.slug === 'quasi-riemann')!;
  assert.equal(row.closedStatus?.label, 'Race closed (Claimed)');
  assert.match(row.closedStatus?.text ?? '', /^\\\(\\theta = 1\/2\\\) is the best possible value\./);
  assert(row.claims.some(c => c.value === '1/2' && c.evidence === 'claimed'));
  const number = (v: string) => v.includes('/') ? Number(v.split('/')[0]) / Number(v.split('/')[1]) : Number(v);
  assert.deepEqual(row.claims.filter(c => number(c.value) < 0.5).map(c => c.handle), [], 'no claim below 1/2 (symbolic values do not parse and are skipped)');
});

// The critical-line race stays open (Lead, 2026-11-20, after Nil asked) and shows a neutral note about the claimed Riemann
// hypothesis proof. Only that row has a note; its one {link} points to the Quasi-Riemann race page, which must exist and be closed.
test('only the critical-line race has a note, with one link to the closed Quasi-Riemann race', () => {
  assert.deepEqual(data.families.filter(f => 'note' in f).map(f => f.slug), ['critical-line-zeros']);
  const row = data.families.find(f => f.slug === 'critical-line-zeros')!;
  assert.equal(row.note?.text.split('{link}').length, 2, 'one {link} in the text');
  const href = row.note?.link.href ?? '';
  const target = data.families.find(f => href === `/other/${f.slug}`);
  assert(target && 'closedStatus' in target, 'the link opens a closed race');
  assert.equal(row.note?.link.text, 'Quasi-Riemann race');
  assert.match(row.note?.text ?? '', /\\\(19\/27\\approx0\.7037\\\)/);
  assert(!('closedStatus' in row), 'the critical-line race is open');
  assert(row.statement.includes('Such conditional bounds do not count here.'), 'the rule stays');
});

// The first independent check of the Alpöge proof (Andrew Sutherland's page, read 2026-11-21) is named in the row's note,
// with its link. One person's check does not make the row Lean Verified: the route needs two public rebuilds by different people.
test('the Alpöge row names Sutherland\'s check, links his page and stays Claimed', () => {
  const claim = data.families.find(f => f.slug === 'quasi-riemann')!.claims.find(c => c.handle === 'levent-alpoge')!;
  assert.equal(claim.evidence, 'claimed');
  assert.match(claim.note, /\[Sutherland's verification page\]\(https:\/\/math\.mit\.edu\/~drew\/grh\/\)/);
  assert.match(claim.note, /stays Claimed/);
  assert(!claim.proofScope.includes('No independent rerun'));
});
