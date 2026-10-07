// Builds the whole trailer: records every shot in the cut (lossless intermediates), renders the soundtrack,
// then encodes the deliverables into /trailer:
//   trailer.mp4 (H.264 High, faststart, web size), trailer.webm (VP9 + Opus), poster.jpg, trailer_master.mp4 (near-lossless)
// Usage: node scripts/trailer/build.mjs [--scale 2] [--only shotId,shotId] [--skip-record] [--work trailer/work]
// Needs the dev server (npm run dev -- --port 5199) or it starts one; ffmpeg on PATH (or FFMPEG=path).
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : d);
const scale = opt('scale', '2');
const work = path.resolve(opt('work', 'trailer/work'));
const only = opt('only', '')?.split(',').filter(Boolean);
const skipRecord = args.includes('--skip-record');
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const url = 'http://localhost:5199';
const sh = (cmd, a, o = {}) => execFileSync(cmd, a, { stdio: 'inherit', shell: process.platform === 'win32', ...o });

fs.mkdirSync(work, { recursive: true });
const timeline = JSON.parse(execFileSync('npx', ['vite-node', 'scripts/trailer/timeline.ts'], { shell: process.platform === 'win32' }).toString().trim().split('\n').pop());
console.log('cut:', timeline.map((t) => `${t.id}(${t.frames})`).join(' '), '=', timeline.reduce((a, t) => a + t.frames, 0), 'frames');

let server = null;
const up = async () => fetch(url).then((r) => r.ok).catch(() => false);
if (!skipRecord && !(await up())) {
  server = spawn('npx', ['vite', '--port', '5199', '--strictPort'], { shell: process.platform === 'win32', stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500));
}

if (!skipRecord) {
  for (const t of timeline) {
    if (only.length && !only.includes(t.id)) continue;
    console.log(`\n== recording ${t.id}`);
    sh('node', ['scripts/trailer/record.mjs', t.id, '--scale', scale, '--out', work]);
  }
}
if (server) server.kill();

console.log('\n== soundtrack');
sh('npx', ['vite-node', 'scripts/trailer/audio.ts', work, path.join(work, 'trailer.wav')]);

const list = path.join(work, 'concat.txt');
fs.writeFileSync(list, timeline.map((t) => `file '${path.join(work, t.id + '.mkv').split(path.sep).join('/')}'`).join('\n'));
const out = path.resolve('trailer');
fs.mkdirSync(out, { recursive: true });
const wav = path.join(work, 'trailer.wav');
const v = ['-f', 'concat', '-safe', '0', '-i', list, '-i', wav];
const frames = timeline.reduce((a, t) => a + t.frames, 0);
const secs = frames / 60;
// bitrates sized so the web files land at ~10 MB (mp4) / ~8 MB (webm): total bits / duration - audio
const kbps = (bytes, audioK) => Math.floor((bytes * 8) / secs / 1000 - audioK);
const mp4k = kbps(10.3e6, 128);
const webmk = kbps(8.5e6, 112);
const nul = process.platform === 'win32' ? 'NUL' : '/dev/null';

console.log('\n== master (near-lossless H.264 + 320k AAC)');
sh(ffmpeg, ['-y', '-loglevel', 'error', ...v, '-c:v', 'libx264', '-preset', 'slow', '-crf', '10', '-pix_fmt', 'yuv420p', '-r', '60', '-c:a', 'aac', '-b:a', '320k', '-shortest', '-movflags', '+faststart', path.join(out, 'trailer_master.mp4')]);

console.log(`== web mp4 (2-pass, ${mp4k} kbps video, faststart)`);
const pl = path.join(work, 'x264pass');
const x264 = ['-c:v', 'libx264', '-profile:v', 'high', '-preset', 'veryslow', '-b:v', `${mp4k}k`, '-maxrate', `${Math.round(mp4k * 1.5)}k`, '-bufsize', `${mp4k * 2}k`, '-pix_fmt', 'yuv420p', '-r', '60', '-passlogfile', pl];
sh(ffmpeg, ['-y', '-loglevel', 'error', ...v, ...x264, '-pass', '1', '-an', '-f', 'null', nul]);
sh(ffmpeg, ['-y', '-loglevel', 'error', ...v, ...x264, '-pass', '2', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', path.join(out, 'trailer.mp4')]);

console.log(`== webm (VP9 2-pass, ${webmk} kbps video + Opus)`);
const vp9 = ['-c:v', 'libvpx-vp9', '-b:v', `${webmk}k`, '-crf', '28', '-row-mt', '1', '-pix_fmt', 'yuv420p', '-r', '60', '-passlogfile', path.join(work, 'vp9pass')];
sh(ffmpeg, ['-y', '-loglevel', 'error', ...v, ...vp9, '-pass', '1', '-an', '-f', 'null', nul]);
sh(ffmpeg, ['-y', '-loglevel', 'error', ...v, ...vp9, '-pass', '2', '-c:a', 'libopus', '-b:a', '112k', '-shortest', path.join(out, 'trailer.webm')]);

console.log('== poster');
const pdir = path.join(work, 'poster');
fs.mkdirSync(pdir, { recursive: true });
if (!skipRecord) sh('node', ['scripts/trailer/record.mjs', 'poster', '--scale', scale, '--every', '76', '--out', pdir]);
sh(ffmpeg, ['-y', '-loglevel', 'error', '-i', path.join(pdir, 'poster_0076.png'), '-q:v', '2', '-update', '1', path.join(out, 'poster.jpg')]);

for (const f of ['trailer.mp4', 'trailer.webm', 'poster.jpg', 'trailer_master.mp4']) console.log(f, (fs.statSync(path.join(out, f)).size / 1e6).toFixed(2), 'MB');
