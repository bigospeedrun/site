# First install on the VPS: what auto-deploy.sh needs

auto-deploy.sh never does a first install. Until all of these exist, every tick writes
`result: refused` to `/opt/bigospeedrun/auto-deploy/status.json` and changes nothing.
The full step-by-step order is in Worker 2's plan, `~/nil/bigospeedrun-notes/phase-c-staging-plan.md`.

| Path | Mode | Content |
|---|---|---|
| `/etc/bigospeedrun/` | 0700 root | The env directory. |
| `/etc/bigospeedrun/auto-deploy.env` | 0600 root | `BOS_IMAGE`, `BOS_GITHUB_REPO`, `BOS_IMAGE_WORKFLOW`, and optionally `BOS_TAG` (`auto-deploy.env.example`). |
| `/etc/bigospeedrun/site.env` | 0600 root | The chat secrets. Empty on staging: the chat then answers 503. |
| `/opt/bigospeedrun/compose.yaml` | 0644 | A copy of `ops/self-host/compose.yaml`. |
| `/opt/bigospeedrun/release.env` | 0600 | `BOS_UID=<uid of bos-site>`, `BOS_GID=<gid of bos-site>`, `BOS_SITE_IMAGE=ghcr.io/bigospeedrun/site@sha256:<64 hex>`. The image must be a digest, not a tag. |
| `/opt/bigospeedrun/release.commit` | 0600 | The full 40-character commit of that image, on one line. |
| `/opt/bigospeedrun/ops/` | 0755 | `auto-deploy.sh` and the two `bigospeedrun-autodeploy.*` units (the script keeps the installed units equal to these copies). |
| `/etc/tmpfiles.d/bigospeedrun.conf` | 0644 | `bigospeedrun.tmpfiles.conf`, then `systemd-tmpfiles --create`. |

`release.commit` holds the image's `org.opencontainers.image.revision` label. auto-deploy.sh
reads it for `deployed` in status.json. Without it, or with a short commit, every tick ends
`refused` in phase `current`. After the first pull, write it from the image:

```sh
digest=$(sed -n 's/^BOS_SITE_IMAGE=.*@//p' /opt/bigospeedrun/release.env)
docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' \
  "ghcr.io/bigospeedrun/site@$digest" > /opt/bigospeedrun/release.commit
grep -Eqx '[0-9a-f]{40}' /opt/bigospeedrun/release.commit && echo ok
```

After each deploy, auto-deploy.sh writes `release.env` and `release.commit` itself. It keeps
the `BOS_UID` and `BOS_GID` lines.

## Rehearsal (main never moves)

1. Run the "Push a site rehearsal image" workflow (`site-image-rehearsal.yml`) with
   `rehearsal-good`, then with `rehearsal-bad`.
2. Set `BOS_TAG=rehearsal-bad` in `auto-deploy.env`. The next tick deploys it, the health
   check fails, and the tick rolls back to the running image: `result: rolled_back`. The bad
   digest goes on `/opt/bigospeedrun/auto-deploy/failed`.
3. Set `BOS_TAG=rehearsal-good` (or remove the line to follow `main` again). Delete the
   rehearsal digest from the `failed` file only if you want to run the rehearsal again.
