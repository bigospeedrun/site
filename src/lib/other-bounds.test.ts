import {test} from 'node:test';
import assert from 'node:assert/strict';
import data from './other-bounds.json' with {type: 'json'};

// Other bounds pages render these texts with inlineMath through set:html.
// inlineMath escapes only the math, so plain text must not hold HTML.
export const unsafeOutsideMath = (text: string) =>
  text.replace(/\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/g, '').match(/[<>&]/g) ?? [];

test('notes and statements hold no <, > or & outside math', () => {
  assert.deepEqual(unsafeOutsideMath('\\(\\mu(G)<2715\\) and \\[a>b\\]'), []);
  assert.deepEqual(unsafeOutsideMath('a < b \\(c\\) & d'), ['<', '&']);
  assert.deepEqual(unsafeOutsideMath('\\(open < math'), ['<']);
  for (const row of data.families) {
    const texts: [string, string][] = [
      [`${row.slug} statement`, row.statement],
      ...row.claims.map((c): [string, string] => [`${row.slug} claim ${c.handle} ${c.date} note`, c.note]),
      ...row.repos.map((r): [string, string] => [`${row.slug} repo ${r.name} note`, 'note' in r ? String(r.note ?? '') : '']),
    ];
    for (const [where, text] of texts) assert.deepEqual(unsafeOutsideMath(text), [], where);
  }
});
