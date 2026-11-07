import type {Author, Link} from './types';
import type {EvidenceLevel} from './evidence';
import {receiptPageUrl} from './receipt.ts';
import {profileName, creditNames} from './profile-name.ts';

type Profile = {login: string; name: string; twitter_username: string | null};
// The login of a GitHub profile url (https://github.com/<login>, no deeper path); undefined for any other url.
// Avatars match only this way, never by name (Nil, 2026-11-04: the same person always looks the same).
export function githubProfileLogin(url?: string): string | undefined {
 return url?.match(/^https:\/\/github\.com\/([A-Za-z0-9-]+)\/?$/)?.[1];
}
// The author with the stored avatar of its GitHub profile url, when there is one. The name stays as written. A credit
// that links a repository or a page (a group author list) names its person's GitHub account in `login`; never a name.
export function withGithubAvatar<T extends Link & {avatar?: string; login?: string}>(author: T, avatars: Record<string, string>): T & {avatar?: string} {
 const login = githubProfileLogin(author.url) ?? author.login;
 const avatar = login ? avatars[login.toLowerCase()] : undefined;
 return avatar ? {...author, avatar} : author;
}
export function authorFromProfile(author: Link, profiles: Record<string, Profile>, avatars: Record<string, string> = {}): Author {
 const login = author.url?.match(/^https:\/\/github\.com\/([^/?#]+)/)?.[1];
 if (!login) return author;
 const profile = profiles[login.toLowerCase()];
 const avatar = githubProfileLogin(author.url) ? avatars[login.toLowerCase()] : undefined;
 return {name: creditNames[login.toLowerCase()] ?? profileName(profile?.name, login), login: profile?.login || login,
  url: `https://github.com/${profile?.login || login}`,
  twitterUsername: profile?.twitter_username || undefined, ...(avatar ? {avatar} : {})};
}
export function recordEvidenceUrl(level: EvidenceLevel, record: {submission_url?: string; rerun_status?: {receipt_path?: string | null}}, source?: string, receiptUrl?: string): string | undefined {
 if (level === 'lean-verified') {
  const run = receiptUrl;
  // A prove2.me result links its prove2.me theorem page (statement, Proved, proofs), not our JSON receipt.
  if (run?.startsWith('https://prove2.me/theorems/')) return run;
  const receipt = record.rerun_status?.receipt_path?.replace(/^\//, '');
  // Our own check: the receipt page of the site, which says in plain words what passed. A prove2.me
  // import's receipt file is not a proof check receipt; it keeps the raw file.
  if (receipt && !receipt.startsWith('sources/prove2me-')) return receiptPageUrl(receipt);
  if (receipt) return '/' + receipt;
  // No receipt file: the verifier run is all there is.
  if (run?.startsWith('https://github.com/bigospeedrun/verifier/actions/runs/')) return run;
  return undefined;
 }
 // Accepted pull requests are the review; selected README entries use their pinned source.
 if (level === 'human-verified' && /^https:\/\/github\.com\/CrocSwap\/integer-mult-bounds\/pull\/\d+\/?$/.test(record.submission_url ?? '')) return record.submission_url;
 return source;
}
