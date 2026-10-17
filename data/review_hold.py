#!/usr/bin/env python3
"""Hold an implausible new result off its board until the lead reviews it.

The hourly refresh runs the importers, then this script. A new result is a board
record whose (id, score) pair is not in the published board (the board file at git
HEAD). A new result is held when it improves the published best by an implausible
jump:

- higher-is-better boards (a log saving kappa): the new kappa is more than twice the
  published best. Accepted steps move kappa by far less than 1% (2026-10-17: the
  CrocSwap leader moved from 0.0017297362 to 0.0017297380).
- lower-is-better boards (an exponent): the new exponent is more than 1% below the
  published best. For the matrix exponent a 1% drop is 0.024; published steps are
  below 0.001.

A held record leaves the board file, so the site does not list it and the records
feed does not post it. Its full record waits in review-holds.json. The lead decides
in review-decisions.json: an approved hold goes back on the board in the next run (it
then posts like any new leader); a rejected one stays off. `--check` exits 1 while a
hold, or a CrocSwap PR in claim-review.json (written by refresh.py), waits for the
lead, so the refresh run fails and the dead-man check alerts the lead.

Other bounds rows (src/lib/other-bounds.json) are hand-edited and reviewed by the
lead before a push, so this script does not read them.
"""
import json, subprocess, sys
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HOLDS = 'review-holds.json'
DECISIONS = 'review-decisions.json'
CLAIM_QUEUE = 'claim-review.json'  # written by refresh.py
PLATYPII = 'platypii-lean.json'  # written by platypii_lean.py
KAPPA_FACTOR = 2
EXPONENT_DROP = Fraction(1, 100)

def load(root, path, default=None):
    p = root / path
    return json.loads(p.read_text()) if p.exists() else default

def dump(root, path, data):
    (root / path).write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')

def published(root, path):
    """The board file at git HEAD, or None for a board that is not published yet."""
    try:
        raw = subprocess.check_output(['git', 'show', 'HEAD:./' + path], cwd=root, stderr=subprocess.DEVNULL)
    except subprocess.CalledProcessError:
        return None
    return json.loads(raw)

def on_board(slug, r, meta):
    """Mirror isBoardEntry in src/lib/evidence.ts: only these records can lead a board."""
    if r['id'] == 'classical-baseline' or (meta or {}).get('reproduction_of'):
        return False
    return not (slug == 'integer-multiplication' and r['id'].startswith('crocswap-') and r.get('upstream_status') == 'closed-unmerged')

def implausible(direction, score, best):
    new, ref = Fraction(score), Fraction(best)
    if direction == 'higher-is-better':
        return ref > 0 and new > KAPPA_FACTOR * ref
    return new < ref * (1 - EXPONENT_DROP)

def rule(direction):
    if direction == 'higher-is-better':
        return f'more than {KAPPA_FACTOR} times the published best'
    return f'more than {EXPONENT_DROP * 100}% below the published best'

def key(entry):
    return (entry['board'], entry['id'], entry['score'])

def review(root, now, published_board=published):
    """Apply holds and decisions to every board file in root. Returns the pending holds."""
    registry = load(root, 'registry.json')
    decisions = load(root, DECISIONS, {'approved': [], 'rejected': [], 'claims': []})
    approved = {key(d) for d in decisions['approved']}
    # A CrocSwap claim the lead approved with a score is also approved for this hold.
    approved |= {('integer-multiplication', f"crocswap-pr-{d['pr']}", d['score']) for d in decisions.get('claims', []) if d.get('score')}
    rejected = {key(d) for d in decisions['rejected']}
    pending = {key(h): h for h in load(root, HOLDS, {'holds': []})['holds']}
    for entry in registry['problems']:
        slug, path = entry['slug'], entry['data_file']
        board = load(root, path)
        before = published_board(root, path)
        if before is None:
            continue
        direction = board['score']['direction']
        seen = {(r['id'], r['score']) for r in before['records']}
        choose = max if direction == 'higher-is-better' else min
        pool = [r for r in before['records'] if on_board(slug, r, before['record_metadata'].get(r['id']))]
        if not pool:
            continue
        best = choose(pool, key=lambda r: Fraction(r['score']))
        changed = False
        kept = []
        for r in board['records']:
            k = (slug, r['id'], r['score'])
            if (r['id'], r['score']) in seen or k in approved or not on_board(slug, r, board['record_metadata'].get(r['id'])):
                kept.append(r)
                continue
            if k in rejected or implausible(direction, r['score'], best['score']):
                if k not in rejected:
                    held_at = pending[k]['held_at'] if k in pending else now
                    pending[k] = dict(board=slug, id=r['id'], score=r['score'], title=r.get('title'),
                                      url=r.get('submission_url'), rule=rule(direction),
                                      published_best={'id': best['id'], 'score': best['score']}, held_at=held_at,
                                      record=r, metadata=board['record_metadata'].get(r['id']))
                board['record_metadata'].pop(r['id'], None)
                changed = True
                continue
            kept.append(r)
        # An approved hold returns even if its importer did not rebuild it this run.
        ids = {r['id'] for r in kept}
        for k, h in list(pending.items()):
            if h['board'] != slug or k not in approved and k not in rejected:
                continue
            if k in approved and h['id'] not in ids:
                kept.append(h['record'])
                board['record_metadata'][h['id']] = h['metadata']
                changed = True
            del pending[k]
        if changed:
            board['records'] = kept
            dump(root, path, board)
    holds = sorted(pending.values(), key=lambda h: (h['held_at'], h['board'], h['id']))
    dump(root, HOLDS, {'holds': holds})
    return holds

def main():
    from datetime import datetime, timezone
    if sys.argv[1:] == ['--check']:
        holds = load(ROOT, HOLDS, {'holds': []})['holds']
        queue = load(ROOT, CLAIM_QUEUE, {'queue': []})['queue']
        platypii = load(ROOT, PLATYPII, {}) or {}
        for h in holds:
            print(f"Held for lead review: {h['board']} {h['id']} score {h['score']} ({h['rule']}, published best {h['published_best']['score']}). Decide in data/{DECISIONS} under approved or rejected.")
        for q in queue:
            print(f"CrocSwap PR #{q['pr']} waits for lead review: {q['reason']} Decide in data/{DECISIONS} under claims (pr, head, score or null).")
        if platypii.get('status') == 'held':
            reason = ' '.join(ascii(str(platypii.get('reason')))[1:-1].replace('\\n', ' ').split())[:300]
            print(f"platypii Lean note held: {reason}. Review the change; a new Statement.lean needs a new STATEMENT_SHA256 in data/platypii_lean.py.")
        sys.exit(1 if holds or queue or platypii.get('status') == 'held' else 0)
    now = datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
    holds = review(ROOT, now)
    print(f'{len(holds)} result(s) held for lead review.')

if __name__ == '__main__':
    main()
