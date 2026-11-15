"""Reviewed PR packages and reviewed issue ports can verify an existing author's row after receipt admission.

Null pins disable a binding. A reviewer must pin the PR, fork repository/head,
controller, and remapping_review (changed_files_sha256 and review text). The
changed-files digest covers every package path, blob, mode and size checked by
inspect_pr and by validate_pr_result. It binds the human upstream/remapping
review to exactly those bytes. This module never admits a receipt itself.

reviewed_issue_bindings (task 07840cc3, 2026-11-15: OpenAI's 3-SAT proof, ported to the verifier's statement by Big O
Speedrun) is the issue-route twin: the check chain runs on issues only, so a PR binding cannot carry such a port. A
binding pins the row, the problem and bound, the port's repository, commit and source_subdir, the login that files
the issue, the upstream repository and commit of the row, the "Ported by" line and a review text. It names no issue
number, so it can go live before the issue is filed: every issue claim with exactly these pins is suppressed (no
submitter row), and its Lean Verified result upgrades the row in place. The row keeps its authors (Nil, 2026-11-09:
a porter shows only as "Ported by"); meta.refiled_by holds the line while the row is verified.
"""
import re
from direct_import import canonical, sha, PROBLEMS

# The boards whose direct results are rows of the board file (direct_refresh.py writes them).
SLUGS={'dft':'exact-dft','3sum':'3sum','apsp':'apsp','subset-sum':'subset-sum','directed-sssp':'directed-sssp','3sat':'3sat'}

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

ISSUE_PINS={'row_id','problem','bound','repo_url','commit','source_subdir','submitter','upstream_repo','upstream_commit','ported_by','review'}

def active_issue(binding):
    """Every pin set, in its exact form. source_subdir is None or a relative folder."""
    return (isinstance(binding,dict) and set(binding)==ISSUE_PINS
        and isinstance(binding['row_id'],str) and re.fullmatch(r'[a-z0-9][a-z0-9-]{0,80}',binding['row_id']) is not None
        and binding['problem'] in SLUGS and isinstance(binding['bound'],str)
        and isinstance(binding['repo_url'],str) and re.fullmatch(r'https://github\.com/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}',binding['repo_url']) is not None
        and hexpin(binding['commit']) and hexpin(binding['upstream_commit'])
        and (binding['source_subdir'] is None or (isinstance(binding['source_subdir'],str) and re.fullmatch(r'[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*',binding['source_subdir']) is not None and '..' not in binding['source_subdir'].split('/')))
        and isinstance(binding['submitter'],str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9-]{0,38}',binding['submitter']) is not None
        and isinstance(binding['upstream_repo'],str) and re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+',binding['upstream_repo']) is not None
        and isinstance(binding['ported_by'],str) and re.fullmatch(r'Ported by [A-Za-z0-9][A-Za-z0-9 .,&()-]{0,79}',binding['ported_by']) is not None
        and isinstance(binding['review'],str) and bool(binding['review'].strip()))

def issue_claim_matches(binding,claim):
    sub=claim.get('submission') or {};item=claim.get('item') or {}
    return (claim.get('route')=='issue' and (item.get('user') or {}).get('login')==binding['submitter']
        and sub.get('problem')==binding['problem'] and sub.get('bound')==binding['bound']
        and sub.get('repo_url')==binding['repo_url'] and sub.get('commit')==binding['commit']
        and sub.get('source_subdir')==binding['source_subdir'] and sub.get('entrypoint','Race.bound')=='Race.bound')

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
            # An issue binding keeps the row's own proof_status while unbound, to put it back.
            if meta.get('reviewed_issue_binding'):
                meta.pop('reviewed_issue_binding')
                row['tier']='claimed';row.pop('rerun_status',None)
                meta['site_tier']='claimed'
                for name in ('receipt_url','verification_source_commit','verification_source_url','refiled_by'):meta.pop(name,None)
                meta['proof_status']=meta.pop('unbound_proof_status',meta.get('proof_status'))
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
    for binding in config.get('reviewed_issue_bindings',[]):
        if not active_issue(binding):continue
        doc=documents.get(SLUGS[binding['problem']])
        row=next((r for r in doc['records'] if r['id']==binding['row_id']),None) if doc else None
        if not row:continue
        meta=doc['record_metadata'][row['id']]
        if not (row.get('source_commit')==binding['upstream_commit'] and row.get('score')==binding['bound']
            and row.get('score_relation')=='attained'
            and row.get('source',{}).get('url','').startswith('https://github.com/'+binding['upstream_repo']+'/blob/'+binding['upstream_commit']+'/')
            and meta.get('comparison_key')==PROBLEMS[binding['problem']][0]+'/v1'):continue
        # Every matching issue: never a submitter-owned row, pending or not. The newest Lean Verified result upgrades.
        best=None
        for key,claim in sorted(claims.items()):
            if not key.startswith('direct-issue-') or not issue_claim_matches(binding,claim):continue
            suppressed.add(key)
            state=final_states.get(key+':'+sha(canonical(claim['submission']).encode()))
            proof=state.get('evidence') if state and state['decision']!='lean-verified' else claim.get('verification')
            if not proof or proof.get('controller_fingerprint') not in fingerprints or proof.get('pr_identity') is not None:continue
            decision=state['decision'] if state and state['decision']!='lean-verified' else proof.get('decision')
            if decision=='lean-verified' and (best is None or proof['checked_at']>best[1]['checked_at']):best=(key,proof)
        if not best:continue
        key,proof=best
        meta.setdefault('unbound_proof_status',meta.get('proof_status'))
        row['tier']='verified';meta['site_tier']='verified'
        row['rerun_status']=dict(state='passed',checked_at=proof['checked_at'],receipt_path=proof['receipt_path'])
        meta.update(reviewed_issue_binding=key,receipt_url=proof['receipt_url'],verification_source_commit=binding['commit'],
            verification_source_url=binding['repo_url']+'/tree/'+binding['commit']+('/'+binding['source_subdir'] if binding['source_subdir'] else ''),
            proof_status=proof['reason'],refiled_by=binding['ported_by'])
    return suppressed
