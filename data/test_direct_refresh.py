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
        if path.endswith('/comments'):return []  # No bot report: a closed claim stays off unless Lean Verified.
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
        trust=importer(['auto-research.md','auto-research/notes.md','auto-research/a/b.json','submissions/dft/x/Main.lean']).trusted('a'*40)['a'*40]
        # Catalan and Subset Sum both name their statement Statement.lean; each profile gets its own reviewed bytes.
        for profile in trust['profiles'].values():
            self.assertEqual(d.sha(trust['statements'][profile['challenge_file']]),profile['challenge_sha256'])
        self.assertIn('challenges/subset-sum/Statement.lean',trust['statements'])
        for path in ['scripts/new.py','auto-research.md.py','auto-research-2/x.md','docs/auto-research.md']:
            with self.subTest(path=path),self.assertRaises(d.Rejected):importer([path]).trusted('a'*40)

    def test_claims_skip_tests_and_invalid_bounds(self):
        issue=self.issue();test=self.issue(1);labeled=self.issue(6);labeled['labels']=[{'name':'test'}]
        invalid=self.issue(7);invalid['body']=invalid['body'].replace('1/1000','0.001')
        flagged=self.issue(8,test_only=True)
        # An unreduced bound is a valid form, stored reduced (Lead, 2026-11-08, verifier #187: '295/1').
        unreduced=self.issue(9);unreduced['body']=unreduced['body'].replace('1/1000','2/2000')
        importer=self.collector(DiscoveryAPI([issue,test,labeled,invalid,flagged,unreduced]))
        claims=importer.collect()
        self.assertEqual(set(claims),{'direct-issue-5','direct-issue-9'})
        self.assertEqual(claims['direct-issue-9']['submission']['bound'],'1/1000')
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
        # An upgrade of a hand claim is for Other bounds rows only (other_claims); a Big O row refuses it.
        with self.assertRaises(r.Rejected):r.row_for('direct-issue-5',open_claim,'2026-10-11T00:00:00Z',None,dict(text='t',upgrades=dict(handle='x',value='1')))
        # An edited body after closing is a new source without a final result.
        edited=closed(5);edited['body']=edited['body'].replace('1/1000','1/1001')
        importer=r.Importer(DiscoveryAPI([edited]))
        self.assertEqual(importer.verify(importer.discover(),previous),{})

    def test_a_closed_claimed_only_submission_stays_listed_by_the_bots_own_marker(self):
        # Lead, 2026-10-23 (after PR #52): the verifier closes a claimed-only submission; it stays Claimed.
        sub=d.parse_body(self.issue()['body']);digest=d.sha(d.canonical(sub).encode())
        bot=lambda body:{'user':{'login':'github-actions[bot]','type':'Bot'},'body':body}
        def run(comments,closed_issue=True):
            api=DiscoveryAPI([dict(self.issue(5),state='closed' if closed_issue else 'open')])
            pages=api.pages
            api.pages=lambda path,params=None,key=None:comments if path.endswith('/comments') else pages(path,params,key)
            importer=r.Importer(api)
            return importer.verify(importer.discover(),{})
        claimed=bot(f'<!-- bos-claimed-v1 5 {digest} -->\nThis submission is listed as Claimed.')
        kept=run([claimed])
        self.assertEqual(set(kept),{'direct-issue-5'})
        row,meta,_=r.row_for('direct-issue-5',kept['direct-issue-5'],'2026-10-23T00:00:00Z')
        self.assertEqual((row['tier'],meta['proof_status']),('claimed',r.CLAIMED_ONLY_NOTE))
        # Another version's digest, or the same text from another account: not listed once closed.
        self.assertEqual(run([bot('<!-- bos-claimed-v1 5 '+'0'*64+' -->')]),{})
        self.assertEqual(run([dict(claimed,user={'login':'mallory','type':'User'})]),{})
        self.assertEqual(set(run([],closed_issue=False)),{'direct-issue-5'})  # An open issue needs no marker.

    def test_an_open_issue_with_the_bots_final_not_verified_report_is_not_listed(self):
        # Lead, 2026-10-31 (issue #89, a repository with one zip): the bot reports Not verified and leaves the
        # issue open; the author resubmits through a new issue, so the row is not listed.
        sub=d.parse_body(self.issue()['body']);digest=d.sha(d.canonical(sub).encode());commit=sub['commit']
        bot=lambda body,login='github-actions[bot]',kind='Bot':{'user':{'login':login,'type':kind},'body':body}
        report=f'<!-- bos-direct-v1 5 {digest} '+'a'*64+f' -->\nNot verified for source commit `{commit}`.\n\n[Receipt and logs](https://example.test)'
        def run(comments,**item):
            api=DiscoveryAPI([dict(self.issue(5),**item)])
            pages=api.pages
            api.pages=lambda path,params=None,key=None:comments if path.endswith('/comments') else pages(path,params,key)
            importer=r.Importer(api)
            return importer.verify(importer.discover(),{}),importer
        kept,importer=run([bot(report)])
        self.assertEqual(kept,{})
        self.assertTrue(any('final result is Not verified' in note for note in importer.notes))
        self.assertEqual(set(run([bot(report.replace('\n','\r\n',1))])[0]),set(),'a CRLF body is the same report')
        # Still listed as pending: no report, another version's report, a stale report, a lookalike account, another commit.
        for comments in [[],
                         [bot(report.replace(digest,'0'*64))],
                         [bot(report+'\n\nThis result belongs to an older or closed submission. The current issue is not verified by this result.')],
                         [bot(report,'mallory','User')],
                         [bot(report.replace(commit,'f'*40))],
                         [bot(report.replace('Not verified','Lean Verified'))]]:
            with self.subTest(comments=comments[:1]):
                self.assertEqual(set(run(comments)[0]),{'direct-issue-5'})

    def test_a_late_claimed_only_end_that_says_not_verified_stays_listed_as_claimed(self):
        # The verifier's late claimed-only path posts a Not verified report with 'remains Claimed; no proof run
        # started', then the bos-claimed-v1 reply, and closes the issue (Reviewer, 2026-10-31).
        sub=d.parse_body(self.issue()['body']);digest=d.sha(d.canonical(sub).encode())
        bot=lambda body:{'user':{'login':'github-actions[bot]','type':'Bot'},'body':body}
        report=bot(f'<!-- bos-direct-v1 5 {digest} '+'a'*64+f' -->\nNot verified for source commit `{sub["commit"]}`.\n\nThe issue or current record changed before compilation. This submission remains Claimed; no proof run started.')
        claimed=bot(f'<!-- bos-claimed-v1 5 {digest} -->\nThis submission is listed as Claimed.')
        # (issue closed, comments) -> listed: a closed one needs the bos-claimed-v1 reply; an open one is pending.
        for closed_issue,comments,listed in ((True,[report,claimed],True),(False,[report,claimed],True),(False,[report],True),(True,[report],False)):
            api=DiscoveryAPI([dict(self.issue(5),state='closed' if closed_issue else 'open')]);pages=api.pages
            api.pages=lambda path,params=None,key=None,c=comments:c if path.endswith('/comments') else pages(path,params,key)
            importer=r.Importer(api)
            with self.subTest(closed=closed_issue,comments=len(comments)):
                kept=importer.verify(importer.discover(),{})
                self.assertEqual(set(kept),{'direct-issue-5'} if listed else set())
                self.assertFalse(any('final result is Not verified' in note for note in importer.notes))

    def test_a_pending_row_links_the_commit_tree_and_a_verified_row_its_checked_file(self):
        sub=dict(d.parse_body(self.issue()['body']),source_subdir='sub/dir')
        claim=dict(route='issue',item=self.issue(5),submission=sub)
        row,meta,_=r.row_for('direct-issue-5',claim,'2026-10-31T00:00:00Z')
        tree=f"{sub['repo_url']}/tree/{sub['commit']}/sub/dir"
        self.assertEqual((row['source']['url'],meta['source_url']),(tree,tree))
        plain=dict(claim,submission=d.parse_body(self.issue()['body']))
        self.assertEqual(r.row_for('direct-issue-5',plain,'2026-10-31T00:00:00Z')[0]['source']['url'],f"{plain['submission']['repo_url']}/tree/{plain['submission']['commit']}")
        verified=dict(claim,verification=dict(checked_at='2026-10-31T00:00:00Z',receipt_path='sources/x.json',receipt_url='https://example.test',reason='ok',source_file='Solution/Main.lean'))
        self.assertEqual(r.row_for('direct-issue-5',verified,'2026-10-31T00:00:00Z')[0]['source']['url'],f"{sub['repo_url']}/blob/{sub['commit']}/sub/dir/Solution/Main.lean")

    def test_the_not_verified_verdict_is_cached_per_version_and_update_time(self):
        sub=d.parse_body(self.issue()['body']);digest=d.sha(d.canonical(sub).encode())
        report=[{'user':{'login':'github-actions[bot]','type':'Bot'},'body':f'<!-- bos-direct-v1 5 {digest} '+'a'*64+f' -->\nNot verified for source commit `{sub["commit"]}`.'}]
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'direct-trust.json').write_bytes((ROOT/'direct-trust.json').read_bytes())
            def once(updated,comments):
                reads=[];api=DiscoveryAPI([dict(self.issue(5),updated_at=updated)]);pages=api.pages
                def read(path,params=None,key=None):
                    if path.endswith('/comments'):reads.append(path);return comments
                    return pages(path,params,key)
                api.pages=read
                importer=r.Importer(api,root)
                kept=importer.verify(importer.discover(),{})
                (root/'direct-submissions.json').write_text(json.dumps({'entries':{},'not_verified_cache':importer.not_verified_cache}))
                return 'direct-issue-5' in kept,len(reads)
            self.assertEqual(once('2026-10-31T10:00:00Z',report),(False,1))
            self.assertEqual(once('2026-10-31T10:00:00Z',[]),(False,0))  # cached: no read
            self.assertEqual(once('2026-10-31T11:00:00Z',[]),(True,1))  # touched: read again
        fixtures=json.loads((ROOT/'direct-fixtures/board-snapshots.json').read_text())
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            for slug in r.SLUGS.values():(root/(slug+'.json')).write_bytes(r.json_bytes(fixtures[slug]))
            (root/'registry.json').write_bytes(r.json_bytes({'checked_at':'2026-10-10','updated_at':'2026-10-10T00:00:00Z'}))
            cache={'5':dict(version=digest,updated_at='2026-10-31T10:00:00Z',not_verified=True)}
            files=r.prepare(root,{},{},'2026-10-31T12:00:00Z',{},{},None,cache)
            self.assertEqual(json.loads(files['direct-submissions.json'])['not_verified_cache'],cache)

    def test_a_closed_pr_is_kept_only_after_the_bots_claimed_only_result_for_its_head(self):
        pr=dict(number=52,state='closed',merged=False,head={'sha':'c'*40},labels=[],user={'login':'alice'})
        bot=lambda body:{'user':{'login':'github-actions[bot]','type':'Bot'},'body':body}
        layout=dict(submission=dict(d.parse_body(self.issue()['body']),repo_url='https://github.com/bigospeedrun/verifier',commit='c'*40))
        for comments,kept in [([bot('<!-- bos-pr-v2 52 '+'c'*40+' -->\nPR proof result: **claimed_only**. Bound below the record.')],True),
                              ([bot('<!-- bos-pr-v2 52 '+'c'*40+' -->\nPR proof result: **keep_open**. Receipt run mismatch.')],False),
                              ([bot('<!-- bos-pr-v2 52 '+'d'*40+' -->\nPR proof result: **claimed_only**.')],False)]:
            api=DiscoveryAPI([],[pr])
            pages=api.pages
            api.pages=lambda path,params=None,key=None,comments=comments:comments if path.endswith('/comments') else pages(path,params,key)
            with patch.object(r,'inspect_pr',return_value=layout):
                claims=r.Importer(api).discover()
            self.assertEqual('direct-pr-52' in claims,kept)
            if kept:self.assertEqual((claims['direct-pr-52']['closed'],claims['direct-pr-52']['claimed_only']),(True,True))

    def test_inspect_pr_runs_once_per_pr_version_and_base(self):
        # 2026-11-12: every pr-submission artifact read its PR again (about ten requests each), and the step passed 14 min.
        pr=dict(number=52,head={'sha':'c'*40},base={'sha':'a'*40},changed_files=2)
        layout=dict(submission=dict(bound='1'))
        importer=r.Importer(DiscoveryAPI([],[]))
        with patch.object(r,'inspect_pr',return_value=layout) as inspect:
            for base in [None,'a'*40,None]:self.assertEqual(importer.inspect(pr,base),layout)
            importer.inspect(pr,'b'*40);importer.inspect(dict(pr,head={'sha':'d'*40}))
            self.assertEqual(inspect.call_count,3)
            importer.inspect(pr)['submission']['bound']='2'
            self.assertEqual(importer.inspect(pr)['submission']['bound'],'1')  # a copy: callers cannot change the cache
        with patch.object(r,'inspect_pr',side_effect=d.Rejected('Wrong PR base')) as inspect:
            other=dict(pr,number=53)
            for _ in range(2):
                with self.assertRaises(d.Rejected):importer.inspect(other)
            self.assertEqual(inspect.call_count,1)

    def test_prefetch_serves_the_same_reads_and_a_failure_falls_back(self):
        # 2026-11-12: 435 artifact and 233 run reads in order took the step past 14 min; they now run in parallel first.
        calls=[]
        class API(DiscoveryAPI):
            def get(self,path,limit=None):
                calls.append(path)
                if path.endswith('/7/zip'):raise r.GitHubError(500)
                return b'zip:'+path.encode()
            def json(self,path,params=None):
                calls.append(path);return {'id':int(path.rsplit('/',1)[1])}
        importer=r.Importer(API([],[]))
        importer.prefetch([('zip',5),('zip',7),('run',9),('zip',5)])
        self.assertEqual(sorted(calls),sorted([r.PREFIX+'actions/artifacts/5/zip',r.PREFIX+'actions/artifacts/7/zip',r.PREFIX+'actions/runs/9']))
        calls.clear()
        self.assertEqual(importer.artifact({'id':5}),b'zip:'+(r.PREFIX+'actions/artifacts/5/zip').encode())
        self.assertEqual(importer.run(9),{'id':9})
        self.assertEqual(calls,[])  # both came from the prefetch
        with self.assertRaises(r.GitHubError):importer.artifact({'id':7})  # not prefetched: read again in order, fails as before
        self.assertEqual(calls,[r.PREFIX+'actions/artifacts/7/zip'])

    def test_the_claimed_only_verdict_is_cached_per_version_and_update_time(self):
        # Lead, 2026-10-23: the site read the comments of every closed unmerged PR each hour.
        pr=dict(number=52,state='closed',merged=False,head={'sha':'c'*40},labels=[],user={'login':'alice'},updated_at='2026-10-23T20:00:00Z')
        bot=lambda body:{'user':{'login':'github-actions[bot]','type':'Bot'},'body':body}
        layout=dict(submission=dict(d.parse_body(self.issue()['body']),repo_url='https://github.com/bigospeedrun/verifier',commit='c'*40))
        report=[bot('<!-- bos-pr-v2 52 '+'c'*40+' -->\nPR proof result: **claimed_only**. Bound below the record.')]
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'direct-trust.json').write_bytes((ROOT/'direct-trust.json').read_bytes())
            def discover(item,comments):
                reads=[];api=DiscoveryAPI([],[item]);pages=api.pages
                def read(path,params=None,key=None):
                    if path.endswith('/comments'):reads.append(path);return comments
                    return pages(path,params,key)
                api.pages=read
                importer=r.Importer(api,root)
                with patch.object(r,'inspect_pr',return_value=layout):claims=importer.discover()
                (root/'direct-submissions.json').write_text(json.dumps({'entries':{},'claimed_only_cache':importer.claimed_cache}))
                return 'direct-pr-52' in claims,len(reads)
            self.assertEqual(discover(pr,report),(True,1))
            self.assertEqual(discover(pr,[]),(True,0))  # cached: no read
            self.assertEqual(discover(dict(pr,updated_at='2026-10-23T21:00:00Z'),[]),(False,1))  # touched: read again
            self.assertEqual(discover(dict(pr,updated_at='2026-10-23T22:00:00Z'),report),(True,1))
            self.assertEqual(discover(dict(pr,updated_at='2026-10-23T22:00:00Z',head={'sha':'d'*40}),report),(False,1))  # another head
        # prepare() writes the cache into direct-submissions.json.
        fixtures=json.loads((ROOT/'direct-fixtures/board-snapshots.json').read_text())
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            for slug in r.SLUGS.values():(root/(slug+'.json')).write_bytes(r.json_bytes(fixtures[slug]))
            (root/'registry.json').write_bytes(r.json_bytes({'checked_at':'2026-10-10','updated_at':'2026-10-10T00:00:00Z'}))
            cache={'52':dict(version='c'*40,updated_at='2026-10-23T20:00:00Z',claimed_only=True)}
            files=r.prepare(root,{},{},'2026-10-23T22:00:00Z',{},{},cache)
            self.assertEqual(json.loads(files['direct-submissions.json'])['claimed_only_cache'],cache)

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

    def sssp_claim(self,bound,number=140,proof=True):
        body=self.issue()['body'].replace('### Problem\n\ndft','### Problem\n\ndirected-sssp').replace('1/1000',bound)
        sub=d.parse_body(body)
        verification=dict(checked_at='2026-11-04T00:00:00Z',receipt_path=f'sources/direct-issue-{number}-receipt.json',
            receipt_url='https://github.com/bigospeedrun/verifier/actions/runs/1',reason='Lean and nanoda passed; permitted-axiom audit passed') if proof else None
        return dict(route='issue',item=dict(self.issue(number),body=body),submission=sub,**({'verification':verification} if proof else {}))

    def sssp_board(self,claims):
        fixtures=json.loads((ROOT/'direct-fixtures/board-snapshots.json').read_text())
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            for slug in r.SLUGS.values():(root/(slug+'.json')).write_bytes(r.json_bytes(fixtures[slug]))
            (root/'registry.json').write_bytes(r.json_bytes({'checked_at':'2026-10-10','updated_at':'2026-10-10T00:00:00Z'}))
            files=r.prepare(root,claims,{},'2026-11-04T00:00:00Z')
            return json.loads(files['directed-sssp.json']) if 'directed-sssp.json' in files else None

    def test_a_directed_sssp_result_is_a_row_of_its_board(self):
        # Opened 2026-11-03: the bound "D ; T" stays text (data/sssp.py), as the verifier's parse_sssp.
        claim=self.sssp_claim('n ; n log^1/2')
        self.assertEqual(claim['submission']['bound'],'n ; n log^1/2')
        row,meta,_=r.row_for('direct-issue-140',claim,'2026-11-04T00:00:00Z')
        self.assertEqual((row['score'],row['tier'],meta['comparison_key']),('n ; n log^1/2','verified','directed-sssp/comparison-addition-sparse/v1'))
        board=self.sssp_board({'direct-issue-140':claim})
        self.assertEqual([x['id'] for x in board['records']][-1],'direct-issue-140')
        self.assertEqual(board['record_metadata']['direct-issue-140']['verification'],'passed')

    def test_a_directed_sssp_claim_worse_than_the_classic_at_its_density_is_not_listed(self):
        # The classic O(m + n log n) is n^2 at D = n^2 and n log n at D = n (Lead, 2026-11-02: only a Lean Verified
        # row may be worse than the classic bound).
        doc=json.loads((ROOT/'directed-sssp.json').read_text())
        self.assertEqual([r.worse_than_classic(doc,b) for b in ['n ; n log','n ; n log loglog','n^2 ; n^2','n^2 ; n^2 log']],[False,True,False,True])
        self.assertIsNone(self.sssp_board({'direct-issue-141':self.sssp_claim('n^2 ; n^2 log',141,proof=False)}))
        board=self.sssp_board({'direct-issue-141':self.sssp_claim('n^2 ; n^2 log',141)})
        self.assertIn('direct-issue-141',[x['id'] for x in board['records']])

    def test_a_directed_sssp_form_bound_is_refused_outside_the_normal_form(self):
        for bound in ['n^2 ; n^3','n ; n^3','1/2','n log^0.75 ; n']:
            with self.subTest(bound=bound),self.assertRaises(ValueError):
                d.normalize(dict(self.sssp_claim('n ; n log')['submission'],bound=bound))

    def test_the_directed_sssp_target_is_the_verifiers(self):
        # The C-HD row's generated challenge (verifier challenges/directed-sssp/CHDRow.lean, sha256 b9569dae) is the
        # statement plus the target that the verifier writes from the five exponents.
        base=(ROOT/'direct-fixtures/SsspVerifierStatement.lean').read_bytes()
        sub=self.sssp_claim('n log^3/4 ; n log^11/12')['submission']
        self.assertEqual(d.sha(base),'cf5752049bcffcdbd9f2368cac10a57fc392881d2754a5fa60e7741519d2a6ca')
        self.assertEqual(d.sha(d.challenge_bytes(sub,base)),'b9569daeed41b0394a8a0ec10bd40fa15d005fef8afb1abfa2f77a52f7d27ab0')
        self.assertTrue(d.challenge_bytes(dict(sub,bound='n log ; n log^2 loglog^-7'),base).endswith(
            'Bound ((1 : ℚ) / 1) ((1 : ℚ) / 1) ((1 : ℚ) / 1) ((2 : ℚ) / 1) ((-7 : ℚ) / 1) := by\n  sorry\n'.encode()))

    def test_a_subset_sum_result_is_a_row_of_the_subset_sum_board(self):
        # Opened 2026-11-01 (verifier #94): a direct Subset Sum result is a board row, as on 3SUM, not an Other bounds claim.
        body=self.issue()['body'].replace('### Problem\n\ndft','### Problem\n\nsubset-sum').replace('1/1000','12/25')
        sub=d.parse_body(body);self.assertEqual((sub['problem'],sub['bound']),('subset-sum','12/25'))
        proof=dict(checked_at='2026-11-01T00:00:00Z',receipt_path='sources/direct-issue-99-receipt.json',receipt_url='https://github.com/bigospeedrun/verifier/actions/runs/1',reason='Lean and nanoda passed; permitted-axiom audit passed')
        claim=dict(route='issue',item=dict(self.issue(99),body=body),submission=sub,verification=proof)
        row,meta,_=r.row_for('direct-issue-99',claim,'2026-11-01T00:00:00Z')
        self.assertEqual((row['score'],row['tier'],meta['comparison_key']),('12/25','verified','subset-sum/randomized-word-ram/v1'))
        fixtures=json.loads((ROOT/'direct-fixtures/board-snapshots.json').read_text())
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            for slug in r.SLUGS.values():(root/(slug+'.json')).write_bytes(r.json_bytes(fixtures[slug]))
            (root/'registry.json').write_bytes(r.json_bytes({'checked_at':'2026-10-10','updated_at':'2026-10-10T00:00:00Z'}))
            files=r.prepare(root,{'direct-issue-99':claim},{},'2026-11-01T00:00:00Z')
            board=json.loads(files['subset-sum.json'])
            self.assertEqual(board['record_metadata']['direct-issue-99']['verification'],'passed')
            self.assertEqual([x['id'] for x in board['records']][-1],'direct-issue-99')
            for slug in ['exact-dft','3sum','apsp']:self.assertNotIn(slug+'.json',files)
            self.assertEqual(json.loads(files['direct-other.json'])['boards'],{})
            # The record gate reads the row (lower is better): 12/25 leads, so 12/25 again does not qualify, 47/100 does.
            gate=d.current_record_gate('subset-sum',files['subset-sum.json'],'b'*40,'2026-11-01T00:00:00Z')
            self.assertEqual((gate['score'],gate['leader_ids'],gate['any_lean_verified_at_bound']),('12/25',['direct-issue-99'],True))
            self.assertFalse(d.qualifies_for_run(sub,gate))
            self.assertTrue(d.qualifies_for_run(dict(sub,bound='47/100'),gate))

    def test_a_subset_sum_bound_worse_than_classic_is_listed_only_when_lean_verified(self):
        # Nil ruling 2026-11-02 (verifier #94): the best Lean Verified bound is listed even above the classical 1/2 (a
        # stepping stone). The lead, 2026-11-02: Lean Verified rows only; a Claimed 4/5 (open, or closed claimed-only) is not listed.
        def claim(number,bound,proof):
            body=self.issue()['body'].replace('### Problem\n\ndft','### Problem\n\nsubset-sum').replace('1/1000',bound)
            item=dict(self.issue(number),body=body)
            return dict(route='issue',item=item,submission=d.parse_body(body),**({'verification':proof} if proof else {}))
        proof=dict(checked_at='2026-11-02T00:00:00Z',receipt_path='sources/direct-issue-99-receipt.json',receipt_url='https://github.com/bigospeedrun/verifier/actions/runs/1',reason='Lean and nanoda passed; permitted-axiom audit passed')
        claims={'direct-issue-99':claim(99,'3/4',proof),'direct-issue-100':claim(100,'4/5',None),
                'direct-issue-101':dict(claim(101,'4/5',None),closed=True,claimed_only=True,review_note=r.CLAIMED_ONLY_NOTE),
                'direct-issue-102':claim(102,'1/2',None),'direct-issue-103':claim(103,'12/25',None)}
        fixtures=json.loads((ROOT/'direct-fixtures/board-snapshots.json').read_text())
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            for slug in r.SLUGS.values():(root/(slug+'.json')).write_bytes(r.json_bytes(fixtures[slug]))
            (root/'registry.json').write_bytes(r.json_bytes({'checked_at':'2026-10-10','updated_at':'2026-10-10T00:00:00Z'}))
            board=json.loads(r.prepare(root,claims,{},'2026-11-02T00:00:00Z')['subset-sum.json'])
            listed={x['id']:x['tier'] for x in board['records'] if x['id'].startswith('direct-')}
            # A tie with the classical 1/2 is not worse, so its Claimed row is listed, as is a Claimed 12/25.
            self.assertEqual(listed,{'direct-issue-99':'verified','direct-issue-102':'claimed','direct-issue-103':'claimed'})
        doc=fixtures['subset-sum']
        self.assertEqual([r.worse_than_classic(doc,b) for b in ['4/5','3/4','1/2','12/25']],[True,True,False,False])
        self.assertEqual([r.worse_than_classic(fixtures['exact-dft'],b) for b in ['0','1/1000']],[False,False])

    def test_a_final_result_of_an_unfinished_run_is_checked_with_the_jobs_of_its_attempt(self):
        # Lead, 2026-11-02 (run 41393097953): the refresh reads the jobs of the run attempt only for a final result of a
        # run that is still in progress, once per attempt, and gives them to validate_result.
        reads=[];seen=[]
        result=dict(id=11,name='direct-submission-77-1-5',expired=False);proof=dict(id=12,name='verifier-receipt-and-logs-77-1-5',expired=False)
        env=dict(schema_version=1,issue_number=5,run_id='77',receipt_artifact={'id':12})
        class API(DiscoveryAPI):
            def pages(self,path,params=None,key=None):
                if path.endswith('/actions/artifacts'):return [result,proof]
                if '/jobs' in path:reads.append((path,key));return [{'name':'select'}]
                return super().pages(path,params,key)
            def get(self,path,limit=None):return b'zip'
        for status,jobs in [('in_progress',[{'name':'select'}]),('completed',None)]:
            reads.clear();seen.clear()
            importer=r.Importer(API([self.issue()]))
            importer.runs[77]=dict(id=77,run_attempt=1,head_sha='a'*40,status=status)
            claim=dict(route='issue',item=self.issue(),submission=d.parse_body(self.issue()['body']))
            def validate(*args,**kwargs):seen.append(kwargs['jobs']);raise d.Rejected('stop')
            with patch.object(r,'archive_members',return_value={'direct-submission.json':json.dumps(env).encode()}), \
                 patch.object(importer,'trusted'),patch.object(r,'validate_result',side_effect=validate):
                importer.verify({'direct-issue-5':claim},{})
            with self.subTest(status=status):
                self.assertEqual(seen,[jobs])
                self.assertEqual(reads,[('repos/bigospeedrun/verifier/actions/runs/77/attempts/1/jobs','jobs')] if jobs else [])
                if jobs:
                    importer.jobs(importer.runs[77]);self.assertEqual(len(reads),1)  # once per attempt

    def test_a_check_that_ran_out_of_time_keeps_the_row_claimed_and_a_real_failure_drops_it(self):
        # Lead, 2026-11-02 (verifier #99): a timeout is not a verdict, and a setup that failed before the proof check
        # (rerun 41494392206) is our failure. The verifier's 'Not verified' reply is the same for all of them.
        sub=d.parse_body(self.issue()['body']);digest=d.sha(d.canonical(sub).encode())
        report=[{'user':{'login':'github-actions[bot]','type':'Bot'},'body':f'<!-- bos-direct-v1 5 {digest} '+'a'*64+f' -->\nNot verified for source commit `{sub["commit"]}`.\nReason: the proof check ran out of time.'}]
        class API(DiscoveryAPI):
            def pages(self,path,params=None,key=None):
                return report if path.endswith('/comments') else super().pages(path,params,key)
        outcomes={};finals={}
        for decision in ['timeout','setup','pending']:
            importer=r.Importer(API([self.issue()]))
            claim=dict(route='issue',item=self.issue(),submission=sub)
            importer.retain_outcome('direct-issue-5',claim,'final',dict(decision=decision),{'marker':decision})
            kept=importer.verify({'direct-issue-5':claim},dict(final_states=copy.deepcopy(importer.final_states)))
            outcomes[decision]=kept.get('direct-issue-5');finals[decision]=copy.deepcopy(importer.final_states)
        self.assertIsNone(outcomes['pending'])  # a real failure: not listed, as before
        fixtures=json.loads((ROOT/'direct-fixtures/board-snapshots.json').read_text())
        for decision,note in [('timeout',r.TIMEOUT_NOTE),('setup',r.SETUP_NOTE)]:
            with self.subTest(decision=decision):
                listed,final=outcomes[decision],finals[decision]
                self.assertEqual((listed.get('verification'),listed['review_note']),(None,note))
                row,meta,_=r.row_for('direct-issue-5',listed,'2026-11-02T11:00:00Z')
                self.assertEqual((row['tier'],meta['site_tier'],meta['proof_status']),('claimed','claimed',note))
                self.assertNotIn('rerun_status',row)
                # Feed state failed: the records feed never posts it (records-feed.ts), also when it comes back after a drop.
                self.assertEqual(r.verification_state('direct-issue-5',listed,final),'failed')
                with tempfile.TemporaryDirectory() as temp:
                    root=Path(temp)
                    for slug in r.SLUGS.values():(root/(slug+'.json')).write_bytes(r.json_bytes(fixtures[slug]))
                    (root/'registry.json').write_bytes(r.json_bytes({'checked_at':'2026-10-10','updated_at':'2026-10-10T00:00:00Z'}))
                    board=json.loads(r.prepare(root,{'direct-issue-5':listed},{},'2026-11-02T11:00:00Z',final)['exact-dft.json'])
                    self.assertEqual((board['record_metadata']['direct-issue-5']['verification'],board['record_metadata']['direct-issue-5']['proof_status']),('failed',note))
                # After a restart (no artifact read), the saved outcome keeps the status.
                again=r.Importer(API([self.issue()]))
                claim=dict(route='issue',item=self.issue(),submission=sub)
                self.assertEqual(again.verify({'direct-issue-5':claim},dict(final_states=final))['direct-issue-5']['review_note'],note)

    def test_a_setup_failure_never_replaces_a_result_and_the_next_real_result_wins(self):
        # Lead, 2026-11-02: a setup failure is no result. Results apply oldest first (verify()), so the newest real one wins.
        sub=d.parse_body(self.issue()['body']);digest=d.sha(d.canonical(sub).encode())
        report=[{'user':{'login':'github-actions[bot]','type':'Bot'},'body':f'<!-- bos-direct-v1 5 {digest} '+'a'*64+f' -->\nNot verified for source commit `{sub["commit"]}`.\nReason: the verifier setup failed before the proof check.'}]
        class API(DiscoveryAPI):
            def pages(self,path,params=None,key=None):
                return report if path.endswith('/comments') else super().pages(path,params,key)
        def listed(*decisions):
            importer=r.Importer(API([self.issue()]))
            claim=dict(route='issue',item=self.issue(),submission=sub)
            for decision in decisions:
                importer.retain_outcome('direct-issue-5',claim,'final',dict(decision=decision),{'marker':decision})
            kept=importer.verify({'direct-issue-5':claim},dict(final_states=copy.deepcopy(importer.final_states)))
            return kept.get('direct-issue-5'),importer.final_states
        # After a real failure, a setup failure of a rerun keeps the failure: not listed.
        self.assertIsNone(listed('pending','setup')[0])
        # After a timeout, the timeout stays.
        row,final=listed('timeout','setup')
        self.assertEqual((row['review_note'],[s['decision'] for s in final.values()]),(r.TIMEOUT_NOTE,['timeout']))
        # A Lean Verified result stays.
        row,final=listed('lean-verified','setup')
        self.assertEqual((row['verification'],[s['decision'] for s in final.values()]),({'marker':'lean-verified'},['lean-verified']))
        # A real result after a setup failure replaces it.
        self.assertIsNone(listed('setup','pending')[0])
        self.assertEqual(listed('setup','lean-verified')[0]['verification'],{'marker':'lean-verified'})
        self.assertEqual(listed('setup','timeout')[0]['review_note'],r.TIMEOUT_NOTE)

    def test_a_draft_verifier_pr_created_from_5270_on_is_not_a_claim_until_ready(self):
        pr=dict(number=60,state='open',merged=False,draft=True,labels=[],head={'sha':'a'*40},user={'login':'alice'},created_at='2026-10-24T00:00:00Z',html_url='https://github.com/bigospeedrun/verifier/pull/60')
        sub=dict(d.parse_body(self.issue()['body']),source_subdir='submissions/dft/alice-proof')
        with patch.object(r,'inspect_pr',return_value={'submission':sub}):
            importer=self.collector(DiscoveryAPI(prs=[pr]))
            self.assertEqual(importer.collect(),{})
            self.assertTrue(any('Draft PR #60' in n for n in importer.notes))
            self.assertIn('direct-pr-60',self.collector(DiscoveryAPI(prs=[dict(pr,draft=False)])).collect())
            # An older draft is read as before.
            self.assertIn('direct-pr-60',self.collector(DiscoveryAPI(prs=[dict(pr,created_at='2026-10-20T00:00:00Z')])).collect())

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

    def test_a_note_without_a_predecessor_gives_a_row_with_none(self):
        # 2026-11-02: the 3SUM row direct-issue-4 builds on Anthropic's formalization, which is not a verifier issue or PR.
        claim=dict(route='issue',item=self.issue(),submission=d.parse_body(self.issue()['body']))
        row,meta,_=r.row_for('direct-issue-5',claim,'2026-10-11T00:00:00Z',None,dict(text='Built on a formalization outside the verifier.'))
        self.assertEqual(row['predecessors'],[]);self.assertEqual(meta['credit_note'],'Built on a formalization outside the verifier.')

    def test_a_note_predecessor_is_optional_but_a_repository_url_is_not_one(self):
        from direct_note_rules import predecessor_ok
        self.assertTrue(predecessor_ok(dict(text='x')))
        self.assertTrue(predecessor_ok(dict(text='x',predecessor='https://github.com/bigospeedrun/verifier/issues/3')))
        self.assertTrue(predecessor_ok(dict(text='x',predecessor='https://github.com/bigospeedrun/verifier/pull/41')))
        self.assertFalse(predecessor_ok(dict(text='x',predecessor='https://github.com/anthropics/formal-math')))
        self.assertFalse(predecessor_ok(dict(text='x',predecessor='')))
        self.assertNotIn('predecessor',json.loads((ROOT/'direct-notes.json').read_text())['notes']['direct-issue-4'])

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

    def test_a_derivation_hold_stays_claimed_until_the_lead_approves_its_digest(self):
        sub=d.parse_body(self.issue()['body']);digest=d.sha(d.canonical(sub).encode());key='direct-issue-5'
        verdict=dict(decision='lean-verified',reason='Lean and nanoda passed',id=f'direct-5-{digest}',derivation_hold=True)
        importer=self.collector(DiscoveryAPI())
        self.assertEqual(importer.derivation(key,verdict)['decision'],'held')
        self.assertEqual(importer.derivation(key,dict(verdict,derivation_hold=False)),dict(verdict,derivation_hold=False))
        claim=dict(route='issue',item=self.issue(),submission=sub)
        for stage in ['lean','final']:importer.retain_outcome(key,claim,stage,importer.derivation(key,verdict),{'marker':stage})
        self.assertNotIn('verification',claim)
        row,meta,_=r.row_for(key,claim,'2026-10-23T00:00:00Z')
        self.assertEqual((row['tier'],meta['proof_status']),('claimed',r.HELD_NOTE))
        # Closed while held: not listed; a later refresh keeps the note from the stored final state.
        previous=dict(entries={},final_states=copy.deepcopy(importer.final_states))
        fresh=self.collector(DiscoveryAPI())
        self.assertEqual(fresh.verify({key:dict(claim,closed=True)},previous),{})
        reopened=dict(route='issue',item=self.issue(),submission=sub)
        self.assertEqual(fresh.verify({key:reopened},previous)[key]['review_note'],r.HELD_NOTE)
        # The lead's approval of this exact digest lists the result; another digest does not.
        for listed,expected in [(digest,'lean-verified'),('0'*64,'held')]:
            approver=self.collector(DiscoveryAPI())
            (approver.root/'review-decisions.json').write_text(json.dumps({'approved':[],'derivations':[
                {'id':key,'submission_sha256':listed,'decision':'approved','by':'BOS Lead Dev','at':'2026-10-23T00:00:00Z','note':'test'}]}))
            approver=r.Importer(DiscoveryAPI(),approver.root)
            self.assertEqual(approver.derivation(key,verdict)['decision'],expected)
            claim=dict(route='issue',item=self.issue(),submission=sub)
            approver.retain_outcome(key,claim,'final',approver.derivation(key,verdict),{'marker':'final'})
            self.assertEqual('verification' in claim,expected=='lean-verified')

    def test_an_other_bounds_result_is_listed_only_when_lean_verified(self):
        # Verifier PR #15 (2026-10-23): average sensitivity is an Other bounds row, not a board.
        body=('### Problem\n\naverage-sensitivity\n\n### Repository URL\n\nhttps://github.com/u/p\n\n### Commit SHA\n\n'+'a'*40+'\n\n### Bound\n\n1881/500\n')
        sub=d.parse_body(body);item=dict(self.issue(60),body=body)
        proof=dict(decision='lean-verified',receipt_path='sources/direct-issue-60-1-1-final.json')
        claims={'direct-issue-60':dict(route='issue',item=item,submission=sub,verification=proof),
                'direct-issue-61':dict(route='issue',item=self.issue(61),submission=dict(sub),verification=None)}
        boards=r.other_claims(claims,{},{})
        listed=boards['other-average-sensitivity']['claims']
        self.assertEqual([c['handle'] for c in listed],['direct-issue-60'])
        self.assertEqual((listed[0]['value'],listed[0]['display'],listed[0]['evidence'],listed[0]['url']),
                         ('1881/500','3.762','lean-verified','https://github.com/bigospeedrun/verifier/issues/60'))
        self.assertEqual(listed[0]['bound'],'\\mathrm{AS}(f)\\le 3.762d\\sqrt n')
        self.assertEqual(r.other_claims(claims,{'direct-issue-60':'withdrawn'},{}),{})
        # A reviewed credit note on an Other bounds row reaches the claim, with its KaTeX (the page renders it with inlineMath).
        note=dict(predecessor='https://github.com/bigospeedrun/verifier/issues/49',text="This is a Lean Verified \\(\\frac{1881}{500}\\) proof with its final constant lowered.")
        noted=r.other_claims(claims,{},{'direct-issue-60':note})['other-average-sensitivity']['claims'][0]
        self.assertEqual(noted['note'],note['text'])
        with self.assertRaises(r.Rejected):r.other_claims(claims,{},{'direct-issue-60':dict(note,text='A <b>tag</b>')})
        self.assertEqual([r.display_up(v) for v in ['1881/500','3','1/3','5999999/2000000','2999999999/1000000000']],['3.762','3','0.333334','3.0','3.0'])
        # Catalan (opened 2026-10-27) is an Other bounds row too: an exponent bound mu(G).
        cat=dict(sub,problem='catalan',bound='1091')
        listed=r.other_claims({'direct-issue-70':dict(route='issue',item=self.issue(70),submission=cat,verification=proof)},{},{})['other-catalan']['claims']
        self.assertEqual((listed[0]['handle'],listed[0]['value'],listed[0]['bound']),('direct-issue-70','1091','\\mu(G)\\le 1091'))
        self.assertEqual(listed[0]['display'],'1091')
        self.assertIn('BigOSpeedrun.Catalan.Bound (1091)',listed[0]['proofScope'])
        # A reviewed upgrade (Lead, 2026-11-08, verifier #187): the claim carries it to other-merge.ts, which upgrades that
        # hand claim in place. Its value must equal the bound; a bad shape is refused.
        up=dict(text='A port.',upgrades=dict(handle='slitsey',value='1091'))
        upgraded=r.other_claims({'direct-issue-70':dict(route='issue',item=self.issue(70),submission=cat,verification=proof)},{},{'direct-issue-70':up})['other-catalan']['claims'][0]
        self.assertEqual(upgraded['upgrades'],dict(handle='slitsey',value='1091'))
        self.assertNotIn('upgrades',listed[0])
        # Only the reduced form names a value (Lead, 2026-11-08).
        from direct_note_rules import upgrades_ok
        self.assertEqual([upgrades_ok(dict(handle='slitsey',value=v)) for v in ('295','295/1','590/2','1/3')],[True,False,False,True])
        for bad in (dict(handle='slitsey',value='295'),dict(handle='slitsey',value='1091/1'),dict(handle='slitsey'),dict(handle='a b',value='1091'),dict(handle='slitsey',value='1091',x='y')):
            with self.assertRaises(r.Rejected):
                r.other_claims({'direct-issue-70':dict(route='issue',item=self.issue(70),submission=cat,verification=proof)},{},{'direct-issue-70':dict(up,upgrades=bad)})
        # Snaky (opened after verifier #106's runs) is an Other bounds row: Maker moves.
        snaky=dict(sub,problem='snaky',bound='20')
        listed=r.other_claims({'direct-issue-80':dict(route='issue',item=self.issue(80),submission=snaky,verification=proof)},{},{})['other-snaky']['claims']
        self.assertEqual((listed[0]['handle'],listed[0]['value'],listed[0]['display'],listed[0]['bound']),
                         ('direct-issue-80','20','20','\\text{Maker moves}\\le 20'))
        self.assertIn('BigOSpeedrun.Snaky.Bound',listed[0]['proofScope'])
        # A reviewed credit (lead decision, verifier#142): direct-notes.json authors replace the submitter alone, in
        # that order; the date, value and receipt stay. The submitter must be among them, and the logins must be valid.
        credit=dict(authors=['shjvandekamp','alice'],text="The construction is shjvandekamp's (shjvandekamp/math@64e7eb1).")
        credit_claims={'direct-issue-80':dict(route='issue',item=self.issue(80),submission=snaky,verification=proof)}
        plain=r.other_claims(credit_claims,{},{})['other-snaky']['claims'][0]
        credited=r.other_claims(credit_claims,{},{'direct-issue-80':credit})['other-snaky']['claims'][0]
        self.assertEqual(credited['authors'],[dict(name='shjvandekamp',url='https://github.com/shjvandekamp'),dict(name='alice',url='https://github.com/alice')])
        self.assertEqual((credited['author'],credited['note']),('shjvandekamp and alice',credit['text']))
        self.assertEqual({k:v for k,v in credited.items() if k not in ('author','authors','note')},{k:v for k,v in plain.items() if k not in ('author','authors','note')})
        for bad in (['shjvandekamp'],['alice','bad/login']):
            with self.assertRaises(r.Rejected):r.other_claims(credit_claims,{},{'direct-issue-80':dict(credit,authors=bad)})
        # A reviewed display credit (Lead, 2026-11-07, prime gaps): the author line and names replace the logins in
        # the claim; the logins still check the submitter; a name links its account when the credit names one, else it has
        # no link, never the submission (Lead, 2026-11-08). Plain text only.
        names=['François Charton','Letong Hong','Jonas Whidden','MultiAgency swarm']
        shown=dict(credit,credit=dict(author='Axiom Math: François Charton and Letong Hong; Jonas Whidden; MultiAgency swarm',names=names))
        displayed=r.other_claims(credit_claims,{},{'direct-issue-80':shown})['other-snaky']['claims'][0]
        self.assertEqual(displayed['author'],shown['credit']['author'])
        self.assertEqual(displayed['authors'],[dict(name=x) for x in names])
        accounted=dict(shown,credit=dict(shown['credit'],accounts={'MultiAgency swarm':'https://github.com/darkhipo'}))
        self.assertEqual(r.other_claims(credit_claims,{},{'direct-issue-80':accounted})['other-snaky']['claims'][0]['authors'],
                         [dict(name=x) for x in names[:-1]]+[dict(name='MultiAgency swarm',url='https://github.com/darkhipo')])
        self.assertEqual({k:v for k,v in displayed.items() if k not in ('author','authors')},{k:v for k,v in credited.items() if k not in ('author','authors')})
        for bad in [dict(author='A <b>',names=['A']),dict(author='A',names=[]),dict(author='A',names=['A','A']),dict(author='A',names=['\\(x\\)']),
                    dict(author=' A',names=['A']),dict(author='A',names=['A'],extra=1),dict(author='A'),
                    dict(author='A',names=['A'],accounts={'A':'https://github.com/openai/math'}),dict(author='A',names=['A'],accounts={'B':'https://github.com/b'}),
                    dict(author='A',names=['A'],accounts=['https://github.com/a'])]:
            with self.subTest(credit=bad),self.assertRaises(r.Rejected):
                r.other_claims(credit_claims,{},{'direct-issue-80':dict(credit,credit=bad)})
        with self.assertRaises(r.Rejected):r.other_claims(credit_claims,{},{'direct-issue-80':dict(credit,authors=['not-the-submitter'],credit=shown['credit'])})
        # Big O board rows key their record posts by authors, so a credit there is refused.
        with self.assertRaises(r.Rejected):
            r.row_for('direct-issue-5',dict(route='issue',item=self.issue(),submission=d.parse_body(self.issue()['body'])),'2026-10-11T00:00:00Z',None,credit)
        # A display credit names a Big O row's authors too (Lead, 2026-11-07, verifier #183); a name links its account when the
        # credit names one, else it has no link (Lead, 2026-11-08); credited logins stay refused there.
        big=dict(route='issue',item=self.issue(),submission=d.parse_body(self.issue()['body']))
        row,meta,_=r.row_for('direct-issue-5',big,'2026-10-11T00:00:00Z',None,dict(text='x',credit=dict(author='A; B',names=['Halit Ziya KARTAL','MultiAgency swarm'],accounts={'Halit Ziya KARTAL':'https://github.com/HalitZiyaKARTAL'})))
        self.assertEqual(row['authors'],[dict(name='Halit Ziya KARTAL',url='https://github.com/HalitZiyaKARTAL'),dict(name='MultiAgency swarm')])
        self.assertEqual(meta['credit_note'],'x')
        plain_row=r.row_for('direct-issue-5',big,'2026-10-11T00:00:00Z')[0]
        self.assertEqual({k:v for k,v in row.items() if k!='authors'},{k:v for k,v in plain_row.items() if k!='authors'})
        for bad in [dict(text='x',credit=dict(author='A',names=[])),dict(text='x',authors=['x'],credit=shown['credit'])]:
            with self.subTest(note=bad),self.assertRaises(r.Rejected):r.row_for('direct-issue-5',big,'2026-10-11T00:00:00Z',None,bad)
        # A refile of another author's proof (Nil, 2026-11-09, ask 021e0e9f): the original author alone in the names, the
        # refiler line apart (Big O row metadata refiled_by, Other claim refiledBy). The refiler may not also be a name.
        refile=dict(text='x',credit=dict(author='Halit Ziya KARTAL',names=['Halit Ziya KARTAL'],refiledBy='Refiled by MultiAgency swarm'))
        row,meta,_=r.row_for('direct-issue-5',big,'2026-10-11T00:00:00Z',None,refile)
        self.assertEqual(([a['name'] for a in row['authors']],meta['refiled_by']),(['Halit Ziya KARTAL'],'Refiled by MultiAgency swarm'))
        self.assertNotIn('refiled_by',r.row_for('direct-issue-5',big,'2026-10-11T00:00:00Z',None,dict(text='x',credit=dict(author='A',names=['A'])))[1])
        ported=dict(credit,credit=dict(author='S. Litsey',names=['S. Litsey'],refiledBy='Ported by MultiAgency swarm'))
        claim=r.other_claims(credit_claims,{},{'direct-issue-80':ported})['other-snaky']['claims'][0]
        self.assertEqual((claim['author'],[a['name'] for a in claim['authors']],claim['refiledBy']),('S. Litsey',['S. Litsey'],'Ported by MultiAgency swarm'))
        self.assertNotIn('refiledBy',r.other_claims(credit_claims,{},{'direct-issue-80':shown})['other-snaky']['claims'][0])
        from direct_note_rules import credit_ok
        for line,ok in [('Refiled by MultiAgency swarm',True),('Ported by MultiAgency swarm',True),('Refiled by Halit Ziya KARTAL',False),
                        ('By MultiAgency swarm',False),('Refiled by ',False),('Refiled by <b>x</b>',False),(' Refiled by x',False),(7,False)]:
            with self.subTest(line=line):self.assertEqual(credit_ok(dict(author='Halit Ziya KARTAL',names=['Halit Ziya KARTAL'],refiledBy=line)),ok)
        # Prime gaps (verifier #148): H_1 <= B, a whole number.
        gaps=dict(sub,problem='prime-gaps',bound='246')
        listed=r.other_claims({'direct-issue-90':dict(route='issue',item=self.issue(90),submission=gaps,verification=proof)},{},{})['other-prime-gaps']['claims']
        self.assertEqual((listed[0]['handle'],listed[0]['value'],listed[0]['display'],listed[0]['bound']),('direct-issue-90','246','246','H_1\\le 246'))
        self.assertIn('BigOSpeedrun.PrimeGaps.Bound (246)',listed[0]['proofScope'])
        # Heilbronn (verifier #105): a saving, higher is better. The shown value is rounded down, never up.
        heilbronn=dict(sub,problem='heilbronn-triangle',bound='2/100866719')
        listed=r.other_claims({'direct-issue-81':dict(route='issue',item=self.issue(81),submission=heilbronn,verification=proof)},{},{})['other-heilbronn-triangle']['claims']
        self.assertEqual((listed[0]['value'],listed[0]['display'],listed[0]['bound']),
                         ('2/100866719','\\approx1.98281\\cdot10^{-8}','\\eta\\ge 1.98281\\cdot10^{-8}'))
        self.assertIn('BigOSpeedrun.HeilbronnTriangle.Bound (2/100866719)',listed[0]['proofScope'])
        self.assertEqual(r.display_down('1/50893237'),('1.96489\\cdot10^{-8}','\\approx1.96489\\cdot10^{-8}'))
        self.assertEqual(r.display_down('1/2'),('5\\cdot10^{-1}','5\\cdot10^{-1}'))
        self.assertEqual(r.display_down('1/9999999999999999999999999999999999999999')[0],'1\\cdot10^{-40}')
        self.assertEqual(r.display_down('1/100000000'),('1\\cdot10^{-8}','1\\cdot10^{-8}'))
        # darkhipo's comparator exponent 1/(100000 K), a 237-digit denominator (verifier #105): the row form.
        from math import comb
        q=100000*(comb(comb(163,41),3)**2+1)
        tiny=dict(sub,problem='heilbronn-triangle',bound=f'1/{q}')
        listed=r.other_claims({'direct-issue-82':dict(route='issue',item=self.issue(82),submission=tiny,verification=proof)},{},{})['other-heilbronn-triangle']['claims']
        shown=r.display_down(f'1/{q}')[0]
        self.assertTrue(shown.endswith('\\cdot10^{-237}') and shown.startswith('7.'),shown)
        self.assertEqual((listed[0]['value'],listed[0]['display'],listed[0]['bound']),(f'1/{q}','\\approx'+shown,'\\eta\\ge '+shown))
        # No board row for it, and prepare writes the file.
        temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup);root=Path(temp.name)
        # Committed board snapshots, not the live boards, which the hourly refresh changes.
        fixtures=json.loads((ROOT/'direct-fixtures/board-snapshots.json').read_text())
        for slug in r.SLUGS.values():(root/(slug+'.json')).write_bytes(r.json_bytes(fixtures[slug]))
        (root/'registry.json').write_bytes(r.json_bytes({'checked_at':'2026-10-10','updated_at':'2026-10-10T00:00:00Z'}))
        (root/'direct-trust.json').write_bytes((ROOT/'direct-trust.json').read_bytes())
        files=r.prepare(root,{'direct-issue-60':claims['direct-issue-60']},{},'2026-10-23T12:00:00Z',{},json.loads((ROOT/'direct-trust.json').read_text()))
        self.assertEqual(json.loads(files['direct-other.json'])['boards'],boards)
        for slug in r.SLUGS.values():
            if slug+'.json' in files:self.assertNotIn('direct-issue-60',files[slug+'.json'].decode())

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
