/* One-off: log into a running BountyFlow and screenshot every page,
 * so the animation can be drawn from the real UI rather than from memory. */
const fs = require('fs');
const path = require('path');
const puppeteer = require(require('path').resolve(__dirname, '../demo/export/node_modules/puppeteer-core'));

const BASE = process.env.BF_BASE || 'http://localhost:13000';
const OUT = process.env.BF_OUT || path.resolve(__dirname, '../demo/docs/ui-reference');
const PAGES = [
  ['dashboard', '/dashboard'],
  ['projects', '/projects'],
  ['targets', '/targets'],
  ['findings', '/findings'],
  ['discovered-users', '/discovered-users'],
  ['files', '/files'],
  ['vectors', '/vectors'],
  ['tools', '/tools'],
  ['workflows', '/workflows'],
  ['knowledge-graph', '/knowledge-graph'],
  ['recommendations', '/recommendations'],
  ['scope', '/scope'],
  ['reports', '/reports'],
  ['export', '/export'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, '00-login.png') });

  const inputs = await page.$$('input:not([type=checkbox])');
  await inputs[0].type('test_user', { delay: 12 });
  await inputs[1].type('test123', { delay: 12 });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /sign in/i.test(x.textContent));
    (b || document.querySelector('button[type=submit]')).click();
  });
  // the app stores its JWT then routes client-side, so wait for the token
  for (let i = 0; i < 40; i++) {
    const tok = await page.evaluate(() => localStorage.getItem('token'));
    if (tok) break;
    await sleep(500);
  }
  await sleep(2500);
  console.log('after login →', page.url(), 'token:',
    await page.evaluate(() => !!localStorage.getItem('token')));

  for (const [name, route] of PAGES) {
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 60000 });
      await sleep(3600);
      const i = PAGES.findIndex((p) => p[0] === name) + 1;
      await page.screenshot({ path: path.join(OUT, `${String(i).padStart(2, '0')}-${name}.png`) });
      console.log('shot', name, '→', page.url());
    } catch (e) {
      console.log('FAILED', name, e.message.slice(0, 120));
    }
  }
  await browser.close();
})();
