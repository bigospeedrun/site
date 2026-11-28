import {test} from 'node:test';
import assert from 'node:assert/strict';
import {kappaExponentFraction,tableBound} from './ranking.ts';
import {plainBound,postBound,feedBoard} from './records-feed.ts';

// Lead, 2026-11-28: on the kappa boards (integer multiplication, exact DFT), a short exact 1 - kappa shows as the
// exponent itself: kappa = 1/2 is O(n log^{1/2} n), not O(n log^{1-0.5} n). A long saving keeps the saving form.
test('a short exact 1 - kappa is the exponent; a long saving, kappa = 0 and a large denominator are not', () => {
  assert.equal(kappaExponentFraction('1/2'), '1/2');
  assert.equal(kappaExponentFraction('2/6'), '2/3');
  assert.equal(kappaExponentFraction('1/100'), '99/100');
  assert.equal(kappaExponentFraction('1/101'), undefined);
  assert.equal(kappaExponentFraction('39/10000'), undefined);
  assert.equal(kappaExponentFraction('0'), undefined);
});

test('table bound: the fraction form for a short 1 - kappa, strict and attained; the saving form otherwise', () => {
  assert.equal(tableBound({score: '1/2', scoreRelation: 'strict-upper-bound', bound: ''}, true, 3), 'O(n \\log^{1/2+\\varepsilon} n)');
  assert.equal(tableBound({score: '1/2', bound: ''}, true, 3), 'O(n \\log^{1/2} n)');
  assert.equal(tableBound({score: '39/10000', bound: ''}, true, 2), 'O(n \\log^{1-3.9\\cdot 10^{\\scriptstyle -3}} n)');
});

test('feed text: the fraction form in plain text, with the epsilon clause for a strict row; long savings unchanged', () => {
  assert.equal(plainBound('integer-multiplication', '1/2', 'strict-upper-bound'), 'O(n log^(1/2 + epsilon) n), for every fixed epsilon > 0');
  assert.equal(plainBound('exact-dft', '1/2'), 'O(n log^(1/2) n)');
  assert.equal(plainBound('integer-multiplication', '39/10000', 'attained', 2), 'O(n log^(1 - 0.0039) n)');
  const row = (id: string, score: string) => ({id, score, scoreRelation: 'strict-upper-bound' as const, date: '2026-11-24T00:00:00Z', repoId: 0, evidenceLevel: 'claimed' as const, authors: [{name: id}]});
  const board = feedBoard({slug: 'integer-multiplication', direction: 'higher-is-better'}, [row('a', '39/10000'), row('b', '1/2')], 'Integer Multiplication');
  assert.equal(postBound(board, board.records.find(r => r.id === 'b')!), 'O(n log^(1/2 + epsilon) n), for every fixed epsilon > 0');
});
