import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {closedBoards, boardNotices, closedBoardLinks, closedBoardText} from './closed-boards.ts';
import {closedBoardHtml} from './closed-boards-html.ts';
import {createKnowledge} from './chat-knowledge.ts';
import type {Problem} from './types.ts';

const matrix = JSON.parse(readFileSync(new URL('../data/matrix-multiplication.json', import.meta.url), 'utf8'));
const value = (score: string) => score.includes('/') ? Number(score.split('/')[0]) / Number(score.split('/')[1]) : Number(score);

// Nil, 2026-11-25 (ask 2e93b417): the matrix multiplication race is closed; Lean Verified since two independent rebuilds
// passed (Lead, 2026-11-25). The line stays true only while the board's best row is exactly 9/4, the value the line calls
// the best possible exponent.
test('only matrix multiplication is a closed Big O race, and its best row is exactly 9/4', () => {
  assert.deepEqual(Object.keys(closedBoards), ['matrix-multiplication']);
  const status = closedBoards['matrix-multiplication'];
  assert.equal(status.label, 'Race closed! (Lean Verified)');
  assert.match(status.text, /^OpenAI's \[new preprint\]\([^)]+\) proves that \\\(t = 9\/4\\\) is the best possible exponent for division-free circuits, the model of this board: /);
  assert.match(status.text, /Two independent rebuilds of the \[Lean proof\]\([^)]+\) passed: \[our verifier run\]\([^)]+\) \(with its \[stored receipt\]\([^)]+\)\) and \[Carlos Toledo's check\]\([^)]+\)\.$/);
  assert.equal(matrix.score.direction, 'lower-is-better');
  assert(matrix.records.some((r: {id: string; score: string}) => r.id === 'openai-matrix-nine-fourths-2026' && r.score === '9/4'));
  assert.deepEqual(matrix.records.filter((r: {score: string}) => value(r.score) < 2.25).map((r: {id: string}) => r.id), [], 'no row below 9/4');
});

test('the closed line links OpenAI\'s preprint and Lean proof at one pinned commit, both rebuilds, and holds no raw HTML', () => {
  const {text} = closedBoards['matrix-multiplication'];
  const links = closedBoardLinks(text);
  assert.deepEqual(links.map(l => l.label), ['new preprint', 'Lean proof', 'our verifier run', 'stored receipt', 'Carlos Toledo\'s check']);
  assert.equal(links[0].url, 'https://github.com/openai/math/tree/92b516ef8e2abf66c3db7aa31438d3010bc7956f/preprints/The-matrix-multiplication-exponent-is-nine-fourths-November-24-2026');
  assert.equal(links[1].url, 'https://github.com/openai/math/blob/92b516ef8e2abf66c3db7aa31438d3010bc7956f/lean/OAI/LinearAlgebra/SpectralBooks/ExactExponent.lean#L11');
  assert.equal(links[2].url, 'https://github.com/bigospeedrun/verifier/actions/runs/45538609390');
  assert.equal(links[3].url, 'https://bigospeedrun.com/sources/matrix-exponent-45538609390-1-source.json');
  assert(existsSync(new URL('../../public/sources/matrix-exponent-45538609390-1-source.json', import.meta.url)), 'the stored receipt is in public/');
  assert.equal(links[4].url, 'https://github.com/carlostoledo1891/cert-machine/tree/801cd9c19c7dfa3ff339088bebe1e5c1bf07d1cf/corpus/omega-nine-fourths/runs/p1/pod');
  assert.doesNotMatch(text.replace(/\\\(.*?\\\)/g, ''), /[<>&]/);
  const html = closedBoardHtml(text);
  assert.equal(html.match(/<a href="https:\/\/github\.com\/openai\/math\/[^"]+" target="_blank" rel="noopener">/g)?.length, 2);
  assert.equal(html.match(/<a href="https:\/\/github\.com\/[^"]+" target="_blank" rel="noopener">/g)?.length, 4);
  assert.equal(html.match(/<a href="https:\/\/bigospeedrun\.com\/sources\/[^"]+" target="_blank" rel="noopener">/g)?.length, 1);
  assert.match(html, /class="katex"/);
  assert.doesNotMatch(html, /\]\(|\\\(/, 'no link or math source is left');
  assert.equal(closedBoardText(closedBoards['matrix-multiplication']).startsWith('Race closed! (Lean Verified): OpenAI\'s new preprint (https://github.com/openai/math/tree/'), true);
  assert.match(closedBoardText(closedBoards['matrix-multiplication']), /Lean proof \(https:\/\/github\.com\/openai\/math\/blob\/92b516ef8e2abf66c3db7aa31438d3010bc7956f\/lean\/OAI\/LinearAlgebra\/SpectralBooks\/ExactExponent\.lean#L11\) passed/);
});

// A closed race says so in the chat knowledge, so the chat does not call it open; no other board carries the field.
test('the chat knowledge marks the matrix multiplication board as closed, and no other board', () => {
  const problem = (slug: string) => ({slug, title: slug, scope: '', symbol: 'omega', direction: 'lower-is-better', lastDataCheck: '2026-11-25', records: [], repos: []}) as unknown as Problem;
  const rows = createKnowledge(['3sum', 'matrix-multiplication', 'exact-dft'].map(problem), '2026-11-25').problems;
  assert.deepEqual(rows.filter(r => 'closed' in r).map(r => r.path), ['/matrix-multiplication']);
  assert.equal(rows.find(r => r.path === '/matrix-multiplication')?.closed, closedBoardText(closedBoards['matrix-multiplication']));
});

// Lead, 2026-11-25: OpenAI's linear-circuit Fourier result is a note on the exact-dft board, not a row and not a closed line.
const dft = JSON.parse(readFileSync(new URL('../data/exact-dft.json', import.meta.url), 'utf8'));
test('the exact-dft board carries one note, links OpenAI at the pinned commit, and no row exceeds 1/2', () => {
  assert.deepEqual(Object.keys(boardNotices), ['exact-dft']);
  assert.equal(closedBoards['exact-dft'], undefined, 'the race is not closed');
  const text = boardNotices['exact-dft'];
  const links = closedBoardLinks(text);
  assert.deepEqual(links.map(l => l.label), ['new preprint', 'Lean proof']);
  assert.equal(links[0].url, 'https://github.com/openai/math/tree/92b516ef8e2abf66c3db7aa31438d3010bc7956f/preprints/The-logarithmic-exponent-of-finite-Fourier-transforms-November-24-2026');
  assert.equal(links[1].url, 'https://github.com/openai/math/blob/92b516ef8e2abf66c3db7aa31438d3010bc7956f/lean/OAI/LinearAlgebra/FiniteFourier/Main.lean#L17');
  assert.doesNotMatch(text.replace(/\\\(.*?\\\)/g, ''), /[<>&]/);
  assert.match(closedBoardHtml(text), /class="katex"/);
  assert.equal(dft.score.direction, 'higher-is-better');
  assert.deepEqual(dft.records.filter((r: {score: string}) => value(r.score) > 0.5).map((r: {id: string}) => r.id), [], 'the note says no row can exceed 1/2');
  assert(dft.records.every((r: {score: string}) => value(r.score) < 0.5), 'every row is below the 1/2 the note calls the ceiling');
});

test('the chat knowledge carries the exact-dft note, and no other board', () => {
  const problem = (slug: string) => ({slug, title: slug, scope: '', symbol: 'kappa', direction: 'higher-is-better', lastDataCheck: '2026-11-25', records: [], repos: []}) as unknown as Problem;
  const rows = createKnowledge(['3sum', 'matrix-multiplication', 'exact-dft'].map(problem), '2026-11-25').problems;
  assert.deepEqual(rows.filter(r => 'note' in r).map(r => r.path), ['/exact-dft']);
  assert.match(String(rows.find(r => r.path === '/exact-dft')?.note), /new preprint \(https:\/\/github\.com\/openai\/math\/tree\/92b516ef8e/);
  assert.equal('closed' in (rows.find(r => r.path === '/exact-dft') ?? {}), false);
});
