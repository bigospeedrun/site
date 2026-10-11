import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ranked,tableBound} from './ranking.ts';
import {classifyEvidence,isBreakthroughRecord} from './evidence.ts';
const data=JSON.parse(readFileSync(new URL('./fixtures/board-regressions.json',import.meta.url),'utf8'))['matrix-multiplication'];

test('matrix exponent bounds retain epsilon slack in tables and chat knowledge',()=>{
 for(const [score,expected] of [['9/4','2.25'],['237115924/100000000','2.37115924'],['1185527443003373/500000000000000','2.371054886006746']]){
  assert.equal(tableBound({score,bound:'O(n^{t+\\varepsilon})'},false,0),`O(n^{${expected}+\\varepsilon})`);
 }
});

test('matrix records use one complex circuit model and keep manuscript dates separate',()=>{
 assert.equal(data.problem_id,'matrix-multiplication/arithmetic-circuit-complex');
 assert.equal(data.score.direction,'lower-is-better');
 assert.match(data.model.description,/every field/);
 // Fixed equal-score examples remain valid when a future claim takes the lead.
 const rows=[{id:'openai',score:'9/4',date:'2026-10-06',repoId:0},{id:'navot',score:'9/4',date:'2026-10-07',repoId:0}];
 const ranks=ranked(rows,'lower-is-better');
 assert.deepEqual(ranks.filter(r=>r.rank===1).map(r=>r.record.id),['openai','navot']);
 const best=data.record_metadata['openai-matrix-nine-fourths-2026'];
 assert.equal(best.publication_date,'2026-10-06');
 assert.equal(best.manuscript_date,'2026-10-02');
 assert.ok(isBreakthroughRecord('matrix-multiplication','openai-matrix-nine-fourths-2026'));
 for(const repo of ['openai/math','selanavot/matrix-multiplication-all-fields']){
  assert.equal(classifyEvidence({slug:'matrix-multiplication',repo,upstreamStatus:'merged',proofPassed:false}),'claimed');
 }
});
