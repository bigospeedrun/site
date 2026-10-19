import type {Problem} from './types';
import campaignData from '../data/prove2me-campaigns.json' with {type: 'json'};

export const verifierUrl = 'https://github.com/bigospeedrun/verifier';
export const discordUrl = 'https://discord.gg/JEN582WvNv';
// The Discord channel where people post new results.
export const submitChannel = '#submit-a-result';

// Supported trusted statements, checked against the verifier README on 2026-10-11.
// Add a site slug here when the verifier accepts submissions for its statement.
export const verifierProblems: ReadonlySet<string> = new Set(['exact-dft', '3sum', 'apsp']);

export function submissionRoute(problem: Pick<Problem, 'slug' | 'repos'>) {
  if (problem.repos.some(repo => repo.open)) return 'review';
  return verifierProblems.has(problem.slug) ? 'verifier' : 'site';
}

// Races that have a prove2.me campaign: the page where proofs of the race's bound are submitted.
// prove2.me checks each proof with Lean on its server. The list is derived from the campaigns that
// data/prove2me-trust.json reviews (scripts/sync-data.mjs writes src/data/prove2me-campaigns.json), so
// a new campaign there shows on the pages by itself. Board keys: a race slug, or other-<slug> for an
// Other bounds row.
export const prove2meCampaigns: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(campaignData as Record<string, {slug: string}>).map(([board, {slug}]) => [board, 'https://prove2.me/campaigns/' + slug]));
export const prove2meCampaign = (problem: Pick<Problem, 'slug'>): string | undefined => prove2meCampaigns[problem.slug];
export const prove2meCampaignForOther = (rowSlug: string): string | undefined => prove2meCampaigns['other-' + rowSlug];
