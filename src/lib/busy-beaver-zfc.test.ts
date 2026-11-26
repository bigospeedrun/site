import {test} from 'node:test';
import assert from 'node:assert/strict';
import data from './other-bounds.json' with {type: 'json'};
import {boardUrl} from './board.ts';
import {otherBoundLeader} from './other-leader.ts';
import {otherTableRows, isTableBreakthrough} from './other-table.ts';
import {otherChart} from './other-chart.ts';
import {chartRecords} from './chart.ts';

const race = data.families.find(f => f.slug === 'busy-beaver-zfc')!;

test('Busy Beaver ranks state thresholds down to 192 and keeps the historical qualifications', () => {
  assert.equal(race.direction, 'lower');
  assert.equal(otherBoundLeader(race)?.value, '192');
  assert.equal(boardUrl('other-' + race.slug), 'https://board.bigospeedrun.com/other-busy-beaver-zfc');
  const rows = otherTableRows(race);
  assert.equal(rows.length, 18);
  assert.deepEqual(rows.map(r => r.claim.value), ['192', '207', '209', '215', '230', '253', '254', '335', '354', '432', '549', '588', '636', '643', '745', '748', '1919', '7910']);
  assert.ok(race.claims.every(c => c.evidence === 'claimed'));
  assert.match(race.claims.find(c => c.value === '7910')!.note, /stronger.*assumptions/);
  assert.match(race.claims.find(c => c.value === '215')!.proofScope, /external halting\/refutation equivalences/);
  assert.equal(race.claims.find(c => c.value === '748')!.date.slice(0, 4), '2017');
});

test('the race has no classic baseline and no Agent breakthrough row (Nil, 2026-11-17); Wade 432 is an ordinary row', () => {
  assert.equal('baseline' in race, false);
  assert.equal((race as {noBreakthrough?: boolean}).noBreakthrough, true);
  assert.ok(race.claims.some(c => (c as {agent?: boolean}).agent), 'the claims keep their agent flags; the family opts out');
  assert.ok(otherTableRows(race).every(r => !isTableBreakthrough(race, r.claim)));
  const wade = otherTableRows(race).find(r => r.claim.value === '432')!;
  assert.equal(wade.claim.authors[0].name, 'Andrew James Wade');
  assert.doesNotMatch(race.statement, /baseline/i);
  const chart = otherChart(race, () => false)!;
  assert.equal(chart.classic, undefined);
  assert.equal(chart.classicBound, undefined);
  assert.ok(chart.entries.every(e => !e.isBreakthrough));
});

test('one row per public artifact: smaller steps of one commit sit in the best row note, with Wade named', () => {
  const values = race.claims.map(c => c.value);
  for (const dropped of ['336', '361', '393']) assert.ok(!values.includes(dropped));
  const urls = race.claims.map(c => c.url.replace(/\/blob\/([0-9a-f]{40}).*/, '/$1'));
  assert.equal(new Set(urls.filter(u => u.includes('jeff87654/busy-beaver/'))).size, urls.filter(u => u.includes('jeff87654/busy-beaver/')).length);
  assert.match(race.claims.find(c => c.value === '354')!.note, /393 \(Andrew James Wade.*formalized by Jeff Ketchersid\).*361/);
  assert.match(race.claims.find(c => c.value === '335')!.note, /336 \(R3s336/);
});

test('the historical chart preserves publication-day precision and ends at the table leader', () => {
  const chart = otherChart(race, () => false)!;
  assert.equal(chart.integer, true);
  assert.equal(chart.higher, false);
  assert.equal(chart.entries.length, 18);
  assert.equal(chart.entries.find(e => e.score === '745')!.date, '2023-07-05');
  assert.equal(chart.entries.find(e => e.score === '1919')!.date, '2016-05-15');
  const records = chartRecords(chart.entries, new Set(['claimed']), chart.higher);
  assert.equal(records[0].score, '7910');
  assert.equal(records.at(-1)!.score, '192');
  assert.ok(records.every((r, i) => i === 0 || Number(r.score) < Number(records[i-1].score)));
});

test('K215 includes the later PA proof without upgrading unverified evidence or changing priority', () => {
  const k215 = race.claims.find(c => c.value === '215')!;
  assert.match(k215.note, /elliotglazer\/k215-pa/);
  assert.match(k215.proofScope, /PA proofs.*no value of \\\(\\mathrm\{BB\}\(215\)\\\)/);
  assert.equal(k215.evidence, 'claimed');
  assert.equal(new Date(k215.date).toISOString().slice(0, 10), '2026-10-21');
  assert.doesNotMatch(k215.note, /do not supply an internal PA/);
  const m253 = race.claims.find(c => c.value === '253')!;
  assert.equal(m253.authors[0].name, 'mira-emmy (AI agent)');
  assert.equal(race.claims.find(c => c.value === '254')!.authors[0].name, 'Mira-Cult');
});

// Lead, 2026-11-26 (jamesyc/BusyBeaver intake): James Chang's ZF209, ZF207 and ZF192 are Claimed rows, ZF192 leads; the Peano arithmetic and
// large-cardinal machines in the same repository are not rows of this race.
test('James Chang leads with ZF192; ZF209 and ZF207 are history rows; the repository\'s other machines are not rows', () => {
  const chang = race.claims.filter(c => c.handle === 'jamesyc');
  assert.deepEqual(chang.map(c => c.value), ['209', '207', '192']);
  assert.equal(race.bestHandle, 'jamesyc');
  assert.ok(chang.every(c => c.evidence === 'claimed' && c.author === 'James Chang' && c.authors.length === 1 && c.authors[0].name === 'James Chang'));
  assert.ok(chang.every(c => c.proofScope.length <= 500 && c.proofScope.endsWith('We have not rebuilt the Lean proof.')));
  assert.match(chang[2].note, /started from Elliot Glazer's 230-state K230 machine/);
  assert.match(chang[2].note, /equiconsistency with ZFC/);
  assert.match(chang[2].note, /paper proof with assistance from ChatGPT/);
  assert.doesNotMatch(chang[2].proofScope, /every model of ZF/, 'ZF192 does not prove the reverse implication for nonstandard histories');
  assert.match(chang[2].proofScope, /reverse implication for nonstandard histories is outside the scope/);
  assert.match(chang[1].note, /ZF209's \(developed with assistance from ChatGPT\), adapted to the new table with assistance from Claude Code/);
  assert.ok(chang.every((c, i) => i === 0 || Date.parse(chang[i - 1].date) < Date.parse(c.date)), 'the claims stay in date order');
  assert.ok(race.claims.every((c, i) => i === 0 || Date.parse(race.claims[i - 1].date) <= Date.parse(c.date)));
  for (const slug of ['PA196', 'I3-334', 'I3-380', 'I0-451']) assert.ok(!race.claims.some(c => c.url.includes(slug)), slug);
});
