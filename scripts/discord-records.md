# Discord records feed

Added on 2026-10-11. The hourly refresh builds `/records-feed.json` with the site's
`boardRecords`, `ranked`, evidence labels, author profiles and six-problem menu.
The notification planner compares it with `data/discord-records.json`.

A new board leader emits one message. A record that gains Lean Verified emits one
message, including when it is not the leader. A simultaneous new leader and Lean
upgrade emits one message. Human Verified upgrades alone do not emit a message.
Scores use exact fractions in plain text. Strict endpoints and matrix exponents
include “for every fixed epsilon > 0”. Each message links to its board.

The initial committed baseline suppresses a launch flood. Event keys include the
problem, record ID, exact score, endpoint relation, and record/Lean event class.
They survive tier downgrades, leader reversions and repeated workflow runs.

The planner reserves event keys before the normal data commit. The sender runs
only after that commit has pushed successfully. Both notification steps use
`continue-on-error`; neither a missing secret nor a Discord failure blocks data.
The sender uses the Actions secret `DISCORD_RECORDS_WEBHOOK`. It disables mentions,
rejects redirects, requests message confirmation, and never logs secrets or HTTP
response bodies. No bot credential is needed by the workflow.

Delivery is at most once, not guaranteed exactly once. Reserved events are not
retried after a failed or ambiguous send, or a runner crash after the data push.
This avoids duplicates when Discord accepted a message but the response was lost.
The step reports sent/failed counts. The repository stores reservations, not false
claims of successful delivery. Do not delete reservation keys to replay old posts.

Local dry run after `npm run build`:

```sh
node --experimental-strip-types scripts/discord-records.ts dry-run /tmp/discord-records-preview.json
```

This reads the baseline and generated feed and prints planned messages. It does not
read a secret, write state or contact Discord. `npm test` tests ranking, exact bounds,
upgrades, deduplication and transport failures with a fake HTTP sender.
