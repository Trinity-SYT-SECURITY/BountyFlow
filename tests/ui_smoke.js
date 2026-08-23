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
const ADMIN_USER = arg('admin-user', 'admin');
const ADMIN_PASS = arg('admin-pass', 'admin123!');
const NO_ADMIN = has('no-admin');
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

  // builders and graph views — three separate builder routes exist and all
  // three are linked from the UI, so all three have to render
  { name: 'attack-builder', route: '/attack-builder', expect: ['Attack Flow Builder'] },
  // /api/v1/attack-chains/{id} and /api/v1/attack-flows/{id} are not
  // implemented either — same gap as attack-vectors, both builders degrade to
  // an empty canvas.
  { name: 'attack-chain-builder', route: '/attack-chain-builder', expect: ['Attack Chain Builder'],
    knownMissingApi: ['/attack-chains/'] },
  { name: 'attack-flow-builder', route: '/attack-flow-builder', expect: ['Attack Flow Builder'],
    knownMissingApi: ['/attack-flows/'] },
  { name: 'attack-vectors', route: '/attack-vectors', expect: ['Attack Vectors'],
    knownMissingApi: ['/attack-vectors/'] },
  { name: 'neo4j-graph', route: '/neo4j-graph', expect: ['Neo4j Graph Analysis'] },
  { name: 'network-graph', route: '/network-graph', expect: ['Network Graph'] },

  // developer page: fires a fixed list of probes, some of which are meant to
  // fail (unknown ids). Only the render is asserted.
  { name: 'api-test', route: '/api-test', expect: ['API Connection Test'], ignoreApiErrors: true },

  // redirects
  { name: 'users -> discovered-users', route: '/users', expect: ['Discovered Users'],
    allowUrl: /\/discovered-users/ },
  { name: 'index -> dashboard', route: '/', expect: ['Dashboard Overview', 'BountyFlow'],
    allowUrl: /\/(dashboard)?$/ },
];

/* Pages that only a superuser may open. */
const ADMIN_PAGES = [
  { name: 'admin dashboard', route: '/admin', expect: ['System Alerts', 'Real-time Activity Feed'] },
  { name: 'admin users', route: '/admin/users', expect: ['User Management'] },
  { name: 'admin projects', route: '/admin/projects', expect: ['All Projects'] },
  { name: 'admin settings', route: '/admin/settings', expect: ['System Settings'] },
  { name: 'admin audit logs', route: '/admin/audit-logs', expect: ['Audit Logs'] },
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
  const login = async (user, pass) => {
    await page.evaluate(() => localStorage.clear()).catch(() => {});
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(1200);
    const inputs = await page.$$('input:not([type=checkbox])');
    if (inputs.length < 2) return { error: `found ${inputs.length} inputs` };
    await inputs[0].type(user, { delay: 10 });
    await inputs[1].type(pass, { delay: 10 });
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /sign in/i.test(x.textContent));
      (b || document.querySelector('button[type=submit]')).click();
    });
    for (let i = 0; i < 40; i++) {
      await sleep(400);
      const t = await page.evaluate(() => localStorage.getItem('token'));
      if (t) return { token: t };
    }
    return { error: 'no token in localStorage after Sign in' };
  };

  /* One page: navigate, screenshot, assert it rendered real data. */
  const visit = async (p) => {
    apiErrors = [];
    try {
      await page.goto(BASE + p.route, { waitUntil: 'networkidle2', timeout: 60000 });
      await sleep(3000);
      const body = await page.evaluate(() => document.body.innerText);
      if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `${p.name.replace(/[^\w.-]+/g, '_')}.png`) });

      const problems = [];
      const seen = [...new Set(apiErrors)];
      const real = p.ignoreApiErrors ? [] :
        seen.filter((e) => !(p.knownMissingApi || []).some((k) => e.includes(k)));
      const known = seen.filter((e) => (p.knownMissingApi || []).some((k) => e.includes(k)));
      if (real.length) problems.push(`api errors: ${real.join(' | ')}`);
      if (known.length) console.log(`         (known gap: ${known.join(' | ')})`);
      const missing = (p.expect || []).filter((t) => !body.includes(t));
      if (missing.length === (p.expect || []).length && (p.expect || []).length)
        problems.push(`page text missing all of: ${p.expect.join(' / ')}`);
      if (p.mustMatch && !p.mustMatch.test(body)) problems.push('expected content did not render');
      const emptied = (p.empty || []).filter((t) => body.includes(t));
      if (emptied.length) problems.push(`shows empty state: "${emptied[0]}"`);
      const url = page.url();
      const bounced = /redirect=|\/login/.test(url) && !(p.allowUrl && p.allowUrl.test(url));
      if (bounced) problems.push(`bounced to ${url}`);
      if (p.allowUrl && !p.allowUrl.test(url)) problems.push(`landed on ${url}`);

      record(p.name, problems.length === 0, problems.join('; '));
    } catch (e) {
      record(p.name, false, e.message.slice(0, 140));
    }
  };

  /* Same-origin API call from the page, with the token the UI is holding. */
  const api = (route) => page.evaluate(async (r) => {
    const res = await fetch(`/api/v1${r}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (!res.ok) return null;
    return res.json().catch(() => null);
  }, route);

  const first = await login(USER, PASS);
  record('login through the UI stores a token', !!first.token, first.error);
  if (!first.token) {
    await browser.close();
    process.exit(1);
  }
  await sleep(1500);

  /* ---- every page must render data, not an empty state ---- */
  for (const p of PAGES) await visit(p);

  /* ---- detail pages: resolve real ids from the API first ---- */
  const projects = await api('/projects');
  const projectId = (Array.isArray(projects) ? projects[0] : (projects && projects.items || [])[0] || {}).id;
  if (projectId) {
    await visit({ name: 'project detail', route: `/projects/${projectId}`,
      expect: ['Project Information'], empty: ['Project Not Found'] });
    const reports = await api(`/reports/project/${projectId}`);
    const list = Array.isArray(reports) ? reports : (reports && reports.reports) || [];
    let reportId = list.length ? list[0].id : null;
    if (!reportId) {
      // nothing to open yet — generate one the way the Reports page does
      reportId = await page.evaluate(async (pid) => {
        const body = new URLSearchParams({ project_id: String(pid), title: 'UI smoke report', report_type: 'executive' });
        const res = await fetch('/api/v1/reports/generate', {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          body,
        });
        if (!res.ok) return null;
        const j = await res.json().catch(() => null);
        return j && (j.id || j.report_id);
      }, projectId);
    }
    if (reportId) {
      await visit({ name: 'report editor', route: `/reports/${reportId}`,
        expect: ['Back to Reports', 'Report'] });
    } else {
      record('report editor', false, 'could not generate a report to open');
    }
  } else {
    record('project detail', false, 'no project returned by /api/v1/projects');
  }

  /* ---- registration is a real, unauthenticated flow ---- */
  try {
    const uniq = `smoke_${Date.now().toString(36)}`;
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${BASE}/register`, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(1200);
    const fields = await page.$$('input');
    if (fields.length < 3) {
      record('register', false, `form has ${fields.length} inputs`);
    } else {
      const values = { username: uniq, email: `${uniq}@example.com`, password: 'Smoke123!pass' };
      for (const f of fields) {
        const meta = await f.evaluate((el) => ({ name: el.name || '', type: el.type, ph: el.placeholder || '' }));
        const key = `${meta.name} ${meta.ph}`.toLowerCase();
        if (meta.type === 'checkbox') continue;
        if (meta.type === 'password') await f.type(values.password, { delay: 5 });
        else if (/mail/.test(key)) await f.type(values.email, { delay: 5 });
        else if (/user|name/.test(key)) await f.type(values.username, { delay: 5 });
        else await f.type(values.username, { delay: 5 });
      }
      await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')]
          .find((x) => /register|sign up|create/i.test(x.textContent));
        (b || document.querySelector('button[type=submit]')).click();
      });
      await sleep(4000);
      const ok = await page.evaluate(() => !!localStorage.getItem('token')) ||
        /\/login|\/dashboard/.test(page.url());
      record('register a new account', ok, `still on ${page.url()}`);
    }
  } catch (e) {
    record('register a new account', false, e.message.slice(0, 140));
  }

  /* ---- admin console: needs a superuser ---- */
  if (!NO_ADMIN) {
    const asAdmin = await login(ADMIN_USER, ADMIN_PASS);
    record('login as superuser', !!asAdmin.token, asAdmin.error);
    if (asAdmin.token) {
      await sleep(1500);
      for (const p of ADMIN_PAGES) await visit(p);
    }
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks OK`);
  if (failed.length) {
    console.log('\nfailures:');
    failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
  }
  if (SHOTS) console.log(`screenshots in ${SHOT_DIR}`);
  process.exit(failed.length);
})();
