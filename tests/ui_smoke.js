#!/usr/bin/env node
/**
 * Browser-level smoke test.
 *
 *   node tests/ui_smoke.js --base http://localhost:3000 [--shots]
 *
 * The API suite (tests/platform_e2e.py) drives the backend with a token, so it
 * cannot see the failure mode where a page renders "No projects found" next to
 * a dashboard that says 2 projects — that one only shows up in a real browser,
 * where a page forgets to send its Authorization header.
 *
 * So this walks the actual UI: logs in through the form, visits every page, and
 * fails a page if it either shows an empty state or if any /api/ request behind
 * it came back 4xx/5xx.
 *
 * Exit code is the number of failed pages.
 */
const fs = require('fs');
const path = require('path');

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    // reuse the copy installed for the demo exporter
    return require(path.resolve(__dirname, '../demo/export/node_modules/puppeteer-core'));
  }
}
const puppeteer = loadPuppeteer();

const arg = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : def;
};
const has = (name) => process.argv.includes(`--${name}`);

const BASE = (arg('base', 'http://localhost:3000')).replace(/\/$/, '');
const USER = arg('user', 'test_user');
const PASS = arg('pass', 'test123');
const SHOTS = has('shots');
const SHOT_DIR = path.resolve(__dirname, 'ui-screenshots');

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  const hit = candidates.find((p) => fs.existsSync(p));
  if (!hit) throw new Error('No Chrome found. Set CHROME_PATH.');
  return hit;
}

/* Each page: where to go, and a phrase that proves real data rendered.
   `empty` is the wording the page shows when it has nothing. */
const PAGES = [
  // assert real numbers, not just the heading: an expired session used to leave
  // the tiles blank while the page still looked fine
  { name: 'dashboard', route: '/dashboard', expect: ['Dashboard Overview'],
    mustMatch: /Projects[\s\S]{0,80}Targets[\s\S]{0,80}Findings/ },
  { name: 'projects', route: '/projects', expect: ['Projects'], empty: ['No projects found'] },
  { name: 'targets', route: '/targets', expect: ['Targets'], empty: ['No targets found', 'No Targets Found'] },
  { name: 'findings', route: '/findings', expect: ['Findings'], empty: ['No findings found'] },
  { name: 'discovered-users', route: '/discovered-users', expect: ['Discovered Users'], empty: ['No users found'] },
  { name: 'files', route: '/files', expect: ['Files'], empty: ['No files found'] },
  // /api/v1/attack-vectors/{id} is not implemented in the backend; the page
  // degrades to an empty builder. Tracked as a gap, not a regression.
  { name: 'vectors', route: '/vectors', expect: ['Attack Vectors'], knownMissingApi: ['/attack-vectors/'] },
  { name: 'tools', route: '/tools', expect: ['Tools'], empty: ['No Tools Found', 'No tools found'] },
  { name: 'workflows', route: '/workflows', expect: ['Workflows'] },
  { name: 'knowledge-graph', route: '/knowledge-graph', expect: ['Security Relationship Map', 'Graph Statistics'] },
  { name: 'recommendations', route: '/recommendations', expect: ['Recommendations'] },
  { name: 'scope', route: '/scope', expect: ['Scope'] },
  { name: 'reports', route: '/reports', expect: ['Reports'] },
  { name: 'export', route: '/export', expect: ['Export'] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${!ok && detail ? `\n         ${detail}` : ''}`);
}

(async () => {
  if (SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });
  console.log(`BountyFlow UI smoke test against ${BASE}`);

  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: 'new',
    args: ['--hide-scrollbars', '--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });

  // watch every API response so a silent 401 cannot hide behind an empty state
  let apiErrors = [];
  page.on('response', (res) => {
    const u = res.url();
    if (/\/api\/v1\//.test(u) && res.status() >= 400) {
      apiErrors.push(`${res.status()} ${u.replace(BASE, '').slice(0, 90)}`);
    }
  });

  /* ---- log in through the form, like a user ---- */
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1200);
  const inputs = await page.$$('input:not([type=checkbox])');
  if (inputs.length < 2) {
    record('login form renders', false, `found ${inputs.length} inputs`);
    await browser.close();
    process.exit(1);
  }
  await inputs[0].type(USER, { delay: 10 });
  await inputs[1].type(PASS, { delay: 10 });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /sign in/i.test(x.textContent));
    (b || document.querySelector('button[type=submit]')).click();
  });
  let token = null;
  for (let i = 0; i < 40; i++) {
    await sleep(400);
    token = await page.evaluate(() => localStorage.getItem('token'));
    if (token) break;
  }
  record('login through the UI stores a token', !!token, 'no token in localStorage after Sign in');
  if (!token) {
    await browser.close();
    process.exit(1);
  }
  await sleep(1500);

  /* ---- every page must render data, not an empty state ---- */
  for (const p of PAGES) {
    apiErrors = [];
    try {
      await page.goto(BASE + p.route, { waitUntil: 'networkidle2', timeout: 60000 });
      await sleep(3000);
      const body = await page.evaluate(() => document.body.innerText);
      if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `${p.name}.png`) });

      const problems = [];
      const real = [...new Set(apiErrors)].filter(
        (e) => !(p.knownMissingApi || []).some((k) => e.includes(k)));
      const known = [...new Set(apiErrors)].filter(
        (e) => (p.knownMissingApi || []).some((k) => e.includes(k)));
      if (real.length) problems.push(`api errors: ${real.join(' | ')}`);
      if (known.length) console.log(`         (known gap: ${known.join(' | ')})`);
      const missing = (p.expect || []).filter((t) => !body.includes(t));
      if (missing.length === (p.expect || []).length && (p.expect || []).length)
        problems.push(`page text missing all of: ${p.expect.join(' / ')}`);
      if (p.mustMatch && !p.mustMatch.test(body)) problems.push('expected content did not render');
      const emptied = (p.empty || []).filter((t) => body.includes(t));
      if (emptied.length) problems.push(`shows empty state: "${emptied[0]}"`);
      if (/redirect=|\/login/.test(page.url())) problems.push(`bounced to ${page.url()}`);

      record(p.name, problems.length === 0, problems.join('; '));
    } catch (e) {
      record(p.name, false, e.message.slice(0, 140));
    }
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} pages OK`);
  if (failed.length) {
    console.log('\nfailures:');
    failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
  }
  if (SHOTS) console.log(`screenshots in ${SHOT_DIR}`);
  process.exit(failed.length);
})();
