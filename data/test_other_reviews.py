"""Offline checks for the Other bounds review status (GitHub mocked)."""
import json, unittest
import other_reviews as reviews

REPO = 'GTimG/QuasiRiemannTracker'
ROWS = {'families': [
    {'slug': 'quasi-riemann', 'reviewRepository': {'name': REPO, 'url': 'https://github.com/' + REPO},
     'claims': [{'handle': 'a'},
                {'handle': 'gao', 'review': {'pr': 63, 'status': 'merged'}},
                {'handle': 'arvi', 'review': {'pr': 67, 'status': 'open'}},
                {'handle': 'old', 'review': {'pr': 7, 'status': 'open'}}]},
    {'slug': 'catalan', 'claims': [{'handle': 'x', 'review': {'pr': 1, 'status': 'merged'}}]}]}

def pull(number, state='open', merged_at=None, repo=REPO, ref='main', default='main'):
    return {'number': number, 'state': state, 'merged_at': merged_at,
            'base': {'ref': ref, 'repo': {'full_name': repo, 'default_branch': default}}}

class Hub:
    def __init__(self, pulls): self.pulls = pulls; self.paths = []
    def get(self, path, params=None):
        self.paths.append(path)
        value = self.pulls[path]
        if isinstance(value, Exception): raise value
        return value

class OtherReviewTests(unittest.TestCase):
    def run_check(self, pulls, state=None):
        hub = Hub(pulls); state = state if state is not None else {'rows': {}}
        out = reviews.check(ROWS, state, '2026-10-20T05:00:00Z', hub.get)
        return hub, state, out

    def test_lists_only_claims_with_a_review_in_a_row_with_a_repository(self):
        self.assertEqual(reviews.review_pull_requests(ROWS), [('quasi-riemann', REPO, 63, 'merged'), ('quasi-riemann', REPO, 67, 'open'), ('quasi-riemann', REPO, 7, 'open')])

    def test_one_get_per_pull_request_that_is_not_merged_and_a_merge_is_recorded(self):
        hub, state, (changes, failures) = self.run_check({
            f'repos/{REPO}/pulls/67': pull(67, 'closed', '2026-10-20T06:00:00Z'), f'repos/{REPO}/pulls/7': pull(7)})
        self.assertEqual(sorted(hub.paths), [f'repos/{REPO}/pulls/67', f'repos/{REPO}/pulls/7'])  # #63 is merged in the rows: no read
        self.assertEqual(failures, [])
        self.assertEqual(state['rows']['quasi-riemann']['67'], {'status': 'merged', 'merged_at': '2026-10-20T06:00:00Z', 'checked_at': '2026-10-20T05:00:00Z'})
        self.assertEqual(state['rows']['quasi-riemann']['7']['status'], 'open')
        self.assertEqual(len(changes), 2)

    def test_a_merged_pull_request_is_final_and_an_unchanged_status_writes_nothing(self):
        state = {'rows': {'quasi-riemann': {'67': {'status': 'merged', 'merged_at': 'x', 'checked_at': 'y'}, '7': {'status': 'open', 'checked_at': 'old'}}}}
        hub, state, (changes, failures) = self.run_check({f'repos/{REPO}/pulls/7': pull(7)}, state)
        self.assertEqual(hub.paths, [f'repos/{REPO}/pulls/7'])
        self.assertEqual((changes, failures), ([], []))
        self.assertEqual(state['rows']['quasi-riemann']['7']['checked_at'], 'old')

    def test_closed_without_a_merge_is_closed_and_a_reopened_one_is_read_again(self):
        _, state, (changes, _) = self.run_check({f'repos/{REPO}/pulls/67': pull(67, 'closed'), f'repos/{REPO}/pulls/7': pull(7)})
        self.assertEqual(state['rows']['quasi-riemann']['67']['status'], 'closed')
        hub, state, _ = self.run_check({f'repos/{REPO}/pulls/67': pull(67), f'repos/{REPO}/pulls/7': pull(7)}, state)
        self.assertEqual(state['rows']['quasi-riemann']['67']['status'], 'open')

    def test_a_failed_read_keeps_the_last_state_and_is_reported(self):
        state = {'rows': {'quasi-riemann': {'67': {'status': 'open', 'checked_at': 'old'}}}}
        _, state, (changes, failures) = self.run_check({f'repos/{REPO}/pulls/67': RuntimeError('GitHub GET failed: x (HTTP 502)'), f'repos/{REPO}/pulls/7': pull(7)}, state)
        self.assertEqual(state['rows']['quasi-riemann']['67']['checked_at'], 'old')
        self.assertEqual(len(failures), 1); self.assertIn('#67', failures[0])

    def test_a_pull_request_of_another_repository_or_branch_is_not_a_merge(self):
        for bad in (pull(67, 'closed', 'm', repo='someone/fork'), pull(67, 'closed', 'm', ref='dev'), pull(66, 'closed', 'm'), pull(67, 'closed', 'm', default='')):
            _, state, (changes, failures) = self.run_check({f'repos/{REPO}/pulls/67': bad, f'repos/{REPO}/pulls/7': pull(7)})
            self.assertEqual(len(failures), 1, bad); self.assertNotIn('67', state['rows']['quasi-riemann'])

    def test_the_rows_file_in_the_repository_is_readable_by_this_script(self):
        rows = json.loads(reviews.ROWS.read_text())
        found = reviews.review_pull_requests(rows)
        self.assertTrue(found); self.assertTrue(all(isinstance(pr, int) for _, _, pr, _ in found))

if __name__ == '__main__':
    unittest.main()
