// A small sfxr-style synthesizer: parameters in, Float32 samples out. No external assets.

export type Wave = 'square' | 'saw' | 'sine' | 'triangle' | 'noise';

export interface SfxLayer {
  wave: Wave;
  /** start frequency (Hz) */
  freq: number;
  /** pitch slide in octaves per second (negative = down) */
  slide?: number;
  /** slide acceleration (octaves/s^2) */
  dslide?: number;
  minFreq?: number;
  attack?: number;
  sustain?: number;
  decay: number;
  /** extra volume at the start of sustain, decaying to 0 (0..1) */
  punch?: number;
  /** square duty 0..1 */
  duty?: number;
  vibDepth?: number;
  vibSpeed?: number;
  /** multiply pitch after arpTime seconds */
  arpMul?: number;
  arpTime?: number;
  /** one-pole lowpass coefficient 0..1 (1 = off) */
  lowpass?: number;
  /** one-pole highpass coefficient 0..1 (0 = off) */
  highpass?: number;
  volume?: number;
  /** start offset (s) inside the combined sound */
  delay?: number;
  /** amplitude tremolo speed (Hz) */
  tremolo?: number;
}

export type SfxDef = SfxLayer[];

export function layerLength(l: SfxLayer): number {
  return (l.delay ?? 0) + (l.attack ?? 0) + (l.sustain ?? 0) + l.decay;
}

function renderLayer(out: Float32Array, l: SfxLayer, sr: number, seed: number): void {
  const attack = l.attack ?? 0;
  const sustain = l.sustain ?? 0;
  const decay = l.decay;
  const total = attack + sustain + decay;
  const n = Math.floor(total * sr);
  const start = Math.floor((l.delay ?? 0) * sr);
  const vol = l.volume ?? 0.5;
  const duty = l.duty ?? 0.5;
  const lpA = l.lowpass ?? 1;
  const hpA = l.highpass ?? 0;
  let phase = 0;
  let lp = 0;
  let hpPrev = 0;
  let hpOut = 0;
  let noiseVal = 0;
  let rng = seed >>> 0 || 1;
  const rand = () => {
    rng ^= rng << 13;
    rng ^= rng >>> 17;
    rng ^= rng << 5;
    return ((rng >>> 0) / 4294967296) * 2 - 1;
  };
  for (let i = 0; i < n && start + i < out.length; i++) {
    const t = i / sr;
    let freq = l.freq * Math.pow(2, (l.slide ?? 0) * t + 0.5 * (l.dslide ?? 0) * t * t);
    if (l.arpMul && t >= (l.arpTime ?? 0)) freq *= l.arpMul;
    if (l.vibDepth) freq *= 1 + Math.sin(t * Math.PI * 2 * (l.vibSpeed ?? 8)) * l.vibDepth;
    if (l.minFreq && freq < l.minFreq) freq = l.minFreq;
    const prevPhase = phase;
    phase += freq / sr;
    if (phase >= 1) phase -= Math.floor(phase);
    let s: number;
    switch (l.wave) {
      case 'square':
        s = phase < duty ? 1 : -1;
        break;
      case 'saw':
        s = phase * 2 - 1;
        break;
      case 'sine':
        s = Math.sin(phase * Math.PI * 2);
        break;
      case 'triangle':
        s = phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4;
        break;
      case 'noise':
      default:
        if (phase < prevPhase || i === 0) noiseVal = rand();
        s = noiseVal;
        break;
    }
    // filters
    lp += (s - lp) * lpA;
    s = lp;
    if (hpA > 0) {
      hpOut = hpA * (hpOut + s - hpPrev);
      hpPrev = s;
      s = hpOut;
    }
    // envelope
    let env: number;
    if (t < attack) env = t / attack;
    else if (t < attack + sustain) env = 1 + (l.punch ?? 0) * (1 - (t - attack) / sustain);
    else env = 1 - (t - attack - sustain) / decay;
    if (l.tremolo) env *= 0.6 + 0.4 * Math.sin(t * Math.PI * 2 * l.tremolo);
    out[start + i] += s * env * vol;
  }
}

export function renderSfx(def: SfxDef, sampleRate: number): Float32Array {
  const len = Math.max(...def.map(layerLength));
  const out = new Float32Array(Math.ceil(len * sampleRate) + 1);
  def.forEach((l, i) => renderLayer(out, l, sampleRate, 1234 + i * 977));
  // soft clip
  for (let i = 0; i < out.length; i++) {
    const v = out[i];
    out[i] = v > 1 ? 1 : v < -1 ? -1 : v - (v * v * v) / 6;
  }
  return out;
}
