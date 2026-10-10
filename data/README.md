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
