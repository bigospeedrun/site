import {readFileSync, writeFileSync, renameSync} from 'node:fs';

// Public profile fields only. A failed lookup preserves the last checked profile.
const destination = 'src/lib/author-profiles.json';
const registry = JSON.parse(readFileSync('src/data/registry.json', 'utf8'));
const profiles = JSON.parse(readFileSync(destination, 'utf8'));
const logins = new Set(['dugongue']);
for (const problem of registry.problems) {
  const data = JSON.parse(readFileSync(`src/data/${problem.data_file}`, 'utf8'));
  for (const record of data.records) for (const author of record.authors) {
    const login = author.url?.match(/^https:\/\/github\.com\/([^/?#]+)/)?.[1];
    if (login) logins.add(login.toLowerCase());
  }
}
let failures = 0;
for (const login of [...logins].sort()) {
  try {
    const headers = {'Accept': 'application/vnd.github+json', 'User-Agent': 'bigospeedrun-site'};
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const response = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, {headers, signal: AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const profile = await response.json();
    profiles[login.toLowerCase()] = {
      login: profile.login,
      name: profile.name?.trim() || profile.login,
      twitter_username: /^[a-zA-Z0-9_]{1,15}$/.test(profile.twitter_username ?? '') ? profile.twitter_username : null,
      checked_at: new Date().toISOString(),
    };
  } catch {
    failures++;
    console.warn(`Could not refresh public profile for ${login}; retained cached profile or login fallback.`);
  }
}
writeFileSync(destination + '.tmp', JSON.stringify(Object.fromEntries(Object.entries(profiles).sort(([a], [b]) => a.localeCompare(b))), null, 2) + '\n');
renameSync(destination + '.tmp', destination);
console.log(`Checked ${logins.size} public profiles; ${failures} unavailable.`);
