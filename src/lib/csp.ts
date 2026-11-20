// Content-Security-Policy of bigospeedrun.com (task f07ab309, Nil via Lead SRE, 2026-11-20). Modeled on cloud.isomux.com's.
// Scripts: our own files, the inline scripts that Astro writes into the pages (allowed by hash, read from the built
// dist when the server starts, so a new build needs no list to edit), and Google's tag host for analytics.js (GA4).
// Styles keep 'unsafe-inline': KaTeX writes tens of thousands of style attributes, which a hash cannot cover.
// Fonts and images are our own files or data: URIs (the build inlines the smallest KaTeX font in the page style; the
// first report-only run on a local build found this). The chat and markdown calls go to our own origin. No page embeds an outside frame,
// and no outside page may embed ours.
import {createHash} from 'node:crypto';
import {readdir, readFile} from 'node:fs/promises';
import {join} from 'node:path';

// The header is Report-Only first. After a week with no reports of real pages, change this one name to
// 'Content-Security-Policy' in a reviewed commit (the enforce step of task f07ab309).
export const CSP_HEADER = 'Content-Security-Policy-Report-Only';
export const CSP_REPORT_PATH = '/api/csp-report';

// The hosts that GA4 documents for its tag (Google Tag Platform, "Content Security Policy"). The report-only
// header shows any other host that the tag really needs.
const analytics = ['https://www.google-analytics.com', 'https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com'];

// The sha256 source of each inline script that runs: a classic script or a module without src. A data block (the
// JSON-LD of a page) is never run, so the policy does not cover it.
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const [, attributes, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/\ssrc\s*=/.test(attributes)) continue;
    const type = /\stype\s*=\s*"([^"]*)"/.exec(attributes)?.[1].toLowerCase();
    if (type !== undefined && type !== 'module' && type !== 'text/javascript') continue;
    hashes.push(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
  }
  return hashes;
}

async function htmlFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await htmlFiles(path));
    else if (entry.name.endsWith('.html')) files.push(path);
  }
  return files;
}

// Every inline script hash of the built site, sorted and without repeats.
export async function distScriptHashes(dist: string): Promise<string[]> {
  const hashes = new Set<string>();
  for (const file of await htmlFiles(dist)) for (const hash of inlineScriptHashes(await readFile(file, 'utf8'))) hashes.add(hash);
  return [...hashes].sort();
}

export function contentSecurityPolicy(scriptHashes: string[]): string {
  return [
    `default-src 'self'`,
    `base-uri 'self'`,
    `connect-src 'self' ${analytics.join(' ')}`,
    `font-src 'self' data:`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `img-src 'self' data: ${analytics.join(' ')}`,
    `object-src 'none'`,
    `script-src ${[`'self'`, ...scriptHashes, 'https://*.googletagmanager.com'].join(' ')}`,
    `style-src 'self' 'unsafe-inline'`,
    `report-uri ${CSP_REPORT_PATH}`,
  ].join('; ');
}

// One log line per report, for `docker logs`. A report is a guess by a browser (or by anyone who posts to the path):
// keep only a few short fields, drop the query part of each address, and log at most `perMinute` reports a minute.
const FIELDS = ['document-uri', 'blocked-uri', 'violated-directive', 'effective-directive', 'source-file', 'line-number', 'disposition'];
export const MAX_REPORT_BYTES = 16_384;

export function summarizeReport(text: string): string | undefined {
  let report: unknown;
  try { report = (JSON.parse(text) as {'csp-report'?: unknown})['csp-report']; } catch { return undefined; }
  if (typeof report !== 'object' || report === null) return undefined;
  const fields: Record<string, string> = {};
  for (const name of FIELDS) {
    const value = (report as Record<string, unknown>)[name];
    if (typeof value === 'string' || typeof value === 'number') fields[name] = String(value).split('?')[0].slice(0, 200);
  }
  return Object.keys(fields).length ? 'csp-report ' + JSON.stringify(fields) : undefined;
}

export function createReportLimiter(perMinute: number, now: () => number = Date.now) {
  let windowStart = 0, count = 0;
  return () => {
    const time = now();
    if (time - windowStart >= 60_000) { windowStart = time; count = 0; }
    return ++count <= perMinute;
  };
}
