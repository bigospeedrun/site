// The proof scope of a direct result (data/direct_refresh.py other_claims) names its source as plain text:
// "at commit <40-hex sha> of https://github.com/<owner>/<repo>." The data stays plain (other-merge.ts refuses
// < > &), so the Other page links it here (Nil, 2026-11-04): the short hash opens the commit, the name opens
// the repository. Text without that form does not change.
const SOURCE = /at commit ([0-9a-f]{40}) of https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]+?)(?=\.?(?:\s|$))/g;

// A credit note names a commit as "<owner>/<repo>@<hash>" (7 to 40 hex digits; Lead, verifier#142): it links to that
// commit as written. GitHub opens a commit page by a short hash too.
const COMMIT_REF = /(?<![\w./@-])([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]+?)@([0-9a-f]{7,40})(?![\w-])/g;

// A note links a public page as "[label](https://host/path)" (Lead, 2026-11-21: Sutherland's verification page). The data
// holds no < > & or quote, and the address takes only URL-safe characters, so the link cannot break out of its attribute.
const PAGE_LINK = /\[([^\[\]<>&"]+)\]\((https:\/\/[A-Za-z0-9.-]+(?:\/[A-Za-z0-9._~\/%-]*)?(?:\?[A-Za-z0-9._~\/%=-]*)?)\)/g;

export const sourceLinks = (text: string) => text.replace(PAGE_LINK, (_, label: string, url: string) =>
  `<a href="${url}" target="_blank" rel="noopener">${label}</a>`).replace(SOURCE, (_, sha: string, owner: string, repo: string) => {
  const url = `https://github.com/${owner}/${repo}`;
  return `at commit <a href="${url}/commit/${sha}" target="_blank" rel="noopener"><code>${sha.slice(0, 8)}</code></a> of <a href="${url}" target="_blank" rel="noopener">${owner}/${repo}</a>`;
}).replace(COMMIT_REF, (ref: string, owner: string, repo: string, sha: string) =>
  `<a href="https://github.com/${owner}/${repo}/commit/${sha}" target="_blank" rel="noopener"><code>${ref}</code></a>`);
