"""Offline identity, statement and policy tests; no live registry changes."""
from datetime import datetime, timezone
import copy
import io
import json
from pathlib import Path
import unittest
import zipfile
from fractions import Fraction
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

    def check(self, *, env=None, run=None, issue=None, meta_change=None, extra_file=False, receipt_meta_change=None, raw_receipt_tamper=False, log_files=None, publisher=None, jobs=None, raw_receipt=None):
        env=copy.deepcopy(self.env if env is None else env)
        raw=json.dumps(env['receipt'] if raw_receipt is None else raw_receipt).encode()
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
        return gate.validate_result(archive, self.issue if issue is None else issue,self.run if run is None else run,meta,self.trust,receipt_archive=receipt_archive,receipt_artifact=receipt_meta,publisher=publisher,jobs=jobs)

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

    def test_catalan_target_and_reviewed_statement(self):
        # Opened 2026-10-27 after the split-build smoke (verifier run 40497685416, issue #68): its receipt's
        # generated challenge for bound 1091 has sha256 665c79be..., and its profile carries runner github-split.
        trust=json.loads((Path(__file__).with_name('direct-trust.json')).read_text())
        profile=trust['profiles']['catalan']
        raw=(FIXTURES/'Statement.lean').read_bytes()
        self.assertEqual(gate.sha(raw),profile['challenge_sha256'])
        self.assertEqual((profile['runner'],profile['maximum'],profile['lean_toolchain']),('github-split','100000000','leanprover/lean4:v4.34.1'))
        sub=gate.normalize(dict(schema_version=1,problem='catalan',bound='1091',repo_url='https://github.com/u/p',commit='a'*40,authors=[]))
        generated=gate.challenge_bytes(sub,raw)
        self.assertTrue(generated.endswith('theorem Race.bound : BigOSpeedrun.Catalan.Bound ((1091 : ℚ) / 1) := by\n  sorry\n'.encode()))
        self.assertEqual(gate.sha(generated),'665c79be55f9940f1410fe849439e9dc260418ff9b160909c0f756eff1dc02a6')
        self.assertEqual(gate.PROBLEMS['catalan'],('other/catalan',100000000))
        with self.assertRaises(gate.Rejected):
            gate.normalize(dict(sub,bound='100000001'))

    def test_subset_sum_target_and_reviewed_statement(self):
        # Opened 2026-11-01 after its smoke (verifier run 41353572059, issue #98, darkhipo's 3/4 proof). The smoke
        # receipt's generated challenge for bound 3/4 has sha256 9b6ba189...: a reviewed test vector only (the smoke is
        # test_only). The range is 0 to 1, as in the profile: a bound above the classical 1/2 is in range (Nil ruling
        # 2026-11-02, verifier #94: the best Lean Verified bound is listed as a stepping stone).
        trust=json.loads((FIXTURES.parent/'direct-trust.json').read_text())
        profile=trust['profiles']['subset-sum']
        raw=(FIXTURES/gate.statement_fixture(trust,profile['challenge_file'])).read_bytes()
        self.assertEqual(gate.sha(raw),profile['challenge_sha256'])
        self.assertEqual((profile['challenge_file'],profile['maximum'],profile['lean_toolchain'],profile['manifest_file']),
                         ('challenges/subset-sum/Statement.lean','1','leanprover/lean4:v4.34.1','profiles/lake-manifest.json'))
        self.assertNotIn('runner',profile)
        generated=gate.challenge_bytes(dict(problem='subset-sum',bound='3/4'),raw)
        self.assertTrue(generated.endswith(b'theorem Race.bound : BigOSpeedrun.SubsetSum.SolvedInTime ((3 : Rat) / 4) := by\n  sorry\n'))
        self.assertEqual(gate.sha(generated),'9b6ba1899bc6cc4389edde0ff7c845b4a27e349ee4fafe93df480c09241da08b')
        sub=dict(schema_version=1,problem='subset-sum',bound='3/4',repo_url='https://github.com/u/p',commit='a'*40,authors=[])
        for bound in ['101/100','2']:
            with self.subTest(bound=bound),self.assertRaises(gate.Rejected):gate.normalize(dict(sub,bound=bound))
        for bound in ['1','3/4','51/100','1/2','49/100','0']:
            with self.subTest(bound=bound):self.assertEqual(gate.normalize(dict(sub,bound=bound))['bound'],bound)

    def test_snaky_target_and_reviewed_statement(self):
        # Opened after verifier #106's runs (2026-11-02). The control and mutation receipts give the generated challenge
        # for bound 20 (sha256 c31e994e..., runs 41543423936 and 41544953483) and for bound 19 (7b167320..., run
        # 41544268863): reviewed test vectors only (those runs are test_only). Bounds are whole Maker moves, 0 to 100.
        trust=json.loads((FIXTURES.parent/'direct-trust.json').read_text())
        profile=trust['profiles']['snaky']
        raw=(FIXTURES/gate.statement_fixture(trust,profile['challenge_file'])).read_bytes()
        self.assertEqual(gate.sha(raw),profile['challenge_sha256'])
        self.assertEqual((profile['challenge_file'],profile['maximum'],profile['lean_toolchain'],profile['bound_kind']),
                         ('challenges/other-snaky/VerifierStatement.lean','100','leanprover/lean4:v4.34.1','moves'))
        self.assertNotIn('runner',profile)
        self.assertEqual(gate.PROBLEMS['snaky'],('other/snaky',100))
        sub=dict(schema_version=1,problem='snaky',bound='20',repo_url='https://github.com/u/p',commit='a'*40,authors=[])
        generated=gate.challenge_bytes(gate.normalize(sub),raw)
        self.assertTrue(generated.endswith(b'theorem Race.bound : BigOSpeedrun.Snaky.Bound 20 := by\n  sorry\n'))
        self.assertEqual(gate.sha(generated),'c31e994e3757aa2e46eba45a945c54de234c55f4e175eecb3f9249317fa063ad')
        self.assertEqual(gate.sha(gate.challenge_bytes(gate.normalize(dict(sub,bound='19')),raw)),
                         '7b1673206843ef06f0f9ee90e9348b2cc9d90ca01ed935af11f967671123af78')
        for bound in ['0','19','21','100']:
            with self.subTest(bound=bound):self.assertEqual(gate.normalize(dict(sub,bound=bound))['bound'],bound)
        # A fraction is refused, and so is a bound above the range. (An unreduced 40/2 is refused by parse_body.)
        for bound in ['19/2','101']:
            with self.subTest(bound=bound),self.assertRaises(gate.Rejected):gate.normalize(dict(sub,bound=bound))
        with self.assertRaises(gate.Rejected):gate.challenge_bytes(dict(problem='snaky',bound='39/2'),raw)

    def test_prime_gaps_target_and_reviewed_statement(self):
        # Verifier #148: H_1 <= B, B a whole number from 0 to 100000. The receipts of the maintainer test runs give the
        # generated challenges: 246 2f817e68 (the control, run 42292994745 at 18158dd, and the passing smoke, run
        # 42305726764 at 2d44726) and 245 0a9ab7e7 (M1, run 42295113989). Reviewed test vectors only: those runs are test_only.
        trust=json.loads((FIXTURES.parent/'direct-trust.json').read_text())
        profile=trust['profiles']['prime-gaps']
        raw=(FIXTURES/gate.statement_fixture(trust,profile['challenge_file'])).read_bytes()
        self.assertEqual(gate.sha(raw),profile['challenge_sha256'])
        self.assertEqual((profile['challenge_file'],profile['maximum'],profile['lean_toolchain'],profile['bound_kind'],profile['runner']),
                         ('challenges/prime-gaps/Statement.lean','100000','leanprover/lean4:v4.33.1','gap','github-split'))
        self.assertEqual(gate.statement_fixture(trust,profile['challenge_file']),'PrimeGapsStatement.lean')
        self.assertEqual(gate.PROBLEMS['prime-gaps'],('other/prime-gaps',100000))
        sub=dict(schema_version=1,problem='prime-gaps',bound='246',repo_url='https://github.com/u/p',commit='a'*40,authors=[])
        generated=gate.challenge_bytes(gate.normalize(sub),raw)
        self.assertTrue(generated.endswith(b'theorem Race.bound : BigOSpeedrun.PrimeGaps.Bound 246 := by\n  sorry\n'))
        self.assertEqual(gate.sha(generated),'2f817e68bf0098199493c98c9c7d0e861370b3874b2e96a3aabf45e35d569999')
        self.assertEqual(gate.sha(gate.challenge_bytes(gate.normalize(dict(sub,bound='245')),raw)),
                         '0a9ab7e7552be64798f19ba71685f6079229124dcc21bfa551669aad26013fb1')
        for bound in ['0','2','186','246','100000']:
            with self.subTest(bound=bound):self.assertEqual(gate.normalize(dict(sub,bound=bound))['bound'],bound)
        # A fraction is refused, and so is a bound above the range (as the verifier's WHOLE problems).
        for bound in ['491/2','100001']:
            with self.subTest(bound=bound),self.assertRaises(gate.Rejected):gate.normalize(dict(sub,bound=bound))
        with self.assertRaises(gate.Rejected):gate.challenge_bytes(dict(problem='prime-gaps',bound='491/2'),raw)
        self.assertEqual((gate.range_end('prime-gaps'),gate.open_rank('prime-gaps')),(100000,1))

    def test_heilbronn_target_and_reviewed_statement(self):
        # Verifier #105: the saving eta, 0 < eta <= 5/6, and a higher saving is better (HIGHER, as in the verifier).
        # The receipts of the test runs on verifier e5890d5 give the generated challenges: 1/50893237 cc485a03
        # (control, run 41567042077), 1/50893238 c93fc030 (M1, run 41567693486) and 0 e6ed8e63 (the maintainer smoke,
        # run 41571110767; the form refuses 0). Reviewed test vectors only: those runs are test_only.
        trust=json.loads((FIXTURES.parent/'direct-trust.json').read_text())
        profile=trust['profiles']['heilbronn-triangle']
        raw=(FIXTURES/gate.statement_fixture(trust,profile['challenge_file'])).read_bytes()
        self.assertEqual(gate.sha(raw),profile['challenge_sha256'])
        self.assertEqual((profile['challenge_file'],profile['maximum'],profile['lean_toolchain'],profile['bound_kind']),
                         ('challenges/heilbronn-triangle/VerifierStatement.lean','5/6','leanprover/lean4:v4.34.1','saving'))
        self.assertNotIn('runner',profile)
        self.assertEqual(gate.PROBLEMS['heilbronn-triangle'],('other/heilbronn-triangle',Fraction(5,6)))
        self.assertEqual(Fraction(gate.PROBLEMS['heilbronn-triangle'][1]),Fraction(profile['maximum']))
        sub=dict(schema_version=1,problem='heilbronn-triangle',bound='1/50893237',repo_url='https://github.com/u/p',commit='a'*40,authors=[])
        generated=gate.challenge_bytes(gate.normalize(sub),raw)
        self.assertTrue(generated.endswith(b'theorem Race.bound : BigOSpeedrun.HeilbronnTriangle.Bound ((1 : \xe2\x84\x9a) / 50893237) := by\n  sorry\n'))
        self.assertEqual(gate.sha(generated),'cc485a03f569e325754c5137d4aa96b6ec0e19d78e453c1d5ac56318a74ddf8a')
        self.assertEqual(gate.sha(gate.challenge_bytes(gate.normalize(dict(sub,bound='1/50893238')),raw)),
                         'c93fc030847a89b14476ad86c865d89d8365ce2d9a0b46be72ec0deeac6e1cbc')
        self.assertEqual(gate.sha(gate.challenge_bytes(dict(problem='heilbronn-triangle',bound='0'),raw)),
                         'e6ed8e63ebdb6b6605140015220786df2ff428a049b9d61a335248356f0520ee')
        for bound in ['1/50893237','2/100866719','1/2','5/6']:
            with self.subTest(bound=bound):self.assertEqual(gate.normalize(dict(sub,bound=bound))['bound'],bound)
        # Up to 300 digits per integer on Heilbronn (the comparator exponent 1/(100000 K) has 237), 40 elsewhere.
        from math import comb
        q=100000*(comb(comb(163,41),3)**2+1);self.assertEqual(len(str(q)),237)
        self.assertEqual(gate.normalize(dict(sub,bound=f'1/{q}'))['bound'],f'1/{q}')
        self.assertTrue(gate.challenge_bytes(gate.normalize(dict(sub,bound=f'1/{q}')),raw).endswith(f'Bound ((1 : ℚ) / {q}) := by\n  sorry\n'.encode()))
        self.assertEqual(gate.normalize(dict(sub,bound='1/'+'9'*300))['bound'],'1/'+'9'*300)
        with self.assertRaises(gate.Rejected):gate.normalize(dict(sub,bound='1/1'+'0'*300))
        other=dict(sub,problem='catalan')
        self.assertEqual(gate.normalize(dict(other,bound='1/'+'9'*40))['bound'],'1/'+'9'*40)
        with self.assertRaises(gate.Rejected):gate.normalize(dict(other,bound='1/1'+'0'*40))
        # 0 is the classical bound (a form error; only the maintainer smoke runs it), and 1 is above the range.
        for bound in ['0','1','6/7']:
            with self.subTest(bound=bound),self.assertRaises(gate.Rejected):gate.normalize(dict(sub,bound=bound))
        # A higher saving is better: the weakest bound of the range is 0, an open endpoint sorts below, max wins.
        self.assertEqual((gate.range_end('heilbronn-triangle'),gate.open_rank('heilbronn-triangle')),(0,-1))
        self.assertEqual((gate.range_end('snaky'),gate.open_rank('snaky')),(100,1))
        gate_row=dict(schema_version=1,problem_id='other/heilbronn-triangle',score='1/50893237',score_relation='attained',any_lean_verified_at_bound=True)
        self.assertTrue(gate.qualifies_for_run(dict(sub,bound='1/50893236'),gate_row))
        self.assertFalse(gate.qualifies_for_run(dict(sub,bound='1/50893237'),gate_row))
        self.assertFalse(gate.qualifies_for_run(dict(sub,bound='1/50893238'),gate_row))

    def test_each_board_range_is_its_profile_range(self):
        # The site lists every bound the verifier can run (Nil ruling 2026-11-02): the import range and the board's
        # score range end at the profile maximum.
        trust=json.loads((FIXTURES.parent/'direct-trust.json').read_text())
        for key,slug in {'dft':'exact-dft','3sum':'3sum','apsp':'apsp','subset-sum':'subset-sum'}.items():
            with self.subTest(board=slug):
                score=json.loads((FIXTURES.parent/(slug+'.json')).read_text())['score']
                self.assertEqual(Fraction(gate.PROBLEMS[key][1]),Fraction(trust['profiles'][key]['maximum']))
                self.assertEqual(Fraction(score['maximum']),Fraction(trust['profiles'][key]['maximum']))
                self.assertEqual(score['minimum'],'0')

    def test_each_profile_reads_its_own_reviewed_statement(self):
        # Catalan and Subset Sum both name their statement Statement.lean: statement_fixtures keeps the copies apart.
        trust=json.loads((FIXTURES.parent/'direct-trust.json').read_text())
        names={key:gate.statement_fixture(trust,p['challenge_file']) for key,p in trust['profiles'].items()}
        self.assertEqual((names['catalan'],names['subset-sum'],names['snaky'],names['heilbronn-triangle']),
                         ('Statement.lean','SubsetSumStatement.lean','SnakyVerifierStatement.lean','HeilbronnVerifierStatement.lean'))
        for key,profile in trust['profiles'].items():
            with self.subTest(profile=key):
                self.assertEqual(gate.sha((FIXTURES/names[key]).read_bytes()),profile['challenge_sha256'])

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

    def jobs(self, own=('completed','success'), other=('in_progress',None), split=False):
        """The jobs of run 123 attempt 2, as in run 41393097953 (#94 finished, #99 still running): issue 7 and issue 8."""
        def job(number,name,status,conclusion):
            entry=f'check ({number}, submitter, issue{", true" if split and number==7 else ""}) / {name}'
            return dict(id=len(name)+number,name=entry,status=status,conclusion=conclusion,run_id=123,run_attempt=2,head_sha=self.revision)
        jobs=[dict(id=1,name='select',status='completed',conclusion='success',run_id=123,run_attempt=2,head_sha=self.revision)]
        for number,(status,conclusion) in [(7,own),(8,other)]:
            jobs+=[job(number,'build','completed','success' if split and number==7 else 'skipped'),job(number,'pr_verify','completed','skipped'),
                   job(number,'verify',status,conclusion)]
            if status=='completed':jobs.append(job(number,'report','completed',conclusion))
        return jobs

    def test_a_final_result_is_admitted_when_its_own_jobs_finished(self):
        # Lead, 2026-11-02: run 41393097953 checked #94 and #99; #94 was finished, #99 runs for up to 350 min.
        running=dict(self.run,status='in_progress',conclusion=None)
        # (a) Another issue's job still runs: admitted.
        self.assertEqual(self.check(run=running,jobs=self.jobs())['decision'],'lean-verified')
        self.assertEqual(self.check(run=running,jobs=self.jobs(split=True))['decision'],'lean-verified')
        self.assertEqual(self.check(run=running,jobs=self.jobs(other=('completed','failure')))['decision'],'lean-verified')
        # Without the jobs, an unfinished run stays unadmitted, as before.
        with self.assertRaises(gate.Rejected):self.check(run=running)
        # (b) Its own job still runs, or (c) failed or was cancelled: rejected (read again when the run completes).
        for own in [('in_progress',None),('queued',None),('completed','failure'),('completed','cancelled'),('completed','skipped'),('completed','timed_out')]:
            with self.subTest(own=own),self.assertRaises(gate.Rejected):
                self.check(run=running,jobs=self.jobs(own=own))
        for name in ['build','pr_verify']:
            jobs=[dict(j,conclusion='failure') if j['name'].startswith('check (7') and j['name'].endswith('/ '+name) else j for j in self.jobs()]
            with self.subTest(failed=name),self.assertRaises(gate.Rejected):self.check(run=running,jobs=jobs)
        # No job of its own (the jobs of another run, attempt or revision), or a duplicate job: rejected.
        for change in [{'run_id':124},{'run_attempt':1},{'head_sha':'b'*40}]:
            jobs=[dict(j,**change) if j['name'].startswith('check (7') else j for j in self.jobs()]
            with self.subTest(change=change),self.assertRaises(gate.Rejected):self.check(run=running,jobs=jobs)
        for jobs in [[j for j in self.jobs() if not j['name'].startswith('check (7')],[],self.jobs()+[j for j in self.jobs() if j['name']=='check (7, submitter, issue) / report']]:
            with self.subTest(jobs=len(jobs)),self.assertRaises(gate.Rejected):self.check(run=running,jobs=jobs)
        # A pull request with the same number is not this issue.
        jobs=[dict(j,name=j['name'].replace(', issue)',', pull_request)')) if j['name'].startswith('check (7') else j for j in self.jobs()]
        with self.assertRaises(gate.Rejected):self.check(run=running,jobs=jobs)
        # (d) Every run trust check still applies: an untrusted workflow, repository, revision, branch or event rejects.
        for change in [{'path':'untrusted.yml'},{'workflow_id':43},{'head_repository':{'full_name':'attacker/verifier'}},
                       {'head_branch':'other'},{'event':'pull_request_target'},{'referenced_workflows':[]},{'status':'queued'}]:
            with self.subTest(change=change),self.assertRaises(gate.Rejected):
                self.check(run={**running,**change},jobs=self.jobs())
        jobs=[dict(j,head_sha='b'*40) for j in self.jobs()]
        with self.assertRaises(gate.Rejected):self.check(run={**running,'head_sha':'b'*40},jobs=jobs)
        # The receipt and issue bindings still apply.
        with self.assertRaises(gate.Rejected):self.check(run=running,jobs=self.jobs(),raw_receipt_tamper=True)
        with self.assertRaises(gate.Rejected):self.check(run=running,jobs=self.jobs(),issue=dict(self.issue,body=self.issue['body'].replace('47171','47172')))

    def test_a_check_that_ran_out_of_time_is_a_timeout_not_a_rejection(self):
        # Lead, 2026-11-02 (verifier #99, run 41393097953): the receipt has status 'timeout', the Lean kernel incomplete
        # with reason 'timeout', the audit not started and nanoda stopped at the total deadline.
        def stopped(**change):
            env=copy.deepcopy(self.env);receipt=env['receipt']
            receipt.update(status='timeout',kernels={'lean':{'status':'incomplete','reason':'timeout','systemd_result':'timeout'},
                                                     'nanoda':{'status':'incomplete','reason':'total_deadline'}},axiom_audit={'status':'not_started'})
            for t in receipt['theorems'].values():t.update(lean_kernel='incomplete',nanoda_kernel='incomplete',reported_axioms=None)
            receipt.update(change);env['status']='not_verified'
            return env
        verdict=self.check(env=stopped())
        self.assertEqual((verdict['decision'],verdict['reason']),('timeout',gate.TIMEOUT_REASON))
        # Either signal alone: the total deadline, or the Lean kernel's own time limit.
        self.assertEqual(self.check(env=stopped(status='not_verified'))['decision'],'timeout')
        only_deadline=stopped();only_deadline['receipt']['kernels']['lean']={'status':'not_completed_or_rejected','reason':'lean_compile_error'}
        self.assertTrue(gate.timed_out(only_deadline['receipt']))
        # A real failure is no timeout: Lean rejected the proof, or it failed to compile, or nanoda rejected it.
        for kernels in [{'lean':{'status':'rejected','reason':'lean_kernel_rejection'}},{'lean':{'status':'not_completed_or_rejected','reason':'lean_compile_error'}},
                        {'lean':{'status':'incomplete','reason':'timeout'},'nanoda':{'status':'rejected'}}]:
            env=stopped(status='not_verified',kernels=kernels)
            with self.subTest(kernels=kernels):
                self.assertFalse(gate.timed_out(env['receipt']))
                with self.assertRaises(gate.Rejected):self.check(env=env)
        # A timeout after Lean passed is decided by the usual rules, never as a timeout.
        self.assertFalse(gate.timed_out(dict(self.env['receipt'],status='timeout')))
        # Every binding still applies: the request, the exact statement, the completion time.
        for change in [{'generated_challenge_sha256':'0'*64},{'checked_at':'2020-01-01T00:00:00Z'},{'theorem_names':['Other']}]:
            with self.subTest(change=change),self.assertRaises(gate.Rejected):self.check(env=stopped(**change))
        # Only the final issue route: maintainer and PR receipts keep the strict policy.
        with self.assertRaises(gate.Rejected):gate.validate_kernel_receipt(stopped()['receipt'],self.env['receipt']['theorem_names'])

    def test_an_axiom_audit_that_ran_out_of_time_after_lean_passed_is_a_timeout(self):
        # Lead, 2026-11-02: our time limit, not a verdict. The verifier records the audit's systemd result, no reason.
        def stopped(audit,**change):
            env=copy.deepcopy(self.env);receipt=env['receipt']
            receipt['axiom_audit']=audit;receipt['kernels']['nanoda']={'status':'not_started'}
            for t in receipt['theorems'].values():t.update(nanoda_kernel='not_started',reported_axioms=None)
            receipt.update({'status':'not_verified',**change});env['status']='not_verified'
            return env
        killed={'status':'not_completed_or_rejected','systemd_result':'timeout','guard_stop':None,'reported_axioms':{}}
        self.assertEqual(self.check(env=stopped(killed))['decision'],'timeout')
        # The total deadline came before the audit started.
        self.assertEqual(self.check(env=stopped({'status':'not_started'},status='timeout'))['decision'],'timeout')
        names=self.env['receipt']['theorem_names']
        for audit in [dict(killed,reported_axioms={names[0]:['sorryAx']}),  # it found a forbidden axiom before the limit
                      dict(killed,systemd_result='oom-kill'),dict(killed,guard_stop='disk space below 1 GiB'),
                      dict(killed,systemd_result='success'),dict(killed,status='invalid_output'),{'status':'not_started'}]:
            env=stopped(audit)
            with self.subTest(audit=audit):
                self.assertFalse(gate.timed_out(env['receipt']))
                with self.assertRaises(gate.Rejected):self.check(env=env)
        # Only the final issue route.
        with self.assertRaises(gate.Rejected):gate.validate_kernel_receipt(stopped(killed)['receipt'],names)

    def test_a_setup_that_failed_before_any_check_is_not_a_rejection(self):
        # Lead, 2026-11-02 (verifier #99 rerun 41494392206): the unit tests failed before prepare. The raw receipt has no
        # provenance; the report adds the run's own (setdefault), and the envelope has no generated challenge hash.
        names=self.env['receipt']['theorem_names']
        def failed(raw,**challenge):
            env=copy.deepcopy(self.env);env.update(status='not_verified',checked_at=raw['checked_at'])
            env['receipt']=dict(raw,run_url=self.run['html_url'],verifier_commit=self.revision)
            env['challenge']=dict(env['challenge'],**{'generated_sha256':raw.get('generated_challenge_sha256'),**challenge})
            return env
        bare={'schema_version':1,'status':'setup_failed','steps':[],'kernels':{'nanoda':{'status':'pending','reason':'advisory_queued'}},'theorems':{},
              'artifact_sha256':{},'finished_unix':1791638746,'checked_at':self.env['receipt']['checked_at'],'total_wall_seconds':0.0,'verification_stage':'final'}
        verdict=self.check(env=failed(bare),raw_receipt=bare)
        self.assertEqual((verdict['decision'],verdict['reason']),('setup',gate.SETUP_REASON))
        # prepare started (its provenance) and stopped at any step: each binding it wrote must match.
        started=dict(bare,run_url=self.run['html_url'],verifier_commit=self.revision,error='clone failed',
                     kernels={'lean':{'status':'not_started'},'nanoda':{'status':'pending'}},axiom_audit={'status':'not_started'})
        source=self.env['receipt']
        cloned=dict(started,request=source['request'],profile=source['profile'],theorem_names=names,theorems={n:{} for n in names})
        staged=dict(cloned,generated_challenge_sha256=source['generated_challenge_sha256'])
        for raw in [started,cloned,staged]:
            with self.subTest(raw=sorted(raw)):self.assertEqual(self.check(env=failed(raw),raw_receipt=raw)['decision'],'setup')
        # Not our failure: a setup error that is the submission's own fault (#89), or a check that started.
        for raw in [dict(bare,error='solution module is missing'),dict(staged,kernels={'lean':{'status':'rejected'}}),
                    dict(staged,kernels={'lean':{'status':'not_completed_or_rejected','reason':'lean_compile_error'}}),
                    dict(staged,axiom_audit={'status':'not_completed_or_rejected','systemd_result':'timeout'}),
                    dict(staged,kernels={'lean':{'status':'not_started'},'nanoda':{'status':'rejected'}})]:
            with self.subTest(raw=raw.get('error') or raw.get('kernels') or raw.get('axiom_audit')):
                self.assertFalse(gate.setup_failed(raw))
                with self.assertRaises(gate.Rejected):self.check(env=failed(raw),raw_receipt=raw)
        # Every binding: the run's own provenance only, no other added key, the request, the statement, the targets.
        other_run=failed(bare);other_run['receipt']['run_url']='https://github.com/bigospeedrun/verifier/actions/runs/1'
        added=failed(bare);added['receipt']['profile']=source['profile']
        wrong_request=dict(cloned,request=dict(source['request'],commit='0'*40))
        wrong_statement=dict(staged,generated_challenge_sha256='0'*64)
        for env,raw in [(other_run,bare),(added,bare),(failed(bare,generated_sha256='0'*64),bare),(failed(staged,generated_sha256=None),staged),
                        (failed(wrong_request),wrong_request),(failed(wrong_statement,generated_sha256=source['generated_challenge_sha256']),wrong_statement),
                        (failed(dict(cloned,theorems={})),dict(cloned,theorems={})),(failed(dict(bare,theorems={'x':{}})),dict(bare,theorems={'x':{}}))]:
            with self.subTest(env=env['receipt']),self.assertRaises(gate.Rejected):self.check(env=env,raw_receipt=raw)
        # Only a setup failure gets the run's provenance: a passed receipt without it is rejected.
        passed=copy.deepcopy(source);del passed['run_url'];del passed['verifier_commit']
        with self.assertRaises(gate.Rejected):self.check(raw_receipt=passed)
        # Only the final issue route: maintainer and PR receipts keep the strict policy.
        with self.assertRaises(gate.Rejected):gate.validate_kernel_receipt(failed(bare)['receipt'],names)

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

    def test_the_profile_runner_is_an_execution_key(self):
        # Lead, 2026-11-02 (verifier #99): 3SUM issues run split, so newer receipts carry "runner"; older ones have none.
        # Only the runner may differ from the reviewed profile, and only as github or github-split.
        for runner in ['github', 'github-split']:
            env=copy.deepcopy(self.env);env['receipt']['profile']['runner']=runner
            with self.subTest(runner=runner):self.assertEqual(self.check(env=env)['decision'],'lean-verified')
        for runner in ['maintainer-desktop', 'github-Split', None, '']:
            env=copy.deepcopy(self.env);env['receipt']['profile']['runner']=runner
            with self.subTest(runner=runner),self.assertRaises(gate.Rejected):self.check(env=env)
        env=copy.deepcopy(self.env);env['receipt']['profile']['runner']='github-split';env['receipt']['profile']['lean_toolchain']='leanprover/lean4:v4.0.0'
        with self.assertRaises(gate.Rejected):self.check(env=env)
        self.assertTrue(gate.same_profile({'a':1,'runner':'github-split'},{'a':1}))
        self.assertTrue(gate.same_profile({'a':1},{'a':1,'runner':'github-split'}))
        self.assertFalse(gate.same_profile({'a':2,'runner':'github'},{'a':1}))
        self.assertFalse(gate.same_profile(None,{'a':1}))

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
        # Blank lines after the last field are allowed, as in the verifier (issue #94: an edited form ended with '\n\n').
        body=self.issue['body'].rstrip('\n')
        for end in ['','\n','\n\n','\n\n\n','\r\n\r\n']:
            with self.subTest(end=end):self.assertEqual(gate.parse_body(body+end),self.env['submission'])
        for end in ['\n\nx','\n \n',' \n','\n\n### Authors\n\nName\n\n']:
            with self.subTest(end=end),self.assertRaises(gate.Rejected):gate.parse_body(body+end)

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
        # Without a Lean Verified row every bound in the range runs (Nil ruling 2026-11-02, verifier 1b1af26): the gate
        # is the end of the range (0 on dft), leader 'profile-range', with or without a classical baseline.
        for records in [[{'id':'classical-baseline','score':'1/2000'},{'id':'d','score':'1/50'}],[{'id':'d','score':'1/50'}]]:
            data=dict(problem_id=gate.PROBLEMS['dft'][0],score={'direction':'higher-is-better'},
                records=records,record_metadata={'classical-baseline':{},'d':{'site_tier':'claimed'}})
            summary=gate.current_record_gate('dft',json.dumps(data).encode(),'c'*40,'2026-10-10T13:00:00Z')
            self.assertEqual((summary['score'],summary['score_relation'],summary['leader_ids'],summary['any_lean_verified_at_bound']),
                             ('0','attained',['profile-range'],False))

    def test_subset_sum_runs_any_bound_in_range_until_a_lean_verified_row(self):
        # As the verifier's test at 1b1af26: no Lean Verified row -> score 1, 'profile-range', and 4877/10000, 3/5, 3/4
        # and 1 qualify; then a Lean Verified 3/4 row gates (3/4 again and 4/5 do not qualify, 7/10 does). The board is the
        # committed snapshot, never the live data/subset-sum.json: the hourly refresh imported #94 (Lean Verified 3/4) on
        # 2026-11-02, and a live read then failed the refresh (run 41411915788).
        data=json.loads((FIXTURES/'board-snapshots.json').read_text())['subset-sum']
        self.assertFalse([r for r in data['records'] if r.get('rerun_status')])
        summary=gate.current_record_gate('subset-sum',json.dumps(data).encode(),'c'*40,'2026-11-02T00:00:00Z')
        self.assertEqual((summary['score'],summary['leader_ids'],summary['any_lean_verified_at_bound']),('1',['profile-range'],False))
        sub=dict(schema_version=1,problem='subset-sum',bound='1',repo_url='https://github.com/u/p',commit='a'*40,authors=[])
        for bound in ['4877/10000','3/5','3/4','1']:
            with self.subTest(bound=bound):self.assertTrue(gate.qualifies_for_run(dict(sub,bound=bound),summary))
        data['records'].append(dict(id='direct-issue-99',score='3/4',rerun_status={'state':'passed','receipt_path':'sources/proof.json'}))
        data['record_metadata']['direct-issue-99']=dict(site_tier='verified')
        summary=gate.current_record_gate('subset-sum',json.dumps(data).encode(),'c'*40,'2026-11-02T00:00:00Z')
        self.assertEqual((summary['score'],summary['leader_ids'],summary['any_lean_verified_at_bound']),('3/4',['direct-issue-99'],True))
        for bound,runs in [('3/4',False),('4/5',False),('7/10',True)]:
            with self.subTest(bound=bound):self.assertEqual(gate.qualifies_for_run(dict(sub,bound=bound),summary),runs)

if __name__=='__main__':unittest.main()
