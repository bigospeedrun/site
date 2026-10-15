import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer, type Server} from 'node:http';
import {spawnSync, spawn} from 'node:child_process';
import type {AddressInfo} from 'node:net';

// ops/self-host/auto-deploy.sh against a fake docker, a fake health probe and a stub
// registry plus GitHub API. Nothing here touches a real registry, GitHub or Docker.
const script = new URL('../../ops/self-host/auto-deploy.sh', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'bos-deploy-'));
const root = join(dir, 'root'), envDir = join(dir, 'etc'), fake = join(dir, 'fake'), units = join(dir, 'units');
for (const path of [root, fake, units, join(fake, 'labels')]) mkdirSync(path, {recursive: true});
mkdirSync(envDir, {mode: 0o700});
writeFileSync(join(envDir, 'auto-deploy.env'), 'BOS_IMAGE=ghcr.io/bigospeedrun/site\nBOS_GITHUB_REPO=bigospeedrun/site\nBOS_IMAGE_WORKFLOW=site-image.yml\n', {mode: 0o600});
const digest = (n: number) => 'sha256:' + String(n).repeat(64).slice(0, 64);
const commit = (n: number) => String(n).repeat(40).slice(0, 40);
for (const n of [1, 2, 3, 4]) writeFileSync(join(fake, 'labels', digest(n)), commit(n));
writeFileSync(join(root, 'compose.yaml'), 'services: {}\n');
writeFileSync(join(root, 'release.env'), `BOS_UID=990\nBOS_GID=990\nBOS_SITE_IMAGE=ghcr.io/bigospeedrun/site@${digest(1)}\n`);
writeFileSync(join(root, 'release.commit'), commit(1) + '\n');
writeFileSync(join(fake, 'running'), digest(1));
writeFileSync(join(fake, 'unhealthy'), '');

// docker: pull and inspect read the fake labels; `compose up` starts whatever release.env
// names and fails for an unhealthy digest. The probe prints what runs, if it is healthy.
writeFileSync(join(fake, 'docker'), `#!/usr/bin/env bash
fake=${fake}
case $1 in
pull) grep -qx "\${3##*@}" "$fake/pull-fail" 2>/dev/null && exit 1; exit 0 ;;
image) ref=\${@: -1}; cat "$fake/labels/\${ref##*@}" ;;
compose)
  for ((i=1; i<=$#; i++)); do [[ \${!i} == --env-file ]] && { j=$((i+1)); env_file=\${!j}; }; done
  d=$(sed -n 's/^BOS_SITE_IMAGE=.*@//p' "$env_file"); echo "$d" > "$fake/running"
  grep -qx "$d" "$fake/unhealthy" && exit 1; exit 0 ;;
esac
`, {mode: 0o755});
writeFileSync(join(fake, 'probe'), `#!/usr/bin/env bash
d=$(cat ${fake}/running); grep -qx "$d" ${fake}/unhealthy && exit 1; echo "$d"
`, {mode: 0o755});

// Stub registry and GitHub API. The runs endpoint answers 304 to a matching ETag.
let mainDigest = digest(1), runStatus = 'completed', apiFails = false, served = {ok: 0, notModified: 0};
let server: Server;
before(async () => {
 server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://stub');
  if (url.pathname === '/token') return res.end(JSON.stringify({token: 'stub'}));
  if (url.pathname === '/v2/bigospeedrun/site/manifests/main') { res.writeHead(200, {'Docker-Content-Digest': mainDigest}); return res.end(); }
  if (url.pathname === '/v2/bigospeedrun/site/manifests/rehearsal-bad') { res.writeHead(200, {'Docker-Content-Digest': digest(6)}); return res.end(); }
  if (url.pathname === '/repos/bigospeedrun/site/actions/workflows/site-image.yml/runs') {
   if (apiFails) { res.writeHead(500); return res.end(); }
   const etag = `W/"${runStatus}"`;
   if (req.headers['if-none-match'] === etag) { served.notModified++; res.writeHead(304, {ETag: etag}); return res.end(); }
   served.ok++;
   res.writeHead(200, {ETag: etag, 'Content-Type': 'application/json'});
   return res.end(JSON.stringify({workflow_runs: [{status: runStatus}]}));
  }
  res.writeHead(404); res.end();
 });
 await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
});
after(() => { server.close(); rmSync(dir, {recursive: true, force: true}); });

const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
// spawnSync would block the stub server in this process, so the tick runs asynchronously.
function tick(): Promise<{status: Record<string, unknown>; output: string}> {
 return new Promise(done => {
  const child = spawn('bash', [script], {env: {PATH: process.env.PATH, BOS_ROOT: root, BOS_ENV_DIR: envDir, BOS_UNIT_DIR: units,
   BOS_DOCKER: join(fake, 'docker'), BOS_PROBE: join(fake, 'probe'), BOS_REGISTRY: base(), BOS_GITHUB_API: base()}});
  let output = '';
  child.stdout.on('data', chunk => output += chunk); child.stderr.on('data', chunk => output += chunk);
  child.on('close', () => done({status: JSON.parse(readFileSync(join(root, 'auto-deploy/status.json'), 'utf8')), output}));
 });
}
const failed = () => existsSync(join(root, 'auto-deploy/failed')) ? readFileSync(join(root, 'auto-deploy/failed'), 'utf8').trim().split('\n') : [];

test('status.json has exactly the Hosted Isomux fields, in order; an unchanged tag is up to date', async () => {
 const {status} = await tick();
 assert.deepEqual(Object.keys(status), ['tick_at', 'deployed', 'result', 'phase', 'target', 'stopped', 'held', 'waiting', 'waiting_since', 'tick_error_since', 'units', 'last_attempt']);
 assert.deepEqual(Object.keys(status.last_attempt as object), ['at', 'target', 'result']);
 assert.equal(status.result, 'up_to_date');
 assert.equal(status.deployed, commit(1));
 assert.equal(status.units, 'absent');
 // The second read sends the ETag and gets a 304, which does not count against the API limit.
 await tick();
 assert.deepEqual(served, {ok: 1, notModified: 1});
});

test('a running image workflow is waiting; a new main digest deploys', async () => {
 runStatus = 'in_progress';
 let {status} = await tick();
 assert.equal(status.result, 'waiting');
 assert.equal(status.waiting, true);
 assert.match(String(status.waiting_since), /^\d{4}-\d\d-\d\dT/);
 runStatus = 'completed'; mainDigest = digest(2);
 ({status} = await tick());
 assert.equal(status.result, 'deployed');
 assert.equal(status.deployed, commit(2));
 assert.equal(status.waiting, false);
 assert.deepEqual(status.last_attempt, {at: (status.last_attempt as {at: string}).at, target: commit(2), result: 'deployed'});
 // The image line changes; the dedicated uid and gid stay.
 assert.equal(readFileSync(join(root, 'release.env'), 'utf8'), `BOS_UID=990\nBOS_GID=990\nBOS_SITE_IMAGE=ghcr.io/bigospeedrun/site@${digest(2)}\n`);
});

test('an unhealthy image rolls back by itself and is not tried again', async () => {
 writeFileSync(join(fake, 'unhealthy'), digest(3) + '\n');
 mainDigest = digest(3);
 let {status} = await tick();
 assert.equal(status.result, 'rolled_back');
 assert.equal(status.deployed, commit(2));
 assert.equal(readFileSync(join(fake, 'running'), 'utf8').trim(), digest(2));
 assert.deepEqual(failed(), [digest(3)]);
 ({status} = await tick());
 assert.equal(status.result, 'failed_target');
});

test('a pull that fails three times marks the digest failed', async () => {
 writeFileSync(join(fake, 'pull-fail'), digest(4) + '\n');
 mainDigest = digest(4);
 assert.equal((await tick()).status.result, 'build_failed');
 assert.equal((await tick()).status.result, 'build_failed');
 assert.equal((await tick()).status.result, 'failed');
 assert.deepEqual(failed(), [digest(3), digest(4)]);
});

test('API errors, hold, lock and bad config deploy nothing', async () => {
 apiFails = true;
 let {status} = await tick();
 assert.equal(status.result, 'tick_error');
 assert.match(String(status.tick_error_since), /^\d{4}-/);
 apiFails = false;
 writeFileSync(join(envDir, 'auto-deploy.hold'), '');
 ({status} = await tick());
 assert.equal(status.result, 'held'); assert.equal(status.held, true);
 rmSync(join(envDir, 'auto-deploy.hold'));
 const holder = spawn('flock', [join(root, 'deploy.lock'), 'sleep', '1']);
 const released = new Promise(done => holder.on('close', done));
 await new Promise(done => setTimeout(done, 300));
 ({status} = await tick());
 assert.equal(status.result, 'locked');
 await released;
 chmodSync(join(envDir, 'auto-deploy.env'), 0o644);
 ({status} = await tick());
 assert.equal(status.phase, 'config');
 chmodSync(join(envDir, 'auto-deploy.env'), 0o600);
});

test('a failed rollback stops every later tick until the marker is deleted', async () => {
 writeFileSync(join(fake, 'labels', digest(5)), commit(5));
 mainDigest = digest(5);
 // The new image fails and the previous one no longer runs healthy either.
 writeFileSync(join(fake, 'unhealthy'), [digest(5), digest(2)].join('\n') + '\n');
 let {status} = await tick();
 assert.equal(status.result, 'rollback_failed');
 assert.equal(status.stopped, true);
 ({status} = await tick());
 assert.equal(status.result, 'stopped');
 assert.equal(status.phase, 'marker');
 assert.equal(spawnSync('test', ['-e', join(root, 'auto-deploy/stopped')]).status, 0);
});

test('BOS_TAG follows a rehearsal tag, and an unhealthy rehearsal rolls back', async () => {
 rmSync(join(root, 'auto-deploy/stopped'), {force: true});
 writeFileSync(join(fake, 'unhealthy'), digest(6) + '\n');
 writeFileSync(join(fake, 'labels', digest(6)), commit(5));
 writeFileSync(join(envDir, 'auto-deploy.env'), 'BOS_IMAGE=ghcr.io/bigospeedrun/site\nBOS_GITHUB_REPO=bigospeedrun/site\nBOS_IMAGE_WORKFLOW=site-image.yml\nBOS_TAG=rehearsal-bad\n', {mode: 0o600});
 const running = readFileSync(join(fake, 'running'), 'utf8').trim();
 const {status} = await tick();
 assert.equal(status.result, 'rolled_back');
 assert.equal(readFileSync(join(fake, 'running'), 'utf8').trim(), running);
 assert.ok(failed().includes(digest(6)));
 writeFileSync(join(envDir, 'auto-deploy.env'), 'BOS_IMAGE=ghcr.io/bigospeedrun/site\nBOS_GITHUB_REPO=bigospeedrun/site\nBOS_IMAGE_WORKFLOW=site-image.yml\nBOS_TAG=bad tag\n', {mode: 0o600});
 assert.equal((await tick()).status.phase, 'config');
});
