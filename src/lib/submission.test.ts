import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prove2meCampaigns, prove2meCampaign, verifierProblems} from './submission.ts';

// data/prove2me-trust.json is the reviewed list of campaigns the importer reads; the About page,
// llms.txt and the chat facts take their prove2.me links from prove2meCampaigns.
test('prove2.me campaign links match the campaigns the importer reviews', () => {
  const trust = JSON.parse(readFileSync(new URL('../../data/prove2me-trust.json', import.meta.url), 'utf8'));
  const reviewed = Object.fromEntries(Object.entries(trust.boards as Record<string, {campaign: {slug: string}}>)
    .map(([board, {campaign}]) => [board, 'https://prove2.me/campaigns/' + campaign.slug]));
  assert.deepEqual(prove2meCampaigns, reviewed);
});

test('every race with a campaign also has the verifier, which stays the main path', () => {
  for (const slug of Object.keys(prove2meCampaigns)) assert.ok(verifierProblems.has(slug), slug);
  assert.equal(prove2meCampaign({slug: '3sum'}), 'https://prove2.me/campaigns/3sum-exponent');
  assert.equal(prove2meCampaign({slug: 'exact-dft'}), undefined);
});
