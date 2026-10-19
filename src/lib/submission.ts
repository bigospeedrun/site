import type {Problem} from './types';

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

// Races that have a prove2.me campaign: the page where a proof of the race's bound is submitted.
// prove2.me checks each proof with Lean on its server. The slugs are the campaigns that
// data/prove2me-trust.json lists for each board (a test keeps the two in step).
const prove2meCampaignUrl = (slug: string) => 'https://prove2.me/campaigns/' + slug;
export const prove2meCampaigns: Readonly<Record<string, string>> = {
  '3sum': prove2meCampaignUrl('3sum-exponent'),
  apsp: prove2meCampaignUrl('apsp-exponent'),
};
export const prove2meCampaign = (problem: Pick<Problem, 'slug'>): string | undefined => prove2meCampaigns[problem.slug];
