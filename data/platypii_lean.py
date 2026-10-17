#!/usr/bin/env python3
"""Keep the platypii Lean note on the integer multiplication OpenAI row current.

platypii/integer-mult-bounds-lean (Kenny Daniel with jdb19937) proves a saving kappa
on Mathlib's multi-stack machine model. Nil, 2026-10-15: monitor only. The row stays
Claimed; this script only rewrites the sentence about that proof in the row's
proof_status. It reads GitHub with GET requests only and runs nothing.

At each new head of the repository it checks:
- Statement.lean has the sha256 we reviewed (STATEMENT_SHA256, 2026-10-17);
- Theorem.lean states `theorem mulInTime : MulInTime (<kappa> : ℝ)` with kappa
  p / 2 ^ k or (2 ^ k)⁻¹;
- no .lean file outside comments uses sorry or admit or declares an axiom.
Then it writes the value, the commit and the author's CI result to
platypii-lean.json and the note. On any failure it keeps the last good value and
note, and marks the file held: review_hold.py --check fails the refresh run, so
the dead-man check alerts the lead. A new Statement.lean needs a human review and a
new STATEMENT_SHA256.
"""
import hashlib, io, json, os, re, tarfile, urllib.request
from datetime import datetime, timezone
from fractions import Fraction
from pathlib import Path
from github_read import api, content

ROOT = Path(__file__).resolve().parent
REPO = 'platypii/integer-mult-bounds-lean'
STATE = 'platypii-lean.json'
BOARD = 'integer-multiplication.json'
ROW = 'openai-original-109'
STATEMENT = 'IntegerMultBounds/MathlibTM2/Statement.lean'
THEOREM = 'IntegerMultBounds/MathlibTM2/Theorem.lean'
# Reviewed 2026-10-17: the same file at 9f18143 and a8e85a1.
STATEMENT_SHA256 = 'fdefddb6fe2870e6c2c5f45dd4ac02ef93dee3171ebaaa86e3d059cf0a57c0d5'
MAX_TARBALL = 64 * 1024 * 1024
NOTE = re.compile(r'A Lean proof of a (?:stronger )?saving, kappa = .*?we have not rerun it\.')
CI_TEXT = {'success': "the author's CI on that commit passed",
           'failure': "the author's CI on that commit failed",
           'cancelled': "the author's CI run on that commit was cancelled"}

def saving(theorem_text):
    """(text, Fraction) of the mulInTime saving, or None."""
    m = re.search(r'theorem\s+mulInTime\s*:\s*MulInTime\s*\((.+?)\s*:\s*ℝ\)\s*(⁻¹)?', theorem_text)
    if not m:
        return None
    expr, inverse = m.group(1).strip(), m.group(2)
    p = re.fullmatch(r'(\d+)\s*/\s*2\s*\^\s*(\d+)', expr)
    if p and not inverse and int(p.group(2)) <= 400:
        return f'{p.group(1)}/2^{p.group(2)}', Fraction(int(p.group(1)), 2 ** int(p.group(2)))
    q = re.fullmatch(r'\(?\s*2\s*\^\s*(\d+)\s*\)?', expr)
    if q and inverse and int(q.group(1)) <= 400:
        return f'2^-{q.group(1)}', Fraction(1, 2 ** int(q.group(1)))
    return None

def unsafe_tokens(files):
    """Names of .lean files that use sorry or admit, or declare an axiom, outside comments."""
    bad = []
    for name, text in files:
        code = re.sub(r'/-.*?-/', '', text, flags=re.S)
        code = re.sub(r'--[^\n]*', '', code)
        code = re.sub(r'"(?:\\.|[^"\\])*"', '""', code)
        if re.search(r'\b(?:sorry|admit)\b', code) or re.search(r'(?m)^\s*(?:@\[[^\]]*\]\s*)?(?:private\s+|protected\s+)?axiom\s', code):
            bad.append(name)
    return bad

def lean_files(sha):
    """(path, text) of every .lean file at sha, from the source tarball (GET, in memory)."""
    request = urllib.request.Request(f'https://api.github.com/repos/{REPO}/tarball/{sha}',
                                     headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'bigospeedrun-data',
                                              **({'Authorization': 'Bearer ' + os.environ['GITHUB_TOKEN']} if os.environ.get('GITHUB_TOKEN') else {})})
    with urllib.request.urlopen(request, timeout=120) as response:
        raw = response.read(MAX_TARBALL + 1)
    if len(raw) > MAX_TARBALL:
        raise ValueError('tarball over the size cap')
    out = []
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as tf:
        for m in tf:
            if m.isfile() and m.name.endswith('.lean'):
                out.append((m.name.split('/', 1)[1] if '/' in m.name else m.name, tf.extractfile(m).read().decode('utf-8', 'replace')))
    return out

def ci_text(sha, get=api):
    runs = get(f'repos/{REPO}/commits/{sha}/check-runs').get('check_runs', [])
    states = {r.get('conclusion') or r.get('status') for r in runs}
    for key in ('failure', 'cancelled'):
        if key in states:
            return CI_TEXT[key]
    if runs and states == {'success'}:
        return CI_TEXT['success']
    return "the author's CI on that commit had not finished"

def note(value_text, value, sha, ci, day, row_score):
    stronger = 'stronger ' if value > Fraction(row_score) else ''
    return (f'A Lean proof of a {stronger}saving, kappa = {value_text} (about {float(value):.3g}), by Kenny Daniel (platypii) '
            f"with jdb19937, exists on Mathlib's multi-stack machine model ({REPO} @ {sha[:7]}, theorem "
            f"MathlibTM2.mulInTime; the author's axiom audit allows only the standard axioms, and {ci} (checked {day})); "
            'it is not our exact multitape statement and we have not rerun it.')

def write_note(root, value_text, value, sha, ci, day):
    board = json.loads((root / BOARD).read_text())
    meta = board['record_metadata'][ROW]
    row_score = next(r['score'] for r in board['records'] if r['id'] == ROW)
    if not NOTE.search(meta['proof_status']):
        raise ValueError('note sentence not found in the row proof_status')
    updated = NOTE.sub(lambda m: note(value_text, value, sha, ci, day, row_score), meta['proof_status'], count=1)
    if updated != meta['proof_status']:
        meta['proof_status'] = updated
        (root / BOARD).write_text(json.dumps(board, indent=2, ensure_ascii=False) + '\n')

def check(root, now, get=api, read=content, files_at=lean_files):
    """Update platypii-lean.json and the row note in root. Returns the state."""
    path = root / STATE
    state = json.loads(path.read_text())
    head = get(f'repos/{REPO}/commits/HEAD')['sha']
    day = now[:10]
    same = head == state.get('checked_commit') and state.get('statement_sha256') == STATEMENT_SHA256
    if same and state.get('status') == 'held':
        return state  # Still held: the review step keeps alerting until the head or the pin changes.
    if same:
        # Same verified head: only the author's CI result can change (1 GET).
        ci = ci_text(head, get)
        if ci != state.get('ci'):
            write_note(root, state['value'], Fraction(state['kappa']), head, ci, day)
            state.update(ci=ci, checked_at=now)
            path.write_text(json.dumps(state, indent=2, ensure_ascii=False) + '\n')
        return state
    try:
        statement = read(REPO, STATEMENT, head)
        if hashlib.sha256(statement).hexdigest() != STATEMENT_SHA256:
            raise ValueError('Statement.lean changed (sha256 differs from the reviewed file)')
        found = saving(read(REPO, THEOREM, head).decode('utf-8', 'replace'))
        if not found:
            raise ValueError('mulInTime saving not found in Theorem.lean')
        bad = unsafe_tokens(files_at(head))
        if bad:
            raise ValueError('sorry, admit or axiom in ' + ', '.join(bad[:5]))
        value_text, value = found
        ci = ci_text(head, get)
        write_note(root, value_text, value, head, ci, day)
        if value_text != state.get('value'):
            state.update(value=value_text, kappa=str(value), first_commit=head, first_seen=now)
        state.update(commit=head, ci=ci, status='ok', reason=None)
    except ValueError as error:  # Keep the last good value; the review step alerts the lead.
        state.update(status='held', reason=f'{head[:7]}: {error}'[:300])
    # A network or GitHub failure raises: the step fails, nothing is written, and the
    # next run tries again.
    state.update(checked_commit=head, checked_at=now, statement_sha256=STATEMENT_SHA256)
    path.write_text(json.dumps(state, indent=2, ensure_ascii=False) + '\n')
    return state

def main():
    now = datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
    state = check(ROOT, now)
    print(f"platypii Lean note: {state['status']} at {state['checked_commit'][:7]}, kappa {state['value']}"
          + (f" (held: {state['reason']})" if state['status'] == 'held' else ''))

if __name__ == '__main__':
    main()
