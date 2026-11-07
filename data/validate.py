#!/usr/bin/env python3
"""Validate published data and exact rankings; never execute upstream artifacts."""
import hashlib,json,re,sys
from pathlib import Path
from fractions import Fraction
from jsonschema import Draft202012Validator,FormatChecker
sys.dont_write_bytecode=True  # a staged copy of the data folder must stay free of stray files
from direct_note_rules import credit_ok,predecessor_ok
ROOT=Path(__file__).resolve().parent
TIERS=('verified','certified-conditional','claimed')
def load(p):return json.loads((ROOT/p).read_text())
def validate(data,schema):Draft202012Validator(schema,format_checker=FormatChecker()).validate(data)
def safe_path(rel):
 p=ROOT/rel
 assert not p.is_symlink(),rel
 assert p.resolve().is_relative_to(ROOT),rel
 assert p.is_file(),rel
 return p
for p in (ROOT/'schemas').glob('*.json'):Draft202012Validator.check_schema(json.loads(p.read_text()))
registry=load('registry.json');validate(registry,load('schemas/registry-v1.json'))
for listing in registry['repositories']:
 manifest=listing['manifest_source']
 if manifest:
  raw=safe_path(manifest['path']).read_bytes();assert manifest['revision']=='sha256:'+hashlib.sha256(raw).hexdigest(), f"Manifest hash mismatch: {listing['repo']} ({manifest['path']})"
  validate(json.loads(raw),load('schemas/manifest-v1.json'))
for stem in ['submissions','chart-cross-check']:validate(load(stem+'.json'),load('schemas/'+stem+'-v1.json'))
if (ROOT/'direct-notes.json').exists():
 # Reviewed credit notes for direct rows: plain text for a tooltip, at most one predecessor link each.
 for key,n in load('direct-notes.json')['notes'].items():
  assert re.fullmatch(r'direct-(issue|pr)-\d+',key),key
  assert predecessor_ok(n),key
  # Credited authors (optional; Other bounds rows only, see below): 1-5 distinct GitHub logins, in credit order.
  assert set(n)<={'text','predecessor','authors','credit'},key
  # A display credit (optional; Other bounds and Big O direct rows): a plain-text author line and names (credit_ok).
  if 'credit' in n:
   assert credit_ok(n['credit']),key
  if 'authors' in n:
   a=n['authors'];assert isinstance(a,list) and 0<len(a)<=5 and len(set(a))==len(a) and all(isinstance(x,str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9-]{0,38}',x) for x in a),key
   known=load('direct-submissions.json')['entries'].get(key)
   assert not known or known['submission']['problem'] not in ('dft','3sum','apsp','subset-sum','directed-sssp'),'Credited authors on a board row: '+key
  # Plain text, except that a note on an Other bounds row may hold KaTeX between \( and \) (the page renders it with inlineMath).
  assert 0<len(n['text'])<=500 and not re.search(r'[<>&$]',n['text']) and not re.search(r'\\',re.sub(r'\\\(.*?\\\)','',n['text'],flags=re.S)),key
  # Board rows (dft, 3sum, apsp, subset-sum) show a note as plain tooltip text, so a note with TeX belongs to an Other bounds problem.
  # A key the saved state does not know yet cannot be told apart; the first refresh that lists it checks again.
  if '\\' in n['text']:
   known=load('direct-submissions.json')['entries'].get(key)
   assert not known or known['submission']['problem'] not in ('dft','3sum','apsp','subset-sum'),'TeX in the note of a board row: '+key
withdrawn={}
if (ROOT/'direct-notes.json').exists():
 # Direct submissions their submitter withdrew: the refresh lists no row for them, with the reason on record.
 withdrawn=load('direct-notes.json').get('withdrawn',{})
 for key,reason in withdrawn.items():
  assert re.fullmatch(r'direct-(issue|pr)-\d+',key),key
  assert 0<len(reason)<=500 and key not in load('direct-notes.json')['notes'],key
# Reviewed notes on how a record is proved, by board slug and row id, and board notes for every row of one repository
# (data/method-notes.json): plain text for a tooltip and for the chat facts. The text rules are asserts. A noted row that
# is not on its board is only a warning: rows leave a board by themselves (a withdrawn submission, a closed issue, a hold),
# and the hourly refresh runs this check, so a missing row must not stop it.
method_notes={}
# Math is inline TeX in \( \) pairs, as in the Other bounds notes (Lead, 2026-11-04; KaTeX for all math). Outside the
# pairs a note has no backslash; no $ anywhere.
NOTE_MATH=re.compile(r'\\\((?:(?!\\[()]).)+?\\\)')
note_text=lambda text:isinstance(text,str) and text==text.strip() and 0<len(text)<=500 and not re.search(r'[<>&$\n]',text) and '\\' not in NOTE_MATH.sub('',text)
if (ROOT/'method-notes.json').exists():
 method_notes=load('method-notes.json')
 assert method_notes['schema_version']==1 and set(method_notes)<={'schema_version','boards','board_notes'}
 slugs={e['slug'] for e in registry['problems']}
 assert set(method_notes.get('boards',{}))<=slugs and set(method_notes.get('board_notes',{}))<=slugs,'Method notes for an unknown board'
 for board,notes in method_notes.get('boards',{}).items():
  for row_id,text in notes.items():assert note_text(text),(board,row_id)
 for board,shared in method_notes.get('board_notes',{}).items():
  for note in shared:
   assert set(note)=={'repo','text'} and re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+',note['repo']) and note_text(note['text']),(board,note.get('repo'))
# What CrocSwap main certifies (data/crocswap_cert.py): the site reads it to give Human Verified to a CrocSwap PR row.
if (ROOT/'crocswap-certifications.json').exists():
 certs=load('crocswap-certifications.json')
 assert certs['schema_version']==1 and certs['repo']=='CrocSwap/integer-mult-bounds'
 stamped=lambda r:re.fullmatch(r'[0-9a-f]{40}',r['commit']) and re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z',r['committed_at'])
 assert len({r['commit'] for r in certs['selected_revisions']})==len(certs['selected_revisions'])
 for r in certs['selected_revisions']:
  assert stamped(r) and re.fullmatch(r'\d+(/\d+)?',r['kappa']) and all(type(n) is int for n in r['source_prs']),r['commit']
 for pr,r in certs['frontiers'].items():assert pr.isdigit() and stamped(r) and re.fullmatch(r'\d+(/\d+)?',r['kappa']),pr
 for name,source in certs.get('ledger',{}).items():
  assert name in ('pr-ledger','pr-intake-decisions') and re.fullmatch(r'[0-9a-f]{40}',source['blob']),name
  for disposition,numbers in source['dispositions'].items():assert disposition and all(type(n) is int for n in numbers),(name,disposition)
 assert 'read_error' not in certs or set(certs['read_error'])=={'since','message'}
print('Checked',registry['checked_at'])
print('problem | verified | certified-conditional | claimed (observed maximum/minimum) | records')
for entry in registry['problems']:
 p=load(entry['data_file']);validate(p,load('schemas/problem-v1.json'));assert p['problem_id']==entry['problem_id'];assert p['model']['id']==p['problem_id'].split('/')[1]
 records=p['records'];ids=[r['id'] for r in records];assert len(ids)==len(set(ids));assert set(ids)==set(p['record_metadata']);assert records[0]['kind']=='baseline'
 assert records[0]['submitted_at'] is None
 for row_id in sorted(set(method_notes.get('boards',{}).get(entry['slug'],{}))-set(ids)):print('Warning: method note for a row that is not on the board:',entry['slug'],row_id)
 assert isinstance(p['record_metadata']['classical-baseline']['publication_year'],int)
 for r in records:
  assert r['id'] not in withdrawn,'Withdrawn submission listed: '+r['id']
  # An open endpoint (every saving below, or every exponent above, the score) is legal in
  # both directions; only a baseline must be attained.
  if r.get('score_relation')=='strict-upper-bound':assert r['kind']!='baseline',r['id']
  if p['score']['encoding']=='density-time':
   # directed-sssp (data/sssp.py): a point row "D ; T" in the verifier's normal form, or a function row (the
   # classic, papers) in function_text normal form. Only a point row can be Lean Verified. A point row whose T is
   # worse than the classic time at its D needs Lean Verified evidence, as on the other boards (Nil ruling 2026-11-02).
   import sssp
   if ' ; ' in r['score']:
    t=sssp.parse(r['score'])
    if t[2:]>sssp.time_at(sssp.parse_function(records[0]['score']),t[:2]):
     assert p['record_metadata'][r['id']].get('site_tier')=='verified' and r.get('rerun_status',{}).get('state')=='passed','A row worse than the classical baseline without Lean Verified evidence: '+r['id']
   else:
    sssp.parse_function(r['score'])
    assert r['tier']=='claimed' and p['record_metadata'][r['id']].get('site_tier')=='claimed','A function row cannot be Lean Verified: '+r['id']
   chart=p['chart'];[sssp.density(x) for x in chart['ticks']];sssp.parse_function(chart['lower_bound'])
   for line in chart['lines']:sssp.parse_function(line['function']);sssp.density(line['up_to']);assert line['row'] in ids,line['id']
  else:
   assert 'chart' not in p
   q=Fraction(r['score']);assert str(q)==r['score'];assert Fraction(p['score']['minimum'])<=q<=Fraction(p['score']['maximum'])
   # A row worse than the classical baseline needs Lean Verified evidence (Nil ruling 2026-11-02: a stepping stone;
   # the lead, 2026-11-02: Lean Verified rows only). A tie is not worse.
   classic=Fraction(next(x for x in records if x['id']=='classical-baseline')['score'])
   if q<classic if p['score']['direction']=='higher-is-better' else q>classic:
    assert p['record_metadata'][r['id']].get('site_tier')=='verified' and r.get('rerun_status',{}).get('state')=='passed','A row worse than the classical baseline without Lean Verified evidence: '+r['id']
  if 'source_commit' in r:assert r['source_commit']!='0'*40
  a=r['artifact'];assert a['sha256']!='0'*64;assert hashlib.sha256(safe_path(a['path']).read_bytes()).hexdigest()==a['sha256'],r['id']
  m=p['record_metadata'][r['id']]
  assert not m.get('site_badge',False),'No site receipt exists'
  if r['upstream_status'] in ['open','closed-unmerged']:assert not m['eligible_for_record']
  if r['tier']=='certified-conditional':safe_path(r['evidence']['certificate_path'])
  if 'rerun_status' in r:
   validate(r['rerun_status'],load('schemas/records-v1.json')['items']['properties']['rerun_status'])
   if r['rerun_status']['state']!='pending':
    checked_receipt=json.loads(safe_path(r['rerun_status']['receipt_path']).read_text())
    if 'artifact_sha256' in checked_receipt:assert hashlib.sha256(safe_path(checked_receipt['artifact_path']).read_bytes()).hexdigest()==checked_receipt['artifact_sha256']
    for kind in ('log','time'):
     if kind+'_sha256' in checked_receipt:assert hashlib.sha256(safe_path(checked_receipt[kind+'_path']).read_bytes()).hexdigest()==checked_receipt[kind+'_sha256']
  if r['id']=='anthropic-2026':
   assert r['tier']==m['site_tier']=='verified'
   assert r['submitted_at']==load('sources/arxiv-2610.06783-v1.json')['submitted_at']
   assert r['rerun_status']==load('sources/anthropic-rerun-status.json')[entry['slug']]
  if r['id'].startswith('crocswap-'):assert m['comparison_key']=='crocswap/integer-multiplication-v1'
  if r['id'].startswith('crocswap-pr-'):
   source=next(x for x in load('submissions.json')['items'] if x['pr_number']==m['pr_number'])
   assert r['submitted_at']==source['submitted_at'] and r['submitted_at'].endswith('Z')
   assert m['publication_date_precision']=='date-time'
 choose=min if p['score']['direction']=='lower-is-better' else max
 vals=[]
 for tier in TIERS:
  if p['score']['encoding']=='density-time':
   vals.append(str(sum(r['tier']==tier for r in records))+' rows');continue
  pool=[Fraction(r['score']) for r in records if r['tier']==tier];vals.append(str(choose(pool)) if pool else '—')
 print(entry['slug'],'|',' | '.join(vals),'|',len(records))
sub=load('submissions.json')['items'];assert len(sub)==len({s['pr_number'] for s in sub});assert {s['pr_number'] for s in sub}=={p['number'] for p in load('sources/crocswap-pulls.json')}
assert sub[0]['pr_number']==1 and sub[0]['submitted_at']=='2026-10-07T20:58:44Z'
assert any(s['upstream_status']=='merged' for s in sub) and any(s['upstream_status']=='open' for s in sub)
nums=[s for s in sub if s['pr_number']<=44 and s['claimed_score'] is not None];assert len(nums)==42
assert Fraction(nums[0]['claimed_score'])==Fraction('1.7523184e-18');assert Fraction(nums[-1]['claimed_score'])==Fraction('4.100629254e-5')
receipt_path=ROOT/'sources/anthropic-comparator-receipt.json'
if receipt_path.exists():
 receipt=json.loads(receipt_path.read_text())
 for kind in ['log','time']:
  assert hashlib.sha256(safe_path(receipt[kind+'_path']).read_bytes()).hexdigest()==receipt[kind+'_sha256']
 assert receipt['comparator_exit_code']==0 and len(receipt['targets'])==5
print('All schemas, IDs, score ranges, rational encodings, source hashes, PR coverage and chart checks passed.')
print('Observed best numbers are not global record claims. Open PRs and unreviewed comparison tracks cannot hold the record.')

print('Scores marked strict-upper-bound are excluded endpoints, not attained values.')
