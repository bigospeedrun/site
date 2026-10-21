"""Offline checks for score safety and repeatable snapshot import."""
import contextlib, io, json, shutil, subprocess, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
import refresh

class RefreshTests(unittest.TestCase):
    def claim(self, files, claim=None, state='open', title='Conditional κ = 0.0017', on_main=False, owners=None, judge=None, lower=None, claims=None, leader=None):
        """Run package_claim on a fake PR 3200. files: {path: status}; claim: CLAIM.json object
        (claims: {path: object} when several differ); lower: {pr: {path: status}} of lower PRs;
        on_main: True, or the set of paths on main."""
        pr={'number':3200,'title':title,'body':'','state':state,'head':{'sha':'c'*40}}
        prs={3200:files,**(lower or {})}
        pulls_by_number={m:{'number':m,'head':{'sha':str(m)*10}} for m in prs}
        reads=[]
        def pages(path,*a):
            m=int(path.split('/')[-2]);reads.append(m)
            return [{'filename':f,'status':st} for f,st in prs[m].items()]
        def content(repo,path,sha):
            if sha=='m'*40:
                if on_main is True or (on_main and path in on_main):return b'{}'
                raise RuntimeError(f'GitHub GET failed: repos/{repo}/contents/{path} (HTTP 404)')
            self.assertEqual(sha,'c'*40)
            return json.dumps((claims or {}).get(path,claim)).encode()
        fetched={}
        files_of=lambda m:refresh.claim_files(m,pulls_by_number,{},fetched)
        with tempfile.TemporaryDirectory() as temp,patch.object(refresh,'pages',pages),patch.object(refresh,'content',content),patch.object(refresh.claim_judge,'check',lambda *a:judge):
            stage=Path(temp);(stage/'sources').mkdir()
            result=refresh.package_claim(stage,pr,'m'*40,owners or {},files_of,sorted((m for m in prs if m<3200),reverse=True),leader)
            saved=(stage/'sources/pr-3200-claim.json').exists()
        self.assertEqual(saved,result[0] is not None)
        self.reads=reads
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
        self.assertNotIn('body',index);self.assertEqual(index['base'],{'ref':full['base']['ref']})
        self.assertEqual(index['head'],{'sha':full['head']['sha']})
        self.assertEqual(refresh.pull_index(index|{'body':'x'}),index)

    def test_stacked_pr_owns_the_one_package_its_parents_do_not_add(self):
        # The 2026-10-17 stack: #3190 adds t740; #3198 adds r438-bit on top of it; #3200 adds
        # greedy-r438 on top of both. Each PR owns exactly one package.
        t740='research/rank7-idle-remainder-donors-t740/CLAIM.json'
        bit='research/rank7-idle-donors-r438-bit/CLAIM.json'
        greedy='research/rank7-idle-donors-greedy-r438/CLAIM.json'
        k={t740:{'kappa':'1733427/1000000000'},bit:{'kappa':'1734770/1000000000'},greedy:{'kappa':'1734807/1000000000'}}
        stack={t740:'added',bit:'added',greedy:'added'}
        score,path,reason=self.claim(stack,claims=k,lower={3198:{t740:'added',bit:'added'},3190:{t740:'added'},3150:{}})
        self.assertEqual((score,path,reason),('1734807/1000000000',greedy,None))
        # A listed parent counts through owners without a scan.
        self.assertEqual(self.claim(stack,claims=k,owners={t740:3190,bit:3198})[:2],('1734807/1000000000',greedy))
        # A merged parent's package is on main.
        self.assertEqual(self.claim({t740:'added',bit:'added'},claims=k,on_main={t740},lower={3190:{}})[:2],('173477/100000000',bit))
        # The scan stops at STACK_SCAN lower PRs; an unattributed second package goes to the lead.
        far={m:{} for m in range(3150,3200)}|{3100:{t740:'added'}}
        score,path,reason=self.claim({t740:'added',bit:'added'},claims=k,lower=far)
        self.assertEqual((score,path),(None,None));self.assertIn('no single own',reason)
        self.assertEqual(len(self.reads),1+refresh.STACK_SCAN)
        # A child that adds only its parent's package, while the parent is not listed yet
        # (queued or not read), does not get the parent's kappa (Worker 1 review).
        score,path,reason=self.claim({t740:'added'},claims=k,lower={3198:{},3190:{t740:'added'}})
        self.assertEqual((score,path),(None,t740));self.assertIn('belongs to PR #3190',reason)
        # Without a title kappa, a PR that only carries other PRs' packages is silently no claim.
        self.assertEqual(self.claim({t740:'added',bit:'added'},claims=k,title='CI fix-up',lower={3198:{t740:'added',bit:'added'}}),(None,None,None))
        # A PR that only re-adds other PRs' packages (#3093) is not a claim of theirs.
        score,path,reason=self.claim({t740:'added'},claims=k,lower={3190:{t740:'added'}},owners={t740:3190})
        self.assertEqual((score,path),(None,t740));self.assertIn('belongs to PR #3190',reason)

    def test_a_decided_pr_owns_the_package_with_the_decided_kappa(self):
        # #3251 (2026-10-17) carries #3200's and #3198's packages; both were listed by
        # decision, so refresh had no claim_path for them.
        p={'number':3200,'head':{'sha':'c'*40}}
        files=[['added','research/a/CLAIM.json'],['added','research/b/CLAIM.json'],['modified','research/c/CLAIM.json']]
        kappas={'research/a/CLAIM.json':'1/1000','research/b/CLAIM.json':'0.0017348','research/c/CLAIM.json':'0.0017348'}
        with patch.object(refresh,'content',lambda repo,path,sha:json.dumps({'kappa':kappas[path]}).encode()):
            self.assertEqual(refresh.decided_package(p,'8674/5000000',lambda m:files),'research/b/CLAIM.json')
            self.assertIsNone(refresh.decided_package(p,'1/7',lambda m:files))
            # A child approved at its parent's kappa does not take the parent's path.
            self.assertIsNone(refresh.decided_package(p,'8674/5000000',lambda m:files,{'research/b/CLAIM.json':3198}))
        head='h'*40
        decided={'pr_number':3200,'claim_path':'research/b/CLAIM.json','claim_head':head}
        q={'number':3200,'title':'t','body':'','head':{'sha':head}}
        self.assertEqual(refresh.claim_state(q,decided,{(3200,head):{'score':'1/2'}},lambda:self.fail('no read'))[2],'research/b/CLAIM.json')
        # A new head drops the old path; the next lookup finds the package again.
        self.assertIsNone(refresh.claim_state(q,decided|{'claim_head':'o'*40},{(3200,head):{'score':'1/2'}},lambda:self.fail('no read'))[2])

    def test_claim_files_are_read_once_per_head(self):
        pulls_by_number={7:{'number':7,'head':{'sha':'a'*40}}}
        prior={7:{'claim_files':[['added','research/x/CLAIM.json']],'claim_files_head':'a'*40}}
        with patch.object(refresh,'pages',lambda *a:self.fail('no read for a cached head')):
            self.assertEqual(refresh.claim_files(7,pulls_by_number,prior,{}),[['added','research/x/CLAIM.json']])
        # A retarget (new base, same head) reads the list again.
        with patch.object(refresh,'pages',lambda *a:[]):
            self.assertEqual(refresh.claim_files(7,{7:{'number':7,'head':{'sha':'a'*40},'base':{'ref':'main'}}},prior,{}),[])
        pulls_by_number[7]['head']['sha']='b'*40
        with patch.object(refresh,'pages',lambda *a:[{'filename':'research/y/CLAIM.json','status':'added'},{'filename':'research/y/README.md','status':'added'}]):
            self.assertEqual(refresh.claim_files(7,pulls_by_number,prior,{}),[['added','research/y/CLAIM.json']])

    def test_capped_file_list_goes_to_review(self):
        # CrocSwap #4085 (2026-10-19 16:17Z): 3039 files, GitHub lists 3000, the refresh
        # raised 'GitHub pagination limit reached'. Now the PR goes to the lead's queue.
        pr={'number':4085,'title':'Conditional κ = 0.0017309','body':'','state':'open','head':{'sha':'c'*40},'base':{'ref':'main'}}
        listed=[{'filename':f'research/x/f{i}.lean','status':'added'} for i in range(2999)]+[{'filename':'research/y/CLAIM.json','status':'modified'}]
        def pages(path,params=None,limit=30):
            data=[listed[i:i+100] for i in range(0,len(listed),100)]+[[]]
            self.assertGreater(limit,len(data)-1)  # The empty page after the cap ends the read.
            return [f for page in data[:limit] for f in page]
        fetched={}
        with patch.object(refresh,'pages',pages):
            files=refresh.claim_files(4085,{4085:pr},{},fetched)
        self.assertIsInstance(files,refresh.CappedFiles);self.assertEqual(files,[['modified','research/y/CLAIM.json']])
        reason=refresh.package_claim(None,pr,'m'*40,{},lambda m:files,[])
        self.assertEqual(reason[:2],(None,None));self.assertIn('3000 files',reason[2])
        # The cached list keeps the cap, with no new read.
        prior={4085:{'claim_files':list(files),'claim_files_head':'c'*40,'claim_files_base':'main','claim_files_capped':True,'claim_files_result':True}}
        with patch.object(refresh,'pages',lambda *a,**k:self.fail('no read for a cached head')):
            self.assertIsInstance(refresh.claim_files(4085,{4085:pr},prior,{}),refresh.CappedFiles)
        # One file fewer than the cap: a normal list.
        del listed[0]
        with patch.object(refresh,'pages',pages):
            self.assertNotIsInstance(refresh.claim_files(4085,{4085:pr},{},{}),refresh.CappedFiles)

    def test_title_only_kappa_at_or_below_the_leader_is_silent(self):
        # #3308 (2026-10-17): no CLAIM.json, title kappa 0.001673618490895016, below the leader.
        leader=refresh.Fraction('0.0017348157703850985634')
        def run(title,files=None,claim=None):
            with patch.object(refresh,'pages',lambda *a:[{'filename':f,'status':st} for f,st in (files or {}).items()]),\
                 patch.object(refresh,'content',lambda repo,path,sha:json.dumps(claim or {}).encode()),\
                 patch.object(refresh,'exists',lambda *a:False):
                pr={'number':3308,'title':title,'body':'','state':'open','head':{'sha':'c'*40}}
                return refresh.package_claim(None,pr,'m'*40,{},lambda m:refresh.claim_files(m,{3308:pr},{},{}),[],leader)
        self.assertEqual(run('Verified T16 packing gain with OR-Tools: conditional κ = 0.001673618490895016'),(None,None,None))
        self.assertEqual(run('κ = 1.7348157703850985634e-3: same point'),(None,None,None))
        # Above the leader, or a title the parser cannot read: still the lead's queue.
        self.assertIsNotNone(run('Conditional κ = 0.0017349: new words')[2])
        self.assertIsNotNone(run('kappa from 0.0017 to 0.0018')[2])
        self.assertIsNotNone(run('Kappa 0.1 budget screens')[2])
        # A touched CLAIM.json keeps the queue whatever the title value.
        other={'research/x/CLAIM.json':'modified'}
        self.assertIsNotNone(run('conditional κ = 0.0016',files=other,claim={'kappa':'1/1000'})[2])
        self.assertEqual(refresh.title_kappas('κ = 7.44714499357628·10⁻⁴ and kappa 1/1000'),[refresh.Fraction('7.44714499357628e-4'),refresh.Fraction(1,1000)])
        problem={'records':[{'id':'classical-baseline','score':'0'},{'id':'crocswap-pr-9','score':'1/2','upstream_status':'closed-unmerged'},
                            {'id':'crocswap-pr-10','score':'1/100','upstream_status':'open'},{'id':'repro','score':'1/3'}],
                 'record_metadata':{'repro':{'reproduction_of':'x'}}}
        self.assertEqual(refresh.board_leader(problem),refresh.Fraction(1,100))

    def test_silent_title_is_read_again_when_the_leader_falls_below_it(self):
        # #4076 (2026-10-19 14:17Z): title kappa 0.0017308090, read silent while the board
        # still showed #3959 at 0.0017367; the leader then fell to 0.0017305784.
        title='Conditional κ = 0.001730809033576552081734 (+1.458e-7 over #3945): three staged helper entries'
        head='9'*40;text=refresh.hashlib.sha256((title+'\n').encode()).hexdigest()
        p={'number':4076,'title':title,'body':'','state':'closed','merged_at':'2026-10-20T05:24:24Z','head':{'sha':head}}
        prior={'claimed_score':None,'claim_head':head,'claim_text':text,'upstream_status':'merged','claim_files_result':True}
        calls=[]
        def evaluate():
            calls.append(1);return None,None,'The PR adds no single own research package CLAIM.json.'
        old,new=refresh.Fraction('0.0017367386510889'),refresh.Fraction('0.0017305784372662468')
        self.assertIsNone(refresh.claim_state(p,prior,{},evaluate,old)[1]);self.assertEqual(calls,[])
        self.assertIsNotNone(refresh.claim_state(p,prior,{},evaluate,new)[1]);self.assertEqual(calls,[1])
        # A closed unmerged PR stays silent.
        self.assertIsNone(refresh.claim_state(p|{'merged_at':None},prior|{'upstream_status':'closed-unmerged'},{},evaluate,new)[1]);self.assertEqual(calls,[1])

    def test_result_json_conditional_kappa_is_the_package_without_a_claim_json(self):
        # Lead ruling 2026-10-20: the staged544 chain (#3945..#4181) states its value as
        # conditional_kappa in RESULT.json and has no CLAIM.json. Real #4181 value.
        own='research/staged544-pooled-ceiling-fill/RESULT.json'
        exact='17309802559890369599619999999999999999999998999999999999999999999999/10000000000000000000000000000000000000000000000000000000000000000000000'
        title='Conditional κ = 0.001730980255989036959962 (+1.140e-9 over #4088)'
        score,path,reason=self.claim({own:'added'},{'status':'AUTHOR_CHECKED_FINITE_CONDITIONAL_CONSTRUCTION','conditional_kappa':exact},title=title)
        self.assertEqual((score,path,reason),(str(refresh.Fraction(exact)),own,None))
        # A RESULT.json without conditional_kappa (#4091) leaves the PR to the other rules.
        self.assertEqual(self.claim({own:'added'},{'status':'PASS_EXACT_POOLED_PATTERN_OPTIMUM'},title='Prove the sharp pooled optimum'),(None,None,None))
        self.assertEqual(self.claim({own:'added'},{'no_new_kappa':True},title='κ = 0.0016 audit',leader=refresh.Fraction('0.0017'))[:2],(None,None))
        # A stacked child carries its parent's RESULT.json (#4100 on #4088): not its package.
        parent='research/staged544-mixed-fourth-entry/RESULT.json'
        self.assertEqual(self.claim({parent:'added'},{'conditional_kappa':exact},title='Propose unconditional κ = 0.0017309791',lower={3199:{parent:'added'}})[:2],(None,None))
        # An own CLAIM.json comes first; a bad conditional_kappa goes to the lead.
        self.assertEqual(self.claim({own:'added','research/x/CLAIM.json':'added'},claims={'research/x/CLAIM.json':{'kappa':'1/1000'},own:{'conditional_kappa':exact}},title='κ = 0.001')[:2],('1/1000','research/x/CLAIM.json'))
        score,path,reason=self.claim({own:'added'},{'conditional_kappa':'0.00173 approx'},title=title)
        self.assertEqual((score,path,reason),(None,own,f'{own} conditional_kappa is not an exact rational.'))

    def test_a_result_json_kappa_field_equal_to_the_title_kappa_lists(self):
        # Lead, 2026-10-21: the 1337isnot1337 packages (#4405-#4441) state their value outside
        # conditional_kappa. A kappa field equal to a title kappa exactly is the package value.
        top='research/query-thinned-controllers/RESULT.json'
        self.assertEqual(self.claim({top:'added'},{'kappa':'37/12500'},title='Conditional κ = 0.00296 via query-thinned productive controllers')[:3],
                         ('37/12500',top,None))
        nested='research/pr4359-p7-padding/RESULT.json'
        self.assertEqual(self.claim({nested:'added'},{'endpoint':{'kappa':'268647/100000000'}},title='Conditional κ = 0.00268647 via paid target padding')[:2],
                         ('268647/100000000',nested))
        refill='research/pr4359-compiler-refill/RESULT.json'
        self.assertEqual(self.claim({refill:'added'},{'endpoint_refill':{'kappa':'230509/100000000'}},title='Refine PR4359: conditional κ = 0.00230509')[:2],
                         ('230509/100000000',refill))
        # #4441: two own packages, one matches the title; the other states only kappa_decimal.
        thinned,boundary='research/fresh-helper-thinned/RESULT.json','research/fresh-helper-boundary/RESULT.json'
        claims={thinned:{'kappa':'60021/20000000','kappa_decimal':'0.00300105'},boundary:{'kappa_decimal':'0.00272124'}}
        self.assertEqual(self.claim({boundary:'added',thinned:'added'},claims=claims,title='Conditional κ = 0.00300105 (+4.105e-5 over #4440)')[:2],
                         ('60021/20000000',thinned))
        # A value the title does not state, or two files that match: the lead's queue as before.
        score,path,reason=self.claim({top:'added'},{'kappa':'37/12500'},title='Conditional κ = 0.0030 via query thinning')
        self.assertEqual((score,path),(None,None));self.assertIsNotNone(reason)
        two={thinned:{'kappa':'60021/20000000'},boundary:{'endpoint':{'kappa':'60021/20000000'}}}
        self.assertEqual(self.claim({boundary:'added',thinned:'added'},claims=two,title='κ = 0.00300105')[0],None)
        # No kappa in the title: unchanged (silent), and a Claude disagreement still goes to the lead.
        self.assertEqual(self.claim({top:'added'},{'kappa':'37/12500'},title='Query-thinned productive controllers'),(None,None,None))
        self.assertEqual(self.claim({top:'added'},{'kappa':'37/12500'},title='κ = 0.00296',judge='Claude reads no claim.')[2],'Claude reads no claim.')

    def test_a_zero_denominator_never_fails_the_refresh(self):
        # Reviewer, 2026-10-21: Fraction('1/0') raises. A contributor's "1/0" is no value.
        top='research/x/RESULT.json'
        for zero in ['1/0','1/00','0/0']:
            with self.subTest(zero=zero):
                self.assertEqual(self.claim({top:'added'},{'kappa':zero},title='Query thinning')[:2],(None,None))
                self.assertEqual(self.claim({top:'added'},{'endpoint':{'kappa':zero}},title='κ = 0.003')[0],None)
                score,path,reason=self.claim({'research/x/CLAIM.json':'added'},{'kappa':zero})
                self.assertEqual((score,reason),(None,f'research/x/CLAIM.json kappa is not an exact rational.'))
                self.assertEqual(self.claim({top:'added'},{'conditional_kappa':zero})[2],'research/x/RESULT.json conditional_kappa is not an exact rational.')
                with patch.object(refresh,'content',lambda repo,p,sha:json.dumps({'kappa':zero}).encode()):
                    self.assertIsNone(refresh.decided_package({'number':1,'head':{'sha':'c'*40}},'1/2',lambda m:[['added',top]]))
        self.assertFalse(refresh.claim_judge.agrees('1/0','1/2'));self.assertFalse(refresh.claim_judge.agrees('κ = 1/00','1/2'))
        self.assertIsNotNone(refresh.EXACT_RATIONAL.fullmatch('7/010'))  # a padded nonzero denominator is fine

    def test_claim_state_turns_an_unexpected_package_error_into_a_reason(self):
        # Lead belt, 2026-10-21: a bad package value can never fail the hourly refresh.
        p={'number':4500,'title':'κ = 0.003','body':'','head':{'sha':'d'*40}}
        def boom(error):
            def evaluate():raise error
            return evaluate
        score,reason,*_=refresh.claim_state(p,{},{},boom(ZeroDivisionError('x')))
        self.assertEqual((score,reason),(None,'Reading the PR package failed (ZeroDivisionError); review required.'))
        score,reason,*_,retry,decision=refresh.claim_state(p,{},{},boom(RuntimeError('GitHub GET failed (HTTP 502)')))
        self.assertIsNone(score);self.assertIsInstance(reason,refresh.claim_judge.Retry);self.assertTrue(retry)

    def test_a_decided_result_json_binds_its_nested_value(self):
        path='research/pr4359-p6-fresh/RESULT.json'
        pr={'number':4414,'head':{'sha':'c'*40}}
        with patch.object(refresh,'content',lambda repo,p,sha:json.dumps({'endpoint':{'kappa':'267987/100000000'}}).encode()):
            self.assertEqual(refresh.decided_package(pr,'267987/100000000',lambda m:[['added',path]]),path)
            self.assertIsNone(refresh.decided_package(pr,'1/2',lambda m:[['added',path]]))

    def test_silent_pr_is_read_once_more_for_result_json(self):
        # #4088 and #4091 were read silent before RESULT.json support: read once more, from #3945 on.
        head='8'*40;title='Improve conditional κ with a mixed fourth staged entry (+8.696e-9)'
        text=refresh.hashlib.sha256((title+'\n').encode()).hexdigest()
        p={'number':4088,'title':title,'body':'','state':'closed','merged_at':'2026-10-20T05:28:21Z','head':{'sha':head}}
        prior={'claimed_score':None,'claim_head':head,'claim_text':text,'upstream_status':'merged','claim_files':[],'claim_files_head':head}
        calls=[]
        def evaluate():calls.append(1);return '1/500',None,None
        self.assertEqual(refresh.claim_state(p,prior,{},evaluate)[0],'1/500');self.assertEqual(calls,[1])
        self.assertIsNone(refresh.claim_state(p,prior|{'claim_files_result':True},{},evaluate)[0]);self.assertEqual(calls,[1])
        self.assertIsNone(refresh.claim_state(p|{'number':3944},prior,{},evaluate)[0]);self.assertEqual(calls,[1])
        # The cached file list is read again too, and the new list keeps the marker.
        pulls={4088:{'number':4088,'head':{'sha':head},'base':{'ref':'main'}}}
        with patch.object(refresh,'pages',lambda *a:[{'filename':'research/s/RESULT.json','status':'added'},{'filename':'research/s/inputs/PR1-CLAIM.json','status':'added'}]):
            self.assertEqual(refresh.claim_files(4088,pulls,{4088:prior|{'claim_files_base':'main'}},{}),[['added','research/s/RESULT.json']])
        with patch.object(refresh,'pages',lambda *a:self.fail('no read for a marked cache')):
            self.assertEqual(refresh.claim_files(4088,pulls,{4088:prior|{'claim_files_base':'main','claim_files_result':True}},{}),[])

    def test_unreadable_package_is_retried(self):
        # 2026-10-18 10:17Z: the offline refresh test read a CLAIM.json that its mock 404s,
        # and package_claim raised. A 404 on the package is now a retry, not a crash.
        own='research/x/CLAIM.json'
        pr={'number':3200,'title':'Conditional κ = 0.0018','body':'','state':'open','head':{'sha':'c'*40}}
        def gone(repo,path,sha):raise RuntimeError(f'GitHub GET failed: repos/{repo}/contents/{path} (HTTP 404)')
        with patch.object(refresh,'content',gone),patch.object(refresh,'exists',lambda *a:False):
            score,path,reason=refresh.package_claim(None,pr,'m'*40,{},lambda m:[['added',own]],[])
            self.assertEqual((score,path),(None,own));self.assertIsInstance(reason,refresh.claim_judge.Retry)
            self.assertEqual(refresh.package_claim(None,pr|{'title':'tooling'},'m'*40,{},lambda m:[['modified',own]],[]),(None,None,None))

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
        # A judge failure does not stick: the next run reads the PR again. Meanwhile a
        # row listed by an earlier agreement keeps its score (it does not leave the board).
        failed=(None,'research/x/CLAIM.json',refresh.claim_judge.Retry('The Claude check failed (TimeoutError).'))
        state=refresh.claim_state(p,prior|{'claim_text':'old'},{},evaluate(failed))
        self.assertTrue(state[5]);self.assertEqual(state[0],'9/5000')
        deferred=(None,'research/x/CLAIM.json',refresh.claim_judge.Deferred('The Claude check waits for the next run (5 calls per run).'))
        self.assertEqual(refresh.claim_state(p,prior|{'claim_text':'old'},{},evaluate(deferred))[0],'9/5000')
        # A PR never listed gets no row while its check waits.
        self.assertIsNone(refresh.claim_state(p,{},{},evaluate(failed))[0])
        retry_prior=prior|{'review_reason':state[1],'claim_retry':True}
        self.assertEqual(refresh.claim_state(p,retry_prior,{},evaluate(listed))[0],'9/5000');self.assertEqual(len(calls),5)
        # A decided head gets no package read and no Claude call.
        decided=refresh.claim_state(p,{},{(3200,head):{'score':None}},evaluate(listed))
        self.assertIsNone(decided[0]);self.assertTrue(decided[6]);self.assertEqual(len(calls),5)
        approved=refresh.claim_state(p,prior|{'claim_decided':True},{(3200,head):{'score':'1/2'}},evaluate(listed))
        self.assertEqual(approved[0],'1/2');self.assertEqual(len(calls),5)
        # Deleting a decision revokes it: the PR is read again, and a judge failure then
        # does not keep the decided score.
        decided_prior=prior|{'claimed_score':'1/2','claim_decided':True}
        self.assertEqual(refresh.claim_state(p,decided_prior,{},evaluate(listed))[0],'9/5000');self.assertEqual(len(calls),6)
        self.assertIsNone(refresh.claim_state(p,decided_prior,{},evaluate(failed))[0])
        # A closed unmerged queued PR is not read again (the queue hides it).
        n_calls=len(calls)
        closed=prior|{'claimed_score':None,'review_reason':'r','upstream_status':'closed-unmerged'}
        self.assertEqual(refresh.claim_state(p,closed,{},evaluate(listed))[1],'r');self.assertEqual(len(calls),n_calls)
        # A queued PR is read again each run (its file lists are cached).
        queued=prior|{'claimed_score':None,'review_reason':'The PR adds no single research package CLAIM.json.'}
        n_calls=len(calls)
        self.assertEqual(refresh.claim_state(p,queued,{},evaluate(listed))[0],'9/5000');self.assertEqual(len(calls),n_calls+1)
        self.assertEqual(refresh.claim_state(p,queued|{'claim_files_head':head},{},evaluate(listed))[0],'9/5000');self.assertEqual(len(calls),n_calls+2)
        # Title-parsed rows up to #3114 keep their scores; later ones are read again.
        old_p=p|{'number':3051}
        self.assertEqual(refresh.claim_state(old_p,{'source_commit':head,'claimed_score':'1/7'},{},evaluate(listed))[0],'1/7')
        self.assertEqual(refresh.claim_state(p|{'number':3115},{'source_commit':head,'claimed_score':'1/7'},{},evaluate((None,None,'no package')))[:2],(None,'no package'))

    def listing(self,stored,intake,full=None,updated=(),now='2026-10-18T05:17:00Z',fail=None,deleted=None,drop_body=None):
        """Run list_pulls on a temp stage: stored PR index, intake, the full API list, and
        the PRs the updated-desc listing returns (newest first)."""
        with tempfile.TemporaryDirectory() as temp:
            stage=Path(temp);(stage/'sources').mkdir()
            refresh.dump(stage,'sources/crocswap-pulls.json',[refresh.pull_index(p) for p in stored])
            refresh.dump(stage,'sources/intake.json',intake)
            for p in stored:
                if p['number']!=drop_body:refresh.dump(stage,f"sources/pr-{p['number']}.json",{'body':p['body']})
            calls=[]
            def pages(path,params=None,limit=30):
                calls.append(('full',limit))
                if fail:raise RuntimeError('GitHub pagination limit reached')
                return list(full)
            def api(path,params=None):
                if path.split('/')[-2]=='pulls':  # one PR: deleted ones answer 404
                    calls.append(('pr',int(path.split('/')[-1])))
                    if int(path.split('/')[-1]) in (deleted or ()):raise RuntimeError(f'GitHub GET failed: {path} (HTTP 404)')
                    return {}
                calls.append(('page',params['page']));self.assertEqual((params['sort'],params['direction']),('updated','desc'))
                return list(updated)[(params['page']-1)*100:params['page']*100]
            with patch.object(refresh,'pages',pages),patch.object(refresh,'api',api):
                pulls,info=refresh.list_pulls(stage,now)
        return pulls,info,calls

    def pr(self,n,updated,body='b'):
        return {'number':n,'html_url':f'u{n}','title':f't{n}','body':body,'state':'open','created_at':'2026-10-01T00:00:00Z','updated_at':updated,
                'closed_at':None,'merged_at':None,'user':{'login':'a','html_url':'ua'},'head':{'sha':str(n)*10},'base':{'ref':'main'}}

    def test_pr_listing_full_then_incremental(self):
        stored=[self.pr(n,'2026-10-17T10:00:00Z') for n in range(1,251)]
        # No watermark yet: one full listing; its page limit follows the stored count.
        pulls,info,calls=self.listing(stored,{},full=stored+[self.pr(251,'2026-10-18T05:00:00Z')])
        self.assertEqual(calls,[('full',2*250//100+refresh.FULL_MARGIN_PAGES)])
        self.assertEqual((len(pulls),info['pulls_watermark'],info['pulls_full_at'],info['pulls_incomplete']),(251,'2026-10-18T05:00:00Z','2026-10-18T05:17:00Z',None))
        # Same day: only the PRs updated since the watermark minus 1 hour, newest first.
        intake={'pulls_watermark':'2026-10-18T05:00:00Z','pulls_full_at':'2026-10-18T05:17:00Z'}
        edited=self.pr(7,'2026-10-18T05:40:00Z',body='edited')
        pulls,info,calls=self.listing(stored,intake,updated=[edited,self.pr(9,'2026-10-18T04:30:00Z'),self.pr(3,'2026-10-18T03:00:00Z')],now='2026-10-18T06:17:00Z')
        self.assertEqual(calls,[('page',1)])
        by={p['number']:p for p in pulls}
        self.assertEqual((len(pulls),by[7]['body'],by[8]['body']),(250,'edited','b'))  # PR 8 keeps its stored body
        self.assertEqual(info['pulls_watermark'],'2026-10-18T05:40:00Z')
        # A new UTC day reads the full list again.
        self.assertEqual(self.listing(stored,intake,full=stored,now='2026-10-19T00:17:00Z')[2][0][0],'full')

    def test_incremental_pages_until_the_watermark(self):
        stored=[self.pr(n,'2026-10-17T10:00:00Z') for n in range(1,301)]
        updated=[self.pr(n,'2026-10-18T05:59:00Z') for n in range(1,201)]+[self.pr(n,'2026-10-18T01:00:00Z') for n in range(201,301)]
        intake={'pulls_watermark':'2026-10-18T05:00:00Z','pulls_full_at':'2026-10-18T00:17:00Z'}
        self.assertEqual(self.listing(stored,intake,updated=updated)[2],[('page',1),('page',2),('page',3)])

    def test_incomplete_full_listing_alerts_and_keeps_the_index(self):
        stored=[self.pr(n,'2026-10-17T10:00:00Z') for n in range(1,101)]
        intake={'pulls_watermark':'2026-10-18T05:00:00Z','pulls_full_at':'2026-10-17T00:17:00Z'}
        pulls,info,calls=self.listing(stored,intake,full=stored[:-3])
        self.assertIn('misses 3 stored PRs (first #98)',info['pulls_incomplete']);self.assertEqual(len(pulls),100)
        self.assertEqual(info['pulls_full_at'],'2026-10-17T00:17:00Z')  # tried again next run
        pulls,info,calls=self.listing(stored,intake,fail=True)
        self.assertIn('page limit',info['pulls_incomplete']);self.assertEqual(len(pulls),100);self.assertEqual(calls[-1],('page',1))

    def test_deleted_pr_and_missing_body(self):
        # Worker 1 review: a PR GitHub deleted is recorded once, not flagged forever.
        stored=[self.pr(n,'2026-10-17T10:00:00Z') for n in range(1,101)]
        intake={'pulls_watermark':'2026-10-18T05:00:00Z','pulls_full_at':'2026-10-17T00:17:00Z'}
        pulls,info,calls=self.listing(stored,intake,full=stored[:-1],deleted={100})
        self.assertEqual((info['pulls_incomplete'],info['pulls_deleted'],len(pulls)),(None,[100],100))
        self.assertIn(('pr',100),calls)
        pulls,info,calls=self.listing(stored,intake|{'pulls_deleted':[100]},full=stored[:-1])
        self.assertNotIn(('pr',100),calls);self.assertIsNone(info['pulls_incomplete'])
        # A stored PR without its body file makes the incremental run read the full list.
        same_day={'pulls_watermark':'2026-10-18T05:00:00Z','pulls_full_at':'2026-10-18T00:17:00Z'}
        pulls,info,calls=self.listing(stored,same_day,full=stored,updated=[],drop_body=50)
        self.assertEqual(calls[-1][0],'full');self.assertEqual(len(pulls),100)

    def test_incremental_equals_full_on_a_replay(self):
        base=[self.pr(n,'2026-10-17T10:00:00Z') for n in range(1,151)]
        changed={5:self.pr(5,'2026-10-18T05:30:00Z',body='new'),151:self.pr(151,'2026-10-18T05:50:00Z')}
        truth=sorted({**{p['number']:p for p in base},**changed}.values(),key=lambda p:p['number'])
        full=self.listing(base,{},full=truth)[0]
        inc=self.listing(base,{'pulls_watermark':'2026-10-18T05:00:00Z','pulls_full_at':'2026-10-18T00:17:00Z'},
                         updated=sorted(changed.values(),key=lambda p:p['updated_at'],reverse=True)+[base[0]])[0]
        self.assertEqual([refresh.pull_index(p)|{'body':p['body']} for p in full],[refresh.pull_index(p)|{'body':p['body']} for p in inc])

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
            def api(path,params=None):
                if path.endswith('/pulls'):return []  # incremental listing: nothing updated
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
            with patch.object(refresh,'api',api),patch.object(refresh,'content',content),patch.object(refresh,'pages',lambda path,*a,**k:pulls if path.endswith('/pulls') else []):
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
        def api(path,params=None):
            if path.endswith('/pulls'):return []  # incremental listing: nothing updated
            repo='/'.join(path.split('/')[1:3]);suffix='__head.json' if '/commits/' in path else '__repo.json'
            return refresh.load(source,'sources/'+repo.replace('/','__')+suffix)
        def content(repo,path,sha):
            if path=='README.md':return (source/('sources/'+repo.replace('/','__')+'__README.md')).read_bytes()
            if path=='certificates/selected-result.json':return (source/f'sources/crocswap-selected-{sha}.json').read_bytes()
            # Offline: a package file (CLAIM.json, or RESULT.json since 2026-10-20) is a 404. A fresh
            # decision on a RESULT.json package reads it in decided_package (#4405/#4412/#4414, 2026-10-21).
            # The selected certificate can itself be a package file (#4359's research/kappa-rebuild/CLAIM.json,
            # selected 2026-10-21 19:10Z): serve it from its fixture before the package 404 rule.
            selected=source/f'sources/crocswap-selected-{sha}.json'
            if selected.exists() and json.loads(selected.read_text()).get('certificate')==path:
                return (source/f'sources/crocswap-certificate-{sha}.json').read_bytes()
            if path.endswith(('/CLAIM.json','/RESULT.json')):raise RuntimeError(f'GitHub GET failed: repos/{repo}/contents/{path} (HTTP 404)')
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
                # Offline and hermetic: no PR package is read here (package_claim has its own
                # tests), so whatever the committed data queues cannot reach the network mock.
                with patch.object(refresh,'package_claim',lambda *a,**k:(None,None,None)),patch.object(refresh,'ROOT',data),patch.object(refresh,'api',api),patch.object(refresh,'content',content),patch.object(refresh,'pages',lambda path,*a,**k:pulls if path.endswith('/pulls') else []),contextlib.redirect_stdout(io.StringIO()):
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
