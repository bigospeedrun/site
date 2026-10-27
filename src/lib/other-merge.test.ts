import {test} from 'node:test';
import assert from 'node:assert/strict';
import data from './other-bounds.json' with {type: 'json'};
import {mergeProve2me, mergeDirect, claimNumber} from './other-merge.ts';
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

test('a direct claim must link its own verifier issue and be Lean Verified', () => {
  for (const bad of [direct(60, '3', '3.0', {url: 'https://github.com/bigospeedrun/verifier/issues/61'}), direct(60, '3', '3.0', {evidence: 'claimed'}),
    direct(60, '3', '3.0', {handle: 'prove2me-3'}), direct(60, '3', '3.0', {note: 'a <b> note'})]) {
    assert.equal((mergeDirect(lower as any, bad as any).families[0] as any).claims.length, 1);
  }
  assert.deepEqual(mergeDirect(lower as any, undefined), lower as any);
});
