import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { cut } from './campaign.mjs';
const ids = process.argv.slice(2).filter(a => !a.startsWith('--'));
const preview = process.argv.includes('--preview');
const base = process.env.TRAILER_SOURCE || 'https://brawlkai.vercel.app';
const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, ''));
fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
fs.mkdirSync(path.join(root, 'work'), { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'] });
try {
for (const shot of cut.filter(s => !ids.length || ids.includes(s.id))) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const params = new URLSearchParams({ scene: 'match', trailer: '1', timer: '1' });
  if (shot.source) params.set('shot', shot.source);
  else {
    params.set('map', shot.overrides.map);
    params.set('seed', String(shot.overrides.seed));
    params.set('heroes', shot.overrides.heroes.join(','));
    params.set('powers', shot.overrides.powers ? '1' : '0');
  }
  await page.goto(`${base}/?${params}`);
  await page.waitForFunction(() => window.__TRAILER__?.ready(), null, { timeout: 60000 });
  await page.evaluate(shot => {
    const h = window.__GAME__;
    h.game.loop.stop();
    const scene = h.game.scene.getScene('match');
    const rig = scene.trailer;
    Object.assign(rig.spec, shot.overrides, { frames: shot.frames });
    // Remove the old trailer's baked captions and world labels from this take only.
    const hud = h.game.scene.getScene('trailerHud');
    hud.items.forEach(item => { item.main.destroy(); item.shadow.destroy(); });
    hud.items = [];
    scene.wr.floats.forEach(item => item.obj.destroy());
    scene.wr.floats = [];
    scene.wr.floatText = () => {};
    if (shot.source) {
      // Film-set reset only: start each take from the prescribed costume and placement.
      scene.match.world.fighters.forEach(f => { f.power = ''; f.powerLevel = 0; f.formHp = 0; f.specialCd = 0; f.abilityCd = 0; });
      rig.attach();
    }
    window.__TRAILER__.begin();
  }, shot);
  let encoder;
  let done;
  if (!preview) {
    encoder = spawn('C:/ffmpeg/bin/ffmpeg.exe', ['-y','-loglevel','error','-f','image2pipe','-framerate','30','-c:v','mjpeg','-i','-','-c:v','libx264','-preset','fast','-crf','15','-pix_fmt','yuv420p','-movflags','+faststart',path.join(root,'assets',`${shot.id}.mp4`)], { stdio: ['pipe','inherit','inherit'] });
    done = new Promise((resolve, reject) => { encoder.on('error', reject); encoder.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`))); });
  }
  const samples = new Set([Math.floor(shot.frames * .2 / 2) * 2, Math.floor(shot.frames * .5 / 2) * 2, Math.floor(shot.frames * .8 / 2) * 2]);
  for (let i = 0; i < shot.frames; i += 2) {
    const capture = !preview || samples.has(i);
    const data = await page.evaluate(capture => {
      window.__TRAILER__.step(); window.__TRAILER__.step();
      return capture ? window.__TRAILER__.capture(1920,1080,'image/jpeg',0.98) : null;
    }, capture);
    if (data) {
      const bytes = Buffer.from(data.split(',')[1], 'base64');
      if (samples.has(i)) fs.writeFileSync(path.join(root,'work',`${shot.id}-${i}.jpg`), bytes);
      if (encoder && !encoder.stdin.write(bytes)) await once(encoder.stdin, 'drain');
    }
  }
  if (encoder) { encoder.stdin.end(); await done; }
  const logs = await page.evaluate(() => ({ audio: window.__TRAILER__.audioLog(), events: window.__TRAILER__.events() }));
  fs.writeFileSync(path.join(root,'work',`${shot.id}.json`), JSON.stringify({ shot, ...logs, errors }, null, 2));
  if (errors.length) throw new Error(`${shot.id}: ${errors.join('; ')}`);
  console.log(`${shot.id}: ${shot.seconds}s, ${logs.audio.length} sounds, ${logs.events.filter(e => /hit|super|beam|rasengan|clone|explosion|transform/.test(e.what)).slice(0, 10).map(e=>`${e.vf}:${e.what}`).join(' / ')}`);
  await page.close();
}
} finally { await browser.close(); }
