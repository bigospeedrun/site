// The Other bounds rows as the pages show them: src/lib/other-bounds.json plus the reviewed
// prove2.me results (src/data/prove2me.json, written by the hourly import). Older data
// bundles have no prove2me.json. A row with a reviewRepository takes the evidence level of each
// claim from its review: the pull requests that repository merged are Human Verified. The hourly
// refresh reads the status of each review pull request into src/data/other-reviews.json.
import data from './other-bounds.json';
import profiles from './author-profiles.json';
import avatars from './author-avatars.json';
import {authorFromProfile} from './record-links';
import {mergeProve2me, mergeDirect, applyReviews, type ReviewState} from './other-merge';
const files = import.meta.glob('../data/prove2me.json', {eager: true, import: 'default'});
// Lean Verified direct submissions to the verifier for Other bounds rows (data/direct_refresh.py).
const direct = import.meta.glob('../data/direct-other.json', {eager: true, import: 'default'});
const reviews = import.meta.glob('../data/other-reviews.json', {eager: true, import: 'default'});
export default applyReviews(mergeDirect(mergeProve2me(data, files['../data/prove2me.json'] as Parameters<typeof mergeProve2me>[1]),
  direct['../data/direct-other.json'] as Parameters<typeof mergeDirect>[1], author => authorFromProfile(author, profiles, avatars)),
  reviews['../data/other-reviews.json'] as ReviewState | undefined);
