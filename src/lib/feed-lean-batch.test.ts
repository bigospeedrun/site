import {test} from 'node:test';
import assert from 'node:assert/strict';
import {plan, feedBoard, otherFeedBoard} from './records-feed.ts';
import type {FeedBoard, FeedRecord, FeedDirection} from './records-feed.ts';

// darkhipo's average-sensitivity rounds #60, #61 and #62 (2026-10-24, Lead): several Lean Verified rows of one board with the
// same author list land in one refresh. Only the best by the board's direction posts; the others are reserved without a post.
const row = (n: number, score: string, authors = ['darkhipo'], evidence = 'Lean Verified'): FeedRecord =>
 ({id: `direct-issue-${n}:${score}`, score, relation: 'attained', evidence, authors, bound: `AS(f) ≤ ${score}d sqrt(n)`});
const board = (records: FeedRecord[], leader: string | null, direction?: FeedDirection): FeedBoard =>
 ({slug: 'other-average-sensitivity', name: 'Average sensitivity', url: 'https://bigospeedrun.com/other/average-sensitivity', leader, records, table: 'other-bounds', ...(direction ? {direction} : {})});
const state = (b: FeedBoard) => ({schema_version: 1 as const, snapshot: {schema_version: 1 as const, boards: [b]}, reserved: [] as string[]});
const snapshot = (b: FeedBoard) => ({schema_version: 1 as const, boards: [b]});
const key = (r: FeedRecord) => JSON.stringify(['other-average-sensitivity', r.id, r.score, r.relation]) + ':lean';
const NOW = Date.parse('2026-10-24T20:00:00Z');

const lead = row(1, '399/125', ['canghaimeng']);
const r60 = row(60, '37615399/10000000'), r61 = row(61, '37615398/10000000'), r62 = row(62, '376153979/100000000');

// The planner receives each pass as (saved state, new snapshot): the saved state has only the rows before the burst.
const burst = (rows: FeedRecord[], direction: FeedDirection | undefined, leader = lead.id) =>
 plan(state(board([lead], leader, direction)), snapshot(board([lead, ...rows], leader, direction)), [], NOW);

test('rows of one author list that gain Lean Verified in one pass post only the best', () => {
 const result = burst([r60, r61, r62], 'lower');
 assert.deepEqual(result.messages.map(m => m.key), [key(r62)]);
 assert.match(result.messages[0].content, /Record verified.*376153979\/100000000/);
 for (const r of [r60, r61, r62]) assert.ok(result.state.reserved.includes(key(r)));
 assert.equal(result.state.deferred, undefined);
 // The best by direction, not the last row: a 'higher' board posts the highest.
 assert.deepEqual(burst([r60, r61, r62], 'higher').messages.map(m => m.key), [key(r60)]);
 // The order of the rows does not decide.
 assert.deepEqual(burst([r62, r60, r61], 'lower').messages.map(m => m.key), [key(r62)]);
 // The next pass posts nothing more: every row of the burst is reserved.
 const next = plan(result.state, snapshot(board([lead, r60, r61, r62], lead.id, 'lower')), [], NOW);
 assert.deepEqual(next.messages, []);
});

test('two authors: the same two-author list posts only its best; another author list, or one of the two alone, posts too', () => {
 const pair = (n: number, score: string) => row(n, score, ['darkhipo', 'anchen0823']);
 const a = pair(70, '37615399/10000000'), b = pair(71, '37615398/10000000');
 assert.deepEqual(burst([a, b], 'lower').messages.map(m => m.key), [key(b)]);
 // Mixed authors never compete: darkhipo alone, darkhipo with a second author, a different author.
 const alone = row(72, '37615397/10000000'), other = row(73, '37615396/10000000', ['someone']);
 const mixed = burst([a, b, alone, other], 'lower');
 assert.deepEqual(mixed.messages.map(m => m.key).sort(), [key(alone), key(b), key(other)].sort());
 assert.ok(mixed.state.reserved.includes(key(a)));
 // A single row of each list posts as before.
 assert.equal(burst([a, alone], 'lower').messages.length, 2);
});

test('the rule needs a direction and numbers; rows that would not post do not count', () => {
 // An older snapshot has no direction: every row posts, as before.
 assert.equal(burst([r60, r61, r62], undefined).messages.length, 3);
 // A score that is not a number: no row is superseded.
 const text = row(80, 'about 3.7'), num = row(81, '37615398/10000000');
 assert.equal(burst([text, num], 'lower').messages.length, 2);
 // Decimal scores compare as numbers.
 const d1 = row(82, '2.131121719190'), d2 = row(83, '2.131121719191');
 assert.deepEqual(burst([d1, d2], 'higher').messages.map(m => m.key), [key(d2)]);
 // A better row that is already reserved (posted before) does not hide a worse new row.
 const before = state(board([lead], lead.id, 'lower'));
 before.reserved.push(key(r62));
 const next = plan(before, snapshot(board([lead, r60, r62], lead.id, 'lower')), [], NOW);
 assert.deepEqual(next.messages.map(m => m.key), [key(r60)]);
 // A row that was Lean Verified before is not a new row: it posts nothing, and it does not join the pass.
 const r59 = row(59, '37615400/10000000');
 const oldState = state(board([lead, r59], lead.id, 'lower'));
 assert.deepEqual(plan(oldState, snapshot(board([lead, r59, r60], lead.id, 'lower')), [], NOW).messages.map(m => m.key), [key(r60)]);
});

test('a row that gains Lean Verified alone, later, does not post when the same authors already have an at-least-as-good Lean Verified row', () => {
 const later = (saved: FeedRecord[], now: FeedRecord[], direction: FeedDirection | 'none' = 'lower') =>
  plan(state(board([lead, ...saved], lead.id, direction === 'none' ? undefined : direction)), snapshot(board([lead, ...saved, ...now], lead.id, direction === 'none' ? undefined : direction)), [], NOW);
 // #61 (a worse score than #62) comes back alone after #62 is listed.
 const late = later([r62], [r61]);
 assert.deepEqual(late.messages, []);
 assert.ok(late.state.reserved.includes(key(r61)));
 // At an equal score the earlier row stays the record.
 assert.deepEqual(later([r62], [row(64, '376153979/100000000')]).messages, []);
 // A strictly better row posts, and so does the same score on another author list.
 assert.deepEqual(later([r60], [r62]).messages.map(m => m.key), [key(r62)]);
 assert.deepEqual(later([r62], [row(65, '37615398/10000000', ['someone'])]).messages.length, 1);
 // #63 (3.76153978, reduced form) is better than a saved #62 (3.76153979) on a lower-is-better board: it posts.
 const r63 = row(63, '188076989/50000000');
 assert.deepEqual(later([r62], [r63]).messages.map(m => m.key), [key(r63)]);
 // #61 and #63 together after #62: only #63 posts.
 assert.deepEqual(later([r62], [r61, r63]).messages.map(m => m.key), [key(r63)]);
 // The direction decides: on a higher-is-better board the worse row is the lower one.
 assert.deepEqual(later([r60], [r62], 'higher').messages, []);
 // A saved row that is not a number hides nothing.
 assert.equal(later([row(66, 'about 3.7')], [r61]).messages.length, 1);
 // Without a direction every row posts, as before.
 assert.equal(later([r62], [r61], 'none').messages.length, 1);
 // The late row is checked against the Lean Verified row, not against a Claimed row of the same authors.
 assert.equal(later([row(67, '37615300/10000000', ['darkhipo'], 'Claimed')], [r61]).messages.length, 1);
 // A row of the pass that is worse than the saved row is dropped; the better one of the pass still posts.
 assert.deepEqual(later([r61], [r60, r62]).messages.map(m => m.key), [key(r62)]);
});

test('a leader that is not the best row of its list is reserved, and the best row posts as a verified record', () => {
 const a = row(90, '37615399/10000000'), b = row(91, '37615398/10000000');
 // Leader a (newest claim of its best author) gains Lean Verified together with the better b.
 const before = state(board([lead], lead.id, 'lower'));
 const result = plan(before, snapshot(board([lead, a, b], a.id, 'lower')), [], NOW);
 assert.deepEqual(result.messages.map(m => m.key), [key(b)]);
 assert.match(result.messages[0].content, /Record verified/);
 assert.ok(result.state.reserved.includes(key(a)));
});

test('the feed boards carry their direction', () => {
 assert.equal(feedBoard({slug: 'exact-dft', direction: 'higher-is-better'}, [], 'DFT').direction, 'higher');
 assert.equal(feedBoard({slug: '3sum', direction: 'lower-is-better'}, [], '3SUM').direction, 'lower');
 const other = otherFeedBoard({slug: 'average-sensitivity', name: 'Average sensitivity', bestHandle: 'x', claims: [], direction: 'lower'});
 assert.equal(other.direction, 'lower');
 assert.equal('direction' in otherFeedBoard({slug: 'x', name: 'X', bestHandle: 'x', claims: []}), false);
});
