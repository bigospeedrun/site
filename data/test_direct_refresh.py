"""Discovery, lifecycle, transactions, and board visibility without network."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import direct_refresh as r
import direct_import as d

ROOT=Path(__file__).resolve().parent

class DiscoveryAPI:
    def __init__(self,issues=None,prs=None):self.issues=issues or [];self.prs=prs or []
    def pages(self,path,params=None,key=None):
        if path.endswith('/issues'):return self.issues
        if path.endswith('/pulls'):return self.prs
        if path.endswith('/actions/artifacts'):return []
        raise AssertionError(path)
    def json(self,path,params=None):
        if '/commits/' in path:return {'sha':path.rsplit('/',1)[1]}
        if '/pulls/' in path:return next(p for p in self.prs if p['number']==int(path.rsplit('/',1)[1]))
        raise AssertionError(path)

class RefreshTests(unittest.TestCase):
    def collector(self,api):
        """An importer with no previous direct-submissions.json, for collect() on a fake listing."""
        temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup)
        root=Path(temp.name);(root/'direct-trust.json').write_bytes((ROOT/'direct-trust.json').read_bytes())
        return r.Importer(api,root)

    def issue(self,number=5,**kwargs):
        body=(ROOT/'direct-fixtures/issue-form-body.txt').read_text()
        return dict(number=number,state='open',title='[Lean submission] DFT',body=body,labels=[],
                    html_url=f'https://github.com/bigospeedrun/verifier/issues/{number}',user={'login':'alice'},
                    created_at='2026-10-10T10:00:00Z',**kwargs)

    def test_controller_trust_ignores_submissions_and_auto_research_only(self):
        blobs=json.loads((ROOT/'direct-trust.json').read_text())['controller_blobs']
        def importer(extra):
            entries=[dict(path=p,type='blob',**v) for p,v in blobs.items()]+[dict(path=p,type='blob',sha='f'*40,mode='100644') for p in extra]
            api=DiscoveryAPI();api.json=lambda path,params=None:dict(tree=entries+[dict(path='auto-research',type='tree',sha='e'*40,mode='040000')])
            return r.Importer(api)
        importer(['auto-research.md','auto-research/notes.md','auto-research/a/b.json','submissions/dft/x/Main.lean']).trusted('a'*40)
        for path in ['scripts/new.py','auto-research.md.py','auto-research-2/x.md','docs/auto-research.md']:
            with self.subTest(path=path),self.assertRaises(d.Rejected):importer([path]).trusted('a'*40)

    def test_claims_skip_tests_and_invalid_bounds(self):
        issue=self.issue();test=self.issue(1);labeled=self.issue(6);labeled['labels']=[{'name':'test'}]
        invalid=self.issue(7);invalid['body']=invalid['body'].replace('1/1000','2/2000')
        flagged=self.issue(8,test_only=True)
        importer=self.collector(DiscoveryAPI([issue,test,labeled,invalid,flagged]))
        claims=importer.collect()
        self.assertEqual(set(claims),{'direct-issue-5'})
        row,meta,_=r.row_for('direct-issue-5',claims['direct-issue-5'],'2026-10-11T00:00:00Z')
        self.assertEqual(row['tier'],'claimed');self.assertEqual(row['authors'],[dict(name='alice',url='https://github.com/alice')])
        self.assertEqual(meta['publication_date_role'],'Submission opened')

    def test_closed_issue_stays_listed_only_with_a_final_verified_result(self):
        # 2026-10-17: closing verifier issues #4/#8/#14 dropped the 3SUM leader.
        sub=d.parse_body(self.issue()['body'])
        def outcome(number,decision):
            importer=r.Importer(DiscoveryAPI())
            key=f'direct-issue-{number}'
            return importer.outcome_id(key,sub),dict(key=key,submission=sub,decision=decision,evidence={})
        previous=dict(final_states=dict([outcome(5,'lean-verified'),outcome(6,'blocked')]))
        closed=lambda number:dict(self.issue(number),state='closed')
        issues=[closed(5),closed(6),closed(7),self.issue(9)]
        api=DiscoveryAPI(issues);seen=[]
        pages=api.pages
        def record(path,params=None,key=None):
            seen.append((path,params));return pages(path,params,key)
        api.pages=record
        importer=r.Importer(api)
        claims=importer.verify(importer.discover(),previous)
        # Verified and closed stays; blocked, never-finished and closed stay off; open stays.
        self.assertEqual(set(claims),{'direct-issue-5','direct-issue-9'})
        self.assertIn((r.PREFIX+'issues',{'state':'all'}),seen)
        self.assertTrue(any('direct-issue-7: closed without a final Lean Verified result' in n for n in importer.notes))
        # A closed issue's row is the same row it had while open.
        open_claim=dict(route='issue',item=self.issue(5),submission=sub)
        self.assertEqual(r.row_for('direct-issue-5',claims['direct-issue-5'],'2026-10-11T00:00:00Z')[:2],
                         r.row_for('direct-issue-5',open_claim,'2026-10-11T00:00:00Z')[:2])
        # An edited body after closing is a new source without a final result.
        edited=closed(5);edited['body']=edited['body'].replace('1/1000','1/1001')
        importer=r.Importer(DiscoveryAPI([edited]))
        self.assertEqual(importer.verify(importer.discover(),previous),{})

    def test_a_listing_without_a_known_submission_keeps_the_previous_bundle(self):
        # 2026-10-22 16:18Z: GitHub listed no verifier issue for one read; the refresh dropped 13 rows,
        # among them the 3SUM leader direct-issue-18, and the receipt page test failed the hourly run.
        pr=dict(number=6,state='closed',merged=False,labels=[],head={'sha':'a'*40},user={'login':'alice'},
                created_at='2026-10-10T12:00:00Z',html_url='https://github.com/bigospeedrun/verifier/pull/6')
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            (root/'direct-trust.json').write_bytes((ROOT/'direct-trust.json').read_bytes())
            entries={'direct-issue-5':dict(route='issue'),'direct-pr-6':dict(route='pull_request')}
            (root/'direct-submissions.json').write_text(json.dumps(dict(schema_version=1,entries=entries,final_states={})))
            for issues in ([],[dict(number=6,pull_request={})]):
                with self.subTest(issues=issues),self.assertRaisesRegex(ValueError,r'1 known submission.*direct-issue-5.*preserve previous data'):
                    r.Importer(DiscoveryAPI(issues,[pr]),root).collect()
            # Listed again (open or closed): the usual reading, no error.
            self.assertEqual(set(r.Importer(DiscoveryAPI([self.issue(5)],[pr]),root).collect()),{'direct-issue-5'})
            self.assertEqual(r.Importer(DiscoveryAPI([dict(self.issue(5),state='closed')],[pr]),root).collect(),{})

    def test_verification_state_marks_pending_failed_and_passed_direct_rows(self):
        # Nil, 2026-10-23: the records feed holds a direct claim's post until its verification ends.
        sub=d.parse_body(self.issue()['body']);claim=dict(route='issue',item=self.issue(),submission=sub)
        outcome=lambda decision:{'direct-issue-5:'+d.sha(d.canonical(sub).encode()):dict(key='direct-issue-5',submission=sub,decision=decision,evidence={})}
        self.assertEqual(r.verification_state('direct-issue-5',claim,{}),'pending')
        for decision in ('blocked','rejected'):
            self.assertEqual(r.verification_state('direct-issue-5',claim,outcome(decision)),'failed')
        self.assertEqual(r.verification_state('direct-issue-5',claim,outcome('lean-verified')),'pending')
        self.assertEqual(r.verification_state('direct-issue-5',claim,outcome('held')),'held')
        labelled=dict(claim,item=dict(self.issue(),labels=[{'name':'verification-needs-review'}]))
        self.assertEqual(r.verification_state('direct-issue-5',labelled,{}),'held')
        self.assertEqual(r.verification_state('direct-issue-5',dict(claim,verification={'receipt_path':'x'}),{}),'passed')
        # An edited submission is a new source: an old failure does not mark it.
        edited=dict(claim,submission=dict(sub,bound='1/1001'))
        self.assertEqual(r.verification_state('direct-issue-5',edited,outcome('blocked')),'pending')
        fixtures=json.loads((ROOT/'direct-fixtures/board-snapshots.json').read_text())
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            for slug in r.SLUGS.values():(root/(slug+'.json')).write_bytes(r.json_bytes(fixtures[slug]))
            (root/'registry.json').write_bytes(r.json_bytes({'checked_at':'2026-10-10','updated_at':'2026-10-10T00:00:00Z'}))
            files=r.prepare(root,{'direct-issue-5':claim},{},'2026-10-11T00:00:00Z',outcome('blocked'))
            meta=json.loads(files['exact-dft.json'])['record_metadata']['direct-issue-5']
            self.assertEqual(meta['verification'],'failed')

    def test_open_pr_claim_and_closed_unmerged_drop(self):
        pr=dict(number=6,state='open',merged=False,labels=[],head={'sha':'a'*40},user={'login':'alice'},created_at='2026-10-10T12:00:00Z',html_url='https://github.com/bigospeedrun/verifier/pull/6')
        sub=dict(d.parse_body(self.issue()['body']),source_subdir='submissions/dft/alice-proof')
        with patch.object(r,'inspect_pr',return_value={'submission':sub}):
            self.assertIn('direct-pr-6',self.collector(DiscoveryAPI(prs=[pr])).collect())
            pr['state']='closed'
            self.assertEqual(self.collector(DiscoveryAPI(prs=[pr])).collect(),{})

    def test_reviewed_credit_note_survives_the_hourly_rebuild(self):
        fixtures=json.loads((ROOT/'direct-fixtures/board-snapshots.json').read_text())
        docs={slug:fixtures[slug] for slug in r.SLUGS.values()}
        claim=dict(route='issue',item=self.issue(),submission=d.parse_body(self.issue()['body']))
        note=dict(predecessor='https://github.com/bigospeedrun/verifier/issues/3',text='Same proof as an earlier submission.')
        row,meta,_=r.row_for('direct-issue-5',claim,'2026-10-11T00:00:00Z',None,note)
        self.assertEqual(row['predecessors'],[note['predecessor']]);self.assertEqual(meta['credit_note'],note['text'])
        plain_row,plain_meta,_=r.row_for('direct-issue-5',claim,'2026-10-11T00:00:00Z')
        self.assertEqual(plain_row['predecessors'],[]);self.assertNotIn('credit_note',plain_meta)
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            for slug,doc in docs.items():(root/(slug+'.json')).write_bytes(r.json_bytes(doc))
            (root/'registry.json').write_bytes(r.json_bytes({'checked_at':'2026-10-10','updated_at':'2026-10-10T00:00:00Z'}))
            (root/'direct-notes.json').write_text(json.dumps({'schema_version':1,'notes':{'direct-issue-5':note}}))
            first=r.prepare(root,{'direct-issue-5':claim},{},'2026-10-11T00:00:00Z')
            for path,raw in first.items():
                dest=root/path;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(raw)
            for hour in ('01','02'):
                again=r.prepare(root,{'direct-issue-5':claim},{},f'2026-10-11T{hour}:00:00Z')
                self.assertNotIn('exact-dft.json',again,'a rebuild with the same claim must not drop or change the note')
            board=json.loads((root/'exact-dft.json').read_text())
            kept=next(x for x in board['records'] if x['id']=='direct-issue-5')
            self.assertEqual(kept['predecessors'],[note['predecessor']])
            self.assertEqual(board['record_metadata']['direct-issue-5']['credit_note'],note['text'])

    def test_withdrawn_submission_has_no_row_on_any_rebuild_and_keeps_its_state(self):
        # 2026-10-23: the submitter of three merged DFT PRs withdrew them. The refresh reads each claim every hour, so a
        # row removed by hand would come back unless the reviewed list in data/direct-notes.json keeps it out.
        fixtures=json.loads((ROOT/'direct-fixtures/board-snapshots.json').read_text())
        docs={slug:fixtures[slug] for slug in r.SLUGS.values()}
        claim=dict(route='issue',item=self.issue(),submission=d.parse_body(self.issue()['body']))
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            for slug,doc in docs.items():(root/(slug+'.json')).write_bytes(r.json_bytes(doc))
            (root/'registry.json').write_bytes(r.json_bytes({'checked_at':'2026-10-10','updated_at':'2026-10-10T00:00:00Z'}))
            def rebuild(hour):
                files=r.prepare(root,{'direct-issue-5':claim},{},f'2026-10-11T{hour}:00:00Z')
                for path,raw in files.items():
                    dest=root/path;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(raw)
                return files
            rows=lambda:[x['id'] for x in json.loads((root/'exact-dft.json').read_text())['records']]
            rebuild('00')
            self.assertIn('direct-issue-5',rows())
            (root/'direct-notes.json').write_text(json.dumps({'schema_version':1,'notes':{},'withdrawn':{'direct-issue-5':'Withdrawn by its submitter.'}}))
            first=rebuild('01')
            self.assertIn('exact-dft.json',first);self.assertNotIn('direct-issue-5',rows())
            self.assertNotIn('direct-issue-5',json.loads((root/'exact-dft.json').read_text())['record_metadata'])
            for hour in ('02','03'):
                self.assertNotIn('exact-dft.json',rebuild(hour),'a later read of the same claim must not bring the row back')
            self.assertNotIn('direct-issue-5',rows())
            # The claim and its verification stay in the saved state, so the importer still knows the submission.
            self.assertIn('direct-issue-5',json.loads((root/'direct-submissions.json').read_text())['entries'])

    def test_closed_issues_removed_and_non_direct_rows_retained(self):
        fixtures=json.loads((ROOT/'direct-fixtures/board-snapshots.json').read_text())
        docs={slug:fixtures[slug] for slug in r.SLUGS.values()}
        claim=dict(route='issue',item=self.issue(),submission=d.parse_body(self.issue()['body']))
        expected={slug:([row for row in doc['records'] if not doc['record_metadata'][row['id']].get('direct_submission')],
                        {key:meta for key,meta in doc['record_metadata'].items() if not meta.get('direct_submission')})
                  for slug,doc in docs.items()}
        # Reproduce a board that already contains a direct submission, even when
        # the checked-in snapshot does not yet contain any. Empty discovery must
        # remove it rather than preserve it as part of the historical baseline.
        row,meta,_=r.row_for('direct-issue-fixture',claim,'2026-10-10T00:00:00Z')
        docs['exact-dft']['records'].append(row)
        docs['exact-dft']['record_metadata'][row['id']]=meta
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            for slug,doc in docs.items():(root/(slug+'.json')).write_bytes(r.json_bytes(doc))
            (root/'registry.json').write_bytes(r.json_bytes({'checked_at':'2026-10-10','updated_at':'2026-10-10T00:00:00Z'}))
            first=r.prepare(root,{'direct-issue-5':claim},{},'2026-10-11T00:00:00Z')
            for path,raw in first.items():
                dest=root/path;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(raw)
            self.assertIn('direct-issue-5',{x['id'] for x in json.loads(first['exact-dft.json'])['records']})
            second=r.prepare(root,{}, {},'2026-10-11T01:00:00Z')
            updated=json.loads(second['exact-dft.json'])
            self.assertEqual(updated['records'],expected['exact-dft'][0])
            self.assertEqual(updated['record_metadata'],expected['exact-dft'][1])

    def test_transaction_failure_keeps_every_original_byte(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'validate.py').write_text('raise SystemExit(1)')
            (root/'3sum.json').write_text('original')
            with self.assertRaises(RuntimeError):r.transaction(root,{'3sum.json':b'changed','sources/new.json':b'{}'})
            self.assertEqual((root/'3sum.json').read_text(),'original')
            self.assertFalse((root/'sources/new.json').exists())

    def test_successful_stage_and_check_only(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'validate.py').write_text('')
            (root/'3sum.json').write_text('original')
            r.transaction(root,{'3sum.json':b'changed'},True)
            self.assertEqual((root/'3sum.json').read_text(),'original')
            r.transaction(root,{'3sum.json':b'changed'})
            self.assertEqual((root/'3sum.json').read_text(),'changed')

    def test_invalid_source_404_skips_but_outage_preserves_snapshot(self):
        from direct_github import GitHubError
        for status in [404,503]:
            api=DiscoveryAPI([self.issue()])
            with patch.object(api,'json',side_effect=GitHubError(status)):
                if status==404:self.assertEqual(self.collector(api).collect(),{})
                else:
                    with self.assertRaises(GitHubError):self.collector(api).collect()

    def test_exact_claim_and_verified_rows_validate_against_real_schemas(self):
        from jsonschema import Draft202012Validator,FormatChecker
        claim=dict(route='issue',item=self.issue(),submission=d.parse_body(self.issue()['body']))
        schema=json.loads((ROOT/'schemas/records-v1.json').read_text())
        row,meta,_=r.row_for('direct-issue-5',claim,'2026-10-11T00:00:00Z')
        Draft202012Validator(schema,format_checker=FormatChecker()).validate([row])
        claim['verification']=dict(reason='Lean passed; permitted-axiom audit passed',checked_at='2026-10-11T00:00:00Z',receipt_path='sources/direct-5.json',receipt_url='https://github.com/bigospeedrun/verifier/actions/runs/123')
        verified,vmeta,_=r.row_for('direct-issue-5',claim,'2026-10-11T00:00:00Z',row)
        Draft202012Validator(schema,format_checker=FormatChecker()).validate([verified])
        self.assertEqual(verified['tier'],vmeta['site_tier'])
        self.assertEqual(verified['tier'],'verified')
        self.assertEqual(verified['rerun_status']['state'],'passed')
        self.assertEqual(vmeta['receipt_url'],claim['verification']['receipt_url'])
        self.assertEqual(row['authors'],verified['authors'])

    def test_evidence_archive_is_repeatable(self):
        importer=r.Importer(DiscoveryAPI())
        verdict=dict(decision='lean-verified',reason='checked',checked_at='2026-10-11T00:00:00Z',receipt_url='https://github.com/bigospeedrun/verifier/actions/runs/1')
        args=('direct-issue-5',{},dict(id=1,run_attempt=1),{}, {},b'result',b'proof',verdict)
        first=importer.evidence(*args);saved=dict(importer.files)
        self.assertEqual(first,importer.evidence(*args))
        self.assertEqual(saved,importer.files)

    def test_final_rejection_survives_expiry_restart_and_late_early_pass(self):
        importer=r.Importer(DiscoveryAPI())
        claim=dict(route='issue',item=self.issue(),submission=d.parse_body(self.issue()['body']))
        key='direct-issue-5';early=dict(decision='lean-verified');blocked=dict(decision='blocked')
        importer.retain_outcome(key,claim,'lean',early,{'marker':'early'})
        self.assertIn('verification',claim)
        importer.retain_outcome(key,claim,'final',blocked,{'marker':'final-rejection'})
        self.assertFalse(claim.get('exclude'));self.assertNotIn('verification',claim)
        # Even an early publisher that uploads late cannot undo final rejection.
        importer.retain_outcome(key,claim,'lean',early,{'marker':'late-early'})
        self.assertFalse(claim.get('exclude'));self.assertNotIn('verification',claim)
        previous=dict(entries={},final_states=copy.deepcopy(importer.final_states))
        fresh=r.Importer(DiscoveryAPI())
        new_claim=dict(route='issue',item=self.issue(),submission=d.parse_body(self.issue()['body']))
        self.assertEqual(set(fresh.verify({key:new_claim},previous)),{key})
        row,meta,_=r.row_for(key,new_claim,'2026-10-11T00:00:00Z')
        self.assertEqual(row['tier'],'claimed');self.assertNotIn('rerun_status',row)
        self.assertIn('nanoda check rejected',meta['proof_status'])
        self.assertEqual(fresh.final_states,previous['final_states'])
        # Changed source gets its own decision; the rejected source stays blocked.
        changed=copy.deepcopy(new_claim);changed.pop('exclude',None);changed['submission']['commit']='c'*40
        fresh.retain_outcome(key,changed,'lean',early,{'marker':'changed-source'})
        self.assertIn('verification',changed)

    def test_final_ambiguous_cannot_reuse_early_pass(self):
        importer=r.Importer(DiscoveryAPI())
        claim=dict(route='issue',item=self.issue(),submission=d.parse_body(self.issue()['body']))
        key='direct-issue-5'
        importer.retain_outcome(key,claim,'lean',{'decision':'lean-verified'},{'marker':'early'})
        importer.retain_outcome(key,claim,'final',{'decision':'pending'},{'marker':'ambiguous'})
        importer.retain_outcome(key,claim,'lean',{'decision':'lean-verified'},{'marker':'late-early'})
        self.assertNotIn('verification',claim)

    def test_merged_rejected_pr_remains_claimed_after_restart(self):
        key='direct-pr-6';sub=dict(d.parse_body(self.issue()['body']),source_subdir='submissions/dft/alice-proof')
        pr=dict(number=6,state='closed',merged=True,labels=[],head={'sha':sub['commit']},user={'login':'alice'},created_at='2026-10-10T12:00:00Z',html_url='https://github.com/bigospeedrun/verifier/pull/6')
        importer=r.Importer(DiscoveryAPI(prs=[pr]))
        claim=dict(route='pull_request',item=pr,submission=sub)
        importer.retain_outcome(key,claim,'final',{'decision':'blocked'},{'marker':'rejection'})
        recovered=importer.verify({key:dict(route='pull_request',item=pr,submission=None)},dict(final_states=copy.deepcopy(importer.final_states)))
        row,meta,_=r.row_for(key,recovered[key],'2026-10-11T00:00:00Z')
        self.assertEqual(row['tier'],'claimed');self.assertEqual(row['upstream_status'],'merged')
        self.assertNotIn('rerun_status',row);self.assertNotIn('receipt_url',meta)
