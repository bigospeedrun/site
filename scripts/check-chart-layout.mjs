// Build the site and serve dist before running this check.
// node scripts/check-chart-layout.mjs [playwright-core module URL] [origin] [Chrome path]
import assert from 'node:assert/strict';
import {mkdir, readFile} from 'node:fs/promises';
const {chromium} = await import(process.argv[2] ?? 'playwright-core');
const origin = process.argv[3] ?? 'http://127.0.0.1:4334';
const registry = JSON.parse(await readFile(new URL('../src/data/registry.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({executablePath: process.argv[4] ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox']});
await mkdir('screenshots', {recursive: true});
let checked = 0;
try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({viewport: {width, height: 900}, colorScheme: 'dark', timezoneId: 'America/Los_Angeles'});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const {slug} of registry.problems) {
      await page.goto(`${origin}/${slug}`, {waitUntil: 'networkidle'});
      await page.evaluate(() => document.fonts.ready);
      await page.locator('progress-chart').waitFor();
      const levels = await page.locator('evidence-filters input[type=checkbox]').evaluateAll(inputs => inputs.map(input => input.value));
      for (const range of ['all', 3, 1]) {
        for (const level of levels) {
          const context = `${slug}, ${range}, ${level}, ${width}px`;
          for (const candidate of levels) {
            await page.locator(`evidence-filters input[value="${candidate}"]`).setChecked(candidate === level);
          }
          // Empty charts still have a title; their range controls are hidden.
          if (await page.locator('[data-range-all]').isVisible()) {
            if (range === 'all') await page.locator('[data-range-all]').click();
            else { await page.locator('[data-range-days] input').fill(String(range)); await page.locator('[data-range-days] input').press('Enter'); }
          }
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const geometry = await page.locator('progress-chart').evaluate(chart => {
            const visible = element => element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
            const box = element => {
              if (!visible(element)) return null;
              const {left, right, top, bottom, width, height} = element.getBoundingClientRect();
              return {left, right, top, bottom, width, height};
            };
            const title = chart.querySelector('h2');
            // Text ranges include the superscript glyph boxes, unlike the h2 line box.
            const ink = [];
            const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
              if (!/[^\s\u200b]/.test(node.textContent) || node.parentElement.closest('.katex-mathml')) continue;
              const range = document.createRange(); range.selectNodeContents(node);
              for (const rect of range.getClientRects()) {
                if (rect.width && rect.height) ink.push({left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom});
              }
            }
            return {
              chart: box(chart), title: box(title), ink,
              axis: box(chart.querySelector('.plot-axis-title')),
              legend: box(chart.querySelector('.plot-legend')),
              ticks: [...chart.querySelectorAll('.axis-tick')].map(box).filter(Boolean),
              plot: box(chart.querySelector('.progress-svg')),
              overflow: document.documentElement.scrollWidth > innerWidth,
            };
          });
          const overlaps = (a, b) => !!a && !!b && a.left < b.right - .5 && b.left < a.right - .5 && a.top < b.bottom - .5 && b.top < a.bottom - .5;
          assert.equal(geometry.overflow, false, `${context}: page overflow`);
          assert.ok(geometry.ink.length, `${context}: title has no visible text`);
          for (const ink of geometry.ink) {
            assert.ok(ink.top >= geometry.chart.top - .5, `${context}: title superscript clipped above chart`);
            assert.ok(ink.left >= geometry.chart.left - .5 && ink.right <= geometry.chart.right + .5, `${context}: title clipped horizontally`);
            assert.equal(overlaps(ink, geometry.legend), false, `${context}: title overlaps legend`);
            assert.equal(overlaps(ink, geometry.axis), false, `${context}: title overlaps axis title`);
            for (const tick of geometry.ticks) assert.equal(overlaps(ink, tick), false, `${context}: title overlaps tick`);
          }
          for (const [i, tick] of geometry.ticks.entries()) {
            assert.ok(tick.left >= geometry.chart.left - .5, `${context}: tick clipped on left`);
            assert.equal(overlaps(tick, geometry.axis), false, `${context}: tick overlaps axis title`);
            assert.equal(overlaps(tick, geometry.title), false, `${context}: tick overlaps plot title`);
            for (const other of geometry.ticks.slice(i + 1)) assert.equal(overlaps(tick, other), false, `${context}: y ticks overlap`);
          }
          assert.equal(overlaps(geometry.axis, geometry.title), false, `${context}: axis title overlaps plot title`);
          if (slug === 'integer-multiplication' && range === 1 && level === 'human-verified' && width === 1280) {
            await page.locator('progress-chart').screenshot({path: 'screenshots/chart-human-24h-2026-10-11-desktop-dark.png'});
          }
          checked++;
        }
      }
    }
    assert.deepEqual(errors, [], `Browser errors at ${width}px`);
    await page.close();
  }
  console.log(`PASS: ${checked} chart layouts; all registered problems, All and the last 3 days and 1 day, each single evidence filter, 390/1280px dark.`);
} finally {
  await browser.close();
}
