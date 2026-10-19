// Other bounds rows come from src/lib/other-bounds.json (claims by hand and by the watch).
// Results that prove2.me proved and that data/prove2me_import.py reviewed are added here at
// build time, from data/prove2me.json (boards named other-<slug>), so nobody edits the JSON
// for them. Each is a Lean Verified claim that links its prove2.me theorem page. The leader
// of a row is the newest claim of its best handle, so a prove2.me claim that beats the
// current leader by more than the display precision becomes the best handle.
export const OTHER_EPSILON = 0.00001;

type Claim = {handle: string; display: string; value: string; date: string; evidence: string; url: string};
type Family = {slug: string; direction: string; bestHandle: string; claims: Claim[]};

// The first decimal of the display ("\ge 2.032083"), else an exact fraction value ("380/187").
export function claimNumber(claim: Pick<Claim, 'display' | 'value'>): number | null {
  const decimal = /\d+\.\d+/.exec(claim.display);
  if (decimal) return Number(decimal[0]);
  const fraction = /^\s*(\d+)\/(\d+)\s*$/.exec(claim.value);
  return fraction ? Number(fraction[1]) / Number(fraction[2]) : null;
}

// The row page writes note and proofScope as HTML after its math step, which escapes only math:
// text with < > & would be HTML. The importer refuses it too; this is the second guard.
const plain = (text: unknown) => typeof text === 'string' && !/[<>&]/.test(text);
const valid = (claim: Claim & {note?: unknown; proofScope?: unknown; leanNote?: unknown; authors?: {name?: unknown}[]}) => typeof claim?.handle === 'string' && claim.handle.startsWith('prove2me-') &&
  plain(claim.note) && plain(claim.proofScope) && plain(claim.leanNote) && Array.isArray(claim.authors) && claim.authors.every(a => plain(a?.name)) &&
  /^https:\/\/prove2\.me\/theorems\/[0-9a-f-]{36}$/.test(claim.url) && ['claimed', 'lean-verified'].includes(claim.evidence) &&
  Number.isFinite(Date.parse(claim.date)) && claimNumber(claim) !== null;

export function mergeProve2me<D extends {families: Family[]}>(data: D, state: {boards?: Record<string, {claims?: Claim[]}>} | null | undefined): D {
  const families = data.families.map(family => {
    const imported = (state?.boards?.['other-' + family.slug]?.claims ?? []).filter(valid);
    if (!imported.length) return family;
    const known = new Set(family.claims.map(c => c.handle));
    const claims = [...family.claims, ...imported.filter(c => !known.has(c.handle))]
      .map((claim, index) => ({claim, index}))
      .sort((a, b) => Date.parse(a.claim.date) - Date.parse(b.claim.date) || a.index - b.index)
      .map(({claim}) => claim);
    const sign = family.direction === 'higher' ? 1 : -1;
    const leader = claims.findLast(c => c.handle === family.bestHandle);
    const leaderNumber = leader ? claimNumber(leader) : null;
    let best = family.bestHandle;
    let bestNumber = leaderNumber;
    for (const claim of imported) {
      const number = claimNumber(claim)!;
      if (bestNumber === null || sign * (number - bestNumber) > OTHER_EPSILON) { best = claim.handle; bestNumber = number; }
    }
    return {...family, claims, bestHandle: best};
  });
  return {...data, families};
}
