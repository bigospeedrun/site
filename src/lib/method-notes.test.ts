import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildSystemPrompt, createKnowledge} from './chat-knowledge.ts';
import {methodNoteFor} from './method-notes.ts';
import type {Problem, RecordEntry} from './types.ts';

// A note on how a record is proved (data/method-notes.json) reaches the chat facts as `method` on a current
// leader, and the prompt tells the bot to use it and to admit a gap. The tooltip text comes from the same field.
const record = (id: string, score: string, methodNote?: string): RecordEntry => ({
  id, score, upstreamStatus: 'merged', eligible: true, bound: 'O(n \\log n)', evidenceLevel: 'lean-verified',
  repo: 'bigospeedrun/verifier', repoId: 1, date: '2026-10-22', dateLabel: 'Source date',
  authors: [{name: 'author', url: 'https://github.com/author'}], evidence: [{name: 'Source', url: 'https://github.com/example/proof'}],
  dependencies: [], comparisonNote: '', title: id, predecessors: [], status: '', comparison: '', ...(methodNote ? {methodNote} : {}),
});
const board = (records: RecordEntry[]) => ({slug: 'exact-dft', title: 'Exact DFT', scope: 'Exact arithmetic', symbol: 'kappa', direction: 'higher-is-better', lastDataCheck: '2026-10-23', records}) as unknown as Problem;

test('a leader with a method note carries it as method; a leader without one has no method field', () => {
  const withNote = createKnowledge([board([record('old', '1/100'), record('leader', '1/50', 'It runs a tensor power of a unit.')])], '2026-10-23');
  const [leader] = withNote.problems[0].current as {id: string; method?: string}[];
  assert.equal(leader.id, 'leader'); assert.equal(leader.method, 'It runs a tensor power of a unit.');
  const without = createKnowledge([board([record('old', '1/100', 'An old note.'), record('leader', '1/50')])], '2026-10-23');
  const [bare] = without.problems[0].current as Record<string, unknown>[];
  assert.equal(bare.id, 'leader'); assert.equal('method' in bare, false);
  // The note of a row that is not the leader stays out of the facts of the leader list.
  assert.doesNotMatch(JSON.stringify(without.problems[0].current), /An old note/);
});

test('the prompt sends how-proved questions to the method field and admits a missing one', () => {
  const prompt = buildSystemPrompt(createKnowledge([board([record('leader', '1/50', 'A note.')])], '2026-10-23'), '/', false);
  assert.match(prompt, /For how a record was proved, use the method field of its entry/);
  assert.match(prompt, /If the entry has no method field, say that the site facts hold no method text/);
});

// The credit note that the record table shows (record_metadata credit_note) reaches the leader's facts as credit, with the
// earlier entry it names as builtOn, so the bot can answer which entries a record builds on (lead, 2026-10-29).
test('a leader with a credit note carries it as credit and builtOn; the prompt sends lineage questions there', () => {
  const credited = {...record('leader', '1/50'), creditNote: 'It builds on submission #40.', predecessors: ['https://github.com/bigospeedrun/verifier/pull/40']};
  const knowledge = createKnowledge([board([record('old', '1/100'), credited])], '2026-10-29');
  const [leader] = knowledge.problems[0].current as {credit?: string; builtOn?: string}[];
  assert.equal(leader.credit, 'It builds on submission #40.');
  assert.equal(leader.builtOn, 'https://github.com/bigospeedrun/verifier/pull/40');
  const [bare] = createKnowledge([board([record('leader', '1/50')])], '2026-10-29').problems[0].current as Record<string, unknown>[];
  assert.equal('credit' in bare || 'builtOn' in bare, false);
  assert.match(buildSystemPrompt(knowledge, '/', false), /For credit, or which earlier entries a record builds on, use the credit field/);
});

test('a row takes its own note, else the board note of its repository, else none', () => {
  const notes = {boards: {'integer-multiplication': {own: 'Its own note.', blank: '  '}}, board_notes: {'integer-multiplication': [{repo: 'CrocSwap/integer-mult-bounds', text: 'The CrocSwap note.'}]}};
  const note = (id: string, repo: string, slug = 'integer-multiplication') => methodNoteFor(notes, slug, id, repo);
  assert.equal(note('own', 'CrocSwap/integer-mult-bounds'), 'Its own note.');
  assert.equal(note('any-new-leader', 'CrocSwap/integer-mult-bounds'), 'The CrocSwap note.');
  assert.equal(note('blank', 'CrocSwap/integer-mult-bounds'), 'The CrocSwap note.');
  assert.equal(note('x', 'other/repo'), undefined);
  assert.equal(note('any-new-leader', 'CrocSwap/integer-mult-bounds', 'apsp'), undefined);
  assert.equal(methodNoteFor(undefined, 'apsp', 'x', 'a/b'), undefined);
});

test('the reviewed notes file: plain text up to 500 characters on known boards; a row that left its board is not an error', t => {
  const root = new URL('../../', import.meta.url);
  const notes = JSON.parse(readFileSync(new URL('data/method-notes.json', root), 'utf8')) as {schema_version: number; boards: Record<string, Record<string, string>>; board_notes?: Record<string, {repo: string; text: string}[]>};
  const registry = JSON.parse(readFileSync(new URL('data/registry.json', root), 'utf8')) as {problems: {slug: string; data_file: string}[]};
  const plain = (text: string) => text.length > 0 && text.length <= 500 && text === text.trim() && !/[<>&\\$\n]/.test(text);
  assert.equal(notes.schema_version, 1);
  for (const [slug, rows] of Object.entries(notes.boards)) {
    const entry = registry.problems.find(p => p.slug === slug);
    assert.ok(entry, 'unknown board ' + slug);
    const ids = new Set((JSON.parse(readFileSync(new URL('data/' + entry.data_file, root), 'utf8')) as {records: {id: string}[]}).records.map(r => r.id));
    for (const [id, text] of Object.entries(rows)) {
      assert.ok(plain(text), `${slug}/${id} note is not plain text`);
      // Rows leave a board by themselves (a withdrawn submission, a closed issue, a hold): report it, never fail.
      if (!ids.has(id)) t.diagnostic(`${slug}/${id} is not on the board`);
    }
  }
  for (const [slug, shared] of Object.entries(notes.board_notes ?? {})) {
    assert.ok(registry.problems.some(p => p.slug === slug), 'unknown board ' + slug);
    for (const note of shared) assert.ok(/^[\w.-]+\/[\w.-]+$/.test(note.repo) && plain(note.text), `${slug}/${note.repo} board note`);
  }
  // The committed site copy matches the reviewed file.
  assert.equal(readFileSync(new URL('src/data/method-notes.json', root), 'utf8'), readFileSync(new URL('data/method-notes.json', root), 'utf8'));
});
