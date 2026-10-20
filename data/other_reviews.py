#!/usr/bin/env python3
"""Keep the review status of Other bounds claims current from GitHub.

A row of src/lib/other-bounds.json with a reviewRepository (today the quasi-Riemann row,
GTimG/QuasiRiemannTracker) lists claims with review {pr, status}. The site shows a claim as
Human Verified when the repository merged its pull request (src/lib/evidence.ts). This script
makes a merge flip the claim by itself: each hour it reads each review pull request that is
not merged yet with one GET (repos/<repository>/pulls/<number>) and writes its status to
other-reviews.json. The site build applies that file over the status in other-bounds.json
(src/lib/other-merge.ts, applyReviews). A merged pull request stays merged without a read.

A pull request counts as merged only when GitHub reports merged_at, its base repository is the
review repository and its base branch is that repository's default branch. A failed read keeps
the last state and makes the script exit 1 (the workflow step continues). A pull request that
is closed without a merge stays Claimed and is reported, so the lead can decide about the row.
GET requests only.
"""
import json, sys
from datetime import datetime, timezone
from pathlib import Path
from github_read import api

ROOT = Path(__file__).resolve().parent
ROWS = ROOT.parent / 'src' / 'lib' / 'other-bounds.json'
STATE = 'other-reviews.json'

def review_pull_requests(rows):
    """[(slug, repository, pr, status in the rows file)] for every claim with a review."""
    return [(family['slug'], family['reviewRepository']['name'], claim['review']['pr'], claim['review']['status'])
            for family in rows['families'] if family.get('reviewRepository')
            for claim in family['claims'] if claim.get('review')]

def status_of(repository, pr, data):
    """'merged', 'open' or 'closed' from a GitHub pull request, or raise ValueError."""
    base = (data.get('base') or {})
    repo = base.get('repo') or {}
    if data.get('number') != pr or str(repo.get('full_name', '')).lower() != repository.lower():
        raise ValueError(f'#{pr} is not a pull request of {repository}')
    if data.get('merged_at'):
        if not repo.get('default_branch') or base.get('ref') != repo['default_branch']:
            raise ValueError(f'#{pr} was merged into {base.get("ref")}, not the default branch')
        return 'merged'
    return 'open' if data.get('state') == 'open' else 'closed'

def check(rows, state, now, get=api):
    """Update state (a dict, in place) from GitHub. Returns (changes, failures), lists of text."""
    changes, failures = [], []
    kept = state.setdefault('rows', {})
    for slug, repository, pr, stored in review_pull_requests(rows):
        entry = kept.setdefault(slug, {}).get(str(pr), {})
        if stored == 'merged' or entry.get('status') == 'merged':
            continue
        try:
            data = get(f'repos/{repository}/pulls/{pr}')
            status = status_of(repository, pr, data)
        except (RuntimeError, ValueError) as error:
            failures.append(f'{slug} #{pr}: {str(error)[:200]}')
            continue
        if status != entry.get('status'):
            kept[slug][str(pr)] = {'status': status, 'merged_at': data.get('merged_at'), 'checked_at': now}
            changes.append(f'{slug} {repository}#{pr}: {entry.get("status") or "not read before"} -> {status}')
    return changes, failures

def main():
    now = datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
    path = ROOT / STATE
    state = json.loads(path.read_text()) if path.exists() else {'schema_version': 1, 'rows': {}}
    changes, failures = check(json.loads(ROWS.read_text()), state, now)
    if changes:
        path.write_text(json.dumps(state, indent=2, ensure_ascii=False, sort_keys=True) + '\n')
    for line in changes:
        print('Review status changed:', line)
    for line in failures:
        print('Review status not read:', line, file=sys.stderr)
    closed = [f'{slug} #{pr}' for slug, rows in state['rows'].items() for pr, entry in rows.items() if entry['status'] == 'closed']
    if closed:
        print('Closed without a merge (the claim stays Claimed; the lead decides about the row):', ', '.join(closed))
    print(f'Review pull requests: {len(changes)} changed, {len(failures)} not read.')
    sys.exit(1 if failures else 0)

if __name__ == '__main__':
    main()
