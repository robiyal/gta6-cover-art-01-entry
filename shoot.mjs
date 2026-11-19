// Takes Neon Vice's screenshots with local Chromium (Playwright).
// Serves app/ with serve.ts on :8080, waits for window.__shotReady, then
// captures 4 JPEGs into screenshots/. Also clicks Export once and checks the
// downloaded PNG really is the size the app promises.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { statSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/home/hatch/workspace/playwright-automation/package.json');
const { chromium } = require('playwright');

const here = dirname(fileURLToPath(import.meta.url));
const shotsDir = join(here, 'screenshots');
const CHROME = '/home/hatch/.cache/ms-playwright/chromium-1148/chrome-linux/chrome';
const BASE = 'http://localhost:8080';

mkdirSync(shotsDir, { recursive: true });

const server = spawn('node', ['serve.ts', '--port', '8080'], { cwd: here, stdio: 'ignore' });
async function waitForServer(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${BASE}/index.html`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('serve.ts did not answer on :8080');
}

function pngSize(buf) {
  if (buf.length < 33 || buf.toString('ascii', 1, 4) !== 'PNG') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const jobs = [
  {
    name: '1-cover.jpg',
    url: '/?shot=cover&photo=pier&photo2=boulevard&caption=NEON%20VICE&sub=VICE%20CITY%20NIGHTS&grade=neon&layout=spotlight5&size=1080x1080&poster=1&tagline=EVERY%20NIGHT%20HAS%20A%20STORY&stars=5&labels=THE%20ANGLER%2CTHE%20DRIVER%2CTHE%20CAPTAIN%2CTHE%20RUNNER%2CTHE%20FIXER',
    viewport: { width: 1080, height: 1080 },
  },
  {
    name: '2-editor.jpg',
    url: '/?shot=editor&photo=pier&caption=NEON%20VICE&sub=VICE%20CITY%20NIGHTS&grade=neon&layout=spotlight5&size=1080x1080',
    viewport: { width: 1280, height: 900 },
  },
  {
    name: '3-cover-tall.jpg',
    url: '/?shot=cover&photo=boulevard&photo2=pier&caption=BOULEVARD%20QUEEN&sub=VICE%20CITY%20NIGHTS&grade=sunset&layout=hero&size=1080x1350',
    viewport: { width: 1024, height: 1280 },
  },
  {
    name: '4-cover-wide.jpg',
    url: '/?shot=cover&photo=pier&photo2=boulevard&panels=pier,boulevard,boulevard,pier&caption=MIDNIGHT%20RUN&sub=VICE%20CITY%20NIGHTS&grade=vice&layout=quad&size=1920x1080',
    viewport: { width: 1280, height: 720 },
  },
];

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  // Optional filter: `node shoot.mjs 4-cover-wide.jpg` re-takes one shot.
  const only = process.argv[2];
  const jobsToRun = only ? jobs.filter((j) => j.name === only) : jobs;
  if (only && !jobsToRun.length) throw new Error(`no shot named ${only}`);

  for (const job of jobsToRun) {
    await page.setViewportSize(job.viewport);
    await page.goto(BASE + job.url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 15000 });
    await page.waitForTimeout(250);
    const out = join(shotsDir, job.name);
    await page.screenshot({ path: out, type: 'jpeg', quality: 80 });
    const bytes = statSync(out).size;
    console.log(`${job.name}: ${bytes} bytes${bytes > 262144 ? '  <-- OVER 256 KiB!' : ''}`);
  }

  // Real export test: editor mode, click Export, read the downloaded PNG.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE}/?shot=editor&photo=pier&caption=NEON%20VICE`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 15000 });
  const download = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }),
    page.click('#export'),
  ]).then(([d]) => d).catch(() => null);
  if (download) {
    const tmp = join(here, 'out-test-export.png');
    await download.saveAs(tmp);
    const size = pngSize(readFileSync(tmp));
    console.log(`export download: ${statSync(tmp).size} bytes, PNG ${size ? `${size.w}x${size.h}` : 'unreadable'}`);
  } else {
    console.log('export download: NO DOWNLOAD CAPTURED');
  }

  console.log(errors.length ? `page errors:\n${errors.join('\n')}` : 'page errors: none');
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log('done');
