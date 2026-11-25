import {inlineMath} from './math.ts';
import {CLOSED_LINK} from './closed-boards.ts';

// Build time only (ProblemPage.astro): math.ts needs the katex package, which the site server image does not have.
/** The status text as HTML: math through KaTeX, each link opening in a new tab. */
export const closedBoardHtml = (text: string) => inlineMath(text).replace(CLOSED_LINK, (_, label, url) => `<a href="${url}" target="_blank" rel="noopener">${label}</a>`);
