import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {CSP_HEADER, contentSecurityPolicy, createReportLimiter, inlineScriptHashes, summarizeReport} from './csp.ts';

const hash = (text: string) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;

test('the inline scripts that run are hashed; scripts with src and data blocks are not', () => {
  const html = '<script>var a=1</script><script type="module">import "/_astro/x.js"</script><script type="application/ld+json">{"@type":"Thing"}</script>'
    + '<script src="/analytics.js"></script><script type="module" src="/_astro/y.js"></script><script async>\n  x()\n</script>';
  assert.deepEqual(inlineScriptHashes(html), [hash('var a=1'), hash('import "/_astro/x.js"'), hash('\n  x()\n')]);
});

test('the policy allows only our origin, our hashed inline scripts and the analytics hosts, and nobody may frame the site', () => {
  const policy = contentSecurityPolicy([hash('a'), hash('b')]);
  const directives = Object.fromEntries(policy.split('; ').map(d => [d.split(' ')[0], d.split(' ').slice(1)]));
  assert.deepEqual(directives['script-src'], ["'self'", hash('a'), hash('b'), 'https://*.googletagmanager.com']);
  assert.ok(!policy.includes("'unsafe-inline'") || directives['style-src'].includes("'unsafe-inline'"));
  assert.ok(!directives['script-src'].includes("'unsafe-inline'") && !directives['script-src'].includes("'unsafe-eval'"));
  assert.deepEqual(directives['default-src'], ["'self'"]);
  assert.deepEqual(directives['object-src'], ["'none'"]);
  assert.deepEqual(directives['frame-ancestors'], ["'none'"]);
  assert.deepEqual(directives['base-uri'], ["'self'"]);
  assert.deepEqual(directives['report-uri'], ['/api/csp-report']);
  assert.ok(directives['connect-src'].includes('https://*.google-analytics.com') && directives['img-src'].includes('data:'));
  assert.equal(CSP_HEADER, 'Content-Security-Policy-Report-Only');
});

test('a report keeps a few short fields without the query part; junk gives no line; the limiter allows N a minute', () => {
  const line = summarizeReport(JSON.stringify({'csp-report': {'document-uri': 'https://bigospeedrun.com/a?token=1', 'blocked-uri': 'https://evil.example/x.js', 'violated-directive': 'script-src-elem', secret: 'no', 'line-number': 3}}));
  assert.equal(line, 'csp-report {"document-uri":"https://bigospeedrun.com/a","blocked-uri":"https://evil.example/x.js","violated-directive":"script-src-elem","line-number":"3"}');
  assert.equal(summarizeReport('not json'), undefined);
  assert.equal(summarizeReport('{"csp-report":null}'), undefined);
  assert.equal(summarizeReport('{"csp-report":{"x":"y"}}'), undefined);
  assert.ok(summarizeReport(JSON.stringify({'csp-report': {'blocked-uri': 'a'.repeat(5000)}}))!.length < 300);
  let time = 0;
  const allowed = createReportLimiter(3, () => time);
  assert.deepEqual([1, 2, 3, 4, 5].map(() => allowed()), [true, true, true, false, false]);
  time = 60_000;
  assert.equal(allowed(), true);
});
