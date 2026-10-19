import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prove2meCampaigns, prove2meCampaign, prove2meCampaignForOther, verifierProblems} from './submission.ts';

// data/prove2me-trust.json is the reviewed list of campaigns the importer reads. The pages take their
// prove2.me links from src/lib/prove2me-campaigns.ts, which scripts/sync-data.mjs derives from it.
test('prove2.me campaign links match the active campaigns the importer reviews', () => {
  const trust = JSON.parse(readFileSync(new URL('../../data/prove2me-trust.json', import.meta.url), 'utf8'));
  const reviewed = Object.fromEntries(Object.entries(trust.boards as Record<string, {campaign: {slug: string; status: string}}>)
    .filter(([, {campaign}]) => campaign.status === 'active')
    .map(([board, {campaign}]) => [board, 'https://prove2.me/campaigns/' + campaign.slug]));
  assert.deepEqual(prove2meCampaigns, reviewed);
  assert.ok(Object.keys(reviewed).length >= 4);
});

test('lookups by race and by Other bounds row', () => {
  assert.equal(prove2meCampaign({slug: '3sum'}), 'https://prove2.me/campaigns/3sum-exponent');
  assert.equal(prove2meCampaign({slug: 'integer-multiplication'}), 'https://prove2.me/campaigns/integer-multiplication-kappa');
  assert.equal(prove2meCampaign({slug: 'exact-dft'}), undefined);
  assert.equal(prove2meCampaignForOther('block-sensitivity'), 'https://prove2.me/campaigns/block-sensitivity-vs-sensitivity');
  assert.equal(prove2meCampaignForOther('catalan'), undefined);
});

test('the verifier races that have a campaign keep the verifier as their main path', () => {
  for (const slug of ['3sum', 'apsp']) assert.ok(verifierProblems.has(slug) && prove2meCampaign({slug}), slug);
});
