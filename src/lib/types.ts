export type ScoreRelation = 'attained' | 'strict-upper-bound';
import type {EvidenceLevel} from './evidence';
export interface Link { name: string; url: string }
// An author links to its profile (GitHub, else ORCID) or has no link (data/author_links.py; Lead, 2026-11-08, site#17).
export interface Author { name: string; url?: string; login?: string; twitterUsername?: string; avatar?: string }
export interface RecordEntry {
 id: string; isBreakthrough?: boolean; reproductionOf?: string; score: string; scoreRelation?: ScoreRelation; evidenceLevel: EvidenceLevel; title: string; date: string; dateLabel: string; publicationYear?: number; repo: string; repoId: number;
 authors: Author[]; evidenceUrl?: string; bound: string; shortBound?: string; scoreScale?: 'theta'; lConstant?: string; evidence: Link[]; predecessors: string[];
 dependencies: { id?: string; statement: string; source_url: string; status: string }[];
 status: string; comparisonNote: string; creditNote?: string; refiledBy?: string; methodNote?: string; upstreamStatus: string; upstreamSelected?: boolean; comparison: string; eligible: boolean; raceEventAt?: string; humanVerifiedAt?: string; certifiedBy?: string; humanVerifiedBasis?: string; rerunStatus?: {state:string;checked_at?:string;receipt_path?:string|null};
 provenance?: { model?: string; harness?: string; container_digest?: string; logs?: string[] };
 prove2me?: boolean; prove2meUrl?: string;
 // A row of a model that this model carries (registry `carries`): a deterministic result also counts on the randomized board.
 carried?: boolean;
 // A Claimed direct submission whose verifier check has not passed (record_metadata.verification).
 verification?: { state: 'pending' | 'failed' | 'held'; since: string };
}
export interface Repo { name: string; owner: string; url: string; ownerUrl: string; submission?: string; rules?: string; agents?: string; open: boolean; mode: string }
export interface Problem {
 slug: string; title: string; model: string; modelId: string; scope: string;
 // The first model of a slug is its default: its page is /<slug>. A later model has its own page, /<slug>/<modelId>, and its slug is still the race.
 // Absent means the default model (isPrimaryModel in navigation.ts).
 primary?: boolean; direction: 'higher-is-better' | 'lower-is-better'; symbol: string;
 repos: Repo[]; records: RecordEntry[]; lastDataCheck: string; lastProofCheck: string | null; pending: string; sourceFetch: string; notes: string[];
 // The chart lines of a density-time board (directed-sssp chart.lines): a function of one row, up to its cap density.
 chartLines?: ChartLine[];
}
export interface ChartLine { function: string; up_to: string; row: string }
