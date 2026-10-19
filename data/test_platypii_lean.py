"""Offline checks for the platypii Lean note (GitHub mocked)."""
import hashlib, io, json, shutil, subprocess, sys, tarfile, tempfile, unittest
from fractions import Fraction
from pathlib import Path
import platypii_lean as pl

STATEMENT = b'statement bytes'
THEOREM = 'theorem mulInTime : MulInTime (14229 / 2 ^ 46 : ℝ) :=\n  Fast.Main.compactR_mulInTime_final\n'
OLD_NOTE = ("Source claim; not independently rerun by bigOspeedrun. A Lean proof of a stronger saving, kappa = 14229/2^46 "
            "(about 2.02e-10), by Kenny Daniel (platypii) with jdb19937, exists on Mathlib's multi-stack machine model "
            "(platypii/integer-mult-bounds-lean @ a8e85a1, theorem MathlibTM2.mulInTime; the author's axiom audit allows only "
            "the standard axioms, and the author's CI on that commit had not finished on 2026-10-17); it is not our exact "
            "multitape statement and we have not rerun it.")

class Hub:
    def __init__(self):
        self.head = 'b' * 40; self.statement = STATEMENT; self.theorem = THEOREM
        self.files = [('A.lean', 'theorem a : True := trivial -- sorry in a comment\n/- admit -/')]; self.runs = []; self.reads = 0
    def get(self, path, params=None):
        if path.endswith('/commits/HEAD'): return {'sha': self.head}
        if path.endswith('/check-runs'): return {'check_runs': self.runs}
        raise AssertionError(path)
    def read(self, repo, path, sha):
        self.reads += 1
        return self.statement if path == pl.STATEMENT else self.theorem.encode()
    def files_at(self, sha): return self.files

class PlatypiiTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.root = Path(self.tmp.name)
        board = {'records': [{'id': pl.ROW, 'score': '1/6129982163463555433433388108601236734474956488734408704'}],
                 'record_metadata': {pl.ROW: {'proof_status': OLD_NOTE}}}
        (self.root / pl.BOARD).write_text(json.dumps(board))
        state = {'value': '14229/2^46', 'kappa': str(Fraction(14229, 2 ** 46)), 'commit': 'a' * 40, 'checked_commit': 'a' * 40,
                 'ci': "the author's CI on that commit had not finished", 'status': 'ok', 'reason': None,
                 'statement_sha256': pl.STATEMENT_SHA256}
        (self.root / pl.STATE).write_text(json.dumps(state))
        self.hub = Hub()
        self.pin = unittest.mock.patch.object(pl, 'STATEMENT_SHA256', hashlib.sha256(STATEMENT).hexdigest()); self.pin.start()
        state['statement_sha256'] = pl.STATEMENT_SHA256; (self.root / pl.STATE).write_text(json.dumps(state))
    def tearDown(self): self.pin.stop(); self.tmp.cleanup()
    def run_check(self, now='2026-10-18T01:00:00Z'):
        return pl.check(self.root, now, self.hub.get, self.hub.read, self.hub.files_at)
    def note(self): return json.loads((self.root / pl.BOARD).read_text())['record_metadata'][pl.ROW]['proof_status']

    def test_a_note_after_the_prove2me_sentence_keeps_its_prefix_when_updated(self):
        # data/prove2me_import.py writes 'Source claim... <prove2.me sentence> Separately, a Lean proof of ...'.
        board = json.loads((self.root / pl.BOARD).read_text())
        first, rest = OLD_NOTE.split(' A Lean proof', 1)
        board['record_metadata'][pl.ROW]['proof_status'] = first + ' Proved on prove2.me. Separately, a Lean proof' + rest
        (self.root / pl.BOARD).write_text(json.dumps(board))
        self.hub.theorem = THEOREM.replace('14229 / 2 ^ 46', '1 / 2 ^ 31'); self.hub.runs = [{'conclusion': 'success'}]
        self.run_check()
        note = self.note()
        self.assertIn('Proved on prove2.me. Separately, a Lean proof of a stronger saving, kappa = 1/2^31', note)
        self.assertEqual(note.count('Lean proof of'), 1)
        self.assertTrue(note.endswith('we have not rerun it.'))

    def test_saving_forms(self):
        self.assertEqual(pl.saving(THEOREM), ('14229/2^46', Fraction(14229, 2 ** 46)))
        self.assertEqual(pl.saving('theorem mulInTime : MulInTime (2 ^ 33 : ℝ)⁻¹ :='), ('2^-33', Fraction(1, 2 ** 33)))
        self.assertEqual(pl.saving('theorem mulInTime : MulInTime (36261 / 2 ^ 48 : ℝ) :=')[0], '36261/2^48')
        self.assertIsNone(pl.saving('theorem mulInTime : MulInTime (kappa0 : ℝ) :='))
        self.assertIsNone(pl.saving('theorem other : MulInTime (1 / 2 ^ 4 : ℝ) :='))

    def test_unsafe_tokens_outside_comments(self):
        self.assertEqual(pl.unsafe_tokens([('ok.lean', '-- sorry\n/- admit -/\ntheorem t : True := trivial\ndef s := "sorry"')]), [])
        self.assertEqual(pl.unsafe_tokens([('a.lean', 'theorem t : False := by sorry'), ('b.lean', 'axiom bad : False'),
                                           ('c.lean', 'theorem t : True := by admit'), ('d.lean', 'private axiom p : False')]),
                         ['a.lean', 'b.lean', 'c.lean', 'd.lean'])

    def test_new_head_with_a_new_value_updates_the_note(self):
        self.hub.theorem = THEOREM.replace('14229 / 2 ^ 46', '1 / 2 ^ 31'); self.hub.runs = [{'conclusion': 'success'}]
        state = self.run_check()
        self.assertEqual((state['status'], state['value'], state['commit'], state['first_commit']), ('ok', '1/2^31', 'b' * 40, 'b' * 40))
        note = self.note()
        self.assertIn('kappa = 1/2^31 (about 4.66e-10)', note); self.assertIn('@ bbbbbbb', note)
        self.assertIn("the author's CI on that commit passed (checked 2026-10-18)", note)
        self.assertTrue(note.startswith('Source claim; not independently rerun by bigOspeedrun. A Lean proof of a stronger saving'))

    def test_same_value_new_head_keeps_first_commit(self):
        state = self.run_check()
        self.assertEqual((state['value'], state['commit']), ('14229/2^46', 'b' * 40)); self.assertNotIn('first_commit', state)

    def test_statement_change_parse_failure_or_sorry_hold_the_last_good_note(self):
        start_state = (self.root / pl.STATE).read_text()
        for change in ('statement', 'theorem', 'sorry'):
            with self.subTest(change=change):
                (self.root / pl.STATE).write_text(start_state); self.hub = Hub()
                if change == 'statement': self.hub.statement = b'other statement'
                if change == 'theorem': self.hub.theorem = 'theorem mulInTime : MulInTime (kappa0 : ℝ) :='
                if change == 'sorry': self.hub.files = [('B.lean', 'theorem t : False := by sorry')]
                state = self.run_check()
                self.assertEqual(state['status'], 'held'); self.assertEqual(state['value'], '14229/2^46')
                self.assertEqual(self.note(), OLD_NOTE)
                reads = self.hub.reads
                self.assertEqual(self.run_check()['status'], 'held'); self.assertEqual(self.hub.reads, reads)  # no re-read

    def test_same_head_refreshes_only_the_ci_result(self):
        self.hub.head = 'a' * 40
        self.assertEqual(self.run_check()['ci'], "the author's CI on that commit had not finished")
        self.assertEqual(self.note(), OLD_NOTE); self.assertEqual(self.hub.reads, 0)
        self.hub.runs = [{'conclusion': 'cancelled'}]
        self.run_check()
        self.assertIn("the author's CI run on that commit was cancelled (checked 2026-10-18)", self.note()); self.assertEqual(self.hub.reads, 0)

    def test_network_failure_only_counts(self):
        before = (self.root / pl.STATE).read_text()
        def boom(*a): raise RuntimeError('GitHub GET failed')
        self.hub.read = boom
        with self.assertRaises(RuntimeError): self.run_check()
        after = json.loads((self.root / pl.STATE).read_text())
        self.assertEqual({k: v for k, v in after.items() if k != 'failures'}, json.loads(before)); self.assertEqual(after['failures'], 1)
        self.assertEqual(self.note(), OLD_NOTE)

    def test_live_state_file_matches_the_live_note(self):
        state = json.loads((pl.ROOT / pl.STATE).read_text())
        board = json.loads((pl.ROOT / pl.BOARD).read_text())
        note = board['record_metadata'][pl.ROW]['proof_status']
        self.assertEqual(state['status'], 'ok'); self.assertIn(f"kappa = {state['value']}", note); self.assertIn(state['commit'][:7], note)

    def test_review_fixes(self):
        # Worker 1 review, 2026-10-18: a commented old line does not win; two live lines hold.
        self.assertEqual(pl.saving('-- theorem mulInTime : MulInTime (1 / 2 ^ 3 : ℝ)\n' + THEOREM)[0], '14229/2^46')
        self.assertIsNone(pl.saving(THEOREM + THEOREM))
        self.assertEqual(pl.unsafe_tokens([('a', 'theorem x : False := sorryAx False false'), ('b', 'theorem x : True := by native_decide'),
                                           ('c', 'def s := "/-"\ntheorem t : False := by sorry\n-- -/'), ('d', '@[extern "f"] opaque f : Nat'),
                                           ('e', '@[implemented_by g] def f := 1'), ('ok', '-- sorry\ndef s := "sorry"')]), ['a', 'b', 'c', 'd', 'e'])
        text = pl.safe_text('x\n::error::y é')
        self.assertTrue(text.isascii()); self.assertNotIn('\n', text)

    def test_missing_file_holds_and_repeated_network_failures_hold(self):
        def gone(repo, path, sha): raise RuntimeError(f'GitHub GET failed: repos/{repo}/contents/{path} (HTTP 404)')
        self.hub.read = gone
        state = self.run_check()
        self.assertEqual(state['status'], 'held'); self.assertIn('not found (HTTP 404)', state['reason'])
        (self.root / pl.STATE).write_text(json.dumps(dict(json.loads((self.root / pl.STATE).read_text()), status='ok', checked_commit='a' * 40, reason=None)))
        def down(repo, path, sha): raise RuntimeError('GitHub GET failed (connection error after 3 attempts)')
        self.hub.read = down
        for run in (1, 2):
            with self.assertRaises(RuntimeError): self.run_check()
            self.assertEqual(json.loads((self.root / pl.STATE).read_text())['failures'], run)
        state = self.run_check()
        self.assertEqual(state['status'], 'held'); self.assertIn('failed 3 runs in a row', state['reason'])
        self.assertEqual(self.note(), OLD_NOTE)
        # A failure hold is retried each run and clears when GitHub answers again.
        self.hub.read = Hub().read
        state = self.run_check()
        self.assertEqual((state['status'], state['failures'], state['retryable']), ('ok', 0, False))

    def test_head_read_failures_are_counted_or_held(self):
        # Worker 1 re-review: the HEAD read itself (repo deleted, renamed or private).
        real_get = self.hub.get
        def missing(path, params=None):
            if path.endswith('/commits/HEAD'): raise RuntimeError('GitHub GET failed: repos/x/commits/HEAD (HTTP 404)')
            return real_get(path)
        self.hub.get = missing
        state = self.run_check()
        self.assertEqual((state['status'], state['reason']), ('held', 'repository not found (HTTP 404)')); self.assertTrue(state['retryable'])
        def down(path, params=None):
            if path.endswith('/commits/HEAD'): raise RuntimeError('GitHub GET failed (HTTP 502)')
            return real_get(path)
        self.hub.get = down
        (self.root / pl.STATE).write_text(json.dumps(dict(json.loads((self.root / pl.STATE).read_text()), status='ok', retryable=False, failures=0)))
        for run in (1, 2):
            with self.assertRaises(RuntimeError): self.run_check()
        self.assertEqual(self.run_check()['status'], 'held')
        self.hub.get = real_get
        self.assertEqual(self.run_check()['status'], 'ok')
        self.assertEqual(self.note().count('@ bbbbbbb'), 1)

    def test_saving_outside_zero_one_holds(self):
        self.hub.theorem = 'theorem mulInTime : MulInTime (5 / 2 ^ 2 : ℝ) :='
        state = self.run_check()
        self.assertEqual(state['status'], 'held'); self.assertIn('not between 0 and 1', state['reason']); self.assertEqual(self.note(), OLD_NOTE)

    def test_lean_size_cap(self):
        raw = io.BytesIO()
        with tarfile.open(fileobj=raw, mode='w:gz') as tf:
            for i in range(3):
                data = b'-- x\n' * 10
                info = tarfile.TarInfo(f'repo-sha/F{i}.lean'); info.size = len(data); tf.addfile(info, io.BytesIO(data))
        class Response(io.BytesIO):
            def __enter__(self): return self
            def __exit__(self, *a): return False
        with unittest.mock.patch.object(pl.urllib.request, 'urlopen', lambda *a, **k: Response(raw.getvalue())):
            self.assertEqual([n for n, _ in pl.lean_files('s')], ['F0.lean', 'F1.lean', 'F2.lean'])
            with unittest.mock.patch.object(pl, 'MAX_LEAN_BYTES', 100):
                with self.assertRaises(ValueError): pl.lean_files('s')

    def test_review_check_fails_while_held(self):
        import review_hold
        with tempfile.TemporaryDirectory() as temp:
            script = Path(temp) / 'review_hold.py'; script.write_text(Path(review_hold.__file__).read_text())
            (Path(temp) / 'platypii-lean.json').write_text(json.dumps({'status': 'held', 'reason': 'bbbbbbb: Statement.lean changed'}))
            out = subprocess.run([sys.executable, '-I', str(script), '--check'], capture_output=True, text=True)
            self.assertEqual(out.returncode, 1); self.assertIn('platypii Lean note held', out.stdout)
            (Path(temp) / 'platypii-lean.json').write_text(json.dumps({'status': 'ok'}))
            self.assertEqual(subprocess.run([sys.executable, '-I', str(script), '--check']).returncode, 0)
            (Path(temp) / 'sources').mkdir(); (Path(temp) / 'sources/intake.json').write_text(json.dumps({'pulls_incomplete': 'full PR list hit its 70-page limit'}))
            out = subprocess.run([sys.executable, '-I', str(script), '--check'], capture_output=True, text=True)
            self.assertEqual(out.returncode, 1); self.assertIn('CrocSwap PR list incomplete', out.stdout)

import unittest.mock
if __name__ == '__main__':
    unittest.main()
