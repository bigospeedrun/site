import { readFileSync, realpathSync, lstatSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import Ajv from 'ajv/dist/2020.js';

export function validateData(directory,{artifacts=true}={}) {
 const root=realpathSync(directory);
 const safePath=path=>{
  assert(typeof path==='string' && !path.split('/').some(p=>p==='..'||p==='.'), 'Invalid bundle path');
  const full=resolve(root,path);
  assert(full.startsWith(root+sep) && !lstatSync(full).isSymbolicLink() && realpathSync(full).startsWith(root+sep), 'Bundle path escapes root');
  return full;
 };
 const read=name=>JSON.parse(readFileSync(safePath(name),'utf8'));
 const ajv=new Ajv({strict:false,allErrors:true});
 ajv.addFormat('date',/^\d{4}-\d{2}-\d{2}$/);
 ajv.addFormat('date-time',s=>/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(s)&&Number.isFinite(Date.parse(s)));
 ajv.addFormat('uri',s=>{try{return Boolean(new URL(s).protocol)}catch{return false}});
 const check=(data,name)=>{
  const schema=JSON.parse(readFileSync(new URL(`./schemas/${name}-v1.json`,import.meta.url),'utf8'));
  const valid=ajv.compile(schema);
  assert(valid(data),`${name}: ${ajv.errorsText(valid.errors)}`);
 };
 const registry=read('registry.json');check(registry,'registry');
 // No observed or updated time (our own clocks) may lie after the build time (5 minutes of clock slack): the page footer shows the newest one.
 const latest=Date.now()+5*60_000;
 const notFuture=(value,what)=>{if(value!=null)assert(Date.parse(value)<=latest,`${what} is in the future: ${value}`)};
 notFuture(registry.updated_at,'registry updated_at');
 for(const name of ['submissions','chart-cross-check'])check(read(name+'.json'),name);
 for(const entry of registry.problems){
  assert(/^[a-z0-9-]+\.json$/.test(entry.data_file),'Invalid data filename');
  const data=read(entry.data_file);check(data,'problem');
  assert.equal(data.problem_id,entry.problem_id);
  notFuture(data.updated_at,`${entry.data_file} updated_at`);
  // A model that carries another reads that model's rows onto its board (data/validate.py checks the rows and the score).
  for(const id of entry.carries??[])assert(registry.problems.some(other=>other.problem_id===id&&other.slug===entry.slug&&!other.carries),'Unknown carried model');
  assert.equal(new Set(data.records.map(r=>r.id)).size,data.records.length,'Duplicate records');
  for(const record of data.records){
   assert(data.record_metadata[record.id],'Missing record metadata');
   notFuture(record.site_observed_at,`${entry.data_file} ${record.id} site_observed_at`);
   // submitted_at can come from an outside committer clock (refresh.py): warn, never fail the pipeline.
   if(record.submitted_at&&Date.parse(record.submitted_at)>latest)console.warn(`Warning: ${entry.data_file} ${record.id} submitted_at is in the future: ${record.submitted_at}`);
   if(artifacts){
   const raw=readFileSync(safePath(record.artifact.path));
   assert.equal(createHash('sha256').update(raw).digest('hex'),record.artifact.sha256,'Artifact hash mismatch');
   }
   assert(!data.record_metadata[record.id].site_badge,'Unreviewed site badge');
  }
 }
 console.log('Validated bundle schemas and record identities'+(artifacts?', plus artifact hashes.':'.'));
 return registry;
}
if(process.argv[1]===fileURLToPath(import.meta.url))validateData(process.argv[2]??'../bigospeedrun-data');
