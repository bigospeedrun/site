import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {shouldBuild, decide} from '../../scripts/vercel-ignore-build.mjs';

const script = new URL('../../scripts/vercel-ignore-build.mjs', import.meta.url).pathname;

// A fixture repository: one commit per entry, each writing the listed files.
// Commit i has committer time minutes[i] minutes after a fixed start (default: i seconds).
function repository(commits: string[][], minutes: number[] = []) {
 const root = mkdtempSync(join(tmpdir(), 'vercel-ignore-'));
 const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args], {cwd: root, encoding: 'utf8'}).trim();
 git('init', '-q');
 const shas: string[] = [];
 commits.forEach((files, index) => {
  for (const file of files) {mkdirSync(join(root, dirname(file)), {recursive: true}); writeFileSync(join(root, file), `${index}\n`)}
  const date = `@${1791800000 + (minutes[index] === undefined ? index : minutes[index] * 60)} +0000`;
  git('add', '-A');
  execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-q', '--allow-empty', '-m', `commit ${index}`], {cwd: root, env: {...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date}});
  shas.push(git('rev-parse', 'HEAD'));
 });
 return {root, shas, cleanup: () => rmSync(root, {recursive: true, force: true})};
}
const run = (cwd: string, env: Record<string, string> = {}) => {
 const result = spawnSync(process.execPath, [script], {cwd, encoding: 'utf8', env: {PATH: process.env.PATH, ...env}});
 return {status: result.status, output: result.stdout};
};

test('only delivery logs skip; any other path builds', () => {
 assert.equal(shouldBuild(['data/records-posts.json']), false);
 assert.equal(shouldBuild(['data/x-posts.json', 'data/discord-records.json']), false);
 assert.equal(shouldBuild(['data/x-posts.json', 'src/data/registry.json']), true);
 assert.equal(shouldBuild(['data/registry.json']), true);
 assert.equal(shouldBuild(['src/lib/author-profiles.json']), true);
 assert.equal(shouldBuild([]), true);
});

test('a log-only commit skips the build and a site commit builds', () => {
 const repo = repository([['src/data/registry.json'], ['data/records-posts.json'], ['data/x-posts.json'], ['src/data/registry.json']]);
 try {
  // Without VERCEL_GIT_PREVIOUS_SHA the range is HEAD^..HEAD.
  execFileSync('git', ['checkout', '-q', repo.shas[2]], {cwd: repo.root});
  assert.deepEqual(run(repo.root), {status: 0, output: `Skip build: only delivery logs changed since HEAD^: data/x-posts.json\n`});
  execFileSync('git', ['checkout', '-q', repo.shas[3]], {cwd: repo.root});
  assert.equal(run(repo.root).status, 1);
 } finally { repo.cleanup() }
});

test('the range starts at the last deployed commit, not only HEAD^', () => {
 // Commit 1 changed a served file 30 minutes before the logs: its deployment should be
 // done by now, so a previous SHA before it means it did not deploy, and HEAD builds.
 const repo = repository([['src/data/registry.json'], ['src/data/3sum.json'], ['data/records-posts.json'], ['data/x-posts.json']], [0, 1, 31, 32]);
 try {
  assert.equal(run(repo.root, {VERCEL_GIT_PREVIOUS_SHA: repo.shas[0]}).status, 1);
  // Deployed at commit 1: only logs changed since.
  assert.equal(run(repo.root, {VERCEL_GIT_PREVIOUS_SHA: repo.shas[1]}).status, 0);
  // A redeploy of the deployed commit builds.
  assert.equal(run(repo.root, {VERCEL_GIT_PREVIOUS_SHA: repo.shas[3]}).status, 1);
 } finally { repo.cleanup() }
});

test('the refresh race: logs pushed seconds after a data commit skip', () => {
 // As in run 38376009613: data commit, then Discord log, X reservation and X results
 // within 7 s, while the data commit was still deploying.
 const repo = repository([['src/data/registry.json'], ['data/registry.json', 'src/data/registry.json', 'data/discord-records.json'], ['data/records-posts.json'], ['data/x-posts.json'], ['data/x-posts.json']]);
 try {
  const result = run(repo.root, {VERCEL_GIT_PREVIOUS_SHA: repo.shas[0]});
  assert.equal(result.status, 0);
  assert.equal(result.output, `Skip build: only delivery logs changed after ${repo.shas[1].slice(0, 7)}, which deploys on its own\n`);
  // Each earlier log commit in the same burst skips too; the data commit itself builds.
  for (const index of [2, 3]) {
   execFileSync('git', ['checkout', '-q', repo.shas[index]], {cwd: repo.root});
   assert.equal(run(repo.root, {VERCEL_GIT_PREVIOUS_SHA: repo.shas[0]}).status, 0);
  }
  execFileSync('git', ['checkout', '-q', repo.shas[1]], {cwd: repo.root});
  assert.equal(run(repo.root, {VERCEL_GIT_PREVIOUS_SHA: repo.shas[0]}).status, 1);
 } finally { repo.cleanup() }
});

test('a site commit on top, an empty commit or an old site commit builds', () => {
 // Logs, then a site change on top: HEAD itself changes the site.
 const top = repository([['src/data/registry.json'], ['data/records-posts.json'], ['src/data/3sum.json']]);
 // An empty commit on top of logs changes nothing that is known to be a log.
 const empty = repository([['src/data/registry.json'], ['src/data/3sum.json'], ['data/x-posts.json'], []]);
 // The site commit is 11 minutes older than the logs: outside the trust window.
 const old = repository([['src/data/registry.json'], ['src/data/3sum.json'], ['data/x-posts.json']], [0, 1, 12]);
 // A site commit exactly 10 minutes older is still trusted.
 const edge = repository([['src/data/registry.json'], ['src/data/3sum.json'], ['data/x-posts.json']], [0, 1, 11]);
 try {
  assert.equal(run(top.root, {VERCEL_GIT_PREVIOUS_SHA: top.shas[0]}).status, 1);
  assert.equal(run(empty.root, {VERCEL_GIT_PREVIOUS_SHA: empty.shas[0]}).status, 1);
  assert.equal(run(old.root, {VERCEL_GIT_PREVIOUS_SHA: old.shas[0]}).status, 1);
  assert.equal(run(edge.root, {VERCEL_GIT_PREVIOUS_SHA: edge.shas[0]}).status, 0);
 } finally { for (const repo of [top, empty, old, edge]) repo.cleanup() }
});

test('missing base commits and git errors fail open to a build', () => {
 const single = repository([['data/records-posts.json']]);
 const outside = mkdtempSync(join(tmpdir(), 'vercel-ignore-nogit-'));
 try {
  // HEAD^ does not exist in a one-commit (or depth-1) clone.
  assert.match(run(single.root).output, /^Build: cannot compare with HEAD\^/);
  assert.equal(run(single.root).status, 1);
  // The previous deployment is missing from a shallow clone.
  assert.equal(run(single.root, {VERCEL_GIT_PREVIOUS_SHA: 'f'.repeat(40)}).status, 1);
  // Not a git checkout at all.
  assert.equal(run(outside).status, 1);
  assert.equal(decide({cwd: outside, env: {}}).build, true);
 } finally { single.cleanup(); rmSync(outside, {recursive: true, force: true}) }
});
