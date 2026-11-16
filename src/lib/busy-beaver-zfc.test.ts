import {test} from 'node:test';
import assert from 'node:assert/strict';
import data from './other-bounds.json' with {type: 'json'};
import {boardUrl} from './board.ts';
import {otherBoundLeader} from './other-leader.ts';
import {otherTableRows, isTableBreakthrough} from './other-table.ts';
import {otherChart} from './other-chart.ts';
import {chartRecords} from './chart.ts';

const race = data.families.find(f => f.slug === 'busy-beaver-zfc')!;

test('Busy Beaver ranks state thresholds down to 215 and keeps the historical qualifications', () => {
  assert.equal(race.direction, 'lower');
  assert.equal(otherBoundLeader(race)?.value, '215');
  assert.equal(boardUrl('other-' + race.slug), 'https://board.bigospeedrun.com/other-busy-beaver-zfc');
  const rows = otherTableRows(race);
  assert.equal(rows.length, 18);
  assert.deepEqual(rows.map(r => r.claim.value), ['215', '230', '253', '254', '335', '336', '354', '361', '393', '432', '549', '588', '636', '643', '745', '748', '1919', '7910']);
  assert.ok(race.claims.every(c => c.evidence === 'claimed'));
  assert.match(race.claims.find(c => c.value === '7910')!.note, /stronger.*assumptions/);
  assert.match(race.claims.find(c => c.value === '215')!.proofScope, /external halting\/refutation equivalences/);
  assert.equal(race.claims.find(c => c.value === '748')!.date.slice(0, 4), '2017');
  assert.equal(race.claims.find(c => isTableBreakthrough(race, c))?.value, '354');
});

test('the historical chart preserves publication-day precision and ends at the table leader', () => {
  const chart = otherChart(race, () => false)!;
  assert.equal(chart.integer, true);
  assert.equal(chart.higher, false);
  assert.equal(chart.classic, 432);
  assert.equal(chart.entries.length, 18);
  assert.equal(chart.entries.find(e => e.score === '745')!.date, '2023-07-05');
  assert.equal(chart.entries.find(e => e.score === '1919')!.date, '2016-05-15');
  const records = chartRecords(chart.entries, new Set(['claimed']), chart.higher);
  assert.equal(records[0].score, '7910');
  assert.equal(records.at(-1)!.score, '215');
  assert.ok(records.every((r, i) => i === 0 || Number(r.score) < Number(records[i-1].score)));
});
