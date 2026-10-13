import assert from 'node:assert/strict';
import test from 'node:test';
import {initials} from './avatars.ts';
import {authorFromProfile} from './record-links.ts';

test('initials name the first player of a credit', () => {
 assert.equal(initials('OpenAI'),'OA');
 assert.equal(initials('Anthropic'),'A');
 assert.equal(initials('CrocSwap community'),'CC');
 assert.equal(initials('Josh Alman and Virginia Vassilevska Williams'),'JA');
 assert.equal(initials('Robert W. Floyd (1962), Algorithm 97: Shortest path'),'RF');
 assert.equal(initials('Folklore; cited account by Anka Gajentaan and Mark H. Overmars'),'F');
 assert.equal(initials('Anthropic (Lean formalization)'),'A');
 assert.equal(initials('élise martin'),'ÉM');
 assert.equal(initials('---'),'?');
});

test('only authors with a downloaded avatar get an avatar path', () => {
 const avatars={example:'/avatars/example-0123456789.png'};
 assert.equal(authorFromProfile({name:'x',url:'https://github.com/Example'},{},avatars).avatar,'/avatars/example-0123456789.png');
 assert.equal(authorFromProfile({name:'x',url:'https://github.com/openai/math'},{},avatars).avatar,undefined);
 assert.equal(authorFromProfile({name:'Plain name',url:'https://arxiv.org/abs/1'},{},avatars).avatar,undefined);
});

test('every avatar in the manifest is a served raster file', async () => {
 const {readFile,stat}=await import('node:fs/promises');
 const manifest:Record<string,string>=JSON.parse(await readFile(new URL('./author-avatars.json',import.meta.url),'utf8'));
 for(const [login,path] of Object.entries(manifest)){
  assert.match(path,new RegExp(`^/avatars/${login}-[0-9a-f]{10}\\.(png|jpg|webp|gif)$`));
  assert.ok((await stat(new URL(`../../public${path}`,import.meta.url))).size>0,path);
 }
});
