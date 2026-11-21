// A claim made Lean Verified by independent public rebuilds (Nil's design, 2026-11-20): the family names the claim and its
// rebuilds in leanRoute (src/lib/other-bounds.json), not the claim, so every claim keeps one shape. The level label of that
// claim opens the first rebuild's public record.
export interface LeanRoute {kind: 'independent-rebuilds'; handle: string; rebuilds: {name: string; url: string; date: string}[]}
export const leanRoute = (family: object): LeanRoute | undefined => (family as {leanRoute?: LeanRoute}).leanRoute;
// The least number of people other than the authors that the route needs (Nil, 2026-11-20).
export const MIN_REBUILDS = 2;
export const routeEvidenceUrl = (family: object, claim: {handle: string}): string | undefined => {
  const route = leanRoute(family);
  return route && route.handle === claim.handle ? route.rebuilds[0]?.url : undefined;
};
// A race with a closedStatus is closed (Nil, 2026-11-20): the landing page lists it in its own group, not with the open races.
export const isClosedRace = (family: object): boolean => Boolean((family as {closedStatus?: unknown}).closedStatus);
// The rule the landing page states under "Closed races" (Lead, 2026-11-21): the test below holds every closed race to it.
export const closedRaceRule = 'A race is closed when its best bound is the best possible value and that bound is Lean Verified.';
