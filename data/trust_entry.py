#!/usr/bin/env python3
"""The trust commit of a verifier push, written by one command (task 37ae245e).

python3 data/trust_entry.py VERIFIER_CLONE COMMIT [--profile NAME]... [--write]

It computes the controller blob set of the verifier COMMIT exactly as the importer does (git ls-tree -r -z, without the
untrusted_path() files: submissions/ and auto-research*), and compares it with data/direct-trust.json:

- Without --write it only checks. It prints EQUAL, DIFFERS or none for the entry of COMMIT, and for each --profile NAME
  whether profiles[NAME] equals the verifier's profile of the same name at COMMIT (profiles/direct.json), or equals it except
  the execution keys (runner, lake_workers_start), which the importer ignores. It also lists the profiles that differ. The
  exit code is 0 only when every asked check is equal. A reviewer runs this on the pushed commit to check the entry of someone else.
- With --write it adds the entry of COMMIT at the end of previous_controller_blobs (push order) and replaces
  profiles[NAME] by the verifier's profile of that name (not a profile that is equal except the execution keys). It never changes an existing entry: if the entry of COMMIT
  exists and differs, it stops. It prints the draft of the commit message: the parent, the number of files, and the files that
  changed, are new or are removed since the parent's entry (when the trust file has it).

The trust file is written as json.dumps(indent=2, ensure_ascii=False) and a newline, the format of every entry so far."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import sys
from direct_import import same_profile
from direct_refresh import untrusted_path

TRUST = Path(__file__).with_name('direct-trust.json')
PROFILES_PATH = 'profiles/direct.json'


class Stop(Exception):
    pass


def git(clone, *args):
    out = subprocess.run(['git', '-C', str(clone), *args], capture_output=True, check=False)
    if out.returncode:
        raise Stop(f'git {args[0]} failed: ' + out.stderr.decode(errors='replace').strip()[:200])
    return out.stdout


def full_commit(clone, commit):
    if not re.fullmatch('[0-9a-f]{40}', commit):
        out = git(clone, 'rev-parse', '--verify', '-q', commit + '^{commit}').decode().strip()
        if not re.fullmatch('[0-9a-f]{40}', out):
            raise Stop(f'unknown commit: {commit}')
        return out
    git(clone, 'cat-file', '-e', commit + '^{commit}')
    return commit


def blob_set(clone, commit):
    """{path: {sha, mode}} of the commit's tree, in git's path order, without the untrusted paths."""
    entry = {}
    for record in git(clone, 'ls-tree', '-r', '-z', commit).split(b'\0'):
        if not record:
            continue
        meta, path = record.split(b'\t', 1)
        mode, kind, sha = meta.decode().split(' ')
        path = path.decode()
        if kind == 'tree' or untrusted_path(path):
            continue
        entry[path] = {'sha': sha, 'mode': mode}
    return entry


def verifier_profiles(clone, commit):
    raw = git(clone, 'show', f'{commit}:{PROFILES_PATH}')
    data = json.loads(raw)
    return data.get('profiles', data)


def profile_state(ours, theirs):
    """equal, execution (the importer's same_profile accepts the trust profile: only EXECUTION_KEYS differ, and the check chain
    is not switched on or off) or differs. The importer's rule is the rule here, so the two cannot drift."""
    if ours == theirs:
        return 'equal'
    return 'execution' if same_profile(theirs, ours) else 'differs'


def profile_differences(trust, clone, commit):
    """Names that differ from the trust file, names equal except for the execution keys, names only the verifier has, and names
    only the trust file has (a site-only profile such as dft233)."""
    theirs = verifier_profiles(clone, commit)
    states = {name: profile_state(trust['profiles'][name], theirs[name]) for name in theirs if name in trust['profiles']}
    return ([n for n, s in states.items() if s == 'differs'], [n for n, s in states.items() if s == 'execution'],
            [n for n in theirs if n not in trust['profiles']], [n for n in trust['profiles'] if n not in theirs])


def compare(trust, clone, commit, names):
    """(entry, state, parent, profile states): state is none, equal or differs."""
    entry = blob_set(clone, commit)
    old = trust['previous_controller_blobs'].get(commit)
    state = 'none' if old is None else 'equal' if old == entry and list(old) == list(entry) else 'differs'
    parents = git(clone, 'rev-list', '--parents', '-n1', commit).decode().split()[1:]
    profiles = {}
    if names:
        theirs = verifier_profiles(clone, commit)
        for name in names:
            if name not in theirs:
                raise Stop(f'the verifier has no profile {name} at {commit[:7]}')
            if name not in trust['profiles']:
                raise Stop(f'the trust file has no profile {name}')
            profiles[name] = (profile_state(trust['profiles'][name], theirs[name]), theirs[name])
    return entry, state, (parents[0] if parents else None), profiles


def message_facts(trust, clone, entry, commit, parent):
    lines = [f'Verifier {commit}' + (f' (child of {parent[:7]})' if parent else ''),
             f'previous_controller_blobs gets one entry (git ls-tree -r -z, without submissions/ and auto-research*): '
             f'{commit[:7]}, {len(entry)} files.']
    before = trust['previous_controller_blobs'].get(parent) if parent else None
    if before is None:
        lines.append(f'The parent {parent[:7] if parent else "(none)"} has no entry in the trust file: no list of changed files.')
    else:
        changed = [p for p in entry if p in before and before[p] != entry[p]]
        new = [p for p in entry if p not in before]
        gone = [p for p in before if p not in entry]
        lines.append(f'Its parent {parent[:7]} has its set. Changed since that set ({len(changed)}): ' + (', '.join(changed) or 'none')
                     + f'. New: {", ".join(new) or "none"}. Removed: {", ".join(gone) or "none"}.')
        if PROFILES_PATH in changed + new:
            differ, execution, only_verifier, only_trust = profile_differences(trust, clone, commit)
            lines.append(f'{PROFILES_PATH} changed. Profiles that differ from the trust file (pass --profile NAME): '
                         + (', '.join(differ) or 'none') + '.'
                         + (f' Equal except execution keys (not written): {", ".join(execution)}.' if execution else '')
                         + (f' Only in the verifier: {", ".join(only_verifier)}.' if only_verifier else '')
                         + (f' Only in the trust file: {", ".join(only_trust)}.' if only_trust else ''))
        if any(p.startswith('.github/') for p in changed + new + gone):
            lines.append('A workflow file changed.')
        else:
            lines.append('No workflow changed.')
    return lines


def main(argv=None, trust_path=TRUST):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('clone')
    parser.add_argument('commit')
    parser.add_argument('--profile', action='append', default=[], metavar='NAME')
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--trust', default=str(trust_path), help='the trust file (default: data/direct-trust.json next to this script)')
    args = parser.parse_args(argv)
    trust_path = args.trust
    try:
        trust = json.loads(Path(trust_path).read_text())
        commit = full_commit(args.clone, args.commit)
        entry, state, parent, profiles = compare(trust, args.clone, commit, args.profile)
        print(f'{commit} {len(entry)} files; entry: {state}')
        for name, (state_of, _) in profiles.items():
            print(f'profile {name}: ' + {'execution': 'equal except execution keys (runner, lake_workers_start)'}.get(state_of, state_of))
        if not args.write:
            differ = profile_differences(trust, args.clone, commit)[0]
            if differ:
                print('profiles that differ from the trust file: ' + ', '.join(differ))
            return 0 if state == 'equal' and all(s in ('equal', 'execution') for s, _ in profiles.values()) else 1
        if state == 'differs':
            raise Stop('the trust file has a different entry for this commit; an existing entry is never changed')
        if state == 'none':
            trust['previous_controller_blobs'][commit] = entry
        for name, (state_of, theirs) in profiles.items():
            if state_of != 'execution':  # the importer ignores the execution keys: the trust file keeps its own (Lead, 2026-11-02)
                trust['profiles'][name] = theirs
        Path(trust_path).write_text(json.dumps(trust, indent=2, ensure_ascii=False) + '\n')
        written = [n for n, (s_, _) in profiles.items() if s_ != 'execution']
        print('written: ' + ('entry' if state == 'none' else 'no new entry (equal)') + (f', profiles {", ".join(written)}' if written else ''))
        print('--- commit message facts ---')
        print('\n'.join(message_facts(trust, args.clone, entry, commit, parent)))
        return 0
    except Stop as error:
        print(f'STOP: {error}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
