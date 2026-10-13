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

export function shouldBuild(changed) {
 return changed.length === 0 || changed.some(path => !notServed.has(path));
}

// Vercel sets VERCEL_GIT_PREVIOUS_SHA to the last deployed commit; skipped commits
// do not move it, so the range covers every change since the live deployment.
export function decide({cwd = process.cwd(), env = process.env} = {}) {
 const base = env.VERCEL_GIT_PREVIOUS_SHA || 'HEAD^';
 try {
  const git = args => execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']});
  git(['cat-file', '-e', `${base}^{commit}`]);
  const changed = git(['diff', '--name-only', '--no-renames', base, 'HEAD']).split('\n').filter(Boolean);
  return shouldBuild(changed)
   ? {build: true, reason: changed.length ? `site files changed since ${base}` : `no changes since ${base}`}
   : {build: false, reason: `only delivery logs changed since ${base}: ${changed.join(', ')}`};
 } catch {
  return {build: true, reason: `cannot compare with ${base}`};
 }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 const {build, reason} = decide();
 console.log(`${build ? 'Build' : 'Skip build'}: ${reason}`);
 process.exit(build ? 1 : 0);
}
