export const problemLinks = [['integer-multiplication','Integer Multiplication'],['matrix-multiplication','Matrix Multiplication'],['exact-dft','Fourier Transform'],['3sum','3SUM'],['apsp','APSP'],['subset-sum','Subset Sum'],['3sat','3-SAT']];

export const problemDisplayName = (slug: string, fallback = slug): string =>
  problemLinks.find(([problem]) => problem === slug)?.[1] ?? fallback;
