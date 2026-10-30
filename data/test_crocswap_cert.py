import json, tempfile, unittest
from pathlib import Path
import crocswap_cert as cert

SELECTED = 'certificates/selected-result.json'
CP = 'certificates/checkpoints'

def sha(n): return f'{n:040x}'
def entry(n, at): return {'sha': sha(n), 'commit': {'committer': {'date': at}}}

class Croc:
    """A fake CrocSwap: selected-result commits (newest first) with their contents, and checkpoint files."""
    def __init__(self):
        self.selected = [(3, '2026-10-13T00:00:00Z', {'kappa': '2/1000', 'source_prs': [5, 6]}),
                         (2, '2026-10-12T00:00:00Z', {'kappa': '1/1000', 'source_prs': [5]}),
                         (1, '2026-10-09T00:00:00Z', {'kappa': '472154791/1000000000000', 'source_pr': 144})]
        self.files = {'frontier5.json': (9, '2026-10-12T05:00:00Z')}
        self.kappas = {'frontier5.json': '1/1000', 'frontier8.json': '3/1000'}
        self.calls = []
        # Two ledger files: their blob shas and their entries.
        self.ledger = {'pr-ledger': ('1' * 40, [(5, 'incorporated'), (6, 'partially_reviewed')]),
                       'pr-intake-decisions': ('2' * 40, [(6, 'incorporated'), (7, 'partially_reviewed')])}
    def pages(self, path, params=None, limit=30):
        self.calls.append(('pages', params['path']))
        if params['path'] == SELECTED: return [entry(n, at) for n, at, _ in self.selected]
        name = params['path'].rsplit('/', 1)[1]
        n, at = self.files[name]
        return [entry(n + 100, '2026-10-20T00:00:00Z'), entry(n, at)]  # newest first: a later edit, then the commit that added it
    def api(self, path, params=None):
        self.calls.append(('api', path))
        for name, file in cert.LEDGER_FILES.items():
            if path.endswith(file): return {'sha': self.ledger[name][0]}
        return [{'type': 'file', 'name': name} for name in sorted(self.files)] + [{'type': 'file', 'name': 'README.md'}, {'type': 'dir', 'name': 'frontier7.json'}]
    def content(self, repo, path, commit):
        assert repo == cert.CROC
        for name, file in cert.LEDGER_FILES.items():
            if path == file:
                self.calls.append(('content', path))
                return json.dumps({'pull_requests': [{'number': n, 'disposition': d, 'extra': 1} for n, d in self.ledger[name][1]]}).encode()
        if path != SELECTED:
            self.calls.append(('content', path))
            return json.dumps({'kappa': self.kappas[path.rsplit('/', 1)[1]], 'source_prs': [5]}).encode()
        return json.dumps(next(c for n, _, c in self.selected if sha(n) == commit)).encode()
    def update(self, root, now='2026-10-30T10:00:00Z'):
        return cert.update(root, now, sha(99), self.api, self.pages, self.content)

class CertTests(unittest.TestCase):
    def test_first_run_reads_the_history_oldest_first(self):
        with tempfile.TemporaryDirectory() as temp:
            out = Croc().update(Path(temp))
            self.assertEqual([r['commit'] for r in out['selected_revisions']], [sha(1), sha(2), sha(3)])
            self.assertEqual(out['selected_revisions'][2], {'commit': sha(3), 'committed_at': '2026-10-13T00:00:00Z', 'kappa': '1/500', 'source_prs': [5, 6]})
            # The first revision has a source_pr field: it counts as source_prs [144] (Lead, 2026-10-30).
            self.assertEqual(out['selected_revisions'][0]['source_prs'], [144])
            # The commit that added the file counts, not a later edit; a directory named like a frontier file is not one.
            self.assertEqual(out['frontiers'], {'5': {'commit': sha(9), 'committed_at': '2026-10-12T05:00:00Z', 'kappa': '1/1000'}})
            self.assertEqual(out['checked_at'], '2026-10-30T10:00:00Z')

    def test_a_quiet_run_keeps_the_stored_file_and_reads_only_the_listings(self):
        with tempfile.TemporaryDirectory() as temp:
            croc = Croc(); root = Path(temp)
            first = croc.update(root)
            (root / cert.FILE).write_text(json.dumps(first, indent=2, ensure_ascii=False) + '\n')
            croc.calls.clear()
            second = croc.update(root, '2026-10-30T11:00:00Z')
            self.assertEqual(second, first)
            self.assertEqual(second['checked_at'], '2026-10-30T10:00:00Z')
            self.assertEqual(croc.calls, [('pages', SELECTED), ('api', f'repos/{cert.CROC}/contents/{CP}'),
                                          *[('api', f'repos/{cert.CROC}/contents/{f}') for f in cert.LEDGER_FILES.values()]])
            self.assertNotIn('read_error', second)

    def test_a_new_commit_and_a_new_frontier_are_added_and_old_ones_stay(self):
        with tempfile.TemporaryDirectory() as temp:
            croc = Croc(); root = Path(temp)
            (root / cert.FILE).write_text(json.dumps(croc.update(root)))
            croc.selected.insert(0, (4, '2026-10-14T00:00:00Z', {'kappa': '3/1000', 'source_prs': [7]}))
            croc.files['frontier8.json'] = (10, '2026-10-14T01:00:00Z')
            out = croc.update(root, '2026-10-30T12:00:00Z')
            self.assertEqual([r['commit'] for r in out['selected_revisions']], [sha(1), sha(2), sha(3), sha(4)])
            self.assertEqual(sorted(out['frontiers']), ['5', '8'])
            self.assertEqual(out['checked_at'], '2026-10-30T12:00:00Z')

    def test_a_frontier_that_main_no_longer_has_stays(self):
        with tempfile.TemporaryDirectory() as temp:
            croc = Croc(); root = Path(temp)
            first = croc.update(root)
            (root / cert.FILE).write_text(json.dumps(first))
            del croc.files['frontier5.json']
            self.assertEqual(croc.update(root), first)

    def test_the_ledger_is_read_once_and_again_only_when_a_blob_sha_changes(self):
        with tempfile.TemporaryDirectory() as temp:
            croc = Croc(); root = Path(temp)
            first = croc.update(root)
            self.assertEqual(first['ledger']['pr-ledger'], {'blob': '1' * 40, 'dispositions': {'incorporated': [5], 'partially_reviewed': [6]}})
            self.assertEqual(first['ledger']['pr-intake-decisions']['dispositions'], {'incorporated': [6], 'partially_reviewed': [7]})
            (root / cert.FILE).write_text(json.dumps(first))
            croc.calls.clear(); croc.update(root)
            self.assertNotIn(('content', cert.LEDGER_FILES['pr-ledger']), croc.calls)
            croc.ledger['pr-intake-decisions'] = ('3' * 40, [(7, 'incorporated')])
            croc.calls.clear(); second = croc.update(root, '2026-10-30T12:00:00Z')
            self.assertEqual(croc.calls.count(('content', cert.LEDGER_FILES['pr-intake-decisions'])), 1)
            self.assertNotIn(('content', cert.LEDGER_FILES['pr-ledger']), croc.calls)
            self.assertEqual(second['ledger']['pr-intake-decisions'], {'blob': '3' * 40, 'dispositions': {'incorporated': [7]}})
            self.assertEqual(second['ledger']['pr-ledger'], first['ledger']['pr-ledger'])

    def test_a_ledger_entry_without_an_integer_number_is_an_error(self):
        with tempfile.TemporaryDirectory() as temp:
            croc = Croc(); croc.ledger['pr-ledger'] = ('1' * 40, [('5', 'incorporated')])
            with self.assertRaises(ValueError): croc.update(Path(temp))

    def test_a_stored_frontier_without_a_kappa_gets_it_without_a_new_history_read(self):
        with tempfile.TemporaryDirectory() as temp:
            croc = Croc(); root = Path(temp)
            first = croc.update(root)
            old = json.loads(json.dumps(first)); del old['frontiers']['5']['kappa']
            (root / cert.FILE).write_text(json.dumps(old))
            croc.calls.clear()
            self.assertEqual(croc.update(root, '2026-10-30T12:00:00Z')['frontiers'], first['frontiers'])
            self.assertEqual([c for c in croc.calls if c[0] == 'pages'], [('pages', SELECTED)])

    def test_a_failed_read_sets_read_error_once_and_a_good_run_clears_it(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); croc = Croc()
            first = cert.failed(root, '2026-10-30T10:00:00Z', 'RuntimeError: x')
            self.assertEqual(first['read_error'], {'since': '2026-10-30T10:00:00Z', 'message': 'RuntimeError: x'})
            (root / cert.FILE).write_text(json.dumps(first))
            self.assertEqual(cert.failed(root, '2026-10-30T11:00:00Z', 'RuntimeError: y'), first)
            cleared = croc.update(root, '2026-10-30T12:00:00Z')
            self.assertNotIn('read_error', cleared)
            self.assertEqual(len(cleared['selected_revisions']), 3)

    def test_a_kappa_that_is_not_a_string_is_an_error(self):
        with tempfile.TemporaryDirectory() as temp:
            croc = Croc(); croc.selected[0][2]['kappa'] = 0.002
            with self.assertRaises(ValueError): croc.update(Path(temp))

    def test_a_source_prs_that_is_not_a_list_of_integers_is_an_error(self):
        with tempfile.TemporaryDirectory() as temp:
            croc = Croc(); croc.selected[0][2]['source_prs'] = ['5']
            with self.assertRaises(ValueError): croc.update(Path(temp))

    def test_a_listing_that_is_not_a_directory_is_an_error(self):
        with tempfile.TemporaryDirectory() as temp:
            croc = Croc(); croc.api = lambda path, params=None: {'message': 'x'}
            with self.assertRaises(ValueError): croc.update(Path(temp))

if __name__ == '__main__':
    unittest.main()
