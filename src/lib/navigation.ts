export const problemLinks = [['integer-multiplication','Integer Multiplication'],['matrix-multiplication','Matrix Multiplication'],['exact-dft','Fourier Transform'],['3sum','3SUM'],['apsp','APSP'],['subset-sum','Subset Sum'],['3sat','3-SAT'],['integer-factoring','Integer Factoring'],['directed-sssp','Directed Shortest Paths']];

export const problemDisplayName = (slug: string, fallback = slug): string =>
  problemLinks.find(([problem]) => problem === slug)?.[1] ?? fallback;

// A race can have a second model beside its first (APSP: deterministic, then randomized). The first model's page is /<slug>;
// a later model has its own page, /<slug>/<modelId>, and its own row on the landing page, but it is not a race: it has no board
// and no Discord channel of its own (the race is the slug).
export const modelLinks: readonly (readonly [slug: string, modelId: string, name: string])[] = [['apsp', 'randomized-word-ram', 'APSP, randomized']];
export const modelPath = (slug: string, modelId: string, primary: boolean): string => primary ? '/' + slug : '/' + slug + '/' + modelId;
export const modelDisplayName = (slug: string, modelId: string, primary: boolean, fallback: string): string =>
  primary ? problemDisplayName(slug, fallback) : modelLinks.find(([s, m]) => s === slug && m === modelId)?.[2] ?? fallback;
// The words of the model switch of a race with two models.
export const modelSwitchLabels: Readonly<Record<string, string>> = {'word-ram': 'Deterministic', 'randomized-word-ram': 'Randomized'};
export const isPrimaryModel = (problem: {primary?: boolean}): boolean => problem.primary !== false;
