import {test} from 'node:test';
import assert from 'node:assert/strict';
import data from './other-bounds.json' with {type: 'json'};
import prove2me from '../data/prove2me.json' with {type: 'json'};
import direct from '../data/direct-other.json' with {type: 'json'};
import {mergeProve2me, mergeDirect} from './other-merge.ts';
import {otherTableRows, isTableBreakthrough, shownLevel} from './other-table.ts';
import {otherClaimNumber} from './other-rank.ts';
import {evidenceLevels, isVisibleAtEvidence} from './evidence.ts';
import {chartRecords, chartScale, chartWindow, chartWindowScale} from './chart.ts';
import {scoreNumber} from './ranking.ts';
import {exactScore, claimScore, otherChart, otherChartIds} from './other-chart.ts';

const families = (mergeDirect(mergeProve2me(data as any, prove2me as any), direct as any) as any).families as any[];
const reviewed = () => false;

test('a number becomes an exact score with the same value', () => {
  assert.equal(exactScore(21), '21');
  assert.equal(exactScore(0.6731134), '6731134/10000000');
  assert.equal(exactScore(1500), '1500');
  for (const x of [0.6731134, 2 ** -310, 3.18e-236, 2.000252, 1 / 3]) assert.equal(scoreNumber(exactScore(x)), x);
});

test('a row score is its exact fraction or integer, else the number the ranking reads; none for a value without one', () => {
  assert.equal(claimScore({display: '\\approx0.9375', value: '15/16'}), '15/16');
  assert.equal(claimScore({display: '19', value: '19'}), '19');
  assert.equal(claimScore({display: '\\approx0.6725007', value: '\\tfrac32-\\tfrac{1}{\\sqrt2}\\cot\\tfrac{1}{\\sqrt2}'}), '6725007/10000000');
  for (const display of ['+\\infty', '\\log(20)/784', '80{,}000d^{17}']) assert.equal(claimScore({display, value: display}), null);
});

test('a page has a chart exactly when every row of its table, and a classic baseline, has a number', () => {
  for (const f of families) {
    const rows = otherTableRows(f).map(r => r.claim);
    const classic = f.baseline?.label ? otherClaimNumber({display: f.baseline.display ?? f.baseline.value, value: f.baseline.exactValue}) : 0;
    assert.equal(otherChart(f, reviewed) !== undefined, rows.every(c => claimScore(c) !== null) && classic !== null, f.slug);
  }
});

test('at every set of evidence levels the chart ends at the first row that the table shows', () => {
  let charts = 0;
  for (const f of families) {
    const chart = otherChart(f, reviewed);
    if (!chart) continue;
    charts++;
    const rows = otherTableRows(f).map(r => r.claim);
    const ids = otherChartIds(rows);
    assert.equal(new Set(chart.entries.map(e => e.id)).size, chart.entries.length, f.slug + ' ids');
    for (let mask = 0; mask < 2 ** evidenceLevels.length; mask++) {
      const levels = evidenceLevels.filter((_, i) => mask & (1 << i)).map(l => l.id);
      const shown = rows.filter(c => isVisibleAtEvidence({isBreakthrough: isTableBreakthrough(f, c), evidenceLevel: shownLevel(c, false)}, levels));
      const end = chartRecords(chart.entries, new Set(levels), chart.higher).at(-1);
      const top = shown[0];
      assert.equal(end?.id, top && ids[rows.indexOf(top)], f.slug + ' ' + levels);
      assert.equal(end?.score, top && claimScore(top), f.slug + ' ' + levels);
      assert.equal(end?.id.split(':')[0], top?.handle, f.slug + ' ' + levels);
    }
  }
  assert.ok(charts > 0);
});

test('Snaky: the OpenAI baseline is the Agent breakthrough point, with no dashed line', () => {
  const chart = otherChart(families.find(f => f.slug === 'snaky'), reviewed)!;
  const start = chart.entries.find(e => e.isBreakthrough)!;
  assert.equal(start.id, 'openai-baseline:21');
  assert.equal(start.score, '21');
  assert.equal(chart.higher, false);
  assert.equal(chart.classic, undefined);
});

test('a classic baseline is the dashed line, and its first agent claim is the breakthrough point', () => {
  const chart = otherChart(families.find(f => f.slug === 'critical-line-zeros'), reviewed)!;
  assert.equal(chart.classic, 0.407511);
  assert.equal(chart.entries.find(e => e.isBreakthrough)?.id.split(':')[0], 'anthropic');
  assert.ok(!chart.entries.some(e => e.id.startsWith('openai-baseline:')));
});

test('a chart of whole numbers has whole-number ticks only, at every range', () => {
  for (const values of [[19, 20, 21], [21], [186, 246], [2, 3]]) {
    const ticks = chartScale(values, undefined, true).ticks;
    assert.ok(ticks.length > 1 || values.length === 1, String(values));
    assert.ok(ticks.every(t => Number.isInteger(t.value)), String(values) + ' ' + ticks.map(t => t.tex));
  }
  assert.ok(chartScale([19, 20, 21]).ticks.some(t => !Number.isInteger(t.value)));
  const snaky = otherChart(families.find(f => f.slug === 'snaky'), reviewed)!;
  assert.equal(snaky.integer, true);
  const all = new Set(evidenceLevels.map(l => l.id));
  for (const days of [0, 1, 3, 30]) {
    const scale = chartWindowScale(chartWindow(snaky.entries, all, snaky.higher, days * 24), undefined, days > 0, snaky.classic, snaky.integer);
    assert.ok(scale.ticks.every(t => Number.isInteger(t.value)), 'days ' + days);
  }
  assert.equal(otherChart(families.find(f => f.slug === 'critical-line-zeros'), reviewed)!.integer, false);
});

test('an author who beats their own row adds a step, and two rows with the same handle and value keep apart', () => {
  assert.deepEqual(otherChartIds([{handle: 'a', value: '1'}, {handle: 'a', value: '2'}, {handle: 'a', value: '1'}]), ['a:1', 'a:2', 'a:1#2']);
  const row = (value: string, date: string) => ({handle: 'a', display: value, value, bound: value, date, url: 'https://example.org', evidence: 'claimed', authors: [{name: 'A'}]});
  const family = {direction: 'higher', claims: [row('2', '2026-10-08T00:00:00Z'), row('3', '2026-10-09T00:00:00Z')],
    baseline: {value: '1', exactValue: '1', bound: '1', url: 'https://example.org', date: '2026-10-07T00:00:00Z'}};
  const chart = otherChart(family, reviewed)!;
  assert.deepEqual(chartRecords(chart.entries, new Set(evidenceLevels.map(l => l.id)), chart.higher).map(e => e.score), ['1', '2', '3']);
});

import {surdScore} from './other-chart.ts';
import {parseExact as exactOf} from './other-rank.ts';
import {compare as compareScores} from './ranking.ts';
// Lead, 2026-11-11, quasi-Riemann #129: (777-sqrt(1081))/852 is 2.16e-254 below #103's fraction T; a float score
// would chart them as one value.
test('a surd value charts as its 300-decimal fraction, rounded down, below #103', () => {
  const B2 = '\\frac{777-\\sqrt{1081}}{852}';
  const T = '2804966284017490358030969257914123810640482798488248385236764587735806455694206308975383836842958115341512355256943573632654341/3211614609922119834694179379888743028634953588197852962423516288191911449231164741438582626063161096341458934143644085157872271';
  const score = claimScore({display: '0.873381966613207519929026778643', value: B2})!;
  assert.match(score, /^8733819666132075199290267786423718694050155885349089305521885\d{239}\/10{300}$/);
  assert.equal(compareScores(score, T), -1);
  assert.equal(surdScore(exactOf('\\frac{2+\\sqrt{4}}{2}')!), '2' + '0'.repeat(300) + '/1' + '0'.repeat(300));
  assert.ok(surdScore(exactOf('\\frac{0-\\sqrt{2}}{1}')!).startsWith('-14142135623730950488016887242096980'));
  // A surd that disagrees with its display charts as the display.
  assert.equal(claimScore({display: '0.9', value: B2}), '9/10');
});
