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
    def issue(self,number=5,**kwargs):
        body=(ROOT/'direct-fixtures/issue-form-body.txt').read_text()
        return dict(number=number,state='open',title='[Lean submission] DFT',body=body,labels=[],
                    html_url=f'https://github.com/bigospeedrun/verifier/issues/{number}',user={'login':'alice'},
                    created_at='2026-10-10T10:00:00Z',**kwargs)

    def test_claims_skip_tests_and_invalid_bounds(self):
        issue=self.issue();test=self.issue(1);labeled=self.issue(6);labeled['labels']=[{'name':'test'}]
        invalid=self.issue(7);invalid['body']=invalid['body'].replace('1/1000','2/2000')
        flagged=self.issue(8,test_only=True)
        importer=r.Importer(DiscoveryAPI([issue,test,labeled,invalid,flagged]))
        claims=importer.collect()
        self.assertEqual(set(claims),{'direct-issue-5'})
        row,meta,_=r.row_for('direct-issue-5',claims['direct-issue-5'],'2026-10-11T00:00:00Z')
        self.assertEqual(row['tier'],'claimed');self.assertEqual(row['authors'],[dict(name='alice',url='https://github.com/alice')])
        self.assertEqual(meta['publication_date_role'],'Submission opened')

    def test_open_pr_claim_and_closed_unmerged_drop(self):
        pr=dict(number=6,state='open',merged=False,labels=[],head={'sha':'a'*40},user={'login':'alice'},created_at='2026-10-10T12:00:00Z',html_url='https://github.com/bigospeedrun/verifier/pull/6')
        sub=dict(d.parse_body(self.issue()['body']),source_subdir='submissions/dft/alice-proof')
        with patch.object(r,'inspect_pr',return_value={'submission':sub}):
            self.assertIn('direct-pr-6',r.Importer(DiscoveryAPI(prs=[pr])).collect())
            pr['state']='closed'
            self.assertEqual(r.Importer(DiscoveryAPI(prs=[pr])).collect(),{})

    def test_closed_issues_removed_and_non_direct_rows_retained(self):
        docs={slug:json.loads((ROOT/(slug+'.json')).read_text()) for slug in r.SLUGS.values()}
        claim=dict(route='issue',item=self.issue(),submission=d.parse_body(self.issue()['body']))
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            for slug,doc in docs.items():(root/(slug+'.json')).write_bytes(r.json_bytes(doc))
            (root/'registry.json').write_bytes((ROOT/'registry.json').read_bytes())
            first=r.prepare(root,{'direct-issue-5':claim},{},'2026-10-11T00:00:00Z')
            for path,raw in first.items():
                dest=root/path;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(raw)
            self.assertIn('direct-issue-5',{x['id'] for x in json.loads(first['exact-dft.json'])['records']})
            second=r.prepare(root,{}, {},'2026-10-11T01:00:00Z')
            updated=json.loads(second['exact-dft.json'])
            self.assertEqual(updated['records'],docs['exact-dft']['records'])

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
                if status==404:self.assertEqual(r.Importer(api).collect(),{})
                else:
                    with self.assertRaises(GitHubError):r.Importer(api).collect()

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
