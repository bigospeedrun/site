# X API records feed

Added 2026-10-12. The refresh workflow sends accepted Discord record entries to
`https://api.x.com/2/tweets`, using their `x_text` and OAuth 1.0a user context.
New X text contains no board URL. The sender also removes the final URL line
from older accepted entries and rejects remaining HTTP links. It never falls
back to Discord text.

Set these repository Actions secrets for the intended X account with write access:

- `X_API_KEY`
- `X_API_KEY_SECRET`
- `X_ACCESS_TOKEN`
- `X_ACCESS_TOKEN_SECRET`

If any secret is missing, both CLI modes print `X not configured`, succeed, and
write nothing. Never run a configured sender locally to test it; tests use fake
credentials and a mocked fetch.

The first configured plan creates `data/x-posts.json`, a map from event keys to
statuses. It marks every existing accepted entry `skipped`, with reason
`before API start`, and sends nothing. This includes records accepted earlier in
that first workflow run. The file is created at runtime, not shipped as an empty
map, because an empty map would enable backfill.

Later plans reserve at most five unseen keys as `unknown`. The workflow commits
and pushes these reservations before its send step can run. The sender consumes
its temporary batch before making requests and waits at least two seconds
between requests. Successful confirmations save `status: posted`, `id`, and `at`.
All status changes are saved atomically; the final workflow step commits results.
Existing keys in any terminal status are never selected again.

Timeouts, transport errors, unreadable confirmations, and runner interruptions
leave an `unknown` entry. A crash can therefore omit an unsent entry, but it cannot
cause the next run to repeat an uncertain POST. Inspect unknown entries and the
X account manually; do not delete a key merely to retry it. If a status push fails,
the earlier remote reservation still prevents a repeat.

Confirmed HTTP 402, 429 and 5xx responses remove the reservation, leaving the entry
pending for a later run. HTTP 403 responses that mention credits, billing, payment,
insufficient funds/balance, or spending limits also remain pending. Billing
responses produce a clear job-log line without exposing the response body. Other non-success responses save `failed` with the HTTP
status in `code`. Error bodies, credentials, and authorization headers are never
logged. No POST is retried within a run.

The existing workflow concurrency group serializes senders. The old webhook and
browser poster are unchanged; the lead must retire them when this API path goes
live. The API log is separate from the browser poster's state.

A post that was deleted keeps `status: posted` and gets `deleted_at` and `deleted_reason`, in this log and on
the same key in `data/records-posts.json`. The records planner ignores a post with `deleted_at`. The `x-delete`
workflow holds the X secrets, so it has read access only and writes no mark. The agent that ran the delete does
this step, in a normal reviewed site commit (one commit per delete):

1. Run the `x-delete` workflow with the tweet id (an id that this log shows as `posted`).
2. In a worktree of site `main`, run `node --experimental-strip-types scripts/mark-deleted.ts <tweet id> "<one line reason>"`.
   It writes both marks and uses the time of the run. A Discord post that was deleted by hand needs no other step.
3. To post the same record again, take its key out of `reserved` and add it to `deferred` in
   `data/discord-records.json` (see `scripts/discord-records.md`), in the same commit.
4. Send the commit to the reviewer. The lead pushes it.

Signing reference and public test fixture:
https://docs.x.com/fundamentals/authentication/oauth-1-0a/creating-a-signature
JSON body fields are excluded from OAuth signature parameters.

As of 2026-10-16, accepted Discord entries of both tables reach X, so Other bounds leaders
post too, with the Discord planner's limit of one post per race every three hours.
