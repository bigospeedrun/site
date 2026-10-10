import { validateData } from './validate-data.mjs';
import { mkdirSync, existsSync, readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, sep } from 'node:path';
const source=resolve(process.env.BIGOSPEEDRUN_DATA_DIR??'data');
if(!existsSync(resolve(source,'registry.json'))){
 if(process.env.BIGOSPEEDRUN_DATA_DIR)throw new Error('Configured data bundle is missing');
 validateData('src/data',{artifacts:false});
 console.log('Building the committed reviewed snapshot.');
 process.exit(0);
}
const registry=validateData(source);
// Read and check every file before changing the published snapshot.
const pending=new Map();
const names=['registry.json','submissions.json','chart-cross-check.json',...registry.problems.map(p=>p.data_file)];
const documents=names.map(name=>{
 const bytes=readFileSync(resolve(source,name));
 pending.set(resolve('src/data',name),bytes);
 return JSON.parse(bytes);
});
const copyEvidence=(path,expectedHash)=>{
 if(!/^sources\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+$/.test(path)||path.split('/').some(part=>part==='.'||part==='..'))throw new Error('Invalid evidence path: '+path);
 const file=realpathSync(resolve(source,path));
 if(!file.startsWith(realpathSync(source)+sep))throw new Error('Evidence escapes bundle');
 const bytes=readFileSync(file);
 if(expectedHash&&createHash('sha256').update(bytes).digest('hex')!==expectedHash)throw new Error('Evidence hash mismatch: '+path);
 pending.set(resolve('public',path),bytes);
 return bytes;
};
for(const data of documents){
 for(const record of data.records??[]){
  if(data.record_metadata?.[record.id]?.source_url_public===false&&record.artifact?.path?.startsWith('sources/'))copyEvidence(record.artifact.path,record.artifact.sha256);
  const path=record.rerun_status?.receipt_path;if(!path)continue;
  const receipt=JSON.parse(copyEvidence(path));
  if(receipt.source_receipt_path)copyEvidence(receipt.source_receipt_path);
  if(receipt.artifact_path)copyEvidence(receipt.artifact_path,receipt.artifact_sha256);
  for(const kind of ['log','time'])if(receipt[kind+'_path'])copyEvidence(receipt[kind+'_path'],receipt[kind+'_sha256']);
 }
}
for(const [destination,bytes] of pending){mkdirSync(dirname(destination),{recursive:true});writeFileSync(destination,bytes);}
console.log('Copied reviewed JSON snapshot from '+source);
