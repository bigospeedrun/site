// Build and serve dist locally before running this check.
// node scripts/check-chart-pinning.mjs [playwright-core module URL] [local origin] [Chrome path]
import assert from 'node:assert/strict';
import {mkdir, readFile} from 'node:fs/promises';
const {chromium} = await import(process.argv[2] ?? 'playwright-core');
const origin = process.argv[3] ?? 'http://127.0.0.1:4334';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Use a local build');
const registry = JSON.parse(await readFile(new URL('../src/data/registry.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({executablePath: process.argv[4] ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox']});
await mkdir('screenshots', {recursive: true});
let checked = 0;
try {
 for (const [width, avatars] of [[1280, true], [390, true], [1280, false], [390, false]]) {
  const context = await browser.newContext({viewport: {width, height: 900}, isMobile: width === 390, hasTouch: width === 390, timezoneId: 'America/Los_Angeles'});
  if (!avatars) await context.addInitScript(() => localStorage.setItem('bigospeedrun-show-avatars', 'false'));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const slug of ['', ...registry.problems.map(problem => problem.slug)]) {
   await page.goto(`${origin}/${slug}`, {waitUntil: 'networkidle'});
   await page.evaluate(() => document.fonts.ready);
   for (const chart of await page.locator('progress-chart').all()) {
    // A crowded older entry shrinks under a newer avatar; pointer checks use marks that are drawn in full.
    const points = chart.locator(avatars ? '.plot-point:has(.avatar-ring)' : '.plot-point');
    if (!await points.count()) continue;
    const first = points.first(), last = points.last(), tooltip = chart.locator('.plot-tooltip');
    const activate = async point => width === 390 ? point.tap() : point.click();
    await activate(first);
    const content = await tooltip.textContent();
    await page.mouse.move(0, 0);
    assert.equal(await tooltip.isVisible(), true, `${slug}: pointer leave retains pin`);
    // Synthetic entry also checks the hover rule on touch devices.
    await last.dispatchEvent('pointerenter');
    assert.equal(await tooltip.textContent(), content, `${slug}: hover retains pin`);
    await activate(first);
    assert.equal(await tooltip.isVisible(), false, `${slug}: same dot unpins`);
    await first.focus(); await first.press('Enter');
    assert.equal(await first.getAttribute('aria-pressed'), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await tooltip.isVisible(), false, `${slug}: Escape unpins`);
    await first.press('Space');
    assert.equal(await first.getAttribute('aria-pressed'), 'true');
    await first.press('Space');
    assert.equal(await tooltip.isVisible(), false, `${slug}: Space toggles`);
    await activate(first);
    await chart.locator('.progress-svg').click({position: {x: 8, y: 8}});
    assert.equal(await tooltip.isVisible(), false, `${slug}: empty plot unpins`);
    await activate(first);
    await page.locator('body').click({position: {x: 2, y: 2}});
    assert.equal(await tooltip.isVisible(), false, `${slug}: outside click unpins`);
    await activate(first);
    if (await points.count() > 1) {
     await activate(last);
     assert.equal(await first.getAttribute('aria-pressed'), 'false');
     assert.equal(await last.getAttribute('aria-pressed'), 'true');
    }
    for (const point of await chart.locator('.plot-point').all()) {
     await page.keyboard.press('Escape');
     await point.focus(); await point.press('Enter');
     const box = await tooltip.boundingBox(), area = await chart.locator('.plot-area').boundingBox();
     assert.ok(box.x >= area.x && box.x + box.width <= area.x + area.width + 1, `${slug}: horizontal containment`);
     assert.ok(box.y >= area.y && box.y + box.height <= area.y + area.height + 1, `${slug}: vertical containment`);
    }
    await page.setViewportSize({width: width + 1, height: 900});
    await page.waitForTimeout(100);
    assert.equal(await tooltip.isVisible(), true, `${slug}: resize retains pin`);
    await page.setViewportSize({width, height: 900});
    await page.waitForTimeout(100);
    if (slug === 'exact-dft' && avatars) {
     await page.mouse.move(0, 0);
     await chart.screenshot({path: `screenshots/chart-pinned-2026-10-11-${width}.png`});
    }
    checked++;
   }
  }
  assert.deepEqual(errors, []);
  await context.close();
 }
 console.log(`PASS: pin, unpin, keyboard, touch, hover, resize, and edge checks for ${checked} charts at 1280/390px, with avatars on and off.`);
} finally { await browser.close(); }
