// Self-generated trailer soundtrack: a 150 BPM chiptune track (pulse leads + arps, triangle bass, noise drums),
// written here as code and rendered to samples. No samples, no third-party music: royalty-free by construction.
// Bar -> video frame: (bar - 1) * 96 at 60 fps (1 bar = 4 beats = 1.6 s). See scripts/trailer/timeline.mjs.

export const SR = 44100;
export const BPM = 150;
export const BEAT = 60 / BPM; // 0.4 s
export const S16 = BEAT / 4; // 0.1 s
export const BAR = BEAT * 4;

export interface Stereo {
  l: Float32Array;
  r: Float32Array;
}

export const makeBuf = (seconds: number): Stereo => ({ l: new Float32Array(Math.ceil(seconds * SR)), r: new Float32Array(Math.ceil(seconds * SR)) });
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

/** add a mono signal into the buffer at time t with pan (-1..1) */
function add(buf: Stereo, t: number, sig: Float32Array, gain: number, pan = 0): void {
  const i0 = Math.round(t * SR);
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < sig.length; i++) {
    const k = i0 + i;
    if (k < 0 || k >= buf.l.length) continue;
    buf.l[k] += sig[i] * gl;
    buf.r[k] += sig[i] * gr;
  }
}

type Wave = 'pulse' | 'tri' | 'saw' | 'sine';

/** one synthesized note: wave, ADSR-ish envelope, optional pitch slide / vibrato / pulse width */
function tone(freq: number, dur: number, o: { wave: Wave; duty?: number; a?: number; d?: number; s?: number; r?: number; slide?: number; vib?: number; lp?: number }): Float32Array {
  const a = o.a ?? 0.004;
  const d = o.d ?? 0.05;
  const s = o.s ?? 0.7;
  const r = o.r ?? 0.05;
  const n = Math.ceil((dur + r) * SR);
  const out = new Float32Array(n);
  let ph = 0;
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let env: number;
    if (t < a) env = t / a;
    else if (t < a + d) env = 1 - (1 - s) * ((t - a) / d);
    else if (t < dur) env = s;
    else env = s * Math.max(0, 1 - (t - dur) / r);
    const f = freq * Math.pow(2, ((o.slide ?? 0) * t) / 12) * (1 + (o.vib ? 0.006 * Math.sin(2 * Math.PI * o.vib * t) : 0));
    ph += f / SR;
    ph -= Math.floor(ph);
    let v: number;
    if (o.wave === 'pulse') v = ph < (o.duty ?? 0.5) ? 1 : -1;
    else if (o.wave === 'saw') v = 2 * ph - 1;
    else if (o.wave === 'tri') v = 4 * Math.abs(ph - 0.5) - 1;
    else v = Math.sin(2 * Math.PI * ph);
    if (o.lp) {
      lp += o.lp * (v - lp);
      v = lp;
    }
    out[i] = v * env;
  }
  return out;
}

function noise(dur: number, o: { a?: number; decay: number; hp?: number; lp?: number; level?: number }): Float32Array {
  const n = Math.ceil(dur * SR);
  const out = new Float32Array(n);
  let hpPrev = 0;
  let hpOut = 0;
  let lpv = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = rnd();
    if (o.hp) {
      hpOut = o.hp * (hpOut + v - hpPrev);
      hpPrev = v;
      v = hpOut;
    }
    if (o.lp) {
      lpv += o.lp * (v - lpv);
      v = lpv;
    }
    const att = o.a ? Math.min(1, t / o.a) : 1;
    out[i] = v * att * Math.exp(-t / o.decay) * (o.level ?? 1);
  }
  return out;
}

// ---- drum voices ---------------------------------------------------------------------------------
const kick = (): Float32Array => {
  const n = Math.ceil(0.28 * SR);
  const out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 45 + 150 * Math.exp(-t * 28);
    ph += f / SR;
    out[i] = Math.sin(2 * Math.PI * ph) * Math.exp(-t * 11) + (t < 0.006 ? rnd() * 0.5 : 0);
  }
  return out;
};
const snare = (): Float32Array => {
  const nz = noise(0.2, { decay: 0.055, hp: 0.6 });
  const tn = tone(185, 0.12, { wave: 'tri', a: 0.001, d: 0.05, s: 0.1, r: 0.04 });
  const out = new Float32Array(nz.length);
  for (let i = 0; i < out.length; i++) out[i] = nz[i] * 0.9 + (tn[i] ?? 0) * 0.5;
  return out;
};
const hat = (open = false): Float32Array => noise(open ? 0.18 : 0.05, { decay: open ? 0.06 : 0.014, hp: 0.92, level: 0.7 });
const crash = (): Float32Array => noise(1.8, { decay: 0.55, hp: 0.9, level: 0.8 });

// ---- score ---------------------------------------------------------------------------------------
// chord roots (MIDI) and triad intervals per bar
const AM = { root: 45, ints: [0, 3, 7] };
const F = { root: 41, ints: [0, 4, 7] };
const C = { root: 48, ints: [0, 4, 7] };
const G = { root: 43, ints: [0, 4, 7] };
const E = { root: 40, ints: [0, 4, 7] };
/** 1-based bar -> chord */
const PROG: Record<number, { root: number; ints: number[] }> = {
  1: AM, 2: AM,
  3: AM, 4: F, 5: C, 6: G,
  7: AM, 8: F, 9: G,
  10: F, 11: G, 12: AM, 13: F, 14: E,
  15: AM, 16: F, 17: AM,
};
export const BARS = 17;

// lead motifs (MIDI, 0 = rest), 16 steps per bar
const LEAD_A: Record<number, number[]> = {
  3: [76, 0, 76, 79, 81, 0, 79, 76, 74, 0, 76, 0, 72, 0, 0, 0],
  4: [77, 0, 77, 81, 84, 0, 81, 77, 76, 0, 77, 0, 72, 0, 0, 0],
  5: [79, 0, 79, 84, 86, 0, 84, 79, 76, 0, 79, 0, 72, 0, 0, 0],
  6: [79, 0, 79, 83, 86, 0, 83, 79, 74, 0, 79, 0, 83, 0, 86, 0],
};
const LEAD_B: Record<number, number[]> = {
  7: [81, 84, 88, 84, 81, 84, 88, 91, 88, 84, 81, 84, 88, 0, 84, 0],
  8: [81, 84, 89, 84, 81, 84, 89, 93, 89, 84, 81, 84, 89, 0, 84, 0],
  9: [83, 86, 91, 86, 83, 86, 91, 95, 91, 86, 83, 86, 91, 0, 95, 0],
};
const LEAD_C: Record<number, number[]> = {
  10: [84, 0, 84, 89, 88, 0, 84, 81, 84, 0, 89, 0, 93, 0, 89, 84],
  11: [83, 0, 83, 88, 86, 0, 83, 79, 83, 0, 86, 0, 91, 0, 86, 83],
  12: [81, 0, 84, 88, 93, 0, 88, 84, 81, 0, 84, 0, 88, 0, 93, 0],
  13: [84, 0, 84, 89, 93, 0, 89, 84, 81, 0, 84, 0, 89, 0, 93, 96],
  14: [83, 83, 83, 83, 86, 86, 86, 86, 88, 88, 88, 88, 91, 91, 95, 95],
};
const LEAD_END: Record<number, number[]> = {
  15: [81, 0, 0, 0, 84, 0, 0, 0, 88, 0, 0, 0, 93, 0, 0, 0],
  16: [89, 0, 0, 0, 84, 0, 0, 0, 81, 0, 0, 0, 84, 0, 0, 0],
  17: [81, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

/** Render the whole track. */
export function renderMusic(): Stereo {
  seed = 12345;
  const total = BARS * BAR + 1.5;
  const buf = makeBuf(total);
  const K = kick();
  const S = snare();
  const H = hat();
  const HO = hat(true);
  const CR = crash();
  const bt = (bar: number, step = 0) => (bar - 1) * BAR + step * S16;

  for (let bar = 1; bar <= BARS; bar++) {
    const ch = PROG[bar];
    const intro = bar <= 2;
    const secA = bar >= 3 && bar <= 6;
    const secB = bar >= 7 && bar <= 9;
    const secC = bar >= 10 && bar <= 14;
    const outro = bar >= 15;

    // ---- pad (every bar): soft triangle + saw triad, swelling in the intro
    for (const iv of ch.ints) {
      const pad = tone(mtof(ch.root + 12 + iv), BAR * (intro ? 1 : 0.95), { wave: intro ? 'tri' : 'saw', a: intro ? 0.9 : 0.02, d: 0.2, s: 0.5, r: 0.3, lp: 0.12 });
      add(buf, bt(bar), pad, intro ? 0.11 + (bar - 1) * 0.05 : 0.07, iv === 0 ? -0.3 : 0.3);
    }

    // ---- bass: triangle/pulse eighths (intro: whole notes)
    if (intro) {
      add(buf, bt(bar), tone(mtof(ch.root - 12), BAR, { wave: 'tri', a: 0.3, s: 0.9, r: 0.2 }), 0.28, 0);
    } else {
      for (let s = 0; s < 16; s += 2) {
        const oct = secC && s % 8 === 6 ? 12 : 0;
        const accent = s % 4 === 0 ? 1 : 0.75;
        add(buf, bt(bar, s), tone(mtof(ch.root - 12 + oct), S16 * 1.7, { wave: 'pulse', duty: 0.35, a: 0.002, d: 0.04, s: 0.6, r: 0.03, lp: 0.45 }), 0.3 * accent, 0);
      }
    }

    // ---- arpeggio (soft pulse), 16ths: climbs through the intro, steady later
    const arpOn = bar >= 2;
    if (arpOn) {
      const notes = [0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1].map((i, k) => ch.root + 24 + ch.ints[i] + (k % 8 >= 4 ? 12 : 0));
      for (let s = 0; s < 16; s++) {
        const lvl = bar === 2 ? 0.05 + (s / 16) * 0.09 : secC ? 0.1 : 0.075;
        add(buf, bt(bar, s), tone(mtof(notes[s]), S16 * 0.85, { wave: 'pulse', duty: 0.125, a: 0.001, d: 0.03, s: 0.5, r: 0.02 }), lvl, s % 2 ? 0.45 : -0.45);
      }
    }

    // ---- drums
    if (bar === 1) {
      // intro: soft kick on beats + hats creep in
      for (let b = 0; b < 4; b++) if (b % 2 === 0) add(buf, bt(bar, b * 4), K, 0.28);
    } else if (bar === 2) {
      for (let b = 0; b < 4; b++) add(buf, bt(bar, b * 4), K, 0.3);
      for (let s = 0; s < 16; s += 2) add(buf, bt(bar, s), H, 0.1 + s * 0.006);
      // snare roll on the last two beats, louder and denser
      for (let s = 8; s < 16; s++) add(buf, bt(bar, s), S, 0.1 + (s - 8) * 0.05);
    } else {
      const full = !outro;
      if (outro && bar === 15) add(buf, bt(bar), CR, 0.55);
      for (let b = 0; b < 4; b++) {
        if (full || bar === 15) add(buf, bt(bar, b * 4), K, 0.5);
        if (secC && b % 2 === 1) add(buf, bt(bar, b * 4 + 2), K, 0.35);
      }
      if (full) {
        add(buf, bt(bar, 4), S, 0.5);
        add(buf, bt(bar, 12), S, 0.5);
        if (secB || secC) {
          add(buf, bt(bar, 7), S, 0.18);
          add(buf, bt(bar, 15), S, 0.2);
        }
        for (let s = 0; s < 16; s++) {
          if (secC || s % 2 === 0) add(buf, bt(bar, s), s % 4 === 2 ? HO : H, s % 4 === 2 ? 0.1 : 0.13);
        }
      }
      if (bar === 15) {
        add(buf, bt(bar, 4), S, 0.4);
        add(buf, bt(bar, 12), S, 0.4);
      }
    }
    // build before the finale: dense snare roll in bar 14 and crash on 15
    if (bar === 14) for (let s = 0; s < 16; s++) add(buf, bt(bar, s), S, 0.18 + s * 0.035);
    // section drops: crash on the first bar of each section
    if (bar === 3 || bar === 7 || bar === 10) add(buf, bt(bar), CR, 0.45);

    // ---- lead
    const lead = LEAD_A[bar] ?? LEAD_B[bar] ?? LEAD_C[bar] ?? LEAD_END[bar];
    if (lead) {
      const loud = secC ? 0.17 : secB ? 0.14 : 0.15;
      lead.forEach((m, s) => {
        if (!m) return;
        // sustain into following rests
        let len = 1;
        while (s + len < 16 && lead[s + len] === 0 && len < 4) len++;
        const dur = outro ? S16 * len * 3.4 : S16 * Math.max(0.9, len * 0.92);
        const n = tone(mtof(m), dur, { wave: 'pulse', duty: secC ? 0.25 : 0.5, a: 0.003, d: 0.05, s: 0.75, r: 0.05, vib: len > 1 ? 5.5 : 0 });
        add(buf, bt(bar, s), n, loud, 0.1);
        // dotted-eighth echo
        add(buf, bt(bar, s) + S16 * 3, n, loud * 0.28, -0.35);
      });
    }
  }

  // ---- intro riser: filtered noise sweeping up through bars 1-2
  {
    const n = Math.ceil(2 * BAR * SR);
    const out = new Float32Array(n);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const c = 0.02 + 0.85 * t * t;
      lp += c * (rnd() - lp);
      out[i] = lp * (0.05 + 0.5 * t * t);
    }
    add(buf, 0, out, 0.4, 0);
  }
  return buf;
}

/** single hits reused by the SFX layer in audio.ts */
export const hits = { kick, snare, crash };
export { noise, tone, add, mtof };
