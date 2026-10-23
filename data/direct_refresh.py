#!/usr/bin/env python3
"""Refresh verifier issues/PRs as data, staging a complete validated transaction."""
import argparse
import base64
import copy
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from fractions import Fraction
from datetime import datetime, timezone
from direct_github import GitHub, GitHubError
from direct_import import (REPOSITORY, PROBLEMS, Rejected, require, read_json, sha,
    canonical, parse_body, is_test_submission, validate_result)
from pr_record_binding import apply_bindings
from direct_pr import PREFIX, archive_members, inspect_pr, validate_pr_result

ROOT=Path(__file__).resolve().parent
SLUGS={'dft':'exact-dft','3sum':'3sum','apsp':'apsp'}
# Other bounds rows with a trusted verifier statement: a Lean Verified result (from the Lean checkpoint
# on, as on the boards; a later nanoda rejection removes it) becomes a claim of the row in
# direct-other.json (merged by src/lib/other-merge.ts); an open, failed or held submission is not
# listed there, so nothing posts before the proof check passes (Nil, 2026-10-23). bound: the row's form.
OTHER={'average-sensitivity':dict(bound='\\mathrm{{AS}}(f)\\le {value}d\\sqrt n',
    statement='BigOSpeedrun.AverageSensitivity.Bound')}
# These hosted smoke identities are permanently excluded, even after label edits.
SMOKE_NUMBERS={1,2}
CLAIMED_ONLY_NOTE='Submitted bound; it did not beat the best Lean Verified result, so no proof run started.'
HELD_NOTE='Proof checks passed; held for a lead review of credit (derivation report). The submitted bound remains Claimed.'

def untrusted_path(path):
    # No verifier script or workflow reads submissions or auto-research notes
    # (checked at verifier c92b9b6), so changes there keep a snapshot valid.
    return path.startswith('submissions/') or path=='auto-research.md' or path.startswith('auto-research/')

def json_bytes(value):return (json.dumps(value,indent=2,ensure_ascii=False)+'\n').encode()

class Importer:
    def __init__(self, api, root=ROOT):
        self.api=api;self.root=Path(root);self.trust={};self.runs={};self.files={};self.notes=[];self.final_states={}
        self.config=json.loads((self.root/'direct-trust.json').read_text())
        self.policy_hash=sha(canonical(self.config).encode())
        # The lead approves a held issue result (derivation report) for its exact submission bytes: the digest
        # is in the verifier's bos-direct-v1 result marker. A held PR is approved by merging it by hand.
        decisions=self.root/'review-decisions.json'
        listed=json.loads(decisions.read_text()).get('derivations',[]) if decisions.exists() else []
        self.approved={(d['id'],d['submission_sha256']) for d in listed if d.get('decision')=='approved'}

    def trusted(self,revision):
        if revision not in self.trust:
            require(re.fullmatch('[0-9a-f]{40}',revision),'Invalid controller revision')
            tree=self.api.json(PREFIX+'git/trees/'+revision,{'recursive':1})
            require(not tree.get('truncated'),'Truncated controller tree')
            actual={e['path']:dict(sha=e['sha'],mode=e['mode']) for e in tree['tree'] if e['type']!='tree' and not untrusted_path(e['path'])}
            require(actual in [self.config['controller_blobs'], *self.config.get('previous_controller_blobs', {}).values()], 'Unreviewed controller content')
            policy=copy.deepcopy(self.config);policy['controller_blobs']=actual;policy['statements']={}
            for profile in policy['profiles'].values():
                path=profile['challenge_file']
                if path in policy['statements']:continue
                # The reviewed statement bytes are vendored, never chosen by the submission.
                raw=(self.root/'direct-fixtures'/Path(path).name).read_bytes()
                require(sha(raw)==profile['challenge_sha256'],'Reviewed statement hash mismatch')
                policy['statements'][path]=raw
            self.trust[revision]=policy
        return self.trust

    def run(self,number):
        if number not in self.runs:self.runs[number]=self.api.json(PREFIX+f'actions/runs/{number}')
        return self.runs[number]

    def artifact(self,metadata):
        return self.api.get(PREFIX+f'actions/artifacts/{metadata["id"]}/zip')

    def discover(self):
        claims={}
        # Closed issues too: the verifier closes an issue after its final result (Nil
        # rule 2026-10-17). verify() lists a closed issue only with a final Lean
        # Verified outcome; on 2026-10-17 an open-only read dropped the 3SUM leader.
        issues=self.api.pages(PREFIX+'issues',{'state':'all'})
        prs=self.api.pages(PREFIX+'pulls',{'state':'all'})
        self.listed={('direct-pr-' if 'pull_request' in i else 'direct-issue-')+str(i['number']) for i in issues}
        self.listed|={'direct-pr-'+str(p['number']) for p in prs}
        for item in issues:
            if 'pull_request' in item:continue
            if item['number'] in SMOKE_NUMBERS or is_test_submission(item):
                self.notes.append(f'Excluded test issue #{item["number"]}');continue
            if not item.get('title','').startswith('[Lean submission]'):continue
            try:
                sub=parse_body(item['body'])
                owner_repo=sub['repo_url'].removeprefix('https://github.com/')
                commit=self.api.json(f'repos/{owner_repo}/commits/{sub["commit"]}')
                require(commit['sha']==sub['commit'],'Issue source pin mismatch')
                claims['direct-issue-'+str(item['number'])]=dict(route='issue',item=item,submission=sub,closed=item.get('state')!='open')
            except GitHubError as error:
                if error.status != 404: raise
                self.notes.append(f'Ignored unavailable source for issue #{item["number"]}')
            except (Rejected,ValueError,KeyError,TypeError):
                self.notes.append(f'Ignored invalid issue #{item["number"]}')
        for listing in prs:
            number=listing['number']
            if number in SMOKE_NUMBERS or is_test_submission(listing):
                self.notes.append(f'Excluded test PR #{number}');continue
            pr=self.api.json(PREFIX+f'pulls/{number}')
            if is_test_submission(pr):continue
            if pr['state']=='closed' and not pr.get('merged'):
                # A PR closed after the verifier's claimed-only report for its head stays a Claimed claim.
                try:
                    if self.claimed_only(dict(route='pull_request',item=pr)):
                        layout=inspect_pr(self.api,pr)
                        claims['direct-pr-'+str(number)]=dict(route='pull_request',item=pr,submission=layout['submission'],layout=layout,
                                                             closed=True,claimed_only=True)
                except (Rejected,ValueError,KeyError,TypeError):
                    self.notes.append(f'Ignored invalid closed PR #{number}')
                continue
            try:
                # Closed PR base can include its own merge; use original base from
                # receipts later. Open PR claims use the API base observed now.
                if pr['state']=='open':
                    layout=inspect_pr(self.api,pr)
                    claims['direct-pr-'+str(number)]=dict(route='pull_request',item=pr,submission=layout['submission'],layout=layout)
                elif pr.get('merged'):
                    claims['direct-pr-'+str(number)]=dict(route='pull_request',item=pr,submission=None)
            except (Rejected,ValueError,KeyError,TypeError):
                self.notes.append(f'Ignored invalid PR #{number}')
        return claims

    def claimed_only(self,claim):
        """The verifier's own claimed-only report for this exact version: on an issue the bos-claimed-v1 reply
        with its submission digest, on a PR the final bos-pr-v2 result for its head that says claimed_only. The
        verifier closes such a submission right after that report; it stays listed as Claimed (Lead, 2026-10-23,
        after PR #52). Only comments of the workflow bot count."""
        item=claim['item'];number=item['number']
        if claim['route']=='issue':
            marker=f"<!-- bos-claimed-v1 {number} {sha(canonical(claim['submission']).encode())} -->"
            match=lambda body:body.startswith(marker)
        else:
            marker=f"<!-- bos-pr-v2 {number} {item['head']['sha']} -->"
            match=lambda body:body.startswith(marker) and 'PR proof result: **claimed_only**.' in body
        comments=self.api.pages(PREFIX+f'issues/{number}/comments')
        return any((c.get('user') or {}).get('login')=='github-actions[bot]' and (c.get('user') or {}).get('type')=='Bot'
                   and match(c.get('body') or '') for c in comments)

    def evidence(self,key,env,run,artifact,proof_artifact,result_raw,proof_raw,verdict,publisher=None):
        identity=f'{key}-{run["id"]}-{run["run_attempt"]}'+('-'+env['verification_stage'] if env.get('verification_stage') else '')
        prefix='sources/'+identity
        witness=dict(envelope=env,verification_run=run,result_artifact=artifact,proof_artifact=proof_artifact)
        if publisher:witness['publisher_run']=publisher
        zipped=io.BytesIO()
        with zipfile.ZipFile(zipped,'w',zipfile.ZIP_DEFLATED) as archive:
            for name, raw in [('result-artifact.zip', result_raw), ('proof-artifact.zip', proof_raw)]:
                info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(info, raw)
        self.files[prefix+'.zip']=zipped.getvalue()
        self.files[prefix+'-source.json']=json_bytes(witness)
        summary=dict(schema_version=1,status='passed' if verdict['decision']=='lean-verified' else verdict['decision'],checked_at=verdict['checked_at'],
            description=verdict['reason'],receipt_url=verdict['receipt_url'],
            artifact_path=prefix+'.zip',artifact_sha256=sha(zipped.getvalue()),source_receipt_path=prefix+'-source.json')
        self.files[prefix+'.json']=json_bytes(summary)
        return dict(**verdict,receipt_path=prefix+'.json',receipt_sha256=sha(self.files[prefix+'.json']),policy_hash=self.policy_hash,result_artifact_id=artifact.get('id'),
                    controller_fingerprint=sha(canonical(self.trust[run['head_sha']]['controller_blobs']).encode()) if run.get('head_sha') in self.trust else None,
                    pr_identity=dict(number=env.get('request',{}).get('pr_number'), head=env.get('request',{}).get('head_sha'),
                        changed_files_sha256=env.get('request',{}).get('changed_files_sha256'), controller=run.get('head_sha')) if env.get('route')=='pull_request' else None,
                    source_file=env.get('receipt',{}).get('profile',{}).get('solution_module','Submission').replace('.', '/')+'.lean')

    def derivation(self,key,verdict):
        """A passing issue result with a derivation hold is 'held' until the lead approves its submission digest."""
        if verdict['derivation_hold'] and verdict['decision']=='lean-verified' and (key,verdict['id'].rsplit('-',1)[1]) not in self.approved:
            return dict(verdict,decision='held',reason=HELD_NOTE)
        return verdict

    def outcome_id(self,key,submission):
        return key+':'+sha(canonical(submission).encode())

    def retain_outcome(self,key,claim,stage,verdict,evidence):
        identity=self.outcome_id(key,claim['submission'])
        previous=self.final_states.get(identity)
        if previous and previous['decision']=='blocked':
            claim.pop('verification',None);claim['review_note']='Final nanoda check rejected this proof; the submitted bound remains Claimed.'
            return
        if stage=='lean' and previous:
            # A late checkpoint cannot replace any final outcome for this source.
            if previous['decision']!='lean-verified':claim.pop('verification',None)
            return
        if stage=='final':
            self.final_states[identity]=dict(key=key,submission=claim['submission'],decision=verdict['decision'],evidence=evidence)
        if verdict['decision']=='blocked':
            claim.pop('verification',None);claim['review_note']='Final nanoda check rejected this proof; the submitted bound remains Claimed.'
            self.notes.append(key+': nanoda rejected; Lean Verified removed; eligible row remains Claimed; publisher maintainer alert applies')
        elif verdict['decision']=='held':
            # Re-read at each refresh while the artifact lasts, so an approval lists it at the next run.
            claim.pop('verification',None);claim['review_note']=HELD_NOTE
            self.notes.append(key+': Lean checks passed; held for lead review (derivation report); decide in review-decisions.json derivations')
        elif verdict['decision']=='lean-verified':
            claim['verification']=evidence;claim.pop('review_note',None)
        else:claim.pop('verification',None)

    def verify(self,claims,previous):
        self.final_states=copy.deepcopy(previous.get('final_states',{}))
        # Keep a validated receipt across GitHub artifact expiry, but never across
        # changed submission bytes, test labels, or changed trust policy.
        for key,claim in claims.items():
            prior=previous.get('entries',{}).get(key,{})
            same=claim['submission']==prior.get('submission')
            if claim['submission'] is None and prior.get('submission') and claim['item']['head']['sha']==prior['submission']['commit']:
                claim['submission']=prior['submission'];same=True
            proof=prior.get('verification')
            approved_fingerprints={sha(canonical(blobs).encode()) for blobs in [self.config['controller_blobs'],*self.config.get('previous_controller_blobs',{}).values()]}
            if same and proof and (proof.get('policy_hash')==self.policy_hash or proof.get('controller_fingerprint') in approved_fingerprints):
                path=self.root/proof['receipt_path']
                if path.is_file() and sha(path.read_bytes())==proof['receipt_sha256']:
                    claim['verification']=proof
        for key,claim in claims.items():
            if claim['submission'] is None:
                for state in self.final_states.values():
                    if state['key']==key and state['submission']['commit']==claim['item']['head']['sha']:
                        claim['submission']=state['submission'];break
            if claim['submission']:
                state=self.final_states.get(self.outcome_id(key,claim['submission']))
                if state and state['decision']!='lean-verified':
                    claim.pop('verification',None)
                    if state['decision']=='blocked':claim['review_note']='Final nanoda check rejected this proof; the submitted bound remains Claimed.'
                    if state['decision']=='held':claim['review_note']=HELD_NOTE
        artifacts=self.api.pages(PREFIX+'actions/artifacts',key='artifacts')
        by_id={a['id']:a for a in artifacts}
        # Newest result for a source wins; process oldest first.
        results=sorted((a for a in artifacts if not a.get('expired') and a['name'].startswith(('direct-submission-','pr-submission-'))),key=lambda a:a['id'])
        for artifact in results:
            match=re.fullmatch(r'direct-submission-(\d+)-(\d+)-(\d+)',artifact['name'])
            if match:
                key='direct-issue-'+match[3]
                if key not in claims:continue
            else:
                if not artifact['name'].startswith('pr-submission-'):continue
                if not claims:continue
            raw=self.artifact(artifact)
            members=archive_members(raw,artifact)
            for name,content in members.items():
                if name!='direct-submission.json' and not re.fullmatch(r'(?:pr-submission-\d+(?:-lean)?|direct-submission-\d+-lean)\.json',name):continue
                env=read_json(content)
                number=env.get('issue_number') if env.get('schema_version')==1 else env.get('request',{}).get('pr_number')
                key=('direct-issue-' if env.get('schema_version')==1 else 'direct-pr-')+str(number)
                if key not in claims:continue
                claim=claims[key];item=claim['item']
                if is_test_submission(item,env):
                    claim['exclude']=True;continue
                if claim.get('verification',{}).get('result_artifact_id') == artifact['id']:
                    continue
                try:
                    run=self.run(int(env['run_id']));self.trusted(run['head_sha'])
                    proof_meta=by_id[env['receipt_artifact']['id']]
                    require(not proof_meta.get('expired'),'Evidence artifact expired')
                    proof_raw=self.artifact(proof_meta)
                    if env['schema_version']==1:
                        publisher=None
                        if name.endswith('-lean.json'):
                            publisher=self.run(int(env['publisher_run_id']));self.trusted(publisher['head_sha'])
                        verdict=validate_result(raw,item,run,artifact,self.trust,receipt_archive=proof_raw,receipt_artifact=proof_meta,publisher=publisher)
                        verdict=self.derivation(key,verdict)
                    else:
                        publisher=self.run(int(env['publisher_run_id']));self.trusted(publisher['head_sha'])
                        layout=inspect_pr(self.api,item,env['request']['base_sha'])
                        verdict,env,_=validate_pr_result(raw,artifact,name,item,run,publisher,proof_raw,proof_meta,self.trust,layout)
                        claim['submission']=layout['submission']
                    evidence=self.evidence(key,env,run,artifact,proof_meta,raw,proof_raw,verdict,publisher)
                    self.retain_outcome(key,claim,env.get('verification_stage','final'),verdict,evidence)
                except (Rejected,ValueError,KeyError,TypeError,zipfile.BadZipFile) as error:
                    self.notes.append(key+': receipt not admitted ('+type(error).__name__+')')
        kept={}
        for key,claim in claims.items():
            if not claim.get('submission') or claim.get('exclude'):continue
            if claim.get('closed') and not self.final_verified(key,claim):
                if claim.get('claimed_only') or (claim['route']=='issue' and self.claimed_only(claim)):
                    claim['claimed_only']=True;claim['review_note']=CLAIMED_ONLY_NOTE;kept[key]=claim;continue
                self.notes.append(key+': closed without a final Lean Verified result; not listed');continue
            kept[key]=claim
        return kept

    def final_verified(self,key,claim):
        # The final outcome for these exact submission bytes (an edited body is a new source).
        state=self.final_states.get(self.outcome_id(key,claim['submission']))
        return bool(state and state['decision']=='lean-verified')

    def collect(self):
        path=self.root/'direct-submissions.json'
        previous=json.loads(path.read_text()) if path.exists() else {}
        discovered=self.discover()
        # 2026-10-22 16:18Z: GitHub listed no verifier issue at all for one read, so the
        # refresh dropped 13 rows (the 3SUM leader among them). An issue or PR is never
        # removed from these lists, so a known submission that is missing means the read
        # is incomplete: keep the previous bundle (main() exits 1; the step is soft).
        missing=sorted(set(previous.get('entries',{}))-self.listed)
        if missing:
            raise ValueError(f'GitHub lists {len(missing)} known submission(s) no more ({", ".join(missing[:5])}); preserve previous data')
        claims=self.verify(discovered,previous)
        return claims

def row_for(key,claim,now,old=None,note=None):
    sub=claim['submission'];item=claim['item'];proof=claim.get('verification');login=item['user']['login']
    require(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9-]{0,38}',login),'Invalid submitter login')
    tier='verified' if proof else 'claimed';route=claim['route']
    source=sub['repo_url']+'/blob/'+sub['commit']+'/'+(sub.get('source_subdir','')+'/' if sub.get('source_subdir') else '')+(proof.get('source_file','Submission.lean') if proof else 'Submission.lean')
    snapshot=dict(route=route,number=item['number'],url=item['html_url'],submitter=login,created_at=item['created_at'],submission=sub)
    path='sources/'+key+'-submission.json';raw=json_bytes(snapshot)
    row=dict(id=key,kind='improvement',score=sub['bound'],score_relation='attained',tier=tier,
        submitted_at=item['created_at'],spec_version='1',title=f'{login} direct {sub["problem"]} submission',
        authors=[dict(name=login,url='https://github.com/'+login)],predecessors=[note['predecessor']] if note else [],submission_url=item['html_url'],
        source_commit=sub['commit'],artifact=dict(path=path,sha256=sha(raw)),
        evidence=dict(paper_url=item['html_url'],theorem='Race.bound',certificate_path=None),dependencies=[],
        upstream_status='merged' if route=='pull_request' and item.get('merged') else 'closed-unmerged' if route=='pull_request' and claim.get('closed') else 'open',
        upstream_status_at=item.get('merged_at') or item['created_at'],site_observed_at=old['site_observed_at'] if old else now,
        source=dict(kind='repo-artifact',url=source))
    meta=dict(checked_at=now[:10],source_url=source,repo=sub['repo_url'].removeprefix('https://github.com/'),
        site_badge=False,eligible_for_record=row['upstream_status']=='merged',proof_status=proof['reason'] if proof else claim.get('review_note','Submitted bound; independent verification has not passed.'),
        upstream_tier=tier,site_tier=tier,comparison_key=PROBLEMS[sub['problem']][0]+'/v1',
        publication_date=item['created_at'],publication_date_precision='date-time',publication_date_role='Submission opened',
        publication_source_url=item['html_url'],direct_submission=True,route=route)
    # A reviewed credit note (data/direct-notes.json) survives the hourly rebuild of direct rows.
    if note:meta['credit_note']=note['text']
    if proof:
        row['rerun_status']=dict(state='passed',checked_at=proof['checked_at'],receipt_path=proof['receipt_path'])
        meta['receipt_url']=proof['receipt_url']
    return row,meta,{path:raw}

REVIEW_LABEL='verification-needs-review'

def verification_state(key,claim,final_states):
    """passed (a Lean Verified receipt), held (a derivation hold, or the verifier's review label on the
    issue or PR), failed (a final outcome for these exact submission bytes that is not Lean Verified)
    or pending. The records feed holds a pending direct claim's post until its verification ends, and
    a held one until the lead approves it (Nil and Lead, 2026-10-23)."""
    if claim.get('verification'):return 'passed'
    state=(final_states or {}).get(key+':'+sha(canonical(claim['submission']).encode()))
    labels={l.get('name') for l in claim['item'].get('labels') or [] if isinstance(l,dict)}
    if (state and state['decision']=='held') or REVIEW_LABEL in labels:return 'held'
    return 'failed' if state and state['decision']!='lean-verified' else 'pending'

def display_up(bound,places=6):
    """A decimal of a lower-is-better coefficient, rounded up: a shown value never claims more than the proof."""
    value=Fraction(bound);scaled=-((-value.numerator*10**places)//value.denominator)
    text=f'{scaled//10**places}.{scaled%10**places:0{places}d}'.rstrip('0')
    return text+'0' if text.endswith('.') else text

def other_claims(claims,withdrawn,notes):
    """{'other-<slug>': {'claims': [...]}} for the Lean Verified direct results of Other bounds rows."""
    boards={}
    for key,claim in sorted(claims.items()):
        sub=claim['submission'];proof=claim.get('verification')
        if sub['problem'] not in OTHER or key in withdrawn or not proof or not re.fullmatch(r'direct-issue-[1-9][0-9]*',key):continue
        item=claim['item'];login=item['user']['login']
        require(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9-]{0,38}',login),'Invalid submitter login')
        row=OTHER[sub['problem']];shown=display_up(sub['bound'])
        note=notes.get(key,{}).get('text','')
        require(not re.search(r'[<>&]',note),'A credit note has a character (< > &) that the page cannot show as text')
        boards.setdefault('other-'+sub['problem'],{'claims':[]})['claims'].append(dict(
            author=login,handle=key,value=sub['bound'],display=shown,date=item['created_at'],dateSource=item['html_url'],dateKind='first-stated',
            url=item['html_url'],lean=True,evidence='lean-verified',note=note,authors=[dict(name=login,url='https://github.com/'+login)],
            leanNote='Yes: the Big O Speedrun verifier checked this Lean proof (Lean kernel and the permitted-axiom audit).',
            proofScope='The verifier checked Race.bound : '+row['statement']+' ('+sub['bound']+') at commit '+sub['commit']+' of '+sub['repo_url']+'.',
            bound=row['bound'].format(value=shown),receiptPath=proof['receipt_path']))
    return boards

def prepare(root,claims,files,now,final_states=None,config=None):
    documents={slug:json.loads((root/(slug+'.json')).read_text()) for slug in SLUGS.values()}
    suppressed=apply_bindings(documents,claims,final_states or {},config or {})
    notes_path=root/'direct-notes.json'
    reviewed=json.loads(notes_path.read_text()) if notes_path.exists() else {}
    notes=reviewed.get('notes',{})
    # Submissions their submitter withdrew (data/direct-notes.json): no row, however often the claim is read again.
    withdrawn=reviewed.get('withdrawn',{})
    for slug,doc in documents.items():
        old={r['id']:r for r in doc['records']}
        doc['records']=[r for r in doc['records'] if not doc['record_metadata'][r['id']].get('direct_submission')]
        doc['record_metadata']={k:v for k,v in doc['record_metadata'].items() if not v.get('direct_submission')}
        for key,claim in sorted(claims.items()):
            if key in suppressed or key in withdrawn or SLUGS.get(claim['submission']['problem'])!=slug:continue
            row,meta,source=row_for(key,claim,now,old.get(key),notes.get(key));files.update(source)
            meta['verification']=verification_state(key,claim,final_states)
            doc['records'].append(row);doc['record_metadata'][key]=meta
        prior=json.loads((root/(slug+'.json')).read_text())
        if doc!=prior:
            doc['updated_at']=now;doc['checked_at']=now[:10]
            files[slug+'.json']=json_bytes(doc)
    files['direct-other.json']=json_bytes(dict(schema_version=1,boards=other_claims(claims,withdrawn,notes)))
    state=dict(schema_version=1,entries={k:{field:v for field,v in c.items() if field in ('route','submission','verification')} for k,c in claims.items()})
    state['final_states']=final_states or {}
    files['direct-submissions.json']=json_bytes(state)
    if any(slug+'.json' in files for slug in SLUGS.values()):
        registry=json.loads((root/'registry.json').read_text());registry['updated_at']=now;registry['checked_at']=now[:10]
        files['registry.json']=json_bytes(registry)
    return {p:raw for p,raw in files.items() if not (root/p).exists() or (root/p).read_bytes()!=raw}

def transaction(root,files,check_only=False):
    # All validation completes in a private staging copy before any bundle write.
    with tempfile.TemporaryDirectory(prefix='bos-direct-') as temp:
        stage=Path(temp)/'data';shutil.copytree(root,stage,ignore=shutil.ignore_patterns('__pycache__'))
        for path,raw in files.items():
            dest=stage/path;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(raw)
        result=subprocess.run([sys.executable,str(stage/'validate.py')],capture_output=True,text=True)
        if result.returncode:raise RuntimeError('Staged direct data validation failed: '+result.stderr[-2000:])
        if check_only:return
        old={path:(root/path).read_bytes() if (root/path).exists() else None for path in files}
        try:
            for path in files:
                dest=root/path;dest.parent.mkdir(parents=True,exist_ok=True)
                tmp=dest.with_name(dest.name+'.direct-tmp');tmp.write_bytes(files[path]);os.replace(tmp,dest)
        except BaseException:
            for path,raw in old.items():
                if raw is None:(root/path).unlink(missing_ok=True)
                else:(root/path).write_bytes(raw)
            raise

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--check-only',action='store_true');args=parser.parse_args()
    importer=Importer(GitHub());claims=importer.collect()
    now=datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
    files=prepare(ROOT,claims,importer.files,now,importer.final_states,importer.config)
    from maintainer_import import collect_maintainer
    files=collect_maintainer(importer,files,now)
    transaction(ROOT,files,args.check_only)
    print(f'{now}: direct submissions: {len(claims)} rows; {len(files)} changed files; check_only={args.check_only}')
    for note in importer.notes:print(note)

if __name__=='__main__':
    try:main()
    except Exception as error:
        print('Direct import failed; previous bundle retained: '+str(error),file=sys.stderr)
        sys.exit(1)
