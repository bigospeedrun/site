// A plain-words view of a proof check receipt (public/sources/*.json). The receipts come in a few shapes:
// verifier runs on an issue or a pull request (a short receipt that points at a source receipt with the
// full envelope), maintainer reruns of results from the OpenAI release (a binding plus the run), and
// older hand-written receipts. Every field is optional; the page shows only what the receipt says.

export interface ReceiptView {
  passed: boolean;
  checkedAt?: string;
  // The verifier's own one-line result, when the receipt has one.
  summary?: string;
  // What the receipt says it covers (older receipts).
  scope?: string;
  statement: {file?: string; sha256?: string; commit?: string};
  source: {repo?: string; commit?: string; subdir?: string};
  theorems: string[];
  toolchain?: string;
  // 'passed', 'failed' or undefined when the receipt does not say.
  leanKernel?: 'passed' | 'failed';
  nanoda?: 'passed' | 'failed';
  axioms: {status?: 'passed' | 'failed'; reported: string[]; allowed: string[]};
  links: {run?: string; issue?: string; pullRequest?: string; verifierCommit?: string};
  files: {label: string; path: string}[];
}

type Json = any;
const pick = (...values: unknown[]) => values.find(v => v !== undefined && v !== null && v !== '');
const text = (value: unknown): string | undefined => typeof value === 'string' && value ? value : undefined;
const list = (value: unknown): string[] => Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
const status = (value: unknown): 'passed' | 'failed' | undefined => {
  if (typeof value !== 'string') return undefined;
  if (/^(passed|accepted|ok|success)$/i.test(value)) return 'passed';
  if (/^(failed|rejected|error)$/i.test(value)) return 'failed';
  return undefined;
};

/** The page slug of a receipt path such as sources/direct-issue-18-39196965603-1.json. */
export const receiptSlug = (path: string): string => path.replace(/^\/+/, '').split('/').pop()!.replace(/\.json$/, '');
/** The site page of a receipt. */
export const receiptPageUrl = (path: string): string => '/receipts/' + receiptSlug(path);

export function receiptView(receipt: Json, source: Json | undefined, path: string): ReceiptView {
  const envelope: Json = source?.envelope, binding: Json = source?.binding;
  const verifying: Json = envelope?.receipt;
  const profile: Json = verifying?.profile ?? binding?.profile;
  const request: Json = verifying?.request?.direct_submission ?? envelope?.submission ?? envelope?.request?.submission;
  const description = text(pick(receipt.description, receipt.summary));
  const lean = status(pick(verifying?.kernels?.lean?.status, receipt.lean_kernel)) ?? (description && /\bLean\b.*\bpassed\b/i.test(description) ? 'passed' : undefined);
  const nanoda = status(pick(verifying?.kernels?.nanoda?.status, receipt.nanoda, receipt.second_kernel?.state)) ?? (description && /\bnanoda\b/i.test(description) && /\bpassed\b/i.test(description) ? 'passed' : undefined);
  const reportedByTheorem: Json = pick(verifying?.axiom_audit?.reported_axioms, receipt.axiom_audit) ?? {};
  const reported = [...new Set(Object.values(reportedByTheorem).flatMap(list))];
  const axiomStatus = status(pick(verifying?.axiom_audit?.status)) ?? (description && /axiom audit passed/i.test(description) ? 'passed' : undefined);
  const recorded = status(pick(receipt.status, receipt.state));
  const url = (value: unknown) => { const v = text(value); return v?.startsWith('https://') ? v : undefined; };
  const files: ReceiptView['files'] = [{label: 'This receipt (JSON)', path}];
  for (const [label, key] of [['Source receipt (JSON)', 'source_receipt_path'], ['Receipt archive with the logs', 'artifact_path'], ['Check log', 'log_path']] as const) {
    const file = text(receipt[key]);
    if (file && !/^\[/.test(file)) files.push({label, path: file});
  }
  return {
    passed: recorded === 'passed',
    checkedAt: text(pick(receipt.checked_at, envelope?.checked_at)),
    summary: description,
    scope: text(receipt.scope),
    statement: {
      file: text(pick(envelope?.challenge?.file, profile?.challenge_file, verifying?.request?.challenge_file)),
      sha256: text(pick(envelope?.challenge?.sha256, profile?.challenge_sha256, receipt.statement_sha256, receipt.spec_sha256)),
      commit: text(pick(envelope?.challenge?.upstream_commit, profile?.upstream_commit, receipt.upstream_commit)),
    },
    source: {
      repo: text(pick(request?.repo_url, binding?.repo_url, verifying?.request?.repo_url)),
      commit: text(pick(request?.commit, binding?.commit, receipt.source_commit)),
      subdir: text(pick(request?.source_subdir, profile?.source_subdir)),
    },
    theorems: list(pick(verifying?.theorem_names, envelope?.theorem_names, profile?.theorem_names, receipt.targets)),
    toolchain: text(pick(profile?.lean_toolchain, verifying?.request?.lean_toolchain)),
    leanKernel: lean,
    nanoda,
    axioms: {status: axiomStatus, reported, allowed: list(profile?.permitted_axioms)},
    links: {
      run: url(pick(receipt.receipt_url, receipt.run_url, envelope?.run_url, binding && source?.run?.html_url)),
      issue: url(envelope?.issue_url),
      pullRequest: url(pick(envelope?.request?.pr_url)),
      verifierCommit: text(pick(verifying?.verifier_commit, envelope?.verifier_commit, receipt.verifier_commit)),
    },
    files,
  };
}
