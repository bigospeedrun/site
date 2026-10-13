// Vercel ignored build step: exit 0 skips the deployment, exit 1 builds it.
// The hourly refresh workflow commits delivery logs that the site never reads.
// A deployment whose changes touch only those files would be identical, so skip it.
// Any doubt (missing base, git error, empty diff) builds: this step fails open.
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

// Read only by scripts/discord-records.ts and scripts/x-records.ts in the workflow.
// The build reads data/ only through scripts/sync-data.mjs, which copies the
// registry, submissions, chart cross-check, problem files and data/sources.
export const notServed = new Set(['data/records-posts.json', 'data/x-posts.json', 'data/discord-records.json']);

// The refresh workflow pushes each commit on its own, seconds apart. Vercel starts
// the data commit's deployment, and the log commits after it still see an older
// VERCEL_GIT_PREVIOUS_SHA. A site commit this recent is trusted to deploy itself;
// an older one that is still not deployed may have failed, so that case builds.
export const trustWindowSeconds = 600;

export function shouldBuild(changed) {
 return changed.length === 0 || changed.some(path => !notServed.has(path));
}

const isLogOnly = changed => changed.length > 0 && !shouldBuild(changed);

// Vercel sets VERCEL_GIT_PREVIOUS_SHA to the last deployed commit; skipped commits
// do not move it, so the range covers every change since the live deployment.
export function decide({cwd = process.cwd(), env = process.env} = {}) {
 const base = env.VERCEL_GIT_PREVIOUS_SHA || 'HEAD^';
 try {
  const git = args => execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']});
  const lines = text => text.split('\n').filter(Boolean);
  git(['cat-file', '-e', `${base}^{commit}`]);
  const changed = lines(git(['diff', '--name-only', '--no-renames', base, 'HEAD']));
  if (isLogOnly(changed)) return {build: false, reason: `only delivery logs changed since ${base}: ${changed.join(', ')}`};
  // Newest first: count the log-only commits on top, then take the newest site commit.
  const commits = lines(git(['rev-list', '--first-parent', '--max-count=50', `${base}..HEAD`]));
  const own = sha => lines(git(['diff-tree', '--no-commit-id', '--name-only', '-r', '--no-renames', '-m', '--first-parent', sha]));
  const time = sha => Number(git(['show', '-s', '--format=%ct', sha]).trim());
  let logs = 0;
  while (logs < commits.length && isLogOnly(own(commits[logs]))) logs++;
  const site = commits[logs];
  if (logs > 0 && site && time(commits[0]) - time(site) <= trustWindowSeconds) {
   return {build: false, reason: `only delivery logs changed after ${site.slice(0, 7)}, which deploys on its own`};
  }
  return {build: true, reason: changed.length ? `site files changed since ${base}` : `no changes since ${base}`};
 } catch {
  return {build: true, reason: `cannot compare with ${base}`};
 }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 const {build, reason} = decide();
 console.log(`${build ? 'Build' : 'Skip build'}: ${reason}`);
 process.exit(build ? 1 : 0);
}
