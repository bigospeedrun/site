#!/usr/bin/env bash
# Push the refresh workflow's bot commit(s) to the target branch, and survive a push that
# lands on main during the run (run 38822677313, 2026-10-15: rejected non-fast-forward).
# On a rejected push: fetch the branch, rebase the local commits onto it, and try again,
# at most 3 pushes with a short backoff. The bot commits change only data and log files,
# so the rebase does not conflict with code commits; if it conflicts anyway, the rebase is
# aborted and the step fails, with nothing pushed.
# Usage: scripts/push-bot-commit.sh <branch>     (BOT_PUSH_BACKOFF: seconds, default 3)
set -euo pipefail

branch=${1:?usage: push-bot-commit.sh <branch>}
backoff=${BOT_PUSH_BACKOFF:-3}

for attempt in 1 2 3; do
  if git push --quiet origin "HEAD:refs/heads/$branch"; then
    echo "Pushed to $branch (attempt $attempt)."
    exit 0
  fi
  [ "$attempt" -eq 3 ] && break
  echo "Push $attempt was rejected; rebasing onto the newest $branch."
  git fetch --quiet origin "+refs/heads/$branch:refs/remotes/origin/$branch"
  # --autostash: files the build changed but this step does not commit stay as they are.
  if ! git rebase --quiet --autostash "refs/remotes/origin/$branch"; then
    git rebase --abort >/dev/null 2>&1 || true
    echo "The bot commit conflicts with the newest $branch; nothing was pushed." >&2
    exit 1
  fi
  sleep $((backoff * attempt))
done
echo "The push to $branch failed 3 times; nothing more was pushed." >&2
exit 1
