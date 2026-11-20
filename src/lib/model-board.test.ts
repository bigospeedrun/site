import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {baseline, plan, plainBound, feedBoard, modelFeedBoard, isModelBoardSlug} from './records-feed.ts';
import type {FeedBoard, FeedRecord, FeedSnapshot} from './records-feed.ts';
import {worseThanBreakthrough} from './x-skip.ts';
import {modelLinks, modelPath, modelDisplayName, isPrimaryModel, problemLinks} from './navigation.ts';
import {pageSeo, sitemapPaths, pageDescriptions, siteOrigin} from './seo.ts';
import {boardSlugs, boardUrl} from './board.ts';

// The randomized APSP leaderboard (Nil GO 2026-11-20, ask 1b303420): a second model inside the APSP race. The data layer
// keeps the carried rows once (data/apsp.json); the site reads them onto the second board, flagged carried.
const json = (name: string) => JSON.parse(readFileSync(new URL('../data/' + name, import.meta.url), 'utf8'));
const registry = json('registry.json') as {problems: {slug: string; problem_id: string; data_file: string; carries?: string[]}[]};

test('the registry entry of the randomized model carries the deterministic one and no row is on both', () => {
  const entry = registry.problems.find(p => p.problem_id === 'apsp/randomized-word-ram')!;
  assert.deepEqual(entry.carries, ['apsp/word-ram']);
  assert.equal(entry.slug, 'apsp');
  assert.equal(registry.problems.find(p => p.slug === 'apsp'), registry.problems.find(p => p.problem_id === 'apsp/word-ram'), 'the first model of the slug is the default and carries nothing');
  const own = json(entry.data_file), carried = json('apsp.json');
  assert.equal(own.model.id, 'randomized-word-ram');
  assert.ok(own.records.length > 0 && own.records.every((r: {kind: string}) => r.kind !== 'baseline'), 'the classic is the carried baseline');
  const ids = new Set(carried.records.map((r: {id: string}) => r.id));
  assert.ok(own.records.every((r: {id: string}) => !ids.has(r.id)));
  for (const key of ['id', 'version', 'symbol', 'direction', 'encoding', 'minimum', 'maximum']) assert.equal(own.score[key], carried.score[key], 'one score scale: ' + key);
  assert.ok(carried.records.some((r: {id: string}) => r.id === 'classical-baseline'));
});

test('only the first model of a race is a race: a later model has its own path, no board and no parity entry', () => {
  const later = registry.problems.filter((p, i) => registry.problems.findIndex(o => o.slug === p.slug) !== i);
  assert.deepEqual(later.map(p => p.problem_id), ['apsp/randomized-word-ram']);
  assert.deepEqual(modelLinks.map(([slug, model]) => slug + '/' + model), later.map(p => p.problem_id));
  const race = /^\/[a-z0-9][a-z0-9-]*$/; // the path rule of bigospeedrun/board sync-boards.ts racesFrom and data/deadman.py races_from
  assert.equal(race.test(modelPath('apsp', 'randomized-word-ram', false)), false);
  assert.equal(race.test(modelPath('apsp', 'word-ram', true)), true);
  assert.equal(modelPath('apsp', 'randomized-word-ram', false), '/apsp/randomized-word-ram');
  assert.ok(!boardSlugs.includes('apsp/randomized-word-ram') && boardUrl('apsp') !== null);
  assert.equal(isPrimaryModel({}), true);
  assert.equal(isPrimaryModel({primary: false}), false);
  assert.equal(modelDisplayName('apsp', 'randomized-word-ram', false, 'x'), 'APSP, randomized');
  assert.equal(modelDisplayName('apsp', 'word-ram', true, 'x'), 'APSP');
  assert.ok(problemLinks.every(([slug]) => race.test('/' + slug)));
});

test('the randomized page has its own canonical and sitemap line; the deterministic alias still shows /apsp', () => {
  assert.equal(pageSeo('/apsp/randomized-word-ram/').canonical, siteOrigin + '/apsp/randomized-word-ram');
  assert.equal(pageSeo('/apsp/randomized-word-ram').noindex, false);
  assert.equal(pageSeo('/apsp/word-ram/').canonical, siteOrigin + '/apsp');
  assert.equal(pageSeo('/apsp/').canonical, siteOrigin + '/apsp');
  assert.ok(sitemapPaths.includes('/apsp/randomized-word-ram'));
  assert.notEqual(pageSeo('/apsp/randomized-word-ram').description, pageSeo('/apsp').description);
  assert.ok(pageDescriptions['/apsp/randomized-word-ram']);
});

// Feed boards: the race's first board and the board of its second model, as the planner sees them.
const rec = (id: string, score: string, evidence = 'Claimed'): FeedRecord => ({id, score, relation: 'attained', evidence, authors: ['Ann'], bound: plainBound('apsp', score)});
const det = (rows: FeedRecord[], leader: string): FeedBoard => ({slug: 'apsp', name: 'APSP', url: 'https://bigospeedrun.com/apsp', leader, direction: 'lower', table: 'big-o', records: rows});
const rnd = (rows: FeedRecord[], leader: string, carried: string[]): FeedBoard => ({slug: 'apsp/randomized-word-ram', name: 'APSP, randomized', url: 'https://bigospeedrun.com/apsp/randomized-word-ram', leader, direction: 'lower', table: 'big-o', carried, records: rows});
const snap = (...boards: FeedBoard[]): FeedSnapshot => ({schema_version: 1, boards});
const D1 = rec('d1', '2995/1000', 'Lean Verified'), D2 = rec('d2', '2993/1000');
const R1 = rec('r1', '2989/1000');

test('a randomized board seen for the first time is seeded: nothing posts, its leader is reserved', () => {
  const before = baseline(snap(det([D1, D2], 'd2')));
  const first = plan(before, snap(det([D1, D2], 'd2'), rnd([D1, D2, R1], 'r1', ['d1', 'd2'])));
  assert.equal(first.messages.length, 0);
  assert.ok(first.state.reserved.some(key => key.startsWith('["apsp/randomized-word-ram","r1"')), 'the leader is reserved');
  assert.ok(first.state.reserved.some(key => key.startsWith('["apsp/randomized-word-ram","d1"')), 'a Lean Verified row is reserved');
  assert.equal(plan(first.state, snap(det([D1, D2], 'd2'), rnd([D1, D2, R1], 'r1', ['d1', 'd2']))).messages.length, 0, 'and stays quiet');
});

test('a new randomized-only leader posts once, with the board name; a new carried leader never posts on the randomized board', () => {
  const start = snap(det([D1, D2], 'd2'), rnd([D1, D2, R1], 'r1', ['d1', 'd2']));
  const seeded = plan(baseline(snap(det([D1, D2], 'd2'))), start).state;
  const R2 = rec('r2', '2985/1000');
  const better = plan(seeded, snap(det([D1, D2], 'd2'), rnd([D1, D2, R1, R2], 'r2', ['d1', 'd2'])));
  assert.equal(better.messages.length, 1);
  assert.match(better.messages[0].content, /APSP, randomized/);
  assert.match(better.messages[0].content, /apsp\/randomized-word-ram/);
  assert.ok(better.messages[0].key.startsWith('["apsp/randomized-word-ram","r2"'));
  // A deterministic row that beats every row: it leads both boards, posts once on the race's own board, never on the randomized one.
  const D3 = rec('d3', '2980/1000');
  const both = plan(seeded, snap(det([D1, D2, D3], 'd3'), rnd([D1, D2, D3, R1], 'd3', ['d1', 'd2', 'd3'])));
  assert.deepEqual(both.messages.map(m => JSON.parse(m.key.slice(0, m.key.lastIndexOf(':')))[0]), ['apsp']);
  // And it takes the lead on the randomized board: a randomized row must beat it to post there.
  const worse = plan(both.state, snap(det([D1, D2, D3], 'd3'), rnd([D1, D2, D3, R1, rec('r3', '2981/1000')], 'd3', ['d1', 'd2', 'd3'])));
  assert.equal(worse.messages.length, 0, 'r3 is worse than the carried leader d3: no post');
});

test('the feed board of a later model is keyed apart, lists its carried rows, and is never sent to X', () => {
  const records = [
    {id: 'd1', score: '2995/1000', scoreRelation: 'attained' as const, date: '2026-10-08', repoId: 1, evidenceLevel: 'claimed' as const, authors: [{name: 'Ann'}], carried: true},
    {id: 'r1', score: '2989/1000', scoreRelation: 'attained' as const, date: '2026-11-20', repoId: 2, evidenceLevel: 'claimed' as const, authors: [{name: 'Bo'}]},
  ];
  const problem = {slug: 'apsp', direction: 'lower-is-better' as const, modelId: 'randomized-word-ram'};
  const board = modelFeedBoard(problem, records, 'APSP, randomized');
  assert.equal(board.slug, 'apsp/randomized-word-ram');
  assert.equal(board.url, 'https://bigospeedrun.com/apsp/randomized-word-ram');
  assert.deepEqual(board.carried, ['d1']);
  assert.equal(board.leader, 'r1');
  assert.equal(board.records[0].bound, feedBoard(problem, records, 'APSP').records[0].bound, 'bounds read as on the race');
  assert.ok(isModelBoardSlug(board.slug) && !isModelBoardSlug('apsp') && !isModelBoardSlug('other-snaky'));
  const entry = (slug: string) => ({key: `["${slug}","r1","2989/1000","attained"]:record`, x_text: 'New claim!\n\nProblem: APSP\nNew value: x'});
  assert.match(worseThanBreakthrough(entry('apsp/randomized-word-ram'), undefined)!, /Discord only/);
  assert.equal(worseThanBreakthrough(entry('apsp'), undefined), undefined);
});
