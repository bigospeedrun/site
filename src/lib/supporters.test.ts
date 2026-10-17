import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

interface Supporter {login: string; name: string; since: string}

test('the supporters list stays well formed', async () => {
 const supporters:{updated_at: string; supporters: Supporter[]}=JSON.parse(
  await readFile(new URL('./supporters.json',import.meta.url),'utf8'));
 assert.equal(Array.isArray(supporters.supporters),true);
 // One record per sponsor, newest last. Logins are the manifest keys, so they copy as written.
 for(const [index,supporter] of supporters.supporters.entries()){
  assert.match(supporter.login,/^[A-Za-z0-9-]+$/,`supporter ${index}: login`);
  assert.ok(supporter.name.trim().length>0,`supporter ${index}: name`);
  assert.match(supporter.since,/^\d{4}-\d{2}-\d{2}$/,`supporter ${index}: since date`);
 }
});
