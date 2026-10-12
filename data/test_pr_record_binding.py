import copy
import json
from pathlib import Path
import unittest
from direct_import import canonical, sha
from pr_record_binding import apply_bindings, active

ROOT=Path(__file__).resolve().parent

class ReviewedBindingTests(unittest.TestCase):
    def setUp(self):
        self.config=json.loads((ROOT/'direct-trust.json').read_text())
        self.binding=self.config['reviewed_pr_bindings'][0]
        self.binding.update(pr_number=99,package_repo='nmamano/verifier',package_head='a'*40,
            remapping_review=dict(changed_files_sha256='b'*64,review='Reviewed module remapping against pinned upstream.'))
        self.docs={'exact-dft':json.loads((ROOT/'exact-dft.json').read_text())}
        self.row=next(r for r in self.docs['exact-dft']['records'] if r['id']==self.binding['row_id'])
        self.original=copy.deepcopy(self.row)
        self.meta=self.docs['exact-dft']['record_metadata'][self.row['id']]
        self.sub=dict(problem='dft',bound=self.binding['bound'],repo_url='https://github.com/bigospeedrun/verifier',
            commit='a'*40,source_subdir=self.binding['source_subdir'])
        self.proof=dict(decision='lean-verified',reason='Lean and audit passed',checked_at='2026-10-13T00:00:00Z',
            receipt_path='sources/test-receipt.json',receipt_url='https://github.com/bigospeedrun/verifier/actions/runs/123',
            controller_fingerprint=sha(canonical(self.config['controller_blobs']).encode()),
            pr_identity=dict(number=99,head='a'*40,changed_files_sha256='b'*64,controller=self.binding['controller']))
        self.claim=dict(route='pull_request',submission=self.sub,verification=self.proof,
            item=dict(number=99,head=dict(sha='a'*40,repo=dict(full_name='nmamano/verifier'))))
        self.claims={'direct-pr-99':self.claim}

    def apply(self,states=None):return apply_bindings(self.docs,self.claims,states or {},self.config)

    def test_upgrade_preserves_author_and_source_identity(self):
        self.assertEqual(self.apply(),{'direct-pr-99'})
        self.assertEqual(self.row['tier'],'verified')
        for key in self.original:
            if key not in ('tier','rerun_status'):self.assertEqual(self.row[key],self.original[key],key)
        self.assertEqual(self.meta['verification_source_commit'],'a'*40)
        self.assertEqual(self.meta['receipt_url'],self.proof['receipt_url'])

    def test_pending_package_suppressed_without_upgrade(self):
        del self.claim['verification']
        self.assertEqual(self.apply(),{'direct-pr-99'})
        self.assertEqual(self.row['tier'],'claimed')

    def test_inactive_placeholder(self):
        self.binding['pr_number']=None
        self.assertFalse(active(self.binding));self.assertEqual(self.apply(),set())
        self.assertEqual(self.row,self.original)

    def test_each_pin_mismatch_fails_closed(self):
        for key,value in [('pr_number',100),('package_repo','other/repo'),('package_head','c'*40),
                ('source_subdir','submissions/dft/other'),('problem','3sum'),('bound','1/2'),
                ('controller','c'*40),('upstream_repo','other/repo'),('upstream_commit','c'*40),
                ('remapping_review',None),('remapping_review',dict(changed_files_sha256='c'*64,review='review'))]:
            with self.subTest(key=key):
                saved=copy.deepcopy(self.binding);self.binding[key]=value
                self.apply();self.assertEqual(self.row['tier'],'claimed')
                self.binding.clear();self.binding.update(saved)

    def test_unvalidated_or_untrusted_proof_never_upgrades(self):
        for field in ('pr_identity','controller_fingerprint'):
            saved=self.proof.pop(field);self.apply()
            self.assertEqual(self.row['tier'],'claimed');self.proof[field]=saved

    def test_changed_head_missing_claim_and_disabled_binding_demote(self):
        for change in ('head','missing','disabled'):
            with self.subTest(change=change):
                self.setUp();self.apply();self.assertEqual(self.row['tier'],'verified')
                if change=='head':self.claim['item']['head']['sha']='c'*40
                elif change=='missing':self.claims.clear()
                else:self.binding['pr_number']=None
                self.apply();self.assertEqual(self.row['tier'],'claimed')
                self.assertNotIn('rerun_status',self.row);self.assertNotIn('receipt_url',self.meta)

    def test_final_rejection_overrides_late_early_pass(self):
        self.apply()
        blocked=copy.deepcopy(self.proof);blocked.update(decision='blocked',reason='Nanoda rejected')
        state={ 'direct-pr-99:'+sha(canonical(self.sub).encode()):dict(decision='blocked',evidence=blocked) }
        self.apply(state)
        self.assertEqual(self.row['tier'],'claimed');self.assertEqual(self.row['rerun_status']['state'],'failed')
        self.assertEqual(self.row['authors'],self.original['authors'])
        self.apply(state);self.assertEqual(self.row['tier'],'claimed')

    def test_deleted_binding_demotes(self):
        self.apply();self.config['reviewed_pr_bindings']=[];self.apply()
        self.assertEqual(self.row['tier'],'claimed')
        self.assertNotIn('rerun_status',self.row)

    def test_prepare_suppresses_duplicate_and_keeps_cached_receipt(self):
        import direct_refresh
        files=direct_refresh.prepare(ROOT,self.claims,{},'2026-10-13T00:00:00Z',config=self.config)
        doc=json.loads(files['exact-dft.json'])
        ids=[r['id'] for r in doc['records']]
        self.assertNotIn('direct-pr-99',ids)
        row=next(r for r in doc['records'] if r['id']==self.binding['row_id'])
        self.assertEqual(row['tier'],'verified');self.assertEqual(row['authors'],self.original['authors'])
        cache=json.loads(files['direct-submissions.json'])
        self.assertEqual(cache['entries']['direct-pr-99']['verification'],self.proof)

    def test_repeat_is_stable(self):
        self.apply();snapshot=copy.deepcopy(self.docs);self.apply();self.assertEqual(self.docs,snapshot)

if __name__=='__main__':unittest.main()
