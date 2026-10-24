"""Offline checks for the lead-review hold on implausible new results."""
import copy, json, subprocess, sys, tempfile, unittest
from pathlib import Path
import review_hold

def record(rid, score, title=''):
    return {'id': rid, 'score': score, 'title': title, 'submission_url': f'https://example.invalid/{rid}'}

def board(direction, records):
    return {'score': {'direction': direction}, 'records': records, 'record_metadata': {r['id']: {'note': r['id']} for r in records}}

class ReviewHoldTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        review_hold.dump(self.root, 'registry.json', {'problems': [
            {'slug': 'integer-multiplication', 'data_file': 'im.json'},
            {'slug': 'matrix-multiplication', 'data_file': 'mm.json'}]})
        self.heads = {
            'im.json': board('higher-is-better', [record('classical-baseline', '0'), record('crocswap-pr-3051', '1729737950064279/1000000000000000000')]),
            'mm.json': board('lower-is-better', [record('classical-baseline', '3'), record('alman-2024', '2371339/1000000')]),
        }
        for path, data in self.heads.items():
            review_hold.dump(self.root, path, data)

    def tearDown(self):
        self.temp.cleanup()

    def add(self, path, r):
        data = review_hold.load(self.root, path)
        data['records'].append(r); data['record_metadata'][r['id']] = {'note': r['id']}
        review_hold.dump(self.root, path, data)

    def run_review(self, now='2026-10-17T03:00:00Z'):
        return review_hold.review(self.root, now, lambda root, path: copy.deepcopy(self.heads[path]))

    def ids(self, path):
        data = review_hold.load(self.root, path)
        self.assertEqual({r['id'] for r in data['records']}, set(data['record_metadata']))
        return [r['id'] for r in data['records']]

    def decide(self, kind, slug, rid, score):
        decisions = review_hold.load(self.root, review_hold.DECISIONS, {'approved': [], 'rejected': []})
        decisions[kind].append({'board': slug, 'id': rid, 'score': score, 'by': 'BOS Lead Dev', 'at': '2026-10-17T04:00:00Z'})
        review_hold.dump(self.root, review_hold.DECISIONS, decisions)

    def test_kappa_jump_is_held_until_approved(self):
        # The 2026-10-17 false record: kappa 1/10 against a published best of 0.00173.
        self.add('im.json', record('crocswap-pr-3093', '1/10', 'Research: audit #2979 profile against kappa=0.1'))
        holds = self.run_review()
        self.assertEqual([h['id'] for h in holds], ['crocswap-pr-3093'])
        self.assertEqual(holds[0]['published_best']['id'], 'crocswap-pr-3051')
        self.assertNotIn('crocswap-pr-3093', self.ids('im.json'))
        # The importer adds it again next run; it stays held, with its first hold time.
        self.add('im.json', record('crocswap-pr-3093', '1/10'))
        holds = self.run_review('2026-10-17T04:00:00Z')
        self.assertEqual(holds[0]['held_at'], '2026-10-17T03:00:00Z')
        self.assertNotIn('crocswap-pr-3093', self.ids('im.json'))
        # Approval returns it even when its importer did not rebuild it this run.
        self.decide('approved', 'integer-multiplication', 'crocswap-pr-3093', '1/10')
        self.assertEqual(self.run_review(), [])
        self.assertIn('crocswap-pr-3093', self.ids('im.json'))

    def test_records_off_the_board_set_no_reference(self):
        # crocswap-pr-159 (closed unmerged, 0.128) is not on the board, so it is not the
        # published best; the 2026-10-17 1/10 row is still held against #3051.
        self.heads['im.json']['records'].append(dict(record('crocswap-pr-159', '25573/200000'), upstream_status='closed-unmerged'))
        self.heads['im.json']['record_metadata']['crocswap-pr-159'] = {}
        review_hold.dump(self.root, 'im.json', self.heads['im.json'])
        self.add('im.json', dict(record('crocswap-pr-3093', '1/10'), upstream_status='open'))
        self.add('im.json', dict(record('crocswap-pr-9999', '1/2'), upstream_status='closed-unmerged'))
        self.assertEqual([h['id'] for h in self.run_review()], ['crocswap-pr-3093'])
        self.assertIn('crocswap-pr-9999', self.ids('im.json'))

    def test_claim_approval_also_approves_the_hold(self):
        review_hold.dump(self.root, review_hold.DECISIONS, {'approved': [], 'rejected': [], 'claims': [
            {'pr': 3200, 'head': 'a' * 40, 'score': '1/100', 'by': 'BOS Lead Dev', 'at': '2026-10-17T04:00:00Z'}]})
        self.add('im.json', record('crocswap-pr-3200', '1/100'))
        self.assertEqual(self.run_review(), [])
        self.assertIn('crocswap-pr-3200', self.ids('im.json'))

    def test_a_direct_hold_drops_when_its_submission_is_gone(self):
        # exact-dft direct-pr-47 (2026-10-23): the PR closed after Lean rejected it; the hold stayed listed.
        self.add('im.json', record('direct-pr-47', '1/10'))
        review_hold.dump(self.root, 'direct-submissions.json', {'entries': {'direct-pr-47': {}}})
        self.assertEqual([h['id'] for h in self.run_review()], ['direct-pr-47'])
        review_hold.dump(self.root, 'direct-submissions.json', {'entries': {}})
        self.assertEqual(self.run_review('2026-10-17T04:00:00Z'), [])
        self.assertNotIn('direct-pr-47', self.ids('im.json'))
        # A withdrawn submission keeps its entry but leaves the board: its hold drops too.
        self.add('im.json', record('direct-pr-44', '1/10'))
        review_hold.dump(self.root, 'direct-submissions.json', {'entries': {'direct-pr-44': {}}})
        self.assertEqual([h['id'] for h in self.run_review()], ['direct-pr-44'])
        review_hold.dump(self.root, 'direct-notes.json', {'withdrawn': {'direct-pr-44': 'Withdrawn by its submitter.'}})
        self.assertEqual(self.run_review(), [])
        # A CrocSwap hold does not depend on the direct state.
        self.add('im.json', record('crocswap-pr-3093', '1/10'))
        self.assertEqual([h['id'] for h in self.run_review()], ['crocswap-pr-3093'])

    def test_rejected_hold_stays_off(self):
        self.add('im.json', record('crocswap-pr-3093', '1/10'))
        self.run_review()
        self.decide('rejected', 'integer-multiplication', 'crocswap-pr-3093', '1/10')
        self.add('im.json', record('crocswap-pr-3093', '1/10'))
        self.assertEqual(self.run_review(), [])
        self.assertNotIn('crocswap-pr-3093', self.ids('im.json'))

    def test_plausible_and_published_results_pass(self):
        self.add('im.json', record('crocswap-pr-3200', '3459475900128558/1000000000000000000'))  # 2.0x: not more than twice
        self.add('im.json', record('crocswap-pr-3201', '1/1000'))  # worse than the best
        self.add('mm.json', record('new-omega', '2348/1000'))  # 0.99% below 2.371339
        self.assertEqual(self.run_review(), [])
        self.assertEqual(self.ids('im.json')[-2:], ['crocswap-pr-3200', 'crocswap-pr-3201'])
        self.assertIn('new-omega', self.ids('mm.json'))

    def test_exponent_drop_is_held(self):
        self.add('mm.json', record('omega-2-3', '23/10'))
        holds = self.run_review()
        self.assertEqual([(h['board'], h['id']) for h in holds], [('matrix-multiplication', 'omega-2-3')])
        self.assertNotIn('omega-2-3', self.ids('mm.json'))

    def test_changed_score_is_a_new_result(self):
        data = review_hold.load(self.root, 'im.json')
        data['records'][1]['score'] = '1/10'
        review_hold.dump(self.root, 'im.json', data)
        self.assertEqual([h['id'] for h in self.run_review()], ['crocswap-pr-3051'])

    def test_check_lists_waits_and_exits_0(self):
        # 2026-10-20: a wait is state, not a failed run; the dead-man check reads the files.
        script = Path(review_hold.__file__)
        def check():
            with tempfile.TemporaryDirectory() as temp:
                copy_path = Path(temp) / 'review_hold.py'
                copy_path.write_text(script.read_text())
                for name in (review_hold.HOLDS, review_hold.CLAIM_QUEUE):
                    if (self.root / name).exists():
                        (Path(temp) / name).write_text((self.root / name).read_text())
                done = subprocess.run([sys.executable, '-I', str(copy_path), '--check'], capture_output=True, text=True)
                return done.returncode, done.stdout
        self.assertEqual(check(), (0, ''))
        review_hold.dump(self.root, review_hold.CLAIM_QUEUE, {'queue': [{'pr': 3111, 'head': 'b' * 40, 'title': 't', 'url': 'u', 'reason': 'r'}]})
        code, out = check()
        self.assertEqual(code, 0);self.assertIn('CrocSwap PR #3111 waits for lead review: r', out)
        review_hold.dump(self.root, review_hold.CLAIM_QUEUE, {'queue': []})
        self.assertEqual(check(), (0, ''))
        self.add('im.json', record('crocswap-pr-3093', '1/10'))
        self.run_review()
        code, out = check()
        self.assertEqual(code, 0);self.assertIn('Held for lead review: ', out)
        # A real error (an unreadable wait file) still fails the step.
        review_hold.dump(self.root, review_hold.CLAIM_QUEUE, {'queue': []})
        (self.root / review_hold.CLAIM_QUEUE).write_text('{not json')
        self.assertNotEqual(check()[0], 0)

    def test_live_bundle_has_no_pending_holds_file_errors(self):
        holds = review_hold.load(review_hold.ROOT, review_hold.HOLDS)
        decisions = review_hold.load(review_hold.ROOT, review_hold.DECISIONS)
        self.assertIsInstance(holds['holds'], list)
        # derivations: the lead's releases of verifier derivation holds (read by direct_refresh.py, 2026-10-24).
        self.assertTrue({'approved', 'rejected', 'claims'} <= set(decisions) <= {'approved', 'rejected', 'claims', 'derivations'}, sorted(decisions))

if __name__ == '__main__':
    unittest.main()
