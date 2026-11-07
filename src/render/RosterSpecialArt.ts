import type Phaser from 'phaser';
import { BF } from '../art/fighterArt';
import { moveLook } from '../art/heroMoves';
import { rosterSpecial } from '../sim/data/rosterSpecials';
import type { SimEvent } from '../sim/events';
import type { Fighter } from '../sim/fighter';
import type { FighterView } from './FighterView';

type G = Phaser.GameObjects.Graphics;
type SpecialEvent = Extract<SimEvent, { t: 'rosterSpecial' }>;
type Point = { x: number; y: number };
type StrikeMark = { event: SpecialEvent; age: number };

const TAU = Math.PI * 2;
const INK = 0x161222;
const STEEL = 0xdde9ed;
const VIOLET = 0xa664d9;
const ICE = 0xcffcff;
const WIND = 0xa3faca;
const PINK = 0xffa7d9;
const progress = (time: number, duration: number) => Math.max(0, Math.min(1, time / duration));
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

function pixel(g: G, x: number, y: number, color: number, alpha: number, size = 1): void {
  const offset = Math.floor(size / 2);
  g.fillStyle(color, alpha).fillRect(Math.round(x) - offset, Math.round(y) - offset, size, size);
}

function stroke(g: G, a: Point, b: Point, color: number, alpha: number, width = 1): void {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))));
  const offset = Math.floor(width / 2);
  g.fillStyle(color, alpha);
  for (let i = 0; i <= steps; i++) {
    g.fillRect(Math.round(mix(a.x, b.x, i / steps)) - offset, Math.round(mix(a.y, b.y, i / steps)) - offset, width, width);
  }
}

function arc(g: G, x: number, y: number, rx: number, ry: number, start: number, sweep: number, color: number, alpha: number, width = 1): void {
  const n = Math.max(10, Math.ceil(Math.abs(sweep) * Math.max(rx, ry) * 0.72));
  const offset = Math.floor(width / 2);
  g.fillStyle(color, alpha);
  for (let i = 0; i <= n; i++) {
    const a = start + sweep * i / n;
    g.fillRect(Math.round(x + Math.cos(a) * rx) - offset, Math.round(y + Math.sin(a) * ry) - offset, width, width);
  }
}

function disc(g: G, x: number, y: number, r: number, color: number, alpha: number): void {
  const px = Math.round(x);
  const py = Math.round(y);
  g.fillStyle(color, alpha);
  for (let h = -Math.floor(r); h <= r; h++) {
    const half = Math.floor(Math.sqrt(r * r - h * h));
    g.fillRect(px - half, py + h, 2 * half + 1, 1);
  }
}

function blade(g: G, hand: Point, d: number, angle: number, length: number, color: number, width = 2): void {
  const dx = d * Math.cos(angle), dy = Math.sin(angle);
  const end = { x: hand.x + dx * length, y: hand.y + dy * length };
  const hilt = { x: hand.x - dx * 3, y: hand.y - dy * 3 };
  stroke(g, hilt, end, INK, 1, width + 2);
  stroke(g, hand, end, color, 1, width);
  stroke(g, { x: hand.x + dy * 3, y: hand.y - dx * 3 }, { x: hand.x - dy * 3, y: hand.y + dx * 3 }, 0xc79b61, 1);
}

function petal(g: G, x: number, y: number, d: number, color: number, alpha: number): void {
  stroke(g, { x: x - d, y: y + 1 }, { x: x + d, y: y - 1 }, color, alpha, 2);
  pixel(g, x + d, y - 2, 0xffe6f7, alpha);
}

function slab(g: G, x: number, y: number, size: number, turn: number, alpha: number): void {
  const dx = Math.round(Math.sin(turn) * size * 0.55);
  const dy = Math.round(Math.cos(turn) * size * 0.32);
  const a = { x: x - size, y: y + dy }, b = { x: x + dx, y: y - size * 0.65 };
  const c = { x: x + size, y: y - dy }, d = { x: x - dx, y: y + size * 0.7 };
  g.fillStyle(0x565569, alpha).fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y);
  g.fillStyle(0x323746, alpha).fillTriangle(a.x, a.y, c.x, c.y, d.x, d.y);
  stroke(g, a, b, 0x91cfdd, alpha);
  stroke(g, b, c, 0xc3e5d9, alpha);
}

/** Close quarters and wind specials use poses separate from their ordinary melee chains. */
export function nonSwordRosterSpecialPose(f: Fighter) {
  const spec = rosterSpecial(f.hero);
  if (!spec) return undefined;
  const time = f.stateTime;
  const release = time - spec.windup;
  const load = progress(time, spec.windup);
  const settle = progress(release, spec.duration - spec.windup);
  const pose = { frame: BF.WINDUP, front: 0.7, back: 2.1, frontLen: 0, backLen: 0, rigRot: 0, leanTarget: 0, rigLift: 0, armYScale: 1 };
  switch (f.hero || 'scrapper') {
    case 'vegeta':
      return { ...pose, frame: release < 0 ? BF.CROUCH : release < 0.15 ? BF.CROSS : BF.AIM,
        front: release < 0 ? mix(0.8, -0.72, load) : mix(-0.16, 0.98, settle),
        back: 2.55, frontLen: release >= 0 ? 1 : 0, leanTarget: release < 0 ? -0.18 : 0.25 * (1 - settle) };
    case 'sanji': {
      const spin = progress(release + 0.08, spec.duration - spec.windup + 0.08);
      const rise = Math.min(1, spin * 5);
      const recovery = progress(spin - 0.75, 0.25);
      const rigRot = mix(0.4, Math.PI, rise) * (1 - recovery);
      const planted = progress(rigRot - 2.25, 0.84);
      return { ...pose, frame: spin < 0.06 ? BF.CROUCH : Math.floor(spin * 12) % 2 ? BF.KICK : BF.APEX,
        front: -1.32, back: -1.9, frontLen: 1, backLen: 1,
        rigRot, rigLift: Math.round(planted * 6), armYScale: 1 + planted * 0.8 };
    }
    case 'yuno': {
      const open = time < spec.windup ? load : 1 - settle * 0.5;
      const launch = time >= spec.beats[spec.beats.length - 1];
      return { ...pose, frame: f.flying ? BF.HOVER : launch ? BF.UPPER : BF.WINDUP,
        front: mix(0.86, launch ? -1.5 : -0.16, open), back: launch ? 2.65 : mix(1.8, 0.24, open),
        frontLen: 1, backLen: launch ? 0 : 1, leanTarget: launch ? -0.12 : 0.04 };
    }
    case 'scrapper':
      return { ...pose, frame: release < 0 ? BF.CROUCH : BF.CROSS, front: release < 0 ? 1.4 : -0.56,
        back: 2.5, frontLen: 0, leanTarget: release < 0 ? 0.08 : 0.38 * (1 - settle) };
    default:
      return undefined;
  }
}

/** Effect lifetimes stay in world space when the caster crosses or loses the target. */
export class RosterSpecialArt {
  private readonly focus = new Map<number, SpecialEvent>();
  private readonly marks: StrikeMark[] = [];

  constructor(private readonly back: G, private readonly front: G) {}

  onEvent(event: SpecialEvent): void {
    if (event.phase === 'start') this.focus.set(event.f, event);
    else if (event.phase === 'active') this.marks.push({ event, age: 0 });
    else this.focus.delete(event.f);
  }

  drawFighter(view: FighterView, x: number, feet: number): boolean {
    const f = view.fighter;
    const spec = f.state === 'special' && f.specialKind === 'rosterSpecial' ? rosterSpecial(f.hero) : undefined;
    if (!spec) {
      this.focus.delete(f.id);
      return false;
    }
    const front = this.front, back = this.back, d = f.facing;
    const t = f.stateTime, load = progress(t, spec.windup);
    const active = t >= spec.windup;
    const finish = progress(t - spec.windup, spec.duration - spec.windup);
    const target = this.focus.get(f.id);
    const hand = view.frontHand() ?? { x: x + d * 5, y: feet - 13 };
    const style = moveLook(f.hero, f.powerLevel);
    const cx = target?.x ?? f.anchorX;
    const cy = target?.y ?? f.anchorY;
    switch (f.hero || 'scrapper') {
      case 'vegeta': {
        if (active) break;
        const r = mix(11, 3, load);
        const c = f.powerLevel === 4 ? 0x8de8ff : 0xffd878;
        for (let i = 0; i < 5; i++) {
          const a = i * TAU / 5 + t * 7;
          const tip = { x: hand.x + r * Math.cos(a), y: hand.y + r * Math.sin(a) };
          stroke(front, tip, { x: hand.x + (r + 4) * Math.cos(a + 0.3), y: hand.y + (r + 4) * Math.sin(a + 0.3) }, c, 0.84);
        }
        pixel(front, hand.x, hand.y, c, 0.9, 2 + Math.floor(load * 3));
        break;
      }
      case 'zoro': {
        blade(front, hand, d, view.swordAngle() ?? 2.75, 15, STEEL);
        const sheath = view.backHand() ?? { x: x - d * 4, y: feet - 9 };
        blade(back, sheath, d, 2.88, 14, 0x664867);
        if (!active) {
          const glint = Math.max(0.15, load ** 3);
          stroke(front, { x: hand.x - 3, y: hand.y - 1 }, { x: hand.x + 3, y: hand.y - 1 }, style.spark, glint);
          pixel(front, hand.x, hand.y - 2, STEEL, glint, 2);
        }
        break;
      }
      case 'sanji':
        if (active && finish < 0.85) {
          const a = 0.85 - finish * 0.54;
          const r = 11 + Math.sin(finish * Math.PI) * 7;
          arc(back, x, feet - 15, r, 5, t * d * 18, 4.2 * d, style.rim, a, 3);
          arc(front, x, feet - 16, r + 1, 5, t * d * 18 + Math.PI, 2.45 * d, style.spark, a);
          for (let i = 0; i < 4; i++) {
            const bearing = t * 21 * d + i * Math.PI * 0.5;
            const px = x + Math.cos(bearing) * r;
            const py = feet - 15 + Math.sin(bearing) * 5;
            stroke(front, { x: px, y: py }, { x: px - d * (3 + i % 2 * 4), y: py - 3 }, style.core, a, 2);
          }
        }
        break;
      case 'law': {
        const r = 11 + 11 * load;
        arc(back, cx, cy + 9, r, r * 0.38, -t * 5, TAU, 0x7eddec, 0.46);
        arc(back, cx, cy - 3, r * 0.72, r * 0.84, t * 4, Math.PI * 1.5, 0x7eddec, 0.36);
        const lift = progress(t - spec.windup, (spec.beats[1] ?? spec.duration) - spec.windup);
        if (lift > 0 && lift < 1) {
          for (let i = 0; i < 4; i++) slab(i % 2 ? back : front, cx + (i - 1.5) * 11, cy + 8 - lift * (18 + i * 6), 3 + i % 2, t * 7 + i, 0.87);
        }
        break;
      }
      case 'ichigo':
        if (!active) {
          for (let i = 0; i < 3; i++) {
            const reach = (1 - load) * (10 + i * 4);
            stroke(back, { x: x - d * (5 + reach), y: feet - 6 - i * 6 }, { x: x - d * (2 + reach), y: feet - 11 - i * 6 }, i % 2 ? style.spark : INK, 0.73, 2);
          }
        }
        break;
      case 'rukia':
        if (!active) {
          const r = (target?.radius || 26) * (0.82 + load * 0.18);
          arc(back, cx, cy, r, 4, 0, TAU, 0x76d1ed, 0.68);
          for (const side of [-1, 1]) {
            const from = { x: cx + side * r, y: cy };
            stroke(front, from, { x: from.x - side * 3, y: from.y - 5 - load * 6 }, ICE, 0.84);
          }
        }
        break;
      case 'byakuya':
        if (!active) {
          for (let i = 0; i < 6; i++) {
            const a = t * 7 + i * TAU / 6;
            petal(front, hand.x + Math.cos(a) * (4 + 5 * load), hand.y + Math.sin(a) * (4 + 3 * load), d, PINK, 0.35 + load * 0.54);
          }
          for (const side of [-1, 1]) stroke(back, { x: cx + side * (16 + 5 * load), y: cy - 25 }, { x: cx + side * (16 + 5 * load), y: cy - 17 }, PINK, 0.59);
        }
        break;
      case 'asta': {
        blade(front, hand, d, view.swordAngle() ?? -1.8, f.powerLevel >= 3 ? 19 : 16, f.powerLevel >= 2 ? 0x4f3346 : 0x8d7e89, 4);
        if (!active) arc(back, x, feet - 11, 11 + load * 8, 8, -t * 8, Math.PI * 1.2, 0xfa526c, 0.51);
        break;
      }
      case 'yuno': {
        const launch = t >= spec.beats[spec.beats.length - 1];
        if (launch) break;
        const r = Math.max(7, (target?.radius || 42) * mix(0.95, 0.44, finish));
        for (let i = 0; i < 3; i++) {
          const a = t * (10 + i * 2) + i * 2;
          const y = cy + 9 - i * 8 - finish * i * 8;
          arc(i % 2 ? front : back, cx, y, r - i * 2, 3 + i, a, 4.6, WIND, 0.59 + i * 0.12, 2);
          const tip = { x: cx + Math.cos(a) * (r - i * 2), y: y + Math.sin(a) * (3 + i) };
          pixel(front, tip.x, tip.y, f.powerLevel >= 3 ? 0xfff9a5 : 0xedfff1, 0.86, 2);
        }
        break;
      }
      case 'yami': {
        const collapse = progress(t - spec.beats[1], spec.duration - spec.beats[1]);
        const field = target?.radius || 34;
        const r = (active ? field : mix(7, 15, load)) * (1 - collapse * 0.86);
        const moon = { x: active ? cx : mix(x - d * 6, cx, load), y: active ? cy : mix(feet - 23, cy, load) };
        disc(back, moon.x, moon.y, r * 0.46, INK, 0.86 * (1 - collapse));
        arc(back, moon.x, moon.y, r, r * 0.57, t * 2, TAU, VIOLET, 0.57 * (1 - collapse));
        for (let i = 0; i < 5; i++) {
          const a = i * TAU / 5 + t * 3;
          const tail = r + 4 + ((i * 5 - t * 26) % 8 + 8) % 8;
          stroke(back, { x: moon.x + Math.cos(a) * tail, y: moon.y + Math.sin(a) * tail * 0.6 }, { x: moon.x + Math.cos(a + 0.16) * (tail - 4), y: moon.y + Math.sin(a + 0.16) * (tail - 4) * 0.6 }, VIOLET, 0.53 * (1 - collapse));
        }
        blade(front, hand, d, view.swordAngle() ?? -1.15, 18, 0xb4a0c3);
        break;
      }
      case 'scrapper':
        if (!active) stroke(back, { x: x - d * 8, y: feet - 2 }, { x: x - d * (10 + load * 5), y: feet - 2 }, 0xd5af86, 0.7, 2);
        break;
    }
    return true;
  }

  drawMarks(dt: number): void {
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const mark = this.marks[i];
      const hero = mark.event.hero;
      const duration = hero === 'byakuya' || hero === 'rukia' ? 0.29 : hero === 'sanji' ? 0.17 : 0.24;
      this.drawStrike(mark.event, progress(mark.age, duration));
      mark.age += dt;
      if (mark.age >= duration) this.marks.splice(i, 1);
    }
  }

  private drawStrike(e: SpecialEvent, k: number): void {
    const { x, y, ox, oy, facing: d, pulse, level } = e;
    const a = 1 - k;
    const r = Math.max(8, e.radius);
    const front = this.front, back = this.back;
    const style = moveLook(e.hero, level);
    switch (e.hero) {
      case 'vegeta': {
        const core = level === 4 ? 0xb7f6ff : 0xffedb0;
        const rim = level === 4 ? 0x579df6 : 0xf6a44d;
        if (pulse === 0) {
          const tip = { x: x + d * (5 + k * 9), y: y - 1 };
          stroke(front, { x: x - d * 7, y: y + 1 }, tip, core, a, 2);
          stroke(front, { x: tip.x - d * 4, y: tip.y - 5 }, { x: tip.x + d * 2, y: tip.y + 3 }, rim, a);
          pixel(front, x, y, core, a, 3);
          break;
        }
        const spread = Math.min(30, r) * (0.25 + 0.75 * k);
        disc(back, x, y, spread * 0.64, rim, a * 0.34);
        for (let i = 0; i < 7; i++) {
          const bearing = i * TAU / 7 + 0.22;
          const vx = Math.cos(bearing), vy = Math.sin(bearing) * 0.72;
          const tip = { x: x + vx * (spread + (i % 2) * 7), y: y + vy * spread };
          stroke(front, { x: x + vx * spread * 0.45, y: y + vy * spread * 0.45 }, tip, i % 2 ? rim : core, a, i % 2 ? 2 : 1);
          pixel(front, tip.x + vx * 3, tip.y + vy * 3, core, a, 2);
        }
        stroke(front, { x: x - d * 7, y }, { x: x + d * (9 + spread * 0.78), y: y - 2 }, core, a, 2);
        break;
      }
      case 'zoro': {
        const end = { x, y: y - 2 };
        const start = { x: ox - d * 5, y: oy + 2 };
        stroke(back, start, end, INK, a * 0.72, 4);
        stroke(front, { x: start.x, y: start.y - k * 3 }, end, style.spark, a, 2);
        for (let i = 0; i < 5; i++) {
          const tip = { x: mix(ox, end.x, i / 4), y: mix(oy + 2, end.y, i / 4) + (i % 2 ? -4 : 5) * k };
          stroke(front, tip, { x: tip.x - d * (3 + i), y: tip.y }, STEEL, a * 0.84);
        }
        break;
      }
      case 'sanji': {
        const hx = x - d * (2 + 6 * k), hy = y + (pulse % 2 ? -3 : 2);
        const reach = Math.min(23, r) * (0.75 + k * 0.35);
        arc(front, hx, hy, reach, 5 + 2 * k, pulse * 1.32 + k * d * 1.9, 3.3 * d, style.rim, a, 3);
        arc(front, hx, hy - 1, reach + 1, 5 + 2 * k, pulse * 1.32 + k * d * 1.9 + 0.4, 1.76 * d, style.core, a, 2);
        for (let i = 0; i < 5; i++) pixel(back, x - d * (8 + i * 4 + k * 16), y + (i % 3) * 4, style.spark, a, 2);
        break;
      }
      case 'law':
        for (let i = 0; i < 6; i++) {
          const spread = (i - 2.5) * (4 + k * (pulse === 0 ? 2 : 8));
          const vertical = pulse === 0 ? -24 * k : 10 + 24 * k;
          slab(i % 2 ? back : front, x + spread, y + 8 + vertical + i % 3 * 4, 2 + i % 3, k * 4 + i, a);
        }
        if (pulse !== 0) arc(front, x, y + 8 + k * 18, 5 + k * 23, 2 + k * 3, 0, TAU, 0x80dce7, a);
        break;
      case 'ichigo': {
        const rising = pulse === 0;
        const start = rising ? 0.75 : -1.65;
        const turn = rising ? -1.95 : 2.0;
        const reach = Math.min(35, r) * (0.78 + k * 0.35);
        const cx = x - d * 5;
        const angle = (d > 0 ? 0 : Math.PI) + (start + k * turn * 0.25) * d;
        arc(back, cx, y + (rising ? 5 : -4), reach, reach * 0.88, angle, turn * d, INK, a, 6);
        arc(front, cx, y + (rising ? 5 : -4), reach + 2, reach * 0.9, angle, turn * d, style.spark, a, 2);
        stroke(front, { x: cx + d * 5, y: y + (rising ? 11 : -14) }, { x: cx + d * (reach + 5), y: y + (rising ? -19 : 14) }, STEEL, a * 0.7);
        break;
      }
      case 'rukia': {
        if (pulse === 0) {
          const radius = Math.min(26, r);
          arc(back, x, y, radius * (1 - 0.25 * k), 4, 0, TAU, ICE, a);
          for (const side of [-1, 1]) {
            const corner = { x: x + side * radius * (1 - k * 0.45), y };
            const twist = { x: x - side * (4 + k * 6), y: y - 8 };
            stroke(front, corner, twist, 0x76cce5, a, 3);
            stroke(front, twist, { x: x + side * 3, y: y - 17 - k * 5 }, ICE, a, 2);
          }
        } else {
          for (let i = -2; i <= 2; i++) {
            const base = { x: x + i * 4, y };
            const tip = { x: base.x + i * 2, y: base.y - (28 - Math.abs(i) * 5) * Math.min(1, k * 4 + 0.38) };
            const side = { x: tip.x + 3, y: tip.y + 11 };
            back.fillStyle(i % 2 ? 0x6ab8d9 : 0x377c9e, a * 0.82).fillTriangle(base.x - 3, base.y, tip.x, tip.y, side.x, side.y);
            stroke(front, base, tip, ICE, a, 2);
            pixel(front, tip.x + i, tip.y - 2 - k * 7, ICE, a, 2);
          }
        }
        break;
      }
      case 'byakuya': {
        const lane = pulse === 0 ? -d * 7 : pulse === 1 ? d * 6 : 0;
        const fall = k * 42;
        for (let i = 0; i < 12; i++) {
          const px = x + lane + (i % 6 - 2.5) * 5 + Math.sin(i * 3.4 + k * 8) * (2 + k * 4);
          const py = y - 30 + fall + Math.floor(i / 6) * 23 + i % 3 * 3;
          petal(i % 3 ? front : back, px, py, i % 2 ? d : -d, i % 3 ? PINK : 0xed65b5, a);
        }
        break;
      }
      case 'asta': {
        const reach = Math.min(r, 36) * (0.55 + 0.55 * k);
        const facing = d > 0 ? 0 : Math.PI;
        arc(back, x, y + 1, reach, reach * 0.52, facing - d * 1.3, d * 2.65, INK, a, 6);
        arc(front, x, y + 1, reach + 3, reach * 0.58, facing - d * 1.3, d * 2.65, 0xfa526c, a, 2);
        for (let i = 0; i < 7; i++) {
          const theta = i * TAU / 7 + 0.3;
          const edge = { x: x + Math.cos(theta) * reach, y: y + Math.sin(theta) * reach * 0.64 };
          stroke(front, edge, { x: edge.x + d * 3, y: edge.y - 3 }, 0xff9aab, a * 0.8);
          pixel(front, edge.x - d * 2, edge.y + 2, INK, a, 3);
        }
        break;
      }
      case 'yuno':
        for (let i = 0; i < (pulse < 2 ? 2 : 5); i++) {
          const radius = (pulse < 2 ? 22 - k * 12 : 9 + i * 2) * (0.96 + k * 0.16);
          const cy = y + (pulse < 2 ? -i * 9 : 9 - i * 7 - k * 27);
          const theta = k * 7 + i * 1.8;
          arc(i % 2 ? front : back, x, cy, radius, 3 + i * 0.8, theta, 4.2, WIND, a, 2);
          pixel(front, x + Math.cos(theta) * radius, cy + Math.sin(theta) * 5, level >= 3 ? 0xfff9a5 : 0xe5fff1, a, 2);
        }
        break;
      case 'yami': {
        if (pulse === 0) {
          arc(back, x, y, r * (1.03 + k * 0.24), r * 0.55, k * 3, TAU, VIOLET, a * 0.73, 2);
          break;
        }
        const end = { x: x + d * Math.min(r, 31) * (0.52 + k * 0.48), y: y - 5 };
        const start = { x: x - d * 10, y: y + 3 };
        const knot = { x: mix(start.x, end.x, 0.49), y: y - 2 - k * 4 };
        stroke(back, start, knot, INK, a, 6);
        stroke(back, knot, end, INK, a, 5);
        stroke(front, start, knot, VIOLET, a, 2);
        stroke(front, knot, end, 0xd6a5ec, a);
        for (const side of [-1, 1]) stroke(front, knot, { x: knot.x + d * 7, y: knot.y + side * (5 + 8 * k) }, VIOLET, a * 0.75);
        break;
      }
      case 'scrapper':
        for (let i = 0; i < 4; i++) {
          const start = { x: x - d * (4 + k * 9), y: y + 7 - i * 4 };
          stroke(front, start, { x: start.x + d * (6 + i * 3), y: start.y - 2 }, i % 2 ? 0xe8bb92 : 0xa78465, a, 2);
        }
        break;
    }
  }
}
