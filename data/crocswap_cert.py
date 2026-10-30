"""What CrocSwap main says about its pull requests, for Human Verified (Lead ruling b3, 2026-10-30).

A merged CrocSwap PR row is Claimed when CrocSwap's own ledger says partially_reviewed (archival intake: CONTRIBUTING.md
since 43f5722f, 2026-10-16T13:32:45Z) and main does not certify its kappa. It is Human Verified when main certifies its
kappa (a revision of certificates/selected-result.json whose kappa equals the row kappa and whose source_prs names the PR,
or a certificates/checkpoints/frontier<PR>.json with the row kappa), or the ledger says incorporated, or it merged before
the policy commit and the ledger has no entry. A merge after it with no entry is Claimed. The rule itself is in
src/lib/crocswap-cert.ts. This file keeps what it needs, so that a refresh reads only what is new:
  selected_revisions: every revision of selected-result.json, oldest first (commit, committed_at, kappa as a reduced
    fraction, source_prs as the file lists them);
  frontiers: each frontier<PR>.json seen on main, with the commit that added it and its kappa (kept once seen, like a
    revision: a certification that happened stays);
  ledger: the disposition of each PR in two files of CrocSwap main (docs/research/pr-ledger.json, the old PRs, and
    docs/research/pr-intake-decisions.json, the newer ones; the second wins), as {disposition: [PR numbers]} with the blob
    sha that was read; a file is read again only when its blob sha changes;
  read_error: set while the last read failed (since, message), so that a failure shows in the committed file.
The site reads the file (src/lib/crocswap-cert.ts); the time of the earliest certifying commit is the time of Human Verified."""
import json, re
from fractions import Fraction

CROC = 'CrocSwap/integer-mult-bounds'
SELECTED = 'certificates/selected-result.json'
CHECKPOINTS = 'certificates/checkpoints'
FRONTIER = re.compile(r'frontier(\d+)\.json')
FILE = 'crocswap-certifications.json'
LEDGER_FILES = {'pr-ledger': 'docs/research/pr-ledger.json', 'pr-intake-decisions': 'docs/research/pr-intake-decisions.json'}

def empty():
    return {'schema_version': 1, 'repo': CROC, 'checked_at': None, 'selected_revisions': [], 'frontiers': {}, 'ledger': {}}

def commit_time(entry):
    return entry['commit']['committer']['date']

def kappa(document):
    value = document['kappa']
    if not isinstance(value, str):
        raise ValueError('kappa is not a string')  # Fraction(float) would give a binary fraction
    return str(Fraction(value))

def revision(entry, raw):
    selected = json.loads(raw)
    prs = selected.get('source_prs')
    # The first revision (2026-10-09) names its one PR in source_pr; it is read as source_prs [that PR] (Lead, 2026-10-30).
    if prs is None and type(selected.get('source_pr')) is int:
        prs = [selected['source_pr']]
    prs = [] if prs is None else prs
    if not isinstance(prs, list) or any(type(n) is not int for n in prs):
        raise ValueError('selected-result.json source_prs is not a list of integers')
    return {'commit': entry['sha'], 'committed_at': commit_time(entry), 'kappa': kappa(selected), 'source_prs': prs}

def dispositions(raw):
    """{disposition: sorted PR numbers} of a ledger file."""
    out = {}
    for entry in json.loads(raw)['pull_requests']:
        if type(entry['number']) is not int or not isinstance(entry['disposition'], str):
            raise ValueError('A ledger entry has no integer number or no disposition')
        out.setdefault(entry['disposition'], set()).add(entry['number'])
    return {name: sorted(numbers) for name, numbers in sorted(out.items())}

def ledger(stored, sha, api, content):
    result = {}
    for name, path in LEDGER_FILES.items():
        blob = api(f'repos/{CROC}/contents/{path}', {'ref': sha})['sha']
        old = stored.get(name)
        result[name] = old if old and old['blob'] == blob else {'blob': blob, 'dispositions': dispositions(content(CROC, path, sha))}
    return result

def update(root, now, sha, api, pages, content):
    """Read the commits that the stored file does not know; return the new file content (not written)."""
    path = root / FILE
    stored = json.loads(path.read_text()) if path.exists() else empty()
    known = {r['commit'] for r in stored['selected_revisions']}
    commits = pages(f'repos/{CROC}/commits', {'path': SELECTED, 'sha': sha})
    revisions = list(stored['selected_revisions'])
    # The listing is newest first: append the unknown commits oldest first.
    for entry in reversed([c for c in commits if c['sha'] not in known]):
        revisions.append(revision(entry, content(CROC, SELECTED, entry['sha'])))
    listing = api(f'repos/{CROC}/contents/{CHECKPOINTS}', {'ref': sha})
    if not isinstance(listing, list):
        raise ValueError('The checkpoints listing is not a directory')
    names = {int(m[1]): item['name'] for item in listing if item.get('type') == 'file' and (m := FRONTIER.fullmatch(item['name']))}
    frontiers = dict(stored['frontiers'])
    for pr, name in sorted(names.items()):
        old = frontiers.get(str(pr))
        if old and 'kappa' in old:
            continue
        path = f'{CHECKPOINTS}/{name}'
        if not old:
            # The oldest commit that touched the file added it.
            history = pages(f'repos/{CROC}/commits', {'path': path, 'sha': sha})
            if not history:
                raise ValueError(f'{name} has no commit')
            old = {'commit': history[-1]['sha'], 'committed_at': commit_time(history[-1])}
        frontiers[str(pr)] = {**old, 'kappa': kappa(json.loads(content(CROC, path, sha)))}
    ledgers = ledger(stored.get('ledger', {}), sha, api, content)
    if (revisions == stored['selected_revisions'] and frontiers == stored['frontiers'] and ledgers == stored.get('ledger')
            and 'read_error' not in stored):
        return stored  # Nothing new: keep the bytes, so that a quiet hour makes no commit.
    return {**{k: v for k, v in stored.items() if k != 'read_error'}, 'checked_at': now, 'selected_revisions': revisions,
            'frontiers': frontiers, 'ledger': ledgers}

def failed(root, now, error):
    """The stored file with read_error set; the first failure time stays, so that repeated failures change no bytes."""
    path = root / FILE
    stored = json.loads(path.read_text()) if path.exists() else empty()
    if 'read_error' in stored:
        return stored
    return {**stored, 'read_error': {'since': now, 'message': error}}
