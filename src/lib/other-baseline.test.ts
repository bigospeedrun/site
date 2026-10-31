import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createKnowledge, type OtherBoundsData} from './chat-knowledge.ts';

const family: OtherBoundsData['families'][number] = {
  slug: 'binary-polynomial-multiplication', name: 'Binary polynomial multiplication',
  quantity: '\\kappa', direction: 'higher', statement: 'Multiply ordinary binary polynomials.',
  bestHandle: 'example',
  baseline: {label: 'Historical benchmark', bound: 'O(n \\log n 4^{\\log^* n})',
    url: 'https://example.org/2019-paper', date: '2019', datePrecision: 'year'},
  claims: [{handle: 'example', bound: 'O(n \\log^{1-2^{-38}} n)', value: '1/274877906944',
    display: '2^{-38}', note: '', url: 'https://example.org/claim', date: '2026-10-31',
    evidence: 'claimed', proofScope: 'Written proof; full formalization remains unfinished.',
    authors: [{name: 'Example author'}]}],
  repos: [],
};

test('a historical benchmark preserves its label and year without becoming an OpenAI family', () => {
  const knowledge = createKnowledge([], '2026-10-31', undefined, {checkedAt: '2026-10-31', families: [family]});
  const row = knowledge.otherBounds.rows[0];
  assert.deepEqual(row.baseline, {label: 'Historical benchmark', bound: family.baseline.bound,
    source: family.baseline.url, date: '2019', datePrecision: 'year'});
  assert.equal(Object.hasOwn(row, 'openaiFamily'), false);
  assert.equal(row.current.evidence, 'Claimed');
  assert.match(knowledge.otherBounds.about, /cited starting bound/);
  assert.doesNotMatch(knowledge.otherBounds.about, /Each row ranks one quantity against the OpenAI baseline/);
});

test('existing OpenAI family metadata keeps its default baseline label and full date', () => {
  const row = createKnowledge([], '2026-10-31', undefined, {checkedAt: '2026-10-31', families: [{
    ...family, family: '003', baseline: {bound: '7/8', url: 'https://example.org/original', date: '2026-10-06T21:58:00Z'},
  }]}).otherBounds.rows[0];
  assert.equal(row.openaiFamily, '003');
  assert.deepEqual(row.baseline, {label: 'OpenAI baseline', bound: '7/8', source: 'https://example.org/original', date: '2026-10-06'});
});
