import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inlineMath} from './math.ts';

// A credit note (data/direct-notes.json) on an Other bounds row is rendered with inlineMath, which throws on malformed TeX
// and would fail the site build. data/validate.py checks the characters; this test parses every note.
test('every credit note renders: its TeX parses and no delimiter is left over', () => {
  const root = new URL('../../', import.meta.url);
  const notes = JSON.parse(readFileSync(new URL('data/direct-notes.json', root), 'utf8')) as {notes: Record<string, {text: string}>};
  for (const [key, note] of Object.entries(notes.notes)) {
    const html = inlineMath(note.text);
    assert.doesNotMatch(html.replace(/<[^>]*>/g, ''), /\\\(|\\\)|\\\[|\\\]/, `${key} keeps a TeX delimiter`);
    if (note.text.includes('\\(')) assert.match(html, /class="katex"/, `${key} has TeX but no formula was rendered`);
  }
});
