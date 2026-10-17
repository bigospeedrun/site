"""Offline direct-submission admission boundary. No network, writes or code execution.

Callers must obtain issue/run/artifact metadata from the GitHub API themselves.
The trust mapping is locally reviewed configuration, never artifact/issue input.
The hourly direct_refresh.py supplies the locally reviewed controller policy.
"""
import hashlib
import io
import json
import re
import zipfile
from datetime import datetime, timezone
from fractions import Fraction

REPOSITORY = 'bigospeedrun/verifier'
WORKFLOW = '.github/workflows/submissions.yml'
REUSABLE = '.github/workflows/submission-check.yml'
MAX_EVIDENCE_BYTES = 128_000_000
AXIOMS = {'propext', 'Classical.choice', 'Quot.sound'}
PROBLEMS = {'dft': ('exact-dft/uniform-exact-arithmetic', 1),
            '3sum': ('3sum/word-ram', 2), 'apsp': ('apsp/word-ram', 3)}
MAX_BYTES = 2_000_000

class Rejected(ValueError):
    """Identity or statement binding failed; never import this artifact."""

def require(condition, message):
    if not condition:
        raise Rejected(message)

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True)

def read_json(raw):
    require(len(raw) <= MAX_BYTES, 'JSON exceeds size limit')
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, 'Duplicate JSON key')
            result[key] = value
        return result
    try:
        return json.loads(raw, object_pairs_hook=unique)
    except (ValueError, UnicodeError) as error:
        raise Rejected('Invalid JSON') from error

def is_test_submission(github_item, *payloads):
    """Shared exclusion for issue/PR receipts and any future open-claim reader.

    GitHub labels must come from fresh API metadata. Test sources never produce
    a board row, including a Claimed row. Inspect known nested request/receipt
    containers because either route can propagate its test flag there.
    """
    labels = github_item.get('labels', [])
    if any((label.get('name', '') if isinstance(label, dict) else str(label)).strip().casefold() == 'test'
           for label in labels):
        return True
    def marked(value):
        if not isinstance(value, dict):
            return False
        return (value.get('test_only') is True or value.get('status') == 'fixture_only'
                or any(marked(value.get(key)) for key in
                       ('request', 'inputs', 'receipt', 'submission', 'direct_submission')))
    return any(marked(value) for value in (github_item, *payloads))

def normalize(value):
    fields = {'schema_version', 'problem', 'bound', 'repo_url', 'commit', 'authors'}
    require(isinstance(value, dict) and fields <= value.keys() and not value.keys()-fields-{'entrypoint'}, 'Invalid submission fields')
    require(type(value['schema_version']) is int and value['schema_version'] == 1, 'Unsupported submission schema')
    require(isinstance(value['problem'], str) and value['problem'] in PROBLEMS, 'Unsupported problem')
    require(isinstance(value['bound'], str) and re.fullmatch(r'(?:0|[1-9][0-9]{0,17})(?:/[1-9][0-9]{0,17})?', value['bound']), 'Invalid rational bound')
    bound = Fraction(value['bound'])
    require(0 <= bound <= PROBLEMS[value['problem']][1], 'Bound outside model range')
    require(isinstance(value['repo_url'], str) and re.fullmatch(r'https://github\.com/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}', value['repo_url']), 'Invalid source repository')
    require(isinstance(value['commit'], str) and re.fullmatch(r'[0-9a-f]{40}', value['commit']), 'Invalid source commit')
    authors = value['authors']
    require(isinstance(authors, list) and 0 <= len(authors) <= 30 and all(isinstance(a, str) and a.strip() and len(a) <= 120 and all(ord(c) >= 32 for c in a) for a in authors), 'Invalid authors')
    entrypoint = value.get('entrypoint', 'Race.bound')
    require(entrypoint in ('Race.bound', 'dft233'), 'Unsupported entrypoint')
    if entrypoint == 'dft233':
        require(value['problem'] == 'dft' and bound == Fraction('47171/62500000'), 'Legacy bound mismatch')
    result = dict(value, bound=str(bound))
    if entrypoint == 'Race.bound':
        result.pop('entrypoint', None)
    return result

def parse_body(body):
    require(isinstance(body, str) and len(body.encode()) <= 4096, 'Invalid issue form size')
    pattern = r'\A### Problem\n\n([^\n]+)\n\n### Repository URL\n\n([^\n]+)\n\n### Commit SHA\n\n([^\n]+)\n\n### Bound\n\n([^\n]+)\n?\Z'
    match = re.fullmatch(pattern, body.replace('\r\n', '\n'))
    require(match is not None, 'Invalid four-field issue form')
    problem, repo, commit, bound = match.groups()
    submission = normalize(dict(schema_version=1, problem=problem, repo_url=repo, commit=commit, bound=bound, authors=[]))
    require(submission['bound'] == bound, 'Bound must already be reduced')
    return submission

def checked_receipt(archive, metadata, env, run, revision):
    require(isinstance(archive, bytes) and len(archive) <= MAX_EVIDENCE_BYTES, 'Missing or oversized receipt archive')
    require(isinstance(metadata, dict), 'Missing receipt artifact metadata')
    suffix = '-lean' if env.get('verification_stage') == 'lean' else ''
    expected = dict(id=metadata.get('id'), name=f'verifier-receipt-and-logs-{run["id"]}-{run["run_attempt"]}-{env["issue_number"]}{suffix}',
                    digest='sha256:'+sha(archive), archive_url=f'https://github.com/{REPOSITORY}/actions/runs/{run["id"]}/artifacts/{metadata.get("id")}')
    require(type(metadata.get('id')) is int and not metadata.get('expired', True), 'Invalid receipt artifact')
    require(metadata.get('name') == expected['name'] and metadata.get('digest') == expected['digest'], 'Receipt artifact digest/name mismatch')
    require(metadata.get('workflow_run', {}).get('id') == run['id'] and metadata['workflow_run'].get('head_sha') == revision, 'Receipt artifact run mismatch')
    require(env.get('receipt_artifact') == expected and env.get('receipt_url') == expected['archive_url'], 'Receipt artifact envelope mismatch')
    try:
        with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
            names=zipped.namelist()
            require(len(names)==len(set(names)) and all(re.fullmatch(r'[A-Za-z0-9_.-]+', name) and name not in ('.','..') for name in names), 'Unsafe receipt archive members')
            require(sum(f.file_size for f in zipped.infolist()) <= MAX_EVIDENCE_BYTES, 'Expanded evidence too large')
            require('receipt.json' in names, 'Missing raw receipt')
            raw=zipped.read('receipt.json')
            receipt=read_json(raw)
            require(env.get('receipt_sha256')==sha(raw) and env.get('receipt')==receipt, 'Raw receipt hash/content mismatch')
            hashes=receipt.get('artifact_sha256', {})
            require(isinstance(hashes,dict), 'Invalid evidence hashes')
            required_logs={r['log'] for r in receipt.get('kernels',{}).values() if r.get('log')}
            if receipt.get('axiom_audit',{}).get('log'):required_logs.add(receipt['axiom_audit']['log'])
            require(required_logs <= hashes.keys(), 'Unchecked kernel/audit log')
            for name,digest in hashes.items():
                require(name in names and sha(zipped.read(name))==digest, 'Evidence log hash mismatch')
            return receipt
    except (zipfile.BadZipFile, RuntimeError) as error:
        raise Rejected('Invalid receipt archive') from error

def challenge_bytes(submission, base):
    if submission.get('entrypoint') == 'dft233':
        return base
    n, d = Fraction(submission['bound']).as_integer_ratio()
    if submission['problem'] == 'dft':
        target = f'''open OAI.PowerSaving Filter Asymptotics

theorem Race.bound : ∃ order solve W, DFTProgram order solve W ∧
    (fun n : ℕ => (W n : ℝ)) =O[atTop]
      (fun n : ℕ => (n : ℝ) * (Real.log (n : ℝ)) ^ (1 - ({n} : ℝ) / {d})) := by
  sorry
'''
    else:
        problem = 'ThreeSum' if submission['problem'] == '3sum' else 'APSP'
        target = f'theorem Race.bound : EndStatement.{problem}.SolvedInTime (({n} : Rat) / {d}) := by\n  sorry\n'
    return base + ('\n-- Big O Speedrun exact-bound target; generated from validated integers.\n' + target).encode()

def validate_result(archive, issue, run, artifact, trusted_revisions, *, receipt_archive=None, receipt_artifact=None, publisher=None):
    """Return a review candidate; even a pass does not establish credit or priority."""
    require(not is_test_submission(issue), 'Test-labeled submission stays off the board')
    require(len(archive) <= MAX_BYTES, 'Artifact exceeds size limit')
    require(artifact.get('digest') == 'sha256:' + sha(archive), 'Artifact digest mismatch')
    require(type(artifact.get('id')) is int and not artifact.get('expired', True), 'Invalid artifact identity')
    require(run.get('repository', {}).get('full_name') == REPOSITORY and run.get('head_repository', {}).get('full_name') == REPOSITORY, 'Untrusted run repository')
    revision = run.get('head_sha')
    require(revision in trusted_revisions, 'Unreviewed verifier revision')
    trust = trusted_revisions[revision]
    require(run.get('path') == WORKFLOW and run.get('workflow_id') == trust['workflow_id'], 'Workflow identity mismatch')
    early = publisher is not None
    require(run.get('head_branch') == trust['branch'] and run.get('event') in ('issues', 'schedule', 'workflow_dispatch') and run.get('status') in (('in_progress', 'completed') if early else ('completed',)), 'Untrusted or unfinished run')
    require(any(ref.get('path','').split('@')[0] == REPOSITORY+'/'+REUSABLE and ref.get('sha') == revision for ref in run.get('referenced_workflows', [])), 'Reusable workflow revision mismatch')
    run_id, attempt = str(run['id']), str(run['run_attempt'])
    run_url = f'https://github.com/{REPOSITORY}/actions/runs/{run_id}'
    require(run.get('html_url') == run_url, 'Run URL mismatch')
    if not early:
        require(artifact.get('name') == f'direct-submission-{run_id}-{attempt}-{issue["number"]}', 'Artifact attempt mismatch')
        require(artifact.get('workflow_run', {}).get('id') == run['id'] and artifact['workflow_run'].get('head_sha') == revision, 'Artifact run mismatch')
    try:
        with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
            name = f'direct-submission-{issue["number"]}-lean.json' if early else 'direct-submission.json'
            require(name in zipped.namelist() and len(zipped.namelist()) == len(set(zipped.namelist())), 'Unexpected artifact members')
            if not early: require(zipped.namelist() == [name], 'Unexpected artifact members')
            require(sum(x.file_size for x in zipped.infolist()) <= MAX_BYTES, 'Expanded artifact exceeds size limit')
            env = read_json(zipped.read(name))
    except (zipfile.BadZipFile, RuntimeError) as error:
        raise Rejected('Invalid artifact archive') from error
    require(isinstance(env, dict) and type(env.get('schema_version')) is int and env['schema_version'] == 1, 'Unsupported envelope')
    require(not is_test_submission(issue, env), 'Test submission stays off the board at every evidence level')
    if early:
        from direct_pr import validate_publisher_artifact
        validate_publisher_artifact(env, artifact, run, publisher, trusted_revisions)
        require(env.get('verification_stage') == 'lean' and env.get('receipt',{}).get('verification_stage') == 'lean', 'Missing early stage binding')
    else:
        require(env.get('verification_stage', 'final') == 'final' and env.get('receipt',{}).get('verification_stage', 'final') == 'final', 'Final artifact has early stage')
    receipt = env.get('receipt', {})
    require(isinstance(receipt, dict) and env.get('test_only') is False and env.get('importable') is True and env.get('status') != 'fixture_only' and not receipt.get('test_only'), 'Test replay is not importable')
    receipt = checked_receipt(receipt_archive, receipt_artifact, env, run, revision)
    require(env.get('run_id') == run_id and env.get('run_attempt') == attempt and env.get('run_url') == run_url and env.get('verifier_commit') == revision, 'Envelope run mismatch')
    # A closed issue keeps its result: the verifier closes an issue after its final
    # comment (Nil rule 2026-10-17). The body hash and identity below bind the input.
    require('pull_request' not in issue and issue.get('state') in ('open', 'closed') and issue.get('title', '').startswith('[Lean submission]'), 'Issue is not a submission')
    require(env.get('issue_number') == issue.get('number') and env.get('issue_url') == issue.get('html_url') == f'https://github.com/{REPOSITORY}/issues/{issue["number"]}', 'Issue identity mismatch')
    body = issue.get('body')
    require(isinstance(body, str) and len(body.encode()) <= 16000, 'Invalid issue body')
    require(env.get('issue_body_sha256') == sha(body.encode()), 'Exact issue body hash mismatch')
    require(env.get('issue_submitter_login') == issue.get('user', {}).get('login') and bool(env.get('issue_submitter_login')), 'Issue submitter mismatch')
    require(env.get('issue_created_at') == issue.get('created_at'), 'Issue creation identity mismatch')
    # Comments can change updated_at without changing the bound or source.
    # The raw body hash and normalized request below bind the actual input.
    submission = parse_body(body)
    # Reviewed legacy DFT profile proves the same fixed bound. The public form
    # cannot select it; only an authenticated trusted receipt can supply it.
    if env.get('submission', {}).get('entrypoint') == 'dft233':
        submission = normalize(dict(submission, entrypoint='dft233'))
    require(env.get('submission') == submission and env.get('submission_sha256') == sha(canonical(submission).encode()), 'Normalized submission mismatch')
    require(env.get('problem_id') == PROBLEMS[submission['problem']][0] and env.get('score_relation') == 'attained', 'Envelope model/relation mismatch')
    require(env.get('source_published_at') is None, 'Publication date needs independent review')
    require(env.get('workflow_conclusion') in (None, run.get('conclusion')) if early else env.get('workflow_conclusion') is None, 'Workflow conclusion mismatch')
    key = submission.get('entrypoint', submission['problem'])
    profile = trust['profiles'][key]
    base = trust['statements'][profile['challenge_file']]
    require(env.get('model_revision') == profile['upstream_commit'] and env.get('model_sha256') == profile['challenge_sha256'], 'Envelope model pin mismatch')
    require(env.get('theorem_names') == profile['theorem_names'], 'Envelope targets mismatch')
    require(env.get('challenge') == dict(file=profile['challenge_file'], sha256=profile['challenge_sha256'], upstream_commit=profile['upstream_commit'], generated_sha256=sha(challenge_bytes(submission, base))), 'Envelope challenge mismatch')
    decision, reason, checked_at = validate_proof(submission, receipt, trust, revision, run_url)
    require(env.get('checked_at') == checked_at, 'Envelope completion timestamp mismatch')
    return dict(decision=decision, reason=reason, id=f'direct-{issue["number"]}-{env["submission_sha256"]}',
                problem_id=PROBLEMS[submission['problem']][0], score=submission['bound'], score_relation='attained',
                source_commit=submission['commit'], source_url=submission['repo_url'], authors=submission['authors'],
                workflow_conclusion=run.get('conclusion'), issue_submitter=env['issue_submitter_login'], receipt_url=run_url, checked_at=checked_at,
                issue_created_at=issue.get('created_at'),
                issue_updated_at_at_verification=env.get('issue_updated_at'),
                issue_updated_at_at_import=issue.get('updated_at'),
                review_required=['authorship', 'first publication date', 'historical record eligibility'])


def validate_proof(submission, receipt, trust, revision, run_url):
    key = 'dft233' if submission.get('entrypoint') == 'dft233' else submission['problem']
    require(key in trust['profiles'], 'Unreviewed challenge profile')
    profile = trust['profiles'][key]
    require(receipt.get('profile') == profile, 'Trusted profile mismatch')
    base = trust['statements'][profile['challenge_file']]
    require(sha(base) == profile['challenge_sha256'], 'Trusted statement bytes mismatch')
    names = profile['theorem_names']
    expected = dict(direct_submission=submission, repo_url=submission['repo_url'], commit=submission['commit'], challenge_file=profile['challenge_file'], theorem_names=','.join(names), lean_toolchain=profile['lean_toolchain'])
    if 'source_subdir' in submission:
        expected['source_subdir'] = submission['source_subdir']
    require(receipt.get('request') == expected, 'Receipt request mismatch')
    require(receipt.get('verifier_commit') == revision and receipt.get('run_url') == run_url, 'Receipt provenance mismatch')
    require(receipt.get('generated_challenge_sha256') == sha(challenge_bytes(submission, base)), 'Exact bound statement mismatch')
    return validate_kernel_receipt(receipt, names)


def validate_kernel_receipt(receipt, names):
    """Shared Lean, permitted-axiom and advisory-kernel evidence policy."""
    require(receipt.get('theorem_names') == names and set(receipt.get('theorems', {})) == set(names), 'Missing or unexpected theorem targets')
    finished = receipt.get('finished_unix')
    require(type(finished) in (int, float), 'Missing completion timestamp')
    try:
        checked_at = datetime.fromtimestamp(finished, timezone.utc).isoformat().replace('+00:00', 'Z')
    except (ValueError, OverflowError, OSError) as error:
        raise Rejected('Invalid completion timestamp') from error
    require(receipt.get('checked_at') == checked_at, 'Completion timestamp mismatch')
    audit = receipt.get('axiom_audit', {})
    reported = audit.get('reported_axioms', {})
    require(set(reported) == set(names), 'Incomplete axiom audit')
    for name in names:
        axioms = reported[name]
        require(isinstance(axioms, list) and all(isinstance(a, str) for a in axioms) and set(axioms) <= AXIOMS, 'Unpermitted axioms')
        require(receipt['theorems'][name].get('reported_axioms') == axioms, 'Per-theorem axiom mismatch')
    kernels = receipt.get('kernels', {})
    lean = kernels.get('lean', {})
    nanoda = kernels.get('nanoda', {})
    nanoda_state = nanoda.get('status')
    decision, reason = 'pending', 'Verification incomplete or ambiguous'
    if nanoda_state == 'rejected' or any(receipt['theorems'][name].get('nanoda_kernel') == 'rejected' for name in names):
        decision, reason = 'blocked', 'Nanoda rejected the proof; escalate to Lead'
    elif lean.get('status') == 'passed' and audit.get('status') == 'passed' and all(receipt['theorems'][name].get('lean_kernel') == 'passed' for name in names):
        if receipt.get('verification_stage') == 'lean' and nanoda_state == 'pending' and nanoda.get('reason') == 'advisory_queued' and all(receipt['theorems'][name].get('nanoda_kernel') == 'pending' for name in names):
            decision, reason = 'lean-verified', 'Lean and permitted-axiom audit passed; nanoda advisory check pending'
        elif nanoda_state == 'passed' and all(receipt['theorems'][name].get('nanoda_kernel') == 'passed' for name in names):
            decision, reason = 'lean-verified', 'Lean and nanoda passed; permitted-axiom audit passed'
        elif nanoda_state == 'incomplete' and nanoda.get('reason') in ('out_of_memory', 'timeout', 'disk_limit', 'total_deadline') and all(receipt['theorems'][name].get('nanoda_kernel') == 'incomplete' for name in names):
            decision, reason = 'lean-verified', 'Lean and permitted-axiom audit passed; nanoda incomplete: ' + nanoda['reason']
    return decision, reason, checked_at


def current_record_gate(problem, data_bytes, site_commit, checked_at, exclude_issue_url=None):
    """Pure reference selector matching the site's board, for reviewed API snapshots."""
    require(problem in PROBLEMS and re.fullmatch(r'[0-9a-f]{40}', site_commit), 'Invalid board identity')
    data = read_json(data_bytes)
    require(data.get('problem_id') == PROBLEMS[problem][0], 'Board model mismatch')
    direction = 'higher-is-better' if problem == 'dft' else 'lower-is-better'
    require(data.get('score', {}).get('direction') == direction, 'Board score direction mismatch')
    candidates = []
    for record in data['records']:
        meta = data['record_metadata'][record['id']]
        if record['id'] == 'classical-baseline' or meta.get('reproduction_of'):
            continue
        if exclude_issue_url and record.get('submission_url') == exclude_issue_url:
            continue
        relation = record.get('score_relation', 'attained')
        require(relation in ('attained', 'strict-upper-bound'), 'Invalid board relation')
        key = (Fraction(record['score']), -1 if relation == 'strict-upper-bound' else 0)
        verified = (meta.get('site_tier') == 'verified' and record.get('rerun_status', {}).get('state') == 'passed'
                    and bool(record['rerun_status'].get('receipt_path')))
        candidates.append((key, record['id'], verified))
    require(bool(candidates), 'No board leader; do not guess')
    leader_key = (max if problem == 'dft' else min)(row[0] for row in candidates)
    leaders = [row for row in candidates if row[0] == leader_key]
    return dict(schema_version=1, problem_id=data['problem_id'], site_commit=site_commit,
                data_sha256=sha(data_bytes), checked_at=checked_at, direction=direction,
                score=str(leader_key[0]), score_relation='strict-upper-bound' if leader_key[1] == -1 else 'attained',
                leader_ids=sorted(row[1] for row in leaders), any_lean_verified_at_bound=any(row[2] for row in leaders))


def qualifies_for_run(submission, record_gate):
    """A tied bound qualifies until a matching leader is already Lean Verified."""
    require(record_gate.get('schema_version') == 1 and record_gate.get('problem_id') == PROBLEMS[submission['problem']][0], 'Record gate model mismatch')
    require(type(record_gate.get('any_lean_verified_at_bound')) is bool, 'Missing leader evidence')
    candidate = (Fraction(submission['bound']), 0)
    current = (Fraction(record_gate['score']), -1 if record_gate['score_relation'] == 'strict-upper-bound' else 0)
    if candidate == current:
        return not record_gate['any_lean_verified_at_bound']
    return candidate > current if submission['problem'] == 'dft' else candidate < current
