// A Big O race whose leader is claimed to be the best possible value shows one status line under its board title, as
// /other/quasi-riemann did from 2026-11-20 (Nil, 2026-11-25, ask 2e93b417: matrix multiplication). The line was Claimed
// until two independent rebuilds of the Lean proof passed; it is Lean Verified since 2026-11-25 (Lead: our verifier run
// and Carlos Toledo's cert-machine). Links in the text are [label](https URL); math uses \( \).
// The site server loads this file (chat-knowledge.ts), so it imports no package: the HTML form is in closed-boards-html.ts.
export interface ClosedBoardStatus {label: string; text: string}

const OPENAI_COMMIT = '92b516ef8e2abf66c3db7aa31438d3010bc7956f';
// The second independent rebuild of OpenAI's square_exponent (Carlos Toledo, VERDICT: CERTIFIED, 2026-11-25).
const CERT_MACHINE_COMMIT = '801cd9c19c7dfa3ff339088bebe1e5c1bf07d1cf';

export const closedBoards: Record<string, ClosedBoardStatus> = {
  'matrix-multiplication': {
    label: 'Race closed! (Lean Verified)',
    text: `OpenAI's [new preprint](https://github.com/openai/math/tree/${OPENAI_COMMIT}/preprints/The-matrix-multiplication-exponent-is-nine-fourths-November-24-2026) proves that \\(t = 9/4\\) is the best possible exponent for division-free circuits, the model of this board: for each \\(t \\lt 9/4\\), the number of operations is not \\(O(n^t)\\). This matches the \\(9/4\\) upper bound of the leading row. Two independent rebuilds of the [Lean proof](https://github.com/openai/math/commit/${OPENAI_COMMIT}) passed: [our verifier run](https://github.com/bigospeedrun/verifier/actions/runs/45538609390) and [Carlos Toledo's check](https://github.com/carlostoledo1891/cert-machine/blob/${CERT_MACHINE_COMMIT}/corpus/omega-nine-fourths/VERDICT.md).`,
  },
};

// A short factual note under the board title, for a race that is not closed. Same text form as a closed line. A note has no label.
// exact-dft (Lead, 2026-11-25): OpenAI's linear-circuit result bounds our kappa from above and leaves the race open.
export const boardNotices: Record<string, string> = {
  'exact-dft': `OpenAI's [new preprint](https://github.com/openai/math/tree/${OPENAI_COMMIT}/preprints/The-logarithmic-exponent-of-finite-Fourier-transforms-November-24-2026) shows that linear circuits compute a Fourier transform of length \\(N\\) with \\(N(\\log N)^{1/2+o(1)}\\) gates, and that they need at least \\(c\\,N\\sqrt{\\log N}\\) gates. It counts only the linear gates. Our model also charges indexing and scalar preparation, so the preprint is not a row here. If its lower bound holds, it holds in our model too: no row can have \\(\\kappa > 1/2\\). The race stays open below \\(1/2\\). The [Lean proof](https://github.com/openai/math/blob/${OPENAI_COMMIT}/lean/OAI/LinearAlgebra/FiniteFourier/Main.lean#L17) is public, and we have not rebuilt it.`,
};

export const CLOSED_LINK = /\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g;

export const closedBoardLinks = (text: string) => [...text.matchAll(CLOSED_LINK)].map(([, label, url]) => ({label, url}));

/** The status line as plain text for the chat: each link becomes "label (URL)". */
export const closedBoardText = (status: ClosedBoardStatus) => `${status.label}: ${status.text.replace(CLOSED_LINK, '$1 ($2)')}`;
