import {test} from 'node:test';
import assert from 'node:assert/strict';
import direct from '../data/direct-other.json' with {type: 'json'};
import {sourceLinks} from './source-links.ts';

const SHA = '880106a09c1554ab6e5b551b9a9403e7c4acf639';

test('the commit and the repository of a direct proof scope become links', () => {
  assert.equal(sourceLinks(`The verifier checked Race.bound : BigOSpeedrun.Snaky.Bound (19) at commit ${SHA} of https://github.com/darkhipo/snaky-nineteen.`),
    'The verifier checked Race.bound : BigOSpeedrun.Snaky.Bound (19) at commit '
    + `<a href="https://github.com/darkhipo/snaky-nineteen/commit/${SHA}" target="_blank" rel="noopener"><code>880106a0</code></a> of `
    + '<a href="https://github.com/darkhipo/snaky-nineteen" target="_blank" rel="noopener">darkhipo/snaky-nineteen</a>.');
  // A dot inside the repository name stays in it; only the dot that ends the sentence is left out.
  assert.match(sourceLinks(`at commit ${SHA} of https://github.com/o/a.b.`), /href="https:\/\/github\.com\/o\/a\.b"[^>]*>o\/a\.b<\/a>\.$/);
});

test('text without a full commit hash and a GitHub repository does not change', () => {
  for (const text of ['No site rerun.', `at commit ${SHA.slice(0, 12)} of https://github.com/o/r.`, `at commit ${SHA} of https://example.org/o/r.`])
    assert.equal(sourceLinks(text), text);
});

test('every direct result that names a commit gets both links (the refresh keeps the form)', () => {
  const claims = Object.values(direct.boards as Record<string, {claims: {proofScope: string}[]}>).flatMap(b => b.claims);
  assert.ok(claims.length > 0);
  for (const {proofScope} of claims) {
    if (!proofScope.includes('at commit')) continue;
    const html = sourceLinks(proofScope);
    assert.match(html, /<a href="https:\/\/github\.com\/[^"/]+\/[^"/]+\/commit\/[0-9a-f]{40}"/, proofScope);
    assert.doesNotMatch(html, /of https:\/\//, proofScope);
  }
});

test('a commit named as owner/repo@hash in a credit note links to that commit', () => {
  const note = "The 19-move construction and its card certificate are shjvandekamp's (shjvandekamp/math@64e7eb1, 2026-10-15); Dmitri I. Arkhipov's package checks it in Lean.";
  assert.equal(sourceLinks(note), "The 19-move construction and its card certificate are shjvandekamp's ("
    + '<a href="https://github.com/shjvandekamp/math/commit/64e7eb1" target="_blank" rel="noopener"><code>shjvandekamp/math@64e7eb1</code></a>'
    + ", 2026-10-15); Dmitri I. Arkhipov's package checks it in Lean.");
  // Not a commit: too short a hash, an e-mail address, a path inside a URL.
  for (const text of ['o/r@abc12', 'mail me at a@b.org', 'see https://x.org/o/r@1234567abc'])
    assert.equal(sourceLinks(text), text);
  // Both forms in one text, and the full-hash proof scope keeps its own links.
  assert.match(sourceLinks(`o/r@${SHA} and at commit ${SHA} of https://github.com/o/r.`), /^<a href="https:\/\/github\.com\/o\/r\/commit\/[0-9a-f]{40}"[^>]*><code>o\/r@[0-9a-f]{40}<\/code><\/a> and at commit <a /);
});

test('every credit note of an Other row renders its commit references as links', () => {
  for (const claim of Object.values(direct.boards as Record<string, {claims: {note: string}[]}>).flatMap(b => b.claims))
    assert.doesNotMatch(sourceLinks(claim.note).replace(/<a [^>]*>[\s\S]*?<\/a>/g, ''), /[A-Za-z0-9-]+\/[A-Za-z0-9._-]+@[0-9a-f]{7,40}/, claim.note);
});

test('a bracketed label with an https address becomes a link, and nothing else does', () => {
  assert.equal(sourceLinks('He reports on [his page](https://math.mit.edu/~drew/grh/) first.'),
    'He reports on <a href="https://math.mit.edu/~drew/grh/" target="_blank" rel="noopener">his page</a> first.');
  for (const text of ['[x](http://example.org/)', '[x](javascript:alert(1))', '[x](https://a.b/"onmouseover=1)', 'see (https://a.b/) and [1]', '[a<b](https://a.b/)'])
    assert.equal(sourceLinks(text), text);
});
