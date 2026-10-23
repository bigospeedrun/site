"""Offline identity, statement and policy tests; no live registry changes."""
from datetime import datetime, timezone
import copy
import io
import json
from pathlib import Path
import unittest
import zipfile
import direct_import as gate

FIXTURES = Path(__file__).with_name('direct-fixtures')

class DirectImportTests(unittest.TestCase):
    def setUp(self):
        self.revision = 'a'*40  # Synthetic, never configured in a live importer.
        profiles = json.loads((FIXTURES/'profiles.json').read_text())
        self.trust = {self.revision:dict(workflow_id=42, branch='main', profiles=profiles,
            statements={p['challenge_file']:(FIXTURES/Path(p['challenge_file']).name).read_bytes() for p in profiles.values()})}
        self.run = dict(id=123, run_attempt=2, head_sha=self.revision, workflow_id=42,
            path=gate.WORKFLOW, head_branch='main', event='issues', status='completed', conclusion='success',
            repository={'full_name':gate.REPOSITORY},head_repository={'full_name':gate.REPOSITORY},
            html_url='https://github.com/bigospeedrun/verifier/actions/runs/123',referenced_workflows=[{'path':gate.REPOSITORY+'/'+gate.REUSABLE+'@refs/heads/main','sha':self.revision}])
        self.issue = dict(number=7, state='open', title='[Lean submission] test', user={'login':'submitter'},
            created_at='2026-10-10T10:00:00Z',updated_at='2026-10-10T10:00:00Z',
            html_url='https://github.com/bigospeedrun/verifier/issues/7')
        self.configure('dft', '47171/62500000')

    def configure(self, problem, bound, entrypoint=None):
        raw=dict(schema_version=1,problem=problem,bound=bound,repo_url='https://github.com/chafreaky/wht-power-saving-lean',
                 commit='837dc3130adc79f7b7ab4ddd56c15576bbd766b0',authors=[])
        if entrypoint:raw['entrypoint']=entrypoint
        self.issue['body']=f"### Problem\n\n{problem}\n\n### Repository URL\n\n{raw['repo_url']}\n\n### Commit SHA\n\n{raw['commit']}\n\n### Bound\n\n{bound}\n"
        sub=gate.normalize(raw);profile=self.trust[self.revision]['profiles'][entrypoint or problem];names=profile['theorem_names']
        receipt=dict(profile=copy.deepcopy(profile),request=dict(direct_submission=sub,repo_url=sub['repo_url'],commit=sub['commit'],
            challenge_file=profile['challenge_file'],theorem_names=','.join(names),lean_toolchain=profile['lean_toolchain']),
            verifier_commit=self.revision,run_url=self.run['html_url'],theorem_names=names,finished_unix=1791638746,
            generated_challenge_sha256=gate.sha(gate.challenge_bytes(sub,self.trust[self.revision]['statements'][profile['challenge_file']])),
            status='passed',kernels={'lean':{'status':'passed'},'nanoda':{'status':'passed'}},
            axiom_audit={'status':'passed','reported_axioms':{n:sorted(gate.AXIOMS) for n in names}},
            theorems={n:dict(lean_kernel='passed',nanoda_kernel='passed',reported_axioms=sorted(gate.AXIOMS)) for n in names})
        receipt['checked_at']=datetime.fromtimestamp(receipt['finished_unix'],timezone.utc).isoformat().replace('+00:00','Z')
        receipt['artifact_sha256']={}
        self.env=dict(test_only=False,importable=True,problem_id=gate.PROBLEMS[problem][0],score_relation='attained',
            model_revision=profile['upstream_commit'],model_sha256=profile['challenge_sha256'],source_published_at=None,workflow_conclusion=None,
            checked_at=receipt['checked_at'],theorem_names=names,challenge=dict(file=profile['challenge_file'],sha256=profile['challenge_sha256'],upstream_commit=profile['upstream_commit'],generated_sha256=receipt['generated_challenge_sha256']),schema_version=1,submission=sub,submission_sha256=gate.sha(gate.canonical(sub).encode()),
            issue_body_sha256=gate.sha(self.issue['body'].encode()),issue_submitter_login='submitter',issue_number=7,
            issue_url=self.issue['html_url'],issue_created_at=self.issue['created_at'],issue_updated_at=self.issue['updated_at'],
            run_id='123',run_attempt='2',run_url=self.run['html_url'],verifier_commit=self.revision,status='passed',receipt=receipt)

    def check(self, *, env=None, run=None, issue=None, meta_change=None, extra_file=False, receipt_meta_change=None, raw_receipt_tamper=False, log_files=None, publisher=None):
        env=copy.deepcopy(self.env if env is None else env)
        raw=json.dumps(env['receipt']).encode()
        receipt_stream=io.BytesIO()
        with zipfile.ZipFile(receipt_stream,'w',zipfile.ZIP_DEFLATED) as zipped:
            zipped.writestr('receipt.json',raw if not raw_receipt_tamper else b'{}')
            for name, content in (log_files or {}).items():
                zipped.writestr(name, content)
        receipt_archive=receipt_stream.getvalue()
        receipt_meta=dict(id=100,expired=False,name='verifier-receipt-and-logs-123-2-7'+('-lean' if publisher else ''),digest='sha256:'+gate.sha(receipt_archive),workflow_run={'id':123,'head_sha':self.revision})
        env['receipt_artifact']={k:receipt_meta[k] for k in ['id','name','digest']}
        env['receipt_artifact']['archive_url']='https://github.com/bigospeedrun/verifier/actions/runs/123/artifacts/100'
        env['receipt_url']=env['receipt_artifact']['archive_url']
        env['receipt_sha256']=gate.sha(raw)
        if receipt_meta_change:receipt_meta.update(receipt_meta_change)
        stream=io.BytesIO()
        with zipfile.ZipFile(stream,'w',zipfile.ZIP_DEFLATED) as zipped:
            zipped.writestr('direct-submission-7-lean.json' if publisher else 'direct-submission.json',json.dumps(env))
            if extra_file:zipped.writestr('../code.py','not executed')
        archive=stream.getvalue()
        meta=dict(id=99,expired=False,digest='sha256:'+gate.sha(archive),name='direct-submission-123-2-7',
                  workflow_run={'id':123,'head_sha':self.revision})
        if publisher:
            meta.update(name='pr-submission-123-2-publisher-456-2',workflow_run={'id':456,'head_sha':self.revision})
        if meta_change:meta.update(meta_change)
        return gate.validate_result(archive, self.issue if issue is None else issue,self.run if run is None else run,meta,self.trust,receipt_archive=receipt_archive,receipt_artifact=receipt_meta,publisher=publisher)

    def test_committed_form_and_challenge_fixture(self):
        body = (FIXTURES/'issue-form-body.txt').read_text()
        submission = gate.parse_body(body)
        self.assertEqual(submission['bound'], '1/1000')
        self.assertEqual(submission['authors'], [])
        envelope = json.loads((FIXTURES/'generic-envelope.json').read_text())
        profile = self.trust[self.revision]['profiles'][submission['problem']]
        base = self.trust[self.revision]['statements'][profile['challenge_file']]
        self.assertEqual(gate.sha(gate.challenge_bytes(envelope['submission'], base)),
                         envelope['challenge']['generated_sha256'])
        receipt = envelope['receipt']
        for name in envelope['theorem_names']:
            self.assertEqual(receipt['theorems'][name]['reported_axioms'],
                             receipt['axiom_audit']['reported_axioms'][name])

    def test_test_labels_exclude_receipts_and_open_claims(self):
        for labels in [[{'name': 'test'}], ['test'], [{'name': 'TEST'}]]:
            for route in ['issue', 'pull_request']:
                item = dict(self.issue, labels=labels)
                if route == 'pull_request':
                    item['pull_request'] = {'url': 'https://api.github.com/repos/bigospeedrun/verifier/pulls/2'}
                self.assertTrue(gate.is_test_submission(item))
                with self.assertRaises(gate.Rejected):
                    self.check(issue=item)
        self.assertFalse(gate.is_test_submission(dict(self.issue, labels=[{'name': 'verification-needs-review'}])))
        for payload in [{'test_only': True}, {'request': {'test_only': True}},
                        {'receipt': {'test_only': True}}, {'request': {'inputs': {'test_only': True}}},
                        {'request': {'inputs': {}, 'submission': {'test_only': True}}}]:
            self.assertTrue(gate.is_test_submission(self.issue, payload))
        for field in ['request', 'receipt']:
            env = copy.deepcopy(self.env)
            env.setdefault(field, {})['test_only'] = True
            with self.assertRaises(gate.Rejected):
                self.check(env=env)

    def test_non_test_copy_retains_same_proof_but_can_admit(self):
        smoke = copy.deepcopy(self.env)
        smoke.update(test_only=True, importable=False, status='fixture_only')
        with self.assertRaises(gate.Rejected):
            self.check(env=smoke)
        production = copy.deepcopy(smoke)
        production.update(test_only=False, importable=True, status='passed')
        self.assertEqual(production['receipt'], smoke['receipt'])
        self.assertEqual(self.check(env=production)['decision'], 'lean-verified')

    def test_a_derivation_hold_is_admitted_only_as_a_non_importable_envelope(self):
        # Verifier scripts/derivation.py: a held pass has importable false; results before the report have no field.
        held=copy.deepcopy(self.env);held.update(importable=False,derivation={'status':'computed','hold':True})
        result=self.check(env=held)
        self.assertEqual((result['decision'],result['derivation_hold']),('lean-verified',True))
        self.assertFalse(self.check()['derivation_hold'])
        for bad in [dict(importable=True,derivation={'hold':True}),dict(importable=False,derivation={'hold':False}),
                    dict(importable=False,derivation=None),dict(importable=False,derivation={'hold':'yes'}),dict(importable=False,derivation=[1])]:
            with self.assertRaises(gate.Rejected):self.check(env=dict(copy.deepcopy(self.env),**bad))
        self.assertFalse(self.check(env=dict(copy.deepcopy(self.env),derivation={'status':'no_match','hold':False}))['derivation_hold'])

    def test_average_sensitivity_target_and_reviewed_statement(self):
        trust=json.loads((Path(__file__).with_name('direct-trust.json')).read_text())
        profile=trust['profiles']['average-sensitivity']
        raw=(FIXTURES/'VerifierStatement.lean').read_bytes()
        self.assertEqual(gate.sha(raw),profile['challenge_sha256'])
        sub=gate.normalize(dict(schema_version=1,problem='average-sensitivity',bound='1881/500',repo_url='https://github.com/u/p',commit='a'*40,authors=[]))
        self.assertTrue(gate.challenge_bytes(sub,raw).endswith('theorem Race.bound : BigOSpeedrun.AverageSensitivity.Bound ((1881 : ℚ) / 500) := by\n  sorry\n'.encode()))
        with self.assertRaises(gate.Rejected):
            gate.normalize(dict(sub,bound='17/2'))

    def test_early_issue_binds_publisher_stage_and_pending_reason(self):
        self.trust[self.revision]['publisher_workflow_id']=43
        publisher=dict(self.run,id=456,workflow_id=43,path='.github/workflows/pr-publish.yml',event='workflow_run',html_url='https://github.com/bigospeedrun/verifier/actions/runs/456')
        self.env.update(verification_stage='lean',publisher_commit=self.revision,publisher_run_id='456',publisher_run_attempt='2')
        receipt=self.env['receipt'];receipt['verification_stage']='lean'
        receipt['kernels']['nanoda']=dict(status='pending',reason='advisory_queued')
        for target in receipt['theorems'].values():target['nanoda_kernel']='pending'
        run=dict(self.run,status='in_progress',conclusion=None)
        self.assertEqual(self.check(run=run,publisher=publisher)['decision'],'lean-verified')
        with self.assertRaises(gate.Rejected):self.check(run=run)
        with self.assertRaises(gate.Rejected):self.check(run=run,publisher=dict(publisher,head_sha='b'*40))
        receipt['kernels']['nanoda']['reason']='unknown'
        self.assertEqual(self.check(run=run,publisher=publisher)['decision'],'pending')

    def test_evidence_log_hashes(self):
        content = b'Synthetic test log, not proof evidence.'
        receipt = self.env['receipt']
        receipt['kernels']['lean']['log'] = 'lean.log'
        receipt['artifact_sha256'] = {'lean.log': gate.sha(content)}
        self.assertEqual(self.check(log_files={'lean.log': content})['decision'], 'lean-verified')
        for files in [{}, {'lean.log': b'changed'}]:
            with self.assertRaises(gate.Rejected):
                self.check(log_files=files)
        receipt['artifact_sha256'] = {}
        with self.assertRaises(gate.Rejected):
            self.check(log_files={'lean.log': content})

    def test_all_problems_exact_score_and_repeatability(self):
        for problem,bound in [('dft','1/1000'),('3sum','1999/1000'),('apsp','2999/1000')]:
            self.configure(problem,bound)
            result=self.check()
            self.assertEqual(result['decision'],'lean-verified')
            self.assertEqual(result['score'],bound)
            self.assertEqual(result,self.check())
            self.assertEqual(result['receipt_url'],self.run['html_url'])
            self.assertEqual(result['issue_submitter'],'submitter')
            self.assertEqual(result['authors'],[])

    def test_legacy_replay_is_never_importable(self):
        fixture=json.loads((FIXTURES/'dft-837dc31.json').read_text())
        self.assertTrue(fixture['test_only'])
        self.assertEqual(gate.normalize(fixture['submission'])['bound'],'47171/62500000')
        self.env['test_only']=True
        self.env['receipt']=json.loads((FIXTURES/'historical-dft-receipt.json').read_text())
        with self.assertRaises(gate.Rejected):self.check()

    def test_every_named_theorem_is_required(self):
        name=self.env['receipt']['theorem_names'][0]
        del self.env['receipt']['theorems'][name]
        with self.assertRaises(gate.Rejected):self.check()

    def test_nanoda_policy(self):
        for state,reason,expected in [('passed',None,'lean-verified'),('incomplete','out_of_memory','lean-verified'),
                ('incomplete','timeout','lean-verified'),('rejected',None,'blocked'),('not_completed_or_rejected',None,'pending')]:
            with self.subTest(state=state,reason=reason):
                self.env['receipt']['kernels']['nanoda']={'status':state,'reason':reason}
                for theorem in self.env['receipt']['theorems'].values():theorem['nanoda_kernel']=state
                self.env['receipt']['status']='not_verified' if state!='passed' else 'passed'
                self.assertEqual(self.check()['decision'],expected)

    def test_lean_and_audit_required(self):
        for field in ['lean','audit']:
            env=copy.deepcopy(self.env)
            if field=='lean':env['receipt']['kernels']['lean']['status']='failed'
            else:env['receipt']['axiom_audit']['status']='failed'
            self.assertEqual(self.check(env=env)['decision'],'pending')

    def test_reject_unpermitted_or_mismatched_axioms(self):
        for mismatch in [False,True]:
            env=copy.deepcopy(self.env);name=env['receipt']['theorem_names'][0]
            env['receipt']['axiom_audit']['reported_axioms'][name].append('sorryAx' if not mismatch else 'propext')
            with self.assertRaises(gate.Rejected):self.check(env=env)

    def test_identity_and_artifact_tampering(self):
        for change in [{'head_sha':'b'*40},{'path':'untrusted.yml'},{'workflow_id':43},
                       {'head_repository':{'full_name':'attacker/verifier'}},{'run_attempt':3},{'status':'in_progress'},{'referenced_workflows':[]}]:
            with self.subTest(change=change),self.assertRaises(gate.Rejected):self.check(run={**self.run,**change})
        for change in [{'digest':'sha256:'+'0'*64},{'name':'direct-submission-123-1'},{'expired':True},
                       {'workflow_run':{'id':124,'head_sha':self.revision}}]:
            with self.subTest(change=change),self.assertRaises(gate.Rejected):self.check(meta_change=change)
        with self.assertRaises(gate.Rejected):self.check(extra_file=True)

    def test_exact_issue_bytes_and_version_bound(self):
        # The verifier closes the issue after its final comment; the result still binds.
        self.assertEqual(self.check(issue={**self.issue,'state':'closed'})['decision'],'lean-verified')
        for change in [{'body':self.issue['body']+'\n'},{'user':{'login':'other'}},{'state':'locked'},
                       {'created_at':'2026-10-10T11:00:00Z'},{'pull_request':{}}]:
            with self.subTest(change=change),self.assertRaises(gate.Rejected):self.check(issue={**self.issue,**change})
        for field in ['issue_body_sha256','issue_submitter_login','submission_sha256']:
            env=copy.deepcopy(self.env);env.pop(field)
            with self.subTest(field=field),self.assertRaises(gate.Rejected):self.check(env=env)

    def test_result_comment_keeps_unchanged_submission_valid(self):
        later = dict(self.issue, updated_at='2026-10-10T23:00:00Z')
        result = self.check(issue=later)
        self.assertEqual(result['decision'], 'lean-verified')
        self.assertEqual(result['id'], self.check()['id'])
        self.assertEqual(result['issue_updated_at_at_verification'], self.issue['updated_at'])
        self.assertEqual(result['issue_updated_at_at_import'], later['updated_at'])
        with self.assertRaises(gate.Rejected):
            self.check(issue=dict(later, body=later['body'].replace('47171/62500000', '1/1000')))

    def test_source_bound_profile_and_theorem_tampering(self):
        for kind in ['source','bound','profile','generated','theorem']:
            env=copy.deepcopy(self.env);receipt=env['receipt']
            if kind=='source':receipt['request']['commit']='b'*40
            if kind=='bound':receipt['request']['direct_submission']['bound']='1/100'
            if kind=='profile':receipt['profile']['challenge_sha256']='0'*64
            if kind=='generated':receipt['generated_challenge_sha256']='0'*64
            if kind=='theorem':receipt['theorem_names']=['Other.bound']
            with self.subTest(kind=kind),self.assertRaises(gate.Rejected):self.check(env=env)

    def test_input_parser_rejects_unbounded_and_ambiguous_data(self):
        with self.assertRaises(gate.Rejected):gate.read_json('{"bound":1,"bound":2}')
        for bound in ['1e-3','1/0','-1','0.'+'1'*100,'9'*41,'1/'+'9'*41,'1'+'0'*40+'/3']:
            sub=copy.deepcopy(self.env['submission']);sub['bound']=bound
            with self.subTest(bound=bound),self.assertRaises(gate.Rejected):gate.normalize(sub)

    def test_bounds_up_to_40_digits_per_integer_are_read_exactly(self):
        # Issue #35 (2026-10-21): the reduced 3SUM bound needs 19 digits in each integer.
        for problem,bound in [('3sum','4800698571997281331/2500000000000000000'),('dft','1/'+'9'*40),('dft','1'+'0'*38+'1/'+'3'+'0'*39)]:
            sub=copy.deepcopy(self.env['submission']);sub.update(problem=problem,bound=bound)
            with self.subTest(bound=bound):
                self.assertEqual(gate.normalize(sub)['bound'],bound)
                from fractions import Fraction
                n,d=Fraction(bound).as_integer_ratio();self.assertEqual(f'{n}/{d}' if d!=1 else str(n),bound)

    def test_new_envelope_and_receipt_artifact_bindings(self):
        for key,value in [('problem_id','apsp/word-ram'),('score_relation','strict-upper-bound'),
                          ('model_revision','b'*40),('checked_at','2020-01-01T00:00:00Z'),('test_only',True),
                          ('importable',False),('source_published_at','2026-10-10T13:00:00Z')]:
            env=copy.deepcopy(self.env);env[key]=value
            with self.subTest(field=key),self.assertRaises(gate.Rejected):self.check(env=env)
        with self.assertRaises(gate.Rejected):self.check(receipt_meta_change={'id':101})
        with self.assertRaises(gate.Rejected):self.check(receipt_meta_change={'digest':'sha256:'+'0'*64})
        with self.assertRaises(gate.Rejected):self.check(raw_receipt_tamper=True)

    def test_strict_form_and_reduced_bounds(self):
        for body in [self.issue['body']+'### Authors\n\nName',self.issue['body'].replace('47171/62500000','94342/125000000'),
                     json.dumps(self.env['submission']),self.issue['body'].replace('### Bound','### Unknown')]:
            with self.subTest(body=body),self.assertRaises(gate.Rejected):gate.parse_body(body)
        self.assertEqual(gate.parse_body(self.issue['body'].replace('\n','\r\n')),self.env['submission'])

    def test_actual_contract_fixtures_remain_nonimportable(self):
        for name in ['generic-envelope.json','replayed-envelope.json']:
            env=json.loads((FIXTURES/name).read_text())
            self.assertTrue(env['test_only']);self.assertFalse(env['importable'])
            with self.subTest(fixture=name),self.assertRaises(gate.Rejected):self.check(env=env)

    def test_board_and_tie_admission_policy(self):
        def board(problem, scores, verified=()):
            return dict(problem_id=gate.PROBLEMS[problem][0],score={'direction':'higher-is-better' if problem=='dft' else 'lower-is-better'},
                records=[dict(id=str(i),score=score,submission_url='https://example.invalid/'+str(i),rerun_status={'state':'passed','receipt_path':'sources/proof.json'}) for i,score in enumerate(scores)],
                record_metadata={str(i):dict(site_tier='verified' if i in verified else 'claimed',eligible_for_record=False) for i in range(len(scores))})
        for problem,score in [('dft','1/1000'),('3sum','1999/1000'),('apsp','2999/1000')]:
            self.configure(problem,score)
            # Nil ruling 2026-10-20: only Lean Verified rows gate a run; a Claimed row at the same bound is no leader.
            for verified,leaders in [((1,),['1']),((0,1),['0','1'])]:
                data=board(problem,[score,score],verified)
                summary=gate.current_record_gate(problem,json.dumps(data).encode(),'c'*40,'2026-10-10T13:00:00Z')
                self.assertEqual(summary['leader_ids'],leaders)
                self.assertFalse(gate.qualifies_for_run(self.env['submission'],summary))
                # A second issue gets its own identity; no other author's row is relabelled.
                original=copy.deepcopy(data)
                gate.qualifies_for_run(self.env['submission'],summary)
                self.assertEqual(data,original)
        data=board('dft',['1/1000'],(0,));data['records'][0]['score_relation']='strict-upper-bound'
        self.configure('dft','1/1000')
        summary=gate.current_record_gate('dft',json.dumps(data).encode(),'c'*40,'2026-10-10T13:00:00Z')
        self.assertTrue(gate.qualifies_for_run(self.env['submission'],summary))
        # On an exponent board an open endpoint n^(a+o(1)) is weaker than an attained O(n^a):
        # the attained row leads, and an attained submission at a still qualifies over the endpoint.
        for problem,score in [('3sum','3989/2000'),('apsp','5989/2000')]:
            self.configure(problem,score)
            data=board(problem,[score,score],(0,1));data['records'][0]['score_relation']='strict-upper-bound'
            summary=gate.current_record_gate(problem,json.dumps(data).encode(),'c'*40,'2026-10-10T13:00:00Z')
            self.assertEqual((summary['leader_ids'],summary['score_relation']),(['1'],'attained'))
            data=board(problem,[score],(0,));data['records'][0]['score_relation']='strict-upper-bound'
            summary=gate.current_record_gate(problem,json.dumps(data).encode(),'c'*40,'2026-10-10T13:00:00Z')
            self.assertEqual(summary['score_relation'],'strict-upper-bound')
            self.assertTrue(gate.qualifies_for_run(self.env['submission'],summary))

    def test_board_ignores_reproductions_and_candidate_issue(self):
        lean={'state':'passed','receipt_path':'sources/proof.json'}
        data=dict(problem_id=gate.PROBLEMS['dft'][0],score={'direction':'higher-is-better'},
            records=[{'id':'a','score':'1/1000','rerun_status':lean},{'id':'b','score':'1/10','rerun_status':lean},
                     {'id':'c','score':'1/100','submission_url':'candidate','rerun_status':lean},{'id':'d','score':'1/50'}],
            record_metadata={'a':{'site_tier':'verified'},'b':{'reproduction_of':'a','site_tier':'verified'},'c':{'site_tier':'verified'},'d':{'site_tier':'claimed'}})
        summary=gate.current_record_gate('dft',json.dumps(data).encode(),'c'*40,'2026-10-10T13:00:00Z','candidate')
        # The better Claimed row d does not gate (Nil ruling 2026-10-20); the Lean Verified a does.
        self.assertEqual(summary['leader_ids'],['a'])
        # Without a Lean Verified row the classical baseline gates; with neither, no guess.
        data=dict(problem_id=gate.PROBLEMS['dft'][0],score={'direction':'higher-is-better'},
            records=[{'id':'classical-baseline','score':'1/2000'},{'id':'d','score':'1/50'}],record_metadata={'classical-baseline':{},'d':{'site_tier':'claimed'}})
        summary=gate.current_record_gate('dft',json.dumps(data).encode(),'c'*40,'2026-10-10T13:00:00Z')
        self.assertEqual((summary['leader_ids'],summary['any_lean_verified_at_bound']),(['classical-baseline'],False))
        data['records']=data['records'][1:]
        with self.assertRaises(gate.Rejected):gate.current_record_gate('dft',json.dumps(data).encode(),'c'*40,'2026-10-10T13:00:00Z')

if __name__=='__main__':unittest.main()
