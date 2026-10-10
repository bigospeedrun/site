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
