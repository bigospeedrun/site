import {test} from 'node:test';
import assert from 'node:assert/strict';
import {baseline, plan, plainBound, xMessage, message} from './records-feed.ts';
import type {FeedBoard, FeedRecord, FeedSnapshot} from './records-feed.ts';

// Run 38664850013 (2026-10-15 01:17 UTC): crocswap-pr-2220 beat crocswap-pr-2044 only after
// the 20th significant digit, so both posts showed the same value and X refused the second (403).
const im = (id: string, score: string, author = 'jeremykothe2'): FeedRecord =>
 ({id, evidence: 'Claimed', score, relation: 'attained', authors: [author], bound: plainBound('integer-multiplication', score, 'attained', 20)});
const board = (records: FeedRecord[], leader: string): FeedBoard =>
 ({slug: 'integer-multiplication', name: 'Integer Multiplication', url: 'https://bigospeedrun.com/integer-multiplication', leader, records});
const snapshot = (b: FeedBoard): FeedSnapshot => ({schema_version: 1, boards: [b]});
const posted = (b: FeedBoard, r: FeedRecord, at: string) =>
 ({key: JSON.stringify([b.slug, r.id, r.score, r.relation]) + ':record', text: message(b, r), x_text: xMessage(b, r), posted_at: at, authors: r.authors});

const old = im('crocswap-pr-2044', '41993873903138613033391774848017564424957785962564/25' + '0'.repeat(51));
const tiny = im('crocswap-pr-2220', '4199387390313861303339177484801756442495778596256499/25' + '0'.repeat(53));
const real = im('crocswap-pr-2300', '42/25000');

test('a new leader that shows the same value as the last post is marked done without a post', () => {
 assert.equal(tiny.bound, old.bound);
 assert.notEqual(tiny.score, old.score);
 const before = board([old], old.id), after = board([old, tiny], tiny.id);
 // Four hours after the last post, so the 3 h throttle is not involved.
 const now = Date.parse('2026-10-15T01:20:00Z');
 const result = plan(baseline(snapshot(before)), snapshot(after), [posted(before, old, '2026-10-14T18:22:00Z')], now);
 assert.deepEqual(result.messages, []);
 assert.ok(result.state.reserved.includes(JSON.stringify(['integer-multiplication', tiny.id, tiny.score, 'attained']) + ':record'));
 assert.equal(result.state.deferred, undefined);
 // A later leader with a visibly better value posts as usual.
 const later = board([old, tiny, real], real.id);
 const next = plan(result.state, snapshot(later), [posted(before, old, '2026-10-14T18:22:00Z')], now);
 assert.equal(next.messages.length, 1);
 assert.match(next.messages[0].x_text!, /New value: O\(n log\^\(1 - 0\.00168\) n\)/);
});

test('the same value on another board, or on Discord-only posts, is compared per board', () => {
 const before = board([old], old.id), after = board([old, tiny], tiny.id);
 const now = Date.parse('2026-10-15T01:20:00Z');
 // A post on another board with the same text does not suppress this board.
 const other = {...posted(before, old, '2026-10-14T18:22:00Z'), key: JSON.stringify(['exact-dft', 'x', '1/2', 'attained']) + ':record'};
 assert.equal(plan(baseline(snapshot(before)), snapshot(after), [other], now).messages.length, 1);
 // An older post that has only Discord text still counts.
 const discordOnly = {...posted(before, old, '2026-10-14T18:22:00Z'), x_text: undefined};
 assert.equal(plan(baseline(snapshot(before)), snapshot(after), [discordOnly], now).messages.length, 0);
});
