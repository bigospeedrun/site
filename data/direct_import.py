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
import sssp

REPOSITORY = 'bigospeedrun/verifier'
WORKFLOW = '.github/workflows/submissions.yml'
REUSABLE = '.github/workflows/submission-check.yml'
MAX_EVIDENCE_BYTES = 128_000_000
AXIOMS = {'propext', 'Classical.choice', 'Quot.sound'}
PROBLEMS = {'dft': ('exact-dft/uniform-exact-arithmetic', 1),
            '3sum': ('3sum/word-ram', 2), 'apsp': ('apsp/word-ram', 3),
            # An Other bounds row with a trusted statement (verifier PR #15): a coefficient from 0 to 8.
            'average-sensitivity': ('other/average-sensitivity', 8),
            # An Other bounds row (verifier profile catalan, split build): an irrationality exponent from 0 to 10^8.
            'catalan': ('other/catalan', 100000000),
            # A board (verifier profile subset-sum, opened 2026-11-01): the exponent alpha of O(2^(alpha n)), 0 to 1
            # as in the profile. A Lean Verified bound above the classical 1/2 is listed too (Nil ruling 2026-11-02,
            # verifier #94: a stepping stone).
            'subset-sum': ('subset-sum/randomized-word-ram', 1),
            # An Other bounds row (verifier profile snaky, opened 2026-11-03 after verifier #106's runs): Maker moves,
            # a whole number from 0 to 100 as in the profile.
            'snaky': ('other/snaky', 100),
            # An Other bounds row (verifier profile heilbronn-triangle, verifier #105): the saving eta, 0 < eta <= 5/6
            # as in the profile. The first Other row where a higher bound is better (HIGHER).
            'heilbronn-triangle': ('other/heilbronn-triangle', Fraction(5, 6)),
            # An Other bounds row (verifier profile prime-gaps, verifier #148): the gap B of H_1 <= B, a whole number from
            # 0 to 100000 as in the profile.
            'prime-gaps': ('other/prime-gaps', 100000),
            # A board (verifier profile directed-sssp, opened 2026-11-03): a bound "D ; T" (data/sssp.py), not one
            # rational, so it has no range maximum; sssp.parse holds the verifier's ranges.
            'directed-sssp': ('directed-sssp/comparison-addition-sparse', None)}
# Problems where a larger bound is better (a saving), as the verifier's HIGHER: the weakest bound of the range is 0.
HIGHER = {'dft', 'heilbronn-triangle'}
# At most 40 digits per integer of a bound (Lead decision, 2026-10-21, issue #35: a reduced 3SUM bound needed 19).
# A Heilbronn saving with a full proof can be very small (1/(100000 K) has a 237-digit denominator): 300 (Lead,
# 2026-11-03, verifier #105), as the verifier's BOUND_DIGITS.
BOUND_DIGITS = {'heilbronn-triangle': 300}
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

def statement_fixture(config, path):
    """The file name of the vendored copy of a reviewed statement in data/direct-fixtures. Two profiles can
    share a file name (catalan and subset-sum both use Statement.lean), so statement_fixtures in
    data/direct-trust.json names a copy by its challenge path; other copies keep the file name."""
    return config.get('statement_fixtures', {}).get(path) or path.rsplit('/', 1)[-1]

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
    if value['problem'] == 'directed-sssp':
        return normalize_sssp(value)
    # A digit limit per integer of the bound, as the verifier's bound_digits.
    digits = BOUND_DIGITS.get(value['problem'], 40)
    require(isinstance(value['bound'], str) and re.fullmatch(rf'(?:0|[1-9][0-9]{{0,{digits - 1}}})(?:/[1-9][0-9]{{0,{digits - 1}}})?', value['bound']), 'Invalid rational bound')
    bound = Fraction(value['bound'])
    require(0 <= bound <= PROBLEMS[value['problem']][1], 'Bound outside model range')
    # A Snaky bound counts Maker moves (verifier submissions.validate_submission): a whole number, no fraction.
    require(value['problem'] != 'snaky' or bound.denominator == 1, 'Snaky bound must be a whole number of Maker moves')
    # A prime gap is a whole number (verifier submissions.WHOLE), no fraction.
    require(value['problem'] != 'prime-gaps' or bound.denominator == 1, 'Prime gap bound must be a whole number')
    # A Heilbronn saving must be positive (verifier submissions.validate_submission): 0 is the classical bound.
    require(value['problem'] != 'heilbronn-triangle' or bound > 0, 'Heilbronn bound must be positive')
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
    # Blank lines after the last field are allowed, as in the verifier (issue #94, 2026-11-01: an edited form
    # ended with '\n\n').
    pattern = r'\A### Problem\n\n([^\n]+)\n\n### Repository URL\n\n([^\n]+)\n\n### Commit SHA\n\n([^\n]+)\n\n### Bound\n\n([^\n]+)\n*\Z'
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
            if isinstance(receipt,dict) and receipt.get('status')=='setup_failed':
                # Setup can fail before prepare stores the provenance; the verifier's report then adds the run's own
                # (scripts/submissions.py report(): setdefault run_url and verifier_commit). Only these keys, only these values.
                receipt=dict(receipt,run_url=receipt.get('run_url',f'https://github.com/{REPOSITORY}/actions/runs/{run["id"]}'),
                             verifier_commit=receipt.get('verifier_commit',revision))
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

def normalize_sssp(value):
    """A directed-sssp submission: the bound is the normal form "D ; T" that the verifier's parse_sssp accepts
    (the shared cases in direct-fixtures/sssp-cases.json), so it stays text."""
    try:
        sssp.parse(value['bound'])
    except ValueError as error:
        raise Rejected('Invalid directed-sssp bound') from error
    require(isinstance(value['repo_url'], str) and re.fullmatch(r'https://github\.com/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}', value['repo_url']), 'Invalid source repository')
    require(isinstance(value['commit'], str) and re.fullmatch(r'[0-9a-f]{40}', value['commit']), 'Invalid source commit')
    authors = value['authors']
    require(isinstance(authors, list) and 0 <= len(authors) <= 30 and all(isinstance(a, str) and a.strip() and len(a) <= 120 and all(ord(c) >= 32 for c in a) for a in authors), 'Invalid authors')
    require(value.get('entrypoint', 'Race.bound') == 'Race.bound', 'Unsupported entrypoint')
    return {k: v for k, v in value.items() if k != 'entrypoint'}

def challenge_bytes(submission, base):
    if submission.get('entrypoint') == 'dft233':
        return base
    if submission['problem'] == 'directed-sssp':
        # As the verifier's challenge_source: the five exponents a, b, a', b', c' as reduced rationals.
        args = ' '.join(f'(({e.numerator} : ℚ) / {e.denominator})' for e in sssp.parse(submission['bound']))
        target = f'theorem Race.bound : BigOSpeedrun.DirectedSSSP.Bound {args} := by\n  sorry\n'
        return base + ('\n-- Big O Speedrun exact-bound target; generated from validated integers.\n' + target).encode()
    n, d = Fraction(submission['bound']).as_integer_ratio()
    if submission['problem'] == 'dft':
        target = f'''open OAI.PowerSaving Filter Asymptotics

theorem Race.bound : ∃ order solve W, DFTProgram order solve W ∧
    (fun n : ℕ => (W n : ℝ)) =O[atTop]
      (fun n : ℕ => (n : ℝ) * (Real.log (n : ℝ)) ^ (1 - ({n} : ℝ) / {d})) := by
  sorry
'''
    elif submission['problem'] == 'average-sensitivity':
        target = f'theorem Race.bound : BigOSpeedrun.AverageSensitivity.Bound (({n} : ℚ) / {d}) := by\n  sorry\n'
    elif submission['problem'] == 'catalan':
        target = f'theorem Race.bound : BigOSpeedrun.Catalan.Bound (({n} : ℚ) / {d}) := by\n  sorry\n'
    elif submission['problem'] == 'subset-sum':
        target = f'theorem Race.bound : BigOSpeedrun.SubsetSum.SolvedInTime (({n} : Rat) / {d}) := by\n  sorry\n'
    elif submission['problem'] == 'snaky':
        require(d == 1, 'Snaky bound must be a whole number of Maker moves')
        target = f'theorem Race.bound : BigOSpeedrun.Snaky.Bound {n} := by\n  sorry\n'
    elif submission['problem'] == 'prime-gaps':
        require(d == 1, 'Prime gap bound must be a whole number')
        target = f'theorem Race.bound : BigOSpeedrun.PrimeGaps.Bound {n} := by\n  sorry\n'
    elif submission['problem'] == 'heilbronn-triangle':
        target = f'theorem Race.bound : BigOSpeedrun.HeilbronnTriangle.Bound (({n} : ℚ) / {d}) := by\n  sorry\n'
    else:
        problem = 'ThreeSum' if submission['problem'] == '3sum' else 'APSP'
        target = f'theorem Race.bound : EndStatement.{problem}.SolvedInTime (({n} : Rat) / {d}) := by\n  sorry\n'
    return base + ('\n-- Big O Speedrun exact-bound target; generated from validated integers.\n' + target).encode()

# A job of a submissions run: the reusable check workflow names it after its matrix entry (issue number, submitter
# login, route, and true for a split build) and its own job.
CHECK_JOB = re.compile(r'check \(([1-9][0-9]*), [A-Za-z0-9][A-Za-z0-9-]{0,38}, (issue|pull_request)(?:, true)?\) / (build|verify|report|pr_verify)')

def own_jobs_finished(jobs, run, number):
    """A final issue result while other jobs of its run still run (lead, 2026-11-02: run 41393097953 checked #94 and
    #99 as a matrix; #94 was finished, the split build of #99 runs for up to 350 min). Every job of this issue in the run
    attempt has completed with success or skipped, and its verify and report jobs succeeded. A running, failed or
    cancelled job of this issue rejects; the result is then read again when the whole run has completed."""
    require(isinstance(jobs, list) and jobs, 'Missing run jobs')
    own = {}
    for job in jobs:
        require(isinstance(job, dict) and job.get('run_id') == run['id'] and job.get('run_attempt') == run['run_attempt']
                and job.get('head_sha') == run['head_sha'], 'Job run mismatch')
        match = CHECK_JOB.fullmatch(job.get('name') or '')
        if match and int(match[1]) == number and match[2] == 'issue':
            require(match[3] not in own, 'Duplicate job of the issue')
            own[match[3]] = job
    require({'verify', 'report'} <= own.keys(), 'Missing job of the issue')
    for name, job in own.items():
        require(job.get('status') == 'completed', 'A job of the issue has not finished')
        require(job.get('conclusion') in (('success',) if name in ('verify', 'report') else ('success', 'skipped')), 'A job of the issue did not succeed')
    return True

def validate_result(archive, issue, run, artifact, trusted_revisions, *, receipt_archive=None, receipt_artifact=None, publisher=None, jobs=None):
    """Return a review candidate; even a pass does not establish credit or priority. jobs: the jobs of the run
    attempt, for a final result while the run is still in progress (own_jobs_finished)."""
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
    require(run.get('head_branch') == trust['branch'] and run.get('event') in ('issues', 'schedule', 'workflow_dispatch'), 'Untrusted or unfinished run')
    if early or run.get('status') == 'completed':
        require(run.get('status') in (('in_progress', 'completed') if early else ('completed',)), 'Untrusted or unfinished run')
    else:
        require(run.get('status') == 'in_progress' and jobs is not None, 'Untrusted or unfinished run')
        own_jobs_finished(jobs, run, issue['number'])
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
    held = derivation_hold(env.get('derivation'))
    # A derivation hold is the only non-importable envelope admitted: direct_refresh.py keeps it
    # off the board as Lean Verified until the lead approves it (review-decisions.json derivations).
    require(isinstance(receipt, dict) and env.get('test_only') is False and env.get('importable') is (not held) and env.get('status') != 'fixture_only' and not receipt.get('test_only'), 'Test replay is not importable')
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
    generated = sha(challenge_bytes(submission, base))
    if not early and setup_failed(receipt) and 'generated_challenge_sha256' not in receipt:
        generated = None  # prepare did not write the challenge; the request and issue bindings above still apply
    require(env.get('challenge') == dict(file=profile['challenge_file'], sha256=profile['challenge_sha256'], upstream_commit=profile['upstream_commit'], generated_sha256=generated), 'Envelope challenge mismatch')
    decision, reason, checked_at = validate_proof(submission, receipt, trust, revision, run_url, allow_timeout=not early)
    require(env.get('checked_at') == checked_at, 'Envelope completion timestamp mismatch')
    return dict(decision=decision, reason=reason, id=f'direct-{issue["number"]}-{env["submission_sha256"]}',
                problem_id=PROBLEMS[submission['problem']][0], score=submission['bound'], score_relation='attained',
                source_commit=submission['commit'], source_url=submission['repo_url'], authors=submission['authors'],
                workflow_conclusion=run.get('conclusion'), issue_submitter=env['issue_submitter_login'], receipt_url=run_url, checked_at=checked_at,
                issue_created_at=issue.get('created_at'),
                issue_updated_at_at_verification=env.get('issue_updated_at'),
                issue_updated_at_at_import=issue.get('updated_at'), derivation_hold=held,
                review_required=['authorship', 'first publication date', 'historical record eligibility'])


def derivation_hold(report):
    """The verifier's derivation report (scripts/derivation.py, marker bos-derivation-v1) found a
    constants-only change of another author's verified submission. Results from verifiers before
    the report have no such field: no hold."""
    require(report is None or (isinstance(report, dict) and type(report.get('hold', False)) is bool), 'Invalid derivation report')
    return bool(report and report.get('hold'))


TIMEOUT_REASON = 'The proof check ran out of time; this is not a verdict on the proof'

def timed_out(receipt):
    """The verifier stopped the check for time (Lead, 2026-11-02, verifier #99: the 3SUM proof ran 5 h 20 min): the receipt's
    status is 'timeout' (the total deadline, scripts/verifier.py), or the Lean kernel is incomplete with the reason
    'timeout' (its systemd time limit). Also after Lean passed, when the permitted-axiom audit stopped for time (Lead,
    2026-11-02): its systemd result is 'timeout' (the verifier records no reason for the audit), or the total deadline
    came before it started. Never when a kernel rejected the proof or the audit reported a forbidden axiom."""
    kernels = receipt.get('kernels') if isinstance(receipt.get('kernels'), dict) else {}
    lean = kernels.get('lean') if isinstance(kernels.get('lean'), dict) else {}
    audit = receipt.get('axiom_audit') if isinstance(receipt.get('axiom_audit'), dict) else {}
    reported = audit.get('reported_axioms') if isinstance(audit.get('reported_axioms'), dict) else {}
    theorems = receipt.get('theorems') if isinstance(receipt.get('theorems'), dict) else {}
    rejected = (lean.get('status') == 'rejected' or (kernels.get('nanoda') or {}).get('status') == 'rejected'
                or any(isinstance(t, dict) and 'rejected' in (t.get('lean_kernel'), t.get('nanoda_kernel')) for t in theorems.values()))
    forbidden = any(not isinstance(axioms, list) or any(not isinstance(a, str) or a not in AXIOMS for a in axioms) for axioms in reported.values())
    if lean.get('status') == 'passed':
        stopped = ((audit.get('status') == 'not_completed_or_rejected' and audit.get('systemd_result') == 'timeout' and not audit.get('guard_stop'))
                   or (audit.get('status') == 'not_started' and receipt.get('status') == 'timeout'))
    else:
        stopped = receipt.get('status') == 'timeout' or (lean.get('status') == 'incomplete' and lean.get('reason') == 'timeout')
    return stopped and not rejected and not forbidden

SETUP_REASON = 'The verifier setup failed before the proof check; this is not a verdict on the proof'
# The setup errors that the verifier reports as the submission's own fault (scripts/verdicts.py SETUP_ERRORS at
# 7dade77, Lead 2026-10-31 after issue #89): the result is final and the row drops. A new key there that is not
# copied here keeps such a row Claimed, never the reverse.
DETERMINISTIC_SETUP_ERRORS = frozenset({
    'solution module is missing', 'unclosed block comment in source', 'cyclic submission imports',
    'unsupported import header', 'submission imports a reserved verifier module', 'build order has an unmet local dependency',
    'only regular Lean source files with ordinary module names are admitted', 'individual Lean source exceeds 20 MB',
    'Lean source input exceeds 150 MB'})

def setup_failed(receipt):
    """The verifier failed before any proof check (Lead, 2026-11-02, verifier #99 rerun 41494392206: a verifier bug failed
    its unit tests): our failure, not a verdict. The receipt's status is 'setup_failed' (scripts/verifier.py finalize), its
    error is not one of the submission's own setup faults, and no Lean check and no axiom audit started."""
    kernels = receipt.get('kernels') if isinstance(receipt.get('kernels'), dict) else {}
    lean = kernels.get('lean') if isinstance(kernels.get('lean'), dict) else {}
    nanoda = kernels.get('nanoda') if isinstance(kernels.get('nanoda'), dict) else {}
    audit = receipt.get('axiom_audit') if isinstance(receipt.get('axiom_audit'), dict) else {}
    return (receipt.get('status') == 'setup_failed' and receipt.get('error') not in DETERMINISTIC_SETUP_ERRORS
            and lean.get('status', 'not_started') == 'not_started' and audit.get('status', 'not_started') == 'not_started'
            and nanoda.get('status', 'not_started') in ('not_started', 'pending'))

def completion_time(receipt):
    finished = receipt.get('finished_unix')
    require(type(finished) in (int, float), 'Missing completion timestamp')
    try:
        checked_at = datetime.fromtimestamp(finished, timezone.utc).isoformat().replace('+00:00', 'Z')
    except (ValueError, OverflowError, OSError) as error:
        raise Rejected('Invalid completion timestamp') from error
    require(receipt.get('checked_at') == checked_at, 'Completion timestamp mismatch')
    return checked_at

# The receipt's copy of the profile may differ from the reviewed one only in the execution key "runner" (Lead,
# 2026-11-02): 3SUM issues run split since verifier issue #99, so newer 3SUM receipts carry "runner": "github-split" and
# older ones carry none. The runner changes how the solution is built, not the statement, targets or toolchain:
# Comparator checks the exported theorem against the trusted challenge in both modes. Every other key must match.
RUNNERS = ('github', 'github-split')

def same_profile(actual, reviewed):
    if not isinstance(actual, dict) or actual.get('runner', 'github') not in RUNNERS:
        return False
    strip = lambda p: {k: v for k, v in p.items() if k != 'runner'}
    return strip(actual) == strip(reviewed)

def expected_request(submission, profile):
    expected = dict(direct_submission=submission, repo_url=submission['repo_url'], commit=submission['commit'], challenge_file=profile['challenge_file'], theorem_names=','.join(profile['theorem_names']), lean_toolchain=profile['lean_toolchain'])
    if 'source_subdir' in submission:
        expected['source_subdir'] = submission['source_subdir']
    return expected

def validate_proof(submission, receipt, trust, revision, run_url, allow_timeout=False):
    """allow_timeout (the issue route only): a receipt whose check stopped for time (timed_out) gives the decision
    'timeout' instead of a rejection, and one whose setup failed before any check (setup_failed) the decision 'setup'.
    The request, provenance and statement bindings apply as always; before prepare, only the provenance exists."""
    key = 'dft233' if submission.get('entrypoint') == 'dft233' else submission['problem']
    require(key in trust['profiles'], 'Unreviewed challenge profile')
    profile = trust['profiles'][key]
    base = trust['statements'][profile['challenge_file']]
    require(sha(base) == profile['challenge_sha256'], 'Trusted statement bytes mismatch')
    if allow_timeout and setup_failed(receipt):
        return setup_outcome(submission, receipt, profile, base, revision, run_url)
    require(same_profile(receipt.get('profile'), profile), 'Trusted profile mismatch')
    names = profile['theorem_names']
    require(receipt.get('request') == expected_request(submission, profile), 'Receipt request mismatch')
    require(receipt.get('verifier_commit') == revision and receipt.get('run_url') == run_url, 'Receipt provenance mismatch')
    require(receipt.get('generated_challenge_sha256') == sha(challenge_bytes(submission, base)), 'Exact bound statement mismatch')
    if allow_timeout and timed_out(receipt):
        require(receipt.get('theorem_names') == names and set(receipt.get('theorems', {})) == set(names), 'Missing or unexpected theorem targets')
        return 'timeout', TIMEOUT_REASON, completion_time(receipt)
    return validate_kernel_receipt(receipt, names)


def setup_outcome(submission, receipt, profile, base, revision, run_url):
    """A setup failure (setup_failed) can stop prepare at any step. Each binding that prepare wrote must match, and the
    provenance always; before prepare, the run's provenance is the only one (checked_receipt), and the envelope binds the input."""
    names = profile['theorem_names']
    if {'request', 'profile', 'theorem_names'} & receipt.keys():
        require(same_profile(receipt.get('profile'), profile), 'Trusted profile mismatch')
        require(receipt.get('request') == expected_request(submission, profile), 'Receipt request mismatch')
        require(receipt.get('theorem_names') == names and set(receipt.get('theorems', {})) == set(names), 'Missing or unexpected theorem targets')
    else:
        require(receipt.get('theorems') == {}, 'Missing or unexpected theorem targets')
    if 'generated_challenge_sha256' in receipt:
        require(receipt['generated_challenge_sha256'] == sha(challenge_bytes(submission, base)), 'Exact bound statement mismatch')
    require(receipt.get('verifier_commit') == revision and receipt.get('run_url') == run_url, 'Receipt provenance mismatch')
    return 'setup', SETUP_REASON, completion_time(receipt)


def validate_kernel_receipt(receipt, names):
    """Shared Lean, permitted-axiom and advisory-kernel evidence policy."""
    require(receipt.get('theorem_names') == names and set(receipt.get('theorems', {})) == set(names), 'Missing or unexpected theorem targets')
    checked_at = completion_time(receipt)
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


def range_end(problem):
    """The weakest bound of a problem's range, as the verifier's range_end: the gate while its board has no
    Lean Verified row. The range maximum, or 0 where a higher saving is better (HIGHER)."""
    return Fraction(0) if problem in HIGHER else Fraction(PROBLEMS[problem][1])

def open_rank(problem):
    """Second key of an open endpoint: below an attained score where a higher bound is better, above it elsewhere."""
    return -1 if problem in HIGHER else 1


def current_record_gate(problem, data_bytes, site_commit, checked_at, exclude_issue_url=None):
    """Pure reference selector matching the site's board, for reviewed API snapshots."""
    require(problem in PROBLEMS and re.fullmatch(r'[0-9a-f]{40}', site_commit), 'Invalid board identity')
    data = read_json(data_bytes)
    require(data.get('problem_id') == PROBLEMS[problem][0], 'Board model mismatch')
    direction = 'higher-is-better' if problem in HIGHER else 'lower-is-better'
    require(data.get('score', {}).get('direction') == direction, 'Board score direction mismatch')
    if problem == 'directed-sssp':
        return sssp_record_gate(data, data_bytes, site_commit, checked_at, exclude_issue_url)
    # Nil ruling 2026-10-20 (verifier 7f4f6bd): the gate is the best Lean Verified row; a Claimed
    # or Human Verified row never blocks a proof run. With no Lean Verified row, every bound in the
    # profile range runs (Nil ruling 2026-11-02, verifier 1b1af26): the gate is the end of the range.
    candidates = []
    for record in data['records']:
        meta = data['record_metadata'][record['id']]
        if record['id'] == 'classical-baseline':
            continue
        if meta.get('reproduction_of'):
            continue
        if exclude_issue_url and record.get('submission_url') == exclude_issue_url:
            continue
        relation = record.get('score_relation', 'attained')
        require(relation in ('attained', 'strict-upper-bound'), 'Invalid board relation')
        # An open endpoint is weaker than an attained value at the same score: it sorts below on
        # the HIGHER problems (max wins) and above on the exponent boards (min wins).
        key = (Fraction(record['score']), open_rank(problem) if relation == 'strict-upper-bound' else 0)
        verified = (meta.get('site_tier') == 'verified' and record.get('rerun_status', {}).get('state') == 'passed'
                    and bool(record['rerun_status'].get('receipt_path')))
        if verified:
            candidates.append((key, record['id'], verified))
    if not candidates:
        candidates = [((range_end(problem), 0), 'profile-range', False)]
    leader_key = (max if problem in HIGHER else min)(row[0] for row in candidates)
    leaders = [row for row in candidates if row[0] == leader_key]
    return dict(schema_version=1, problem_id=data['problem_id'], site_commit=site_commit,
                data_sha256=sha(data_bytes), checked_at=checked_at, direction=direction,
                score=str(leader_key[0]), score_relation='strict-upper-bound' if leader_key[1] != 0 else 'attained',
                leader_ids=sorted(row[1] for row in leaders), any_lean_verified_at_bound=any(row[2] for row in leaders))


def sssp_record_gate(data, data_bytes, site_commit, checked_at, exclude_issue_url):
    """As the verifier's sssp_record: the Lean Verified point rows "D ; T" and the chart lines of those rows (only
    Vals AI's Tchd, G2). Claimed rows, the function rows and the classic never gate."""
    def verified(record):
        meta = data['record_metadata'][record['id']]
        return (meta.get('site_tier') == 'verified' and (record.get('rerun_status') or {}).get('state') == 'passed'
                and bool(record['rerun_status'].get('receipt_path')))
    rows = [r for r in data['records'] if r['id'] != 'classical-baseline' and not data['record_metadata'][r['id']].get('reproduction_of')
            and not (exclude_issue_url and r.get('submission_url') == exclude_issue_url) and verified(r)]
    points = sorted((r['id'], r['score']) for r in rows if ' ; ' in r['score'])
    ids = {r['id'] for r in rows}
    lines = sorted((l['id'], l['row'], l['function'], l['up_to']) for l in data.get('chart', {}).get('lines', []) if l['row'] in ids)
    return dict(schema_version=1, problem_id=data['problem_id'], lean_verified=[dict(id=i, score=s) for i, s in points],
                lean_lines=[dict(id=i, row=row, function=f, up_to=u) for i, row, f, u in lines],
                site_commit=site_commit, data_sha256=sha(data_bytes), checked_at=checked_at)


def qualifies_for_run(submission, record_gate):
    """A tied bound qualifies until a matching leader is already Lean Verified."""
    require(record_gate.get('schema_version') == 1 and record_gate.get('problem_id') == PROBLEMS[submission['problem']][0], 'Record gate model mismatch')
    if submission['problem'] == 'directed-sssp':
        lines = [(sssp.parse_function(l['function']), sssp.density(l['up_to'])) for l in record_gate['lean_lines']]
        return sssp.qualifies(sssp.parse(submission['bound']), [sssp.parse(p['score']) for p in record_gate['lean_verified']], lines)
    require(type(record_gate.get('any_lean_verified_at_bound')) is bool, 'Missing leader evidence')
    candidate = (Fraction(submission['bound']), 0)
    current = (Fraction(record_gate['score']), open_rank(submission['problem']) if record_gate['score_relation'] == 'strict-upper-bound' else 0)
    if candidate == current:
        return not record_gate['any_lean_verified_at_bound']
    return candidate > current if submission['problem'] in HIGHER else candidate < current
