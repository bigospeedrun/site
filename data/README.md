# Public leaderboard data

Run `python3 data/refresh.py` to read CrocSwap and Swapnil Jain sources through
GitHub REST GET requests, stage the changes, and validate before replacing files.
Set `GITHUB_TOKEN` for authenticated API limits. No upstream code is executed.
`sources/crocswap-pulls.json` is an index of the fields that refresh reads; each
PR's title and body are in `sources/pr-<n>.json`.
Other research claims and evidence require a separate reviewed import.
A CrocSwap PR gets a row only when it adds one research/<dir>/CLAIM.json with a
`kappa` field, and a Claude Haiku reading of the PR title and body agrees that
the PR claims that kappa as its own result (`claim_judge.py`, cached in
`claim-judgments.json`; needs `ANTHROPIC_API_KEY`, else the PR waits for the lead).
The row shows the exact package kappa. A PR whose title names a kappa
without such a package, or whose Claude reading does not agree, goes to
`claim-review.json` for the lead, who decides in
`review-decisions.json` under `claims` (pr, head, score or null).

Run `python3 data/platypii_lean.py` to update the platypii Lean note on the
integer multiplication OpenAI row (monitor only, the row stays Claimed). At each new
head of platypii/integer-mult-bounds-lean it requires the reviewed Statement.lean
(sha256 pinned in the script), reads the mulInTime saving from Theorem.lean, and
rejects sorry, admit or axiom in any .lean file. A failed check keeps the last good
note and marks `platypii-lean.json` held, which fails `review_hold.py --check`.

Run `python3 data/review_hold.py` after the imports. A new result more than twice
the published best kappa, or more than 1% below the published best exponent,
leaves its board and waits in `review-holds.json` until the lead approves or
rejects it in `review-decisions.json`. `--check` exits 1 while anything waits.

Run `python3 data/prove2me_import.py` to import reviewed prove2.me campaign
results. It reads the public campaign pages and the prove2me/formalpedia export
with anonymous GET requests. `prove2me-trust.json` lists each reviewed entry and
the sha256 of each statement, definition and solution file. When a board differs
from that file, the board keeps its last import, `prove2me.json` records the
reason, and the script exits with code 3. To accept a change, review the entry
and update the trust file. `LEAN_VERIFIED` in the script turns imported rows
from Claimed to Lean Verified.

Run `python3 data/validate.py` to check schemas, exact scores and source hashes.
Run `python3 -m unittest discover -s data -p 'test_*.py'` for offline tests.
Run `python3 data/build_data.py --output /tmp/reviewed-data-export` to export a
validated copy to a new directory. This preserves curated records and does not
recreate an old snapshot. Python requires `jsonschema==4.25.1`.

`public-sanitization.json` identifies evidence copies whose private environment
paths or maintainer labels were removed. Their hashes cover the published bytes.
Source-specific licenses and notices remain beside the evidence.

Stored GitHub commit metadata omits unused `files[].patch` diffs. Commit IDs,
dates and file metadata are retained.

## Licenses

[CC0 1.0](LICENSE) covers the data files we wrote, including the registry,
problem files, schemas and our receipts. The CC0 dedication excludes
`data/sources/`. Third-party material in that directory keeps its original
license; source-specific LICENSE/NOTICE files beside it record those terms.
Copies distributed by the site keep the same terms.

License copies are present for CrocSwap/integer-mult-bounds,
Swapnil-jain/integer-mult-kappa, Swapnil-jain/threesum-derand,
Anthropic's ThreeSumApsp formalization, openai/math,
eumemic/exact-dft-bounds, shea256/five-stage,
jacobalansussman/wht-power-saving-lean and chafreaky/wht-power-saving-lean.
The OpenAI copies cover its manuscript excerpts and Lean sources; the
Swapnil integer-multiplication copies accompany the historical README and
stack-notes excerpts.

As of October 10, 2026, no license copy is stored for
`shea256/fourier-transform-below-nlogn` or `spicylemonade/c-hd-proof`.
This bundle stores repository metadata and our claim summaries for those
sources, rather than their manuscripts or README files. The Shea claim
receipt records that no repository-root license was found at its inspected
commit. The arXiv source is a citation and date record, not a paper copy.
The absence of a license copy does not place third-party material under CC0.

## Maintainer verification receipts

The hourly `direct_refresh.py` step also checks explicitly pinned maintainer
runs in `direct-trust.json`. A binding fixes the existing board row, source
repository and commit, exact score, model, trusted profile and workflow run.
It does not discover or import arbitrary manual runs. No source code is executed.

The importer checks the reviewed controller tree, GitHub workflow/run/attempt
identity, archive digest, raw receipt, exact challenge, both named theorems,
Lean result and permitted-axiom audit. A valid `-lean` checkpoint can raise the
row to Lean Verified while nanoda runs. The final receipt replaces the checkpoint
and its log archive. A real nanoda rejection removes Lean Verified; the existing
claim remains. A resource-limited nanoda check preserves Lean Verified. Cached
receipts are revalidated after artifact expiry; a final rejection cannot fall
back to a late checkpoint. Test receipts are excluded.

The direct and maintainer changes share one staged validation transaction. An
invalid maintainer receipt retains that binding’s prior evidence and does not
block another binding. A transaction validation error keeps the prior bundle. The workflow already treats this step as optional,
so the integer-multiplication importer and its commit can still complete.

Review on 2026-10-11: controller a1d7bae fixes test-only reporting and classifies
located Lean compile errors. It preserves receipt identity and admission rules.
Controller b27295a adds early/final publication to the maintainer workflow and
registers the E8 profile. Its statement matches the prior trusted DFT statement
after changing seven names and the saving to 8762478/10^10. The vendored statement
hash is checked at admission. This review adds these exact controller snapshots;
it does not approve later code changes.

The same review was extended on 2026-10-11 to controller 99713a3. Its matrix
challenge is byte-for-byte OpenAI `fd4aeeb` and enables only
`OAI.MatrixMultiplication.complex_omega_le_nine_quarters`. The bound is omega
at most 9/4 in complex arithmetic circuits, with positive exponent slack.
The profile stages the harfe fixed-point dependency at
`770940ddf9878cf61952ed53d910b92bca841838` as proof source. It ignores dependency
build files and compiled objects, rejects module collisions, and retains the
same kernel and axiom checks. Admission checks the dependency identity in the
receipt and the hashed staged-source manifest. The original matrix run 38109326251 did not pass; its dependency failed to
compile and no complete axiom audit was available. Controller c53eaff was reviewed
on 2026-10-11. It applies the approved compatibility patch before hashing the
staged dependency source. The matrix challenge and allowed axioms are unchanged.
Run 38110310511 also failed to compile. Review of controller 46aad1d on
2026-10-11 found one explicit Finset type annotation added to the patch and
classification of Invalid field compile errors; the trusted statement is unchanged.
The current binding selects full run 38112644463 at controller e064023,
reviewed on 2026-10-11. This replaces the partial compatibility patches with
OpenAI's own patch, checked byte-for-byte at fd4aeeb:
`lean/patches/fixed-point-theorems-lean4341.patch`. Its verifier path is
`patches/openai-fd4aeeb-harfe-lean4341.patch`, SHA256
`d70872e41e80b25191538d1659c4aa3a001349b5bd16f806c9e3833a502516e5`.
Receipt `solution_dependencies` must match all reviewed fields, including the
patch path, hash, upstream repository, commit and path. The original harfe pin,
trusted challenge and allowed axioms are unchanged. The new dependency-only
workflow and its test-only compilation artifact cannot verify a board record.
DFT keeps its b27295a controller binding.
