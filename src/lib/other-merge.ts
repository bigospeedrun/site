// Other bounds rows come from src/lib/other-bounds.json (claims by hand and by the watch).
// Results that prove2.me proved and that data/prove2me_import.py reviewed are added here at
// build time, from data/prove2me.json (boards named other-<slug>), so nobody edits the JSON
// for them. Each is a Lean Verified claim that links its prove2.me theorem page. The leader
// of a row is the newest claim of its best handle, so a prove2.me claim that beats the
// current leader by more than the display precision becomes the best handle.
import {classifyOtherEvidence, type OtherClaimReview, type OtherReviewRepository} from './evidence.ts';
import {compareExactValues, exactNumber, otherClaimNumber, parseExact, type Exact} from './other-rank.ts';
import {receiptPageUrl} from './receipt.ts';
export const OTHER_EPSILON = 0.00001;

type Claim = {handle: string; display: string; value: string; date: string; evidence: string; url: string};
type Family = {slug: string; direction: string; bestHandle: string; claims: Claim[]};

// The number of a claim as the row order reads it (other-rank.ts): a power of ten ("\approx1.98\cdot10^{-8}",
// the Heilbronn rows), the first decimal of the display ("\ge 2.032083"), an exact fraction value ("380/187")
// or a whole number ("590"). The first decimal alone read 1.98 for 1.98e-8.
export const claimNumber = otherClaimNumber;

// The exact value of a claim when it is a plain fraction or whole number ("2/100866719", every direct claim) or a
// \frac{a\pm b\sqrt{c}}{d} (quasi-Riemann #129; other-rank.ts parseExact) that agrees with the number of its display to
// the display's precision (3 significant digits on the Heilbronn rows); else null (a LaTeX value such as
// "1/(498\cdot379^{17}+7)").
function exactValue(claim: Pick<Claim, 'display' | 'value'>): Exact | null {
  const x = parseExact(claim.value);
  const number = claimNumber(claim);
  if (!x || number === null) return null;
  const n = exactNumber(x);
  return Math.abs(n - number) <= 1e-2 * Math.max(Math.abs(n), Math.abs(number)) ? x : null;
}

// How much a claim must beat a leader without an exact value: one unit of the last digit its display shows when
// the display is a power of ten ("\approx2.92\cdot10^{-47}": 1e-49), else OTHER_EPSILON.
function margin(display: string): number {
  const power10 = /\d+(?:\.(\d+))?\s*\\cdot\s*10\^\{?\s*(-?\d+)\s*\}?/.exec(display);
  return power10 ? 10 ** (Number(power10[2]) - (power10[1]?.length ?? 0)) : OTHER_EPSILON;
}

// The row page writes note and proofScope as HTML after its math step, which escapes only math:
// text with < > & would be HTML. The importer refuses it too; this is the second guard.
const plain = (text: unknown) => typeof text === 'string' && !/[<>&]/.test(text);
const valid = (claim: Claim & {note?: unknown; proofScope?: unknown; leanNote?: unknown; authors?: {name?: unknown}[]}) => typeof claim?.handle === 'string' && claim.handle.startsWith('prove2me-') &&
  plain(claim.note) && plain(claim.proofScope) && plain(claim.leanNote) && Array.isArray(claim.authors) && claim.authors.every(a => plain(a?.name)) &&
  /^https:\/\/prove2\.me\/theorems\/[0-9a-f-]{36}$/.test(claim.url) && ['claimed', 'lean-verified'].includes(claim.evidence) &&
  Number.isFinite(Date.parse(claim.date)) && claimNumber(claim) !== null;

// A direct submission to the verifier (data/direct_refresh.py, data/direct-other.json): only a final Lean
// Verified result is listed, as a claim with the handle of its issue that links the issue.
const validDirect = (claim: Claim & {note?: unknown; proofScope?: unknown; leanNote?: unknown; authors?: {name?: unknown}[]}) =>
  typeof claim?.handle === 'string' && /^direct-issue-[1-9][0-9]*$/.test(claim.handle) &&
  claim.url === 'https://github.com/bigospeedrun/verifier/issues/' + claim.handle.slice('direct-issue-'.length) &&
  claim.evidence === 'lean-verified' && plain(claim.note) && plain(claim.proofScope) && plain(claim.leanNote) &&
  Array.isArray(claim.authors) && claim.authors.every(a => plain(a?.name)) && Number.isFinite(Date.parse(claim.date)) && claimNumber(claim) !== null;

// `person` names an author the way the Big O boards do (GitHub display name, avatar, X handle); the claims by
// hand and the prove2.me claims keep the names they have.
//
// A reviewed upgrade (data/direct-notes.json `upgrades`, Lead, 2026-11-08, verifier #187: a port of S. Litsey's own
// 295 proof to the verifier's toolchain) names a hand claim of the row by handle and exact value. The direct result
// then makes that claim Lean Verified in place and adds no row: the claim keeps its handle, value, date and source, so
// the leader and the feed key stay; it takes the result's authors, Lean notes and receipt, its note when it has one,
// and its level links the submission (evidenceUrl). A row without exactly one such claim stops the build.
type Upgrade = {handle: string; value: string};
const validUpgrade = (u: unknown): u is Upgrade => !!u && typeof u === 'object' && Object.keys(u).sort().join() === 'handle,value' &&
  typeof (u as Upgrade).handle === 'string' && typeof (u as Upgrade).value === 'string';
export function mergeDirect<D extends {families: Family[]}>(data: D, state: {boards?: Record<string, {claims?: Claim[]}>} | null | undefined,
  person: (author: {name: string; url: string}) => object = a => a): D {
  const prepare = (claim: Claim) => ({...claim, authors: (claim as any).authors.map(person)});
  const upgrade = (claim: Claim) => (claim as {upgrades?: unknown}).upgrades;
  const families = data.families.map(family => {
    const upgrades = (state?.boards?.['other-' + family.slug]?.claims ?? []).filter(c => validDirect(c) && upgrade(c) !== undefined);
    if (!upgrades.length) return family;
    let claims = family.claims;
    for (const result of upgrades) {
      const u = upgrade(result);
      const targets = validUpgrade(u) ? claims.filter(c => c.handle === u.handle && c.value === u.value) : [];
      if (targets.length !== 1) throw new Error(`Direct result ${result.handle} upgrades no single claim of other-${family.slug}`);
      const {handle: _h, value: _v, display: _d, date: _t, dateSource: _s, dateKind: _k, url, bound: _b, upgrades: _u, note, ...fields} = prepare(result) as any;
      claims = claims.map(c => c === targets[0] ? {...c, ...fields, ...(note ? {note} : {}), evidenceUrl: url} : c);
    }
    return {...family, claims};
  });
  const rest = state?.boards ? {...state, boards: Object.fromEntries(Object.entries(state.boards).map(([slug, board]) =>
    [slug, {...board, claims: (board.claims ?? []).filter(c => !(validDirect(c) && upgrade(c) !== undefined))}]))} : state;
  return mergeImported({...data, families}, rest, validDirect, prepare);
}

export function mergeProve2me<D extends {families: Family[]}>(data: D, state: {boards?: Record<string, {claims?: Claim[]}>} | null | undefined): D {
  return mergeImported(data, state, valid);
}

function mergeImported<D extends {families: Family[]}>(data: D, state: {boards?: Record<string, {claims?: Claim[]}>} | null | undefined, accept: (claim: Claim) => boolean, prepare: (claim: Claim) => Claim = c => c): D {
  const families = data.families.map(family => {
    const imported = (state?.boards?.['other-' + family.slug]?.claims ?? []).filter(accept).map(prepare);
    if (!imported.length) return family;
    const known = new Set(family.claims.map(c => c.handle));
    const claims = [...family.claims, ...imported.filter(c => !known.has(c.handle))]
      .map((claim, index) => ({claim, index}))
      .sort((a, b) => Date.parse(a.claim.date) - Date.parse(b.claim.date) || a.index - b.index)
      .map(({claim}) => claim);
    const sign = family.direction === 'higher' ? 1 : -1;
    let leader: Claim | undefined = claims.findLast(c => c.handle === family.bestHandle);
    let best = family.bestHandle;
    for (const claim of imported) {
      const number = claimNumber(claim)!;
      const leaderNumber = leader ? claimNumber(leader) : null;
      const exact = exactValue(claim), leaderExact = leader ? exactValue(leader) : null;
      // Two exact values compare exactly: a strict improvement leads, a tie keeps the leader. Otherwise the number
      // must beat the leader's display by more than its precision.
      const better = leaderNumber === null ? true : exact && leaderExact ? sign * compareExactValues(exact, leaderExact) > 0
        : sign * (number - leaderNumber) > margin(leader!.display);
      if (better) { best = claim.handle; leader = claim; }
    }
    return {...family, claims, bestHandle: best};
  });
  return {...data, families};
}

// A row with a reviewRepository takes each claim's evidence level from its review: a claim whose pull
// request that repository merged is Human Verified (see classifyOtherEvidence). The hourly refresh
// (data/other_reviews.py) reads the status of each review pull request that is not merged yet into
// data/other-reviews.json; that status replaces the one in other-bounds.json, so a merge flips the claim
// without an edit. A pull request that the rows file already lists as merged stays merged.
type Reviewed = {slug?: string; reviewRepository?: OtherReviewRepository; claims: {evidence: string; review?: OtherClaimReview}[]};
export type ReviewState = {rows?: Record<string, Record<string, {status?: string}>>};
export function applyReviews<D extends {families: Reviewed[]}>(data: D, state?: ReviewState | null): D {
  const families = data.families.map(family => ({...family,
    claims: family.claims.map(claim => {
      const seen = family.slug && claim.review ? state?.rows?.[family.slug]?.[String(claim.review.pr)]?.status : undefined;
      const review = claim.review && seen && claim.review.status !== 'merged' ? {...claim.review, status: seen} : claim.review;
      return {...claim, ...(review ? {review} : {}), evidence: classifyOtherEvidence(family.reviewRepository, {...claim, review})};
    })}));
  return {...data, families} as D;
}

// A maintainer rerun of our verifier for a claim of other-bounds.json: data/maintainer_import.py validates and archives
// its receipt and writes data/maintainer-other.json, by slug and handle. A passed receipt makes the claim Lean
// Verified, and its level links the receipt page (evidenceUrl); a failed or pending one leaves the claim as the rows
// file says. A receipt for a claim that the rows file does not have stops the build.
export type MaintainerState = {boards?: Record<string, Record<string, {state?: string; receipt_path?: string}>>};
export function applyMaintainer<D extends {families: {slug: string; claims: {handle: string; evidence: string}[]}[]}>(data: D, state?: MaintainerState | null): D {
  for (const [slug, claims] of Object.entries(state?.boards ?? {})) for (const handle of Object.keys(claims))
    if (!data.families.some(f => f.slug === slug && f.claims.some(c => c.handle === handle)))
      throw new Error(`Maintainer receipt for an unknown Other bounds claim: ${slug}/${handle}`);
  const families = data.families.map(family => ({...family, claims: family.claims.map(claim => {
    const receipt = state?.boards?.[family.slug]?.[claim.handle];
    const path = receipt?.state === 'passed' ? receipt.receipt_path : undefined;
    return path && /^sources\/maintainer-[a-z0-9-]+-[1-9][0-9]*\.json$/.test(path)
      ? {...claim, evidence: 'lean-verified', evidenceUrl: receiptPageUrl(path), maintainerReceiptPath: path} : claim;
  })}));
  return {...data, families} as D;
}
