export const breakthroughLabel = 'Agent breakthrough';
export const breakthroughDefinition = 'The first result by AI agents that broke the classic bound. It starts the race.';
export const evidenceLevels = [
 {id:'claimed', name:'Claimed', definition:'The result is published, but no review repository accepted it and we have not checked a Lean proof.'},
 {id:'human-verified', name:'Human Verified', definition:'The result meets the repository review rule stated on the problem page.'},
 {id:'lean-verified', name:'Lean Verified', definition:'We rebuild its Lean proof from source and check, with the Lean kernel, that it proves our exact problem statement. A result also counts when prove2.me, which checks each proof with Lean on its server, proved it and we reviewed that its Lean statement is our problem statement.'},
] as const;
export type EvidenceLevel = typeof evidenceLevels[number]['id'];
export const evidenceName = (level:EvidenceLevel):string => evidenceLevels.find(item=>item.id===level)!.name;
export function classifyEvidence(input:{slug:string;repo:string;upstreamStatus?:string;upstreamSelected?:boolean;proofPassed:boolean}):EvidenceLevel {
 if(input.proofPassed)return 'lean-verified';
 if(input.slug==='integer-multiplication'&&input.repo==='CrocSwap/integer-mult-bounds'&&(input.upstreamStatus==='merged'||input.upstreamSelected===true))return 'human-verified';
 return 'claimed';
}
export const integerMultiplicationClaimedRule = 'Published bounds outside CrocSwap/integer-mult-bounds, and open pull requests to it that are not yet merged.';
export const reviewSubmissionPolicy = 'Open submissions appear as Claimed and move to Human Verified when accepted. Submissions closed without acceptance and reproductions stay off the board.';
// Repository admission is separate from evidence strength: open submissions and independent claims remain eligible.
export function isBoardEntry(slug:string,record:{id?:string;repo:string;upstreamStatus:string;reproductionOf?:string}):boolean {
 if(record.reproductionOf||record.id==="classical-baseline")return false;
 return !(slug==='integer-multiplication'&&record.repo==='CrocSwap/integer-mult-bounds'&&record.upstreamStatus==='closed-unmerged');
}

export function isBreakthroughRecord(slug:string,id:string):boolean {
 const originals:Record<string,string>={'matrix-multiplication':'openai-matrix-nine-fourths-2026','integer-multiplication':'openai-original-109','exact-dft':'exact-dft-2026','3sum':'anthropic-2026','apsp':'anthropic-2026','subset-sum':'subset-sum-2026'};
 return originals[slug]===id;
}
export function isVisibleAtEvidence(record:{isBreakthrough?:boolean;evidenceLevel:string},levels:readonly string[]):boolean {
 return record.isBreakthrough===true||levels.includes(record.evidenceLevel);
}
