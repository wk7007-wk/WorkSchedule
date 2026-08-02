import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('/tmp/chickentimer-source-package-reconcile-20260802/ChickenTimerBoard/node_modules/playwright');

const baseUrl = process.env.WS_GEOMETRY_URL || 'http://127.0.0.1:4173/?testAuth=1';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/root/.cache/ms-playwright/chromium_headless_shell-1223/chrome-linux/headless_shell';
const browser = await chromium.launch({ executablePath, headless: true });

try {
  for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 1366, height: 768 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    const writes = [];
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (!['GET', 'HEAD'].includes(request.method()) && /firebaseio\.com/.test(request.url())) writes.push(`${request.method()} ${request.url()}`);
    });
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.locator('#authBtn').click();
    await page.waitForFunction(() => !document.body.classList.contains('auth-locked'));
    await page.waitForTimeout(250);
    const result = await page.evaluate(() => {
      const root = document.documentElement;
      const appShell = document.querySelector('#appShell');
      const topbar = document.querySelector('.ws-topbar');
      const dateStrip = document.querySelector('#dateStrip');
      return {
        clientWidth: root.clientWidth,
        scrollWidth: root.scrollWidth,
        bodyClass: document.body.className,
        appVisible: Boolean(appShell && getComputedStyle(appShell).display !== 'none'),
        topbar: topbar && { clientWidth: topbar.clientWidth, scrollWidth: topbar.scrollWidth },
        dateStrip: dateStrip && { clientWidth: dateStrip.clientWidth, scrollWidth: dateStrip.scrollWidth },
        navTargetHeights: ['#prevW', '#prevD', '#dateDisp', '#nextD', '#nextW'].map(selector => ({ selector, height: document.querySelector(selector).getBoundingClientRect().height })),
        dateStripOverflowX: getComputedStyle(dateStrip).overflowX
      };
    });
    console.log(JSON.stringify({ viewport, ...result, errors, writes }));
    assert.equal(result.appVisible, true, `app shell is not visible at ${viewport.width}px`);
    assert.equal(result.scrollWidth, result.clientWidth, `document overflow at ${viewport.width}px`);
    assert.equal(result.topbar.scrollWidth, result.topbar.clientWidth, `top bar overflow at ${viewport.width}px`);
    assert.ok(result.navTargetHeights.every(target => target.height >= 44), `44px nav target regression at ${viewport.width}px`);
    assert.equal(result.dateStripOverflowX, 'auto', `date strip lost its intended internal scroll container at ${viewport.width}px`);
    assert.deepEqual(errors, [], `browser errors at ${viewport.width}px`);
    assert.deepEqual(writes, [], `Firebase writes at ${viewport.width}px`);
    await page.close();
  }
} finally {
  await browser.close();
}
