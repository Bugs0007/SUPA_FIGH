// Procedural chiptune loops (no assets): a tiny step sequencer scheduling WebAudio oscillators with
// lookahead. Tracks are data: tempo, chord progression, and per-instrument step patterns.

import { audio } from './AudioManager';

type Inst = 'bass' | 'arp' | 'lead' | 'kick' | 'snare' | 'hat';

interface Track {
  bpm: number;
  /** root MIDI note per bar; chords are minor/major triads from `quality` */
  roots: number[];
  quality: ('m' | 'M')[];
  /** 16 steps per bar; characters: x = hit, . = rest (bass/arp/lead use chord tones) */
  patterns: Partial<Record<Inst, string[]>>;
  /** lead melody as chord-tone indices per step ('.' = rest, 0-6 = scale step from the root) */
  lead?: string[];
  volume: number;
}

const MINOR = [0, 2, 3, 5, 7, 8, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

export const TRACKS: Record<string, Track> = {
  title: {
    bpm: 92,
    roots: [57, 53, 48, 52],
    quality: ['m', 'M', 'M', 'm'],
    volume: 0.55,
    patterns: {
      bass: ['x.......x.......'],
      arp: ['x.x.x.x.x.x.x.x.'],
      hat: ['....x.......x...'],
      kick: ['x...............'],
    },
  },
  match: {
    bpm: 140,
    roots: [45, 41, 43, 40],
    quality: ['m', 'M', 'M', 'M'],
    volume: 0.5,
    patterns: {
      bass: ['x.xxx.x.x.xxx.x.'],
      arp: ['x...x...x...x...'],
      kick: ['x.....x.x.......', 'x.....x.x.....x.'],
      snare: ['....x.......x...', '....x.......x.xx'],
      hat: ['x.x.x.x.x.x.x.x.'],
    },
    lead: ['4.4.3...2.3.4...', '4.5.6...5.4.3...', '2.3.4...4.3.2...', '0...2...4...6...'],
  },
  intense: {
    bpm: 164,
    roots: [40, 40, 36, 38],
    quality: ['m', 'm', 'M', 'M'],
    volume: 0.55,
    patterns: {
      bass: ['xxxxxxxxxxxxxxxx'],
      arp: ['x.x.x.x.x.x.x.x.'],
      kick: ['x...x...x...x...'],
      snare: ['....x.......x...', '....x.......xxxx'],
      hat: ['xxxxxxxxxxxxxxxx'],
    },
    lead: ['6.5.4.3.4.......', '6.5.4.3.2.......', '4.4.4.5.6.......', '2.3.4.5.6.6.6...'],
  },
};

const mtof = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

class MusicPlayer {
  private track: string | null = null;
  private wanted: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private next = 0;
  private step = 0;
  private noise: AudioBuffer | null = null;
  private out: GainNode | null = null;

  /** Switch to a track (no-op if already playing). Starts once audio is unlocked. */
  play(id: string | null): void {
    this.wanted = id;
    const ctx = audio.context;
    if (!ctx || !audio.musicBus) return;
    if (id === this.track) return;
    this.stopNow();
    this.track = id;
    if (!id) return;
    this.out = ctx.createGain();
    this.out.gain.value = TRACKS[id].volume;
    this.out.connect(audio.musicBus);
    this.step = 0;
    this.next = ctx.currentTime + 0.08;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  /** Called after the audio context unlocks (user gesture). */
  resume(): void {
    if (this.wanted && this.track !== this.wanted) this.play(this.wanted);
  }

  private stopNow(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.out && audio.context) {
      const g = this.out;
      g.gain.setTargetAtTime(0, audio.context.currentTime, 0.08);
      setTimeout(() => g.disconnect(), 600);
    }
    this.out = null;
    this.track = null;
  }

  private schedule(): void {
    const ctx = audio.context;
    if (!ctx || !this.track || !this.out) return;
    const t = TRACKS[this.track];
    const stepDur = 60 / t.bpm / 4;
    if (this.next < ctx.currentTime - 0.5) this.next = ctx.currentTime + 0.05; // tab was asleep
    while (this.next < ctx.currentTime + 0.15) {
      this.playStep(t, this.step, this.next, stepDur);
      this.next += stepDur;
      this.step++;
    }
  }

  private playStep(t: Track, step: number, when: number, dur: number): void {
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const bi = bar % t.roots.length;
    const root = t.roots[bi];
    const scale = t.quality[bi] === 'm' ? MINOR : MAJOR;
    const chord = [0, scale[2], scale[4]];
    const pat = (inst: Inst) => {
      const p = t.patterns[inst];
      return p ? p[bar % p.length][s] === 'x' : false;
    };
    if (pat('bass')) this.tone('triangle', mtof(root - 12 + (s % 4 === 2 ? 12 : 0)), when, dur * 1.6, 0.5);
    if (pat('arp')) this.tone('square', mtof(root + 12 + chord[Math.floor(s / 2) % 3]), when, dur * 0.8, 0.09);
    if (t.lead && bar % 8 >= 4) {
      const ch = t.lead[bar % t.lead.length][s];
      if (ch !== '.') this.tone('square', mtof(root + 24 + scale[Number(ch) % 7]), when, dur * 1.8, 0.12);
    }
    if (pat('kick')) this.kick(when);
    if (pat('snare')) this.noiseHit(when, 0.12, 1800, 0.35);
    if (pat('hat')) this.noiseHit(when, 0.03, 7000, 0.12);
  }

  private tone(type: OscillatorType, freq: number, when: number, dur: number, vol: number): void {
    const ctx = audio.context!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    o.connect(g).connect(this.out!);
    o.start(when);
    o.stop(when + dur + 0.02);
  }

  private kick(when: number): void {
    const ctx = audio.context!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(140, when);
    o.frequency.exponentialRampToValueAtTime(40, when + 0.12);
    g.gain.setValueAtTime(0.8, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.16);
    o.connect(g).connect(this.out!);
    o.start(when);
    o.stop(when + 0.18);
  }

  private noiseHit(when: number, dur: number, cutoff: number, vol: number): void {
    const ctx = audio.context!;
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    src.connect(f).connect(g).connect(this.out!);
    src.start(when, Math.random() * 0.3);
    src.stop(when + dur + 0.02);
  }
}

export const music = new MusicPlayer();
