// Trailer mode (?trailer=1&shot=<id>): a deterministic, scripted bot-vs-bot "film set" for recording the
// game trailer. The sim is untouched: the rig only places fighters, patches bot intents on a tick schedule,
// moves the camera, and slows time. Everything is a pure function of (shot, tick), so the same shot always
// renders the same footage. Frames are produced one at a time by window.__TRAILER__ (see scripts/trailer).
import { audio, type PlayOpts } from '../audio/AudioManager';
import { settings } from '../game/settings';
import type { Intent } from '../sim/intent';
import type { SimEvent } from '../sim/events';
import { transform } from '../sim/hero';
import type { MatchScene } from '../scenes/MatchScene';
import { VIEW_H, VIEW_W } from '../game/display';
import type { ShotSpec } from './shots';

export interface AudioLogEntry {
  /** video frame the sound started on */
  vf: number;
  id: string;
  o: PlayOpts;
  /** global slow-mo pitch at that moment */
  tp: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export class TrailerRig {
  /** video frame index (0 = first recorded frame) */
  vf = 0;
  /** sim ticks since the match started (warm-up included) */
  tick = 0;
  readonly audioLog: AudioLogEntry[] = [];
  /** the scene's announcer lines this shot has produced (for captions) */
  readonly captions: { vf: number; text: string; color: number }[] = [];
  /** notable sim events with the video frame / tick they happened on (for syncing cuts to the music) */
  readonly events: { vf: number; tick: number; what: string }[] = [];
  /** the recorder has taken over: until then the match scene stays frozen */
  live: boolean;

  /**
   * capture = a recorded shot (?shot=<id>: frozen until the recorder drives it, sounds are logged, not played).
   * Otherwise it's the free-running live mode (?trailer=1): same clean look, real-time, sound on.
   */
  constructor(
    private scene: MatchScene,
    readonly spec: ShotSpec,
    readonly capture: boolean,
  ) {
    this.live = !capture;
    // keep the trailer family friendly: no blood splatter (in-memory only, never saved)
    settings.gore = false;
    if (!capture) return;
    // record sounds instead of playing them: the soundtrack is mixed offline from this log
    audio.play = (id: string, o: PlayOpts = {}) => {
      this.audioLog.push({ vf: this.vf, id, o: { volume: o.volume, pitch: o.pitch, pan: o.pan, pitchVar: o.pitchVar }, tp: audio.timePitch });
    };
    settings.replays = false;
  }

  /** Place / pre-transform fighters before the first tick. */
  attach(): void {
    const w = this.scene.match.world;
    this.spec.place?.forEach((p, i) => {
      const f = w.fighters[i];
      if (!f || !p) return;
      f.x = f.px = p.x;
      f.y = f.py = p.y;
      f.vx = f.vy = 0;
      if (p.facing) f.facing = p.facing;
      if (p.hp) f.hp = p.hp;
      f.invuln = 0;
    });
    if (this.spec.clean) {
      w.props.length = 0;
      for (const it of w.items) it.active = false;
    }
    this.spec.forms?.forEach((fm) => {
      if (fm.at === 0) this.setForm(fm.who, fm.level, true);
    });
    this.scene.wr.setBarsVisible(false);
  }

  private setForm(who: number, level: number, silent: boolean): void {
    const w = this.scene.match.world;
    const f = w.fighters[who];
    if (!f) return;
    const n0 = w.events.length;
    const target = f.power === 'hero' ? f.powerLevel : 0;
    for (let l = target; l < level; l++) transform(w, f);
    if (silent) w.events.length = n0;
  }

  logEvent(e: SimEvent): void {
    const keep = ['hit', 'kill', 'transform', 'superStart', 'beam', 'chargeStart', 'stretch', 'rasengan', 'clone', 'explosion', 'flyStart', 'rocket'];
    if (!keep.includes(e.t)) return;
    let what: string = e.t;
    if (e.t === 'hit') what = `hit v${e.victim}<-${e.attacker} ${Math.round(e.damage)} ${e.kind}/${e.weapon}`;
    else if (e.t === 'kill') what = `KILL v${e.victim}<-${e.killer} ${e.weapon}`;
    else if (e.t === 'transform') what = `transform f${e.f} L${e.level}`;
    else if (e.t === 'superStart') what = `super f${e.f} ${e.name}`;
    else if (e.t === 'beam') what = `beam f${e.f} ${e.super ? 'SUPER' : ''}`;
    else if ('f' in e) what = `${e.t} f${(e as { f: number }).f}`;
    this.events.push({ vf: this.vf, tick: this.tick, what });
  }

  /** Called once per sim tick before the step: patch the bots' intents on schedule. */
  shape(intents: Intent[]): void {
    const w = this.scene.match.world;
    const t = this.tick++;
    for (const fm of this.spec.forms ?? []) if (fm.at === t && t > 0) this.setForm(fm.who, fm.level, false);
    for (const it of this.spec.items ?? []) if (it.at === t) w.spawnWeapon(it.id, it.x, it.y);
    for (const p of this.spec.patches ?? []) {
      if (t < p.at || t >= p.at + p.dur) continue;
      const inp = intents[p.who];
      const f = w.fighters[p.who];
      if (!inp || !f) continue;
      if (p.idle) {
        inp.moveX = inp.moveY = 0;
        inp.jump = inp.attack = inp.kick = inp.interact = inp.ability = inp.cycle = inp.gadget = false;
      }
      if (p.face !== undefined) {
        const e = w.fighters[p.face];
        if (e) inp.moveX = e.x >= f.x ? 1 : -1;
      }
      if (p.moveX !== undefined) inp.moveX = p.moveX;
      if (p.moveY !== undefined) inp.moveY = p.moveY;
      if (p.jump !== undefined) inp.jump = p.jump;
      if (p.attack !== undefined) inp.attack = p.attack;
      if (p.kick !== undefined) inp.kick = p.kick;
      if (p.ability !== undefined) inp.ability = p.ability;
      if (p.interact !== undefined) inp.interact = p.interact;
    }
  }

  /** Slow-motion windows (keyed by video frame, ease in/out over `ease` frames). */
  timeScale(): number {
    let s = 1;
    for (const m of this.spec.slow ?? []) {
      const ease = m.ease ?? 6;
      if (this.vf < m.at - ease || this.vf > m.at + m.dur + ease) continue;
      const a = clamp((this.vf - (m.at - ease)) / ease, 0, 1) * clamp((m.at + m.dur + ease - this.vf) / ease, 0, 1);
      s = Math.min(s, 1 + (m.scale - 1) * a);
    }
    return s;
  }

  /** Scripted camera: follow the tracked fighters (centroid / fit zoom) per the active camera key. */
  camera(dt: number): void {
    const cd = this.scene.camDir;
    const w = this.scene.match.world;
    let key = this.spec.cam[0];
    for (const k of this.spec.cam) if (k.at <= this.vf) key = k;
    let x = key.x ?? 0;
    let y = key.y ?? 0;
    let z = key.z ?? 1.5;
    if (key.track?.length) {
      let l = Infinity;
      let r = -Infinity;
      let t = Infinity;
      let b = -Infinity;
      for (const i of key.track) {
        const f = w.fighters[i];
        if (!f) continue;
        const fx = f.x;
        const fy = f.y - 12;
        l = Math.min(l, fx);
        r = Math.max(r, fx);
        t = Math.min(t, fy - 16);
        b = Math.max(b, fy + 14);
      }
      x = (l + r) / 2 + (key.dx ?? 0);
      y = (t + b) / 2 + (key.dy ?? 0);
      if (key.fit) {
        const pad = key.pad ?? 70;
        const fz = Math.min((VIEW_W - pad * 2) / Math.max(1, r - l), (VIEW_H - pad) / Math.max(1, b - t));
        z = clamp(fz, key.fit[0], key.fit[1]);
      }
    }
    // slow push-in / pull-back over the shot (z multiplier drifts from 1 to drift)
    if (key.drift) {
      const span = Math.max(1, (key.until ?? this.spec.frames) - key.at);
      z *= 1 + (key.drift - 1) * clamp((this.vf - key.at) / span, 0, 1);
    }
    const cine = this.scene.match.cinematic;
    if (key.cine && cine) {
      x = cine.x;
      y = cine.y - 8;
      z = Math.max(z, key.cine);
    }
    cd.manual = { x, y, z, k: cine && key.cine ? 8 : (key.k ?? 5) };
    cd.update(dt, w, null);
  }

  /** end of a video frame */
  endFrame(): void {
    this.vf++;
  }
}

export function trailerEnabled(params: URLSearchParams): boolean {
  return params.has('trailer');
}
