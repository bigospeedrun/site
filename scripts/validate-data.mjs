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
 for(const name of ['submissions','chart-cross-check'])check(read(name+'.json'),name);
 for(const entry of registry.problems){
  assert(/^[a-z0-9-]+\.json$/.test(entry.data_file),'Invalid data filename');
  const data=read(entry.data_file);check(data,'problem');
  assert.equal(data.problem_id,entry.problem_id);
  assert.equal(new Set(data.records.map(r=>r.id)).size,data.records.length,'Duplicate records');
  for(const record of data.records){
   assert(data.record_metadata[record.id],'Missing record metadata');
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
