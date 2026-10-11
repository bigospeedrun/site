# Public leaderboard data

Run `python3 data/refresh.py` to read CrocSwap and Swapnil Jain sources through
GitHub REST GET requests, stage the changes, and validate before replacing files.
Set `GITHUB_TOKEN` for authenticated API limits. No upstream code is executed.
Other research claims and evidence require a separate reviewed import.

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
error keeps the prior bundle. The workflow already treats this step as optional,
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
receipt and the hashed staged-source manifest. The matrix binding has no run ID
yet and remains inactive until the exact run is reviewed and assigned. DFT keeps
its original b27295a controller binding.
