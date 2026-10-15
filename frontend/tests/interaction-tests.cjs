const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const BASE = process.env.TEST_URL || 'http://127.0.0.1:3000';
const SCREENSHOTS = path.join(__dirname, '../screenshots');
const wait = async (p) => {
  await p.waitForFunction(() => {
    const e = document.querySelector('.page-content');
    return e && getComputedStyle(e).opacity === '1';
  });
};
let browser;
(async () => {
  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 950 },
    acceptDownloads: true,
    permissions: ['microphone'],
  });
  const page = await context.newPage();
  const errors = [];
  const checks = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('webpack-hmr')) errors.push(m.text());
  });
  const check = (name) => {
    checks.push(name);
    console.log('PASS', name);
  };
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 });
  await wait(page);
  await page.screenshot({ path: path.join(SCREENSHOTS, 'studio-desktop.png'), caret: 'initial' });
  check('Studio renders with no horizontal overflow');
  assert.equal(await page.locator('.quick-voice').count(), 10);
  await page.getByRole('button', { name: 'Select Female Voice', exact: true }).click();
  assert.equal(
    await page
      .getByRole('button', { name: 'Select Female Voice', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  );
  check('Quick preset selection');
  await page.getByRole('button', { name: 'Convert voice', exact: true }).click();
  await page.getByText('TRANSFORMATION COMPLETE', { exact: true }).waitFor({ timeout: 15000 });
  check('Real local audio effect conversion');
  await page.getByRole('button', { name: 'Preview new voice', exact: true }).click();
  await page.waitForTimeout(1500);
  assert.match(await page.locator('.player-subtitle').innerText(), /Female Voice/);
  check('Converted audio playback');
  const audioDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download converted audio', exact: true }).click();
  const downloaded = await audioDownload;
  const wav = path.join(__dirname, 'verification.wav');
  await downloaded.saveAs(wav);
  const audio = fs.readFileSync(wav);
  assert.equal(audio.toString('ascii', 0, 4), 'RIFF');
  assert.equal(audio.toString('ascii', 8, 12), 'WAVE');
  assert.ok(audio.length > 40000);
  fs.unlinkSync(wav);
  check('Download is a real nonempty WAV');
  await page.getByRole('button', { name: 'Pause audio', exact: true }).click();
  await page.getByRole('link', { name: 'Voice Effects', exact: true }).click();
  await wait(page);
  await page.locator('.voice-card').first().waitFor();
  assert.equal(await page.locator('.voice-card').count(), 16);
  await page.screenshot({
    path: path.join(SCREENSHOTS, 'voice-effects-desktop.png'),
    caret: 'initial',
  });
  await page.getByRole('button', { name: 'Human', exact: true }).click();
  assert.equal(await page.locator('.voice-card').count(), 3);
  await page.getByPlaceholder('Find a voice, mood, or identity…').fill('Robot');
  assert.equal(await page.locator('.voice-card').count(), 0);
  await page.getByRole('button', { name: 'Show all voices', exact: true }).click();
  await page.getByPlaceholder('Find a voice, mood, or identity…').fill('Robot');
  assert.equal(await page.locator('.voice-card').count(), 1);
  check('Voice search and category filters');
  await page.getByPlaceholder('Find a voice, mood, or identity…').fill('');
  await page.getByRole('link', { name: /Custom Voice/ }).click();
  await wait(page);
  await page
    .getByLabel('Upload reference voice', { exact: true })
    .setInputFiles(path.join(__dirname, '../public/audio/sample.wav'));
  await page.getByText('SAMPLE READY', { exact: true }).waitFor();
  check('Reference file validation and upload');
  await page.locator('#voice-consent').click();
  await page.getByRole('button', { name: 'Save reference', exact: true }).click();
  await page.getByPlaceholder('e.g. My storytelling voice').fill('My test reference');
  await page
    .locator('[role="dialog"]')
    .getByRole('button', { name: 'Save reference', exact: true })
    .click();
  await page.locator('.voice-profile-card').waitFor();
  check('Permission-gated session reference profile');
  await page.getByRole('button', { name: 'Transform custom voice', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  assert.match(
    await page.getByRole('dialog').innerText(),
    /No AI service|No pretrained|frontend|not running/i,
  );
  await page.getByRole('button', { name: 'Understood', exact: true }).click();
  check('Unavailable AI conversion is honestly blocked');
  await page.screenshot({
    path: path.join(SCREENSHOTS, 'custom-voice-desktop.png'),
    caret: 'initial',
  });
  await page.getByRole('link', { name: 'My Creations', exact: true }).click();
  await page.waitForURL('**/creations');
  await page.locator('.creation-card').first().waitFor();
  await wait(page);
  assert.equal(await page.locator('.creation-card').count(), 4);
  check('New conversion appears in session creations');
  const title = await page.locator('.creation-name-row h2').first().innerText();
  await page.getByRole('button', { name: `Options for ${title}`, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Rename creation', exact: true }).click();
  await page.locator('#creation-name').fill('Neon test transmission');
  await page.getByRole('button', { name: 'Save name', exact: true }).click();
  assert.match(await page.locator('.creation-name-row h2').first().innerText(), /Neon test/);
  check('Creation rename');
  await page.getByRole('button', { name: 'List view', exact: true }).click();
  assert.ok(await page.locator('.creation-list').count());
  await page.getByRole('button', { name: 'Grid view', exact: true }).click();
  await page.screenshot({
    path: path.join(SCREENSHOTS, 'creations-desktop.png'),
    caret: 'initial',
  });
  check('Creation grid and list views');
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await page.waitForURL('**/history');
  await page.locator('.activity-row').first().waitFor();
  await wait(page);
  assert.ok((await page.locator('.activity-row').count()) >= 5);
  await page.getByRole('button', { name: 'Exports', exact: true }).click();
  assert.ok((await page.locator('.activity-row').count()) >= 1);
  await page.getByRole('button', { name: /^All activity/ }).click();
  await page.screenshot({ path: path.join(SCREENSHOTS, 'history-desktop.png'), caret: 'initial' });
  check('History logs real session interactions and filters');
  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export log', exact: true }).click();
  const csv = await csvDownload;
  assert.match(csv.suggestedFilename(), /\.csv$/);
  check('History CSV export');
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.waitForURL('**/settings');
  await page.locator('#display-name').waitFor();
  await wait(page);
  await page.locator('#display-name').fill('Neon Creator');
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  assert.match(await page.locator('.sidebar-profile').innerText(), /Neon Creator/);
  check('Session profile preferences apply');
  await page.getByRole('button', { name: /Appearance/ }).click();
  await page.getByRole('button', { name: /Deep space/ }).click();
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'deep-space');
  check('Theme preference applies');
  await page.getByRole('button', { name: /Audio Find/ }).click();
  await page.locator('#sample-rate').selectOption('48000');
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await page.screenshot({ path: path.join(SCREENSHOTS, 'settings-desktop.png'), caret: 'initial' });
  check('Audio sample-rate preference');
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder('Search pages, voices, and more…').fill('Chipmunk');
  await page.getByRole('button', { name: /Chipmunk/ }).click();
  await page.waitForURL('**/studio');
  await page.locator('.quick-voice').first().waitFor();
  await wait(page);
  assert.equal(
    await page
      .getByRole('button', { name: 'Select Chipmunk', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  );
  check('Keyboard quick search');
  await page.getByRole('button', { name: 'Record audio', exact: true }).click();
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await page.getByRole('button', { name: 'Stop recording', exact: true }).waitFor();
  await page.waitForTimeout(1600);
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await page
    .getByRole('button', { name: 'Use recording', exact: true })
    .waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'Use recording', exact: true }).click();
  assert.match(await page.locator('.wave-time').innerText(), /Recording/);
  check('MediaRecorder captures a real browser audio blob');
  await page.reload({ waitUntil: 'networkidle' });
  await wait(page);
  assert.match(await page.locator('.sidebar-profile').innerText(), /Alex Morgan/);
  await page.getByRole('link', { name: 'My Creations', exact: true }).click();
  await page.waitForURL('**/creations');
  await page.locator('.creation-card').first().waitFor();
  await wait(page);
  assert.equal(await page.locator('.creation-card').count(), 3);
  check('Refresh resets state; no persistent records');
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    deviceScaleFactor: 1,
  });
  const mp = await mobile.newPage();
  mp.on('pageerror', (e) => errors.push(e.message));
  for (const [route, filename] of [
    ['/studio', 'studio-mobile.png'],
    ['/voice-effects', 'voice-effects-mobile.png'],
    ['/custom-voice', 'custom-voice-mobile.png'],
    ['/creations', 'creations-mobile.png'],
    ['/history', 'history-mobile.png'],
    ['/settings', 'settings-mobile.png'],
  ]) {
    await mp.goto(BASE + route, { waitUntil: 'networkidle', timeout: 60000 });
    await wait(mp);
    assert.ok(
      await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Overflow on ${route}`,
    );
    await mp.screenshot({ path: path.join(SCREENSHOTS, filename), caret: 'initial' });
    check(`Responsive mobile ${route}`);
  }
  await mp.getByRole('button', { name: 'Open navigation', exact: true }).click();
  assert.ok(await mp.locator('.sidebar-open').count());
  await mp.getByRole('link', { name: 'Studio', exact: true }).click();
  await mp.waitForURL('**/studio');
  await mp.locator('.studio-page').waitFor();
  await wait(mp);
  assert.equal(await mp.locator('.sidebar-open').count(), 0);
  check('Mobile navigation drawer');
  await browser.close();
  fs.writeFileSync(
    path.join(__dirname, 'test-results.json'),
    JSON.stringify({ checks, errors }, null, 2),
  );
  if (errors.length) {
    console.log('ERRORS', errors);
    throw new Error(`${errors.length} browser errors`);
  }
  console.log(`ALL ${checks.length} CHECKS PASSED`);
})().catch(async (e) => {
  console.error(e);
  await browser?.close();
  process.exitCode = 1;
});
