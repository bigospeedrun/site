#!/usr/bin/env python3
"""Import reviewed prove2.me campaign results, with anonymous GET requests only.

prove2.me (https://prove2.me) checks Lean proofs on its server. Its API needs an
account for every read (checked 2026-10-17), so this importer reads two public
sources instead:
  - the campaign web page https://prove2.me/campaigns/<slug>, which holds the
    entry timeline (mission, attested value, proved flag, solved time);
  - the daily export github.com/prove2me/formalpedia (Apache-2.0), which holds
    each statement, definition and accepted solution.

prove2me-trust.json is the hand-reviewed list of campaign entries per board. A
board imports only when every check passes: the campaign rules, every proved
entry, and the sha256 of every listed file are as reviewed. On any difference
the board is held: its last imported rows and links stay as they were, and the
script exits with code 3. The workflow then fails the run at its end, and the
dead-man check (prove2me-import item in ~/nil/bigospeedrun-data/deadman.py)
alerts the lead with the reason.

An entry with action "link" adds a prove2.me link to an existing board row
(data/prove2me.json, read by the site). A link needs the same proof: the
reviewer records the evidence in "same_proof" (the prove2.me entry names the
row's source, or the proof content matches). An entry with action "row" adds a
row when the result was the best on the board at its solved time, or when it beats the baseline and every
Lean Verified row of the board at its solved time (a better Claimed or Human Verified row does not block it). A board row
with the same value but another proof must be listed in "same_value_rows".
A proved entry that the trust file does not list holds the board, unless it was proved after
the newest export snapshot (MANIFEST.json generated_at): its goal cannot be in the export yet, so
it waits for the next export and the board still imports. If the export has no goal for it
UNEXPORTED_DAYS days after the proof, the board holds, so the dead-man item alerts.
A page layout or file format change makes the parse fail, which holds the board.
"""
import argparse
import copy
import hashlib
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parent
# Imported rows get Lean Verified when this is True, else Claimed. Nil ruling
# 2026-10-14 (restated 2026-10-17): a matching verified prove2.me result counts as
# Lean Verified.
LEAN_VERIFIED = True
CAMPAIGN_URL = 'https://prove2.me/campaigns/'
RAW_URL = 'https://raw.githubusercontent.com/'
USER_AGENT = 'bigospeedrun-refresh (+https://bigospeedrun.com)'
RULE_KEYS = ('id', 'slug', 'status', 'value_type', 'bound_type', 'value_direction')
# A proved entry that the newest export snapshot predates waits this long for the next export.
UNEXPORTED_DAYS = 3
MAX_BYTES = 5 * 1024 * 1024
REASON_CAP = 200
PUSH = 'self.__next_f.push('


class Hold(Exception):
    """A difference from the reviewed trust file. The board keeps its last import."""


def require(condition, reason):
    if not condition:
        raise Hold(reason)


def safe_text(value, cap=REASON_CAP):
    """Hold reasons quote prove2.me and GitHub text. Escape it to ASCII on one line and
    cap it, so it cannot form a workflow command or a long log or state entry."""
    text = ascii(str(value))[1:-1]
    text = ' '.join(text.replace('\\n', ' ').replace('\\r', ' ').replace('\\t', ' ').split())
    return text if len(text) <= cap else text[:cap - 3] + '...'


def fetch(url):
    last = None
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
            with urllib.request.urlopen(request, timeout=30) as response:
                raw = response.read(MAX_BYTES + 1)
            require(len(raw) <= MAX_BYTES, f'{url} is over {MAX_BYTES} bytes')
            return raw
        except OSError as error:
            last = error
            time.sleep(2 * (attempt + 1))
    raise Hold(f'cannot read {url}: {type(last).__name__}')


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def json_bytes(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()


def campaign_data(html):
    """Return (rules, entries) from the Next.js payload of a campaign page."""
    # Plain string search keeps the scan linear in the page size.
    chunks, position = [], 0
    while True:
        start = html.find(PUSH, position)
        end = html.find(')</script>', start) if start >= 0 else -1
        if end < 0:
            break
        chunks.append(html[start + len(PUSH):end])
        position = end + 1
    payload = ''
    for chunk in chunks:
        try:
            item = json.loads(chunk)
        except ValueError:
            continue
        if len(item) > 1 and isinstance(item[1], str):
            payload += item[1]
    decoder = json.JSONDecoder()
    start = payload.find('"entries":[{')
    require(start >= 0, 'campaign page has no entry list')
    entries, _ = decoder.raw_decode(payload, start + len('"entries":'))
    start = payload.find('"rules":{')
    require(start >= 0, 'campaign page has no rules')
    rules, _ = decoder.raw_decode(payload, start + len('"rules":'))
    require(isinstance(entries, list) and isinstance(rules, dict), 'campaign page has an unknown shape')
    for entry in entries:
        require(isinstance(entry, dict) and all(k in entry for k in ('mission_id', 'attested_value', 'proved', 'solved_at')),
                'campaign entry has an unknown shape')
    return rules, entries


def split_header(raw):
    """Formalpedia files start with '--' header lines and one blank line. Its index
    hashes the bytes after them, so the reviewed hashes cover the same bytes."""
    lines = raw.split(b'\n')
    i = 0
    header = {}
    while i < len(lines) and lines[i].startswith(b'--'):
        match = re.match(r'--\s*(\w+)\s*:\s*(.*)$', lines[i].decode('utf-8', 'replace'))
        if match and match[1] not in header:
            header[match[1]] = match[2].strip()
        i += 1
    if i < len(lines) and lines[i] == b'':
        i += 1
    return header, b'\n'.join(lines[i:])


def module_name(path):
    match = re.fullmatch(r'envs/[0-9a-f]+/(Definitions|Theorems)/([A-Za-z0-9_]+)\.lean', path)
    require(match, 'invalid Formalpedia path ' + path)
    return match[1] + '.' + match[2]


def utc(stamp):
    return datetime.fromisoformat(stamp.replace('Z', '+00:00')).astimezone(timezone.utc)


def zulu(stamp):
    return utc(stamp).strftime('%Y-%m-%dT%H:%M:%SZ')


def record_time(record, meta):
    stamp = meta.get('publication_date') or record.get('submitted_at') or record.get('site_observed_at')
    if record.get('kind') == 'baseline' or not stamp:
        return datetime.min.replace(tzinfo=timezone.utc)
    try:
        return utc(stamp)
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)


def lean_verified_time(record, meta):
    """When a verified row became Lean Verified: its passed rerun, else its record time."""
    rerun = record.get('rerun_status') or {}
    if rerun.get('state') == 'passed' and rerun.get('checked_at'):
        try:
            return utc(rerun['checked_at'])
        except ValueError:
            pass
    return record_time(record, meta)


def beats_all(value, earlier, better):
    return all(better(value, score) for score in earlier)


class Files:
    """Formalpedia files, read once per run."""

    def __init__(self, get, repo, ref):
        self.get = get
        self.base = f'{RAW_URL}{repo}/{ref}/'
        self.cache = {}

    def read(self, path):
        if path not in self.cache:
            self.cache[path] = split_header(self.get(self.base + path))
        return self.cache[path]

    def generated_at(self):
        """The time of the export snapshot (MANIFEST.json), as a datetime."""
        if 'MANIFEST.json' not in self.cache:
            try:
                stamp = utc(json.loads(self.get(self.base + 'MANIFEST.json'))['generated_at'])
            except (ValueError, KeyError, TypeError, AttributeError):
                raise Hold('the Formalpedia MANIFEST.json has an unknown shape')
            self.cache['MANIFEST.json'] = stamp
        return self.cache['MANIFEST.json']


def unexported(entry, files, today):
    """An unreviewed proved entry. If it was proved after the newest export snapshot, its goal cannot be in the
    export yet: it waits, for UNEXPORTED_DAYS days after it was proved. An entry that the export could hold
    (proved before the snapshot) holds the board, as does a wait that ran out."""
    label = f'unreviewed proved entry {entry["attested_value"]} (mission {entry["mission_id"]})'
    proved = max(utc(entry[key]) for key in ('solved_at', 'recorded_at') if entry.get(key))
    # A time in the future could keep an entry waiting for ever, so it holds the board.
    require(proved.strftime('%Y-%m-%d') <= today, f'{label} is dated in the future')
    if proved <= files.generated_at():
        raise Hold(label)
    require(today <= (proved + timedelta(days=UNEXPORTED_DAYS)).strftime('%Y-%m-%d'),
            f'{label} is still not in the Formalpedia export {UNEXPORTED_DAYS} days after it was proved')


def verify_campaign(board, files, get, today):
    """Check the campaign page and the reviewed definitions against the trust file."""
    html = get(CAMPAIGN_URL + board['campaign']['slug']).decode('utf-8', 'replace')
    rules, live = campaign_data(html)
    for key in RULE_KEYS:
        require(rules.get(key) == board['campaign'][key], f'campaign {key} is {rules.get(key)!r}, reviewed {board["campaign"][key]!r}')
    reviewed = {e['mission_id']: e for e in board['entries']}
    by_mission = {e['mission_id']: e for e in live}
    for entry in live:
        if entry['proved'] is True and entry['mission_id'] not in reviewed:
            unexported(entry, files, today)
    for entry in board['entries']:
        now = by_mission.get(entry['mission_id'])
        require(now, f'reviewed entry {entry["value"]} is no longer in the campaign')
        require(now['proved'] is True, f'entry {entry["value"]} is no longer proved')
        require(now['attested_value'] == entry['value'], f'entry {entry["value"]} now has value {now["attested_value"]}')
        require(now['solved_at'] == entry['solved_at'], f'entry {entry["value"]} has a new solved time')
        # A "wait" entry is proved on prove2.me but not in the Formalpedia export yet. It may wait
        # until its wait_until date; after that the board holds, so it cannot wait unnoticed.
        if entry['action'] == 'wait':
            require(today <= entry['wait_until'], f'entry {entry["value"]} is still not reviewable after {entry["wait_until"]}')
    for path, digest in board['definitions'].items():
        header, body = files.read(path)
        require(header.get('status') == 'Definition', f'{path} status is {header.get("status")!r}')
        require(sha(body) == digest, f'{path} changed')


def verify_entry(entry, board, files):
    """Check one reviewed goal and its accepted solution against the pinned hashes."""
    theorem, solution = entry['theorem'], entry['solution']
    header, body = files.read(theorem['statement_path'])
    require(header.get('status') == 'Proved', f'{theorem["name"]} status is {header.get("status")!r}')
    require(header.get('url') == theorem['url'], f'{theorem["name"]} has a new theorem URL')
    require(sha(body) == theorem['statement_sha256'], f'{theorem["name"]} statement changed')
    # theorem['definitions'] is the reviewed import closure of the statement.
    require(all(p in board['definitions'] for p in theorem['definitions']), f'{theorem["name"]} uses an unreviewed definition file')
    closure = {module_name(p).encode() for p in theorem['definitions']} | {m.encode() for m in theorem.get('allowed_imports', [])}
    for text in [body] + [files.read(p)[1] for p in theorem['definitions']]:
        imports = set(re.findall(rb'(?m)^import\s+(\S+)', text))
        # Mathlib itself (also a Mathlib.* module) is trusted; any other import must be in the reviewed closure.
        require(all(i in closure or i == b'Mathlib' or i.startswith(b'Mathlib.') for i in imports), f'{theorem["name"]} imports changed')
    pattern = board.get('statement_pattern', r'SolvedInTime \(?{value}\b')
    require(re.search(pattern.replace('{value}', re.escape(entry['value'])).encode(), body), f'{theorem["name"]} does not state {entry["value"]}')
    header, body = files.read(solution['path'])
    require(header.get('status', '').startswith('ACCEPTED'), f'{solution["path"]} status is {header.get("status")!r}')
    require(sha(body) == solution['sha256'], f'{solution["path"]} changed')


def check_board(slug, board, doc, files, get, today='9999-12-31'):
    """Return the import plan for one board, or raise Hold."""
    verify_campaign(board, files, get, today)
    records = [r for r in doc['records'] if not doc['record_metadata'][r['id']].get('prove2me')]
    meta = doc['record_metadata']
    better = (lambda a, b: a < b) if doc['score']['direction'] == 'lower-is-better' else (lambda a, b: a > b)
    known = [(record_time(r, meta[r['id']]), Fraction(r['score'])) for r in records
             if not meta[r['id']].get('reproduction_of') and r.get('upstream_status') != 'closed-unmerged']
    # The baseline and the Lean Verified rows, with the time each became Lean Verified. A result that is
    # not the best overall still gets a Lean Verified row when it beats all of these at its solved time.
    known_lv = [(datetime.min.replace(tzinfo=timezone.utc) if r.get('kind') == 'baseline' else lean_verified_time(r, meta[r['id']]), Fraction(r['score']))
                for r in records if (r.get('kind') == 'baseline' or r.get('tier') == 'verified')
                and not meta[r['id']].get('reproduction_of') and r.get('upstream_status') != 'closed-unmerged']
    plan = dict(links={}, rows=[], upgrades=[])
    for entry in sorted(board['entries'], key=lambda e: utc(e['solved_at'])):
        value = Fraction(entry['value'])
        if entry['action'] == 'wait':
            continue
        if entry['action'] == 'skip':
            # A skipped result still counts for best-at-its-time, unless review found it unsound.
            if not entry.get('unsound'):
                known.append((utc(entry['solved_at']), value))
            continue
        theorem = entry['theorem']
        verify_entry(entry, board, files)
        solved = utc(entry['solved_at'])
        same = [r for r in records if Fraction(r['score']) == value]
        if entry['action'] in ('link', 'upgrade'):
            require(entry.get('same_proof'), f'{entry["action"]} for entry {entry["value"]} has no same-proof evidence')
            require(any(r['id'] == entry['record_id'] for r in same), f'board row {entry["record_id"]} with value {entry["value"]} is missing')
            plan['links'][entry['record_id']] = theorem['url']
            # An upgrade makes that row Lean Verified (the row has the same value, source and statement).
            if entry['action'] == 'upgrade':
                plan.setdefault('upgrades', []).append(entry)
        else:
            require(entry['action'] == 'row', f'unknown action {entry["action"]!r}')
            other = sorted(r['id'] for r in same if r['id'] not in entry.get('same_value_rows', []))
            require(not other, f'entry {entry["value"]} now has the same value as board row {", ".join(other)}; review it as a link or list it in same_value_rows')
            earlier = [score for at, score in known if at <= solved]
            earlier_lv = [score for at, score in known_lv if at <= solved]
            require(beats_all(value, earlier, better) or beats_all(value, earlier_lv, better),
                    f'entry {entry["value"]} was not the best result at its solved time, and not the best Lean Verified result either')
            plan['rows'].append(entry)
        if entry['action'] in ('row', 'upgrade'):
            known_lv.append((solved, value))
        known.append((solved, value))
    return plan


OTHER_EPSILON = Fraction(1, 100000)


def claim_number(claim):
    """The number of an Other bounds claim: the first decimal in its display, else an exact fraction."""
    match = re.search(r'\d+\.\d+', claim.get('display', ''))
    if match:
        return Fraction(match[0])
    match = re.fullmatch(r'\s*(\d+)/(\d+)\s*', claim.get('value', ''))
    return Fraction(int(match[1]), int(match[2])) if match else None


def other_known(root, board):
    """(time, number) of the baseline and the claims already on the Other bounds row."""
    data = json.loads((root / board['existing_claims_file']).read_text())
    family = next(f for f in data['families'] if f['slug'] == board['family'])
    known, known_lv = [], []
    baseline = dict(family['baseline'], display=family['baseline'].get('display', family['baseline']['value']))
    for claim in [baseline, *family['claims']]:
        number = claim_number(claim)
        if number is not None:
            known.append((utc(claim['date']), number))
            # The baseline and the Lean Verified claims: what a new Lean Verified result must beat.
            if claim is baseline:
                known_lv.append((datetime.min.replace(tzinfo=timezone.utc), number))
            elif claim.get('evidence') == 'lean-verified':
                known_lv.append((utc(claim['date']), number))
    return family, known, known_lv


def check_other(slug, board, root, files, get, today):
    """Return the import plan for an Other bounds row, or raise Hold. Higher is better."""
    verify_campaign(board, files, get, today)
    family, known, known_lv = other_known(root, board)
    plan = dict(links={}, rows=[], claims=[])
    for entry in sorted(board['entries'], key=lambda e: utc(e['solved_at'])):
        value = Fraction(entry['value'])
        if entry['action'] == 'wait':
            continue
        if entry['action'] == 'skip':
            if not entry.get('unsound'):
                known.append((utc(entry['solved_at']), value))
            continue
        require(entry['action'] == 'row', f'unknown action {entry["action"]!r}')
        verify_entry(entry, board, files)
        solved = utc(entry['solved_at'])
        earlier = [number for at, number in known if at <= solved]
        earlier_lv = [number for at, number in known_lv if at <= solved]
        require(all(value > number + OTHER_EPSILON for number in earlier) or all(value > number + OTHER_EPSILON for number in earlier_lv),
                f'entry {entry["value"]} was not the best result at its solved time, and not the best Lean Verified result either')
        plan['claims'].append(entry)
        known_lv.append((solved, value))
        known.append((solved, value))
    return plan


def claim_for(slug, board, entry, trust):
    """An Other bounds claim (the shape of src/lib/other-bounds.json) for one reviewed entry, and its receipt."""
    theorem, solution = entry['theorem'], entry['solution']
    # The site writes these texts as HTML after its math step (set:html with inlineMath), which
    # escapes only math. Plain text with <, > or & would be HTML, so the board holds instead.
    for label, text in [('note', entry.get('note', '')), ('theorem name', theorem['name']), *[('author name', a['name']) for a in entry['authors']]]:
        require(not re.search(r'[<>&]', text), f'entry {entry["value"]}: the {label} has a character (< > &) that the page cannot show as text')
    mission_url = 'https://prove2.me/missions/' + entry['mission_id']
    key = 'prove2me-' + board['family'] + '-' + entry['value'].replace('.', '-')
    receipt = dict(schema_version=1, source='prove2.me', reviewed_at=trust['reviewed_at'], reviewed_by=trust['reviewed_by'],
                   campaign=board['campaign'], mission_id=entry['mission_id'], mission_url=mission_url,
                   attested_value=entry['value'], solved_at=entry['solved_at'], statement_form=board['statement_form'],
                   formalpedia=trust['formalpedia'], theorem=theorem, solution=solution,
                   definitions={p: board['definitions'][p] for p in theorem['definitions']}, lean_verified=LEAN_VERIFIED)
    raw = json_bytes(receipt)
    path = 'sources/' + key + '.json'
    names = entry['authors']
    claim = dict(author=names[0]['name'], handle='prove2me-' + entry['value'].replace('.', '-'), value=entry['value'],
                 display='\\ge ' + entry['value'], date=zulu(entry['solved_at']), dateSource=theorem['url'], dateKind='first-stated',
                 url=theorem['url'], lean=True,
                 leanNote='Yes: proved on prove2.me, which checks each Lean proof on its server. We reviewed that its Lean statement is this statement.',
                 evidence='lean-verified' if LEAN_VERIFIED else 'claimed', note=entry['note'], authors=names,
                 proofScope='The Lean theorem ' + theorem['name'] + ' on prove2.me states this exponent. Its accepted proof is by ' + ', '.join(n['name'] for n in names) + '.',
                 bound=board['bound_template'].replace('{value}', entry['value']), prove2me=True, receiptSha256=sha(raw))
    return claim, {path: raw}


def row_for(slug, doc, board, entry, trust, previous):
    value = Fraction(entry['value'])
    theorem, solution = entry['theorem'], entry['solution']
    key = 'prove2me-' + slug + '-' + entry['value'].replace('.', '-')
    mission_url = 'https://prove2.me/missions/' + entry['mission_id']
    receipt = dict(schema_version=1, source='prove2.me', reviewed_at=trust['reviewed_at'], reviewed_by=trust['reviewed_by'],
                   campaign=board['campaign'], mission_id=entry['mission_id'], mission_url=mission_url,
                   attested_value=entry['value'], solved_at=entry['solved_at'], statement_form=board['statement_form'],
                   formalpedia=trust['formalpedia'], theorem=theorem, solution=solution,
                   definitions={p: board['definitions'][p] for p in theorem['definitions']}, lean_verified=LEAN_VERIFIED)
    raw = json_bytes(receipt)
    path = 'sources/' + key + '.json'
    tier = 'verified' if LEAN_VERIFIED else 'claimed'
    names = ', '.join(a['name'] for a in entry['authors'])
    old = previous.get(key, {}).get('record', {})
    record = dict(id=key, kind='improvement', score=str(value), score_relation='attained', tier=tier,
                  submitted_at=zulu(entry['solved_at']), spec_version=doc['model']['version'],
                  title=f'{names} prove2.me {slug} result', authors=entry['authors'], predecessors=[],
                  submission_url=theorem['url'], artifact=dict(path=path, sha256=sha(raw)),
                  evidence=dict(paper_url=mission_url, theorem=theorem['name'], certificate_path=None), dependencies=[],
                  upstream_status='not-applicable', upstream_status_at=zulu(entry['solved_at']),
                  site_observed_at=old.get('site_observed_at') or datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
                  source=dict(kind='paper', url=theorem['url']))
    if LEAN_VERIFIED:
        record['rerun_status'] = dict(state='passed', checked_at=zulu(entry['solved_at']), receipt_path=path)
    meta = dict(checked_at=trust['reviewed_at'], eligible_for_record=True,
                proof_status='Proved on prove2.me, which checks each proof with Lean on its server. We reviewed that its statement is our problem statement.',
                upstream_tier='verified', site_tier=tier, comparison_key=doc['problem_id'] + '/v' + doc['model']['version'],
                source_url=theorem['url'], publication_date=zulu(entry['solved_at']), publication_date_precision='date-time',
                publication_date_role='prove2.me goal proved', publication_source_url=mission_url, prove2me=True)
    return record, meta, {path: raw}


def upgrade_for(slug, board, entry, trust):
    """The receipt for an upgrade of an existing row to Lean Verified, by its prove2.me theorem."""
    theorem = entry['theorem']
    receipt = dict(schema_version=1, source='prove2.me', reviewed_at=trust['reviewed_at'], reviewed_by=trust['reviewed_by'],
                   campaign=board['campaign'], mission_id=entry['mission_id'], mission_url='https://prove2.me/missions/' + entry['mission_id'],
                   attested_value=entry['value'], solved_at=entry['solved_at'], statement_form=board['statement_form'], same_proof=entry['same_proof'],
                   formalpedia=trust['formalpedia'], theorem=theorem, solution=entry['solution'], record_id=entry['record_id'],
                   definitions={p: board['definitions'][p] for p in theorem['definitions']}, lean_verified=LEAN_VERIFIED)
    raw = json_bytes(receipt)
    return dict(record_id=entry['record_id'], path='sources/prove2me-' + slug + '-' + entry['record_id'] + '.json', raw=raw,
                theorem=theorem['name'], url=theorem['url'], checked_at=zulu(entry['solved_at']))


UPGRADE_NOTE = 'Proved on prove2.me, which checks each proof with Lean on its server; we reviewed that its Lean statement is this row\'s statement (same value, same source).'
# The platypii note (data/platypii_lean.py) says 'we have not rerun it' about another Lean proof. It goes
# after the prove2.me sentence and starts with 'Separately, a Lean proof', so the two do not contradict.
PLATYPII_START = re.compile(r'(?:Separately, a|A) Lean proof of ')


def with_upgrade_note(text):
    # A row upgraded before this order (17:17Z run, 2026-10-19) has the sentence at the end: move it.
    text = text.replace(' ' + UPGRADE_NOTE, '').replace(UPGRADE_NOTE, '')
    match = PLATYPII_START.search(text)
    if not match:
        return text.rstrip() + ' ' + UPGRADE_NOTE
    return text[:match.start()] + UPGRADE_NOTE + ' Separately, a Lean proof of ' + text[match.end():]


def apply_upgrades(doc, upgrades):
    """Make each upgraded row Lean Verified. The row stays where it is. A later hold leaves it as it is;
    removing an upgrade from the trust file does not undo it (a person edits the row)."""
    if not LEAN_VERIFIED or not upgrades:
        return doc
    doc = copy.deepcopy(doc)
    for up in upgrades:
        row = next(r for r in doc['records'] if r['id'] == up['record_id'])
        meta = doc['record_metadata'][row['id']]
        row['tier'] = 'verified'
        row['evidence']['theorem'] = up['theorem']
        row['rerun_status'] = dict(state='passed', checked_at=up['checked_at'], receipt_path=up['path'])
        meta.update(site_tier='verified', receipt_url=up['url'], prove2me_upgrade=True)
        meta['proof_status'] = with_upgrade_note(meta.get('proof_status', ''))
    return doc


def apply_rows(doc, rows):
    """Put the imported rows in the document. A row keeps its place, so an unchanged
    import leaves the file byte for byte the same."""
    doc = copy.deepcopy(doc)
    wanted = {record['id']: (record, meta) for record, meta in rows}
    kept = []
    for record in doc['records']:
        meta = doc['record_metadata'][record['id']]
        if meta.get('prove2me'):
            if record['id'] in wanted:
                kept.append(wanted[record['id']][0])
                doc['record_metadata'][record['id']] = wanted[record['id']][1]
            else:
                del doc['record_metadata'][record['id']]
            continue
        kept.append(record)
    present = {r['id'] for r in kept}
    for key, (record, meta) in wanted.items():
        if key not in present:
            kept.append(record)
            doc['record_metadata'][key] = meta
    doc['records'] = kept
    return doc


def run(root, get=fetch, now=None):
    """Return (changed files, state, held boards)."""
    now = now or datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    trust = json.loads((root / 'prove2me-trust.json').read_text())
    state_path = root / 'prove2me.json'
    previous = json.loads(state_path.read_text()) if state_path.exists() else {'boards': {}}
    files = Files(get, trust['formalpedia']['repo'], trust['formalpedia']['ref'])
    state = dict(schema_version=1, lean_verified=LEAN_VERIFIED, boards={})
    out, held = {}, {}
    registry = json.loads((root / 'registry.json').read_text())
    data_files = {p['slug']: p['data_file'] for p in registry['problems']}
    for slug, board in trust['boards'].items():
        prior = previous['boards'].get(slug, {})
        if board.get('kind') == 'other':
            try:
                plan = check_other(slug, board, root, files, get, now[:10])
                claims, sources = [], {}
                for entry in plan['claims']:
                    claim, receipt = claim_for(slug, board, entry, trust)
                    claims.append(claim)
                    sources.update(receipt)
                state['boards'][slug] = dict(status='ok', kind='other', family=board['family'], links={}, rows=[], claims=claims)
                out.update(sources)
            except Exception as error:
                reason = safe_text(error if isinstance(error, Hold) else f'unexpected error ({type(error).__name__}: {error})')
                held[slug] = reason
                since = prior.get('since') if prior.get('status') == 'held' and prior.get('reason') == reason else now
                state['boards'][slug] = dict(status='held', kind='other', family=board['family'], reason=reason, since=since, links={}, rows=[],
                                             claims=prior.get('claims', []))
            continue
        doc = json.loads((root / data_files[slug]).read_text())
        prior_rows = {row['record']['id']: row for row in prior.get('rows', [])}
        upgrades = []
        try:
            plan = check_board(slug, board, doc, files, get, now[:10])
            rows, board_sources = [], {}
            for entry in plan['upgrades']:
                up = upgrade_for(slug, board, entry, trust)
                upgrades.append(up)
                board_sources[up['path']] = up['raw']
            for entry in plan['rows']:
                record, meta, sources = row_for(slug, doc, board, entry, trust, prior_rows)
                rows.append((record, meta))
                board_sources.update(sources)
            entry_state = dict(status='ok', links=plan['links'], rows=[dict(record=r, meta=m) for r, m in rows])
            # Receipts join the output only for a board that passed.
            out.update(board_sources)
        except Exception as error:
            # One board's failure, even a crash, holds only that board.
            reason = safe_text(error if isinstance(error, Hold) else f'unexpected error ({type(error).__name__}: {error})')
            held[slug] = reason
            since = prior.get('since') if prior.get('status') == 'held' and prior.get('reason') == reason else now
            rows = [(row['record'], row['meta']) for row in prior.get('rows', [])]
            entry_state = dict(status='held', reason=reason, since=since, links=prior.get('links', {}), rows=prior.get('rows', []))
        state['boards'][slug] = entry_state
        updated = apply_upgrades(apply_rows(doc, rows), upgrades if state['boards'][slug]['status'] == 'ok' else [])
        if updated != doc:
            updated['updated_at'] = now
            updated['checked_at'] = now[:10]
            out[data_files[slug]] = json_bytes(updated)
    if any(name in out for name in data_files.values()):
        registry['updated_at'] = now
        registry['checked_at'] = now[:10]
        out['registry.json'] = json_bytes(registry)
    out['prove2me.json'] = json_bytes(state)
    changed = {p: raw for p, raw in out.items() if not (root / p).exists() or (root / p).read_bytes() != raw}
    return changed, state, held


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check-only', action='store_true', help='validate the staged result and write nothing')
    args = parser.parse_args()
    from direct_refresh import transaction
    try:
        changed, state, held = run(ROOT, fetch)
        transaction(ROOT, changed, args.check_only)
    except Exception as error:
        # Print no traceback: its text can quote fetched data.
        print('prove2.me import failed: ' + safe_text(f'{type(error).__name__}: {error}', 500), file=sys.stderr)
        sys.exit(1)
    lines = []
    for slug, board in state['boards'].items():
        lines.append(f'{safe_text(slug, 40)}: {board["status"]}, {len(board["links"])} links, {len(board["rows"])} rows, {len(board.get("claims", []))} claims'
                     + (f'; held since {board["since"]}: {safe_text(board["reason"])}' if board['status'] == 'held' else ''))
    lines.append(f'{len(changed)} changed files; lean_verified={LEAN_VERIFIED}; check_only={args.check_only}')
    # Every line starts with this prefix, so no line can start with '::'.
    print('\n'.join('prove2.me import: ' + line for line in lines))
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a') as handle:
            handle.write('### prove2.me import\n\n' + '\n'.join('- ' + line for line in lines) + '\n')
    if held:
        # A hold is state in data/prove2me.json, not a failed run: exit 0. The dead-man
        # check (prove2me-import) alerts the lead from that file on main.
        print('prove2.me import: held for ' + ', '.join(safe_text(slug, 40) for slug in held) + '. Review data/prove2me-trust.json.', file=sys.stderr)


if __name__ == '__main__':
    main()
