import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';

// scripts/push-bot-commit.sh with real git: a bare origin, a shallow clone like the Actions
// checkout (depth 1), and a second clone that pushes a code commit during the "run".
const script = new URL('../../scripts/push-bot-commit.sh', import.meta.url).pathname;
const identity = ['-c', 'user.name=test', '-c', 'user.email=test@example.com'];

function setup() {
 const dir = mkdtempSync(join(tmpdir(), 'bot-push-'));
 const origin = join(dir, 'origin.git'), seed = join(dir, 'seed'), bot = join(dir, 'bot'), dev = join(dir, 'dev');
 const git = (cwd: string, ...args: string[]) => execFileSync('git', [...identity, ...args], {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
 execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
 execFileSync('git', ['init', '-q', '-b', 'main', seed]);
 writeFileSync(join(seed, 'data.json'), '{"v":1}\n'); writeFileSync(join(seed, 'code.ts'), 'export const a = 1;\n'); writeFileSync(join(seed, 'built.txt'), 'old\n');
 git(seed, 'add', '.'); git(seed, 'commit', '-q', '-m', 'seed'); git(seed, 'remote', 'add', 'origin', origin); git(seed, 'push', '-q', 'origin', 'main');
 execFileSync('git', ['clone', '-q', '--depth', '1', 'file://' + origin, bot]);
 execFileSync('git', ['clone', '-q', origin, dev]);
 const write = (cwd: string, file: string, body: string) => writeFileSync(join(cwd, file), body);
 const log = () => git(seed, '--git-dir', origin, 'log', '--format=%s', 'main');
 const run = () => spawnSync('bash', [script, 'main'], {cwd: bot, encoding: 'utf8', env: {...process.env, BOT_PUSH_BACKOFF: '0', GIT_AUTHOR_NAME: 'bot', GIT_AUTHOR_EMAIL: 'bot@example.com', GIT_COMMITTER_NAME: 'bot', GIT_COMMITTER_EMAIL: 'bot@example.com'}});
 return {dir, origin, bot, dev, git, write, log, run, cleanup: () => rmSync(dir, {recursive: true, force: true})};
}

test('a code push during the run: the data commit is rebased onto it and pushed', () => {
 const r = setup();
 try {
  r.write(r.bot, 'data.json', '{"v":2}\n'); r.git(r.bot, 'commit', '-q', '-am', 'Refresh reviewed leaderboard data');
  // A tracked file the build changed but the step does not commit stays changed.
  r.write(r.bot, 'built.txt', 'new build\n');
  r.write(r.dev, 'code.ts', 'export const a = 2;\n'); r.git(r.dev, 'commit', '-q', '-am', 'A code change'); r.git(r.dev, 'push', '-q', 'origin', 'main');
  const result = r.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /rejected; rebasing[\s\S]*Pushed to main \(attempt 2\)/);
  assert.equal(r.log(), 'Refresh reviewed leaderboard data\nA code change\nseed');
  assert.equal(readFileSync(join(r.bot, 'built.txt'), 'utf8'), 'new build\n');
  assert.equal(readFileSync(join(r.bot, 'code.ts'), 'utf8'), 'export const a = 2;\n');
 } finally { r.cleanup(); }
});

test('no new commit and origin moved on: the step pushes nothing and succeeds', () => {
 const r = setup();
 try {
  r.write(r.dev, 'code.ts', 'export const a = 3;\n'); r.git(r.dev, 'commit', '-q', '-am', 'Another code change'); r.git(r.dev, 'push', '-q', 'origin', 'main');
  const result = r.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(r.log(), 'Another code change\nseed');
 } finally { r.cleanup(); }
});

test('a bot commit that changes data/direct-trust.json is refused; a trust change on main is not the bot\'s', () => {
 const r = setup();
 try {
  // 2026-10-21: the verifier trusts data/direct-trust.json at site main.
  r.git(r.bot, 'checkout', '-q', '-b', 'tmp'); r.git(r.bot, 'checkout', '-q', 'main');
  execFileSync('mkdir', ['-p', join(r.bot, 'data')]);
  r.write(r.bot, 'data/direct-trust.json', '{"controller_blobs":{}}\n'); r.git(r.bot, 'add', 'data/direct-trust.json'); r.git(r.bot, 'commit', '-q', '-m', 'Refresh reviewed leaderboard data');
  let result = r.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /changes data\/direct-trust.json \(the verifier trust list\); nothing was pushed/);
  assert.equal(r.log(), 'seed');
  // A reviewed trust change pushed to main during the run: the rebased data commit is pushed.
  r.git(r.bot, 'reset', '-q', '--hard', 'tmp');
  execFileSync('mkdir', ['-p', join(r.dev, 'data')]);
  r.write(r.dev, 'data/direct-trust.json', '{"controller_blobs":{"x":1}}\n'); r.git(r.dev, 'add', '.'); r.git(r.dev, 'commit', '-q', '-m', 'Trust verifier x'); r.git(r.dev, 'push', '-q', 'origin', 'main');
  r.write(r.bot, 'data.json', '{"v":5}\n'); r.git(r.bot, 'commit', '-q', '-am', 'Refresh reviewed leaderboard data');
  result = r.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(r.log(), 'Refresh reviewed leaderboard data\nTrust verifier x\nseed');
 } finally { r.cleanup(); }
});

test('a real conflict aborts the rebase and pushes nothing', () => {
 const r = setup();
 try {
  r.write(r.bot, 'data.json', '{"v":"bot"}\n'); r.git(r.bot, 'commit', '-q', '-am', 'Refresh reviewed leaderboard data');
  r.write(r.dev, 'data.json', '{"v":"hand edit"}\n'); r.git(r.dev, 'commit', '-q', '-am', 'Edit data by hand'); r.git(r.dev, 'push', '-q', 'origin', 'main');
  const result = r.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /conflicts with the newest main; nothing was pushed/);
  assert.equal(r.log(), 'Edit data by hand\nseed');
  assert.equal(existsSync(join(r.bot, '.git', 'rebase-merge')) || existsSync(join(r.bot, '.git', 'rebase-apply')), false);
 } finally { r.cleanup(); }
});

test('a rejection that passes is retried; one that stays fails after 3 pushes', () => {
 const r = setup();
 try {
  // The origin refuses the first push only, then accepts.
  const hook = join(r.origin, 'hooks', 'pre-receive');
  writeFileSync(hook, `#!/bin/sh\nmark=${r.origin}/refused-once\n[ -f "$mark" ] && exit 0\ntouch "$mark"; echo busy >&2; exit 1\n`);
  chmodSync(hook, 0o755);
  r.write(r.bot, 'data.json', '{"v":4}\n'); r.git(r.bot, 'commit', '-q', '-am', 'Log accepted Discord record posts');
  let result = r.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /attempt 2/);
  // Now the origin refuses every push.
  writeFileSync(hook, '#!/bin/sh\necho closed >&2\nexit 1\n');
  r.write(r.bot, 'data.json', '{"v":5}\n'); r.git(r.bot, 'commit', '-q', '-am', 'Log X record API delivery results');
  result = r.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /failed 3 times/);
  assert.equal(r.log().split('\n')[0], 'Log accepted Discord record posts');
 } finally { r.cleanup(); }
});
