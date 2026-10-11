Offline test fixtures only. These files do not authorize a verifier revision or a registry import.
Trusted statement snapshots and profiles come from the local verifier contract inspected on 2026-10-10.
Historical receipt replay is tested as non-importable. Tests construct synthetic GitHub metadata.
No Lean or submitted code is executed. Statement copyright and license notices are retained in each source.

The reference gate is `current_record_gate` in `data/direct_import.py`.
Resolve bigospeedrun/site main to one commit, then read the problem JSON at that
commit. Its output schema is version 1: problem_id, site_commit, data_sha256,
checked_at, direction, score, score_relation, leader_ids, and
any_lean_verified_at_bound. The direction is redundant with the problem model.
The selector includes all board evidence levels, excludes classical-baseline and
reproductions, and can exclude the candidate issue URL. A tied attained bound
qualifies only when the matching leaders are not already Lean Verified.

The hourly direct_refresh.py now discovers open issues and PRs and admits
receipt-backed rows through direct_import.py and direct_pr.py. Source credit is
the authenticated submitter login; the site author snapshot supplies profile
names. Submission creation time is labeled as such, not paper priority.

The reviewed controller policy is in data/direct-trust.json. It pins every tracked
non-submissions blob at verifier 49c04a7818afddbd32f21b74fe7206a411bde6c7.
New source-only merges can produce trusted runs; other repository changes need review
and a policy update. Both workflow IDs, run attempts and artifact digests are
checked against API metadata. The fixed-bound dft233 profile can admit a trusted
legacy receipt for its one exact saving; the public form cannot select profiles.

Run `python3 data/direct_refresh.py --check-only` for a data-only dry run, or omit
that flag to apply a staged, schema-validated transaction. GITHUB_TOKEN supplies
GitHub read access. Failed refreshes leave the previous bundle intact, and the
workflow's separate continue-on-error step allows other imports to finish.
Receipt archives and API provenance are kept under data/sources for artifact
expiry. Closed issues and closed-unmerged PRs disappear; merged verified PRs stay.

Final producer contract checked against verifier commit `01c71e9` on 2026-10-10.
The form and envelope fixtures are byte copies from that commit.

On 2026-10-11, test-source exclusion was added before receipt admission.
`is_test_submission` is the shared filter for both GitHub issue and PR metadata:
a `test` label or a propagated `test_only: true` excludes every evidence tier,
including Claimed. Both receipt routes and open-claim discovery apply this filter using current
GitHub labels. Smoke issue #1 and PR #2 are also permanently excluded by number.

PR envelope/receipt fixtures were read at verifier 49c04a7. They remain synthetic
and non-importable. Production proof outcomes are never inferred from fixtures.

Early publication contract reviewed at verifier 038a82c on 2026-10-11.
The prior 49c04a7 policy is retained for its in-flight final-only smoke.
Early evidence binds a completed trusted publisher, the source run and attempt,
the immutable -lean proof artifact, and verification_stage=lean in both envelope
and receipt. Only exact-target Lean acceptance with the permitted-axiom audit and
nanoda pending/advisory_queued can use this path. Source verification may still run.
Final outcomes are retained per submission fingerprint in direct-submissions.json.
A final nanoda rejection removes Lean Verified status. An eligible open or merged
submission remains Claimed, with the rejection stated in its proof status. The
rejected source cannot regain Verified status after artifact expiry or a late
early-publisher result. A final ambiguous result removes early Verified
status. A changed source is a new submission fingerprint. Smoke identities and all
test flags remain excluded. The publisher owns the maintainer rejection alert.

Live issue smoke replay checked on 2026-10-11:
https://github.com/bigospeedrun/verifier/actions/runs/38089724305
The two live-issue-smoke ZIPs are unchanged public GitHub artifacts 11686036945
(result) and 11686437001 (proof). live-issue-smoke-api.json retains the API fields
used by validation. Both archive digests, the exact raw receipt hash, and every
receipt-listed evidence hash are tested offline. Both kernels and the permitted
axiom audit passed. The original envelope stays fixture_only/test_only and is
rejected, even without its test label. Its raw receipt equals the envelope receipt.

The counterfactual test changes only test flags, envelope admission status, and
resulting receipt/archive hashes. It preserves all proof outcomes, theorem targets,
source pins, log hashes and timestamps. This copy passes receipt validation but is
not a new proof run or a board import. Discovery still permanently excludes issue
1 and PR 2. The generic PR early receipt is covered below; its final nanoda outcome remains pending.


Live PR early receipt replay checked on 2026-10-11:
https://github.com/bigospeedrun/verifier/actions/runs/38099440876
Publisher: https://github.com/bigospeedrun/verifier/actions/runs/38099445948
The live-pr-smoke ZIPs are unchanged public artifacts 11688532955 (proof) and
11688234279 (publisher result). Both archive digests, raw receipt hash and every
listed evidence-file hash match. The API confirmed PR 2 merged as
79878b79d2eec01cbdc40417547cd2d99d6aba04. The source folder, manifest and changed-file
list were independently inspected through the GitHub API at the verified head and
base pins; live-pr-smoke-api.json saves that inspected layout and API identities.
Controller content matched the reviewed 038a82c policy for both workflows.

The original test-only envelope is excluded with or without its test label. The
counterfactual test clears only test flags, changes importable to true, and updates
the derived request/receipt/archive hashes. All actual proof results, theorem
names, exact bound, source pins and proof log hashes remain unchanged. That copy
admits as Lean Verified with nanoda advisory pending and requires API-confirmed
merge. It is not a new proof run, and PR 2 remains permanently excluded from
production discovery. The final nanoda result is not asserted by this fixture.
