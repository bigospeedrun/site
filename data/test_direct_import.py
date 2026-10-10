"""Offline identity, statement and policy tests; no live registry changes."""
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
            html_url='https://github.com/bigospeedrun/verifier/actions/runs/123')
        self.issue = dict(number=7, state='open', title='[Lean submission] test', user={'login':'submitter'},
            created_at='2026-10-10T10:00:00Z',updated_at='2026-10-10T10:00:00Z',
            html_url='https://github.com/bigospeedrun/verifier/issues/7')
        self.configure('dft', '7547360/10000000000', 'dft233')

    def configure(self, problem, bound, entrypoint=None):
        raw=dict(schema_version=1,problem=problem,bound=bound,repo_url='https://github.com/chafreaky/wht-power-saving-lean',
                 commit='837dc3130adc79f7b7ab4ddd56c15576bbd766b0',authors=['Chafik Boukhalfa'])
        if entrypoint:raw['entrypoint']=entrypoint
        self.issue['body']=json.dumps(raw,indent=2)
        sub=gate.normalize(raw);profile=self.trust[self.revision]['profiles'][entrypoint or problem];names=profile['theorem_names']
        receipt=dict(profile=copy.deepcopy(profile),request=dict(direct_submission=sub,repo_url=sub['repo_url'],commit=sub['commit'],
            challenge_file=profile['challenge_file'],theorem_names=','.join(names),lean_toolchain=profile['lean_toolchain']),
            verifier_commit=self.revision,run_url=self.run['html_url'],theorem_names=names,finished_unix=1791638746,
            generated_challenge_sha256=gate.sha(gate.challenge_bytes(sub,self.trust[self.revision]['statements'][profile['challenge_file']])),
            status='passed',kernels={'lean':{'status':'passed'},'nanoda':{'status':'passed'}},
            axiom_audit={'status':'passed','reported_axioms':{n:sorted(gate.AXIOMS) for n in names}},
            theorems={n:dict(lean_kernel='passed',nanoda_kernel='passed',reported_axioms=sorted(gate.AXIOMS)) for n in names})
        self.env=dict(schema_version=1,submission=sub,submission_sha256=gate.sha(gate.canonical(sub).encode()),
            issue_body_sha256=gate.sha(self.issue['body'].encode()),issue_submitter='submitter',issue_number=7,
            issue_url=self.issue['html_url'],issue_created_at=self.issue['created_at'],issue_updated_at=self.issue['updated_at'],
            run_id='123',run_attempt='2',run_url=self.run['html_url'],verifier_commit=self.revision,status='passed',receipt=receipt)

    def check(self, *, env=None, run=None, issue=None, meta_change=None, extra_file=False):
        stream=io.BytesIO()
        with zipfile.ZipFile(stream,'w',zipfile.ZIP_DEFLATED) as zipped:
            zipped.writestr('direct-submission.json',json.dumps(self.env if env is None else env))
            if extra_file:zipped.writestr('../code.py','not executed')
        archive=stream.getvalue()
        meta=dict(id=99,expired=False,digest='sha256:'+gate.sha(archive),name='direct-submission-123-2',
                  workflow_run={'id':123,'head_sha':self.revision})
        if meta_change:meta.update(meta_change)
        return gate.validate_result(archive, self.issue if issue is None else issue,self.run if run is None else run,meta,self.trust)

    def test_all_problems_exact_score_and_repeatability(self):
        for problem,bound in [('dft','1/1000'),('3sum','1999/1000'),('apsp','2999/1000')]:
            self.configure(problem,bound)
            result=self.check()
            self.assertEqual(result['decision'],'lean-verified')
            self.assertEqual(result['score'],bound)
            self.assertEqual(result,self.check())
            self.assertEqual(result['receipt_url'],self.run['html_url'])
            self.assertEqual(result['issue_submitter'],'submitter')
            self.assertEqual(result['authors'],['Chafik Boukhalfa'])

    def test_legacy_replay_is_never_importable(self):
        fixture=json.loads((FIXTURES/'dft-837dc31.json').read_text())
        self.assertTrue(fixture['test_only'])
        self.assertEqual(gate.normalize(fixture['submission'])['bound'],'47171/62500000')
        self.env['test_only']=True
        self.env['receipt']=json.loads((FIXTURES/'historical-dft-receipt.json').read_text())
        with self.assertRaises(gate.Rejected):self.check()

    def test_every_named_theorem_is_required(self):
        name=self.env['receipt']['theorem_names'][1]
        del self.env['receipt']['theorems'][name]
        with self.assertRaises(gate.Rejected):self.check()

    def test_nanoda_policy(self):
        for state,reason,expected in [('passed',None,'lean-verified'),('incomplete','oom','lean-verified'),
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
                       {'head_repository':{'full_name':'attacker/verifier'}},{'run_attempt':3},{'status':'in_progress'}]:
            with self.subTest(change=change),self.assertRaises(gate.Rejected):self.check(run={**self.run,**change})
        for change in [{'digest':'sha256:'+'0'*64},{'name':'direct-submission-123-1'},{'expired':True},
                       {'workflow_run':{'id':124,'head_sha':self.revision}}]:
            with self.subTest(change=change),self.assertRaises(gate.Rejected):self.check(meta_change=change)
        with self.assertRaises(gate.Rejected):self.check(extra_file=True)

    def test_exact_issue_bytes_and_version_bound(self):
        for change in [{'body':self.issue['body']+'\n'},{'user':{'login':'other'}},{'state':'closed'},
                       {'updated_at':'2026-10-10T11:00:00Z'},{'pull_request':{}}]:
            with self.subTest(change=change),self.assertRaises(gate.Rejected):self.check(issue={**self.issue,**change})
        for field in ['issue_body_sha256','issue_submitter','submission_sha256']:
            env=copy.deepcopy(self.env);env.pop(field)
            with self.subTest(field=field),self.assertRaises(gate.Rejected):self.check(env=env)

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
        for bound in ['1e-3','1/0','-1','0.'+'1'*100,'9'*19]:
            sub=copy.deepcopy(self.env['submission']);sub['bound']=bound
            with self.subTest(bound=bound),self.assertRaises(gate.Rejected):gate.normalize(sub)

if __name__=='__main__':unittest.main()
