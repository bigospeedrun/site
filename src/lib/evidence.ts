export const breakthroughLabel = 'Agent breakthrough';
export const breakthroughDefinition = 'The first result by AI agents that broke the classic bound. It starts the race.';
export const evidenceLevels = [
 {id:'claimed', name:'Claimed', definition:'The result is published, but no review repository accepted it and we have not checked a Lean proof.'},
 {id:'human-verified', name:'Human Verified', definition:'The result meets the repository review rule stated on the problem page.'},
 {id:'lean-verified', name:'Lean Verified', definition:'We rebuild its Lean proof from source and check, with the Lean kernel, that it proves our exact problem statement. A result also counts when prove2.me, which checks each proof with Lean on its server, proved it and we reviewed that its Lean statement is our problem statement.'},
] as const;
export type EvidenceLevel = typeof evidenceLevels[number]['id'];
// The line under a row's authors on a refile or port of the authors' proof (Nil, 2026-11-09: the refiler or porter is
// never an author). Nil, 2026-11-15 ("what does ported mean?"): the terms are defined once, on the About page
// (#credit-lines), and each place that shows the line links there.
export const creditLines = [
 {id:'ported', prefix:'Ported by ', name:'Ported by', definition:"The porter took the authors' published Lean proof and made only the changes that the checker (our verifier or prove2.me) needs to check it, such as a small bridge file to our exact problem statement or a move to the checker's Lean version. The proof stays the authors' work. The porter is not an author."},
 {id:'refiled', prefix:'Refiled by ', name:'Refiled by', definition:"Someone other than the authors submitted the authors' proof. The refiler is not an author."},
] as const;
export const creditLine = (line:string) => creditLines.find(item => line.startsWith(item.prefix));
export const creditLineUrl = (line:string):string => '/about#' + (creditLine(line)?.id ?? 'credit-lines');
// Nil, 2026-11-04: of two rows with an equal bound, the row with the higher evidence level ranks first (Lean Verified,
// then Human Verified, then Claimed); inside one level the earlier row ranks first. Larger is higher; an unknown level is Claimed.
export const evidenceOrder = (level?:string):number => level==='lean-verified'?2:level==='human-verified'?1:0;
export const evidenceName = (level:EvidenceLevel):string => evidenceLevels.find(item=>item.id===level)!.name;
// A CrocSwap pull request row is Human Verified by CrocSwap's own record, not by a merge alone (certified: see crocswapVerification
// in src/lib/crocswap-cert.ts; Lead ruling b3, 2026-10-30). The selected main-branch result stays Human Verified.
export function classifyEvidence(input:{slug:string;repo:string;upstreamSelected?:boolean;certified?:boolean;proofPassed:boolean}):EvidenceLevel {
 if(input.proofPassed)return 'lean-verified';
 if(input.slug==='integer-multiplication'&&input.repo==='CrocSwap/integer-mult-bounds'&&(input.certified===true||input.upstreamSelected===true))return 'human-verified';
 return 'claimed';
}
// An Other bounds row may name one review repository (reviewRepository in src/lib/other-bounds.json).
// A claim whose pull request that repository merged (review.status 'merged') is Human Verified; an open or
// closed pull request, and a claim with no review, stay as the data says (Claimed, or Lean Verified).
export interface OtherReviewRepository {name:string; url:string}
export interface OtherClaimReview {pr:number; status:string} // status: 'open', 'merged' or 'closed'
export function classifyOtherEvidence(reviewRepository:OtherReviewRepository|undefined,claim:{evidence:string;review?:OtherClaimReview}):EvidenceLevel {
 if(claim.evidence==='lean-verified')return 'lean-verified';
 return reviewRepository&&claim.review?.status==='merged'?'human-verified':'claimed';
}
export const otherReviewPrUrl=(reviewRepository:OtherReviewRepository,review:OtherClaimReview):string=>`${reviewRepository.url}/pull/${review.pr}`;
export const integerMultiplicationClaimedRule = 'Published bounds outside CrocSwap/integer-mult-bounds, and pull requests to it, merged or open, that its main branch does not certify.';
// Repository admission is separate from evidence strength: open submissions and independent claims remain eligible.
export function isBoardEntry(slug:string,record:{id?:string;repo:string;upstreamStatus:string;reproductionOf?:string}):boolean {
 if(record.reproductionOf||record.id==="classical-baseline")return false;
 return !(slug==='integer-multiplication'&&record.repo==='CrocSwap/integer-mult-bounds'&&record.upstreamStatus==='closed-unmerged');
}

export function isBreakthroughRecord(slug:string,id:string):boolean {
 const originals:Record<string,string>={'matrix-multiplication':'openai-matrix-nine-fourths-2026','integer-multiplication':'openai-original-109','exact-dft':'exact-dft-2026','3sum':'anthropic-2026','apsp':'anthropic-2026','subset-sum':'subset-sum-2026','3sat':'openai-eth-2026','integer-factoring':'rudich-rousseau-2026','directed-sssp':'directed-sssp-2026'};
 return originals[slug]===id;
}
export function isVisibleAtEvidence(record:{isBreakthrough?:boolean;evidenceLevel:string},levels:readonly string[]):boolean {
 return record.isBreakthrough===true||levels.includes(record.evidenceLevel);
}
