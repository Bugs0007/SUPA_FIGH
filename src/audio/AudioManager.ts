import { renderSfx } from './sfxr';
import { SOUNDS } from './sounds';

export interface PlayOpts {
  volume?: number;
  /** playback-rate multiplier */
  pitch?: number;
  /** random +- pitch variation (fraction) */
  pitchVar?: number;
  /** -1..1 stereo pan */
  pan?: number;
}

/** WebAudio sound player. Buffers are synthesized once; every play is pitch-randomized. */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  musicBus!: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private lastPlayed = new Map<string, number>();
  private active = 0;
  private volumes = { master: 0.8, sfx: 0.9, music: 0.5 };
  /** global pitch multiplier (slow-mo) */
  timePitch = 1;

  /** Create the context lazily; browsers only allow it after a user gesture. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();
      this.musicBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.applyVolumes();
      for (const [id, def] of Object.entries(SOUNDS)) {
        const data = renderSfx(def, this.ctx.sampleRate);
        const buf = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
        buf.getChannelData(0).set(data);
        this.buffers.set(id, buf);
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  setVolumes(master: number, sfx: number, music: number): void {
    this.volumes = { master, sfx, music };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.sfxBus.gain.value = this.volumes.sfx;
    this.musicBus.gain.value = this.volumes.music;
  }

  play(id: string, o: PlayOpts = {}): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const buf = this.buffers.get(id);
    if (!buf) return;
    const now = ctx.currentTime;
    const last = this.lastPlayed.get(id) ?? -1;
    if (now - last < 0.025) return; // de-dupe identical sounds in the same instant
    if (this.active > 28) return;
    this.lastPlayed.set(id, now);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    const pv = o.pitchVar ?? 0.08;
    src.playbackRate.value = Math.max(0.1, (o.pitch ?? 1) * (1 + (Math.random() * 2 - 1) * pv) * this.timePitch);
    const gain = ctx.createGain();
    gain.gain.value = o.volume ?? 1;
    let node: AudioNode = src;
    node.connect(gain);
    node = gain;
    if (o.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      node.connect(p);
      node = p;
    }
    node.connect(this.sfxBus);
    this.active++;
    src.onended = () => {
      this.active--;
    };
    src.start();
  }
}

export const audio = new AudioManager();
