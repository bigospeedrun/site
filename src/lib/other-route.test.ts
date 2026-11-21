import {test} from 'node:test';
import assert from 'node:assert/strict';
import data from './other-bounds.json' with {type: 'json'};
import {isClosedRace, leanRoute, routeEvidenceUrl, closedRaceRule} from './other-route.ts';
import {shownLevel, otherTableRows} from './other-table.ts';
import {otherBoundLeader} from './other-leader.ts';
import {evidenceOrder} from './evidence.ts';

// The landing page lists a closed race in its own group "Closed races", and the other races stay in the open list
// (OtherBounds.astro filters with isClosedRace). Nil's design, 2026-11-20; board and Discord channel stay (one per race).
test('the closed race leaves the open list for the Closed races group, and every other race stays open', () => {
  const open = data.families.filter(f => !isClosedRace(f)).map(f => f.slug);
  const closed = data.families.filter(isClosedRace).map(f => f.slug);
  assert.deepEqual(closed, ['quasi-riemann']);
  assert.equal(open.length + closed.length, data.families.length);
  assert(!open.includes('quasi-riemann'));
  assert(open.includes('critical-line-zeros'), 'the critical-line race stays open');
  assert.equal(isClosedRace({}), false);
  assert.equal(isClosedRace({closedStatus: {label: 'Race closed', text: 'x'}}), true);
});

// The closed race keeps one board and one Discord channel: it stays a family of other-bounds.json with its slug,
// which is what the board and channel parity check reads.
test('the closed race is still a row of the data, so its board and channel stay', () => {
  assert.equal(data.families.filter(f => f.slug === 'quasi-riemann').length, 1);
  assert.equal(new Set(data.families.map(f => f.slug)).size, data.families.length);
});

test('the Lean Verified claim of the route leads the closed race and ranks as Lean Verified', () => {
  const family = data.families.find(f => f.slug === 'quasi-riemann')!;
  const leader = otherBoundLeader(family)!;
  assert.equal(leader.handle, leanRoute(family)!.handle);
  assert.equal(leader.value, '1/2');
  assert.equal(shownLevel(leader, false), 'lean-verified');
  assert.equal(evidenceOrder(leader.evidence), 2);
  const first = otherTableRows(family)[0];
  assert.equal(first.claim.handle, leader.handle);
  assert.equal(first.rank, 1);
  // The level label of the claim opens the first public rebuild; no other claim of the race gets that link.
  assert.equal(routeEvidenceUrl(family, leader), 'https://math.mit.edu/~drew/grh/');
});

// The landing page states the rule of a closed race in full, and every closed race meets its Lean Verified half.
test('the Closed races sentence states the full rule and every closed race has a Lean Verified leader', () => {
  assert.equal(closedRaceRule, 'A race is closed when its best bound is the best possible value and that bound is Lean Verified.');
  for (const family of data.families.filter(isClosedRace)) assert.equal(shownLevel(otherBoundLeader(family)!, false), 'lean-verified', family.slug);
});
