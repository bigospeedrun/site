import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import data from './other-bounds.json' with {type: 'json'};
import {mergeProve2me, mergeDirect, applyMaintainer, claimNumber} from './other-merge.ts';
import {otherBoundLeader} from './other-leader.ts';
import {otherFeedBoard} from './records-feed.ts';

const URL = (n: number) => 'https://prove2.me/theorems/' + String(n).padStart(36, '0').replace(/0/g, 'a').slice(0, 36);
const claim = (value: string, date: string, extra: object = {}) => ({author: 'u', handle: 'prove2me-' + value.replace('.', '-'), value, display: '\\ge ' + value,
  date, dateSource: URL(1), dateKind: 'first-stated', url: URL(1), lean: true, leanNote: 'Yes', evidence: 'lean-verified', note: 'n', authors: [{name: 'u', url: URL(1)}],
  proofScope: 'p', bound: 'b', prove2me: true, ...extra});
const base = {families: [{slug: 'row', direction: 'higher', bestHandle: 'b', claims: [
  {handle: 'a', value: '\\log B', display: '\\approx2.00647', date: '2026-10-15T07:52:00Z', evidence: 'claimed', url: 'https://example.org/a'},
  {handle: 'b', value: '380/187', display: '\\ge 2.032083', date: '2026-10-19T11:44:32Z', evidence: 'claimed', url: 'https://example.org/b'}]}]};
const state = (...claims: object[]) => ({boards: {'other-row': {claims}}});

test('claim numbers come from the display, else from an exact fraction', () => {
  assert.equal(claimNumber({display: '\\ge 2.032083', value: 'x'}), 2.032083);
  assert.equal(claimNumber({display: '\\ge', value: '380/187'}), 380 / 187);
  assert.equal(claimNumber({display: '\\ge', value: '\\log B'}), null);
});

test('prove2.me claims join in date order; a better one leads; a worse one does not', () => {
  const merged = mergeProve2me(base as any, state(claim('2.0635', '2026-10-18T04:29:35Z'), claim('2.007', '2026-10-15T21:07:56Z')) as any);
  const family = merged.families[0] as any;
  assert.deepEqual(family.claims.map((c: any) => c.handle), ['a', 'prove2me-2-007', 'prove2me-2-0635', 'b']);
  assert.equal(family.bestHandle, 'prove2me-2-0635');
  assert.equal((otherBoundLeader(family) as any).evidence, 'lean-verified');
  const worse = mergeProve2me(base as any, state(claim('2.007', '2026-10-15T21:07:56Z')) as any).families[0] as any;
  assert.equal(worse.bestHandle, 'b', 'a result below the leader does not take the lead');
  assert.equal(mergeProve2me(base as any, state(claim('2.032084', '2026-10-18T00:00:00Z')) as any).families[0].bestHandle, 'b', 'within the display precision, no change');
  assert.equal(base.families[0].claims.length, 2, 'the JSON data is not changed');
});

test('invalid or absent prove2.me data changes nothing', () => {
  assert.deepEqual(mergeProve2me(base as any, undefined), base as any);
  for (const bad of [claim('2.1', '2026-10-18T00:00:00Z', {url: 'https://example.org/x'}), claim('2.1', 'not a date'), claim('2.1', '2026-10-18T00:00:00Z', {handle: 'other'}),
    claim('2.1', '2026-10-18T00:00:00Z', {evidence: 'human-verified'}), claim('2.1', '2026-10-18T00:00:00Z', {note: 'a <b>bold</b> note'}),
    claim('2.1', '2026-10-18T00:00:00Z', {proofScope: 'x & y'}), claim('2.1', '2026-10-18T00:00:00Z', {authors: [{name: 'a>b', url: 'https://prove2.me/submissions/s'}]})]) {
    assert.deepEqual((mergeProve2me(base as any, state(bad) as any).families[0] as any).claims.length, 2);
  }
  assert.deepEqual(mergeProve2me(base as any, {boards: {'other-elsewhere': {claims: [claim('2.1', '2026-10-18T00:00:00Z')]}}} as any).families[0].claims.length, 2);
});

test('a merged Lean Verified leader is a Lean Verified feed record; real data merges without errors', () => {
  const family = mergeProve2me(base as any, state(claim('2.0635', '2026-10-18T04:29:35Z')) as any).families[0] as any;
  const board = otherFeedBoard({slug: 'row', name: 'Row', bestHandle: family.bestHandle, claims: family.claims.map((c: any) => ({...c, bound: 'b', authors: c.authors ?? [{name: c.handle}]}))});
  assert.equal(board.records.find(r => r.id === board.leader)!.evidence, 'Lean Verified');
  const real = mergeProve2me(data as any, {boards: {'other-block-sensitivity': {claims: [claim('2.0635', '2026-10-18T04:29:35Z')]}}} as any);
  assert.equal((real.families.find((f: any) => f.slug === 'block-sensitivity') as any).bestHandle, 'prove2me-2-0635');
});

// Verifier PR #15 (2026-10-23): a final Lean Verified direct submission joins its Other bounds row.
const lower = {families: [{slug: 'average-sensitivity', direction: 'lower', bestHandle: 'c', claims: [
  {handle: 'c', value: '399/125', display: '3.192', date: '2026-10-19T11:44:32Z', evidence: 'claimed', url: 'https://example.org/c'}]}]};
const direct = (n: number, value: string, display: string, extra: object = {}) => ({boards: {'other-average-sensitivity': {claims: [{author: 'u',
  handle: 'direct-issue-' + n, value, display, date: '2026-10-23T12:00:00Z', dateSource: 'https://github.com/bigospeedrun/verifier/issues/' + n,
  dateKind: 'first-stated', url: 'https://github.com/bigospeedrun/verifier/issues/' + n, lean: true, leanNote: 'Yes', evidence: 'lean-verified',
  note: '', authors: [{name: 'u', url: 'https://github.com/u'}], proofScope: 'p', bound: 'b', ...extra}]}}});

test('a Lean Verified direct submission joins its row and leads only when it is lower', () => {
  const merged = mergeDirect(lower as any, direct(60, '3', '3.0') as any).families[0] as any;
  assert.deepEqual(merged.claims.map((c: any) => c.handle), ['c', 'direct-issue-60']);
  assert.equal(merged.bestHandle, 'direct-issue-60');
  assert.equal((otherBoundLeader(merged) as any).evidence, 'lean-verified');
  assert.equal((mergeDirect(lower as any, direct(60, '1881/500', '3.762') as any).families[0] as any).bestHandle, 'c');
});

// Catalan (opened 2026-10-27): the hand rows and a direct integer bound are whole numbers ("590", "1091").
test('an integer direct claim on the Catalan row is listed and leads only when it is lower', () => {
  const catalan = {families: [{slug: 'catalan', direction: 'lower', bestHandle: 'slitsey', claims: [
    {handle: 'slitsey', value: '590', display: '590', date: '2026-10-24T18:34:00Z', evidence: 'claimed', url: 'https://example.org/s'}]}]};
  const on = (value: string) => ({boards: {'other-catalan': direct(70, value, value).boards['other-average-sensitivity']}});
  const merged = mergeDirect(catalan as any, on('1091') as any).families[0] as any;
  assert.deepEqual(merged.claims.map((c: any) => c.handle).sort(), ['direct-issue-70', 'slitsey']);
  assert.equal(merged.bestHandle, 'slitsey');
  assert.equal((mergeDirect(catalan as any, on('580') as any).families[0] as any).bestHandle, 'direct-issue-70');
  assert.equal(claimNumber({value: '590', display: '590'}), 590);
});

test('a Heilbronn direct claim (a saving near 1e-8, higher is better) leads the real row only when it is exactly better', () => {
  // The leader canghaimeng is 2/100866719 = 1.98281e-8, shown with 3 digits as \\approx1.98\\cdot10^{-8}.
  const row = {families: data.families.filter(f => f.slug === 'heilbronn-triangle')};
  const lead = (value: string, display: string) => (mergeDirect(row as any,
    {boards: {'other-heilbronn-triangle': direct(999, value, display).boards['other-average-sensitivity']}} as any).families[0] as any).bestHandle;
  assert.equal(row.families[0].bestHandle, 'canghaimeng');
  assert.equal(claimNumber({value: '1/50893237', display: '\\approx1.96489\\cdot10^{-8}'}), 1.96489e-8);
  assert.equal(lead('991/50000000000', '1.982\\cdot10^{-8}'), 'canghaimeng', 'worse, though above the rounded display');
  assert.equal(lead('2/100866719', '\\approx1.98281\\cdot10^{-8}'), 'canghaimeng', 'a tie keeps the leader');
  assert.equal(lead('1/50893237', '\\approx1.96489\\cdot10^{-8}'), 'canghaimeng');
  assert.equal(lead('1/50000000', '2\\cdot10^{-8}'), 'direct-issue-999');
  // A Lean Verified stepping stone far below the Claimed rows (1/(100000 K), a 237-digit denominator) is listed but does not lead.
  assert.equal(lead('1/138611120630192845449848501984762489503949180120972521287304259199089718296986575839672803644586516021090063092820239685405507227054093124597541492458051962596474875313132928055153805949190893429472432269634916029759500562026384000100000', '\\approx7.21442\\cdot10^{-237}'), 'canghaimeng');
  // A leader without an exact value: the claim must beat its display by one unit of the last shown digit.
  const latex = {families: [{slug: 'heilbronn-triangle', direction: 'higher', bestHandle: 'littleBro', claims: [
    {handle: 'littleBro', value: '1/(498\\cdot379^{17}+7)', display: '\\approx2.92\\cdot10^{-47}', date: '2026-10-08T20:04:00Z', evidence: 'claimed', url: 'https://example.org/l'}]}]};
  const over = (display: string) => (mergeDirect(latex as any,
    {boards: {'other-heilbronn-triangle': direct(998, '1/10', display).boards['other-average-sensitivity']}} as any).families[0] as any).bestHandle;
  assert.equal(over('\\approx2.925\\cdot10^{-47}'), 'littleBro');
  assert.equal(over('\\approx2.94\\cdot10^{-47}'), 'direct-issue-998');
});

test('a lower-is-better row is unchanged: exact values compare exactly, a tie keeps the leader', () => {
  const on = (value: string, display: string) => (mergeDirect(lower as any, direct(60, value, display) as any).families[0] as any).bestHandle;
  assert.equal(on('399/125', '3.192'), 'c');
  assert.equal(on('3191/1000', '3.191'), 'direct-issue-60');
  assert.equal(on('3193/1000', '3.193'), 'c');
});

test('a direct claim must link its own verifier issue and be Lean Verified', () => {
  for (const bad of [direct(60, '3', '3.0', {url: 'https://github.com/bigospeedrun/verifier/issues/61'}), direct(60, '3', '3.0', {evidence: 'claimed'}),
    direct(60, '3', '3.0', {handle: 'prove2me-3'}), direct(60, '3', '3.0', {note: 'a <b> note'})]) {
    assert.equal((mergeDirect(lower as any, bad as any).families[0] as any).claims.length, 1);
  }
  assert.deepEqual(mergeDirect(lower as any, undefined), lower as any);
});

// Direct claim authors read as on the Big O boards: the GitHub display name, not the login. Rows by hand keep their names.
test('a direct claim author takes the profile name; a claim by hand keeps its name', () => {
  const person = (a: any) => ({...a, name: 'Real Name'});
  const merged = mergeDirect(lower as any, direct(60, '3', '3.0') as any, person).families[0] as any;
  assert.deepEqual(merged.claims.find((c: any) => c.handle === 'direct-issue-60').authors, [{name: 'Real Name', url: 'https://github.com/u'}]);
  assert.equal(merged.claims.find((c: any) => c.handle === 'c').authors, undefined);
});

test('a passed maintainer receipt makes its claim Lean Verified and links the receipt page; others stay', () => {
  const receipt = (state: string, receipt_path = 'sources/maintainer-b-41964266185.json') => ({boards: {row: {b: {state, receipt_path}}}});
  const merged = applyMaintainer(base, receipt('passed'));
  assert.deepEqual(merged.families[0].claims.map(c => c.evidence), ['claimed', 'lean-verified']);
  assert.equal((merged.families[0].claims[1] as {evidenceUrl?: string}).evidenceUrl, '/receipts/maintainer-b-41964266185');
  assert.equal((merged.families[0].claims[1] as {maintainerReceiptPath?: string}).maintainerReceiptPath, 'sources/maintainer-b-41964266185.json');
  assert.equal(merged.families[0].claims[1].url, 'https://example.org/b');
  for (const state of [receipt('failed'), receipt('pending'), receipt('passed', 'sources/direct-issue-1-2-1.json'), receipt('passed', '../x.json'), {}, undefined])
    assert.deepEqual(applyMaintainer(base, state), base);
  assert.throws(() => applyMaintainer(base, {boards: {row: {c: {state: 'passed', receipt_path: 'sources/maintainer-c-1.json'}}}}), /unknown Other bounds claim: row\/c/);
  assert.throws(() => applyMaintainer(base, {boards: {other: {b: {state: 'passed'}}}}), /other\/b/);
});

// A reviewed upgrade (Lead, 2026-11-08, verifier #187): a port of a hand claim's own proof makes that claim Lean
// Verified in place; no second row, the leader and the feed key stay.
test('a direct result with an upgrade makes its hand claim Lean Verified in place and adds no row', () => {
  const catalan = {families: [{slug: 'catalan', direction: 'lower', bestHandle: 'm', claims: [
    {handle: 'slitsey', value: '400', display: '400', date: '2026-11-05T17:56:39Z', evidence: 'claimed', url: 'https://example.org/400', note: 'n400', leanNote: 'old', author: 'S. Litsey', authors: [{name: 'S. Litsey'}]},
    {handle: 'slitsey', value: '295', display: '295', date: '2026-11-06T17:13:45Z', evidence: 'claimed', url: 'https://example.org/295', note: 'n295', leanNote: 'old', author: 'S. Litsey', authors: [{name: 'S. Litsey'}]},
    {handle: 'm', value: '280.59', display: '280.59', date: '2026-11-07T19:22:35Z', evidence: 'claimed', url: 'https://example.org/m'}]}]};
  const result = (extra: object) => ({boards: {'other-catalan': {claims: [direct(187, '295', '295', {receiptPath: 'sources/r.json', note: 'credit text',
    author: 'S. Litsey; MultiAgency swarm (port)', authors: [{name: 'S. Litsey', url: 'https://github.com/slitsey'}, {name: 'MultiAgency swarm', url: 'https://github.com/darkhipo'}], ...extra})
    .boards['other-average-sensitivity'].claims[0]]}}});
  const merged = mergeDirect(catalan as any, result({upgrades: {handle: 'slitsey', value: '295'}}) as any).families[0] as any;
  assert.deepEqual(merged.claims.map((c: any) => [c.handle, c.value, c.evidence]), [['slitsey', '400', 'claimed'], ['slitsey', '295', 'lean-verified'], ['m', '280.59', 'claimed']]);
  const up = merged.claims[1];
  assert.equal(up.date, '2026-11-06T17:13:45Z'); assert.equal(up.url, 'https://example.org/295');
  assert.equal(up.evidenceUrl, 'https://github.com/bigospeedrun/verifier/issues/187');
  assert.equal(up.author, 'S. Litsey; MultiAgency swarm (port)'); assert.deepEqual(up.authors.map((a: any) => a.name), ['S. Litsey', 'MultiAgency swarm']);
  assert.equal(up.note, 'credit text'); assert.equal(up.leanNote, 'Yes'); assert.equal(up.receiptPath, 'sources/r.json'); assert.equal(up.upgrades, undefined);
  assert.equal(merged.bestHandle, 'm');
  // Without a note the hand note stays; a missing or ambiguous target stops the build.
  assert.equal((mergeDirect(catalan as any, result({note: '', upgrades: {handle: 'slitsey', value: '295'}}) as any).families[0] as any).claims[1].note, 'n295');
  for (const upgrades of [{handle: 'slitsey', value: '294'}, {handle: 'nobody', value: '295'}, {handle: 'slitsey'}])
    assert.throws(() => mergeDirect(catalan as any, result({upgrades}) as any), /upgrades no single claim/);
  const twice = {families: [{...catalan.families[0], claims: [...catalan.families[0].claims, catalan.families[0].claims[1]]}]};
  assert.throws(() => mergeDirect(twice as any, result({upgrades: {handle: 'slitsey', value: '295'}}) as any), /upgrades no single claim/);
  // Without an upgrade the result is a row of its own, as before.
  assert.equal((mergeDirect(catalan as any, result({}) as any).families[0] as any).claims.length, 4);
});

test('every reviewed upgrade in data/direct-notes.json names exactly one hand claim of src/lib/other-bounds.json', () => {
  const notes = JSON.parse(readFileSync('data/direct-notes.json', 'utf8')).notes as Record<string, {upgrades?: {handle: string; value: string}}>;
  const claims = (data as any).families.flatMap((f: any) => f.claims) as {handle: string; value: string}[];
  for (const [key, note] of Object.entries(notes)) if (note.upgrades)
    assert.equal(claims.filter(c => c.handle === note.upgrades!.handle && c.value === note.upgrades!.value).length, 1, key);
});

// Nil, 2026-11-09: the refiler line of an upgrading port reaches the upgraded claim; the authors are the original author.
test('an upgrade carries the refiler line, not the refiler as an author', () => {
  const catalan = {families: [{slug: 'catalan', direction: 'lower', bestHandle: 'slitsey', claims: [
    {handle: 'slitsey', value: '295', display: '295', date: '2026-11-06T17:13:45Z', evidence: 'claimed', url: 'https://example.org/295'}]}]};
  const state = {boards: {'other-catalan': {claims: [direct(187, '295', '295', {author: 'S. Litsey', authors: [{name: 'S. Litsey', url: 'https://github.com/slitsey'}],
    refiledBy: 'Ported by MultiAgency swarm', upgrades: {handle: 'slitsey', value: '295'}}).boards['other-average-sensitivity'].claims[0]]}}};
  const claim = (mergeDirect(catalan as any, state as any).families[0] as any).claims[0];
  assert.equal(claim.refiledBy, 'Ported by MultiAgency swarm'); assert.deepEqual(claim.authors.map((a: any) => a.name), ['S. Litsey']);
});

test('the reviewed refiles in data/direct-notes.json credit the original author alone (Nil, 2026-11-09)', () => {
  const notes = JSON.parse(readFileSync('data/direct-notes.json', 'utf8')).notes as Record<string, {credit?: {names: string[]; refiledBy?: string}}>;
  assert.deepEqual(notes['direct-issue-186'].credit, {author: 'Halit Ziya KARTAL', names: ['Halit Ziya KARTAL'], accounts: {'Halit Ziya KARTAL': 'https://github.com/HalitZiyaKARTAL'}, refiledBy: 'Refiled by MultiAgency swarm'});
  assert.deepEqual(notes['direct-issue-187'].credit, {author: 'S. Litsey', names: ['S. Litsey'], accounts: {'S. Litsey': 'https://github.com/slitsey'}, refiledBy: 'Ported by MultiAgency swarm'});
  for (const [key, note] of Object.entries(notes)) if (note.credit?.refiledBy)
    assert.ok(!note.credit.names.includes(note.credit.refiledBy.replace(/^(Refiled|Ported) by /, '')), key);
});

// Lead, 2026-11-11, quasi-Riemann #129: an exact surd leader compares exactly with an imported fraction (and the reverse).
test('an imported fraction compares exactly with a surd leader', () => {
  const B2 = '\\frac{777-\\sqrt{1081}}{852}', shown = '0.873381966613207519929026778643';
  const row = {families: [{slug: 'average-sensitivity', direction: 'lower', bestHandle: 's', claims: [
    {handle: 's', value: B2, display: shown, date: '2026-11-10T00:00:00Z', evidence: 'claimed', url: 'https://example.org/s'}]}]};
  const on = (value: string) => (mergeDirect(row as any, direct(60, value, shown) as any).families[0] as any).bestHandle;
  // 873381966613207519929026778642/10^30 is below B2 (it starts ...642 against B2's ...6429...), the ...643 fraction above it.
  assert.equal(on('436690983306603759964513389321/500000000000000000000000000000'), 'direct-issue-60');
  assert.equal(on('873381966613207519929026778643/1000000000000000000000000000000'), 's');
});
