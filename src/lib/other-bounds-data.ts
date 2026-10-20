// The Other bounds rows as the pages show them: src/lib/other-bounds.json plus the reviewed
// prove2.me results (src/data/prove2me.json, written by the hourly import). Older data
// bundles have no prove2me.json. A row with a reviewRepository takes the evidence level of each
// claim from its review: the pull requests that repository merged are Human Verified.
import data from './other-bounds.json';
import {mergeProve2me, applyReviews} from './other-merge';
const files = import.meta.glob('../data/prove2me.json', {eager: true, import: 'default'});
export default applyReviews(mergeProve2me(data, files['../data/prove2me.json'] as Parameters<typeof mergeProve2me>[1]));
