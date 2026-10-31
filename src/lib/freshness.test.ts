import {test} from 'node:test';
import assert from 'node:assert/strict';
import {acceptedRaceRecord} from './ranking.ts';
import {isLiveRace,localTimeFallback} from './freshness.ts';
test('live race expires at 24 hours and excludes unknown or future times',()=>{
 const now=Date.parse('2026-10-09T12:00:00Z');
 assert(isLiveRace('2026-10-08T12:00:01Z',now));
 for(const value of ['2026-10-08T12:00:00Z','2026-10-09T12:00:01Z','invalid',undefined])assert(!isLiveRace(value,now));
});
test('freshness uses a minute-resolution PT fallback and preserves date-only precision',()=>{
 assert.equal(localTimeFallback('2026-10-09'),'Oct 9');
 assert.equal(localTimeFallback('2026-10-09T12:30:45+02:00'),'Oct 9, 3:30 AM PT');
 // A date from another year shows its year.
 assert.equal(localTimeFallback('2015-10-17T19:13:00+03:00'),'Oct 17, 2015, 9:13 AM PT');
});

test('selected main-branch checkpoints can rank without a merged PR',()=>{
 assert(acceptedRaceRecord({eligible:true,upstreamStatus:'not-applicable',upstreamSelected:true}));
 assert(!acceptedRaceRecord({eligible:true,upstreamStatus:'not-applicable'}));
 assert(!acceptedRaceRecord({eligible:false,upstreamStatus:'merged',upstreamSelected:true}));
 assert(!acceptedRaceRecord({eligible:true,upstreamStatus:'open'}));
 assert(!acceptedRaceRecord({eligible:true,upstreamStatus:'open',upstreamSelected:true}));
});
