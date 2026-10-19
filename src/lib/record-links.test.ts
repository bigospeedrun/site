import test from 'node:test';
import assert from 'node:assert/strict';
import {authorFromProfile,recordEvidenceUrl} from './record-links.ts';
test('authors use only published profile names and X handles, with login fallback',()=>{
 assert.deepEqual(authorFromProfile({name:'Unverified name',url:'https://github.com/Example/repo'},{}),{name:'Example',login:'Example',url:'https://github.com/Example',twitterUsername:undefined});
 assert.equal(authorFromProfile({name:'old',url:'https://github.com/Example'},{example:{name:'Published name',login:'example',twitter_username:'published'}}).twitterUsername,'published');
});
test('evidence links distinguish publication, accepted review and verifier receipt',()=>{
 const record={submission_url:'https://github.com/CrocSwap/integer-mult-bounds/pull/42',rerun_status:{receipt_path:'sources/receipt.json'}};
 assert.equal(recordEvidenceUrl('claimed',record,'https://example.org/paper'),'https://example.org/paper');
 assert.equal(recordEvidenceUrl('human-verified',record,'https://example.org/paper'),record.submission_url);
 assert.equal(recordEvidenceUrl('human-verified',{},'https://example.org/selected'),'https://example.org/selected');
 // A check of ours links its receipt page on the site, not the raw file or the Actions run.
 assert.equal(recordEvidenceUrl('lean-verified',record),'/receipts/receipt');
 assert.equal(recordEvidenceUrl('lean-verified',{}),undefined);
 assert.equal(recordEvidenceUrl('lean-verified',record,undefined,'https://github.com/bigospeedrun/verifier/actions/runs/123'),'/receipts/receipt');
 // Only a run and no receipt file: the run is all there is.
 assert.equal(recordEvidenceUrl('lean-verified',{},undefined,'https://github.com/bigospeedrun/verifier/actions/runs/123'),'https://github.com/bigospeedrun/verifier/actions/runs/123');
 // prove2.me rows link the human-readable theorem page; other hosts fall back to the receipt page.
 assert.equal(recordEvidenceUrl('lean-verified',record,undefined,'https://prove2.me/theorems/abc'),'https://prove2.me/theorems/abc');
 assert.equal(recordEvidenceUrl('lean-verified',record,undefined,'https://example.org/run'),'/receipts/receipt');
 // A prove2.me import's own receipt file is not a proof check receipt.
 assert.equal(recordEvidenceUrl('lean-verified',{rerun_status:{receipt_path:'sources/prove2me-3sum-1-99913.json'}}),'/sources/prove2me-3sum-1-99913.json');
});
