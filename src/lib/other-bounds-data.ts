// The Other bounds rows as the pages show them: src/lib/other-bounds.json plus the reviewed
// prove2.me results (src/data/prove2me.json, written by the hourly import). Older data
// bundles have no prove2me.json. A row with a reviewRepository takes the evidence level of each
// claim from its review: the pull requests that repository merged are Human Verified. The hourly
// refresh reads the status of each review pull request into src/data/other-reviews.json.
import data from './other-bounds.json';
import profiles from './author-profiles.json';
import avatars from './author-avatars.json';
import {authorFromProfile, githubProfileLogin, withGithubAvatar} from './record-links';
import {mergeProve2me, mergeDirect, applyReviews, applyMaintainer, type ReviewState, type MaintainerState} from './other-merge';
const files = import.meta.glob('../data/prove2me.json', {eager: true, import: 'default'});
// Lean Verified direct submissions to the verifier for Other bounds rows (data/direct_refresh.py).
const direct = import.meta.glob('../data/direct-other.json', {eager: true, import: 'default'});
const reviews = import.meta.glob('../data/other-reviews.json', {eager: true, import: 'default'});
// Maintainer reruns of claims in other-bounds.json (data/maintainer_import.py); bundles before 2026-11-05 have none.
const maintainer = import.meta.glob('../data/maintainer-other.json', {eager: true, import: 'default'});
const merged = applyReviews(applyMaintainer(mergeDirect(mergeProve2me(data, files['../data/prove2me.json'] as Parameters<typeof mergeProve2me>[1]),
  // A credited login gets its GitHub profile name; a reviewed display credit (data/direct-notes.json credit) links the
  // submission, not a profile, and keeps its name as written.
  direct['../data/direct-other.json'] as Parameters<typeof mergeDirect>[1], author => githubProfileLogin(author.url) ? authorFromProfile(author, profiles, avatars) : author),
  maintainer['../data/maintainer-other.json'] as MaintainerState | undefined),
  reviews['../data/other-reviews.json'] as ReviewState | undefined);
// Every claim author with a GitHub profile url gets that profile's avatar, also a hand-added claim (Nil, 2026-11-04:
// darkhipo had his avatar on Snaky, a direct row, and initials on Haldane, a claim in other-bounds.json).
export default {...merged, families: merged.families.map(family => ({...family,
  claims: family.claims.map(claim => ({...claim, authors: claim.authors.map(author => withGithubAvatar(author, avatars))}))}))};
