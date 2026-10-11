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
