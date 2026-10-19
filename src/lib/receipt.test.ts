import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync, readdirSync} from 'node:fs';
import {receiptSlug, receiptPageUrl, receiptView} from './receipt.ts';
import {recordEvidenceUrl} from './record-links.ts';

const root = new URL('../../', import.meta.url);
const json = (path: string) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const publicJson = (path: string) => existsSync(new URL('public/' + path, root)) ? json('public/' + path) : undefined;

test('receipt page addresses', () => {
  assert.equal(receiptSlug('sources/direct-issue-18-39196965603-1.json'), 'direct-issue-18-39196965603-1');
  assert.equal(receiptPageUrl('/sources/anthropic-comparator-receipt.json'), '/receipts/anthropic-comparator-receipt');
});

test('a verifier receipt for an issue says what passed, in the receipt\'s own facts', () => {
  const path = 'sources/direct-issue-18-39196965603-1.json';
  const receipt = publicJson(path), view = receiptView(receipt, publicJson(receipt.source_receipt_path), path);
  assert.equal(view.passed, true);
  assert.equal(view.statement.file, 'challenges/3sum-apsp/EndStatement.lean');
  assert.equal(view.statement.commit, 'e1a4e6508154ea59f030480661590a9fe3018011');
  assert.equal(view.source.repo, 'https://github.com/fringewidth/three-sum-lean');
  assert.equal(view.source.commit, '4a4a98e6eca4fc16817f0d2074026fdaece52efd');
  assert.deepEqual(view.theorems, ['Race.bound']);
  assert.equal(view.leanKernel, 'passed'); assert.equal(view.nanoda, 'passed'); assert.equal(view.axioms.status, 'passed');
  assert.deepEqual(view.axioms.reported.sort(), ['Classical.choice', 'Quot.sound', 'propext']);
  assert.equal(view.links.issue, 'https://github.com/bigospeedrun/verifier/issues/18');
  assert.equal(view.links.run, 'https://github.com/bigospeedrun/verifier/actions/runs/39196965603');
});

test('a pull request receipt names its folder; a maintainer rerun names the OpenAI source', () => {
  const pr = 'sources/direct-pr-6-38193262568-1-final.json', prReceipt = publicJson(pr);
  const prView = receiptView(prReceipt, publicJson(prReceipt.source_receipt_path), pr);
  assert.equal(prView.source.subdir, 'submissions/apsp/ldct-apsp-2995561');
  assert.equal(prView.source.repo, 'https://github.com/bigospeedrun/verifier');
  const m = 'sources/maintainer-matrix-nine-fourths-38112644463.json', mReceipt = publicJson(m);
  const mView = receiptView(mReceipt, publicJson(mReceipt.source_receipt_path), m);
  assert.equal(mView.source.repo, 'https://github.com/openai/math');
  assert.deepEqual(mView.theorems, ['OAI.MatrixMultiplication.complex_omega_le_nine_quarters']);
  assert.equal(mView.statement.file, 'challenges/matrix-multiplication/MatrixMultiplication.lean');
  assert.deepEqual(mView.axioms.allowed.sort(), ['Classical.choice', 'Quot.sound', 'propext']);
  assert.equal(mView.links.run, 'https://github.com/bigospeedrun/verifier/actions/runs/38112644463');
});

test('an older hand-written receipt keeps its own scope text and shows no invented facts', () => {
  const path = 'sources/anthropic-comparator-receipt.json', view = receiptView(publicJson(path), undefined, path);
  assert.equal(view.passed, true); assert.match(view.scope ?? '', /Comparator rerun/);
  assert.equal(view.leanKernel, 'passed'); assert.equal(view.nanoda, 'passed');
  assert.equal(view.source.repo, undefined); assert.equal(view.links.run, undefined);
  assert.ok(view.files.every(f => !f.path.startsWith('[')), 'no private paths in the file list');
});

// Every Lean Verified row of every board: its level link is a receipt page or a prove2.me theorem, never a bare
// GitHub Actions run, and the receipt behind a page reads as a pass.
test('no level link points at an Actions run; every receipt page has a passing receipt', () => {
  const registry = json('src/data/registry.json');
  const pages = new Set<string>(), seen: string[] = [];
  for (const entry of registry.problems) {
    const board = json('src/data/' + entry.data_file);
    for (const record of board.records) {
      const rerun = record.rerun_status;
      if (!rerun?.receipt_path) continue;
      const meta = board.record_metadata[record.id];
      const link = recordEvidenceUrl('lean-verified', record, undefined, meta.prove2me === true ? meta.source_url : meta.receipt_url);
      seen.push(`${entry.slug}/${record.id} -> ${link}`);
      assert.ok(link, record.id);
      assert.ok(!/^https:\/\/github\.com\/.*\/actions\//.test(link!), `${record.id} links an Actions run: ${link}`);
      if (link!.startsWith('/receipts/')) pages.add(rerun.receipt_path);
    }
  }
  assert.ok(pages.size >= 15, 'receipt pages: ' + pages.size);
  for (const known of ['sources/direct-issue-18-39196965603-1.json', 'sources/maintainer-matrix-nine-fourths-38112644463.json', 'sources/anthropic-comparator-receipt.json']) assert.ok(pages.has(known), known);
  for (const path of pages) {
    const receipt = publicJson(path), source = typeof receipt?.source_receipt_path === 'string' ? publicJson(receipt.source_receipt_path) : undefined;
    assert.ok(receipt, path + ' exists in public/');
    const view = receiptView(receipt, source, path);
    assert.equal(view.passed, true, path);
    assert.ok(view.checkedAt, path + ' has a date');
  }
  assert.ok(seen.length > 0 && readdirSync(new URL('public/sources', root)).length > 0);
});

test('a first-stage receipt shows nanoda as not finished, never as passed', () => {
  for (const path of ['sources/direct-issue-14-38739681220-1-lean.json', 'sources/direct-pr-13-38739681220-1-lean.json']) {
    const receipt = publicJson(path), view = receiptView(receipt, publicJson(receipt.source_receipt_path), path);
    assert.equal(receipt.description, 'Lean and permitted-axiom audit passed; nanoda advisory check pending', path);
    assert.equal(view.leanKernel, 'passed', path); assert.equal(view.nanoda, 'pending', path); assert.equal(view.axioms.status, 'passed', path);
  }
  // The same words with no structured fields: the clause reading must also say pending.
  const bare = receiptView({status: 'passed', description: 'Lean and permitted-axiom audit passed; nanoda advisory check pending'}, undefined, 'sources/x.json');
  assert.deepEqual([bare.leanKernel, bare.nanoda, bare.axioms.status], ['passed', 'pending', 'passed']);
});

test('the one-line result is read clause by clause and only for a receipt with no structured fields', () => {
  const view = (description: string, extra = {}) => receiptView({status: 'passed', description, ...extra}, undefined, 'sources/x.json');
  assert.deepEqual([view('Lean and nanoda passed; permitted-axiom audit passed').leanKernel, view('Lean and nanoda passed; permitted-axiom audit passed').nanoda], ['passed', 'passed']);
  const mixed = view('Lean failed; nanoda passed');
  assert.deepEqual([mixed.leanKernel, mixed.nanoda], ['failed', 'passed']);
  const nanodaOnly = view('The nanoda passed list was checked; Lean passed? no');
  assert.deepEqual([nanodaOnly.leanKernel, nanodaOnly.nanoda], [undefined, undefined]);
  // A structured field outranks the words.
  const structured = view('Lean and nanoda passed; permitted-axiom audit passed', {nanoda: 'rejected'});
  assert.deepEqual([structured.leanKernel, structured.nanoda], [undefined, 'failed']);
});

test('Comparator is named only when the receipt names it; a repository link must be https', () => {
  const sussman = 'sources/sussman-boukhalfa-dft-receipt.json', receipt = publicJson(sussman);
  assert.equal(receiptView(receipt, undefined, sussman).comparator, false);
  assert.equal(receiptView(receipt, undefined, sussman).leanKernel, 'passed');
  for (const path of ['sources/anthropic-comparator-receipt.json', 'sources/dft-frontier-receipt.json', 'sources/direct-issue-18-39196965603-1.json']) {
    const r = publicJson(path);
    assert.equal(receiptView(r, typeof r.source_receipt_path === 'string' ? publicJson(r.source_receipt_path) : undefined, path).comparator, true, path);
  }
  const odd = receiptView({status: 'passed'}, {binding: {repo_url: 'http://example.org/x', commit: 'abc'}}, 'sources/x.json');
  assert.equal(odd.source.repo, undefined);
});
