// Mixes the trailer soundtrack: the generated chiptune (music.ts) + the game's own sfxr sound effects, replayed
// from the audio logs the recorder saved per shot (so every hit/beam/transform sound lines up with the picture),
// plus a few trailer-only stingers. Output: 16-bit stereo WAV.
// Usage: npx vite-node scripts/trailer/audio.ts <workDir> <out.wav>
import fs from 'node:fs';
import path from 'node:path';
import { renderSfx } from '../../src/audio/sfxr';
import { SOUNDS } from '../../src/audio/sounds';
import { SHOTS, TIMELINE } from '../../src/trailer/shots';
import { add, BAR, hits, makeBuf, noise, renderMusic, SR, tone, type Stereo } from './music';

const [work = 'trailer/work', out = 'trailer/work/trailer.wav'] = process.argv.slice(2);
const FPS = 60;

const music = renderMusic();
const total = Math.max(music.l.length, Math.ceil(TIMELINE.reduce((a, id) => a + SHOTS[id].frames, 0) / FPS * SR) + SR);
const mix: Stereo = makeBuf(total / SR);
for (let i = 0; i < music.l.length; i++) {
  mix.l[i] += music.l[i] * 0.85;
  mix.r[i] += music.r[i] * 0.85;
}

// ---- game sound effects from the per-shot logs
const cache = new Map<string, Float32Array>();
const sfxBuf = (id: string): Float32Array | null => {
  if (!SOUNDS[id]) return null;
  let b = cache.get(id);
  if (!b) cache.set(id, (b = renderSfx(SOUNDS[id], SR)));
  return b;
};

let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const SKIP = new Set(['roundStart', 'roundEnd', 'uiOk', 'uiBack', 'uiMove']);

let offset = 0;
let nSfx = 0;
for (const id of TIMELINE) {
  const spec = SHOTS[id];
  const file = path.join(work, `${id}.audio.json`);
  const log: { vf: number; id: string; o: { volume?: number; pitch?: number; pan?: number; pitchVar?: number }; tp: number }[] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  const last = new Map<string, number>();
  for (const e of log) {
    if (e.vf >= spec.frames || SKIP.has(e.id)) continue;
    const base = sfxBuf(e.id);
    if (!base) continue;
    const t = (offset + e.vf) / FPS;
    if (t - (last.get(e.id) ?? -1) < 0.025) continue;
    last.set(e.id, t);
    const rate = Math.max(0.1, (e.o.pitch ?? 1) * (1 + rnd() * (e.o.pitchVar ?? 0.08)) * e.tp);
    const n = Math.floor(base.length / rate);
    const buf = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = i * rate;
      const k = Math.floor(p);
      buf[i] = base[k] + ((base[k + 1] ?? 0) - base[k]) * (p - k);
    }
    add(mix, t, buf, 0.5 * (e.o.volume ?? 1), e.o.pan ?? 0);
    nSfx++;
  }
  // trailer stingers: a whoosh into every cut, a thud on every caption slam
  add(mix, Math.max(0, (offset - 4) / FPS), noise(0.22, { a: 0.18, decay: 0.07, lp: 0.5, level: 1 }), 0.1, 0);
  for (const o of spec.overlays ?? []) {
    if ((o.anim ?? 'slam') === 'slam') add(mix, (offset + o.at) / FPS, hits.kick(), o.scale && o.scale > 5 ? 0.9 : 0.4, 0);
  }
  offset += spec.frames;
}
// title-card boom + the end-card sting land with the first / last cards
add(mix, 48 / FPS, hits.crash(), 0.5, 0);
add(mix, 48 / FPS, tone(55, 1.2, { wave: 'sine', a: 0.002, d: 0.6, s: 0, r: 0.3, slide: -9 }), 0.9, 0);
const endAt = (TIMELINE.slice(0, -1).reduce((a, id) => a + SHOTS[id].frames, 0)) / FPS;
add(mix, endAt, hits.crash(), 0.6, 0);
add(mix, endAt, tone(55, 1.4, { wave: 'sine', a: 0.002, d: 0.7, s: 0, r: 0.3, slide: -9 }), 1, 0);
void BAR;

// ---- master: gentle fade out, soft clip, normalize to about -1.5 dBFS
const secs = TIMELINE.reduce((a, id) => a + SHOTS[id].frames, 0) / FPS;
const n = Math.floor(secs * SR);
const fadeStart = secs - 1.2;
let peak = 0;
for (let i = 0; i < n; i++) {
  const t = i / SR;
  const g = t > fadeStart ? Math.max(0, 1 - (t - fadeStart) / 1.2) : 1;
  mix.l[i] = Math.tanh(mix.l[i] * 1.1) * g;
  mix.r[i] = Math.tanh(mix.r[i] * 1.1) * g;
  peak = Math.max(peak, Math.abs(mix.l[i]), Math.abs(mix.r[i]));
}
const norm = 0.72 / (peak || 1);
const pcm = Buffer.alloc(n * 4);
for (let i = 0; i < n; i++) {
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, mix.l[i] * norm)) * 32767), i * 4);
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, mix.r[i] * norm)) * 32767), i * 4 + 2);
}
const head = Buffer.alloc(44);
head.write('RIFF', 0);
head.writeUInt32LE(36 + pcm.length, 4);
head.write('WAVEfmt ', 8);
head.writeUInt32LE(16, 16);
head.writeUInt16LE(1, 20);
head.writeUInt16LE(2, 22);
head.writeUInt32LE(SR, 24);
head.writeUInt32LE(SR * 4, 28);
head.writeUInt16LE(4, 32);
head.writeUInt16LE(16, 34);
head.write('data', 36);
head.writeUInt32LE(pcm.length, 40);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([head, pcm]));
console.log(`audio: ${secs.toFixed(1)} s, ${nSfx} game sfx mixed, peak ${peak.toFixed(2)} -> ${out}`);
