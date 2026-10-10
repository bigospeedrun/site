"""Data-only PR intake and receipt admission; no submitted code is executed."""
import base64
import hashlib
import io
import re
import zipfile
from direct_import import (REPOSITORY, WORKFLOW, REUSABLE, MAX_EVIDENCE_BYTES,
    require, read_json, canonical, sha, normalize, is_test_submission, validate_proof)

PUBLISHER='.github/workflows/pr-publish.yml'
PREFIX='repos/'+REPOSITORY+'/'

def archive_members(raw, metadata):
    require(len(raw)<=MAX_EVIDENCE_BYTES and metadata.get('digest')=='sha256:'+sha(raw), 'Artifact digest mismatch')
    require(type(metadata.get('id')) is int and not metadata.get('expired',True), 'Invalid artifact')
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        names=archive.namelist()
        require(len(names)==len(set(names)) and all(re.fullmatch(r'[A-Za-z0-9_.-]+',n) and n not in ('.','..') for n in names), 'Unsafe artifact path')
        require(sum(i.file_size for i in archive.infolist())<=MAX_EVIDENCE_BYTES,'Expanded artifact too large')
        return {n:archive.read(n) for n in names}

def validate_run(run, trust, publisher=False, early=False):
    revision=run.get('head_sha')
    require(revision in trust,'Unreviewed workflow revision')
    policy=trust[revision]
    require(run.get('repository',{}).get('full_name')==REPOSITORY and run.get('head_repository',{}).get('full_name')==REPOSITORY,'Untrusted workflow repository')
    require(run.get('status') in (('in_progress','completed') if early and not publisher else ('completed',)) and run.get('head_branch')=='main','Unfinished or non-main run')
    require(run.get('path')==(PUBLISHER if publisher else WORKFLOW),'Wrong workflow path')
    require(run.get('workflow_id')==policy['publisher_workflow_id' if publisher else 'workflow_id'],'Wrong workflow ID')
    require(run.get('event') in (('workflow_run',) if publisher else ('schedule','issues','workflow_dispatch')),'Wrong workflow event')
    require(run.get('html_url')==f'https://github.com/{REPOSITORY}/actions/runs/{run["id"]}','Wrong run URL')
    if not publisher:
        require(any(x.get('sha')==revision and x.get('path','').split('@')[0]==REPOSITORY+'/'+REUSABLE for x in run.get('referenced_workflows',[])),'Reusable workflow revision mismatch')
    return policy

def validate_publisher_artifact(env, artifact, run, publisher, trust):
    validate_run(publisher, trust, publisher=True)
    require(env.get('publisher_commit')==publisher['head_sha'] and env.get('publisher_run_id')==str(publisher['id']) and env.get('publisher_run_attempt')==str(publisher['run_attempt']), 'Publisher pin mismatch')
    name=f'pr-submission-{run["id"]}-{run["run_attempt"]}-publisher-{publisher["id"]}-{publisher["run_attempt"]}'
    require(artifact.get('name')==name and artifact.get('workflow_run',{}).get('id')==publisher['id'] and artifact['workflow_run'].get('head_sha')==publisher['head_sha'], 'Publisher artifact identity mismatch')


def blob_hash(raw):
    return hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()

def tree_path(api, commit, path):
    tree=api.json(PREFIX+'git/commits/'+commit)['tree']['sha']
    entry=None
    for component in path.split('/'):
        entries=api.json(PREFIX+'git/trees/'+tree)
        require(not entries.get('truncated'),'Truncated tree')
        entry=next((e for e in entries['tree'] if e['path']==component),None)
        if entry is None:return None
        tree=entry['sha']
    return entry

def inspect_pr(api, pr, base_sha=None):
    require(not is_test_submission(pr),'Test PR stays off board')
    require(pr['base']['repo']['full_name']==REPOSITORY and pr['base']['ref']=='main','Wrong PR base')
    login=pr['user']['login']; lower=login.lower()
    require(re.fullmatch(r'[a-z0-9][a-z0-9-]{0,38}',lower),'Invalid submitter')
    head=pr['head']['sha']; base=base_sha or pr['base']['sha']
    require(re.fullmatch('[0-9a-f]{40}',head) and re.fullmatch('[0-9a-f]{40}',base),'Invalid source pin')
    files=api.pages(PREFIX+f'pulls/{pr["number"]}/files')
    require(0<len(files)<=500 and len(files)==pr['changed_files'],'Incomplete PR files')
    folder=None; paths=set()
    for f in files:
        match=re.fullmatch(r'submissions/(dft|3sum|apsp)/('+re.escape(lower)+r'-[a-z0-9][a-z0-9-]{0,39})/(.+)',f['filename'])
        require(match and f['status']=='added' and not f.get('previous_filename'),'PR must add one new owned folder')
        current='/'.join(f['filename'].split('/')[:3]); relative=match[3]
        require(folder in (None,current),'Multiple submission folders');folder=current
        require(relative in ('manifest.json','Submission.lean') or re.fullmatch(r'Submission/(?:[A-Za-z_][A-Za-z0-9_]*/)*[A-Za-z_][A-Za-z0-9_]*\.lean',relative),'Unsupported PR file')
        require(f['filename'] not in paths,'Duplicate PR file');paths.add(f['filename'])
    require(tree_path(api,base,folder) is None,'Folder already existed')
    entry=tree_path(api,head,folder)
    require(entry and entry['type']=='tree','Missing source tree')
    listing=api.json(PREFIX+'git/trees/'+entry['sha'],{'recursive':1})
    require(not listing.get('truncated'),'Truncated source tree')
    entries={folder+'/'+e['path']:e for e in listing['tree'] if e['type']!='tree'}
    require(paths==set(entries) and {folder+'/manifest.json',folder+'/Submission.lean'}<=paths,'Incomplete source tree')
    changed=[]
    for path in sorted(paths):
        e=entries[path]
        require(e['type']=='blob' and e['mode']=='100644' and re.fullmatch('[0-9a-f]{40}',e['sha']),'Unsafe file mode')
        require(type(e.get('size')) is int and 0<=e['size']<=20_000_000,'Source file too large')
        require(next(f['sha'] for f in files if f['filename']==path)==e['sha'],'Diff blob mismatch')
        changed.append(dict(path=path,mode=e['mode'],sha=e['sha'],size=e['size']))
    require(sum(e['size'] for e in changed)<=150_000_000,'Source folder too large')
    entry=entries[folder+'/manifest.json'];require(entry['size']<=1024,'Manifest too large')
    obj=api.json(PREFIX+'git/blobs/'+entry['sha'])
    require(obj.get('encoding')=='base64','Unsupported manifest encoding')
    raw=base64.b64decode(obj['content']);require(len(raw)<=1024 and blob_hash(raw)==entry['sha'],'Manifest blob mismatch')
    manifest=read_json(raw)
    require(isinstance(manifest,dict) and set(manifest)=={'problem','bound'} and manifest['problem']==folder.split('/')[1],'Manifest fields mismatch')
    sub=normalize(dict(schema_version=1,problem=manifest['problem'],bound=manifest['bound'],repo_url='https://github.com/'+REPOSITORY,commit=head,authors=[]))
    require(sub['bound']==manifest['bound'],'Unreduced manifest bound')
    sub['source_subdir']=folder
    return dict(submission=sub,submission_sha256=sha(canonical(sub).encode()),source_subdir=folder,
                manifest_utf8=raw.decode('utf-8'),manifest_sha256=sha(raw),changed_files=changed,
                changed_files_sha256=sha(canonical(changed).encode()),head_sha=head,base_sha=base)

def validate_pr_result(raw, result_artifact, env_name, pr, run, publisher, proof_raw, proof_artifact, trust, layout):
    early=env_name.endswith('-lean.json')
    policy=validate_run(run,trust,early=early);validate_run(publisher,trust,True)
    suffix='-lean' if early else ''
    members=archive_members(raw,result_artifact)
    require(env_name==f'pr-submission-{pr["number"]}{suffix}.json' and env_name in members,'Missing PR envelope')
    env=read_json(members[env_name]);request=env.get('request',{})
    require(not is_test_submission(pr,env) and env.get('test_only') is False and request.get('test_only') is False,'Test PR receipt stays off board')
    require(env.get('schema_version')==2 and env.get('route')=='pull_request' and request.get('route')=='pull_request','Wrong PR schema')
    require(pr.get('merged') is True and pr['state']=='closed','PR not API-confirmed merged')
    require((env.get('importable') is True and env.get('disposition')=='merge') or (not early and env.get('importable') is False and env.get('disposition') in ('blocked','keep_open')), 'Invalid PR disposition')
    require(env.get('verification_stage','final') == ('lean' if early else 'final') and env.get('receipt',{}).get('verification_stage','final') == ('lean' if early else 'final'), 'Receipt stage mismatch')
    require(env.get('merge_commit')==pr.get('merge_commit_sha') and re.fullmatch('[0-9a-f]{40}',pr.get('merge_commit_sha','')),'Merge identity mismatch')
    require(env.get('publisher_commit')==publisher['head_sha'] and env.get('publisher_run_id')==str(publisher['id']) and env.get('publisher_run_attempt')==str(publisher['run_attempt']),'Publisher pin mismatch')
    name=f'pr-submission-{run["id"]}-{run["run_attempt"]}-publisher-{publisher["id"]}-{publisher["run_attempt"]}'
    require(result_artifact.get('name')==name and result_artifact.get('workflow_run',{}).get('id')==publisher['id'] and result_artifact['workflow_run'].get('head_sha')==publisher['head_sha'],'Publisher artifact identity mismatch')
    require(env.get('run_id')==str(run['id']) and env.get('run_attempt')==str(run['run_attempt']) and env.get('run_url')==run['html_url'] and env.get('verifier_commit')==run['head_sha'] and env.get('workflow_path')==WORKFLOW and (env.get('workflow_conclusion') in (None,run['conclusion']) if early else env.get('workflow_conclusion')==run['conclusion']),'Verification run mismatch')
    require(request.get('pr_number')==pr['number'] and request.get('pr_url')==pr['html_url']==f'https://github.com/{REPOSITORY}/pull/{pr["number"]}' and request.get('pr_submitter_login')==pr['user']['login'] and request.get('pr_created_at')==pr['created_at'],'PR identity mismatch')
    require(request.get('verifier_commit')==run['head_sha'] and request.get('gate')=='ready','Controller/gate mismatch')
    for key,value in layout.items():require(request.get(key)==value,'PR source binding mismatch: '+key)
    proof_name=f'pr-verification-{run["id"]}-{run["run_attempt"]}-{pr["number"]}{suffix}'
    require(proof_artifact.get('name')==proof_name and proof_artifact.get('workflow_run',{}).get('id')==run['id'] and proof_artifact['workflow_run'].get('head_sha')==run['head_sha'],'Proof artifact identity mismatch')
    expected=dict(id=proof_artifact['id'],name=proof_name,digest=proof_artifact['digest'],url=f'https://github.com/{REPOSITORY}/actions/runs/{run["id"]}/artifacts/{proof_artifact["id"]}')
    require(env.get('receipt_artifact')==expected,'Proof artifact envelope mismatch')
    evidence=archive_members(proof_raw,proof_artifact)
    receipt=read_json(evidence['receipt.json'])
    require(env.get('receipt_sha256')==sha(evidence['receipt.json']) and env.get('receipt')==receipt and not is_test_submission({},receipt),'Receipt byte mismatch or test receipt')
    require(read_json(evidence['pr-request.json'])==request,'Proof request archive mismatch')
    require(request.get('inputs')==receipt.get('request'),'Controller inputs mismatch')
    hashes=receipt.get('artifact_sha256',{})
    logs={k['log'] for k in receipt.get('kernels',{}).values() if k.get('log')}
    if receipt.get('axiom_audit',{}).get('log'):logs.add(receipt['axiom_audit']['log'])
    require(logs<=hashes.keys(),'Missing evidence log hash')
    for name,digest in hashes.items():require(name in evidence and sha(evidence[name])==digest,'Receipt log hash mismatch')
    decision,reason,checked=validate_proof(layout['submission'],receipt,policy,run['head_sha'],run['html_url'])
    if env.get('disposition') == 'blocked': require(decision == 'blocked', 'Unsubstantiated rejection')
    if env.get('disposition') == 'keep_open': require(decision == 'pending', 'Unsubstantiated suspension')
    return dict(decision=decision,reason=reason,checked_at=checked,receipt_url=run['html_url']),env,evidence
