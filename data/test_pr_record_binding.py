import copy
import json
from pathlib import Path
import unittest
from direct_import import canonical, sha
from pr_record_binding import apply_bindings, active, active_issue

ROOT=Path(__file__).resolve().parent

class ReviewedBindingTests(unittest.TestCase):
    def setUp(self):
        self.config=json.loads((ROOT/'direct-trust.json').read_text())
        self.binding=self.config['reviewed_pr_bindings'][0]
        self.binding.update(pr_number=99,package_repo='nmamano/verifier',package_head='a'*40,
            remapping_review=dict(changed_files_sha256='b'*64,review='Reviewed module remapping against pinned upstream.'))
        # A fixed Claimed fixture must not inherit the live row's verification
        # state: CI runs this suite after refreshing that row to Verified.
        self.row=dict(id=self.binding['row_id'],tier='claimed',score=self.binding['bound'],
            score_relation='attained',source_commit=self.binding['upstream_commit'],
            authors=[dict(name='Jeremy Kothe',url='https://github.com/jeremykothe2'),
                     dict(name='Ryan Shea',url='https://github.com/shea256')],
            source=dict(kind='repo-artifact',url='https://github.com/'+self.binding['upstream_repo']+
                '/blob/'+self.binding['upstream_commit']+'/README.md'))
        self.meta=dict(site_tier='claimed',comparison_key='exact-dft/uniform-exact-arithmetic/v1')
        self.docs={'exact-dft':dict(records=[self.row],record_metadata={self.row['id']:self.meta})}
        self.original=copy.deepcopy(self.row)
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

class ReviewedIssueBindingTests(unittest.TestCase):
    """reviewed_issue_bindings (task 07840cc3): OpenAI's 3-SAT proof, ported by Big O Speedrun, upgrades OpenAI's row."""
    def setUp(self):
        self.config=json.loads((ROOT/'direct-trust.json').read_text())
        self.binding=self.config['reviewed_issue_bindings'][0]
        board=json.loads((ROOT/'direct-fixtures/board-snapshots.json').read_text())['3sat']
        self.row=next(r for r in board['records'] if r['id']=='openai-eth-2026');self.meta=board['record_metadata']['openai-eth-2026']
        self.docs={'3sat':dict(records=[self.row],record_metadata={'openai-eth-2026':self.meta})}
        self.original=copy.deepcopy(self.row);self.original_meta=copy.deepcopy(self.meta)
        self.sub=dict(schema_version=1,problem='3sat',bound='1/2',repo_url=self.binding['repo_url'],commit=self.binding['commit'],authors=[])
        self.proof=dict(decision='lean-verified',reason='Lean and permitted-axiom audit passed; nanoda incomplete: not_run_chain',
            checked_at='2026-11-16T00:00:00Z',receipt_path='sources/direct-issue-300-1-1.json',
            receipt_url='https://github.com/bigospeedrun/verifier/actions/runs/1',
            controller_fingerprint=sha(canonical(self.config['controller_blobs']).encode()),pr_identity=None)
        self.claim=dict(route='issue',submission=self.sub,verification=self.proof,item=dict(number=300,user=dict(login='nmamano')))
        self.claims={'direct-issue-300':self.claim}

    def apply(self,states=None):return apply_bindings(self.docs,self.claims,states or {},self.config)

    def test_the_live_binding_pins(self):
        self.assertTrue(active_issue(self.binding))
        self.assertEqual({k:self.binding[k] for k in ['row_id','problem','bound','repo_url','commit','source_subdir','submitter','upstream_repo','upstream_commit','ported_by']},
            dict(row_id='openai-eth-2026',problem='3sat',bound='1/2',repo_url='https://github.com/bigospeedrun/verifier-smoke-3sat',
                 commit='42b408ae87763c845773d2d79fd2e42a2a47a88d',source_subdir=None,submitter='nmamano',upstream_repo='openai/math',
                 upstream_commit='7ef5c0cc5ca4b0e072b7a050fca09ab24bc6fa3a',ported_by='Ported by Big O Speedrun'))

    def test_upgrade_keeps_openai_as_the_only_author(self):
        self.assertEqual(self.apply(),{'direct-issue-300'})
        self.assertEqual((self.row['tier'],self.meta['site_tier'],self.row['rerun_status']['state']),('verified','verified','passed'))
        for key in self.original:
            if key not in ('tier','rerun_status'):self.assertEqual(self.row[key],self.original[key],key)
        self.assertEqual(self.row['authors'],[dict(name='openai',url='https://github.com/openai')])
        self.assertEqual((self.meta['refiled_by'],self.meta['receipt_url'],self.meta['verification_source_commit'],self.meta['proof_status']),
            ('Ported by Big O Speedrun',self.proof['receipt_url'],self.binding['commit'],self.proof['reason']))

    def test_a_pending_or_failed_port_is_suppressed_without_upgrade(self):
        del self.claim['verification']
        self.assertEqual(self.apply(),{'direct-issue-300'});self.assertEqual(self.row,self.original);self.assertEqual(self.meta,self.original_meta)
        self.claim['verification']=self.proof;self.apply();self.assertEqual(self.row['tier'],'verified')
        for decision in ['blocked','timeout','chain','setup','pending','held']:
            with self.subTest(decision=decision):
                evidence=dict(self.proof,decision=decision)
                state={'direct-issue-300:'+sha(canonical(self.sub).encode()):dict(decision=decision,evidence=evidence)}
                self.assertEqual(self.apply(state),{'direct-issue-300'})
                self.assertEqual(self.row,self.original);self.assertEqual(self.meta,self.original_meta)

    def test_another_submission_is_not_bound(self):
        for change in [dict(item=dict(number=300,user=dict(login='someone'))),dict(route='pull_request'),
                       dict(submission=dict(self.sub,commit='c'*40)),dict(submission=dict(self.sub,repo_url='https://github.com/u/p')),
                       dict(submission=dict(self.sub,bound='51/100')),dict(submission=dict(self.sub,source_subdir='x')),
                       dict(submission=dict(self.sub,problem='subset-sum'))]:
            with self.subTest(change=change):
                saved=dict(self.claim);self.claim.update(change)
                self.assertEqual(self.apply(),set());self.assertEqual(self.row,self.original)
                self.claim.clear();self.claim.update(saved)

    def test_each_binding_pin_fails_closed(self):
        for key,value in [('upstream_commit','c'*40),('upstream_repo','other/repo'),('bound','51/100'),('row_id','anthropic-eth-2026'),
                          ('ported_by','Big O Speedrun'),('review',' '),('submitter','bad login'),('source_subdir','../x'),('commit','C'*40)]:
            with self.subTest(key=key):
                saved=copy.deepcopy(self.binding);self.binding[key]=value
                self.apply();self.assertEqual(self.row['tier'],'claimed')
                self.binding.clear();self.binding.update(saved)
        saved=copy.deepcopy(self.binding);self.binding['extra']=1;self.assertFalse(active_issue(self.binding));self.binding.pop('extra')

    def test_an_untrusted_or_pr_proof_never_upgrades(self):
        for change in [dict(controller_fingerprint=None),dict(controller_fingerprint='0'*64),dict(pr_identity=dict(number=1))]:
            with self.subTest(change=change):
                self.claim['verification']=dict(self.proof,**change)
                self.assertEqual(self.apply(),{'direct-issue-300'});self.assertEqual(self.row['tier'],'claimed')

    def test_a_removed_binding_restores_the_row(self):
        self.apply();self.assertEqual(self.row['tier'],'verified')
        self.config['reviewed_issue_bindings']=[];self.assertEqual(self.apply(),set())
        self.assertEqual(self.row,self.original);self.assertEqual(self.meta,self.original_meta)

    def test_repeat_is_stable(self):
        self.apply();snapshot=copy.deepcopy(self.docs);self.apply();self.assertEqual(self.docs,snapshot)

    def test_prepare_lists_no_submitter_row(self):
        import direct_refresh
        files=direct_refresh.prepare(ROOT,self.claims,{},'2026-11-16T00:00:00Z',config=self.config)
        doc=json.loads(files['3sat.json'])
        self.assertNotIn('direct-issue-300',[r['id'] for r in doc['records']])
        row=next(r for r in doc['records'] if r['id']=='openai-eth-2026')
        self.assertEqual((row['tier'],row['authors']),('verified',[dict(name='openai',url='https://github.com/openai')]))
        self.assertEqual(doc['record_metadata']['openai-eth-2026']['refiled_by'],'Ported by Big O Speedrun')

if __name__=='__main__':unittest.main()
