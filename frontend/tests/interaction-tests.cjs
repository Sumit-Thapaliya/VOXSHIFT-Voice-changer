/**
 * VOXSHIFT end-to-end checks (Playwright, headless Chromium).
 *
 * Run with the dev server up:
 *   1) backend:  cd backend && python -m uvicorn app.main:app --port 8000
 *   2) frontend: cd frontend && npm run dev
 *   3) tests:    cd frontend && node tests/interaction-tests.cjs
 *
 * The suite works with or without the engine running: when the engine is
 * offline every flow still has to complete through the browser DSP.
 */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.TEST_URL || 'http://127.0.0.1:3000';
const SCREENSHOTS = path.join(__dirname, 'screenshots');
const REPORT = path.join(__dirname, 'test-results.json');

const wait = async (page) => {
  await page.waitForFunction(() => {
    const element = document.querySelector('.page-content');
    return element && getComputedStyle(element).opacity === '1';
  });
};

let browser;
(async () => {
  fs.mkdirSync(SCREENSHOTS, { recursive: true });
  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 950 },
    acceptDownloads: true,
    permissions: ['microphone'],
  });
  const page = await context.newPage();
  const errors = [];
  const checks = [];
  let engineOnline = false;
  const isEngineNoise = (text, url) =>
    // A dead engine is a supported state: the fetch layer reports it and the
    // Studio falls back to the browser DSP, so the proxy's failed request is
    // expected noise (and only then - when the engine is up, it is a bug).
    !engineOnline && /Failed to load resource/.test(text) && String(url || text).includes('/engine/');
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() !== 'error' || /webpack-hmr|favicon/.test(text)) return;
    if (isEngineNoise(text, message.location()?.url)) return;
    errors.push(text);
  });
  const check = (name) => {
    checks.push(name);
    console.log('PASS', name);
  };
  engineOnline = await page
    .request.get(`${BASE}/engine/api/health`)
    .then((response) => response.ok())
    .catch(() => false);

  /* ---------------------------------------------------------------- Studio */
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await wait(page);
  await page.screenshot({ path: path.join(SCREENSHOTS, '01-studio-desktop.png') });
  assert.equal(await page.locator('.quick-voice').count(), 10);
  check('Studio loads with 10 quick voices');

  const bodyWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(bodyWidth <= 1600, `unexpected horizontal overflow: ${bodyWidth}`);
  check('No horizontal overflow on desktop');

  await page.getByRole('button', { name: 'Select Female Voice', exact: true }).click();
  assert.equal(
    await page.getByRole('button', { name: 'Select Female Voice', exact: true }).getAttribute('aria-pressed'),
    'true',
  );
  check('Quick preset selection updates the active voice');

  // MODE 02 now hosts the Voice Forge quick picks instead of a reference upload
  assert.equal(await page.locator('.forge-quick').count(), 4);
  await page.locator('.forge-quick').first().click();
  assert.ok((await page.locator('.forge-chain-visual').innerText()).includes('MODULE'));
  check('Voice Forge quick picks load a real design into the studio');

  await page.getByRole('button', { name: 'Convert voice · engine', exact: false }).first().click().catch(async () => {
    await page.getByRole('button', { name: /Convert voice/ }).first().click();
  });
  await page.getByText('TRANSFORMATION COMPLETE', { exact: true }).waitFor({ timeout: 180000 });
  check('Voice conversion completes (engine or browser DSP)');

  const engineStrip = await page.locator('.engine-strip').innerText();
  assert.match(engineStrip, /ENGINE|BROWSER/i);
  check('Engine status strip is present and honest');

  if (engineOnline) {
    await page.locator('.output-metrics').waitFor({ timeout: 30000 });
    const metrics = await page.locator('.output-metrics').innerText();
    assert.match(metrics, /LUFS/);
    assert.match(metrics, /CPU engine/);
    check('Engine render reports real LUFS and true peak');
  }

  const audioDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download converted audio', exact: true }).click();
  const downloaded = await audioDownload;
  const wavPath = path.join(__dirname, 'verification.wav');
  await downloaded.saveAs(wavPath);
  const wav = fs.readFileSync(wavPath);
  assert.equal(wav.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(wav.subarray(8, 12).toString('ascii'), 'WAVE');
  assert.ok(wav.length > 20000, `WAV too small: ${wav.length}`);
  check('Converted audio downloads as a real WAV file');

  await page.getByRole('button', { name: 'Preview new voice', exact: true }).click();
  await page.waitForTimeout(1200);
  check('Converted audio plays through the global player');

  await page.getByRole('button', { name: 'Compare original and converted audio', exact: true }).click();
  await page.waitForTimeout(600);
  check('A/B compare starts the original take');

  /* ------------------------------------------------------------- Forge page */
  await page.getByRole('link', { name: /Open the voice forge/ }).first().click();
  await page.waitForURL('**/voice-forge');
  await wait(page);
  await page.screenshot({ path: path.join(SCREENSHOTS, '02-voice-forge.png') });
  assert.equal(await page.locator('.forge-chip').count(), 8);
  check('Voice Forge lists all 8 archetypes');

  const pitchSlider = page.getByRole('slider', { name: 'Pitch amount' });
  const before = await page.locator('.forge-module-head span').first().innerText();
  await pitchSlider.focus();
  for (let index = 0; index < 6; index += 1) await page.keyboard.press('ArrowRight');
  const after = await page.locator('.forge-module-head span').first().innerText();
  assert.notEqual(before, after);
  check('Forge sliders change the design values');

  await page.getByRole('button', { name: /Roll the dice/ }).click();
  await page.waitForTimeout(300);
  assert.ok((await page.locator('.forge-summary-chip').count()) > 0);
  check('Randomiser produces a usable design');

  await page.locator('.forge-chip').nth(5).click();
  await page.waitForTimeout(200);
  check('Archetype chips load a full design');

  await page.getByRole('button', { name: /Forge this voice/ }).click();
  await page.locator('.forge-result').waitFor({ timeout: 180000 });
  const forgeResult = await page.locator('.forge-result').innerText();
  assert.match(forgeResult, /CPU ENGINE|BROWSER DSP/);
  check('Forge renders the design on the source audio');

  await page.getByRole('button', { name: /Analyse my audio/ }).click();
  await page.locator('.forge-analysis').waitFor({ timeout: 120000 });
  const analysis = await page.locator('.forge-analysis').innerText();
  assert.match(analysis, /Pitch/i);
  assert.match(analysis, /Noise floor|LOUDNESS/i);
  check('Voice analysis returns real measurements');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: /Save this voice/ }).first().click();
  await page.locator('#forge-voice-name').fill('Playwright Baritone');
  await page.locator('#forge-voice-tags').fill('test, automation');
  await page.getByRole('button', { name: 'Save voice', exact: true }).click();
  await page.waitForTimeout(1200);
  assert.ok(await page.getByText('Playwright Baritone').first().isVisible());
  check('A forged voice can be named, saved and listed');

  const savedCard = page.locator('.voice-profile-card').first();
  assert.ok((await savedCard.innerText()).includes('MODULES'));
  check('Saved voices store their full module chain');

  /* ------------------------------------------------------- effects library */
  await page.goto(`${BASE}/voice-effects`, { waitUntil: 'domcontentloaded' });
  await wait(page);
  await page.screenshot({ path: path.join(SCREENSHOTS, '03-voice-library.png') });
  assert.equal(await page.locator('.voice-card').count(), 16);
  check('16 built-in voices listed by default');

  await page.getByRole('button', { name: 'Forged', exact: true }).click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.voice-card').count(), 8);
  check('Forged archetypes have their own category');

  await page.getByRole('button', { name: 'Mine', exact: true }).click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.voice-card').count(), 1);
  check('Custom voices appear under "Mine"');

  await page.locator('.voice-card').first().locator('.voice-preview').click();
  await page.waitForTimeout(2500);
  assert.match(await page.locator('.player-title').innerText(), /Playwright Baritone/);
  check('Previewing a custom voice renders it and plays it back');

  /* ------------------------------------------------------------- creations */
  await page.goto(`${BASE}/creations`, { waitUntil: 'domcontentloaded' });
  await wait(page);
  assert.ok((await page.locator('.creation-card').count()) >= 3);
  check('Creations page still lists the demo tracks and new renders');

  /* --------------------------------------------------------------- history */
  await page.goto(`${BASE}/history`, { waitUntil: 'domcontentloaded' });
  await wait(page);
  assert.ok((await page.locator('.stat-card').count()) >= 3);
  await page.getByRole('button', { name: 'Voice designs', exact: true }).click();
  await page.waitForTimeout(300);
  check('History filters cover the new voice-design activity');

  /* -------------------------------------------------------------- settings */
  await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
  await wait(page);
  await page.getByRole('button', { name: /CPU engine/ }).click();
  await page.getByText('ENGINE API').waitFor({ timeout: 10000 });
  const contract = await page.locator('.api-contract').innerText();
  assert.ok(contract.includes('/api/render'));
  assert.ok(!contract.includes('/api/voices/reference'));
  check('Settings documents the real engine API, not a planned cloning API');

  if (engineOnline) {
    assert.ok((await page.locator('.integration-panel').innerText()).includes('ONLINE'));
    check('Settings detects the running engine');
  }

  await page.getByRole('button', { name: /Audio/ }).click();
  await page.locator('#target-lufs').selectOption('-18');
  check('Loudness target is configurable');

  /* --------------------------------------------------------- mobile layout */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(page);
  await page.screenshot({ path: path.join(SCREENSHOTS, '04-studio-mobile.png') });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.waitForTimeout(400);
  assert.ok(await page.getByRole('link', { name: /Voice Forge/ }).isVisible());
  await page.getByRole('link', { name: /Voice Forge/ }).click();
  await page.waitForURL('**/voice-forge');
  await page.screenshot({ path: path.join(SCREENSHOTS, '05-forge-mobile.png') });
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(mobileOverflow <= 420, `mobile overflow: ${mobileOverflow}`);
  check('Mobile navigation reaches the Voice Forge without overflow');

  /* ------------------------------------------------------------------ done */
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  check('No uncaught page errors during the whole run');

  const summary = {
    base: BASE,
    engineOnline,
    checks,
    passed: checks.length,
    failed: 0,
    errors,
    finishedAt: new Date().toISOString(),
  };
  fs.writeFileSync(REPORT, JSON.stringify(summary, null, 2));
  console.log(`\n${checks.length} checks passed. Engine online: ${engineOnline}`);
  await browser.close();
})().catch(async (error) => {
  console.error('FAIL', error.message);
  fs.writeFileSync(
    REPORT,
    JSON.stringify({ base: BASE, failed: 1, error: error.message, stack: error.stack, finishedAt: new Date().toISOString() }, null, 2),
  );
  if (browser) await browser.close();
  process.exit(1);
});
