# Discord records feed

Added on 2026-10-11. The hourly refresh builds `/records-feed.json` with the site's
`boardRecords`, `ranked`, evidence labels, author profiles and six-problem menu.
The notification planner compares it with `data/discord-records.json`.

A new board leader emits one message. A record that gains Lean Verified emits one
message, including when it is not the leader. A simultaneous new leader and Lean
upgrade emits one message. Human Verified upgrades alone do not emit a message.
Messages use the same decimal precision as the site tables, with scientific savings
expanded to plain decimal text. Event keys retain exact fractions. Strict endpoints and matrix exponents
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

As of 2026-10-13, new-record announcements have a three-hour window per board
and exact ordered author list. The clock starts at the latest accepted Discord
post, not at planning time. Accepted posts now store their author list; older
entries use their X player line or snapshot record. Lean verification announcements
are exempt from the window.

A throttled event is saved in the feed state's deferred list without reserving its
key. Later plans recheck the current leader even if it has not changed. When an
eligible leader posts, earlier deferred events for that board and author list are
reserved as superseded, including entries removed from the snapshot. Deferred
nonleaders do not post. X follows the accepted Discord log and inherits this limit.

As of 2026-10-16, the feed has both landing-page tables. The six Big O boards post to
#records-big-o (the old #records, renamed; webhook secret `DISCORD_RECORDS_WEBHOOK`). The
Other bounds rows of `src/lib/other-bounds.json` post to #records-other-bounds (webhook
secret `DISCORD_RECORDS_OTHER_WEBHOOK`). Both channels are read-only for members. The
per-race channels get no automatic posts. An Other bounds board has the slug
`other-<slug>`, the leader of the row (the newest claim by its best author) and a plain-text
bound made from the site's KaTeX source. A claim's id is its author handle and exact value.
An Other bounds board that is new to the saved state is seeded: its current leader is
reserved and nothing posts, so only leaders after that run post. Other bounds boards post
at most once per race every three hours, whoever leads; a later leader is deferred and posts
when the window ends if it still leads. Big O boards keep the per-author window above.
Without `DISCORD_RECORDS_OTHER_WEBHOOK`, a plan keeps the previous state of the Other
bounds boards and reserves nothing for them.

As of 2026-10-20, an Other bounds row with a `reviewRepository` (today the quasi-Riemann
row, GTimG/QuasiRiemannTracker) shows a claim as Human Verified once its pull request is
merged (`review.status` is `merged`, read hourly from GitHub by `data/other_reviews.py`). That change never posts: the event key of a Human
Verified record is the same `:record` key as a Claimed one, so a claim that was already
announced or reserved stays reserved, and a merge of the current leader posts nothing new.
A result first seen as already merged and leading posts as a new record with its level.
Check a deploy with `node --experimental-strip-types scripts/discord-records.ts dry-run
<batch>` after `npm run build`: it must plan 0 messages.
