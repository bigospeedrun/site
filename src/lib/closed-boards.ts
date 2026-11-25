import {inlineMath} from './math.ts';

// A Big O race whose leader is claimed to be the best possible value shows one status line under its board title, as
// /other/quasi-riemann did from 2026-11-20 (Nil, 2026-11-25, ask 2e93b417: matrix multiplication). The line stays Claimed
// until the Lean proof is rebuilt. Links in the text are [label](https URL); math uses \( \).
export interface ClosedBoardStatus {label: string; text: string}

const OPENAI_COMMIT = '92b516ef8e2abf66c3db7aa31438d3010bc7956f';

export const closedBoards: Record<string, ClosedBoardStatus> = {
  'matrix-multiplication': {
    label: 'Race closed! (Claimed)',
    text: `OpenAI claims that \\(t = 9/4\\) is the best possible exponent: its [new preprint](https://github.com/openai/math/tree/${OPENAI_COMMIT}/preprints/The-matrix-multiplication-exponent-is-nine-fourths-November-24-2026) proves a lower bound that matches the \\(9/4\\) upper bound of the leading row. The [Lean proof](https://github.com/openai/math/commit/${OPENAI_COMMIT}) is public. We are waiting for independent rebuilds of it.`,
  },
};

const LINK = /\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g;

export const closedBoardLinks = (text: string) => [...text.matchAll(LINK)].map(([, label, url]) => ({label, url}));

/** The status text as HTML: math through KaTeX, each link opening in a new tab. */
export const closedBoardHtml = (text: string) => inlineMath(text).replace(LINK, (_, label, url) => `<a href="${url}" target="_blank" rel="noopener">${label}</a>`);

/** The status line as plain text for the chat: each link becomes "label (URL)". */
export const closedBoardText = (status: ClosedBoardStatus) => `${status.label}: ${status.text.replace(LINK, '$1 ($2)')}`;
