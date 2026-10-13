import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {shouldBuild, decide} from '../../scripts/vercel-ignore-build.mjs';

const script = new URL('../../scripts/vercel-ignore-build.mjs', import.meta.url).pathname;

// A fixture repository: one commit per entry, each writing the listed files.
function repository(commits: string[][]) {
 const root = mkdtempSync(join(tmpdir(), 'vercel-ignore-'));
 const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args], {cwd: root, encoding: 'utf8'}).trim();
 git('init', '-q');
 const shas: string[] = [];
 commits.forEach((files, index) => {
  for (const file of files) {mkdirSync(join(root, dirname(file)), {recursive: true}); writeFileSync(join(root, file), `${index}\n`)}
  git('add', '-A'); git('commit', '-q', '--allow-empty', '-m', `commit ${index}`);
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
 const repo = repository([['src/data/registry.json'], ['src/data/3sum.json'], ['data/records-posts.json'], ['data/x-posts.json']]);
 try {
  // Deployed at commit 0: commit 1 changed a served file, so HEAD must build although HEAD^..HEAD is log-only.
  assert.equal(run(repo.root, {VERCEL_GIT_PREVIOUS_SHA: repo.shas[0]}).status, 1);
  // Deployed at commit 1: only logs changed since.
  assert.equal(run(repo.root, {VERCEL_GIT_PREVIOUS_SHA: repo.shas[1]}).status, 0);
  // A redeploy of the deployed commit builds.
  assert.equal(run(repo.root, {VERCEL_GIT_PREVIOUS_SHA: repo.shas[3]}).status, 1);
 } finally { repo.cleanup() }
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
