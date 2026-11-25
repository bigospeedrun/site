import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {closedBoards, closedBoardHtml, closedBoardLinks, closedBoardText} from './closed-boards.ts';
import {createKnowledge} from './chat-knowledge.ts';
import type {Problem} from './types.ts';

const matrix = JSON.parse(readFileSync(new URL('../data/matrix-multiplication.json', import.meta.url), 'utf8'));
const value = (score: string) => score.includes('/') ? Number(score.split('/')[0]) / Number(score.split('/')[1]) : Number(score);

// Nil, 2026-11-25 (ask 2e93b417): the matrix multiplication race is closed as Claimed. The line stays true only while the
// board's best row is exactly 9/4, the value the line calls the best possible exponent.
test('only matrix multiplication is a closed Big O race, and its best row is exactly 9/4', () => {
  assert.deepEqual(Object.keys(closedBoards), ['matrix-multiplication']);
  const status = closedBoards['matrix-multiplication'];
  assert.equal(status.label, 'Race closed! (Claimed)');
  assert.match(status.text, /^OpenAI claims that \\\(t = 9\/4\\\) is the best possible exponent: /);
  assert.match(status.text, /We are waiting for independent rebuilds of it\.$/);
  assert.equal(matrix.score.direction, 'lower-is-better');
  assert(matrix.records.some((r: {id: string; score: string}) => r.id === 'openai-matrix-nine-fourths-2026' && r.score === '9/4'));
  assert.deepEqual(matrix.records.filter((r: {score: string}) => value(r.score) < 2.25).map((r: {id: string}) => r.id), [], 'no row below 9/4');
});

test('the closed line links OpenAI\'s preprint and Lean proof at one pinned commit, and holds no raw HTML', () => {
  const {text} = closedBoards['matrix-multiplication'];
  const links = closedBoardLinks(text);
  assert.deepEqual(links.map(l => l.label), ['new preprint', 'Lean proof']);
  assert.equal(links[0].url, 'https://github.com/openai/math/tree/92b516ef8e2abf66c3db7aa31438d3010bc7956f/preprints/The-matrix-multiplication-exponent-is-nine-fourths-November-24-2026');
  assert.equal(links[1].url, 'https://github.com/openai/math/commit/92b516ef8e2abf66c3db7aa31438d3010bc7956f');
  assert.doesNotMatch(text.replace(/\\\(.*?\\\)/g, ''), /[<>&]/);
  const html = closedBoardHtml(text);
  assert.equal(html.match(/<a href="https:\/\/github\.com\/openai\/math\/[^"]+" target="_blank" rel="noopener">/g)?.length, 2);
  assert.match(html, /class="katex"/);
  assert.doesNotMatch(html, /\]\(|\\\(/, 'no link or math source is left');
  assert.equal(closedBoardText(closedBoards['matrix-multiplication']).startsWith('Race closed! (Claimed): OpenAI claims that \\(t = 9/4\\)'), true);
  assert.match(closedBoardText(closedBoards['matrix-multiplication']), /Lean proof \(https:\/\/github\.com\/openai\/math\/commit\/92b516ef8e2abf66c3db7aa31438d3010bc7956f\) is public/);
});

// A closed race says so in the chat knowledge, so the chat does not call it open; no other board carries the field.
test('the chat knowledge marks the matrix multiplication board as closed, and no other board', () => {
  const problem = (slug: string) => ({slug, title: slug, scope: '', symbol: 'omega', direction: 'lower-is-better', lastDataCheck: '2026-11-25', records: [], repos: []}) as unknown as Problem;
  const rows = createKnowledge(['3sum', 'matrix-multiplication', 'exact-dft'].map(problem), '2026-11-25').problems;
  assert.deepEqual(rows.filter(r => 'closed' in r).map(r => r.path), ['/matrix-multiplication']);
  assert.equal(rows.find(r => r.path === '/matrix-multiplication')?.closed, closedBoardText(closedBoards['matrix-multiplication']));
});
