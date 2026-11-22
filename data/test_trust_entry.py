"""trust_entry.py (task 37ae245e): the blob set, the check, the write and the message facts, on a synthetic verifier repository."""
import contextlib
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import trust_entry as t


def git(repo, *args, **kw):
    return subprocess.run(['git', '-C', str(repo), '-c', 'user.name=T', '-c', 'user.email=t@example.invalid', *args],
                          check=True, capture_output=True, text=True, **kw).stdout.strip()


class TrustEntryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name) / 'verifier'
        self.repo.mkdir()
        git(self.repo, 'init', '-q')
        self.commit1 = self.commit({'scripts/verifier.py': 'a\n', 'docs/execution.md': 'd\n', 'submissions/x/A.lean': 's\n',
                                    'auto-research.md': 'r\n', 'auto-research/n.md': 'r\n', 'run.sh': '#!/bin/sh\n',
                                    'profiles/direct.json': json.dumps({'profiles': {'p1': {'k': 1}, 'p2': {'k': 2}}})}, 'one')
        self.trust_path = Path(self.temp.name) / 'direct-trust.json'
        self.trust = {'profiles': {'p1': {'k': 1}, 'p2': {'k': 2}}, 'controller_blobs': {'z': {'sha': '0' * 40, 'mode': '100644'}},
                      'previous_controller_blobs': {'f' * 40: {'old.py': {'sha': '1' * 40, 'mode': '100644'}}}}
        self.save()

    def commit(self, files, message):
        for rel, text in files.items():
            path = self.repo / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text)
            if rel == 'run.sh':
                path.chmod(0o755)
        git(self.repo, 'add', '-A')
        git(self.repo, 'commit', '-q', '-m', message)
        return git(self.repo, 'rev-parse', 'HEAD')

    def save(self):
        self.trust_path.write_text(json.dumps(self.trust, indent=2, ensure_ascii=False) + '\n')

    def run_tool(self, *args):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = t.main([str(self.repo), *args, '--trust', str(self.trust_path)])
        return code, out.getvalue(), err.getvalue()

    def test_the_blob_set_has_modes_and_leaves_out_untrusted_paths(self):
        entry = t.blob_set(self.repo, self.commit1)
        self.assertEqual(list(entry), ['docs/execution.md', 'profiles/direct.json', 'run.sh', 'scripts/verifier.py'])
        self.assertEqual(entry['run.sh']['mode'], '100755')
        self.assertEqual(entry['scripts/verifier.py']['mode'], '100644')
        self.assertTrue(all(len(v['sha']) == 40 for v in entry.values()))

    def test_check_says_none_equal_or_differs_and_changes_nothing(self):
        before = self.trust_path.read_bytes()
        code, out, _ = self.run_tool(self.commit1)
        self.assertEqual((code, 'entry: none' in out), (1, True))
        self.assertEqual(self.run_tool(self.commit1, '--write')[0], 0)
        self.assertEqual(self.run_tool(self.commit1)[0], 0)
        trust = json.loads(self.trust_path.read_text())
        trust['previous_controller_blobs'][self.commit1]['scripts/verifier.py']['sha'] = '2' * 40
        self.trust_path.write_text(json.dumps(trust, indent=2) + '\n')
        code, out, _ = self.run_tool(self.commit1)
        self.assertEqual((code, 'entry: differs' in out), (1, True))
        self.assertNotEqual(before, self.trust_path.read_bytes())  # only the write above changed it

    def test_the_same_files_in_another_order_are_not_equal(self):
        # The importer compares dicts, so order does not matter to it; the trust file is written in git's path order and a
        # reviewer compares bytes, so a reordered entry is reported.
        self.assertEqual(self.run_tool(self.commit1, '--write')[0], 0)
        trust = json.loads(self.trust_path.read_text())
        entry = trust['previous_controller_blobs'][self.commit1]
        trust['previous_controller_blobs'][self.commit1] = dict(reversed(list(entry.items())))
        self.trust_path.write_text(json.dumps(trust, indent=2, ensure_ascii=False) + '\n')
        self.assertEqual(self.run_tool(self.commit1)[0], 1)

    def test_write_adds_one_entry_at_the_end_and_changes_nothing_else(self):
        before = json.loads(self.trust_path.read_text())
        code, out, _ = self.run_tool(self.commit1, '--write')
        self.assertEqual(code, 0)
        after = json.loads(self.trust_path.read_text())
        self.assertEqual(list(after['previous_controller_blobs']), ['f' * 40, self.commit1])
        for key in before:
            if key != 'previous_controller_blobs':
                self.assertEqual(before[key], after[key])
        self.assertEqual(after['previous_controller_blobs']['f' * 40], before['previous_controller_blobs']['f' * 40])
        self.assertEqual(self.trust_path.read_text(), json.dumps(after, indent=2, ensure_ascii=False) + '\n')
        # A second write of the same commit is a no-op.
        text = self.trust_path.read_text()
        self.assertEqual(self.run_tool(self.commit1, '--write')[0], 0)
        self.assertEqual(text, self.trust_path.read_text())

    def test_an_existing_entry_that_differs_is_never_changed(self):
        self.trust['previous_controller_blobs'][self.commit1] = {'x.py': {'sha': '3' * 40, 'mode': '100644'}}
        self.save()
        before = self.trust_path.read_bytes()
        code, _, err = self.run_tool(self.commit1, '--write')
        self.assertEqual(code, 2)
        self.assertIn('never changed', err)
        self.assertEqual(before, self.trust_path.read_bytes())

    def test_profiles_are_replaced_only_when_named(self):
        second = self.commit({'profiles/direct.json': json.dumps({'profiles': {'p1': {'k': 10}, 'p2': {'k': 20}}})}, 'two')
        code, out, _ = self.run_tool(second, '--profile', 'p1')
        self.assertEqual((code, 'profile p1: differs' in out), (1, True))
        self.assertEqual(self.run_tool(second, '--write', '--profile', 'p1')[0], 0)
        trust = json.loads(self.trust_path.read_text())
        self.assertEqual(trust['profiles'], {'p1': {'k': 10}, 'p2': {'k': 2}})
        self.assertEqual(self.run_tool(second, '--profile', 'p1')[0], 0)
        self.assertEqual(self.run_tool(second, '--profile', 'p2')[0], 1)

    def test_execution_keys_are_not_a_difference_and_are_not_written(self):
        # The importer's same_profile ignores runner and lake_workers_start; the trust file keeps its own (3sum, Lead 11-02).
        second = self.commit({'profiles/direct.json': json.dumps({'profiles': {'p1': {'k': 1, 'runner': 'github-split', 'lake_workers_start': 1},
                                                                                'p2': {'k': 2}}})}, 'two')
        code, out, _ = self.run_tool(second, '--profile', 'p1')
        self.assertEqual((code, 'profile p1: equal except execution keys' in out), (1, True))  # exit 1 only for the missing entry
        self.assertEqual(self.run_tool(second, '--write', '--profile', 'p1')[0], 0)
        trust = json.loads(self.trust_path.read_text())
        self.assertEqual(trust['profiles']['p1'], {'k': 1})
        code, out, _ = self.run_tool(second, '--profile', 'p1')
        self.assertEqual((code, 'profile p1: equal except execution keys' in out, 'differ from the trust file' in out), (0, True, False))

    def test_a_change_to_or_from_the_check_chain_is_a_difference_and_is_written(self):
        # same_profile does not ignore the chain-ness of the runner: the importer rejects every chain receipt of a board
        # whose trust profile is not on the chain (Reviewer, task ad84a7b4).
        self.trust['profiles']['p1'] = {'k': 1, 'runner': 'github-split'}
        self.save()
        second = self.commit({'profiles/direct.json': json.dumps({'profiles': {'p1': {'k': 1, 'runner': 'github-chain'}, 'p2': {'k': 2}}})}, 'two')
        code, out, _ = self.run_tool(second, '--profile', 'p1')
        self.assertEqual((code, 'profile p1: differs' in out), (1, True))
        self.assertEqual(self.run_tool(second, '--write', '--profile', 'p1')[0], 0)
        self.assertEqual(json.loads(self.trust_path.read_text())['profiles']['p1'], {'k': 1, 'runner': 'github-chain'})
        # lake_workers_start alone is an execution key: not a difference, not written.
        third = self.commit({'profiles/direct.json': json.dumps({'profiles': {'p1': {'k': 1, 'runner': 'github-chain', 'lake_workers_start': 2},
                                                                              'p2': {'k': 2}}})}, 'three')
        code, out, _ = self.run_tool(third, '--profile', 'p1')
        self.assertIn('profile p1: equal except execution keys', out)
        self.assertEqual(self.run_tool(third, '--write', '--profile', 'p1')[0], 0)
        self.assertEqual(json.loads(self.trust_path.read_text())['profiles']['p1'], {'k': 1, 'runner': 'github-chain'})

    def test_a_changed_statement_hash_warns_and_says_what_the_fixture_has(self):
        # Reviewer note c (task 8bc66e6b): direct_refresh stops with "Reviewed statement hash mismatch" when direct-fixtures
        # does not have the bytes of challenge_sha256.
        import hashlib
        new_bytes = b'new statement\n'
        new_sha = hashlib.sha256(new_bytes).hexdigest()
        self.trust['profiles']['p1'] = {'k': 1, 'challenge_file': 'challenges/p1/Statement.lean', 'challenge_sha256': '1' * 64}
        self.save()
        second = self.commit({'profiles/direct.json': json.dumps({'profiles': {'p1': {'k': 1, 'challenge_file': 'challenges/p1/Statement.lean',
                                                                                      'challenge_sha256': new_sha}, 'p2': {'k': 2}}})}, 'two')
        fixtures = self.trust_path.parent / 'direct-fixtures'
        code, out, _ = self.run_tool(second, '--profile', 'p1')
        self.assertIn('profile p1: differs', out)
        self.assertIn('WARNING profile p1: challenge_sha256 changes (' + '1' * 12 + ' -> ' + new_sha[:12] + '); direct-fixtures: Statement.lean does not exist', out)
        fixtures.mkdir()
        (fixtures / 'Statement.lean').write_bytes(b'old\n')
        self.assertIn('Statement.lean has other bytes', self.run_tool(second, '--profile', 'p1')[1])
        (fixtures / 'Statement.lean').write_bytes(new_bytes)
        self.assertIn('Statement.lean has the new bytes', self.run_tool(second, '--write', '--profile', 'p1')[1])
        # An unchanged hash gives no warning.
        third = self.commit({'profiles/direct.json': json.dumps({'profiles': {'p1': {'k': 5, 'challenge_file': 'challenges/p1/Statement.lean',
                                                                                    'challenge_sha256': new_sha}, 'p2': {'k': 2}}})}, 'three')
        out = self.run_tool(third, '--profile', 'p1')[1]
        self.assertIn('profile p1: differs', out)
        self.assertNotIn('WARNING', out)

    def test_the_fixture_name_follows_statement_fixtures_and_a_moved_statement_warns(self):
        # Review notes 1 to 3 on 09a2bcfa: the copy is named by statement_fixtures; "has the new bytes" asks for no work;
        # a changed challenge_file with an equal hash warns too.
        import hashlib
        data = b'same statement\n'
        sha = hashlib.sha256(data).hexdigest()
        self.trust['statement_fixtures'] = {'challenges/q/Statement.lean': 'QStatement.lean'}
        self.trust['profiles']['p1'] = {'k': 1, 'challenge_file': 'challenges/p/Statement.lean', 'challenge_sha256': sha}
        self.save()
        second = self.commit({'profiles/direct.json': json.dumps({'profiles': {'p1': {'k': 1, 'challenge_file': 'challenges/q/Statement.lean',
                                                                                      'challenge_sha256': sha}, 'p2': {'k': 2}}})}, 'moved')
        fixtures = self.trust_path.parent / 'direct-fixtures'
        fixtures.mkdir()
        (fixtures / 'Statement.lean').write_bytes(b'not the one\n')
        out = self.run_tool(second, '--profile', 'p1')[1]
        self.assertIn('challenge_file changes (challenges/p/Statement.lean -> challenges/q/Statement.lean', out)
        self.assertNotIn('challenge_sha256 changes', out)
        self.assertIn('direct-fixtures: QStatement.lean does not exist. Update data/direct-fixtures/QStatement.lean', out)
        (fixtures / 'QStatement.lean').write_bytes(data)
        out = self.run_tool(second, '--profile', 'p1')[1]
        self.assertIn('direct-fixtures: QStatement.lean has the new bytes.', out)
        self.assertNotIn('Update data/direct-fixtures', out)

    def test_a_site_only_profile_is_named_as_such(self):
        # Reviewer note d: --profile dft233 stopped with "the verifier has no profile", which does not say it is a site-only profile.
        self.trust['profiles']['site-only'] = {'k': 9}
        self.save()
        code, _, err = self.run_tool(self.commit1, '--profile', 'site-only')
        self.assertEqual(code, 2)
        self.assertIn('profile site-only is only in the trust file (a site-only profile', err)
        code, _, err = self.run_tool(self.commit1, '--profile', 'nowhere')
        self.assertEqual((code, 'the verifier has no profile nowhere' in err), (2, True))

    def test_the_facts_name_the_profiles_that_differ_when_the_profile_file_changed(self):
        self.assertEqual(self.run_tool(self.commit1, '--write')[0], 0)
        self.trust = json.loads(self.trust_path.read_text())
        self.trust['profiles']['site-only'] = {'k': 9}
        self.save()
        second = self.commit({'profiles/direct.json': json.dumps({'profiles': {'p1': {'k': 11}, 'p2': {'k': 2, 'runner': 'github-split'}, 'p3': {'k': 3}}})}, 'two')
        code, out, _ = self.run_tool(second, '--profile', 'p1')
        self.assertIn('profiles that differ from the trust file: p1', out)
        code, out, _ = self.run_tool(second, '--write')
        facts = out.split('--- commit message facts ---')[1]
        self.assertIn('profiles/direct.json changed. Profiles that differ from the trust file (pass --profile NAME): p1.', facts)
        self.assertIn('Equal except execution keys (not written): p2.', facts)
        self.assertIn('Only in the verifier: p3.', facts)
        self.assertIn('Only in the trust file: site-only.', facts)
        # No profile file change: no profile line.
        third = self.commit({'scripts/verifier.py': 'c\n'}, 'three')
        self.assertNotIn('profiles/direct.json changed', self.run_tool(third, '--write')[1])

    def test_unknown_commit_or_profile_stops(self):
        for args in (['a' * 40], ['no-such-ref'], [self.commit1, '--profile', 'nope']):
            before = self.trust_path.read_bytes()
            code, _, err = self.run_tool(*args, '--write')
            self.assertEqual(code, 2, args)
            self.assertIn('STOP', err)
            self.assertEqual(before, self.trust_path.read_bytes())
        # A profile that only the verifier has.
        third = self.commit({'profiles/direct.json': json.dumps({'profiles': {'p1': {'k': 1}, 'p3': {'k': 3}}})}, 'three')
        self.assertEqual(self.run_tool(third, '--profile', 'p3')[0], 2)

    def test_message_facts_list_changed_new_and_removed_files_against_the_parent(self):
        self.assertEqual(self.run_tool(self.commit1, '--write')[0], 0)
        second = self.commit({'scripts/verifier.py': 'b\n', 'scripts/new.py': 'n\n'}, 'two')
        git(self.repo, 'rm', '-q', 'docs/execution.md')
        git(self.repo, 'commit', '-q', '-m', 'three')
        third = git(self.repo, 'rev-parse', 'HEAD')
        self.assertEqual(self.run_tool(second, '--write')[0], 0)
        code, out, _ = self.run_tool(third, '--write')
        self.assertEqual(code, 0)
        facts = out.split('--- commit message facts ---')[1]
        self.assertIn(f'(child of {second[:7]})', facts)
        self.assertIn('Changed since that set (0): none. New: none. Removed: docs/execution.md.', facts)
        self.assertIn('No workflow changed.', facts)
        self.assertEqual(self.run_tool(second)[0], 0)  # the entry of the commit before is unchanged
        # The facts of the second commit: changed and new.
        self.trust = json.loads(self.trust_path.read_text())
        del self.trust['previous_controller_blobs'][second]
        self.save()
        code, out, _ = self.run_tool(second, '--write')
        self.assertIn('Changed since that set (1): scripts/verifier.py. New: scripts/new.py. Removed: none.', out)

    def test_a_workflow_change_is_said(self):
        self.assertEqual(self.run_tool(self.commit1, '--write')[0], 0)
        second = self.commit({'.github/workflows/w.yml': 'on: push\n'}, 'two')
        code, out, _ = self.run_tool(second, '--write')
        self.assertIn('A workflow file changed.', out)
        self.assertNotIn('No workflow changed.', out)

    def test_a_parent_without_an_entry_is_said(self):
        second = self.commit({'scripts/verifier.py': 'b\n'}, 'two')
        code, out, _ = self.run_tool(second, '--write')
        self.assertEqual(code, 0)
        self.assertIn('has no entry in the trust file', out)


if __name__ == '__main__':
    unittest.main()
