"""Synthetic maintainer fixtures. These are not live proof receipts."""
import copy
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from types import SimpleNamespace
from maintainer_import import (validate_maintainer, apply_record, choose_receipt, collect_maintainer,
                               encode, STATE)
from direct_import import Rejected, sha
from direct_refresh import Importer, transaction

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT/'direct-trust.json').read_text())
BINDING = CONFIG['maintainer_bindings']['dft-e8']
NOW = '2026-10-11T05:00:00Z'

def board_fixture(slug):
    return json.loads((ROOT/'direct-fixtures/board-snapshots.json').read_text())[slug]

def write_board_fixture(root,name):
    doc={'checked_at':'2026-10-10','updated_at':'2026-10-10T00:00:00Z'} if name=='registry.json' else board_fixture(name.removesuffix('.json'))
    (root/name).write_bytes(encode(doc))


def fixture(stage='lean', nanoda=None, binding=None):
    binding = copy.deepcopy(binding or BINDING)
    profile = binding['profile']; names = profile['theorem_names']
    run = dict(id=binding['run_id'], run_attempt=1, head_sha=binding['controller'], head_branch='main',
        repository=dict(full_name='bigospeedrun/verifier'), head_repository=dict(full_name='bigospeedrun/verifier'),
        path='.github/workflows/verify.yml', workflow_id=CONFIG['maintainer_workflow_id'],
        event='workflow_dispatch', status='in_progress' if stage=='lean' else 'completed',
        conclusion=None if stage=='lean' else 'success',
        html_url=f'https://github.com/bigospeedrun/verifier/actions/runs/{binding["run_id"]}')
    state = nanoda or ('pending' if stage=='lean' else 'passed')
    kernels = dict(lean=dict(status='passed', log='lean.log'), nanoda=dict(status=state, log='nanoda.log'))
    if state=='pending': kernels['nanoda']['reason']='advisory_queued'
    if state=='incomplete': kernels['nanoda']['reason']='out_of_memory'
    axioms=['propext','Classical.choice','Quot.sound']
    receipt=dict(schema_version=1, test_only=False, verification_stage=stage,
        verifier_commit=run['head_sha'], run_url=run['html_url'],
        profile=profile, request=dict(repo_url=binding['repo_url'],commit=binding['commit'],
            challenge_file=profile['challenge_file'],theorem_names=','.join(names),lean_toolchain=profile['lean_toolchain']),
        generated_challenge_sha256=profile['challenge_sha256'],theorem_names=names,
        finished_unix=1791694800, checked_at=NOW,kernels=kernels,
        axiom_audit=dict(status='passed',log='audit.log',reported_axioms={n:axioms for n in names}),
        theorems={n:dict(lean_kernel='passed',nanoda_kernel=state,reported_axioms=axioms) for n in names})
    if profile.get('solution_dependencies'):
        receipt['solution_dependencies']=copy.deepcopy(profile['solution_dependencies'])
    artifact=dict(id=123,expired=False,name=f'verifier-receipt-and-logs-{run["id"]}-1'+('-lean' if stage=='lean' else ''),
                  workflow_run=dict(id=run['id'],head_sha=run['head_sha']))
    return receipt,artifact,run,binding


def pack(receipt, artifact, damage=False, source_manifest=None):
    logs={x:('synthetic '+x).encode() for x in ['lean.log','nanoda.log','audit.log']}
    if receipt['profile'].get('solution_dependencies'):
        manifest = source_manifest if source_manifest is not None else {
            receipt['profile']['solution_module'].replace('.', '/')+'.lean':sha(b'synthetic main'),
            'FixedPointTheorems/brouwer.lean':sha(b'synthetic dependency'),
            'FixedPointTheorems.lean':sha(b'synthetic root module')}
        logs['source-sha256.json']=encode(manifest)
    receipt['artifact_sha256']={n:sha(raw) for n,raw in logs.items()}
    if damage: logs['lean.log']=b'changed'
    output=io.BytesIO()
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('receipt.json',encode(receipt))
        for n,raw in logs.items():z.writestr(n,raw)
    raw=output.getvalue();artifact['digest']='sha256:'+sha(raw)
    return raw


def check(receipt,artifact,run,binding,damage=False,source_manifest=None):
    return validate_maintainer(pack(receipt,artifact,damage,source_manifest),artifact,run,binding,CONFIG,
                              (ROOT/'direct-fixtures'/Path(binding['profile']['challenge_file']).name).read_bytes())


class MaintainerTests(unittest.TestCase):
    def test_early_and_final_acceptance(self):
        for stage in ['lean','final']:
            with self.subTest(stage=stage):
                verdict=check(*fixture(stage))
                self.assertEqual(verdict['decision'],'lean-verified')
                self.assertEqual(verdict['stage'],stage)

    def test_resource_incomplete_accepts_rejection_blocks_ambiguity_pending(self):
        for state,expected in [('incomplete','lean-verified'),('rejected','blocked'),('pending','pending')]:
            with self.subTest(state=state):self.assertEqual(check(*fixture('final',state))['decision'],expected)

    def test_identity_mismatches_reject(self):
        changes=[('id',1),('head_sha','a'*40),('workflow_id',1),('event','pull_request'),
                 ('head_branch','other'),('path','.github/workflows/submissions.yml'),
                 ('run_attempt',2),('html_url','https://example.com'),('status','queued'),
                 ('repository',{'full_name':'other/verifier'}),('head_repository',{'full_name':'other/verifier'})]
        for field,value in changes:
            with self.subTest(field=field):
                r,a,run,b=fixture();run[field]=value
                with self.assertRaises(Rejected):check(r,a,run,b)

    def test_exact_receipt_bindings(self):
        changes=[lambda r:r.update(test_only=True),lambda r:r.update(status='fixture_only'),
                 lambda r:r['request'].update(commit='a'*40),lambda r:r['request'].update(repo_url='https://github.com/other/repo'),
                 lambda r:r.update(profile={}),lambda r:r.update(verification_stage='final'),
                 lambda r:r.update(verifier_commit='b'*40),lambda r:r.update(run_url='https://example.com'),
                 lambda r:r.update(generated_challenge_sha256='f'*64),lambda r:r.update(theorem_names=['Race.bound']),
                 lambda r:r.update(checked_at='2026-10-10T05:00:00Z'),
                 lambda r:r['axiom_audit'].update(reported_axioms={}),
                 lambda r:r['axiom_audit']['reported_axioms'].update({BINDING['profile']['theorem_names'][0]:['sorryAx']})]
        for i,change in enumerate(changes):
            with self.subTest(change=i):
                r,a,run,b=fixture();change(r)
                with self.assertRaises(Rejected):check(r,a,run,b)

    def test_artifact_and_log_binding(self):
        r,a,run,b=fixture()
        with self.assertRaises(Rejected):check(r,a,run,b,damage=True)
        for field,value in [('name','wrong'),('expired',True),('workflow_run',{'id':0,'head_sha':run['head_sha']})]:
            r,a,run,b=fixture();a[field]=value
            with self.subTest(field=field),self.assertRaises(Rejected):check(r,a,run,b)

    def test_final_cannot_use_in_progress_run(self):
        r,a,run,b=fixture('final');run['status']='in_progress'
        with self.assertRaises(Rejected):check(r,a,run,b)

    def test_both_targets_and_per_target_status(self):
        r,a,run,b=fixture();r['theorems'].pop(b['profile']['theorem_names'][1])
        with self.assertRaises(Rejected):check(r,a,run,b)
        r,a,run,b=fixture();r['theorems'][b['profile']['theorem_names'][1]]['lean_kernel']='pending'
        self.assertEqual(check(r,a,run,b)['decision'],'pending')

    def test_record_pin_score_model_credit_and_priority(self):
        doc=board_fixture('exact-dft');before=copy.deepcopy(doc)
        verdict=check(*fixture());apply_record(doc,BINDING,verdict,'sources/example.json',NOW)
        row=next(r for r in doc['records'] if r['id']==BINDING['record_id'])
        old=next(r for r in before['records'] if r['id']==BINDING['record_id'])
        for field in ['authors','submitted_at','source_commit','score','source','artifact']:self.assertEqual(row[field],old[field])
        self.assertEqual(row['tier'],'verified')
        for field,value in [('source_commit','a'*40),('score','1/2'),('score_relation','strict-upper-bound')]:
            bad=copy.deepcopy(before);next(r for r in bad['records'] if r['id']==BINDING['record_id'])[field]=value
            with self.subTest(field=field),self.assertRaises(Rejected):apply_record(bad,BINDING,verdict,'sources/example.json',NOW)
        apply_record(doc,BINDING,check(*fixture('final','rejected')),'sources/example.json',NOW)
        self.assertEqual(row['tier'],'claimed');self.assertEqual(row['rerun_status']['state'],'failed')

    def test_final_supersedes_checkpoint_and_rejection_is_sticky(self):
        def option(stage,state,attempt=1):
            r,a,run,b=fixture(stage,state);verdict=check(r,a,run,b);run['run_attempt']=attempt
            return dict(run=run,artifact=a,verdict=verdict)
        early=option('lean','pending');final=option('final','rejected')
        self.assertIs(choose_receipt(early,[final]),final)
        self.assertIs(choose_receipt(final,[early,option('lean','pending',2)]),final)
        passed=option('final','passed')
        self.assertIs(choose_receipt(passed,[early]),passed)

    def test_controller_revisions_reviewed_and_unknown_content_rejected(self):
        class API:
            def __init__(self,blobs):self.blobs=blobs
            def json(self,*args):return {'truncated':False,'tree':[dict(path=p,type='blob',**v) for p,v in self.blobs.items()]}
        for rev,blobs in [(CONFIG['reviewed_commit'],CONFIG['controller_blobs']),
                          (BINDING['controller'],CONFIG['previous_controller_blobs'][BINDING['controller']]),
                          ('a1d7bae0657d2a9f32b087d09718ea4f71c10dfa',CONFIG['previous_controller_blobs']['a1d7bae0657d2a9f32b087d09718ea4f71c10dfa']),
                          ('ed049e9b9926929df9e20bcbc6e877ee20f41e38',CONFIG['previous_controller_blobs']['ed049e9b9926929df9e20bcbc6e877ee20f41e38']),
                          ('9b4b7bfc41c37ed37787be2e98401a952475370f',CONFIG['previous_controller_blobs']['9b4b7bfc41c37ed37787be2e98401a952475370f']),
                          ('fffb4102963b08366ca790110b3939d7dbba45bb',CONFIG['previous_controller_blobs']['fffb4102963b08366ca790110b3939d7dbba45bb'])]:
            self.assertIn(rev,Importer(API(blobs)).trusted(rev))
        bad=copy.deepcopy(CONFIG['controller_blobs']);bad['scripts/verifier.py']['sha']='a'*40
        with self.assertRaises(Rejected):Importer(API(bad)).trusted(CONFIG['reviewed_commit'])
        checkpoint_revision='9b4b7bfc41c37ed37787be2e98401a952475370f'
        for field,value in [('sha','a'*40),('mode','100755')]:
            bad=copy.deepcopy(CONFIG['previous_controller_blobs'][checkpoint_revision])
            bad['scripts/live_publish.py'][field]=value
            with self.subTest(field=field),self.assertRaises(Rejected):
                Importer(API(bad)).trusted(checkpoint_revision)
        retry_revision='fffb4102963b08366ca790110b3939d7dbba45bb'
        for path in ('scripts/submissions.py','scripts/pr_submissions.py'):
            for field,value in [('sha','a'*40),('mode','100755')]:
                bad=copy.deepcopy(CONFIG['previous_controller_blobs'][retry_revision])
                bad[path][field]=value
                with self.subTest(path=path,field=field),self.assertRaises(Rejected):
                    Importer(API(bad)).trusted(retry_revision)
        bad=copy.deepcopy(CONFIG['previous_controller_blobs'][retry_revision])
        bad['scripts/unreviewed.py']={'sha':'a'*40,'mode':'100644'}
        with self.assertRaises(Rejected):Importer(API(bad)).trusted(retry_revision)


    def test_matrix_pending_binding_never_admits_without_run(self):
        binding=copy.deepcopy(CONFIG['maintainer_bindings']['matrix-nine-fourths']);binding['run_id']=None
        with self.assertRaises(Rejected):check(*fixture(binding=binding))

    def test_matrix_pinned_dependency_and_target_acceptance(self):
        binding=copy.deepcopy(CONFIG['maintainer_bindings']['matrix-nine-fourths'])
        binding['run_id']=123456  # Synthetic run, never used by production.
        for stage in ['lean','final']:
            with self.subTest(stage=stage):self.assertEqual(check(*fixture(stage,binding=binding))['decision'],'lean-verified')
        for change in [lambda r:r.pop('solution_dependencies'),
                       lambda r:r['solution_dependencies'][0].update(commit='a'*40),
                       lambda r:r['solution_dependencies'][0].update(repo_url='https://github.com/other/repo')]:
            r,a,run,b=fixture(binding=binding);change(r)
            with self.assertRaises(Rejected):check(r,a,run,b)
        for sources in [{},{'OAI/LinearAlgebra/MatrixMultiplication/Main.lean':'a'*64},
                        {'FixedPointTheorems/brouwer.lean':'a'*64},
                        {'../brouwer.lean':'a'*64}]:
            with self.subTest(sources=sources),self.assertRaises(Rejected):
                check(*fixture(binding=binding),source_manifest=sources)

    def test_matrix_requires_exact_patch_metadata(self):
        binding=copy.deepcopy(CONFIG['maintainer_bindings']['matrix-nine-fourths']);binding['run_id']=123456
        dep=binding['profile']['solution_dependencies'][0]
        self.assertEqual(dep['patch_file'],'patches/openai-fd4aeeb-harfe-lean4341.patch')
        self.assertEqual(dep['patch_sha256'],'d70872e41e80b25191538d1659c4aa3a001349b5bd16f806c9e3833a502516e5')
        self.assertEqual(dep['patch_upstream_repo'],'https://github.com/openai/math')
        self.assertEqual(dep['patch_upstream_commit'],'fd4aeeb2ee4fc729c18d98444fed42fd0529eeeb')
        self.assertEqual(dep['patch_upstream_path'],'lean/patches/fixed-point-theorems-lean4341.patch')
        for field in ['patch_file','patch_sha256','patch_upstream_repo','patch_upstream_commit','patch_upstream_path']:
            for omit in [True,False]:
                r,a,run,b=fixture(binding=binding)
                if omit:r['solution_dependencies'][0].pop(field)
                else:r['solution_dependencies'][0][field]='wrong'
                with self.subTest(field=field,omit=omit),self.assertRaises(Rejected):check(r,a,run,b)
        r,a,run,b=fixture(binding=binding);r['profile']=copy.deepcopy(r['profile'])
        r['profile']['solution_dependencies'][0].pop('patch_sha256')
        with self.assertRaises(Rejected):check(r,a,run,b)

    def test_dependency_compilation_is_not_matrix_verification(self):
        binding=copy.deepcopy(CONFIG['maintainer_bindings']['matrix-nine-fourths'])
        r,a,run,b=fixture('final',binding=binding)
        run['path']='.github/workflows/check-matrix-dependency.yml'
        a['name']=f'dependency-compile-only-{run["id"]}-1'
        with self.assertRaises(Rejected):check(r,a,run,b)
        r,a,run,b=fixture('final',binding=binding);r['test_only']=True
        with self.assertRaises(Rejected):check(r,a,run,b)

    def test_matrix_existing_row_receives_only_its_evidence(self):
        binding=copy.deepcopy(CONFIG['maintainer_bindings']['matrix-nine-fourths']);binding['run_id']=123456
        doc=board_fixture(binding['board'].removesuffix('.json'));doc['records'].reverse()
        old=copy.deepcopy(next(r for r in doc['records'] if r['id']==binding['record_id']))
        verdict=check(*fixture(binding=binding))
        apply_record(doc,binding,verdict,'sources/example.json',NOW)
        row=next(r for r in doc['records'] if r['id']==binding['record_id'])
        self.assertEqual(row['tier'],'verified')
        self.assertEqual(row['authors'],old['authors']);self.assertEqual(row['score'],'9/4')
        self.assertEqual(row['submitted_at'],old['submitted_at'])
        self.assertEqual(row['evidence']['theorem'],'OAI.MatrixMultiplication.complex_omega_le_nine_quarters')

    def test_failed_matrix_audit_does_not_block_valid_dft(self):
        # Use a private pre-import snapshot, not a production receipt cache.
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            for name in ['exact-dft.json','matrix-multiplication.json','registry.json']:
                write_board_fixture(root,name)
            (root/'direct-fixtures').mkdir()
            for name in ['UniformFourierE8.lean','MatrixMultiplication.lean']:
                (root/'direct-fixtures'/name).write_bytes((ROOT/'direct-fixtures'/name).read_bytes())
            doc=json.loads((root/'exact-dft.json').read_text())
            row=next(r for r in doc['records'] if r['id']==BINDING['record_id'])
            row['tier']=doc['record_metadata'][row['id']]['site_tier']='claimed'
            row.pop('rerun_status',None)
            (root/'exact-dft.json').write_bytes(encode(doc))
            config=copy.deepcopy(CONFIG);config['maintainer_bindings']['matrix-nine-fourths']['run_id']=123456
            dft=fixture('final');matrix=fixture('final',binding=config['maintainer_bindings']['matrix-nine-fourths'])
            matrix[0]['axiom_audit'].update(status='not_completed_or_rejected',reported_axioms={})
            items={x[2]['id']:(x,pack(x[0],x[1])) for x in [dft,matrix]}
            def pages(path,**kwargs):
                return [items[int(path.split('/')[-2])][0][1]]
            api=SimpleNamespace(pages=pages)
            importer=SimpleNamespace(root=root,config=config,api=api,notes=[],trusted=lambda _:None,
                run=lambda run_id:items[run_id][0][2],
                artifact=lambda artifact:items[artifact['workflow_run']['id']][1])
            files=collect_maintainer(importer,{},NOW)
            self.assertIn('exact-dft.json',files)
            self.assertNotIn('matrix-multiplication.json',files)
            self.assertEqual(json.loads(files[STATE])['entries']['dft-e8']['verdict']['decision'],'lean-verified')
            self.assertTrue(any('matrix-nine-fourths: receipt not admitted' in note for note in importer.notes))
            # Binding order must not change isolation or erase the other receipt state.
            importer.config['maintainer_bindings']=dict(reversed(list(config['maintainer_bindings'].items())))
            self.assertEqual(collect_maintainer(importer,{},NOW),files)

    def test_transaction_cache_expiry_and_repeat(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            for name in ['exact-dft.json','registry.json']:write_board_fixture(root,name)
            (root/'direct-fixtures').mkdir();(root/'direct-fixtures/UniformFourierE8.lean').write_bytes((ROOT/'direct-fixtures/UniformFourierE8.lean').read_bytes())
            r,a,run,b=fixture();raw=pack(r,a)
            api=SimpleNamespace(pages=lambda *args,**kwargs:[a])
            config=copy.deepcopy(CONFIG);config['maintainer_bindings']={'dft-e8':config['maintainer_bindings']['dft-e8']}
            importer=SimpleNamespace(root=root,config=config,api=api,notes=[],trusted=lambda _:None,run=lambda _:run,artifact=lambda _:raw)
            files=collect_maintainer(importer,{},NOW)
            for path,content in files.items():
                target=root/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(content)
            self.assertEqual(collect_maintainer(importer,{},NOW),{})
            # Final real rejection replaces the cached checkpoint and its logs.
            r,a,run,b=fixture('final','rejected');raw=pack(r,a)
            files=collect_maintainer(importer,{},NOW)
            for path,content in files.items():(root/path).write_bytes(content)
            api.pages=lambda *args,**kwargs:[]
            self.assertEqual(collect_maintainer(importer,{},NOW),{})
            doc=json.loads((root/'exact-dft.json').read_text())
            self.assertEqual(next(x for x in doc['records'] if x['id']==b['record_id'])['tier'],'claimed')
            self.assertEqual(len(list((root/'sources').glob('*.zip'))),1)


if __name__=='__main__':unittest.main()
