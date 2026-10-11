"""Offline replay of real 2026-10-11 smoke artifacts. Never writes board data."""
import copy
import io
import json
from pathlib import Path
import unittest
import zipfile
import direct_import as gate

FIXTURES=Path(__file__).with_name('direct-fixtures')


def archive(files):
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as zipped:
        for name,raw in files.items():zipped.writestr(name,raw)
    return out.getvalue()


class LiveIssueReceiptTests(unittest.TestCase):
    def setUp(self):
        self.api=json.loads((FIXTURES/'live-issue-smoke-api.json').read_text())
        self.run=self.api['run'];self.issue=self.api['issue']
        self.result=(FIXTURES/'live-issue-smoke-result.zip').read_bytes()
        self.proof=(FIXTURES/'live-issue-smoke-proof.zip').read_bytes()
        self.result_meta=next(a for a in self.api['artifacts'] if a['name'].startswith('direct-submission-'))
        self.proof_meta=next(a for a in self.api['artifacts'] if a['name'].startswith('verifier-receipt-'))
        with zipfile.ZipFile(io.BytesIO(self.proof)) as zipped:self.files={n:zipped.read(n) for n in zipped.namelist()}
        with zipfile.ZipFile(io.BytesIO(self.result)) as zipped:self.env=json.loads(zipped.read('direct-submission.json'))
        policy=json.loads((FIXTURES.parent/'direct-trust.json').read_text())
        self.assertIn(self.run['head_sha'],policy['previous_controller_blobs'])
        policy['statements']={p['challenge_file']:(FIXTURES/Path(p['challenge_file']).name).read_bytes() for p in policy['profiles'].values()}
        self.trust={self.run['head_sha']:policy}

    def check(self,issue=None):
        return gate.validate_result(self.result,issue or self.issue,self.run,self.result_meta,self.trust,
                                    receipt_archive=self.proof,receipt_artifact=self.proof_meta)

    def test_real_artifact_digests_raw_receipt_and_smoke_exclusion(self):
        self.assertEqual(self.result_meta['digest'],'sha256:'+gate.sha(self.result))
        self.assertEqual(self.proof_meta['digest'],'sha256:'+gate.sha(self.proof))
        self.assertEqual(gate.sha(self.files['receipt.json']),'3d72d695f8f4e670a69bfa220755c04c57ec04feef7d1d2437390fb4a8bc7674')
        receipt=gate.checked_receipt(self.proof,self.proof_meta,self.env,self.run,self.run['head_sha'])
        self.assertEqual(receipt,self.env['receipt'])
        self.assertEqual(gate.validate_proof(self.env['submission'],receipt,self.trust[self.run['head_sha']],self.run['head_sha'],self.run['html_url'])[0],'lean-verified')
        with self.assertRaisesRegex(gate.Rejected,'Test-labeled'):self.check()
        with self.assertRaisesRegex(gate.Rejected,'Test submission'):self.check(dict(self.issue,labels=[]))

    def test_counterfactual_non_test_same_proof_admits(self):
        original=copy.deepcopy(self.env['receipt'])
        self.env.update(test_only=False,importable=True,status='passed')
        self.env['receipt']['test_only']=False
        # Only the test flag changes in the receipt. Kernels, axioms, targets,
        # request, log hashes, timestamps and source pin remain byte-equivalent.
        restored=copy.deepcopy(self.env['receipt']);restored['test_only']=True
        self.assertEqual(restored,original)
        self.files['receipt.json']=json.dumps(self.env['receipt']).encode()
        self.proof=archive(self.files)
        self.proof_meta['digest']='sha256:'+gate.sha(self.proof)
        self.env['receipt_artifact']['digest']=self.proof_meta['digest']
        self.env['receipt_sha256']=gate.sha(self.files['receipt.json'])
        self.result=archive({'direct-submission.json':json.dumps(self.env).encode()})
        self.result_meta['digest']='sha256:'+gate.sha(self.result)
        self.assertEqual(self.check(dict(self.issue,labels=[]))['decision'],'lean-verified')
        # This tests receipt admission only; discovery permanently excludes #1/#2.
        from direct_refresh import SMOKE_NUMBERS
        self.assertIn(self.issue['number'],SMOKE_NUMBERS)


class LivePRReceiptTests(unittest.TestCase):
    def setUp(self):
        from direct_pr import archive_members
        self.api=json.loads((FIXTURES/'live-pr-smoke-api.json').read_text())
        self.proof=(FIXTURES/'live-pr-smoke-proof.zip').read_bytes()
        self.result=(FIXTURES/'live-pr-smoke-result.zip').read_bytes()
        self.files=archive_members(self.proof,self.api['proof_artifact'])
        self.env=json.loads(archive_members(self.result,self.api['result_artifact'])['pr-submission-2-lean.json'])
        policy=json.loads((FIXTURES.parent/'direct-trust.json').read_text())
        policy['statements']={p['challenge_file']:(FIXTURES/Path(p['challenge_file']).name).read_bytes() for p in policy['profiles'].values()}
        self.assertIn(self.api['run']['head_sha'],[policy['reviewed_commit'],*policy['previous_controller_blobs']])
        self.trust={self.api['run']['head_sha']:policy,self.api['publisher']['head_sha']:policy}

    def check(self,pr=None):
        from direct_pr import validate_pr_result
        a=self.api
        return validate_pr_result(self.result,a['result_artifact'],'pr-submission-2-lean.json',pr or a['pr'],a['run'],a['publisher'],self.proof,a['proof_artifact'],self.trust,a['layout'])

    def test_real_early_merged_smoke_is_excluded_and_all_proof_hashes_match(self):
        self.assertEqual(gate.sha(self.files['receipt.json']),'c8c7e35cc529e8bfa1c602f7311a219e94793cce88c51f6cff831363070bec8c')
        receipt=json.loads(self.files['receipt.json']);self.assertEqual(receipt,self.env['receipt'])
        self.assertEqual(json.loads(self.files['pr-request.json']),self.env['request'])
        for name,digest in receipt['artifact_sha256'].items():self.assertEqual(gate.sha(self.files[name]),digest)
        self.assertTrue(self.api['pr']['merged'])
        self.assertEqual(self.api['pr']['merge_commit_sha'],'79878b79d2eec01cbdc40417547cd2d99d6aba04')
        for pr in [self.api['pr'],dict(self.api['pr'],labels=[])]:
            with self.assertRaisesRegex(gate.Rejected,'Test PR receipt'):self.check(pr)

    def test_non_test_same_early_proof_admits_after_api_confirmed_merge(self):
        original=copy.deepcopy(self.env['receipt'])
        def clear_flags(value):
            if isinstance(value,dict):
                for key,item in value.items():
                    if key=='test_only':value[key]=False
                    else:clear_flags(item)
            elif isinstance(value,list):
                for item in value:clear_flags(item)
        clear_flags(self.env);self.env['importable']=True
        self.files['pr-request.json']=json.dumps(self.env['request']).encode()
        self.env['receipt']['artifact_sha256']['pr-request.json']=gate.sha(self.files['pr-request.json'])
        # Restore only test metadata and its derived request-file hash to show
        # every kernel result, target, source pin and actual log hash is unchanged.
        restored=copy.deepcopy(self.env['receipt']);restored['test_only']=original['test_only']
        restored['artifact_sha256']['pr-request.json']=original['artifact_sha256']['pr-request.json']
        self.assertEqual(restored,original)
        self.files['receipt.json']=json.dumps(self.env['receipt']).encode()
        self.proof=archive(self.files);self.api['proof_artifact']['digest']='sha256:'+gate.sha(self.proof)
        self.env['receipt_artifact']['digest']=self.api['proof_artifact']['digest']
        self.env['receipt_sha256']=gate.sha(self.files['receipt.json'])
        self.result=archive({'pr-submission-2-lean.json':json.dumps(self.env).encode()})
        self.api['result_artifact']['digest']='sha256:'+gate.sha(self.result)
        result=self.check(dict(self.api['pr'],labels=[]))[0]
        self.assertEqual(result['decision'],'lean-verified')
        self.assertIn('nanoda advisory check pending',result['reason'])
        with self.assertRaisesRegex(gate.Rejected,'API-confirmed merged'):self.check(dict(self.api['pr'],labels=[],merged=False))
        from direct_refresh import SMOKE_NUMBERS
        self.assertIn(self.api['pr']['number'],SMOKE_NUMBERS)
