// The leader of an Other bounds row is the newest claim by its best author.
// Claims are in date order, so an author's later claim replaces an earlier one.
export const otherBoundLeader = <C extends {handle: string}>(row: {bestHandle: string; claims: C[]}): C | undefined =>
  row.claims.findLast(claim => claim.handle === row.bestHandle);
