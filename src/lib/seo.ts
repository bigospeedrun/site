export const siteOrigin = 'https://bigospeedrun.com';
export const shareImage = `${siteOrigin}/og.png`;
export const pageDescriptions: Record<string,string> = {
 '/': 'Track improved algorithmic bounds for classic problems, with results, proofs, and progress over time.',
 '/integer-multiplication': 'Compare integer multiplication bounds, their evidence, and progress below n log n time.',
 '/3sum': 'Compare 3SUM bounds, their evidence, and progress below quadratic time.',
 '/apsp': 'Compare all-pairs shortest path bounds, their evidence, and progress below cubic time.',
 '/subset-sum': 'Compare subset sum bounds, their evidence, and progress in exponential running time.',
 '/exact-dft': 'Compare exact discrete Fourier transform bounds, their evidence, and progress below n log n time.',
 '/directed-sssp': 'Compare directed shortest path bounds, their evidence, and progress in running time.',
 '/privacy': 'Read how the site uses Google Analytics, chat messages and browser storage.',
 '/about': 'Read how Big O Speedrun selects problems and repositories, checks results, and accepts submissions.',
};

// Model permalinks show the same page as the main problem URL.
export function pageSeo(pathname:string) {
 const path = '/'+(pathname.split('/').filter(Boolean)[0]??'');
 const canonicalPath = path==='/'?'/':path;
 return {
  canonical: siteOrigin+canonicalPath,
  noindex: canonicalPath==='/directed-sssp'||canonicalPath==='/404',
  description: pageDescriptions[canonicalPath]??pageDescriptions['/'],
 };
}

export const sitemapPaths=Object.keys(pageDescriptions).filter(path=>!pageSeo(path).noindex);
