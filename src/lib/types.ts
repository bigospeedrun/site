export type ScoreRelation = 'attained' | 'strict-upper-bound';
import type {EvidenceLevel} from './evidence';
export interface Link { name: string; url: string }
export interface Author extends Link { login?: string; twitterUsername?: string }
export interface RecordEntry {
 id: string; isBreakthrough?: boolean; reproductionOf?: string; score: string; scoreRelation?: ScoreRelation; evidenceLevel: EvidenceLevel; title: string; date: string; dateLabel: string; publicationYear?: number; repo: string; repoId: number;
 authors: Author[]; evidenceUrl?: string; bound: string; evidence: Link[]; predecessors: string[];
 dependencies: { id?: string; statement: string; source_url: string; status: string }[];
 status: string; comparisonNote: string; upstreamStatus: string; upstreamSelected?: boolean; comparison: string; eligible: boolean; raceEventAt?: string; rerunStatus?: {state:string;checked_at?:string;receipt_path?:string|null};
 provenance?: { model?: string; harness?: string; container_digest?: string; logs?: string[] };
}
export interface Repo { name: string; owner: string; url: string; ownerUrl: string; submission?: string; rules?: string; agents?: string; open: boolean; mode: string }
export interface Problem {
 slug: string; title: string; model: string; modelId: string; scope: string; direction: 'higher-is-better' | 'lower-is-better'; symbol: string;
 repos: Repo[]; records: RecordEntry[]; lastDataCheck: string; lastProofCheck: string | null; pending: string; sourceFetch: string; notes: string[];
}
