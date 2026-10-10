"""Offline direct-submission admission boundary. No network, writes or code execution.

Callers must obtain issue/run/artifact metadata from the GitHub API themselves.
The trust mapping is locally reviewed configuration, never artifact/issue input.
No revisions are enabled here and this module is not wired into refresh.py.
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
    require(isinstance(authors, list) and 1 <= len(authors) <= 30 and all(isinstance(a, str) and a.strip() and len(a) <= 120 and all(ord(c) >= 32 for c in a) for a in authors), 'Invalid authors')
    entrypoint = value.get('entrypoint', 'Race.bound')
    require(entrypoint in ('Race.bound', 'dft233'), 'Unsupported entrypoint')
    if entrypoint == 'dft233':
        require(value['problem'] == 'dft' and bound == Fraction('47171/62500000'), 'Legacy bound mismatch')
    result = dict(value, bound=str(bound))
    if entrypoint == 'Race.bound':
        result.pop('entrypoint', None)
    return result

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

def validate_result(archive, issue, run, artifact, trusted_revisions):
    """Return a review candidate; even a pass does not establish credit or priority."""
    require(len(archive) <= MAX_BYTES, 'Artifact exceeds size limit')
    require(artifact.get('digest') == 'sha256:' + sha(archive), 'Artifact digest mismatch')
    require(type(artifact.get('id')) is int and not artifact.get('expired', True), 'Invalid artifact identity')
    require(run.get('repository', {}).get('full_name') == REPOSITORY and run.get('head_repository', {}).get('full_name') == REPOSITORY, 'Untrusted run repository')
    revision = run.get('head_sha')
    require(revision in trusted_revisions, 'Unreviewed verifier revision')
    trust = trusted_revisions[revision]
    require(run.get('path') == WORKFLOW and run.get('workflow_id') == trust['workflow_id'], 'Workflow identity mismatch')
    require(run.get('head_branch') == trust['branch'] and run.get('event') in ('issues', 'schedule', 'workflow_dispatch') and run.get('status') == 'completed', 'Untrusted or unfinished run')
    run_id, attempt = str(run['id']), str(run['run_attempt'])
    run_url = f'https://github.com/{REPOSITORY}/actions/runs/{run_id}'
    require(run.get('html_url') == run_url, 'Run URL mismatch')
    require(artifact.get('name') == f'direct-submission-{run_id}-{attempt}', 'Artifact attempt mismatch')
    require(artifact.get('workflow_run', {}).get('id') == run['id'] and artifact['workflow_run'].get('head_sha') == revision, 'Artifact run mismatch')
    try:
        with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
            require(zipped.namelist() == ['direct-submission.json'], 'Unexpected artifact members')
            require(zipped.infolist()[0].file_size <= MAX_BYTES, 'Expanded artifact exceeds size limit')
            env = read_json(zipped.read('direct-submission.json'))
    except (zipfile.BadZipFile, RuntimeError) as error:
        raise Rejected('Invalid artifact archive') from error
    require(isinstance(env, dict) and type(env.get('schema_version')) is int and env['schema_version'] == 1, 'Unsupported envelope')
    receipt = env.get('receipt', {})
    require(isinstance(receipt, dict) and not env.get('test_only') and not receipt.get('test_only'), 'Test replay is not importable')
    require(env.get('run_id') == run_id and env.get('run_attempt') == attempt and env.get('run_url') == run_url and env.get('verifier_commit') == revision, 'Envelope run mismatch')
    require('pull_request' not in issue and issue.get('state') == 'open' and issue.get('title', '').startswith('[Lean submission]'), 'Issue is not an open submission')
    require(env.get('issue_number') == issue.get('number') and env.get('issue_url') == issue.get('html_url') == f'https://github.com/{REPOSITORY}/issues/{issue["number"]}', 'Issue identity mismatch')
    body = issue.get('body')
    require(isinstance(body, str) and len(body.encode()) <= 16000, 'Invalid issue body')
    require(env.get('issue_body_sha256') == sha(body.encode()), 'Exact issue body hash mismatch')
    require(env.get('issue_submitter') == issue.get('user', {}).get('login') and bool(env.get('issue_submitter')), 'Issue submitter mismatch')
    require(env.get('issue_created_at') == issue.get('created_at') and env.get('issue_updated_at') == issue.get('updated_at'), 'Issue version mismatch')
    submission = normalize(read_json(body))
    require(env.get('submission') == submission and env.get('submission_sha256') == sha(canonical(submission).encode()), 'Normalized submission mismatch')
    key = 'dft233' if submission.get('entrypoint') == 'dft233' else submission['problem']
    require(key in trust['profiles'], 'Unreviewed challenge profile')
    profile = trust['profiles'][key]
    require(receipt.get('profile') == profile, 'Trusted profile mismatch')
    base = trust['statements'][profile['challenge_file']]
    require(sha(base) == profile['challenge_sha256'], 'Trusted statement bytes mismatch')
    names = profile['theorem_names']
    expected = dict(direct_submission=submission, repo_url=submission['repo_url'], commit=submission['commit'], challenge_file=profile['challenge_file'], theorem_names=','.join(names), lean_toolchain=profile['lean_toolchain'])
    require(receipt.get('request') == expected, 'Receipt request mismatch')
    require(receipt.get('verifier_commit') == revision and receipt.get('run_url') == run_url, 'Receipt provenance mismatch')
    require(receipt.get('generated_challenge_sha256') == sha(challenge_bytes(submission, base)), 'Exact bound statement mismatch')
    require(receipt.get('theorem_names') == names and set(receipt.get('theorems', {})) == set(names), 'Missing or unexpected theorem targets')
    finished = receipt.get('finished_unix')
    require(type(finished) in (int, float), 'Missing completion timestamp')
    try:
        checked_at = datetime.fromtimestamp(finished, timezone.utc).isoformat().replace('+00:00', 'Z')
    except (ValueError, OverflowError, OSError) as error:
        raise Rejected('Invalid completion timestamp') from error
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
        if nanoda_state == 'passed' and all(receipt['theorems'][name].get('nanoda_kernel') == 'passed' for name in names):
            decision, reason = 'lean-verified', 'Lean and nanoda passed; permitted-axiom audit passed'
        elif nanoda_state == 'incomplete' and nanoda.get('reason') in ('oom', 'timeout') and all(receipt['theorems'][name].get('nanoda_kernel') == 'incomplete' for name in names):
            decision, reason = 'lean-verified', 'Lean and permitted-axiom audit passed; nanoda incomplete: ' + nanoda['reason']
    return dict(decision=decision, reason=reason, id=f'direct-{issue["number"]}-{env["submission_sha256"]}',
                problem_id=PROBLEMS[submission['problem']][0], score=submission['bound'], score_relation='attained',
                source_commit=submission['commit'], source_url=submission['repo_url'], authors=submission['authors'],
                issue_submitter=env['issue_submitter'], receipt_url=run_url, checked_at=checked_at,
                review_required=['authorship', 'first publication date', 'historical record eligibility'])
