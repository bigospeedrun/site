import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {crocswapCertification,crocswapVerification,ledgerDisposition,archivalIntakePolicyAt,noCertifications,type CrocswapCertifications} from './crocswap-cert.ts';

const revision=(commit:string,committed_at:string,kappa:string,source_prs:number[])=>({commit,committed_at,kappa,source_prs});
const certs:CrocswapCertifications={
 selected_revisions:[
  revision('a1','2026-10-12T01:55:19Z','3/1000',[10,11]),
  revision('a2','2026-10-13T05:57:09Z','1/200',[11,12]),
  revision('a3','2026-10-14T00:00:00Z','1/200',[11,12,13]),
 ],
 frontiers:{'12':{commit:'f12',committed_at:'2026-10-13T18:00:00Z',kappa:'1/200'},'20':{commit:'f20',committed_at:'2026-10-15T00:00:00Z',kappa:'7/9'}},
};

test('a PR is certified when a selected-result revision has its kappa and lists it',()=>{
 assert.deepEqual(crocswapCertification(certs,10,'3/1000'),{commit:'a1',at:'2026-10-12T01:55:19Z',via:'selected-result'});
 // The kappa compares as a number: 6/2000 is 3/1000.
 assert.equal(crocswapCertification(certs,10,'6/2000')?.commit,'a1');
});
test('a PR that a revision lists with another kappa, or that no revision lists, is not certified',()=>{
 assert.equal(crocswapCertification(certs,10,'1/200'),undefined);
 assert.equal(crocswapCertification(certs,13,'3/1000'),undefined);
 assert.equal(crocswapCertification(certs,99,'1/200'),undefined);
 assert.equal(crocswapCertification(noCertifications,10,'3/1000'),undefined);
});
test('the earliest certifying commit gives the time of Human Verified',()=>{
 // Revisions a2 and a3 both certify #11 at 1/200: the first one counts.
 assert.equal(crocswapCertification(certs,11,'1/200')?.commit,'a2');
 // #12 is certified by a2 (2026-10-13T05:57Z) and by its frontier file (18:00Z): the earlier one counts.
 assert.deepEqual(crocswapCertification(certs,12,'1/200'),{commit:'a2',at:'2026-10-13T05:57:09Z',via:'selected-result'});
});
test('a frontier file certifies its PR only at the kappa that it states',()=>{
 assert.deepEqual(crocswapCertification(certs,20,'7/9'),{commit:'f20',at:'2026-10-15T00:00:00Z',via:'frontier'});
 assert.equal(crocswapCertification(certs,20,'1/9'),undefined);
});

const ledgerCerts:CrocswapCertifications={...certs,ledger:{
 'pr-ledger':{blob:'a'.repeat(40),dispositions:{incorporated:[30,31],partially_reviewed:[32,33,34],unreviewed:[35]}},
 'pr-intake-decisions':{blob:'b'.repeat(40),dispositions:{incorporated:[33],partially_reviewed:[36]}},
}};
const before='2026-10-14T00:00:00Z',after='2026-10-17T00:00:00Z';
const merged=(pr:number,mergedAt:string,score='9/9')=>crocswapVerification(ledgerCerts,{pr,score,upstreamStatus:'merged',mergedAt});
test('a newer ledger file overrides the older one',()=>{
 assert.equal(ledgerDisposition(ledgerCerts,32),'partially_reviewed');
 assert.equal(ledgerDisposition(ledgerCerts,33),'incorporated');
 assert.equal(ledgerDisposition(ledgerCerts,99),undefined);
 assert.equal(ledgerDisposition(noCertifications,32),undefined);
});
test('a merged row: incorporated is verified, partially reviewed is claimed, no entry depends on the policy date',()=>{
 assert.deepEqual(merged(30,after),{at:after,via:'ledger'});
 assert.deepEqual(merged(33,after),{at:after,via:'ledger'});
 assert.equal(merged(32,before),undefined,'archival intake is claimed even before the policy date');
 assert.equal(merged(36,after),undefined);
 assert.equal(merged(35,before),undefined,'another disposition is not incorporated');
 assert.deepEqual(merged(98,before),{at:before,via:'before-ledger'},'an early merge with no entry');
 assert.equal(merged(98,after),undefined,'a merge after the policy with no entry waits');
 assert.equal(merged(98,archivalIntakePolicyAt),undefined,'the policy second itself is after');
});
test('certification beats a partially reviewed ledger entry, and a row that is not merged needs certification',()=>{
 assert.equal(merged(12,after,'1/200')?.via,'selected-result');
 const archival:CrocswapCertifications={...certs,ledger:{'pr-ledger':{blob:'a'.repeat(40),dispositions:{partially_reviewed:[12]}}}};
 assert.equal(crocswapVerification(archival,{pr:12,score:'1/200',upstreamStatus:'merged',mergedAt:after})?.via,'selected-result');
 assert.equal(crocswapVerification(archival,{pr:12,score:'1/100',upstreamStatus:'merged',mergedAt:after}),undefined,'another kappa is not certified');
 assert.equal(crocswapVerification(ledgerCerts,{pr:30,score:'9/9',upstreamStatus:'open'}),undefined);
 assert.equal(crocswapVerification(ledgerCerts,{pr:98,score:'9/9',upstreamStatus:'closed-unmerged',mergedAt:before}),undefined);
 assert.equal(crocswapVerification(ledgerCerts,{pr:98,score:'9/9',upstreamStatus:'merged'}),undefined,'no merge time, no verdict');
});

// The committed history (data/crocswap_cert.py): facts that do not change with new data.
const history:CrocswapCertifications=JSON.parse(readFileSync(new URL('../data/crocswap-certifications.json',import.meta.url),'utf8'));
test('the stored CrocSwap history certifies #5413 at its commit and leaves the archival-only merge #5650 uncertified',()=>{
 const certified=crocswapCertification(history,5413,'605457647/200000000000')!;
 assert.match(certified.commit!,/^1a3ced60/);
 assert.equal(certified.at,'2026-10-24T03:30:46Z');
 assert.equal(crocswapCertification(history,5650,'77661117/25000000000'),undefined);
 assert.equal(crocswapCertification(history,5643,'155229/50000000'),undefined);
 // #5413 and its frontier file: the selected-result revision (2026-10-24) is earlier than frontier5413 (2026-10-26).
 assert.equal(history.frontiers['5413'].committed_at,'2026-10-26T01:38:04Z');
});
test('the stored ledger gives the rows of the 2026-10-30 ruling their labels',()=>{
 const row=(pr:number,score:string,mergedAt:string)=>crocswapVerification(history,{pr,score,upstreamStatus:'merged',mergedAt})?.via;
 assert.equal(row(5650,'77661117/25000000000','2026-10-26T15:22:44Z'),undefined,'archival intake only');
 assert.equal(row(5643,'155229/50000000','2026-10-26T15:22:44Z'),undefined);
 assert.equal(row(4181,'1/1','2026-10-21T19:10:56Z'),undefined,'merged with scoped review, partially reviewed');
 assert.equal(row(5413,'605457647/200000000000','2026-10-24T02:54:32Z'),'selected-result');
 assert.equal(row(2,'1/1','2026-10-13T21:02:36Z'),'ledger','incorporated');
 assert.equal(row(10,'1/1','2026-10-08T15:18:18Z'),'before-ledger','an early merge, no ledger entry');
 assert.equal(row(259,'1/1','2026-10-16T13:45:39Z'),undefined,'historical archive');
 assert.deepEqual(Object.keys(history.ledger!).sort(),['pr-intake-decisions','pr-ledger']);
});
test('every stored commit is a full sha with a time and every kappa is a reduced fraction',()=>{
 for(const r of [...history.selected_revisions,...Object.values(history.frontiers)]){
  assert.match(r.commit,/^[0-9a-f]{40}$/);assert.ok(Number.isFinite(Date.parse(r.committed_at)));
 }
 for(const r of history.selected_revisions)assert.match(r.kappa,/^\d+(\/\d+)?$/);
});
