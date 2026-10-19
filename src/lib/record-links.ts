import type {Author, Link} from './types';
import type {EvidenceLevel} from './evidence';
import {receiptPageUrl} from './receipt.ts';

type Profile = {login: string; name: string; twitter_username: string | null};
export function authorFromProfile(author: Link, profiles: Record<string, Profile>, avatars: Record<string, string> = {}): Author {
 const login = author.url?.match(/^https:\/\/github\.com\/([^/?#]+)/)?.[1];
 if (!login) return author;
 const profile = profiles[login.toLowerCase()];
 const avatar = avatars[login.toLowerCase()];
 return {name: profile?.name || login, login: profile?.login || login,
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
