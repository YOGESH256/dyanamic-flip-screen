// End-to-end smoke test. Needs: dev server running (npm run dev), Google Chrome installed, ffmpeg on PATH.
// Run: npm run test:e2e
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const S = process.env.E2E_TMP ?? fs.mkdtempSync(path.join(os.tmpdir(), 'dynamic-flip-'));
const BASE = process.env.E2E_URL ?? 'http://localhost:5173/';
if (!fs.existsSync(`${S}/test.mp4`)) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=8', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', '-vf', "drawbox=x='100+t*120':y=200:w=160:h=320:color=red@0.9:t=fill", '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', `${S}/test.mp4`]);
}
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(BASE);
await page.setInputFiles('#fileInput', `${S}/test.mp4`);
await page.waitForFunction(() => document.getElementById('app').dataset.state === 'ready', null, { timeout: 15000 });
console.log('hint:', await page.textContent('#pathHint'));
await page.screenshot({ path: `${S}/01-loaded.png` });

// Initial box geometry
const box0 = await page.evaluate(() => document.getElementById('cropMeta').textContent);
console.log('box0:', box0);

// Drag the crop box left by 200px while paused (no keyframes yet, so no keyframe edit)
const bb = await page.locator('.cropbox').boundingBox();
await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
await page.mouse.down();
await page.mouse.move(bb.x + bb.width / 2 - 200, bb.y + bb.height / 2, { steps: 10 });
await page.mouse.up();
console.log('box after drag:', await page.textContent('#cropMeta'));

// Resize from SE handle
const bb2 = await page.locator('.cropbox').boundingBox();
await page.mouse.move(bb2.x + bb2.width - 2, bb2.y + bb2.height - 2);
await page.mouse.down();
await page.mouse.move(bb2.x + bb2.width - 2 - 60, bb2.y + bb2.height - 2 - 100, { steps: 8 });
await page.mouse.up();
console.log('box after resize:', await page.textContent('#cropMeta'));

// Record: press record (starts playback), sweep box right over ~3 seconds, stop
await page.click('#record');
await page.waitForTimeout(300);
const bb3 = await page.locator('.cropbox').boundingBox();
await page.mouse.move(bb3.x + bb3.width / 2, bb3.y + bb3.height / 2);
await page.mouse.down();
for (let i = 1; i <= 30; i++) {
  await page.mouse.move(bb3.x + bb3.width / 2 + i * 12, bb3.y + bb3.height / 2, { steps: 2 });
  await page.waitForTimeout(100);
}
await page.mouse.up();
await page.click('#record');
assert.ok((await page.textContent('#kfMeta')).match(/^(\d+) keyframes$/) && Number(RegExp.$1) > 30, 'expected >30 keyframes');
console.log('after record:', await page.textContent('#pathHint'), '|', await page.textContent('#kfMeta'));
await page.screenshot({ path: `${S}/02-recorded.png` });

const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#downloadJson')]);
const jsonPath = `${S}/session.json`;
await dl.saveAs(jsonPath);
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
console.log('json keyframes:', data.length, 'first:', JSON.stringify(data[0]), 'last:', JSON.stringify(data[data.length - 1]));

// Seek to middle and confirm box follows path
await page.evaluate(() => { const v = document.getElementById('video'); v.pause(); v.currentTime = 1.5; });
await page.waitForTimeout(400);
console.log('box at t=1.5:', await page.textContent('#cropMeta'));

// Export
await page.click('#export');
const t0 = Date.now();
await page.waitForFunction(() => !document.getElementById('exportResult').hidden || document.querySelector('.toast.error'), null, { timeout: 120000 });
const toast = await page.textContent('.toast');
assert.ok(!(await page.$('.toast.error')), 'export failed: ' + toast);
console.log('export:', toast, `(${((Date.now() - t0) / 1000).toFixed(1)}s wall)`);
const href = await page.getAttribute('#exportDownload', 'href');
if (href && href.startsWith('blob:')) {
  const b64 = await page.evaluate(async (u) => {
    const b = await fetch(u).then((r) => r.blob());
    const buf = new Uint8Array(await b.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  }, href);
  fs.writeFileSync(`${S}/out.mp4`, Buffer.from(b64, 'base64'));
  console.log('saved out.mp4', fs.statSync(`${S}/out.mp4`).size, 'bytes');
}
await page.screenshot({ path: `${S}/03-exported.png` });

// Replay tab
await page.click('.tab[data-tab="replay"]');
console.log('replay hint:', await page.textContent('#pathHint'));
await page.evaluate(() => document.getElementById('video').play());
await page.waitForTimeout(1500);
console.log('replay box @', await page.evaluate(() => document.getElementById('video').currentTime.toFixed(2)), await page.textContent('#cropMeta'));

// Import JSON round trip
await page.click('.tab[data-tab="edit"]');
await page.click('#clearPath');
await page.setInputFiles('#jsonInput', jsonPath);
await page.waitForTimeout(300);
console.log('import:', await page.textContent('.toast'), '|', await page.textContent('#kfMeta'));

console.log('errors:', errors.length ? errors : 'none');
assert.equal(errors.length, 0, 'page had console errors');
console.log('PASS');
await browser.close();
