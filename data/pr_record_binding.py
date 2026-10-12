"""Reviewed PR packages can verify an existing author's row after receipt admission.

Null pins disable a binding. A reviewer must pin the PR, fork repository/head,
controller, and remapping_review (changed_files_sha256 and review text). The
changed-files digest covers every package path, blob, mode and size checked by
inspect_pr and by validate_pr_result. It binds the human upstream/remapping
review to exactly those bytes. This module never admits a receipt itself.
"""
import re
from direct_import import canonical, sha, PROBLEMS

SLUGS={'dft':'exact-dft','3sum':'3sum','apsp':'apsp'}

def hexpin(value, length=40):
    return isinstance(value,str) and re.fullmatch('[0-9a-f]{'+str(length)+'}',value) is not None

def active(binding):
    review=binding.get('remapping_review') or {}
    return (type(binding.get('pr_number')) is int and binding['pr_number']>0
        and isinstance(binding.get('package_repo'),str)
        and re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+',binding['package_repo'])
        and all(hexpin(binding.get(k)) for k in ('package_head','controller','upstream_commit'))
        and hexpin(review.get('changed_files_sha256'),64)
        and isinstance(review.get('review'),str) and bool(review['review'].strip()))

def apply_bindings(documents,claims,final_states,config):
    suppressed=set()
    fingerprints={sha(canonical(tree).encode()) for tree in
        [config.get('controller_blobs',{}),*config.get('previous_controller_blobs',{}).values()]}
    # A deleted binding must also remove verification owned by this mechanism.
    for doc in documents.values():
        for row in doc['records']:
            meta=doc['record_metadata'][row['id']]
            if meta.pop('reviewed_pr_binding',None):
                row['tier']='claimed';row.pop('rerun_status',None)
                meta['site_tier']='claimed'
                for name in ('receipt_url','verification_source_commit'):meta.pop(name,None)
                meta['proof_status']='Reviewed package receipt is no longer applicable; claim retained.'
    for binding in config.get('reviewed_pr_bindings',[]):
        doc=documents.get(SLUGS.get(binding.get('problem')))
        if not doc:continue
        row=next((r for r in doc['records'] if r['id']==binding.get('row_id')),None)
        if not row:continue
        meta=doc['record_metadata'][row['id']]
        if not active(binding):continue
        key='direct-pr-'+str(binding['pr_number']);claim=claims.get(key)
        if not claim or claim.get('route')!='pull_request':continue
        sub=claim['submission'];item=claim['item']
        expected=dict(number=binding['pr_number'],head=binding['package_head'],
            changed_files_sha256=binding['remapping_review']['changed_files_sha256'],controller=binding['controller'])
        if not (item.get('number')==binding['pr_number']
            and item.get('head',{}).get('sha')==binding['package_head']
            and item.get('head',{}).get('repo',{}).get('full_name')==binding['package_repo']
            and sub.get('repo_url')=='https://github.com/bigospeedrun/verifier'
            and sub.get('commit')==binding['package_head']
            and sub.get('source_subdir')==binding['source_subdir']
            and sub.get('problem')==binding['problem'] and sub.get('bound')==binding['bound']
            and row.get('source_commit')==binding['upstream_commit'] and row.get('score')==binding['bound']
            and row.get('score_relation')=='attained'
            and row.get('source',{}).get('url','').startswith('https://github.com/'+binding['upstream_repo']+'/blob/'+binding['upstream_commit']+'/')
            and meta.get('comparison_key')==PROBLEMS[binding['problem']][0]+'/v1'):continue
        # Exact reviewed packages do not create a second submitter-owned row,
        # even while their proof is pending.
        suppressed.add(key)
        state=final_states.get(key+':'+sha(canonical(sub).encode()))
        proof=state.get('evidence') if state and state['decision']!='lean-verified' else claim.get('verification')
        if not proof or proof.get('pr_identity')!=expected or proof.get('controller_fingerprint') not in fingerprints:continue
        decision=state['decision'] if state and state['decision']!='lean-verified' else proof.get('decision')
        if decision not in ('lean-verified','blocked','pending'):continue
        passed=decision=='lean-verified'
        row['tier']='verified' if passed else 'claimed';meta['site_tier']=row['tier']
        row['rerun_status']=dict(state='passed' if passed else 'failed' if decision=='blocked' else 'pending',
            checked_at=proof['checked_at'],receipt_path=proof['receipt_path'])
        meta.update(reviewed_pr_binding=key,receipt_url=proof['receipt_url'],
            verification_source_commit=binding['package_head'],proof_status=proof['reason'])
    return suppressed
