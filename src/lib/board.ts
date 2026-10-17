// The race board (https://board.bigospeedrun.com, repo bigospeedrun/board) has one board
// per race that existed when it was seeded (db/migrations/0003_boards.sql there): the six
// problems and the 13 Other bounds rows, as other-<slug>. Only these get a link; a race
// added later gets one when its board exists (bigospeedrun/board scripts/sync-boards.ts),
// and its slug is added here.
export const boardOrigin = 'https://board.bigospeedrun.com';
export const boardSlugs: readonly string[] = [
  '3sum', 'apsp', 'subset-sum', 'integer-multiplication', 'exact-dft', 'matrix-multiplication',
  'other-quasi-riemann', 'other-catalan', 'other-primitive-roots', 'other-matroid-prophet', 'other-contingency-tables',
  'other-average-sensitivity', 'other-block-sensitivity', 'other-van-der-waerden', 'other-sidorenko', 'other-unit-distance-grid', 'other-snaky',
  'other-ordered-matrix-removal', 'other-heilbronn-triangle', 'other-haldane-gap',
];
// The board page of a race, or null when that race has no board.
export const boardUrl = (slug: string): string | null => boardSlugs.includes(slug) ? `${boardOrigin}/${slug}` : null;
export const boardFeedUrl = (slug: string): string => `${boardOrigin}/api/posts?board=${slug}&format=md`;
