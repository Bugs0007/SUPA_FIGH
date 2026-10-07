// Records one trailer shot: node scripts/trailer/record.mjs <shotId> [--scale 2] [--out dir] [--every N] [--png]
// Renders the game at (1920x1080 * scale) frame by frame (deterministic, see src/trailer/driver.ts),
// downscales to 1920x1080 and pipes the frames into ffmpeg (a near-lossless H.264 intermediate).
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--'));
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
};
if (!id) throw new Error('usage: record.mjs <shotId> [--scale 2] [--out dir] [--every N] [--url http://localhost:5199]');
const scale = Number(opt('scale', 2));
const outDir = path.resolve(opt('out', 'trailer/work'));
const every = Number(opt('every', 0)); // >0: only dump a PNG every N frames (previews), no video
const base = opt('url', 'http://localhost:5199');
const W = 1920;
const H = 1080;
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  channel: process.env.PW_EXECUTABLE ? undefined : 'msedge',
  executablePath: process.env.PW_EXECUTABLE || undefined,
  args: ['--autoplay-policy=no-user-gesture-required', '--disable-gpu-vsync', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: W * scale, height: H * scale }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
page.on('console', (m) => (m.type() === 'error' ? console.error('console.error', m.text()) : null));
await page.goto(`${base}/?scene=match&trailer=1&shot=${id}&timer=1`);
await page.waitForFunction(() => window.__TRAILER__ && window.__TRAILER__.ready(), null, { timeout: 60000 });
const info = await page.evaluate(() => window.__TRAILER__.info());
const size = await page.evaluate(() => window.__TRAILER__.canvasSize());
console.log(`shot ${id}: ${info.frames} frames, warm-up ${info.start} ticks, canvas ${size.join('x')}`);
await page.evaluate(() => window.__TRAILER__.begin());

let enc = null;
let encDone = null;
if (!every) {
  const file = path.join(outDir, `${id}.mkv`);
  enc = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '60', '-c:v', 'png', '-i', '-', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '0', '-pix_fmt', 'yuv444p', '-r', '60', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  encDone = new Promise((res) => enc.on('close', res));
}
const t0 = Date.now();
for (let i = 0; i < info.frames; i++) {
  await page.evaluate(() => window.__TRAILER__.step());
  if (every && i % every !== 0 && i !== info.frames - 1) continue;
  const url = await page.evaluate(([w, h]) => window.__TRAILER__.capture(w, h), [W, H]);
  const buf = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  if (every) fs.writeFileSync(path.join(outDir, `${id}_${String(i).padStart(4, '0')}.png`), buf);
  else enc.stdin.write(buf);
  if (i % 60 === 0) console.log(`  frame ${i}/${info.frames}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
if (enc) {
  enc.stdin.end();
  await encDone;
}
const audio = await page.evaluate(() => window.__TRAILER__.audioLog());
const events = await page.evaluate(() => window.__TRAILER__.events());
fs.writeFileSync(path.join(outDir, `${id}.events.json`), JSON.stringify(events));
console.log(events.slice(0, 40).map((e) => `  vf${String(e.vf).padStart(4)} t${e.tick} ${e.what}`).join(String.fromCharCode(10)));
fs.writeFileSync(path.join(outDir, `${id}.audio.json`), JSON.stringify(audio));
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s, ${audio.length} sounds logged`);
await browser.close();
