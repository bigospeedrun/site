#!/usr/bin/env python3
"""Refresh known races through gh GET only; validate a staging copy before publication."""
import copy, fcntl, hashlib, json, os, re, shutil, subprocess, tempfile
from datetime import datetime, timezone
from fractions import Fraction
from pathlib import Path
from github_read import api, pages, content
import claim_judge
ROOT = Path(__file__).resolve().parent
CROC = 'CrocSwap/integer-mult-bounds'
SWAP = 'Swapnil-jain/integer-mult-kappa'
IMPORTER_VERSION = 7
# A CrocSwap PR is listed only when its own research package states a kappa (Nil,
# 2026-10-17, after #3093 was listed from its title 'audit ... against kappa=0.1').
# The package is the one research/<dir>/CLAIM.json that the PR adds; its 'kappa'
# field is the exact claimed value (82 of 86 packages on main write it as p/q, 2 as an
# exact decimal, 2 as text, 2026-10-17). A package whose status says 'no new kappa' has no
# kappa field (all 15 such packages on main, 2026-10-17).
CLAIM_PATH = re.compile(r'research/[^/]+/CLAIM\.json')
# A title that names a kappa value, without a structured claim, goes to the lead:
# 'κ = 0.0017', 'kappa 0.1', 'kappa from 0.00172 to 0.00173', 'kappa>=0.1',
# 'kappa of 0.0017', 'new record 0.0017'. The title only routes to review; it never lists.
NAMES_KAPPA = re.compile(r'(?:κ|kappa)\s*(?:=|≈|:|>=|≥|<=|≤|>|<|\b(?:of|from|to|at|is|now|reaches|becomes)\b)?\s*[-−]?\d'
                         r'|\bnew (?:record|best|bound|leader)\b\D{0,20}\d*\.\d', re.I)
# Packages of PRs listed from their titles before 2026-10-17 (surveyed that day: every
# scored PR since #2850). Another PR that adds one of these paths does not own it.
LEGACY_CLAIM_PATHS = {f'research/{d}/CLAIM.json': n for n, d in {
    2853: 'gmx-t74-borrow43-handoff', 2857: 'shared-kernel-repacking', 2894: 'shared-kernel-packing',
    2948: 'paired-extension-cap-fill-rewrites', 2957: 'paired-extension-cap-fill-swaps',
    2966: 'paired-extension-normal45-rewrites', 3015: 'rank7-joint-endframes-restore-edit',
    3042: 'rank7-restore-carrier-skips', 3051: 'rank7-six-skip-cap-release'}.items()}
# The last PR that the title parser listed before the structured rule was ruled
# (2026-10-17). A later title-parsed row (#3115, listed by the 03:17Z run of the old
# code) is read again under the structured rule.
LAST_TITLE_PARSED_PR = 3114
DECISIONS = 'review-decisions.json'
CLAIM_QUEUE = 'claim-review.json'
# PRs whose title names a kappa value that the PR does not claim (lead review).
NOT_CLAIMS = {
    3093: 'Audit of the #2979 profile against kappa = 0.1; the PR claims no kappa improvement.',
    3107: 'Kappa 0.1 budget screens; the PR claims no kappa improvement.',
    3111: 'Shows the selected bit profile exceeds the kappa = 0.1 budget; the PR claims no kappa improvement.',
}
MAX_SCORE_CHARS = 4096  # record score maxLength in schemas/problem-v1.json

def dump(root, path, data):
    p = root / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')

def load(root, path):
    return json.loads((root / path).read_text())

def artifact(root, path):
    return {'path': path, 'sha256': hashlib.sha256((root / path).read_bytes()).hexdigest()}

def best(problem):
    pool = [r for r in problem['records'] if r['id'].startswith('crocswap-') and problem['record_metadata'][r['id']]['eligible_for_record']]
    r = max(pool, key=lambda r: Fraction(r['score']))
    return {k: r[k] for k in ('id', 'score', 'title', 'submission_url')}

# sources/crocswap-pulls.json keeps only the fields that refresh reads; the PR body
# is in sources/pr-<n>.json. The full API dump was 68 MB on 2026-10-17 (about 24 KB
# per PR, growing ~6 MB a day toward GitHub's 100 MB file limit); this index is ~1.6 MB.
def pull_index(p):
    return {'number': p['number'], 'html_url': p['html_url'], 'title': p['title'], 'state': p['state'],
            'created_at': p['created_at'], 'updated_at': p['updated_at'], 'closed_at': p['closed_at'], 'merged_at': p['merged_at'],
            'user': {'login': p['user']['login'], 'html_url': p['user']['html_url']}, 'head': {'sha': p['head']['sha']},
            'base': {'ref': (p.get('base') or {}).get('ref')}}

def exists(repo, path, sha):
    try:
        content(repo, path, sha)
        return True
    except RuntimeError as error:
        if '(HTTP 404)' in str(error):
            return False
        raise

# A stacked PR carries its parents' packages too (#3200 adds its own package plus
# those of #3198 and #3190, 2026-10-17). A package belongs to the lowest-numbered PR
# among the STACK_SCAN nearest lower PRs that adds it.
STACK_SCAN = 30

def base_ref(p):
    return (p.get('base') or {}).get('ref') or ''

def claim_files(m, pulls_by_number, old, fetched):
    """[[status, path], ...] of the research/*/CLAIM.json files PR m adds or changes at its
    head; cached in submissions (claim_files, claim_files_head, claim_files_base), so each
    head is read once per base (a stacked PR retargeted to main shows more files)."""
    p = pulls_by_number[m]; prior = old.get(m) or {}
    if (prior.get('claim_files_head') == p['head']['sha'] and (prior.get('claim_files_base') or '') == base_ref(p)
            and 'claim_files' in prior):
        return prior['claim_files']
    if m not in fetched:
        fetched[m] = [[f['status'], f['filename']] for f in pages(f'repos/{CROC}/pulls/{m}/files')
                      if f['status'] != 'removed' and CLAIM_PATH.fullmatch(f['filename'])]
    return fetched[m]

def package_claim(stage, p, main_sha, owners, files_of, lower_prs):
    """(score, claim_path, reason): the kappa that the PR's own research package states.

    files_of(m) gives the CLAIM.json files of PR m; lower_prs are the PR numbers below
    this one, nearest first. reason is None when the PR is listed, or when it names
    no kappa at all."""
    n = p['number']; head = p['head']['sha']
    names = bool(NAMES_KAPPA.search(p['title']))
    files = files_of(n)
    added = [path for status, path in files if status == 'added']
    # Who else holds each added package: a PR listed for it, main (the PR is open, #3093),
    # or a lower PR that adds it too (a parent in a stack, even one not listed yet).
    holder = {path: f'PR #{owners[path]}' for path in added if path in owners}
    if p['state'] == 'open':
        holder |= {path: 'main' for path in added if path not in holder and exists(CROC, path, main_sha)}
    unowned = {path for path in added if path not in holder}
    for m in lower_prs[:STACK_SCAN] if unowned else ():
        for status, path in files_of(m):
            if status == 'added' and path in unowned:
                holder[path] = f'PR #{m}'; unowned.discard(path)
        if not unowned:
            break
    own = [path for path in added if path not in holder]
    if len(added) == 1 and not own:
        path = added[0]
        return None, path, (f'{path} is already on main.' if holder[path] == 'main' else f'{path} belongs to {holder[path]}.')
    if len(own) != 1:
        if names:
            return None, None, ('The PR adds no single own research package CLAIM.json.' if own or not added
                                else 'Every research package CLAIM.json this PR adds belongs to another PR.')
        if added and not own:
            return None, None, None  # It only carries other PRs' packages: not a claim.
        # A PR that adds or changes a CLAIM.json with a kappa field goes to the lead,
        # whatever its title says (first 5 such files read).
        for status, path in files[:5]:
            try:
                if 'kappa' in json.loads(content(CROC, path, head)):
                    return None, None, f"The PR touches {path}, which has a kappa field, but adds no single own package."
            except (ValueError, TypeError):
                continue
        return None, None, None
    path = own[0]
    raw = content(CROC, path, head)
    try:
        kappa = json.loads(raw).get('kappa')
    except (ValueError, AttributeError):
        return None, path, f'{path} is not a JSON object.'
    if kappa is None:
        return None, path, (f'{path} has no kappa field.' if names else None)
    # From here on the package states a kappa, so every failure goes to the lead.
    if not isinstance(kappa, str) or len(kappa) > MAX_SCORE_CHARS or not re.fullmatch(r'\d+(?:/\d+)?|\d*\.\d+', kappa):
        return None, path, f'{path} kappa is not an exact rational.'
    q = Fraction(kappa)
    if not 0 < q < 1 or len(str(q)) > MAX_SCORE_CHARS:
        return None, path, f'{path} kappa is outside (0, 1).'
    # The package and an independent reading of the PR text must agree (claim_judge.py).
    reason = claim_judge.check(stage, n, head, p['title'], p['body'], str(q))
    if reason:
        return None, path, reason
    (stage / f'sources/pr-{n}-claim.json').write_bytes(raw)
    return str(q), path, None

def claim_state(p, prior, decisions, evaluate):
    """The claim fields of one PR: (score, reason, claim_path, claim_head, claim_text,
    retry, decision). evaluate() reads the PR's package and runs the Claude check."""
    n = p['number']; head_sha = p['head']['sha']
    text_sha = hashlib.sha256((p['title'] + '\n' + (p['body'] or '')).encode()).hexdigest()
    score, reason = None, None
    claim_path, claim_head, claim_text = prior.get('claim_path'), prior.get('claim_head'), prior.get('claim_text')
    decision = decisions.get((n, head_sha))
    if decision:
        # The lead decided this head: no package read and no Claude call. The PR keeps
        # claim_decided, so deleting the decision makes the next run read it again.
        return decision['score'], None, claim_path, head_sha, text_sha, False, decision
    if n in NOT_CLAIMS:
        pass
    elif (claim_head == head_sha and claim_text == text_sha and not prior.get('claim_retry') and not prior.get('claim_decided')
          and (not prior.get('review_reason') or prior.get('claim_files_head') == head_sha)):
        # Already read at this head and text: reuse the result, with no request. A PR the
        # lead must review that was read before stacked ownership is read once more.
        score, reason = prior['claimed_score'], prior.get('review_reason')
    elif prior.get('claimed_score') is not None and not claim_head and n <= LAST_TITLE_PARSED_PR:
        # Listed from its title before 2026-10-17: it keeps its score and identity.
        score = prior['claimed_score']
    elif prior and not claim_head and prior['source_commit'] == head_sha and n <= LAST_TITLE_PARSED_PR:
        pass  # Unchanged since before structured claims: not a claim.
    else:
        score, claim_path, reason = evaluate()
        claim_head, claim_text = head_sha, text_sha
        # A check without a verdict (API failure, no key, call budget) runs again next
        # run. Meanwhile a row listed by an earlier agreement keeps its last agreed score,
        # so it does not leave the board and come back. A row listed by a deleted
        # decision does not: the revocation stands.
        if isinstance(reason, claim_judge.Retry) and score is None and prior.get('claimed_score') is not None and not prior.get('claim_decided'):
            score, claim_path = prior['claimed_score'], prior.get('claim_path')
    retry = isinstance(reason, claim_judge.Retry)
    return score, reason, claim_path, claim_head, claim_text, retry, decision

def refresh(stage, now):
    day = now[:10]
    claim_judge.calls_left = claim_judge.CALLS_PER_RUN
    problem = load(stage, 'integer-multiplication.json')
    before = copy.deepcopy(problem)
    subs = load(stage, 'submissions.json')
    old = {s['pr_number']: s for s in subs['items']}
    records = {r['id']: r for r in problem['records']}
    template = copy.deepcopy(records['crocswap-pr-61'])
    metadata = problem['record_metadata']
    mt = copy.deepcopy(metadata['crocswap-pr-61'])
    pulls = sorted(pages(f'repos/{CROC}/pulls', {'state': 'all', 'sort': 'created', 'direction': 'asc'}), key=lambda p: p['number'])
    assert len({p['number'] for p in pulls}) == len(pulls)
    assert set(old) <= {p['number'] for p in pulls}, 'PR coverage regressed'
    heads = {}
    repo_meta = {}
    for repo in (CROC, SWAP):
        meta = api(f'repos/{repo}')
        head = api(f'repos/{repo}/commits/{meta["default_branch"]}')
        # File diffs are unused metadata and can contain workstation paths.
        for changed_file in head.get('files', []):
            changed_file.pop('patch', None)
        heads[repo] = head
        repo_meta[repo] = meta
    decisions = {(d['pr'], d['head']): d for d in (load(stage, DECISIONS) if (stage / DECISIONS).exists() else {}).get('claims', [])}
    fingerprint = hashlib.sha256(json.dumps({'importer_version':IMPORTER_VERSION,'prompt_version':claim_judge.PROMPT_VERSION,'decisions':sorted(map(list, decisions)),'heads': {repo: h['sha'] for repo,h in heads.items()}, 'pulls': [{k:p[k] for k in ('number','title','body','updated_at','merged_at','closed_at','state')} | {'head_sha':p['head']['sha']} for p in pulls]}, sort_keys=True).encode()).hexdigest()
    # A PR whose Claude check gave no verdict is read again even when nothing changed.
    if load(stage, 'sources/intake.json').get('fingerprint') == fingerprint and not any(s.get('claim_retry') for s in subs['items']):
        return dict(checked_at=now,new_prs=[],new_merged_records=[],previous_record=best(before),current_record=best(before),new_current_record=False,unparsed_new_prs=[])
    dump(stage, 'sources/crocswap-pulls.json', [pull_index(p) for p in pulls])
    for repo, head in heads.items():
        meta = repo_meta[repo]
        prefix = 'sources/' + repo.replace('/', '__')
        dump(stage, prefix + '__repo.json', meta)
        dump(stage, prefix + '__head.json', head)
        (stage / (prefix + '__README.md')).write_bytes(content(repo, 'README.md', head['sha']))
    items = []
    new_merged = []
    owners = LEGACY_CLAIM_PATHS | {s['claim_path']: s['pr_number'] for s in subs['items'] if s.get('claim_path') and s['claimed_score']}
    pulls_by_number = {p['number']: p for p in pulls}
    numbers = sorted(pulls_by_number)
    fetched = {}
    files_of = lambda m: claim_files(m, pulls_by_number, old, fetched)
    for p in pulls:
        n = p['number']; prior = old.get(n) or {}; head_sha = p['head']['sha']
        status = 'merged' if p['merged_at'] else 'open' if p['state'] == 'open' else 'closed-unmerged'
        others = {path: pr for path, pr in owners.items() if pr != n}
        score, reason, claim_path, claim_head, claim_text, retry, decision = claim_state(
            p, prior, decisions, lambda: package_claim(stage, p, heads[CROC]['sha'], others, files_of,
                                                       [m for m in reversed(numbers) if m < n]))
        if claim_path and score and claim_head == head_sha and not decision:
            owners[claim_path] = n
        prior = prior or None
        ids = list(prior['record_ids']) if prior and prior['record_ids'] and score else ([f'crocswap-pr-{n}'] if score else [])
        ap = f'sources/pr-{n}.json'
        dump(stage, ap, {k: p[k] for k in ['number','html_url','title','body','created_at','updated_at','closed_at','merged_at','state']})
        item = dict(pr_number=n, author=p['user']['login'], author_url=p['user']['html_url'], title=p['title'], url=p['html_url'], submitted_at=p['created_at'], updated_at=p['updated_at'], source_commit=p['head']['sha'], upstream_status=status, upstream_status_at=p['merged_at'] or p['closed_at'] or p['created_at'], checked_at=day, claimed_score=score, record_ids=ids, note=(prior['note'] if prior and prior['title']==p['title'] else None) if score else NOT_CLAIMS.get(n) or reason or (prior or {}).get('note') or 'No research package kappa claim.')
        if claim_path: item['claim_path'] = claim_path
        if claim_head: item['claim_head'] = claim_head
        if claim_text: item['claim_text'] = claim_text
        if retry: item['claim_retry'] = True
        if decision: item['claim_decided'] = True
        if reason: item['review_reason'] = reason
        items.append(item)
        if status == 'merged' and ids and (not prior or prior['upstream_status'] != 'merged'):
            new_merged.extend(ids)
        for rid in ids:
            r = records.get(rid, copy.deepcopy(template))
            m = metadata.get(rid, copy.deepcopy(mt))
            new = rid not in records
            r.update(id=rid, score=r['score'] if rid.endswith('-stacked') else score, title=p['title'], submitted_at=p['created_at'], upstream_status=status, upstream_status_at=item['upstream_status_at'], source_commit=p['head']['sha'], source={'kind':'repo-artifact','url':p['html_url']}, submission_url=p['html_url'], artifact=artifact(stage, ap), authors=[{'name':p['user']['login'],'url':p['user']['html_url']}])
            if new:
                r['site_observed_at'] = now
            r['predecessors'] = [f'https://github.com/{CROC}/pull/{x}' for x in sorted({int(x) for x in re.findall(r'(?<!\w)#(\d+)\b', p['body'] or '') if 0<int(x)<n})]
            r['evidence']['paper_url'] = p['html_url']
            for d in r['dependencies']:
                d['source_url'] = p['html_url']
            m.update(checked_at=day, source_url=p['html_url'], pr_number=n, merged=bool(p['merged_at']), merged_at=p['merged_at'], closed_at=p['closed_at'], updated_at=p['updated_at'], eligible_for_record=bool(p['merged_at']), upstream_selected=False, publication_date=p['created_at'], publication_source_url=p['html_url'], race_event_at=p['created_at'])
            if new:
                m.pop('upstream_readme', None)
                m['score_source'] = f'kappa in {claim_path} at the PR head; source claim only' if claim_head and claim_path else 'Lead review decision; source claim only'
            records[rid] = r; metadata[rid] = m
        for rid in prior['record_ids'] if prior else []:
            if rid not in ids:
                records.pop(rid, None); metadata.pop(rid, None)
    # A maintainer can publish a reviewed integration without merging its source PR.
    head = heads[CROC]; sha = head['sha']
    raw = content(CROC, 'certificates/selected-result.json', sha)
    selected = json.loads(raw)
    score = str(Fraction(selected['kappa']))
    ap = f'sources/crocswap-selected-{sha}.json'; (stage / ap).write_bytes(raw)
    cert = selected['certificate']
    cert_raw = content(CROC, cert, sha)
    assert hashlib.sha256(cert_raw).hexdigest() == selected['certificate_sha256'], 'Selected certificate hash mismatch'
    (stage / f'sources/crocswap-certificate-{sha}.json').write_bytes(cert_raw)
    rid = 'crocswap-selected-' + hashlib.sha256((score + ':' + selected['certificate_sha256']).encode()).hexdigest()[:16]
    if rid not in records:
        r = copy.deepcopy(template); url = f'https://github.com/{CROC}/blob/{sha}/certificates/selected-result.json'
        r.update(id=rid, score=score, title='CrocSwap reviewed conditional result: ' + score, submitted_at=head['commit']['committer']['date'], site_observed_at=now, upstream_status='not-applicable', upstream_status_at=head['commit']['committer']['date'], source_commit=sha, source={'kind':'repo-artifact','url':url}, submission_url=url, artifact=artifact(stage,ap), authors=[{'name':'CrocSwap community','url':f'https://github.com/{CROC}'}], predecessors=[f'https://github.com/{CROC}/pull/{n}' for n in selected['source_prs']])
        r['evidence']['paper_url']=url
        r['dependencies']=[{'id':'openai-109-transfer','statement':selected['scope'],'source_url':url,'status':'unverified'}]
        records[rid]=r
        metadata[rid]=dict(checked_at=day,source_url=url,site_badge=False,eligible_for_record=True,proof_status=selected['status']+'; not independently rerun',comparison_key='crocswap/integer-multiplication-v1',race_repo=CROC,repo=CROC,upstream_tier='claimed',site_tier='claimed',publication_date_precision='date-time',date_precision='Snapshot commit time; not scientific priority',source_prs=selected['source_prs'])
    for key,m in metadata.items():
        if key.startswith('crocswap-'): m['upstream_selected'] = key==rid
    # Parse the first displayed exact rational in the related repository's README.
    head=heads[SWAP]; sha=head['sha']; readme=(stage/'sources/Swapnil-jain__integer-mult-kappa__README.md').read_text()
    match=re.search(r'\\kappa\s*=\s*\\frac\{(\d+)\}\{(?:10\^\{(\d+)\}|(\d+))\}',readme)
    if not match: raise ValueError('Swapnil headline format changed; last good bundle retained')
    score=str(Fraction(int(match[1]),10**int(match[2]) if match[2] else int(match[3])))
    rid='swapnil-snapshot-'+hashlib.sha256(score.encode()).hexdigest()[:16]
    if not any(r['id'].startswith('swapnil-') and r['score']==score for r in records.values()):
        r=copy.deepcopy(records['swapnil-round-7']); m=copy.deepcopy(metadata['swapnil-round-7'])
        ap=f'sources/swapnil-{sha}-README.md';(stage/ap).write_text(readme)
        url=f'https://github.com/{SWAP}/blob/{sha}/README.md'
        r.update(id=rid,score=score,title='Swapnil Jain current conditional witness: '+score,source_commit=sha,submitted_at=head['commit']['committer']['date'],site_observed_at=now,upstream_status_at=head['commit']['committer']['date'],source={'kind':'repo-artifact','url':url},submission_url=url,artifact=artifact(stage,ap))
        r['evidence']['paper_url']=url
        r['dependencies']=[{'id':'swapnil-transfer','statement':'Retained OpenAI reduction and source-specific proof interfaces in the pinned README; not independently checked.','source_url':url,'status':'unverified'}]
        m.update(checked_at=day,source_url=url,eligible_for_record=False,date_precision='Snapshot commit timestamp; not scientific priority')
        records[rid]=r;metadata[rid]=m
    problem.update(records=list(records.values()),checked_at=day,updated_at=now)
    # Cache each PR's CLAIM.json file list per head (stacked ownership, see package_claim).
    for item in items:
        m = item['pr_number']; prior = old.get(m) or {}
        if m in fetched:
            item['claim_files'], item['claim_files_head'] = fetched[m], item['source_commit']
            item['claim_files_base'] = base_ref(pulls_by_number[m])
        elif (prior.get('claim_files_head') == item['source_commit'] and (prior.get('claim_files_base') or '') == base_ref(pulls_by_number[m])
              and 'claim_files' in prior):
            item['claim_files'], item['claim_files_head'], item['claim_files_base'] = prior['claim_files'], prior['claim_files_head'], prior['claim_files_base']
    subs.update(items=items,checked_at=day)
    dump(stage,'integer-multiplication.json',problem);dump(stage,'submissions.json',subs)
    reg=load(stage,'registry.json');reg['checked_at']=day;reg['updated_at']=now
    for listing in reg['repositories']:
        if listing['repo'] in heads:
            listing['checked_at']=day
            path=listing['manifest_source']['path'];manifest=load(stage,path)
            manifest['rules_url']=f"https://github.com/{listing['repo']}/blob/{heads[listing['repo']]['sha']}/"+('CONTRIBUTING.md' if listing['repo']==CROC else 'README.md')
            # A related listing can pin the same adapter manifest. Do not change
            # its bytes underneath that listing's independently pinned revision.
            shared=any(other is not listing and other.get('manifest_source') and
                       other['manifest_source']['path']==path for other in reg['repositories'])
            if shared and manifest!=load(stage,path):
                path='manifests/'+listing['repo'].replace('/','--')+'--'+heads[listing['repo']]['sha']+'.json'
                listing['manifest_source']['path']=path
            dump(stage,path,manifest);listing['rules_url']=manifest['rules_url'];listing['manifest_source']['revision']='sha256:'+artifact(stage,path)['sha256']
    dump(stage,'registry.json',reg)
    queue=[dict(pr=s['pr_number'],head=s['source_commit'],title=s['title'],url=s['url'],reason=s['review_reason']) for s in items if s.get('review_reason') and s['upstream_status'] != 'closed-unmerged' and not isinstance(s['review_reason'], claim_judge.Deferred)]
    dump(stage,CLAIM_QUEUE,{'queue':queue})
    dump(stage,'sources/intake.json',dict(checked_at=day,assembled_at=now,pulls_source=f'https://api.github.com/repos/{CROC}/pulls',count=len(pulls),fingerprint=fingerprint))
    return dict(checked_at=now,new_prs=[p['number'] for p in pulls if p['number'] not in old],new_merged_records=new_merged,previous_record=best(before),current_record=best(problem),new_current_record=best(before)!=best(problem),unparsed_new_prs=[s['pr_number'] for s in items if s['pr_number'] not in old and s['claimed_score'] is None])

def git_state_dir():
    return Path(subprocess.check_output(['git','rev-parse','--absolute-git-dir'],cwd=ROOT,text=True).strip())

def main():
    state = git_state_dir()
    with (state/'refresh.lock').open('w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        tracked=subprocess.check_output(['git','ls-files'],cwd=ROOT,text=True).splitlines()
        dirty=subprocess.check_output(['git','diff','--relative','--name-only','HEAD','--','.'],cwd=ROOT,text=True).splitlines()
        if any(p.endswith('.json') or p.startswith('sources/') for p in dirty):
            raise RuntimeError('Data has uncommitted edits; commit or review them before refresh')
        originals={p:(ROOT/p).read_bytes() for p in tracked if (ROOT/p).is_file()}
        with tempfile.TemporaryDirectory(prefix='.refresh-',dir=state) as temp:
            stage=Path(temp)
            for p,raw in originals.items():
                (stage/p).parent.mkdir(parents=True,exist_ok=True);(stage/p).write_bytes(raw)
            now=datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
            summary=refresh(stage,now)
            subprocess.run(['python3',str(stage/'validate.py')],check=True,cwd=stage)
            changed=[]
            for path in sorted(stage.rglob('*')):
                if not path.is_file():continue
                rel=path.relative_to(stage).as_posix();raw=path.read_bytes()
                if originals.get(rel)==raw:continue
                target=ROOT/rel
                if target.exists() and target.read_bytes()!=originals.get(rel):raise RuntimeError('Concurrent edit: '+rel)
                changed.append((rel,raw))
            for rel,raw in changed:
                target=ROOT/rel;target.parent.mkdir(parents=True,exist_ok=True)
                temp_path=target.with_name(target.name+'.refresh-tmp');temp_path.write_bytes(raw);os.replace(temp_path,target)
            summary['changed_files']=[p for p,_ in changed]
            dump(state,'refresh-summary.json',summary)
            print(json.dumps(summary,indent=2))
if __name__=='__main__':main()
