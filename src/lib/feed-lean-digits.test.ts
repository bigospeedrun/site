import {test} from 'node:test';
import assert from 'node:assert/strict';
import {plan, message, xMessage} from './records-feed.ts';
import type {FeedBoard, FeedRecord, FeedDirection} from './records-feed.ts';

// Run of 2026-10-24 19:17 UTC: the #62 post (3.76153979) showed 3.76154, the same text as the #58 post (3.76154), and X
// refused it (403). A Lean Verified post on an Other bounds board shows the digits that separate it from the best Lean
// Verified row before the pass (Lead), and never an identical text.
const SLUG = 'other-average-sensitivity';
const row = (n: number, score: string, display: string, evidence = 'Lean Verified', authors = ['darkhipo']): FeedRecord =>
 ({id: `direct-issue-${n}:${score}`, score, relation: 'attained', evidence, authors, display, bound: `AS(f) ≤ ${display}d sqrt(n)`});
const board = (records: FeedRecord[], leader: string | null, direction: FeedDirection = 'lower', slug = SLUG): FeedBoard =>
 ({slug, name: 'Average sensitivity', url: 'https://bigospeedrun.com/other/average-sensitivity', leader, records, table: 'other-bounds', direction});
const state = (b: FeedBoard) => ({schema_version: 1 as const, snapshot: {schema_version: 1 as const, boards: [b]}, reserved: [] as string[]});
const snapshot = (b: FeedBoard) => ({schema_version: 1 as const, boards: [b]});
const key = (r: FeedRecord, slug = SLUG) => JSON.stringify([slug, r.id, r.score, r.relation]) + ':lean';
const post = (b: FeedBoard, r: FeedRecord) => ({key: key(r, b.slug), text: message(b, r, false), x_text: xMessage(b, r, false), posted_at: '2026-10-24T18:27:52Z', authors: r.authors});
const NOW = Date.parse('2026-10-24T20:00:00Z');

const lead = row(1, '399/125', '3.192', 'Claimed', ['canghaimeng']);
const r58 = row(58, '188077/50000', '3.76154');
const r60 = row(60, '37615399/10000000', '3.76154');
const r62 = row(62, '376153979/100000000', '3.76154');
const r63 = row(63, '188076989/50000000', '3.76154');
const saved = (rows: FeedRecord[], direction: FeedDirection = 'lower') => board([lead, ...rows], lead.id, direction);

test('#62 shows the digits that separate it from the best earlier Lean Verified row (#58)', () => {
 const before = saved([r58]);
 const result = plan(state(before), snapshot(saved([r58, r62])), [post(before, r58)], NOW);
 assert.deepEqual(result.messages.map(m => m.key), [key(r62)]);
 assert.match(result.messages[0].content, /`AS\(f\) ≤ 3\.7615398d sqrt\(n\)`/);
 assert.match(result.messages[0].x_text ?? '', /Value: AS\(f\) ≤ 3\.7615398d sqrt\(n\)\n/);
 // The burst #60, #62 after #58: #60 is superseded, #62 compares with #58, not with #60.
 const burst = plan(state(before), snapshot(saved([r58, r60, r62])), [post(before, r58)], NOW);
 assert.deepEqual(burst.messages.map(m => m.key), [key(r62)]);
 assert.match(burst.messages[0].content, /3\.7615398d/);
});

test('a later #63 compares with #62 and shows one more digit than #62 did', () => {
 const before = saved([r58, r62]);
 const prior = plan(state(saved([r58])), snapshot(before), [post(saved([r58]), r58)], NOW).messages[0];
 const result = plan(state(before), snapshot(saved([r58, r62, r63])), [post(saved([r58]), r58), {...post(before, r62), text: prior.content, x_text: prior.x_text}], NOW);
 assert.deepEqual(result.messages.map(m => m.key), [key(r63)]);
 assert.match(result.messages[0].content, /`AS\(f\) ≤ 3\.76153978d sqrt\(n\)`/);
 assert.notEqual(result.messages[0].x_text, prior.x_text);
});

test('a higher-is-better board rounds down, toward the weaker bound', () => {
 const hi = (n: number, score: string, display: string) => ({...row(n, score, display), bound: `bs(f) ≥ s(f)^${display}`});
 const a = hi(1, '2131121719/1000000000', '2.131122'), b = hi(2, '2131121719191/1000000000000', '2.131122');
 const before = board([a], null, 'higher', 'other-block-sensitivity');
 const result = plan(state(before), snapshot(board([a, b], null, 'higher', 'other-block-sensitivity')), [], NOW);
 // 2.131121719191 against 2.131121719: seven places separate them, cut down: 2.1311217 vs 2.1311217 (equal), 2.13112171 vs 2.13112171, then 2.131121719 equal, 2.1311217191 differs.
 assert.match(result.messages[0].content, /s\(f\)\^2\.1311217191`/);
});

test('without an earlier Lean Verified row the bound stays as the site shows it', () => {
 const result = plan(state(saved([])), snapshot(saved([r58])), [], NOW);
 assert.match(result.messages[0].content, /`AS\(f\) ≤ 3\.76154d sqrt\(n\)`/);
});

test('safety net: a text equal to a live post of the board gets one more digit; at its end nothing posts', () => {
 const before = saved([]);
 // No earlier Lean row, so the bound is the site's 3.76154. A live post of the same board has exactly that text.
 // (Another row's key: a post under the row's own key would mean it was announced already.)
 const same = {...post(before, r62), key: key(r58)};
 const result = plan(state(before), snapshot(saved([r62])), [same], NOW);
 assert.match(result.messages[0].content, /3\.7615398d/);
 assert.notEqual(result.messages[0].x_text, same.x_text);
 // An exact value has no more digits to show: the identical text is not posted, and the row is reserved.
 const exact = plan(state(before), snapshot(saved([r58])), [{...post(before, r58), key: key(r60)}], NOW);
 assert.deepEqual(exact.messages, []);
 assert.ok(exact.state.reserved.includes(key(r58)));
 // The same text on another board does not count.
 const elsewhere = {...same, key: JSON.stringify(['other-block-sensitivity', r62.id, r62.score, 'attained']) + ':lean'};
 assert.match(plan(state(before), snapshot(saved([r62])), [elsewhere], NOW).messages[0].content, /3\.76154d/);
 // A deleted post is gone.
 assert.match(plan(state(before), snapshot(saved([r62])), [{...same, deleted_at: '2026-10-24'}], NOW).messages[0].content, /3\.76154d/);
});
