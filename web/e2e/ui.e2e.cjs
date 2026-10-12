/**
 * ui.e2e.cjs - end-to-end check of the web interface in a real (headless) Chrome against the RUNNING app.
 *
 *   E2E_USER=<admin user> E2E_PASSWORD=<password> npm run test:e2e [-- <screenshot-dir>]
 *
 * Needs: API running (npm start in api/) with the built UI (npm run build here), dataset loaded,
 * the GDS plugin, and Google Chrome (CHROME_PATH overrides the default macOS location).
 * Creates suspect S0990 and a viewer account e2e_viewer_<random>; removes both again.
 */
const crypto = require('crypto');
const puppeteer = require('puppeteer-core');
const OUT = process.argv[2];
const BASE = process.env.E2E_URL || 'http://localhost:3000/';
const ADMIN = { user: process.env.E2E_USER, pass: process.env.E2E_PASSWORD };
const VIEWER = { user: `e2e_viewer_${crypto.randomBytes(3).toString('hex')}`, pass: crypto.randomBytes(12).toString('hex') };
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!ADMIN.user || !ADMIN.pass) { console.error('Set E2E_USER and E2E_PASSWORD (an admin account).'); process.exit(2); }
const results = [];
const problems = [];
const ok = (name, cond, extra = '') => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' - ' + extra : ''}`); if (!cond) process.exitCode = 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function text(page) { return page.evaluate(() => document.body.innerText.toLowerCase()); }
async function waitText(page, t, timeout = 10000) {
  await page.waitForFunction((s) => document.body.innerText.toLowerCase().includes(s), { timeout }, t.toLowerCase());
}
async function clickText(page, sel, t) {
  const els = await page.$$(sel);
  for (const e of els) if ((await e.evaluate((n) => n.innerText.trim())) === t) { await e.click(); return true; }
  throw new Error(`no ${sel} with text '${t}'`);
}
async function fill(page, sel, v) { await page.$eval(sel, (e) => { e.value = ''; }); await page.type(sel, v); }
async function shot(page, name) { if (OUT) await page.screenshot({ path: `${OUT}/${name}.png` }); }
async function login(page, u, p) {
  await page.goto(BASE + '#/dashboard', { waitUntil: 'networkidle0' });
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await fill(page, 'input[autocomplete="username"]', u);
  await fill(page, 'input[type="password"]', p);
  await page.click('button.btn-primary');
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('console', (m) => { if (m.type() === 'error' && !/401|403|409|404|400/.test(m.text())) problems.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

  let adminToken = null;
  const adminApi = (method, path) => page.evaluate(async (m, p, t) => (await fetch(p, { method: m, headers: { Authorization: `Bearer ${t}` } })).status, method, path, adminToken);
  try {
    // ---- authentication
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    ok('login page shown when signed out', (await text(page)).includes('sign in'));
    await shot(page, '01-login');
    await login(page, ADMIN.user, 'wrong-password-x');
    await waitText(page, 'Invalid username or password');
    ok('wrong password shows an error', true);
    await login(page, ADMIN.user, ADMIN.pass);
    await waitText(page, 'Investigation dashboard');
    adminToken = await page.evaluate(() => JSON.parse(sessionStorage.getItem('cin.session')).token);
    await adminApi('DELETE', '/api/suspects/S0990?detach=true');   // leftover of an interrupted earlier run
    await page.waitForFunction(() => document.querySelectorAll('.tile-value').length === 6);
    await page.waitForNetworkIdle();
    const tiles = await page.$$eval('.tile', (t) => t.map((x) => x.innerText.replace(/\s+/g, ' ')));
    ok('dashboard tiles show live counts', tiles.join('|').includes('SUSPECTS 40') && tiles.join('|').includes('RELATIONSHIPS 240'), tiles.join(', '));
    ok('dashboard panels loaded', (await text(page)).includes('open leads') && (await page.$$('table')).length >= 4);
    await shot(page, '02-dashboard');

    // ---- graph explorer
    await page.goto(BASE + '#/graph?id=S001&depth=2', { waitUntil: 'networkidle0' });
    await page.waitForSelector('.graph-canvas canvas');
    await waitText(page, 'Suspect S001');
    const meta = await page.$eval('.graph-meta', (e) => e.innerText);
    ok('graph explorer renders S001 neighbourhood', /\d+ nodes/.test(meta), meta);
    ok('selected node details shown', (await text(page)).includes('connections ('));
    await clickText(page, 'button', 'Expand neighbours');
    await page.waitForNetworkIdle();
    ok('expand neighbours keeps graph', (await page.$eval('.graph-meta', (e) => e.innerText)) !== '');
    await page.click('.neighbours li .linkbtn');
    await sleep(300);
    ok('clicking a connection selects that node', !(await page.$eval('.explorer-side h2', (e) => e.innerText)).toUpperCase().includes('S001'));
    await shot(page, '03-graph-explorer');
    await page.goto(BASE + '#/graph?mode=overview', { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => /140 nodes/.test(document.querySelector('.graph-meta')?.innerText || ''));
    ok('whole network shows 140 nodes', true);
    await page.click('.filters summary');
    const boxes = await page.$$('.filters input[type=checkbox]');
    await boxes[1].click(); // Crime off
    await sleep(500);
    const after = await page.$eval('.graph-meta', (e) => e.innerText);
    ok('label filter hides crimes', after.startsWith('110 nodes'), after);
    await page.goto(BASE + '#/graph?id=S0404', { waitUntil: 'networkidle0' });
    await waitText(page, 'not found');
    ok('unknown node shows an error, not a spinner', true);

    // ---- records
    await page.goto(BASE + '#/records/suspects', { waitUntil: 'networkidle0' });
    await page.waitForSelector('table tbody tr');
    ok('suspect list paginated', (await text(page)).includes('1–15 of 40'));
    await fill(page, 'input[type=search]', 'ghost');
    await clickText(page, 'button', 'Search');
    await page.waitForFunction(() => document.body.innerText.includes('1–1 of 1'));
    ok('search finds S001 Ghost', (await text(page)).includes('s001'));
    await fill(page, 'input[type=search]', '');
    await clickText(page, 'button', 'Search');
    await page.select('.toolbar select', 'High');
    await page.waitForNetworkIdle();
    const high = await text(page);
    ok('risk filter applied', /of \d+/.test(high) && !high.includes('of 40'));
    await shot(page, '04-records');

    // create
    await clickText(page, 'button', 'New Suspect');
    const inputs = await page.$$('.form-grid input, .form-grid select');
    const set = async (i, v) => { const el = inputs[i]; const tag = await el.evaluate((e) => e.tagName); if (tag === 'SELECT') await el.select(v); else { await el.evaluate((e) => e.select()); await el.type(v); } };
    await clickText(page, 'button', 'Create Suspect');
    await waitText(page, 'suspect_id is required');
    ok('client-side validation blocks empty create', true);
    await set(0, 'S0990'); await set(1, 'Demo'); await set(2, 'Record'); await set(3, 'Tester');
    await clickText(page, 'button', 'Create Suspect');
    await waitText(page, 'Suspect S0990');
    ok('create suspect -> detail page', true);
    // edit
    await clickText(page, 'button', 'Edit');
    const riskSel = (await page.$$('.form-grid select'))[1];
    await riskSel.select('High');
    await clickText(page, 'button', 'Save changes');
    await page.waitForFunction(() => !document.querySelector('.form-grid') || !document.body.innerText.includes('Save changes'));
    await page.waitForNetworkIdle();
    ok('edit saved', (await text(page)).includes('high'));
    // relationship
    await clickText(page, 'button', 'Add relationship');
    await page.waitForSelector('.form-grid select');
    await (await page.$('.form-grid select')).select('KNOWS');
    const relInputs = await page.$$('.form-grid input');
    await relInputs[0].type('S001');
    await clickText(page, 'button', 'Create relationship');
    await page.waitForFunction(() => document.body.innerText.includes('—KNOWS→') || document.body.innerText.includes('←KNOWS—'));
    ok('relationship created and listed', (await text(page)).includes('s001'));
    await shot(page, '05-record-detail');
    // delete -> 409 -> detach
    await page.$$eval('.panel-actions .btn-danger-ghost', (b) => b[0].click());
    await page.click('.confirm .btn-danger');
    await waitText(page, 'still has 1 relationship');
    ok('delete with relationships refused (409) and explained', true);
    await clickText(page, 'button', 'Delete with relationships');
    await page.waitForFunction(() => location.hash === '#/records/suspects');
    ok('detach delete returns to list', true);

    // ---- analytics
    await page.goto(BASE + '#/analytics?tab=path', { waitUntil: 'networkidle0' });
    await clickText(page, 'button', 'Find path');
    await page.waitForSelector('.chain');
    ok('shortest path S002 -> S026 found', (await page.$eval('.chain', (e) => e.innerText)).includes('S026'));
    await shot(page, '06-shortest-path');
    const pinputs = await page.$$('form input');
    await pinputs[1].evaluate((e) => e.select()); await pinputs[1].type('S0404');
    await clickText(page, 'button', 'Find path');
    await waitText(page, 'not found');
    ok('unknown path end -> error message', true);

    await page.goto(BASE + '#/analytics?tab=gds', { waitUntil: 'networkidle0' });
    await waitText(page, 'GDS 2.');
    await clickText(page, 'button', 'Run algorithm');
    await waitText(page, 'communities among 40 suspects', 20000);
    ok('Louvain communities rendered', (await page.$$('.community')).length > 1);
    await shot(page, '07-louvain');
    await clickText(page, 'button', 'Betweenness');
    await clickText(page, 'button', 'Run algorithm');
    await waitText(page, 'Betweenness centrality', 20000);
    ok('betweenness ranking rendered', (await page.$$('table tbody tr')).length >= 10);
    await shot(page, '08-betweenness');

    await page.goto(BASE + '#/analytics?tab=queries', { waitUntil: 'networkidle0' });
    await page.waitForSelector('.query-list button');
    await clickText(page, 'button', 'Run query');
    await waitText(page, '1 row');
    ok('Q1 runs from the query library', (await text(page)).includes('ghost'));
    const qin = await page.$('.query-run input');
    await qin.evaluate((e) => e.select()); await qin.type("x' OR 1=1");
    await clickText(page, 'button', 'Run query');
    await waitText(page, 'suspect_id must be');
    ok('invalid query parameter rejected client-side', true);
    await shot(page, '09-query-library');

    // ---- users (admin)
    await page.goto(BASE + '#/users', { waitUntil: 'networkidle0' });
    await waitText(page, ADMIN.user);
    ok('users page lists accounts', true);

    // ---- viewer: register, sign in, read-only
    await page.evaluate(() => sessionStorage.clear());
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    await page.reload({ waitUntil: 'networkidle0' });
    await clickText(page, 'button', 'No account? Register (read-only access)');
    await fill(page, 'input[autocomplete="username"]', VIEWER.user);
    await fill(page, 'input[type="password"]', VIEWER.pass);
    await clickText(page, 'button', 'Register');
    await waitText(page, 'Account created with the viewer role');
    ok('self-registration creates a viewer', true);
    await clickText(page, 'button', 'Sign in');
    await waitText(page, 'Investigation dashboard');
    await page.goto(BASE + '#/records/suspects/S001', { waitUntil: 'networkidle0' });
    await waitText(page, 'Suspect S001');
    const vt = await text(page);
    ok('viewer sees no create/edit/delete controls', !vt.includes('new suspect') && !/\bedit\b/.test(vt) && !vt.includes('delete'));
    ok('viewer has no Users menu', !(await page.$$eval('.mainnav a', (a) => a.map((x) => x.innerText))).includes('Users'));
    const forced = await page.evaluate(async () => {
      const s = JSON.parse(sessionStorage.getItem('cin.session'));
      const r = await fetch('/api/suspects/S001?detach=true', { method: 'DELETE', headers: { Authorization: `Bearer ${s.token}` } });
      return r.status;
    });
    ok('server refuses a forced DELETE from a viewer (403)', forced === 403, String(forced));

    // ---- mobile layout
    await page.setViewport({ width: 390, height: 844, isMobile: true });
    await page.goto(BASE + '#/dashboard', { waitUntil: 'networkidle0' });
    await page.waitForSelector('.tile');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok('no horizontal scroll at 390px', overflow <= 0, `overflow ${overflow}px`);
    await shot(page, '10-mobile-dashboard');
    await clickText(page, 'button', 'Menu');
    await clickText(page, 'button', 'Sign out');
    await waitText(page, 'Sign in');
    ok('sign out returns to login', true);
  } catch (e) {
    ok('scenario completed', false, e.message);
    await shot(page, 'zz-failure');
  }
  if (adminToken) ok('test viewer account removed', [200, 404].includes(await adminApi('DELETE', `/api/auth/users/${VIEWER.user}`)));
  ok('no browser console errors / page errors', problems.length === 0, problems.join(' | '));
  console.log(results.join('\n'));
  console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} passed, ${results.filter((r) => r.startsWith('FAIL')).length} failed`);
  await browser.close();
})();
