"""Offline PR contracts, identity attacks, and merge-policy regressions."""
import copy
import io
import json
import unittest
import zipfile
from unittest.mock import patch
from pathlib import Path
import test_direct_import as issue_tests
import direct_import as d
import direct_pr as p


def zipped(files):
    stream=io.BytesIO()
    with zipfile.ZipFile(stream,'w',zipfile.ZIP_DEFLATED) as archive:
        for name,raw in files.items():archive.writestr(name,raw)
    return stream.getvalue()

class PRTests(unittest.TestCase):
    def setUp(self):
        helper=issue_tests.DirectImportTests();helper.setUp();helper.configure('3sum','1999/1000')
        self.trust=helper.trust;self.run=helper.run
        self.trust[helper.revision]['publisher_workflow_id']=43
        self.publisher=dict(self.run,id=456,event='workflow_run',path=p.PUBLISHER,workflow_id=43,
                            html_url='https://github.com/bigospeedrun/verifier/actions/runs/456')
        self.pr=dict(number=3,state='closed',merged=True,merge_commit_sha='d'*40,
                     html_url='https://github.com/bigospeedrun/verifier/pull/3',user={'login':'alice'},
                     created_at='2026-10-10T10:00:00Z',labels=[],head={'sha':'c'*40},
                     base={'sha':'a'*40,'ref':'main','repo':{'full_name':d.REPOSITORY}},changed_files=2)
        sub=dict(helper.env['submission'],repo_url='https://github.com/'+d.REPOSITORY,commit='c'*40,source_subdir='submissions/3sum/alice-proof')
        manifest=b'{"problem":"3sum","bound":"1999/1000"}\n'
        self.layout=dict(submission=sub,submission_sha256=d.sha(d.canonical(sub).encode()),source_subdir=sub['source_subdir'],
            manifest_utf8=manifest.decode(),manifest_sha256=d.sha(manifest),changed_files=[],changed_files_sha256=d.sha(b'[]'),head_sha='c'*40,base_sha='a'*40)
        receipt=copy.deepcopy(helper.env['receipt'])
        receipt['request'].update(direct_submission=sub,source_subdir=sub['source_subdir'],repo_url=sub['repo_url'],commit=sub['commit'])
        request=dict(self.layout,schema_version=2,route='pull_request',test_only=False,pr_number=3,pr_url=self.pr['html_url'],
            pr_submitter_login='alice',pr_created_at=self.pr['created_at'],verifier_commit='a'*40,gate='ready',inputs=receipt['request'])
        self.env=dict(schema_version=2,route='pull_request',test_only=False,importable=True,request=request,receipt=receipt,
            run_id='123',run_attempt='2',run_url=self.run['html_url'],verifier_commit='a'*40,workflow_path=d.WORKFLOW,
            workflow_conclusion='success',publisher_commit='a'*40,publisher_run_id='456',publisher_run_attempt='2',
            disposition='merge',merge_commit='d'*40)

    def check(self,pr=None,env=None,run=None,publisher=None,layout=None,mutate_artifact=None,mutate_proof=None):
        env=copy.deepcopy(env or self.env)
        raw_receipt=json.dumps(env['receipt']).encode()
        proof=zipped({'receipt.json':raw_receipt,'pr-request.json':json.dumps(env['request'])})
        pm=dict(id=8,expired=False,digest='sha256:'+d.sha(proof),name='pr-verification-123-2-3'+('-lean' if env.get('verification_stage')=='lean' else ''),workflow_run=dict(id=123,head_sha='a'*40))
        env['receipt_artifact']=dict(id=8,name=pm['name'],digest=pm['digest'],url='https://github.com/bigospeedrun/verifier/actions/runs/123/artifacts/8')
        env['receipt_sha256']=d.sha(raw_receipt)
        env_name='pr-submission-3'+('-lean' if env.get('verification_stage')=='lean' else '')+'.json'
        raw=zipped({env_name:json.dumps(env)})
        am=dict(id=9,expired=False,digest='sha256:'+d.sha(raw),name='pr-submission-123-2-publisher-456-2',workflow_run=dict(id=456,head_sha='a'*40))
        if mutate_artifact:am.update(mutate_artifact)
        if mutate_proof:pm.update(mutate_proof)
        return p.validate_pr_result(raw,am,env_name,pr or self.pr,run or self.run,publisher or self.publisher,proof,pm,self.trust,layout or self.layout)

    def test_pass_and_separate_source_head(self):
        result,_,_=self.check()
        self.assertEqual(result['decision'],'lean-verified')
        self.assertNotEqual(self.pr['head']['sha'],self.run['head_sha'])

    def test_non_test_copy_retains_same_proof_but_can_admit(self):
        smoke = copy.deepcopy(self.env)
        smoke.update(test_only=True, importable=False)
        smoke['request']['test_only'] = True
        with self.assertRaises(d.Rejected):
            self.check(env=smoke)
        production = copy.deepcopy(smoke)
        production.update(test_only=False, importable=True)
        production['request']['test_only'] = False
        self.assertEqual(production['receipt'], smoke['receipt'])
        self.assertEqual(self.check(env=production)[0]['decision'], 'lean-verified')

    def test_early_pr_and_final_blocked_merged_pr(self):
        early=copy.deepcopy(self.env);early['verification_stage']='lean';early['workflow_conclusion']=None
        receipt=early['receipt'];receipt['verification_stage']='lean'
        receipt['kernels']['nanoda']=dict(status='pending',reason='advisory_queued')
        receipt['theorems']['Race.bound']['nanoda_kernel']='pending'
        run=dict(self.run,status='in_progress',conclusion=None)
        self.assertEqual(self.check(env=early,run=run)[0]['decision'],'lean-verified')
        final=copy.deepcopy(self.env);final.update(verification_stage='final',importable=False,disposition='blocked')
        final['receipt']['verification_stage']='final'
        final['receipt']['kernels']['nanoda']=dict(status='rejected',reason='nanoda_type_equality_rejection')
        final['receipt']['theorems']['Race.bound']['nanoda_kernel']='rejected'
        self.assertEqual(self.check(env=final)[0]['decision'],'blocked')
        final['receipt']['kernels']['nanoda']['status']='passed'
        final['receipt']['theorems']['Race.bound']['nanoda_kernel']='passed'
        with self.assertRaises(d.Rejected):self.check(env=final)

    def test_only_merged_and_non_test(self):
        for change in [dict(state='open',merged=False),dict(merged=False),dict(merge_commit_sha='e'*40),dict(labels=[{'name':'test'}])]:
            with self.subTest(change=change),self.assertRaises(d.Rejected):self.check(pr={**self.pr,**change})
        for change in [dict(test_only=True),dict(importable=False),dict(disposition='keep_open'),dict(publisher_run_attempt='1')]:
            with self.subTest(change=change),self.assertRaises(d.Rejected):self.check(env={**self.env,**change})
        env=copy.deepcopy(self.env);env['request']['test_only']=True
        with self.assertRaises(d.Rejected):self.check(env=env)

    def test_source_manifest_identity_and_artifacts(self):
        for field in ['head_sha','source_subdir','manifest_sha256','changed_files_sha256','submission_sha256']:
            layout={**self.layout,field:'changed'}
            with self.subTest(field=field),self.assertRaises(d.Rejected):self.check(layout=layout)
        for change in [dict(digest='sha256:'+'0'*64),dict(name='pr-submission-123-2-publisher-456-1'),dict(workflow_run=dict(id=999,head_sha='a'*40))]:
            with self.assertRaises(d.Rejected):self.check(mutate_artifact=change)
        with self.assertRaises(d.Rejected):self.check(mutate_proof={'name':'pr-input-123-2-3'})
        with self.assertRaises(d.Rejected):self.check(run={**self.run,'event':'pull_request'})
        with self.assertRaises(d.Rejected):self.check(publisher={**self.publisher,'workflow_id':42})
        with self.assertRaises(d.Rejected):self.check(run={**self.run,'head_sha':'c'*40})

    def test_kernel_policy(self):
        for status,reason,decision in [('incomplete','out_of_memory','lean-verified'),('rejected','type_error','blocked'),('pending_review','ambiguous','pending')]:
            env=copy.deepcopy(self.env);r=env['receipt'];r['kernels']['nanoda']=dict(status=status,reason=reason)
            r['theorems']['Race.bound']['nanoda_kernel']=status
            self.assertEqual(self.check(env=env)[0]['decision'],decision)

    def test_committed_smoke_fixture_is_excluded(self):
        path=Path(__file__).with_name('direct-fixtures')/'pr-envelope.json'
        self.assertTrue(d.is_test_submission({},json.loads(path.read_text())))

class LayoutTests(unittest.TestCase):
    def test_manifest_and_modes(self):
        import base64
        manifest=b'{"problem":"3sum","bound":"1999/1000"}'
        folder='submissions/3sum/alice-proof';msha=p.blob_hash(manifest)
        entries=[dict(path='manifest.json',type='blob',mode='100644',sha=msha,size=len(manifest)),dict(path='Submission.lean',type='blob',mode='100644',sha='b'*40,size=12)]
        class API:
            def pages(self,path):return [dict(filename=folder+'/'+e['path'],status='added',sha=e['sha']) for e in entries]
            def json(self,path,params=None):
                if '/git/trees/' in path:return {'tree':entries,'truncated':False}
                return {'encoding':'base64','content':base64.b64encode(manifest).decode()}
        pr=dict(number=3,user={'login':'alice'},base={'sha':'a'*40,'ref':'main','repo':{'full_name':d.REPOSITORY}},head={'sha':'c'*40},changed_files=2)
        with patch.object(p,'tree_path',side_effect=lambda api,sha,path: None if sha=='a'*40 else {'type':'tree','sha':'f'*40}):
            self.assertEqual(p.inspect_pr(API(),pr)['submission']['bound'],'1999/1000')
            entries[1]['mode']='120000'
            with self.assertRaises(d.Rejected):p.inspect_pr(API(),pr)
            entries[1]['mode']='100644';manifest=b'{"problem":"3sum","bound":"3998/2000"}'
            entries[0]['sha']=p.blob_hash(manifest);entries[0]['size']=len(manifest)
            with self.assertRaises(d.Rejected):p.inspect_pr(API(),pr)
