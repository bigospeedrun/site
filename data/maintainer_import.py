"""Pinned maintainer receipts. Read GitHub data; never execute proof sources.

Bindings are reviewed site configuration, not workflow input. Each binding can
only change the evidence of one existing record with the same source and score.
The final receipt supersedes its Lean checkpoint, including after artifact expiry.
"""
import copy
import json
import re
import zipfile
from pathlib import Path
from direct_import import (REPOSITORY, Rejected, require, sha, read_json, is_test_submission,
                           validate_kernel_receipt, canonical)
from direct_pr import PREFIX, archive_members

WORKFLOW = '.github/workflows/verify.yml'
STATE = 'maintainer-receipts.json'


def encode(value):
    return (json.dumps(value, indent=2, ensure_ascii=False)+'\n').encode()


def statement_path(root, binding):
    """The vendored statement is named after the challenge file; two verifier profiles can share a file name,
    so a binding may name its own copy with statement_file."""
    return Path(root)/'direct-fixtures'/(binding.get('statement_file') or Path(binding['profile']['challenge_file']).name)


def validate_maintainer(raw, artifact, run, binding, config, statement):
    """API identity and exact proof inputs must agree before evidence is used."""
    require(type(binding.get('run_id')) is int and binding['run_id'] > 0, 'Maintainer run is not bound')
    revision = binding['controller']
    require(run.get('repository', {}).get('full_name') == REPOSITORY and
            run.get('head_repository', {}).get('full_name') == REPOSITORY, 'Wrong maintainer repository')
    require(run.get('id') == binding['run_id'] and run.get('head_sha') == revision,
            'Wrong maintainer run or controller')
    require(run.get('path') == WORKFLOW and run.get('workflow_id') == config['maintainer_workflow_id']
            and run.get('event') == 'workflow_dispatch' and run.get('head_branch') == config['branch'],
            'Wrong maintainer workflow identity')
    require(type(run.get('run_attempt')) is int and run['run_attempt'] > 0, 'Invalid run attempt')
    url = f'https://github.com/{REPOSITORY}/actions/runs/{run["id"]}'
    require(run.get('html_url') == url, 'Wrong maintainer run URL')
    name = f'verifier-receipt-and-logs-{run["id"]}-{run["run_attempt"]}'
    stage = 'lean' if artifact.get('name') == name+'-lean' else 'final'
    require(artifact.get('name') == name+('-lean' if stage == 'lean' else ''), 'Wrong maintainer artifact attempt')
    require(run.get('status') in (('in_progress', 'completed') if stage == 'lean' else ('completed',)),
            'Unfinished final maintainer run')
    require(artifact.get('workflow_run', {}).get('id') == run['id'] and
            artifact['workflow_run'].get('head_sha') == revision, 'Wrong maintainer artifact run')
    files = archive_members(raw, artifact)
    receipt = read_json(files['receipt.json'])
    require(not is_test_submission(receipt) and receipt.get('test_only') is False,
            'Test maintainer receipt stays off board')
    require(receipt.get('schema_version') == 1 and receipt.get('verification_stage') == stage,
            'Wrong maintainer receipt stage')
    profile = binding['profile']
    require(sha(statement) == profile['challenge_sha256'] and profile.get('saving', profile.get('bound')) == binding['score'],
            'Reviewed maintainer statement mismatch')
    require(receipt.get('profile') == profile, 'Wrong maintainer profile')
    expected = dict(repo_url=binding['repo_url'], commit=binding['commit'],
                    challenge_file=profile['challenge_file'], theorem_names=','.join(profile['theorem_names']),
                    lean_toolchain=profile['lean_toolchain'])
    require(receipt.get('request') == expected, 'Wrong maintainer proof source or request')
    require(receipt.get('verifier_commit') == revision and receipt.get('run_url') == url,
            'Wrong maintainer receipt provenance')
    require(receipt.get('generated_challenge_sha256') == profile['challenge_sha256'],
            'Wrong maintainer bound statement')
    hashes = receipt.get('artifact_sha256', {})
    logs = {v['log'] for v in receipt.get('kernels', {}).values() if v.get('log')}
    audit_log = receipt.get('axiom_audit', {}).get('log')
    if audit_log: logs.add(audit_log)
    require(isinstance(hashes, dict) and logs <= hashes.keys(), 'Unchecked maintainer logs')
    # A passing receipt must identify actual kernel and audit logs.
    require(receipt.get('kernels', {}).get('lean', {}).get('log') and audit_log,
            'Missing maintainer Lean/audit logs')
    for path, digest in hashes.items():
        require(path in files and sha(files[path]) == digest, 'Maintainer log hash mismatch')
    dependencies = profile.get('solution_dependencies', [])
    require(receipt.get('solution_dependencies', []) == dependencies, 'Maintainer dependency pin mismatch')
    if dependencies:
        require('source-sha256.json' in hashes, 'Missing hashed staged-source manifest')
        sources = read_json(files['source-sha256.json'])
        require(isinstance(sources, dict) and bool(sources), 'Empty staged-source manifest')
        roots = profile['source_roots'] + [root for dep in dependencies for root in dep['source_roots']]
        require(all(re.fullmatch(r'(?:[A-Za-z_][A-Za-z0-9_]*/)*[A-Za-z_][A-Za-z0-9_]*\.lean', path)
                    and path.split('/')[0].removesuffix('.lean') in roots and isinstance(digest, str)
                    and re.fullmatch('[0-9a-f]{64}', digest) for path, digest in sources.items()),
                'Invalid staged-source hashes')
        require(profile['solution_module'].replace('.', '/')+'.lean' in sources, 'Missing solution module hash')
        for dep in dependencies:
            # A root is a directory or a single module file (the roots check above allows both).
            require(all(any(path == root+'.lean' or path.startswith(root+'/') for path in sources) for root in dep['source_roots']),
                    'Missing staged dependency source hashes')
    decision, reason, checked_at = validate_kernel_receipt(receipt, profile['theorem_names'])
    return dict(decision=decision, reason=reason, checked_at=checked_at, stage=stage,
                receipt_url=url, receipt_sha256=sha(files['receipt.json']))


def apply_record(doc, binding, verdict, receipt_path, now):
    require(doc['problem_id'] == binding['problem_id'], 'Wrong maintainer board model')
    row = next((r for r in doc['records'] if r['id'] == binding['record_id']), None)
    require(row is not None and row.get('source_commit') == binding['commit'] and
            row['score'] == binding['score'] and row.get('score_relation', 'attained') == binding['score_relation'],
            'Maintainer receipt does not bind this board row')
    meta = doc['record_metadata'][row['id']]
    require(row.get('source', {}).get('url', '').startswith(binding['repo_url']+'/blob/'+binding['commit']+'/') and
            meta.get('comparison_key') == binding['problem_id']+'/v1', 'Maintainer source/model mismatch')
    previous = copy.deepcopy(doc)
    passed = verdict['decision'] == 'lean-verified'
    row['evidence']['theorem'] = '; '.join(binding['profile']['theorem_names'])
    row['tier'] = meta['site_tier'] = 'verified' if passed else 'claimed'
    row['rerun_status'] = dict(state='passed' if passed else 'failed' if verdict['decision'] == 'blocked' else 'pending',
                               checked_at=verdict['checked_at'], receipt_path=receipt_path)
    meta['receipt_url'] = verdict['receipt_url']
    meta['verification_source_commit'] = binding['commit']
    meta['proof_status'] = verdict['reason']
    if doc != previous:
        doc['updated_at'] = now
        doc['checked_at'] = now[:10]
    return doc


def choose_receipt(cached, candidates):
    """A final rejection is sticky; no late checkpoint can restore verification."""
    if cached and cached['verdict']['decision'] == 'blocked':
        return cached
    options = ([cached] if cached else []) + candidates
    return max(options, key=lambda x: (x['run']['run_attempt'], x['verdict']['stage'] == 'final',
                                       x['artifact']['id']), default=None)


def collect_maintainer(importer, files, now):
    """One invalid receipt must not prevent another board's valid update."""
    for key, binding in importer.config.get('maintainer_bindings', {}).items():
        isolated = copy.copy(importer)
        isolated.config = dict(importer.config, maintainer_bindings={key: binding})
        try:
            files = _collect_maintainer(isolated, dict(files), now)
        except (Rejected, KeyError, TypeError, ValueError, zipfile.BadZipFile) as error:
            importer.notes.append(f'Maintainer {key}: receipt not admitted; prior evidence retained: {error}')
    return files


def _collect_maintainer(importer, files, now):
    root, config = importer.root, importer.config
    if not config.get('maintainer_bindings'):
        return files
    state_path = root/STATE
    state = read_json(files[STATE]) if STATE in files else read_json(state_path.read_bytes()) if state_path.exists() else dict(schema_version=1, entries={})
    for key, binding in config['maintainer_bindings'].items():
        if binding.get('run_id') is None:
            importer.notes.append(f'Maintainer {key}: awaiting a reviewed run ID; no import attempted')
            continue
        # Same reviewed controller tree check as direct submissions; never trust
        # a receipt just because it names an approved SHA.
        importer.trusted(binding['controller'])
        statement = statement_path(root, binding).read_bytes()
        run = importer.run(binding['run_id'])
        require(run.get('head_sha') == binding['controller'], 'Maintainer controller changed')
        binding_hash = sha(canonical(binding).encode())
        cached = state['entries'].get(key)
        if cached:
            require(cached.get('binding_sha256') == binding_hash, 'Cached maintainer binding changed; review required')
            raw = (root/cached['archive_path']).read_bytes()
            # Cached artifact metadata records the API observation before expiry.
            verdict = validate_maintainer(raw, cached['artifact'], cached['run'], binding, config, statement)
            require(verdict == cached['verdict'], 'Cached maintainer verdict changed')
        candidates = []
        artifacts = importer.api.pages(PREFIX+f'actions/runs/{run["id"]}/artifacts', key='artifacts')
        name = f'verifier-receipt-and-logs-{run["id"]}-{run["run_attempt"]}'
        for artifact in artifacts:
            if artifact.get('expired') or artifact.get('name') not in (name, name+'-lean'):
                continue
            # A final artifact can appear just before GitHub completes the run.
            if artifact['name'] == name and run.get('status') != 'completed':
                continue
            raw = importer.artifact(artifact)
            verdict = validate_maintainer(raw, artifact, run, binding, config, statement)
            candidates.append(dict(run=run, artifact=artifact, verdict=verdict, raw=raw,
                                   binding_sha256=binding_hash))
        selected = choose_receipt(cached, candidates)
        if not selected:
            importer.notes.append(f'Maintainer {key}: no completed proof receipt; existing evidence unchanged')
            continue
        prefix = f'sources/maintainer-{key}-{binding["run_id"]}'
        receipt_path = prefix+'.json'
        archive_path = prefix+'.zip'
        verdict = selected['verdict']
        raw = selected.pop('raw', None)
        if raw is not None:
            files[archive_path] = raw  # Replace the checkpoint; do not keep both log sets.
        selected['archive_path'] = archive_path
        state['entries'][key] = selected
        witness = dict(binding=binding, run=selected['run'], artifact=selected['artifact'],
                       raw_receipt_sha256=verdict['receipt_sha256'])
        files[prefix+'-source.json'] = encode(witness)
        files[receipt_path] = encode(dict(schema_version=1, status='passed' if verdict['decision']=='lean-verified' else verdict['decision'],
            checked_at=verdict['checked_at'], description=verdict['reason'], receipt_url=verdict['receipt_url'],
            artifact_path=archive_path, artifact_sha256=selected['artifact']['digest'].removeprefix('sha256:'),
            source_receipt_path=prefix+'-source.json'))
        board = binding['board']
        doc = read_json(files[board] if board in files else (root/board).read_bytes())
        files[board] = encode(apply_record(doc, binding, verdict, receipt_path, now))
        importer.notes.append(f'Maintainer {key}: {verdict["stage"]}: {verdict["reason"]}')
    files[STATE] = encode(state)
    changed = {p:raw for p,raw in files.items() if not (root/p).exists() or (root/p).read_bytes()!=raw}
    if any(b['board'] in changed for b in config['maintainer_bindings'].values()):
        registry = read_json(changed['registry.json'] if 'registry.json' in changed else (root/'registry.json').read_bytes())
        registry.update(updated_at=now, checked_at=now[:10])
        changed['registry.json'] = encode(registry)
    return changed
