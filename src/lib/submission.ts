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
