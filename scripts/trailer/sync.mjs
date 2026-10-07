// Prints where each shot's key events land on the music grid (150 BPM: 24 frames per beat) so impacts can be
// tuned onto beats. Usage: node scripts/trailer/sync.mjs <workDir> [shotId...]  (run after record.mjs / build.mjs)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const work = path.resolve(process.argv[2] ?? 'trailer/work');
const only = process.argv.slice(3);
const timeline = JSON.parse(execFileSync('npx', ['vite-node', 'scripts/trailer/timeline.ts'], { shell: process.platform === 'win32' }).toString().trim().split('\n').pop());
let off = 0;
for (const t of timeline) {
  if (!only.length || only.includes(t.id)) {
    const f = path.join(work, `${t.id}.events.json`);
    const ev = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [];
    const key = ev.filter((e) => /^(transform|super|beam|KILL|explosion)/.test(e.what) || (e.what.startsWith('hit') && Number(e.what.split(' ')[2]) >= 9));
    const seen = new Set();
    const out = [];
    for (const e of key) {
      const k = e.what.split(' ')[0] + (e.what.startsWith('transform') ? e.what : '');
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(`${e.what.slice(0, 24)} vf${e.vf} g${off + e.vf} beat ${((off + e.vf) / 24).toFixed(2)}`);
    }
    console.log(`${t.id.padEnd(9)} @${String(off).padStart(4)} (beat ${(off / 24).toFixed(1)}): ${out.slice(0, 6).join(' | ')}`);
  }
  off += t.frames;
}
