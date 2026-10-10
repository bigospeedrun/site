import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ranked,tableBound} from './ranking.ts';
import {classifyEvidence,isBreakthroughRecord} from './evidence.ts';
const data=JSON.parse(readFileSync(new URL('../data/matrix-multiplication.json',import.meta.url),'utf8'));

test('matrix exponent bounds retain epsilon slack in tables and chat knowledge',()=>{
 for(const [score,expected] of [['9/4','2.25'],['237115924/100000000','2.37115924'],['1185527443003373/500000000000000','2.371054886006746']]){
  assert.equal(tableBound({score,bound:'O(n^{t+\\varepsilon})'},false,0),`O(n^{${expected}+\\varepsilon})`);
 }
});

test('matrix records use one complex circuit model and keep manuscript dates separate',()=>{
 assert.equal(data.problem_id,'matrix-multiplication/arithmetic-circuit-complex');
 assert.equal(data.score.direction,'lower-is-better');
 assert.match(data.model.description,/every field/);
 const rows=data.records.filter((r:any)=>r.id!=='classical-baseline').map((r:any)=>({...r,date:data.record_metadata[r.id].publication_date,repoId:0}));
 const ranks=ranked(rows,'lower-is-better');
 assert.deepEqual(ranks.filter(r=>r.rank===1).map(r=>r.record.id),['openai-matrix-nine-fourths-2026','navot-matrix-all-fields-2026']);
 const first=data.record_metadata['openai-matrix-2258-2026'];
 const best=data.record_metadata['openai-matrix-nine-fourths-2026'];
 assert.equal(first.publication_date,best.publication_date);
 assert.equal(first.manuscript_date,'2026-09-24');
 assert.equal(best.manuscript_date,'2026-10-02');
 assert.ok(isBreakthroughRecord('matrix-multiplication','openai-matrix-nine-fourths-2026'));
 for(const repo of ['openai/math','selanavot/matrix-multiplication-all-fields']){
  assert.equal(classifyEvidence({slug:'matrix-multiplication',repo,upstreamStatus:'merged',proofPassed:false}),'claimed');
 }
});
