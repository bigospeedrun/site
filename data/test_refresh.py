"""Offline checks for score safety and repeatable snapshot import."""
import contextlib, io, json, shutil, subprocess, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
import refresh

class RefreshTests(unittest.TestCase):
    def claim(self, files, claim=None, state='open', title='Conditional κ = 0.0017', on_main=False, owners=None, judge=None):
        """Run package_claim on a fake PR. files: {path: status}; claim: CLAIM.json object."""
        pr={'number':3200,'title':title,'body':'','state':state,'head':{'sha':'c'*40}}
        def pages(path,*a):
            self.assertEqual(path,f'repos/{refresh.CROC}/pulls/3200/files')
            return [{'filename':f,'status':st} for f,st in files.items()]
        def content(repo,path,sha):
            if sha=='m'*40:
                if on_main:return b'{}'
                raise RuntimeError(f'GitHub GET failed: repos/{repo}/contents/{path} (HTTP 404)')
            self.assertEqual(sha,'c'*40)
            return json.dumps(claim).encode()
        with tempfile.TemporaryDirectory() as temp,patch.object(refresh,'pages',pages),patch.object(refresh,'content',content),patch.object(refresh.claim_judge,'check',lambda *a:judge):
            stage=Path(temp);(stage/'sources').mkdir()
            result=refresh.package_claim(stage,pr,'m'*40,owners or {})
            saved=(stage/'sources/pr-3200-claim.json').exists()
        self.assertEqual(saved,result[0] is not None)
        return result

    def test_package_claim(self):
        own='research/rank7-six-skip-cap-release/CLAIM.json'
        exact='17297379500642785512419999999999999999999998999999999999999999999999/10000000000000000000000000000000000000000000000000000000000000000000000'
        files={own:'added',own.replace('CLAIM.json','vendor/PR3042-CLAIM.json'):'added','research/other/CLAIM.json':'modified'}
        # The PR's own package states the exact kappa (#3051, 2026-10-16).
        score,path,reason=self.claim(files,{'kappa':exact,'status':'PASS'})
        self.assertEqual((path,reason),(own,None));self.assertEqual(score,str(refresh.Fraction(exact)))
        self.assertEqual(self.claim({own:'added'},{'kappa':'0.001672780159952542'})[0],'836390079976271/500000000000000000')
        # #3093 added #3042's package, already on main while #3093 was open.
        self.assertEqual(self.claim({own:'added'},{'kappa':exact},on_main=True)[:2],(None,own))
        self.assertIsNotNone(self.claim({own:'added'},{'kappa':exact},on_main=True)[2])
        # When first seen merged, ownership comes from the submissions that list the path.
        self.assertEqual(self.claim({own:'added'},{'kappa':exact},state='closed',owners={own:3051})[2],f'{own} belongs to PR #3051.')
        # #3107/#3111: no package. A title with a kappa value goes to the lead; others do not.
        self.assertEqual(self.claim({},title='Kappa 0.1 budget screens')[:2],(None,None))
        self.assertIsNotNone(self.claim({},title='Selected bit profile alone exceeds the κ=0.1 moment budget')[2])
        self.assertEqual(self.claim({},title='Implement aligned bit circuits'),(None,None,None))
        self.assertIsNone(self.claim({own:'added'},{'status':'no new kappa'},title='Audit restore skips')[2])
        self.assertIsNotNone(self.claim({own:'added'},{'status':'no new kappa'})[2])
        two={own:'added','research/second/CLAIM.json':'added'}
        self.assertEqual(self.claim(two,{'kappa':exact})[:2],(None,None))
        for bad in ['unchanged','No selected exponent change is claimed.',3,'1/1','0','2/3e5','1/'+'1'*4095]:
            score,path,reason=self.claim({own:'added'},{'kappa':bad})
            self.assertIsNone(score,bad);self.assertIsNotNone(reason,bad)
        self.assertEqual(self.claim({own:'added'},{'kappa':'1/'+'1'*4094})[0],'1/'+'1'*4094)
        # A structured claim that the Claude reading does not confirm goes to the lead.
        self.assertEqual(self.claim({own:'added'},{'kappa':exact},judge='Claude reads the PR text as no new kappa claim.'),
                         (None,own,'Claude reads the PR text as no new kappa claim.'))

    def test_pull_index_keeps_only_read_fields(self):
        full=json.loads(json.loads((refresh.ROOT/'direct-fixtures/refresh-snapshot.json').read_text())['sources/crocswap-pulls.json'])[0]
        index=refresh.pull_index(full)
        self.assertNotIn('body',index);self.assertNotIn('base',index)
        self.assertEqual(index['head'],{'sha':full['head']['sha']})
        self.assertEqual(refresh.pull_index(index|{'body':'x'}),index)

    def test_touched_claim_with_kappa_goes_to_review(self):
        other='research/rank7-restore-carrier-skips/CLAIM.json'
        # No title kappa, no own package, but it changes a package that states a kappa.
        self.assertIsNotNone(self.claim({other:'modified'},{'kappa':'1/1000'},title='Fix a checker')[2])
        self.assertEqual(self.claim({other:'modified'},{'status':'tooling'},title='Fix a checker'),(None,None,None))
        self.assertEqual(self.claim({other:'removed'},{'kappa':'1/1000'},title='Fix a checker'),(None,None,None))

    def test_names_kappa_routing(self):
        for t in ['κ = 0.0017','Kappa 0.1 budget screens','kappa from 0.00172 to 0.00173','kappa>=0.1','kappa ≥ 0.1',
                  'raise kappa of 0.0017','New record 0.001729','new best: 0.0017','research: κ = 0.001729737950064278551242895823']:
            self.assertTrue(refresh.NAMES_KAPPA.search(t),t)
        for t in ['Implement aligned bit circuits','Kappa-preserving refactor','rank-seven restore block']:
            self.assertFalse(refresh.NAMES_KAPPA.search(t),t)

    def test_claim_state(self):
        head='h'*40
        p={'number':3200,'title':'Conditional κ = 0.0018','body':'b','head':{'sha':head}}
        text=refresh.hashlib.sha256(b'Conditional \xce\xba = 0.0018\nb').hexdigest()
        calls=[]
        def evaluate(result):
            return lambda:(calls.append(1),result)[1]
        listed=('9/5000','research/x/CLAIM.json',None)
        # First read lists the package; the next run reuses it with no request.
        state=refresh.claim_state(p,{},{},evaluate(listed))
        self.assertEqual(state[:5],('9/5000',None,'research/x/CLAIM.json',head,text));self.assertFalse(state[5])
        prior={'pr_number':3200,'source_commit':head,'claimed_score':'9/5000','claim_path':'research/x/CLAIM.json','claim_head':head,'claim_text':text}
        self.assertEqual(refresh.claim_state(p,prior,{},evaluate(listed))[0],'9/5000');self.assertEqual(len(calls),1)
        # A judge failure does not stick: the next run reads the PR again.
        failed=(None,'research/x/CLAIM.json',refresh.claim_judge.Retry('The Claude check failed (TimeoutError).'))
        state=refresh.claim_state(p,prior|{'claim_text':'old'},{},evaluate(failed))
        self.assertTrue(state[5]);self.assertIsNone(state[0])
        retry_prior=prior|{'claimed_score':None,'review_reason':state[1],'claim_retry':True}
        self.assertEqual(refresh.claim_state(p,retry_prior,{},evaluate(listed))[0],'9/5000');self.assertEqual(len(calls),3)
        # A decision applies; deleting it revokes it (the PR is read again).
        decided=refresh.claim_state(p,{},{(3200,head):{'score':None}},evaluate(listed))
        self.assertIsNone(decided[0]);self.assertTrue(decided[6])
        decided_prior=prior|{'claimed_score':'1/2','claim_decided':True}
        self.assertEqual(refresh.claim_state(p,decided_prior,{},evaluate(listed))[0],'9/5000');self.assertEqual(len(calls),5)
        # Title-parsed rows up to #3114 keep their scores; later ones are read again.
        old_p=p|{'number':3051}
        self.assertEqual(refresh.claim_state(old_p,{'source_commit':head,'claimed_score':'1/7'},{},evaluate(listed))[0],'1/7')
        self.assertEqual(refresh.claim_state(p|{'number':3115},{'source_commit':head,'claimed_score':'1/7'},{},evaluate((None,None,'no package')))[:2],(None,'no package'))

    def test_score_limit_matches_schema(self):
        schema=json.loads((refresh.ROOT/'schemas/problem-v1.json').read_text())['properties']['records']['items']['properties']['score']
        self.assertEqual(schema['maxLength'],refresh.MAX_SCORE_CHARS)

    def test_snapshot_idempotence_and_selected_record(self):
        root=refresh.ROOT
        with tempfile.TemporaryDirectory(dir=refresh.git_state_dir()) as temp:
            stage=Path(temp)
            snapshot=json.loads((root/'direct-fixtures/refresh-snapshot.json').read_text())
            for rel,raw in snapshot.items():
                q=stage/rel;q.parent.mkdir(parents=True,exist_ok=True);q.write_text(raw)
            def api(path):
                repo='/'.join(path.split('/')[1:3]);suffix='__head.json' if '/commits/' in path else '__repo.json'
                result=refresh.load(stage,'sources/'+repo.replace('/','__')+suffix)
                if '/commits/' in path and repo==refresh.SWAP:
                    result['sha']='a'*40  # New upstream HEAD changes the shared manifest.
                if '/commits/' in path:
                    result.setdefault('files', []).append({'filename':'fixture.txt','patch':'unused diff text'})
                return result
            def content(repo,path,sha):
                if path=='README.md':return (stage/('sources/'+repo.replace('/','__')+'__README.md')).read_bytes()
                if path=='certificates/selected-result.json':return (stage/f'sources/crocswap-selected-{sha}.json').read_bytes()
                return (stage/f'sources/crocswap-certificate-{sha}.json').read_bytes()
            intake=refresh.load(stage,'sources/intake.json');intake.pop('fingerprint',None);refresh.dump(stage,'sources/intake.json',intake)
            registry=refresh.load(stage,'registry.json')
            swap=next(r for r in registry['repositories'] if r['repo']==refresh.SWAP)
            # Explicit fixture: a second listing pins this same source, regardless
            # of whether the live registry retains its historical alias.
            alias=json.loads(json.dumps(swap));alias['repo']='fixture/shared-manifest'
            registry['repositories'].append(alias);refresh.dump(stage,'registry.json',registry)
            pinned=dict(alias['manifest_source']);pinned_bytes=(stage/pinned['path']).read_bytes()
            pulls=refresh.load(stage,'sources/crocswap-pulls.json')
            with patch.object(refresh,'api',api),patch.object(refresh,'content',content),patch.object(refresh,'pages',lambda path,*a:pulls if path.endswith('/pulls') else []):
                first=refresh.refresh(stage,'2026-10-09T15:00:00Z')
                updated=refresh.load(stage,'registry.json')['repositories']
                updated_swap=next(r for r in updated if r['repo']==refresh.SWAP)
                updated_alias=next(r for r in updated if r['repo']=='fixture/shared-manifest')
                self.assertEqual(updated_alias['manifest_source'],pinned)
                self.assertEqual((stage/pinned['path']).read_bytes(),pinned_bytes)
                self.assertNotEqual(updated_swap['manifest_source']['path'],pinned['path'])
                self.assertIn('a'*40,refresh.load(stage,updated_swap['manifest_source']['path'])['rules_url'])
                for listing in updated:
                    manifest=listing['manifest_source']
                    if manifest:
                        self.assertEqual(manifest['revision'],'sha256:'+refresh.artifact(stage,manifest['path'])['sha256'])
                for head_path in (stage/'sources').glob('*__head.json'):
                    self.assertTrue(all('patch' not in f for f in json.loads(head_path.read_text()).get('files', [])))
                snapshot={p.relative_to(stage):p.read_bytes() for p in stage.rglob('*') if p.is_file()}
                second=refresh.refresh(stage,'2026-10-09T18:00:00Z')
                self.assertEqual(snapshot,{p.relative_to(stage):p.read_bytes() for p in stage.rglob('*') if p.is_file()})
                self.assertFalse(second['new_current_record'])
                problem=refresh.load(stage,'integer-multiplication.json')
                self.assertEqual(refresh.best(problem)['score'], first['current_record']['score'])
                for r in problem['records']:
                    if r['upstream_status'] in ('open','closed-unmerged'):
                        self.assertFalse(problem['record_metadata'][r['id']]['eligible_for_record'])
    def test_refresh_in_standalone_and_nested_repositories(self):
        source=refresh.ROOT
        # Hourly imports create receipt files before this test and before commit.
        # Copy those files too, because current board JSON already references them.
        tracked=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard'],cwd=source,text=True).splitlines()
        def api(path):
            repo='/'.join(path.split('/')[1:3]);suffix='__head.json' if '/commits/' in path else '__repo.json'
            return refresh.load(source,'sources/'+repo.replace('/','__')+suffix)
        def content(repo,path,sha):
            if path=='README.md':return (source/('sources/'+repo.replace('/','__')+'__README.md')).read_bytes()
            if path=='certificates/selected-result.json':return (source/f'sources/crocswap-selected-{sha}.json').read_bytes()
            return (source/f'sources/crocswap-certificate-{sha}.json').read_bytes()
        # The index omits PR bodies; the API returns them, so add them back from pr-<n>.json.
        pulls=[p|{'body':refresh.load(source,f"sources/pr-{p['number']}.json")['body']} for p in refresh.load(source,'sources/crocswap-pulls.json')]
        for nested in (False,True):
            with self.subTest(nested=nested),tempfile.TemporaryDirectory(dir=refresh.git_state_dir()) as temp:
                repo=Path(temp);data=repo/'data' if nested else repo;data.mkdir(exist_ok=True)
                for rel in tracked:
                    target=data/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source/rel,target)
                intake=refresh.load(data,'sources/intake.json');intake.pop('fingerprint',None);refresh.dump(data,'sources/intake.json',intake)
                def git(*args):return subprocess.run(['git',*args],cwd=repo,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
                git('init','-q');git('add','.')
                git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','fixture')
                if nested:
                    (repo/'unrelated.json').write_text('preserve me')
                    git('add','unrelated.json')
                with patch.object(refresh,'ROOT',data),patch.object(refresh,'api',api),patch.object(refresh,'content',content),patch.object(refresh,'pages',lambda path,*a:pulls if path.endswith('/pulls') else []),contextlib.redirect_stdout(io.StringIO()):
                    refresh.main()
                    summary=json.loads((repo/'.git/refresh-summary.json').read_text())
                    self.assertIn('registry.json',summary['changed_files'])
                    self.assertTrue(refresh.load(data,'registry.json')['updated_at'].endswith('Z'))
                    git('add','.')
                    git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','refresh')
                    refresh.main()
                    self.assertEqual(json.loads((repo/'.git/refresh-summary.json').read_text())['changed_files'],[])
                if nested:self.assertEqual((repo/'unrelated.json').read_text(),'preserve me')

if __name__=='__main__':unittest.main()
