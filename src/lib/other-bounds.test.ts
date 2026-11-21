import {test} from 'node:test';
import assert from 'node:assert/strict';
import data from './other-bounds.json' with {type: 'json'};
import {applyReviews} from './other-merge.ts';
import {leanRoute, routeEvidenceUrl, MIN_REBUILDS} from './other-route.ts';
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
// only while its best claim is the exact bound the line names: the line says theta = 1/2 is the best possible value, and that
// two independent public rebuilds confirm the Lean proof, so the best claim must be Lean Verified through that route.
test('only Quasi-Riemann is closed: its best claim is exactly 1/2, Lean Verified by two independent public rebuilds', () => {
  const closed = data.families.filter(f => 'closedStatus' in f).map(f => f.slug);
  assert.deepEqual(closed, ['quasi-riemann']);
  const row = data.families.find(f => f.slug === 'quasi-riemann')!;
  assert.equal(row.closedStatus?.label, 'Race closed');
  assert.equal(row.closedStatus?.text, '\\(\\theta = 1/2\\) is the best possible value, and two independent public rebuilds confirm the Lean proof.');
  assert(row.claims.some(c => c.value === '1/2' && c.evidence === 'lean-verified'));
  const number = (v: string) => v.includes('/') ? Number(v.split('/')[0]) / Number(v.split('/')[1]) : Number(v);
  assert.deepEqual(row.claims.filter(c => number(c.value) < 0.5).map(c => c.handle), [], 'no claim below 1/2 (symbolic values do not parse and are skipped)');
});

// The critical-line race stays open (Lead, 2026-11-20, after Nil asked) and shows a neutral note about the Riemann
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
  assert.equal(row.note?.label, 'Effect of the Riemann hypothesis proof');
  assert.equal(row.note?.text, "Levent Alpöge's Lean proof of the Riemann hypothesis is Lean Verified through two independent public rebuilds (see the {link}). Bounds proved under the Riemann hypothesis, for example \\(19/27\\approx0.7037\\) by Bui and Heath-Brown, then no longer assume an unproved hypothesis, so this table lists \\(19/27\\) on that basis. This race stays open: the Riemann hypothesis does not say that the zeros are simple.");
  assert.doesNotMatch(row.note?.text ?? '', /If independent verifications|status Claimed|would then|claimed|decision is open/);
  assert(!('closedStatus' in row), 'the critical-line race is open');
  assert(row.statement.includes('so such bounds no longer assume an unproved hypothesis and count here. A bound that assumes a hypothesis that is still unproved does not count.'), 'the rule names the Riemann hypothesis proof');
  assert(!row.statement.includes('Such conditional bounds do not count here.'), 'the old rule would contradict the 19/27 row');
});

// The Alpöge row is Lean Verified through the route "independent public rebuilds" (Nil's design, 2026-11-20): at least two
// people other than the author, each with an own build and a kernel check. Its family names them in leanRoute, and the
// row's note links each public record. The Reviewer's rule: neutral wording, no pronouns for the two people.
test('the Alpöge row is Lean Verified through two named independent public rebuilds, with the honest caveats', () => {
  const family = data.families.find(f => f.slug === 'quasi-riemann')!;
  const claim = family.claims.find(c => c.handle === 'levent-alpoge')!;
  assert.equal(claim.evidence, 'lean-verified');
  const route = leanRoute(family)!;
  assert.equal(route.kind, 'independent-rebuilds');
  assert.equal(route.handle, claim.handle);
  assert(route.rebuilds.length >= MIN_REBUILDS, 'at least two rebuilds');
  assert.equal(new Set(route.rebuilds.map(r => r.name)).size, route.rebuilds.length, 'different people');
  assert.deepEqual(route.rebuilds.map(r => r.name), ['Andrew Sutherland (MIT)', 'Elliot Arledge (GitHub infatoshi)']);
  for (const r of route.rebuilds) {
    assert.match(r.url, /^https:\/\//);
    assert(claim.note.includes(`](${r.url})`), `the note links ${r.url}`);
  }
  assert.equal(route.rebuilds[0].url, 'https://math.mit.edu/~drew/grh/');
  assert.match(route.rebuilds[1].url, /^https:\/\/github\.com\/Infatoshi\/rh-verification-receipts\/blob\/[0-9a-f]{40}\/VERIFICATION_RESULT\.txt$/, 'a pinned commit');
  assert.equal(routeEvidenceUrl(family, claim), route.rebuilds[0].url);
  assert.equal(routeEvidenceUrl(family, family.claims.find(c => c.handle !== claim.handle)!), undefined);
  assert.match(claim.note, /Neither build ran in a sandbox \(Sutherland's page and Arledge's README say so\), and Sutherland's comparator kernel stages were still running/);
  assert(claim.note.includes('](https://github.com/Infatoshi/rh-verification-receipts/tree/ac99f18cef21952de094234fab95db342ed16638)'), 'the repository tree at the pinned commit is linked');
  assert.match(claim.note, /We did not build the Lean files ourselves/);
  assert(!/\b(his|her|he|she|him)\b/i.test(claim.note.slice(0, claim.note.indexOf('The author, Levent'))), 'no pronouns for the rebuilders');
  assert(!claim.proofScope.includes('No independent rerun') && !claim.leanNote.includes('No independent rerun'));
  assert.match(claim.proofScope, /Two independent public rebuilds, by Andrew Sutherland and Elliot Arledge/);
});

test('only Quasi-Riemann has a leanRoute', () => {
  assert.deepEqual(data.families.filter(f => leanRoute(f)).map(f => f.slug), ['quasi-riemann']);
});

// A route must hold its own rule: at least MIN_REBUILDS different people, each with an https record, and its handle must name
// a Lean Verified claim of the same family (Reviewer, 2026-11-21: a later route with one rebuild must not pass the build).
test('every leanRoute has enough different rebuilds and names a Lean Verified claim of its family', () => {
  for (const family of data.families) {
    const route = leanRoute(family);
    if (!route) continue;
    assert(route.rebuilds.length >= MIN_REBUILDS, `${family.slug}: at least ${MIN_REBUILDS} rebuilds`);
    assert.equal(new Set(route.rebuilds.map(r => r.name)).size, route.rebuilds.length, `${family.slug}: different people`);
    assert(route.rebuilds.every(r => /^https:\/\//.test(r.url) && Number.isFinite(Date.parse(r.date))), `${family.slug}: public records with dates`);
    assert(family.claims.some(c => c.handle === route.handle && c.evidence === 'lean-verified'), `${family.slug}: the handle names a Lean Verified claim`);
  }
});

// The 19/27 row (Nil 2026-11-21, ask 176b7090: "add the row when the RH gets Lean verified"; Lead). Bui and Heath-Brown prove, assuming the
// Riemann hypothesis, that at least 19/27 of the zeros are simple; the race lists it because the Riemann hypothesis now has a Lean Verified proof.
test('the critical-line race lists 19/27 as a Claimed leader built on the Lean Verified Riemann hypothesis', () => {
  const row = data.families.find(f => f.slug === 'critical-line-zeros')!;
  const claim = row.claims.find(c => c.handle === 'bui-heath-brown-alpoge')!;
  assert.equal(row.bestHandle, claim.handle);
  assert.equal(claim.value, '\\tfrac{19}{27}');
  assert.equal(claim.display, '\\approx0.7037037');
  assert.equal(claim.bound, '\\kappa^{*}\\ge 0.703703');
  assert.equal(claim.evidence, 'claimed', 'the bound has no Lean proof');
  assert.equal(claim.url, 'https://arxiv.org/abs/1302.5018');
  assert.deepEqual(claim.authors.map(a => a.name), ['H. M. Bui', 'D. R. Heath-Brown', 'Levent Alpöge']);
  assert.equal(claim.date, '2026-11-20T21:51:07Z');
  assert.equal(claim.dateSource, 'https://github.com/Infatoshi/rh-verification-receipts/commit/ac99f18cef21952de094234fab95db342ed16638', 'the pinned commit of the second rebuild');
  assert(!('agent' in claim), 'the bound is a 2013 human theorem');
  assert.match(claim.note, /assuming the Riemann hypothesis, at least \\\(19\/27\\\) of the zeros of the zeta function are simple \(arXiv:1302\.5018, 2013\)/);
  assert.match(claim.note, /Lean Verified on the Quasi-Riemann race through two independent public rebuilds\. We combined the two sources/);
  // It is the newest claim (claims are in date order), the highest value, and above the old leader 0.6731.
  assert.equal(row.claims.at(-1)!.handle, claim.handle);
  const old = row.claims.find(c => c.handle === 'bhattacharjee-bhattacharya')!;
  assert(19 / 27 > Number(old.display.match(/\d+\.\d+/)![0]));
  // The race it depends on is closed and Lean Verified.
  assert.equal(data.families.find(f => f.slug === 'quasi-riemann')!.claims.find(c => c.handle === 'levent-alpoge')!.evidence, 'lean-verified');
});
