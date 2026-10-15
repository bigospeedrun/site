import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tooltipId} from './tooltip-id.ts';

test('tooltip ids are stable across builds and unique within a page', () => {
 const first = {}, second = {}, rebuild = {};
 const a = tooltipId(first, 'About the plot', '<p>Hover a mark.</p>');
 assert.match(a, /^info-[0-9a-f]{12}$/);
 // The same tooltip on another page, or in a later build, gets the same id.
 assert.equal(tooltipId(second, 'About the plot', '<p>Hover a mark.</p>'), a);
 assert.equal(tooltipId(rebuild, 'About the plot', '<p>Hover a mark.</p>'), a);
 // A repeat on one page gets a suffix; other content gets another id.
 assert.equal(tooltipId(first, 'About the plot', '<p>Hover a mark.</p>'), `${a}-2`);
 assert.notEqual(tooltipId(first, 'Assumptions', '<p>Hover a mark.</p>'), a);
});
