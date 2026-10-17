import contextlib
import copy
import hashlib
import io
import json
import os
import re
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import prove2me_import as p2m

ROOT = Path(__file__).resolve().parent
ENV = 'envs/0df444a/'
DEF = ENV + 'Definitions/Def_Spec.lean'
DEF_BODY = b'namespace EndStatement\ndef APSP := 0\nend EndStatement\n'


def page(entries, rules):
    payload = '7:' + json.dumps({'entries': entries, 'rules': rules}, separators=(',', ':'))[1:-1]
    return ('<html><script>self.__next_f.push(' + json.dumps([1, payload]) + ')</script></html>').encode()


def statement(name, value):
    return ('import Definitions.Def_Spec\n\ntheorem ' + name + ' :\n    EndStatement.APSP.SolvedInTime ' + value + ' := by sorry\n').encode()


def formalpedia(header, body):
    return b''.join(b'-- ' + line.encode() + b'\n' for line in header) + b'\n' + body


class Fixture:
    def __init__(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.rules = dict(id='c1', slug='apsp-exponent', name='APSP', status='active', value_type='real', bound_type='upper', value_direction='lower')
        self.live = []
        self.files = {}
        entries = []
        # A link to an existing row, then a new best result, then a result that is not the best.
        for mission, value, solved, action in [('m1', '2.99942', '2026-10-06T10:00:00+00:00', 'link'),
                                               ('m2', '2.9983', '2026-10-06T17:00:00+00:00', 'row')]:
            name = 'Goal' + mission
            st = ENV + 'Theorems/Thm_' + name + '.lean'
            so = ENV + 'Solutions/Sol_' + name + '.lean'
            url = 'https://prove2.me/theorems/t-' + mission
            sbody = statement(name, value)
            solbody = b'theorem solution : True := trivial\n'
            self.files[st] = formalpedia(['Prove2me | x', 'status  : Proved', 'url     : ' + url], sbody)
            self.files[so] = formalpedia(['Prove2me | solution 1', 'status  : ACCEPTED   (prove)'], solbody)
            entry = dict(mission_id=mission, value=value, solved_at=solved, action=action,
                         theorem=dict(name=name, url=url, statement_path=st, statement_sha256=hashlib.sha256(sbody).hexdigest(), definitions=[DEF]),
                         solution=dict(path=so, sha256=hashlib.sha256(solbody).hexdigest(), author='@a'))
            if action == 'link':
                entry['record_id'] = 'anthropic-2026'
                entry['same_proof'] = 'The statement header names the row source.'
            else:
                entry['authors'] = [dict(name='wurtle', url='https://prove2.me/users/u1')]
            entries.append(entry)
            self.live.append(dict(id='e' + mission, mission_id=mission, attested_value=value, proved=True, solved_at=solved, recorded_at=solved))
        self.files[DEF] = formalpedia(['Prove2me | d', 'status  : Definition'], DEF_BODY)
        self.trust = dict(schema_version=1, reviewed_at='2026-10-17', reviewed_by='test', review_rule='test',
                          formalpedia=dict(repo='prove2me/formalpedia', ref='main', env='0df444a'),
                          boards=dict(apsp=dict(campaign={k: self.rules[k] for k in p2m.RULE_KEYS}, statement_form='test',
                                                definitions={DEF: hashlib.sha256(DEF_BODY).hexdigest()}, entries=entries)))
        doc = dict(schema_version=1, problem_id='apsp/word-ram', model=dict(id='word-ram', version='1'),
                   score=dict(direction='lower-is-better'), checked_at='2026-10-16', updated_at='2026-10-16T00:00:00Z',
                   records=[dict(id='classical-baseline', kind='baseline', score='3', submitted_at=None, site_observed_at='2026-10-08T00:00:00Z'),
                            dict(id='anthropic-2026', kind='improvement', score='149971/50000', submitted_at='2026-10-05T17:44:29Z', site_observed_at='2026-10-08T00:00:00Z')],
                   record_metadata={'classical-baseline': {}, 'anthropic-2026': {}})
        self.write('apsp.json', doc)
        self.write('registry.json', dict(updated_at='2026-10-16T00:00:00Z', checked_at='2026-10-16', problems=[dict(slug='apsp', data_file='apsp.json')]))
        self.save_trust()

    def write(self, name, value):
        (self.root / name).write_text(json.dumps(value, indent=2) + '\n')

    def save_trust(self):
        self.write('prove2me-trust.json', self.trust)

    def add_second_board(self):
        """A 3sum board with one new best result, on its own campaign page."""
        self.rules3 = dict(self.rules, id='c3', slug='3sum-exponent')
        name, value, solved = 'Goal3', '1.9991', '2026-10-06T18:00:00+00:00'
        st, so = ENV + 'Theorems/Thm_' + name + '.lean', ENV + 'Solutions/Sol_' + name + '.lean'
        url = 'https://prove2.me/theorems/t-3'
        sbody, solbody = statement(name, value), b'theorem solution : True := trivial\n'
        self.files[st] = formalpedia(['Prove2me | x', 'status  : Proved', 'url     : ' + url], sbody)
        self.files[so] = formalpedia(['Prove2me | solution 1', 'status  : ACCEPTED   (prove)'], solbody)
        self.live3 = [dict(mission_id='m3', attested_value=value, proved=True, solved_at=solved)]
        self.trust['boards']['3sum'] = dict(campaign={k: self.rules3[k] for k in p2m.RULE_KEYS}, statement_form='test',
            definitions={DEF: hashlib.sha256(DEF_BODY).hexdigest()},
            entries=[dict(mission_id='m3', value=value, solved_at=solved, action='row', authors=[dict(name='marwahaha', url='https://prove2.me/users/u2')],
                          theorem=dict(name=name, url=url, statement_path=st, statement_sha256=hashlib.sha256(sbody).hexdigest(), definitions=[DEF]),
                          solution=dict(path=so, sha256=hashlib.sha256(solbody).hexdigest(), author='@b'))])
        doc = self.doc()
        doc['problem_id'] = '3sum/word-ram'
        doc['records'][1]['score'] = '2499/1250'
        self.write('3sum.json', doc)
        registry = json.loads((self.root / 'registry.json').read_text())
        registry['problems'].append(dict(slug='3sum', data_file='3sum.json'))
        self.write('registry.json', registry)
        self.save_trust()

    def get(self, url):
        if url == p2m.CAMPAIGN_URL + 'apsp-exponent':
            return page(self.live, self.rules)
        if url == p2m.CAMPAIGN_URL + '3sum-exponent':
            return page(self.live3, self.rules3)
        prefix = p2m.RAW_URL + 'prove2me/formalpedia/main/'
        if url.startswith(prefix) and url[len(prefix):] in self.files:
            return self.files[url[len(prefix):]]
        raise p2m.Hold('cannot read ' + url)

    def run(self):
        changed, state, held = p2m.run(self.root, self.get, now='2026-10-17T01:00:00Z')
        for path, raw in changed.items():
            target = self.root / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
        return changed, state, held

    def doc(self, name='apsp.json'):
        return json.loads((self.root / name).read_text())


class Prove2meImportTest(unittest.TestCase):
    def setUp(self):
        self.f = Fixture()
        self.addCleanup(self.f.temp.cleanup)

    @mock.patch.object(p2m, 'LEAN_VERIFIED', False)
    def test_reviewed_entries_give_links_and_best_rows_and_rerun_is_unchanged(self):
        changed, state, held = self.f.run()
        self.assertEqual(held, {})
        board = state['boards']['apsp']
        self.assertEqual(board['status'], 'ok')
        self.assertEqual(board['links'], {'anthropic-2026': 'https://prove2.me/theorems/t-m1'})
        rows = [r for r in self.f.doc()['records'] if r['id'].startswith('prove2me-')]
        self.assertEqual([r['id'] for r in rows], ['prove2me-apsp-2-9983'])
        row = rows[0]
        meta = self.f.doc()['record_metadata'][row['id']]
        self.assertEqual((row['score'], row['tier'], row['submitted_at']), ('29983/10000', 'claimed', '2026-10-06T17:00:00Z'))
        self.assertEqual(row['authors'], [dict(name='wurtle', url='https://prove2.me/users/u1')])
        self.assertTrue(meta['prove2me'])
        self.assertEqual(meta['site_tier'], 'claimed')
        self.assertNotIn('rerun_status', row)
        self.assertEqual(hashlib.sha256((self.f.root / row['artifact']['path']).read_bytes()).hexdigest(), row['artifact']['sha256'])
        again, _, held = self.f.run()
        self.assertEqual((again, held), ({}, {}))

    def test_the_switch_gives_lean_verified_rows_with_a_receipt(self):
        with mock.patch.object(p2m, 'LEAN_VERIFIED', True):
            self.f.run()
        row = next(r for r in self.f.doc()['records'] if r['id'] == 'prove2me-apsp-2-9983')
        self.assertEqual(row['tier'], 'verified')
        self.assertEqual(row['rerun_status'], dict(state='passed', checked_at='2026-10-06T17:00:00Z', receipt_path=row['artifact']['path']))
        receipt = json.loads((self.f.root / row['artifact']['path']).read_text())
        self.assertTrue(receipt['lean_verified'])

    def held_after(self, change):
        self.f.run()
        before = self.f.doc()
        change()
        changed, state, held = self.f.run()
        self.assertIn('apsp', held)
        board = state['boards']['apsp']
        self.assertEqual(board['status'], 'held')
        self.assertEqual(board['links'], {'anthropic-2026': 'https://prove2.me/theorems/t-m1'})
        self.assertEqual(self.f.doc()['records'], before['records'], 'a held board keeps its last import')
        return board['reason']

    def test_an_unreviewed_proved_entry_holds_the_board(self):
        reason = self.held_after(lambda: self.f.live.append(dict(mission_id='m9', attested_value='2.99', proved=True, solved_at='2026-10-08T00:00:00+00:00')))
        self.assertIn('unreviewed proved entry 2.99', reason)

    def test_an_open_unreviewed_entry_does_not_hold(self):
        self.f.run()
        self.f.live.append(dict(mission_id='m9', attested_value='2.9', proved=False, solved_at=None))
        _, _, held = self.f.run()
        self.assertEqual(held, {})

    def test_changed_statement_bytes_hold_the_board(self):
        path = self.f.trust['boards']['apsp']['entries'][1]['theorem']['statement_path']
        reason = self.held_after(lambda: self.f.files.__setitem__(path, self.f.files[path].replace(b'by sorry', b' := by sorry -- x')))
        self.assertIn('statement changed', reason)

    def test_a_changed_definition_holds_the_board(self):
        reason = self.held_after(lambda: self.f.files.__setitem__(DEF, self.f.files[DEF] + b'instance : True := trivial\n'))
        self.assertIn('changed', reason)

    def test_header_text_edits_do_not_hold_but_status_changes_do(self):
        path = self.f.trust['boards']['apsp']['entries'][0]['theorem']['statement_path']
        self.f.files[path] = self.f.files[path].replace(b'-- Prove2me | x', b'-- Prove2me | x\n-- title: edited description')
        _, _, held = self.f.run()
        self.assertEqual(held, {})
        reason = self.held_after(lambda: self.f.files.__setitem__(path, self.f.files[path].replace(b'status  : Proved', b'status  : Open')))
        self.assertIn("status is 'Open'", reason)

    def test_new_value_or_lost_proof_or_rules_hold_the_board(self):
        def value():
            self.f.live[1]['attested_value'] = '2.9984'
        self.assertIn('now has value', self.held_after(value))
        self.f.live[1]['attested_value'] = '2.9983'
        self.f.live[0]['proved'] = False
        self.assertIn('no longer proved', self.f.run()[2]['apsp'])
        self.f.live[0]['proved'] = True
        self.f.rules['bound_type'] = 'lower'
        self.assertIn('campaign bound_type', self.f.run()[2]['apsp'])

    def test_a_missing_link_target_or_an_unreachable_page_holds_the_board(self):
        def drop():
            doc = self.f.doc()
            doc['records'] = [r for r in doc['records'] if r['id'] != 'anthropic-2026']
            del doc['record_metadata']['anthropic-2026']
            self.f.write('apsp.json', doc)
        self.f.run()
        drop()
        self.assertIn('board row anthropic-2026', self.f.run()[2]['apsp'])
        with mock.patch.object(self.f, 'get', side_effect=p2m.Hold('cannot read x')):
            self.assertIn('cannot read', p2m.run(self.f.root, self.f.get)[2]['apsp'])

    def test_a_row_must_be_the_best_result_at_its_solved_time(self):
        doc = self.f.doc()
        doc['records'].append(dict(id='earlier', kind='improvement', score='2997/1000', submitted_at='2026-10-06T12:00:00Z', site_observed_at='2026-10-06T12:00:00Z'))
        doc['record_metadata']['earlier'] = {}
        self.f.write('apsp.json', doc)
        _, _, held = self.f.run()
        self.assertIn('not the best result', held['apsp'])
        doc['records'][-1]['submitted_at'] = '2026-10-06T18:00:00Z'
        self.f.write('apsp.json', doc)
        _, _, held = self.f.run()
        self.assertEqual(held, {})

    def test_a_row_that_now_matches_a_board_row_needs_review_as_a_link(self):
        doc = self.f.doc()
        doc['records'].append(dict(id='same', kind='improvement', score='29983/10000', submitted_at='2026-10-07T00:00:00Z', site_observed_at='2026-10-07T00:00:00Z'))
        doc['record_metadata']['same'] = {}
        self.f.write('apsp.json', doc)
        self.assertIn('review it as a link', self.f.run()[2]['apsp'])
        # A reviewed row with another proof of the same value may stay.
        self.f.trust['boards']['apsp']['entries'][1]['same_value_rows'] = ['same']
        self.f.save_trust()
        self.assertEqual(self.f.run()[2], {})

    def test_a_link_without_same_proof_evidence_holds_the_board(self):
        del self.f.trust['boards']['apsp']['entries'][0]['same_proof']
        self.f.save_trust()
        self.assertIn('no same-proof evidence', self.f.run()[2]['apsp'])

    def test_a_new_page_layout_or_file_format_holds_the_board(self):
        self.f.run()
        real = self.f.get
        def layout(url):
            raw = real(url)
            return raw.replace(b'self.__next_f.push', b'window.__data.push') if url.startswith(p2m.CAMPAIGN_URL) else raw
        with mock.patch.object(self.f, 'get', side_effect=layout):
            self.assertIn('campaign page has no entry list', self.f.run()[2]['apsp'])
        def entry_shape(url):
            raw = real(url)
            return raw.replace(b'attested_value', b'value') if url.startswith(p2m.CAMPAIGN_URL) else raw
        with mock.patch.object(self.f, 'get', side_effect=entry_shape):
            self.assertIn('unknown shape', self.f.run()[2]['apsp'])
        def no_header(url):
            raw = real(url)
            return raw.replace(b'-- ', b'// ') if url.startswith(p2m.RAW_URL) else raw
        with mock.patch.object(self.f, 'get', side_effect=no_header):
            self.assertIn('status is None', self.f.run()[2]['apsp'])

    def test_removed_rows_leave_the_document_and_kept_rows_keep_their_place(self):
        self.f.run()
        doc = self.f.doc()
        doc['records'].append(dict(id='later', kind='improvement', score='2/1', submitted_at='2026-10-09T00:00:00Z', site_observed_at='2026-10-09T00:00:00Z'))
        doc['record_metadata']['later'] = {}
        self.f.write('apsp.json', doc)
        self.assertEqual(self.f.run()[0], {})
        self.f.trust['boards']['apsp']['entries'][1]['action'] = 'skip'
        self.f.save_trust()
        self.f.run()
        self.assertEqual([r['id'] for r in self.f.doc()['records']], ['classical-baseline', 'anthropic-2026', 'later'])

    def test_formalpedia_body_hash_matches_the_index_convention(self):
        header, body = p2m.split_header(b'-- Prove2me | s\n-- status  : ACCEPTED   (prove)\n\nimport A\n\ntheorem solution : True := trivial\n')
        self.assertEqual(header['status'], 'ACCEPTED   (prove)')
        self.assertEqual(body, b'import A\n\ntheorem solution : True := trivial\n')

    def test_one_held_board_does_not_stop_the_other_board(self):
        self.f.add_second_board()
        self.f.live.append(dict(mission_id='m9', attested_value='2.99', proved=True, solved_at='2026-10-08T00:00:00+00:00'))
        changed, state, held = self.f.run()
        self.assertEqual(list(held), ['apsp'])
        self.assertEqual(state['boards']['3sum']['status'], 'ok')
        self.assertIn('3sum.json', changed)
        self.assertEqual([r['id'] for r in self.f.doc('3sum.json')['records'] if r['id'].startswith('prove2me-')], ['prove2me-3sum-1-9991'])
        # The held board writes no rows and no receipts.
        self.assertNotIn('apsp.json', changed)
        self.assertEqual([p for p in changed if p.startswith('sources/')], ['sources/prove2me-3sum-1-9991.json'])

    def test_a_crash_in_one_board_holds_only_that_board(self):
        self.f.add_second_board()
        real = p2m.check_board
        def crash(slug, *args):
            if slug == 'apsp':
                raise RuntimeError('boom\n::error::injected')
            return real(slug, *args)
        with mock.patch.object(p2m, 'check_board', side_effect=crash):
            changed, state, held = self.f.run()
        self.assertEqual(list(held), ['apsp'])
        self.assertIn('unexpected error (RuntimeError', held['apsp'])
        self.assertEqual(state['boards']['3sum']['status'], 'ok')

    def test_a_row_must_beat_an_earlier_imported_row(self):
        entries = self.f.trust['boards']['apsp']['entries']
        later = copy.deepcopy(entries[1])
        later.update(mission_id='m3', value='2.999', solved_at='2026-10-06T20:00:00+00:00')
        later['theorem'] = dict(later['theorem'], name='Goalm3', url='https://prove2.me/theorems/t-m3',
                                statement_path=ENV + 'Theorems/Thm_Goalm3.lean', statement_sha256=hashlib.sha256(statement('Goalm3', '2.999')).hexdigest())
        self.f.files[later['theorem']['statement_path']] = formalpedia(['Prove2me | x', 'status  : Proved', 'url     : https://prove2.me/theorems/t-m3'], statement('Goalm3', '2.999'))
        entries.append(later)
        self.f.live.append(dict(mission_id='m3', attested_value='2.999', proved=True, solved_at='2026-10-06T20:00:00+00:00'))
        self.f.save_trust()
        self.assertIn('entry 2.999 was not the best', self.f.run()[2]['apsp'])
        # A skipped earlier result counts too, unless it is marked unsound.
        entries.pop()
        entries[1]['action'] = 'skip'
        entries.append(dict(later, value='2.9984'))
        entries[-1]['theorem'] = dict(later['theorem'], statement_sha256=hashlib.sha256(statement('Goalm3', '2.9984')).hexdigest())
        self.f.files[later['theorem']['statement_path']] = formalpedia(['Prove2me | x', 'status  : Proved', 'url     : https://prove2.me/theorems/t-m3'], statement('Goalm3', '2.9984'))
        self.f.live[-1]['attested_value'] = '2.9984'
        self.f.save_trust()
        self.assertIn('entry 2.9984 was not the best', self.f.run()[2]['apsp'])
        entries[1]['unsound'] = True
        self.f.save_trust()
        self.assertEqual(self.f.run()[2], {})

    def test_hold_reasons_are_ascii_one_line_and_capped(self):
        self.f.run()
        self.f.live.append(dict(mission_id='m9\n::error::x', attested_value='\u00e9' + 'x' * 900, proved=True, solved_at=None))
        _, state, held = self.f.run()
        reason = held['apsp']
        self.assertEqual(reason, state['boards']['apsp']['reason'])
        self.assertTrue(reason.isascii())
        self.assertNotIn('\n', reason)
        self.assertLessEqual(len(reason), p2m.REASON_CAP)
        saved = json.loads((self.f.root / 'prove2me.json').read_text())['boards']['apsp']['reason']
        self.assertEqual(saved, reason)

    def test_main_exits_3_on_hold_and_writes_a_step_summary(self):
        self.f.live.append(dict(mission_id='m9\n::error::x', attested_value='2.99', proved=True, solved_at=None))
        summary = self.f.root / 'summary.md'
        out, err = io.StringIO(), io.StringIO()
        with mock.patch.object(p2m, 'ROOT', self.f.root), mock.patch.object(p2m, 'fetch', self.f.get), \
                mock.patch('direct_refresh.transaction') as transaction, mock.patch.object(sys, 'argv', ['prove2me_import.py']), \
                mock.patch.dict(os.environ, {'GITHUB_STEP_SUMMARY': str(summary)}), \
                contextlib.redirect_stdout(out), contextlib.redirect_stderr(err), self.assertRaises(SystemExit) as stop:
            p2m.main()
        self.assertEqual(stop.exception.code, p2m.HELD_EXIT)
        transaction.assert_called_once()
        self.assertIn('apsp: held', summary.read_text())
        for line in (out.getvalue() + err.getvalue()).splitlines():
            self.assertFalse(line.startswith('::'), line)
            self.assertTrue(line.startswith('prove2.me import'), line)

    def test_oversized_fetch_holds_and_long_pages_parse_in_linear_time(self):
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = b'x' * (p2m.MAX_BYTES + 1)
        with mock.patch('urllib.request.urlopen', return_value=response):
            with self.assertRaises(p2m.Hold):
                p2m.fetch('https://prove2.me/campaigns/x')
        html = p2m.PUSH * 20000 + '[1,"x"]'
        with self.assertRaises(p2m.Hold):
            p2m.campaign_data(html)


class TrustFileTest(unittest.TestCase):
    def test_the_reviewed_trust_file_is_complete(self):
        trust = json.loads((ROOT / 'prove2me-trust.json').read_text())
        digest = re.compile(r'^[0-9a-f]{64}$')
        for slug, board in trust['boards'].items():
            self.assertEqual(set(board['campaign']), set(p2m.RULE_KEYS), slug)
            self.assertTrue(all(digest.match(v) for v in board['definitions'].values()))
            missions = [e['mission_id'] for e in board['entries']]
            self.assertEqual(len(missions), len(set(missions)))
            for entry in board['entries']:
                self.assertIn(entry['action'], ('link', 'row', 'skip'))
                p2m.utc(entry['solved_at'])
                if entry['action'] == 'skip':
                    self.assertTrue(entry['note'])
                    continue
                theorem = entry['theorem']
                self.assertTrue(theorem['url'].startswith('https://prove2.me/theorems/'))
                self.assertTrue(digest.match(theorem['statement_sha256']) and digest.match(entry['solution']['sha256']))
                self.assertTrue(set(theorem['definitions']) <= set(board['definitions']))
                if entry['action'] == 'link':
                    self.assertTrue(entry['record_id'] and entry['same_proof'])
                else:
                    self.assertTrue(entry['authors'] and all(a['url'].startswith('https://') for a in entry['authors']))


if __name__ == '__main__':
    unittest.main()
