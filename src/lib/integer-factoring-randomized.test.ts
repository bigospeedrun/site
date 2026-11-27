import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {thetaBound,thetaPlainBound,factoringBound,factoringPlainBound,tableBound,ranked,lBound,lPlainBound} from './ranking.ts';
import {plainBound,postBound,feedBoard,plan,baseline} from './records-feed.ts';
import type {FeedBoard} from './records-feed.ts';
import {worseThanBreakthrough,DISCORD_ONLY} from './x-skip.ts';
import {problemLinks} from './navigation.ts';
import {boardSlugs,boardUrl} from './board.ts';
import {pageDescriptions} from './seo.ts';
import {createKnowledge} from './chat-knowledge.ts';
import {chartRecords,type ChartEntry} from './chart.ts';
import type {Problem,RecordEntry} from './types.ts';

// Randomized integer factoring (Nil's GO, 2026-11-27, ask f70dfad8; Ops brief int-fac-randomized-brief-2026-11-27.md): its own
// race. The score is theta itself, lower is better: expected time 2^{(log N)^{theta+o(1)}} of an algorithm that is always correct.
const json = (name: string) => JSON.parse(readFileSync(new URL('../data/' + name, import.meta.url), 'utf8'));
const SLUG = 'integer-factoring-randomized';

test('theta bounds: a short fraction is exact, any other theta rounds up, and the deterministic theta band reads the same', () => {
  assert.equal(thetaBound('1/2'), '2^{(\\log N)^{1/2+o(1)}}');
  assert.equal(thetaBound('1/3'), '2^{(\\log N)^{1/3+o(1)}}');
  assert.equal(thetaBound('0'), '2^{(\\log N)^{o(1)}}');
  assert.equal(thetaPlainBound('1/3'), '2^((log N)^(1/3 + o(1)))');
  assert.equal(thetaPlainBound('0'), '2^((log N)^o(1))');
  // Lower is better, so a long theta rounds up: the shown bound is never stronger than the score.
  assert.equal(thetaBound('333333333/1000000000', 6), '2^{(\\log N)^{0.33334+o(1)}}');
  // The deterministic board's theta band (score 101 - theta) shows the same text for the same theta.
  assert.equal(factoringBound('302/3'), thetaBound('1/3'));
  assert.equal(factoringPlainBound('302/3'), thetaPlainBound('1/3'));
});

test('a theta row keeps its theta bound in tables; the same text on the deterministic scale stays a deterministic score', () => {
  const row = {score: '1/3', bound: thetaBound('1/3'), scoreScale: 'theta' as const};
  assert.equal(tableBound(row, false, 0), '2^{(\\log N)^{1/3+o(1)}}');
  // Without scoreScale, 1/3 is the deterministic alpha 1/3: the theta text must not turn a theta row into it.
  assert.equal(tableBound({score: '1/3', bound: thetaBound('1/3')}, false, 0), 'N^{1/(\\log\\log N)^{1/3-o(1)}}');
});

test('the board data: its own race, theta from 0 to 1, lower is better, and the Lenstra-Pomerance baseline at 1/2', () => {
  const registry = json('registry.json');
  const entry = registry.problems.find((p: {slug: string}) => p.slug === SLUG);
  assert.deepEqual(entry, {slug: SLUG, problem_id: SLUG + '/randomized-bit-model', data_file: SLUG + '.json', status: 'status-only', race_repo: null});
  assert.equal(registry.problems.filter((p: {slug: string}) => p.slug === SLUG).length, 1, 'one model: a race of its own, not a second model');
  const data = json(SLUG + '.json');
  assert.equal(data.problem_id, entry.problem_id);
  assert.deepEqual([data.score.symbol, data.score.direction, data.score.minimum, data.score.maximum], ['theta', 'lower-is-better', '0', '1']);
  const base = data.records[0];
  assert.deepEqual([base.id, base.kind, base.score, base.l_constant, base.source.url], ['classical-baseline', 'baseline', '1/2', '1', 'https://doi.org/10.1090/S0894-0347-1992-1137100-0']);
  assert.match(data.model.description, /complete factorization into primes/);
  assert.match(data.model.description, /halt with probability 1/);
  assert.match(data.model.description, /unconditional/);
  assert.match(data.model.description, /counts as met when this site lists it as a Lean Verified theorem/);
  assert.match(data.model.description, /L_N\[theta, c\], uses the multitape Turing machine time/);
  assert.deepEqual(json(SLUG + '.json'), JSON.parse(readFileSync(new URL('../../data/' + SLUG + '.json', import.meta.url), 'utf8')), 'src/data is the copy of data/');
});

test('the race is in the Problems menu, has a board slug, a page description and its own scale for the chat', () => {
  assert.ok(problemLinks.some(([slug]) => slug === SLUG));
  assert.ok(boardSlugs.includes(SLUG));
  assert.equal(boardUrl(SLUG), 'https://board.bigospeedrun.com/' + SLUG);
  assert.ok(pageDescriptions['/' + SLUG]);
  const problem = {slug: SLUG, title: 'Randomized integer factoring', scope: '', symbol: 'exponent', direction: 'lower-is-better', lastDataCheck: '2026-11-27',
    modelId: 'randomized-bit-model', records: []} as unknown as Problem;
  const knowledge = createKnowledge([problem], '2026-11-27').problems[0] as {path: string; scoreScale?: string};
  assert.equal(knowledge.path, '/' + SLUG, 'a /<slug> path: the race board and the Discord channel jobs take the race from it');
  assert.match(knowledge.scoreScale!, /^theta, lower is better/);
});

test('ranking: lower theta first; on the same theta the higher evidence level, then the earlier row', () => {
  const row = (id: string, score: string, date: string, evidenceLevel: RecordEntry['evidenceLevel'] = 'claimed') => ({id, score, date, evidenceLevel, repoId: 0}) as unknown as RecordEntry;
  const rows = [row('lp', '1/2', '1992-01-01'), row('later', '1/3', '2026-11-26'), row('first', '1/3', '2026-11-25'), row('verified', '1/3', '2026-11-27', 'lean-verified')];
  assert.deepEqual(ranked(rows, 'lower-is-better').map(r => r.record.id), ['verified', 'first', 'later', 'lp']);
});

// Lead, 2026-11-27 (after the Reviewer's "=1" point): on one theta, rows rank by the stated constant c of L_N[theta, c], lower
// is better, then by evidence level, then by date; such a row shows L_N[theta, c]. c is the record field l_constant.
test('a row that states c shows L_N[theta, c], with c exact', () => {
  assert.equal(lBound('1/3', '105'), 'L_N[1/3,\\,105]');
  assert.equal(lBound('1/3', '297/100'), 'L_N[1/3,\\,2.97]');
  assert.equal(lBound('1/3', '1/3'), 'L_N[1/3,\\,\\tfrac{1}{3}]');
  assert.equal(lPlainBound('1/3', '1013'), 'L_N[1/3, 1013]');
  assert.equal(lPlainBound('1/3', '1/40'), 'L_N[1/3, 0.025]');
  assert.equal(tableBound({score: '1/3', bound: '', scoreScale: 'theta', lConstant: '105'}, false, 0), 'L_N[1/3,\\,105]');
});

test('ranking on one theta: the lower c first, then a row with no c; c ranks before the evidence level, and no row shares a rank', () => {
  const row = (id: string, score: string, date: string, lConstant?: string, evidenceLevel: RecordEntry['evidenceLevel'] = 'claimed') =>
    ({id, score, date, evidenceLevel, repoId: 0, ...(lConstant ? {lConstant} : {})}) as unknown as RecordEntry;
  const rows = [row('lp', '1/2', '1992-01-01', '1'), row('sjtu', '1/3', '2026-11-26', '1013', 'lean-verified'), row('cogentic', '1/3', '2026-11-27', '105'), row('no-c', '1/3', '2026-11-20')];
  const order = ranked(rows, 'lower-is-better');
  assert.deepEqual(order.map(r => [r.record.id, r.rank, r.tie]), [['cogentic', 1, false], ['sjtu', 2, false], ['no-c', 3, false], ['lp', 4, false]]);
  // The same c ties as before: the higher evidence level, then the earlier row.
  const tied = ranked([row('b', '1/3', '2026-11-26', '105'), row('a', '1/3', '2026-11-27', '105', 'lean-verified')], 'lower-is-better');
  assert.deepEqual(tied.map(r => [r.record.id, r.rank, r.tie]), [['a', 1, false], ['b', 1, true]]);
});

test('the chart: a later row at the same theta with a lower c is a progression step, and a higher c is not', () => {
  const entry = (id: string, lConstant: string, time: number): ChartEntry => ({id, repoId: 0, score: '1/3', lConstant, level: 'claimed', time, date: new Date(time).toISOString(), author: id, boundHtml: '', url: '#'});
  const entries = [entry('lp', '1', 0), entry('cogentic', '105', 1), entry('worse', '1013', 2), entry('keybreak', '297/100', 3)];
  entries[0].score = '1/2';
  assert.deepEqual(chartRecords(entries, new Set(['claimed']), false).map(e => e.id), ['lp', 'cogentic', 'keybreak']);
});

test('record posts: a row with c posts L_N[theta, c], and a lower c on the same theta is a new record', () => {
  const author = (name: string) => [{name}];
  const rec = (id: string, lConstant: string, date: string) => ({id, score: '1/3', scoreRelation: 'attained' as const, date, repoId: 0, evidenceLevel: 'claimed' as const, authors: author(id), lConstant});
  const board = (rows: ReturnType<typeof rec>[]): FeedBoard => ({...feedBoard({slug: SLUG, direction: 'lower-is-better'}, rows, 'Randomized Integer Factoring'), table: 'big-o'});
  const first = board([rec('cogentic', '105', '2026-11-25T10:11:06Z'), rec('sjtu', '1013', '2026-11-26T16:11:06Z')]);
  assert.equal(first.leader, 'cogentic');
  assert.equal(postBound(first, first.records[0]), 'L_N[1/3, 105]');
  const next = board([...[rec('cogentic', '105', '2026-11-25T10:11:06Z'), rec('sjtu', '1013', '2026-11-26T16:11:06Z')], rec('better', '297/100', '2026-11-28T00:00:00Z')]);
  assert.equal(next.leader, 'better');
  const {messages} = plan(baseline({schema_version: 1, boards: [first]}), {schema_version: 1, boards: [next]});
  assert.equal(messages.length, 1);
  assert.equal(messages[0].key, JSON.stringify([SLUG, 'better', '1/3', 'attained', '297/100']) + ':record');
  assert.match(messages[0].x_text!, /L_N\[1\/3, 2\.97\]/);
});

test('record posts show the theta bound and never go to X', () => {
  assert.equal(plainBound(SLUG, '1/3'), '2^((log N)^(1/3 + o(1)))');
  const records = [{id: 'a', score: '1/3', scoreRelation: 'attained' as const, date: '2026-11-25T10:21:00Z', repoId: 0, evidenceLevel: 'claimed' as const, authors: [{name: 'A'}]}];
  const board: FeedBoard = {...feedBoard({slug: SLUG, direction: 'lower-is-better'}, records, 'Randomized Integer Factoring'), table: 'big-o'};
  assert.equal(board.leader, 'a');
  assert.equal(postBound(board, board.records[0]), '2^((log N)^(1/3 + o(1)))');
  assert.ok(DISCORD_ONLY.includes(SLUG));
  const key = JSON.stringify([SLUG, 'a', '1/3', 'attained']);
  for (const kind of ['record', 'lean'])
    assert.match(worseThanBreakthrough({key: key + ':' + kind, x_text: 'New claim!'}, undefined)!, /Discord only/);
  assert.equal(worseThanBreakthrough({key: JSON.stringify(['integer-factoring', 'a', '0', 'attained']) + ':record', x_text: 'New claim!'}, undefined), undefined);
  // A seeded board posts nothing for its first rows.
  const seeded = baseline({schema_version: 1, boards: [board]});
  assert.deepEqual(plan(seeded, {schema_version: 1, boards: [board]}).messages, []);
});
