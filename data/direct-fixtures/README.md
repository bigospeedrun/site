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

This module returns review candidates only. Authorship and publication dates
still need review. The final trusted verifier revision and live GitHub run metadata
(including referenced reusable workflows and both artifact digests) must be
checked before connecting this module to an importer. No live trust is enabled.

Final producer contract checked against verifier commit `01c71e9` on 2026-10-10.
The form and envelope fixtures are byte copies from that commit.
