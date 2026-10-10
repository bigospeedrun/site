// Use an installed playwright-core package, or pass its module URL as argument 1.
// Start: ANTHROPIC_API_KEY= DISCORD_WEBHOOK_URL= npx astro dev --ignore-lock --port 4335
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const {chromium, devices} = await import(process.argv[2] ?? 'playwright-core');

await mkdir('screenshots', {recursive: true});
const browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox']});
const origin = 'http://127.0.0.1:4335';
const errors = [];
try {
  const availabilityPage = await browser.newPage();
  let available = false, failStatus = false;
  let releaseStatus;
  const statusGate = new Promise(resolve => { releaseStatus = resolve; });
  await availabilityPage.route('**/api/chat', async route => {
    assert.equal(route.request().method(), 'GET');
    await statusGate;
    if (failStatus) return route.fulfill({status: 503, body: 'Unavailable'});
    return route.fulfill({json: {available, logging: true, stub: false}});
  });
  const initialStatus = availabilityPage.waitForResponse('**/api/chat');
  await availabilityPage.goto(origin + '/about');
  const unavailableLauncher = availabilityPage.locator('.bos-chat-toggle');
  assert.equal(await unavailableLauncher.isVisible(), false);
  releaseStatus();
  await (await initialStatus).finished();
  await availabilityPage.waitForFunction(() => document.querySelector('.bos-chat-disclosure')?.textContent.includes('not available yet'));
  assert.equal(await unavailableLauncher.isVisible(), false);
  available = true;
  await availabilityPage.evaluate(() => window.dispatchEvent(new Event('focus')));
  await unavailableLauncher.waitFor({state: 'visible'});
  failStatus = true;
  const failedStatus = availabilityPage.waitForResponse('**/api/chat');
  await availabilityPage.evaluate(() => window.dispatchEvent(new Event('focus')));
  await (await failedStatus).finished();
  await unavailableLauncher.waitFor({state: 'hidden'});
  assert.equal(await availabilityPage.locator('.bos-chat-panel').isVisible(), false);
  await availabilityPage.close();
  console.log('Availability: hidden while pending/keyless/503; shows on runtime status change without reload');
  for (const [name, options] of [
    ['1280', {viewport: {width: 1280, height: 900}, colorScheme: 'light'}],
    ['iphone15', {...devices['iPhone 15'], defaultBrowserType: undefined, colorScheme: 'light'}],
    ['390-dark', {viewport: {width: 390, height: 844}, colorScheme: 'dark', isMobile: true, hasTouch: true}],
  ]) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/integer-multiplication');
    const launcher = page.getByRole('button', {name: 'Ask about Big O Speedrun', exact: true});
    await launcher.waitFor();
    await page.locator('progress-chart .plot-ranges').scrollIntoViewIfNeeded();
    if (page.viewportSize().width <= 600) {
      await launcher.waitFor({state: 'hidden'});
      assert.equal(await page.locator('progress-chart .plot-ranges button').evaluateAll(buttons => buttons.every(button => {
        const r = button.getBoundingClientRect();
        return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === button;
      })), true);
      await page.screenshot({path: `screenshots/chatbot-${name}-chart.png`});
    } else assert.equal(await launcher.isVisible(), true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await launcher.waitFor();
    await page.getByRole('button', {name: 'Ask about Big O Speedrun', exact: true}).click();
    await page.locator('#bos-chat-input:enabled').waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('.bos-chat-logging').isVisible(), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const bounds = await page.locator('.bos-chat-panel').boundingBox();
    const viewport = page.viewportSize();
    assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1);
    await page.screenshot({path: `screenshots/chatbot-${name}.png`});
    await page.getByRole('button', {name: 'What does each evidence level mean?', exact: true}).click();
    await page.getByText('The reply is ready.', {exact: true}).waitFor();
    assert.match(await page.locator('.bos-chat-message[data-role=assistant]').innerText(), /local demo reply/);
    assert.equal(await page.locator('.bos-chat-message a[href="/about#faq"]').count(), 1);
    await page.screenshot({path: `screenshots/chatbot-${name}-reply.png`});
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.bos-chat-panel').isVisible(), false);
    assert.equal(await page.getByRole('button', {name: 'Ask about Big O Speedrun', exact: true}).evaluate(el => el === document.activeElement), true);
    console.log(`${name}: panel fits; stub reply, safe links, Escape and focus pass`);
    await context.close();
  }

  // Simulate provider frames without using a real key or sending to Discord.
  const page = await browser.newPage({viewport: {width: 1280, height: 900}});
  let count = 0;
  await page.route('**/api/chat', async route => {
    if (route.request().method() === 'GET') return route.fulfill({json: {available: true, stub: false, logging: true}});
    const body = route.request().postDataJSON();
    assert.equal(body.loggingNotice, true);
    count++;
    if (count === 1) return route.fulfill({contentType: 'text/event-stream', body: `data: ${JSON.stringify({text: '<img src=x onerror=alert(1)> A bound is \\(O(n^2)\\). [Source](https://github.com/example/proof?utm_source=x)'})}\n\ndata: [DONE]\n\n`});
    if (count === 2) return route.fulfill({status: 429, json: {error: {message: 'Please wait 60 seconds before sending another message.'}}});
    return route.fulfill({contentType: 'text/event-stream', body: 'data: {"text":"An unfinished answer"}\n\n'});
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/about');
  await page.getByRole('button', {name: 'Ask about Big O Speedrun', exact: true}).click();
  await page.locator('#bos-chat-input:enabled').waitFor();
  assert.equal(await page.locator('.bos-chat-logging').isVisible(), true);
  await page.locator('#bos-chat-input').fill('Explain a bound');
  await page.getByRole('button', {name: 'Send message', exact: true}).click();
  await page.getByText('The reply is ready.', {exact: true}).waitFor();
  assert.equal(await page.locator('.bos-chat-message img').count(), 0);
  assert.equal(await page.locator('.bos-chat-message .katex').count(), 1);
  assert.equal(await page.locator('.bos-chat-message a').getAttribute('href'), 'https://github.com/example/proof');
  await page.locator('#bos-chat-input').fill('Try another');
  await page.getByRole('button', {name: 'Send message', exact: true}).click();
  await page.getByText('Please wait 60 seconds before sending another message.', {exact: true}).waitFor();
  assert.equal(await page.locator('#bos-chat-input').inputValue(), 'Try another');
  await page.getByRole('button', {name: 'Send message', exact: true}).click();
  await page.getByText('The reply was interrupted. Please try again.', {exact: true}).waitFor();
  assert.equal(await page.locator('.bos-chat-message[data-role=assistant]').count(), 1);
  assert.deepEqual(errors, []);
  console.log('Mocked live mode: disclosure, math, XSS, rate error and interrupted stream pass');
} finally { await browser.close(); }
