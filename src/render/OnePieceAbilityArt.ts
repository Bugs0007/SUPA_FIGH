import type Phaser from 'phaser';
import { ONE_PIECE_MOVES } from '../art/onePieceArt';
import { BF } from '../art/fighterArt';
import { ONE_PIECE_HEROES } from '../sim/data/onePieceHeroes';
import { activeWeapon, type Fighter } from '../sim/fighter';
import { beamOrigin, dashDir, gatlingReach, rasenganPoint } from '../sim/hero';
import type { Bullet } from '../sim/projectile';
import type { FighterView } from './FighterView';
import { formLevel } from './formLevel';

type G = Phaser.GameObjects.Graphics;
type Point = { x: number; y: number };
type Style = { rim: number; spark: number; core: number };
const TAU = Math.PI * 2;
const INK = 0x221e31;
const STEEL = 0xe2eced;
const GOLD = 0xe1b36a;
const AIR = { rim: 0x7694a9, spark: 0xdce7ea, core: 0xfff7df };

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const progress = (elapsed: number, span: number) => clamp(elapsed / span);
const on = (p: Point, angle: number, distance: number): Point => ({ x: p.x + Math.cos(angle) * distance, y: p.y + Math.sin(angle) * distance });

function pixel(g: G, p: Point, size: number, color: number, alpha: number): void {
  g.fillStyle(color, alpha).fillRect(Math.round(p.x - (size - 1) / 2), Math.round(p.y - (size - 1) / 2), size, size);
}

function stroke(g: G, a: Point, b: Point, color: number, alpha: number, width = 1): void {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))));
  g.fillStyle(color, alpha);
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    g.fillRect(Math.round(a.x + (b.x - a.x) * k - (width - 1) / 2), Math.round(a.y + (b.y - a.y) * k - (width - 1) / 2), width, width);
  }
}

/** An irregular pixel crescent with a tapered white edge. Angles are in world coordinates. */
function cut(g: G, c: Point, radius: number, squash: number, start: number, sweep: number, style: Style, alpha: number, thick = 3): void {
  const n = Math.min(192, Math.max(8, Math.ceil(Math.abs(sweep) * radius * 0.85)));
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const angle = start + sweep * k;
    const width = Math.max(1, Math.round(thick * Math.sin(Math.PI * k)));
    const dx = Math.cos(angle), dy = Math.sin(angle) * squash;
    pixel(g, { x: c.x + dx * (radius - width / 2), y: c.y + dy * (radius - width / 2) }, width, style.rim, alpha * 0.82);
    pixel(g, { x: c.x + dx * radius, y: c.y + dy * radius }, i % 4 === 0 ? 2 : 1, i % 3 ? style.spark : style.core, alpha);
  }
}

function sword(g: G, hand: Point, angle: number, length: number, shine: number, alpha = 1, black = false, gripped = false): void {
  const heel = on(hand, angle, gripped ? Math.min(length, 2) : 0);
  const bevel = on(hand, angle, Math.max(gripped ? Math.min(length, 2) : 0, length - 3));
  const tip = on(hand, angle, length);
  const edge = angle - Math.PI / 2;
  stroke(g, heel, bevel, INK, alpha, 3);
  stroke(g, bevel, tip, INK, alpha, 2);
  stroke(g, heel, bevel, black ? 0x4f415e : 0x92acb6, alpha, 2);
  stroke(g, on(heel, edge, 1), on(bevel, edge, 1), shine, alpha);
  stroke(g, on(bevel, edge, 1), tip, shine, alpha);
  stroke(g, on(hand, angle, gripped ? -2 : 0), on(hand, angle, -4), INK, alpha, 3);
  pixel(g, on(hand, angle, -3), 1, STEEL, alpha);
  const guard = on(hand, angle, gripped ? 2 : 1);
  stroke(g, on(guard, angle - Math.PI / 2, 2), on(guard, angle + Math.PI / 2, 2), GOLD, alpha);
}

/** Stepped fire ribbons made of embers and a hot centre, trailing from a moving heel. */
function flame(g: G, p: Point, dir: Point, size: number, time: number, style: Style, alpha: number): void {
  for (let i = 15; i >= 0; i--) {
    const t = i / 15;
    const wave = Math.sin(t * 5 + time * 22) * size * 0.36 * t;
    const a = { x: p.x - dir.x * t * size * 2 - dir.y * wave, y: p.y - dir.y * t * size * 2 + dir.x * wave - t * t * size * 0.5 };
    const width = Math.max(1, Math.round(size * (1 - t) ** 0.7));
    pixel(g, a, width + 1, style.rim, alpha * (1 - t * 0.75));
    if (width > 1) pixel(g, a, width - 1, t < 0.26 ? style.core : style.spark, alpha);
    if (i % 5 === 2) pixel(g, { x: a.x - dir.y * size, y: a.y + dir.x * size - 3 }, 1, style.spark, alpha * 0.68);
  }
}

function room(g: G, p: Point, radius: number, age: number, color: number, alpha: number): void {
  if (radius < 1) return;
  const n = Math.min(140, Math.ceil(radius * TAU));
  for (let i = 0; i < n; i++) {
    const angle = (i * TAU) / n;
    const x = p.x + Math.cos(angle) * radius;
    const y = p.y + Math.sin(angle) * radius * 0.74;
    pixel(g, { x, y }, (i + Math.floor(age * 24)) % 12 < 3 ? 2 : 1, color, alpha);
    if (i % 2 === 0) pixel(g, { x, y: p.y + Math.sin(angle) * radius * 0.24 }, 1, color, alpha * 0.6);
  }
  for (const side of [-1, 1]) {
    const x = Math.round(p.x + side * radius);
    const y = Math.round(p.y);
    g.fillStyle(color, alpha).fillRect(x - 3, y, 7, 1).fillRect(x, y - 3, 1, 7);
  }
}

type PoseOverride = { frame: number; arm: number; backArm: number; lean: number };

/** Tie the sprite rig to the same contact frames used by the weapons and kick ribbons. */
export function onePiecePose(f: Fighter): PoseOverride | undefined {
  if (!Object.hasOwn(ONE_PIECE_HEROES, f.hero)) return;
  const h = ONE_PIECE_HEROES[f.hero];
  const t = f.stateTime;
  if (f.state === 'melee' && activeWeapon(f).hold === 'fist') {
    const hit = h.combo[Math.min(f.combo, h.combo.length - 1)];
    const wound = t < hit.windup;
    const active = t < hit.windup + hit.active + hit.recover * 0.36;
    const strike = f.hero === 'sanji'
      ? (f.combo >= 2 || !f.grounded ? BF.AIRKICK : BF.KICK)
      : hit.kick ? BF.KICK : BF.CROSS;
    return { frame: wound ? BF.WINDUP : active ? strike : BF.IDLE0, arm: f.hero === 'sanji' ? 2.1 : wound ? -0.75 : -0.16, backArm: f.hero === 'zoro' && active ? -0.9 : 1.8, lean: wound ? -0.06 : 0.12 };
  }
  if (f.state !== 'special') return;
  if (f.specialKind === 'rasengan' && h.base.dash) {
    const windup = t < h.base.dash.windup;
    return { frame: windup ? BF.WINDUP : f.hero === 'sanji' ? BF.KICK : BF.CROSS, arm: f.hero === 'sanji' ? 2.2 : windup ? -0.45 : f.dashAngle, backArm: f.hero === 'zoro' ? -1.55 : 2.4, lean: windup ? -0.08 : 0.16 };
  }
  if (f.specialKind === 'gatling' && h.second.gatling) {
    const { time, every } = h.second.gatling;
    const last = t >= time - every;
    const kicking = last ? t < time + 0.09 : t >= every && t % every < every * 0.68;
    const high = last || Math.floor(t / every) % 2 === 0;
    return { frame: kicking ? (high ? BF.AIRKICK : BF.KICK) : BF.WINDUP, arm: high ? 2.25 : 1.9, backArm: 1.8, lean: kicking ? 0.07 : -0.07 };
  }
  if (f.specialKind === 'bomb' && h.super.bomb?.centered) {
    const recovery = t > 0.18;
    if (f.hero === 'sanji') return { frame: recovery ? BF.LAND : BF.AIRKICK, arm: 2.3, backArm: -1.3, lean: recovery ? 0 : -0.12 };
    return { frame: recovery ? BF.LAND : t < 0.07 ? BF.UPPER : BF.CROSS, arm: -0.85 + t * 5, backArm: -1.95 + t * 3, lean: recovery ? 0 : 0.14 };
  }
  if (f.hero === 'law' && ['beamCharge', 'beam', 'superCharge', 'superBeam', 'blink'].includes(f.specialKind)) {
    const active = f.specialKind === 'beam' || f.specialKind === 'superBeam';
    return { frame: active ? BF.CROSS : BF.WINDUP, arm: active ? f.stretchAngle : -0.45, backArm: 1.95, lean: active ? 0.12 : -0.08 };
  }
}

function combo(g: G, v: FighterView, x: number, y: number, level: number, style: Style, time: number): void {
  const f = v.fighter;
  const d = f.facing;
  const facing = d > 0 ? 0 : Math.PI;
  if (f.hero === 'sanji') {
    const h = ONE_PIECE_HEROES.sanji;
    const hit = h.combo[Math.min(f.combo, h.combo.length - 1)];
    const elapsed = f.stateTime - hit.windup;
    const strike = progress(elapsed, hit.active + hit.recover * 0.38);
    const opacity = 1 - progress(elapsed - hit.active, hit.recover * 0.78);
    if (elapsed < 0 || opacity <= 0) return;
    const reach = hit.range + f.w / 2 + (h.forms[level - 1]?.reach ?? 0);
    const heel = { x: x + d * (6 + Math.sin(strike * Math.PI) * 6), y: y - 10 - f.combo * 2 };
    if (level > 0) flame(g, heel, { x: d, y: -0.25 }, level === 4 ? 5 : 4, time, style, opacity);
    cut(g, { x: x + d, y: y - 11 }, reach, 0.55, facing - d * 0.88, d * 1.65 * (1 - strike * 0.48), style, opacity, hit.kick ? 4 : 2);
    return;
  }
  const angle = v.swordAngle();
  const hand = v.frontHand();
  if (!hand || angle === undefined) return;
  const length = (f.hero === 'zoro' ? 14 : 16) + level * 0.65;
  if (v.swordDrawVisible()) {
    sword(g, hand, facing + d * angle, length * v.swordProjection(), level >= 2 ? style.spark : STEEL, 1, f.hero === 'zoro' && level > 0, true);
  }
  if (f.hero !== 'zoro') return;
  const rear = v.backHand(), rearAngle = v.swordAngle(true), mouth = v.mouth();
  if (rear && rearAngle !== undefined) sword(g, rear, facing + d * rearAngle, length * 0.78 * v.swordProjection(true), STEEL, 0.88, level > 0, true);
  if (mouth) sword(g, mouth, facing + d * 0.09, length * 0.76, 0xb5c8cf, 0.84, false, true);
}

function dash(g: G, v: FighterView, x: number, y: number, level: number, style: Style, time: number): void {
  const f = v.fighter;
  const spec = ONE_PIECE_HEROES[f.hero].base.dash!;
  const forming = progress(f.stateTime, spec.windup);
  const fade = f.recoverAt > 0 ? 1 - progress(f.stateTime - f.recoverAt, spec.recover) : 1;
  if (fade <= 0) return;
  const dir = dashDir(f);
  const angle = Math.atan2(dir.y, dir.x);
  const center = rasenganPoint({ ...f, x, y });
  if (f.hero === 'sanji') {
    const heel = forming < 1 ? { x: x - f.facing * 4, y: y - 3 } : center;
    if (level > 0) flame(g, heel, forming < 1 ? { x: 0, y: 1 } : dir, (2 + forming * 4 + level * 0.5) * fade, time, style, fade);
    if (forming === 1) {
      const origin = on(center, angle, -6);
      cut(g, origin, spec.radius + level, 0.82, angle - 0.85, 1.7, style, fade, 4);
      for (let i = -1; i <= 1; i++) {
        const at = on(center, angle + Math.PI / 2, i * 5);
        stroke(g, on(at, angle, -16 - 5 * Math.abs(i)), on(at, angle, -6), style.spark, fade * 0.68);
      }
    }
    return;
  }
  const grip = v.frontHand() ?? { x: x + f.facing * 5, y: y - 13 };
  const crossing = forming < 1 ? 1.26 - forming * 0.4 : 0.26;
  sword(g, grip, angle - crossing, 17, style.spark, fade, level > 0);
  sword(g, { x: grip.x - f.facing * 2, y: grip.y + 2 }, angle + crossing, 16, STEEL, fade, level > 0);
  sword(g, { x: x + f.facing * 3, y: y - 24 }, angle - 0.05, 12, STEEL, fade);
  if (forming === 1) {
    for (const side of [-1, 1]) cut(g, on(center, angle, -5), spec.radius + 3 + level, 0.9, angle + side * 0.32 - 0.85, 1.7, style, fade, 3);
    stroke(g, on(center, angle, -23), on(center, angle, -9), style.spark, fade * 0.72);
  }
}

const TWISTER_FACE = [
  '         #####',
  '      ###bbbb###',
  '    ##bbbhbbbbbb##',
  '  ###bbbhhhhhbbbbb###',
  ' ##bbbbh#######hbbbbb#####    ####',
  '##bbbbh##eeee###bbhhhbbbbb####hbbb###',
  '#bbbbb##bbbb##bbbbhbbbbbbbbbhbbbbbbb##',
  '#bbbbbb##h##bbbhhbbbbbbbbbbbbbbb##bbbb###',
  '#bbhbbbbbhhbbhhhbbbbbbbbbbbbbbbbbbbb#####',
  '##bbhhbbbbbbhhbbbbbbbbbbbbbbbb#######ff#',
  ' ##bbhhbbbbbbbbbbbb###########f   f  f',
  '  ##bbbbbbbbbbbbbb#m       fff',
  '  ##bbbbbbbbbbbbb##mmmmmm   f',
  '   ##bbbbbbbbbbb##mm   ff      f',
  '    #bbbbbbbbbb##mm####ff#####ff###',
  '    ##bbbbbbbbbb####hhhhbbhhhhhbb###',
  '    ##bbbbbbbbbbbbbbbbbbbbbbbbbb###',
  '     ##bbbbbbbbbbbbbb###########',
  '     ###bbbbbbbbbb###',
  '       ############',
];

const TWISTER_WIND = { rim: 0x518f72, spark: 0x9de5bc, core: 0xebffe7, outline: 0x245149, eye: 0xcfff89 };
const TWISTER_ENMA = { rim: 0x462958, spark: 0xb284dc, core: 0xffd89a, outline: 0x27182f, eye: 0xffb45f };

/** Armored brow and long split jaws lead the rising wind. */
function twisterFace(g: G, neck: Point, dir: number, enma: boolean, alpha: number): void {
  const p = enma ? TWISTER_ENMA : TWISTER_WIND;
  const scale = enma ? 1.22 : 1;
  const pt = (x: number, y: number) => ({ x: neck.x + dir * x * scale, y: neck.y + y * scale });
  const antler = (from: Point, joint: Point, end: Point) => {
    stroke(g, from, joint, p.outline, alpha, 6);
    stroke(g, joint, end, p.outline, alpha, 2);
    stroke(g, from, joint, p.rim, alpha, 3);
    stroke(g, joint, end, p.spark, alpha);
  };
  antler(pt(-1, -8), pt(-10, -15), pt(-23, -14));
  antler(pt(7, -9), pt(1, -17), pt(-11, -19));
  if (enma) {
    stroke(g, pt(-10, -15), pt(-17, -20), p.spark, alpha, 2);
    stroke(g, pt(1, -17), pt(-4, -22), p.core, alpha);
  }
  stroke(g, pt(-6, -3), pt(-19, -8), p.outline, alpha, 5);
  stroke(g, pt(-7, 1), pt(-21, -1), p.rim, alpha, 4);
  stroke(g, pt(-6, 5), pt(-17, 9), p.outline, alpha, 3);
  const colors: Record<string, number> = { '#': p.outline, b: p.rim, h: p.spark, e: p.eye, f: p.core, m: INK };
  TWISTER_FACE.forEach((line, y) => {
    for (let x = 0; x < line.length;) {
      const mark = line[x];
      let end = x + 1;
      while (line[end] === mark) end++;
      const color = colors[mark];
      if (color !== undefined) {
        const a = pt(x - 10, y - 10), b = pt(end - 10, y - 9);
        const left = Math.round(Math.min(a.x, b.x)), top = Math.round(a.y);
        g.fillStyle(color, alpha).fillRect(left, top, Math.round(Math.max(a.x, b.x)) - left, Math.round(b.y) - top);
      }
      x = end;
    }
  });
  const whisker = pt(31, -7);
  stroke(g, pt(23, -4), whisker, p.spark, alpha);
  stroke(g, whisker, pt(37, -5), p.core, alpha);
  stroke(g, pt(19, -1), pt(28, 2), p.spark, alpha * 0.76);
}

function dragonTwister(back: G, front: G, x: number, y: number, d: number, r: number, k: number, alpha: number, enma: boolean): void {
  const palette = enma ? TWISTER_ENMA : TWISTER_WIND;
  const facing = d > 0 ? 0 : Math.PI;
  const height = 54 + k * 22;
  const visibility = alpha * (0.67 + 0.33 * clamp(k * 8));
  const coil = (t: number): Point => {
    const angle = (1.33 * t - 0.7 + k * 0.32) * TAU;
    const arc = Math.sin(Math.PI * t);
    return {
      x: x + d * r * (Math.sin(angle) * arc * 0.65 + t * t * (0.24 + k * 0.18)),
      y: y - 4 - height * t + Math.cos(angle) * arc * r * 0.09,
    };
  };
  let previous = coil(0);
  for (let i = 1; i <= 56; i++) {
    const t = i / 56;
    const p = coil(t);
    const width = 2 + Math.round(Math.sin(t * Math.PI / 2) * (enma ? 12 : 8));
    stroke(back, previous, p, palette.outline, visibility * 0.9, width + 2);
    stroke(back, { x: previous.x, y: previous.y - 1 }, { x: p.x, y: p.y - 1 }, palette.rim, visibility, width);
    if (i % 3 !== 0) stroke(back, { x: previous.x, y: previous.y - width / 3 }, { x: p.x, y: p.y - width / 3 }, palette.spark, visibility * 0.86, 2);
    if (i % 5 === 0 && t > 0.2) {
      stroke(back, { x: p.x - d * width * 0.4, y: p.y + 1 }, { x: p.x + d, y: p.y + width * 0.4 }, palette.core, visibility * 0.72);
      pixel(back, { x: p.x - d * 2, y: p.y - width * 0.65 }, 2, palette.spark, visibility * 0.76);
    }
    previous = p;
  }
  twisterFace(back, previous, d, enma, visibility);

  // The forward wind arcs reveal the coil without covering the fighter's upper body.
  for (let i = 0; i < 3; i++) {
    const origin = { x, y: y - 4 - i * height * 0.31 };
    const spin = facing + d * (i * 1.48 + k * 4.1);
    cut(i === 0 ? front : back, origin, r * (0.86 - i * 0.17), 0.3, spin, d * 2.75, palette, alpha * (0.95 - i * 0.16), enma ? 5 - i : 3);
  }
}

function radial(back: G, front: G, v: FighterView, x: number, y: number, level: number, style: Style, time: number, previewReach?: number): void {
  const f = v.fighter;
  const spec = ONE_PIECE_HEROES[f.hero].super.bomb!;
  const k = progress(f.stateTime, 0.3);
  const radius = (spec.radius + spec.radiusPerLevel * Math.max(0, level - 1)) * (previewReach ?? 1);
  const alpha = (1 - k) ** 0.8;
  const r = radius * (0.84 + 0.16 * Math.min(1, k * 4));
  const d = f.facing;
  const facing = d > 0 ? 0 : Math.PI;
  if (alpha <= 0) return;
  if (f.hero === 'sanji') {
    const heel = { x: x + d * (10 - k * 6), y: y - 11 + k * 6 };
    flame(front, heel, { x: d * 0.9, y: -0.43 }, (4.5 + level) * alpha, time, style, alpha);
    // The heel leads. The trailing wake rises in successive arcs as the fighter comes down.
    const hot = { x: x + d * r * 0.18, y: y - 13 };
    for (let i = 0; i < 3; i++) {
      const spin = facing - d * (1.1 - i * 1.3 + k * 1.6);
      cut(i === 1 ? back : front, { x: hot.x - d * i * 3, y: hot.y + i * 4 }, r * (0.9 - i * 0.1), 0.47, spin, d * (2.2 + i * 0.12), style, alpha * (1 - i * 0.15), 5 - i);
    }
    if (level === 4) {
      for (let i = 0; i < 4; i++) {
        const from = { x: heel.x + d * (r * (0.26 + k * 0.37) + i * 6), y: heel.y - 8 + i * 5 };
        const bend = { x: from.x + d * 7, y: from.y - 3 - (i % 2) * 5 };
        stroke(front, from, bend, 0xc6f8ff, alpha, 2);
        stroke(front, bend, { x: bend.x + d * 7, y: bend.y + 2 + i }, 0x79b5ff, alpha);
      }
    }
    return;
  }
  const hand = v.frontHand() ?? { x: x + d * 5, y: y - 15 };
  sword(front, hand, facing + d * (-1.05 + k * 1.65), 17, style.spark, alpha, true);
  sword(front, { x: x + d * 2, y: y - 14 }, facing + d * (0.85 - k * 1.6), 15, STEEL, alpha, true);
  sword(front, { x: x + d * 3, y: y - 24 }, facing + d * 0.08, 14, STEEL, alpha);
  if (level === 1 || level === 2) {
    dragonTwister(back, front, x, y, d, r, k, alpha, level === 2);
    return;
  }
  if (level === 0) {
    cut(front, { x, y: y - 9 }, r * 0.82, 0.35, facing + d * k * 4, d * 3.4, AIR, alpha);
    return;
  }
  if (level === 3) {
    // Episode 1062 gives the fire dragon to King. Zoro's counter is a green Haki cut.
    const origin = { x: x + d * r * 0.12, y: y - 15 - k * 10 };
    for (let i = 0; i < 3; i++) {
      const center = { x: origin.x - d * i * 6, y: origin.y + i * 5 };
      const sweep = facing - d * (1.25 - k * 1.3 - i * 0.16);
      cut(i === 2 ? front : back, center, r * (0.76 - i * 0.11), 0.47, sweep, d * 3.54, style, alpha * (1 - i * 0.18), 5 - i);
    }
    for (const side of [-1, 1]) {
      const split = { x: x + d * r * (0.4 + k * 0.29), y: origin.y + side * (3 + 6 * k) };
      const bend = { x: split.x + d * 9, y: split.y + side * 7 };
      const end = { x: bend.x + d * 8, y: bend.y + side * 3 };
      stroke(front, split, bend, INK, alpha, 3);
      stroke(front, bend, end, INK, alpha, 2);
      stroke(front, { x: split.x, y: split.y - 1 }, { x: bend.x, y: bend.y - 1 }, style.spark, alpha);
    }
    return;
  }

  // Asura's other two faces and weapon arms sit behind Zoro's actual rig.
  const spread = 0.65 + k * 0.35;
  const shoulder = { x, y: y - 17 };
  for (const side of [-1, 1]) {
    const ghost = { x: x + side * (8 + 10 * spread), y: y - 25 - spread * 6 };
    stroke(back, shoulder, { x: ghost.x, y: ghost.y + 5 }, 0x5e335f, alpha, 5);
    pixel(back, ghost, 7, 0x331f43, alpha);
    pixel(back, { x: ghost.x - d, y: ghost.y - 2 }, 4, 0x8d456f, alpha);
    pixel(back, { x: ghost.x + d * 2, y: ghost.y }, 2, style.spark, alpha);
    sword(back, { x: ghost.x + d * 2, y: ghost.y + 3 }, facing - d * 0.1, 10 + 3 * spread, style.spark, alpha, true);
    for (let i = 0; i < 2; i++) {
      const wrist = { x: ghost.x + side * (4 + i * 5), y: ghost.y + 7 + i * 6 };
      const angle = facing + side * (0.52 + i * 1.28) - d * k;
      stroke(back, { x: ghost.x, y: ghost.y + 4 }, wrist, style.rim, alpha, 3);
      sword(back, wrist, angle, 12 + 7 * spread, style.spark, alpha, true);
    }
  }
  for (let i = 0; i < 3; i++) {
    const center = { x: x + d * i * 5, y: y - 13 - i * 8 };
    const angle = facing + d * (-1.8 + i * 1.45 + k * 2.15);
    cut(i === 1 ? back : front, center, r * (1 - i * 0.12), 0.63, angle, d * 3.1, style, alpha * (1 - i * 0.12), 5 - i);
  }
  if (k < 0.3) {
    for (const side of [-1, 1]) {
      stroke(back, { x: x + side * 9, y: y - 9 }, { x: x + side * r * 0.84, y: y - 35 }, style.core, (1 - k / 0.3) * 0.76, 2);
    }
  }
}

function law(back: G, front: G, v: FighterView, x: number, y: number, style: Style, time: number): boolean {
  const f = v.fighter;
  const center = { x, y: y - f.h / 2 };
  const k = f.specialKind;
  const level = formLevel(f);
  if (k === 'blink') {
    const elapsed = progress(f.stateTime, ONE_PIECE_HEROES.law.base.blink!.recover!);
    const fade = 1 - elapsed;
    room(back, center, 13 + 16 * elapsed, time, style.spark, fade * 0.8);
    // Shambles snaps separate slices of the arrival point into alignment.
    for (let i = -2; i <= 2; i++) {
      const px = x + (i % 2 ? -1 : 1) * (9 * fade + 4);
      const py = y - 13 + i * 4;
      stroke(front, { x: px - 5, y: py }, { x: px + 5, y: py }, style.spark, fade * 0.74, 2);
      pixel(front, { x: px, y: py }, 2, style.core, fade);
    }
    return true;
  }
  const charging = k === 'beamCharge' || k === 'superCharge';
  if (!charging && k !== 'beam' && k !== 'superBeam') return false;
  const superMove = k === 'superCharge' || k === 'superBeam';
  const spec = superMove ? ONE_PIECE_HEROES.law.super.beam! : ONE_PIECE_HEROES.law.second.beam!;
  const angle = f.facing > 0 ? f.stretchAngle : Math.PI - f.stretchAngle;
  const origin = beamOrigin({ ...f, x, y });
  if (charging) {
    const amount = progress(f.charge, superMove ? spec.minCharge : spec.maxCharge);
    const grip = v.frontHand() ?? { x: x + f.facing * 4, y: y - 12 };
    const blade = f.facing > 0 ? -0.9 : Math.PI + 0.9;
    sword(front, grip, blade, 15, STEEL);
    const focus = superMove ? on(grip, blade, 9) : origin;
    room(back, superMove ? focus : center, superMove ? 6 + amount * 9 : 13 + amount * 33 + level * 3, time, style.spark, 0.66);
    pixel(front, focus, 2 + Math.floor(amount * 4), style.spark, 0.9);
    return true;
  }
  const reach = f.stretchLen;
  const alpha = 1 - progress(f.stateTime - spec.grow - spec.hold, 0.12);
  if (reach <= 0 || alpha <= 0) return true;
  const tip = on(origin, angle, reach);
  const width = Math.max(1, f.beamWidth);
  const norm = angle + Math.PI / 2;
  sword(front, v.frontHand() ?? origin, angle, Math.min(17, reach), style.core);
  if (!superMove) {
    room(back, center, Math.min(reach, 38 + level * 5), time, style.spark, alpha * 0.54);
    stroke(front, origin, tip, style.core, alpha);
    // Orthogonal incision markers flare inside the cut width and pull apart along its plane.
    for (let i = 13; i < reach - 3; i += 18) {
      const p = on(origin, angle, i);
      const notch = width * (0.55 + 0.45 * Math.abs(Math.sin(i * 0.09 + time * 18)));
      for (const side of [-1, 1]) {
        const q = on(p, norm, side * notch);
        stroke(front, q, on(q, angle, 4), style.spark, alpha, 2);
        stroke(front, q, on(p, norm, side * 2), style.rim, alpha);
      }
    }
    pixel(front, tip, 3, style.core, alpha);
    return true;
  }

  if (level === 1) {
    // Counter Shock forks through the path before the thinner current collapses.
    let prev = origin;
    for (let i = 10; i < reach; i += 10) {
      const knot = on(on(origin, angle, i), norm, (i % 20 === 0 ? 1 : -1) * width * (0.6 + 0.26 * Math.sin(i + time * 40)));
      stroke(front, prev, knot, style.spark, alpha, 2);
      stroke(back, knot, on(knot, norm, Math.sin(i + time * 25) * width * 0.7), style.rim, alpha);
      prev = knot;
    }
    stroke(front, prev, tip, style.core, alpha, 2);
    stroke(front, origin, tip, style.core, alpha * 0.66);
    return true;
  }

  // Gamma Knife is a narrow incision. The awakened attacks extend Kikoku through a sheathing K-ROOM.
  const hue = level === 2 ? 0x89ffbd : style.spark;
  const thick = level === 2 ? 2 : 3;
  stroke(back, origin, tip, level === 2 ? 0x429e89 : style.rim, alpha * 0.9, thick + 3);
  stroke(front, origin, tip, hue, alpha, thick);
  stroke(front, origin, tip, style.core, alpha);
  if (level >= 3) room(back, origin, width * 1.45, time, style.spark, alpha * 0.66);
  for (let i = 7; i < reach - 3; i += level === 4 ? 13 : 10) {
    const p = on(origin, angle, i);
    const offset = Math.sin(time * 36 - i * 0.22) * width;
    const edge = on(p, norm, offset);
    stroke(front, edge, on(on(p, angle, Math.min(7, reach - i)), norm, -offset * 0.72), hue, alpha, level === 2 ? 1 : 2);
  }
  if (level === 4) {
    // Let the blade arrive first. The pulse tears away from the tip in angular cracks.
    const burst = progress(f.stateTime - spec.grow * 0.7, spec.hold);
    for (let i = 0; i < 6; i++) {
      const bearing = angle + (i / 6) * TAU;
      const end = on(tip, bearing, width * (0.38 + burst * 1.75));
      const kink = on(on(tip, bearing, width * burst * 0.86), bearing + 1.2, 4 + i % 2 * 2);
      stroke(front, tip, kink, style.core, alpha, 2);
      stroke(front, kink, end, hue, alpha, 2);
    }
  }
  pixel(front, tip, 5, style.core, alpha);
  return true;
}

/** Returns true for a special or combo whose visuals are entirely handled here. */
export function drawOnePieceFighter(back: G, front: G, v: FighterView, x: number, y: number, time: number, previewReach?: number): boolean {
  const f = v.fighter;
  if (!Object.hasOwn(ONE_PIECE_HEROES, f.hero)) return false;
  const level = formLevel(f);
  const style = ONE_PIECE_MOVES[f.hero][level];
  if (f.state === 'melee' && activeWeapon(f).hold === 'fist') {
    combo(front, v, x, y, level, style, time);
    return true;
  }
  if (f.state !== 'special') {
    if (f.hero === 'sanji' && level > 0 && f.state === 'normal') {
      flame(back, { x: x + f.facing * 3, y: y - 3 }, { x: f.facing * 0.45, y: 0.85 }, level === 4 ? 5 : 3, time, style, 0.72);
      if (f.flying) {
        for (let i = 0; i < 2; i++) {
          const step = (f.flyTime * 4.8 + i * 0.5) % 1;
          const heel = { x: x - f.vx * step * 0.09 + f.facing * (i === 0 ? 3 : -2), y: y + 3 + step * 10 };
          cut(back, heel, 4 + step * 7, 0.3, 0, TAU, AIR, (1 - step) * 0.74, 2);
        }
      }
    }
    if (f.state === 'block' && f.hero !== 'sanji' && activeWeapon(f).hold === 'fist') {
      const grip = v.frontHand();
      if (grip) {
        const d = f.facing;
        const facing = d > 0 ? 0 : Math.PI;
        sword(front, grip, facing + d * -0.66, 14, STEEL, 1, level > 0);
        if (f.hero === 'zoro') sword(back, { x: x + d * 2, y: y - 15 }, facing + d * 0.67, 14, style.spark, 1, level > 0);
      }
    }
    return false;
  }
  if (f.hero === 'law') return law(back, front, v, x, y, style, time);
  if (f.specialKind === 'rasengan') {
    dash(front, v, x, y, level, style, time);
    return true;
  }
  if (f.specialKind === 'bomb') {
    radial(back, front, v, x, y, level, style, time, previewReach);
    return true;
  }
  if (f.hero === 'sanji' && f.specialKind === 'gatling') {
    const g = ONE_PIECE_HEROES.sanji.second.gatling!;
    if (f.stateTime < g.every) return true;
    const last = f.stateTime >= g.time - g.every;
    const t = last ? f.stateTime - (g.time - g.every) : f.stateTime % g.every;
    const fade = 1 - progress(t, last ? 0.21 : g.every);
    const d = f.facing;
    const y0 = y - (last ? 15 : 9 + (Math.floor(f.stateTime / g.every) % 3) * 3);
    const reach = gatlingReach(f) * (previewReach ?? 1) + f.w / 2;
    const tip = { x: x + d * (reach * (0.52 + 0.48 * fade)), y: y0 };
    if (level > 0) flame(front, tip, { x: d, y: -0.2 }, last ? 7 : 4, time, style, fade);
    cut(front, { x, y: y0 }, reach * (0.82 + 0.18 * fade), 0.42, (d === 1 ? 0 : Math.PI) - d * 0.75, d * 1.68, style, fade, last ? 6 : 3);
    return true;
  }
  if (f.hero === 'zoro' && f.specialKind === 'fireball') {
    const spec = ONE_PIECE_HEROES.zoro.second.fireball!;
    const t = f.stateTime - spec.windup;
    const d = f.facing;
    const angle = d > 0 ? f.stretchAngle : Math.PI - f.stretchAngle;
    const hand = v.frontHand() ?? { x: x + d * 5, y: y - 15 };
    const fade = t < 0 ? 1 : 1 - progress(t, spec.recover);
    const sweep = t < 0 ? -1.62 + progress(f.stateTime, spec.windup) * 0.27 : 1.04 - fade * 0.4;
    sword(front, hand, angle + d * sweep, 16, style.spark, fade, level > 0);
    sword(front, { x: hand.x - d * 2, y: hand.y + 1 }, angle - d * sweep * 0.68, 13, STEEL, fade, level > 0);
    if (t >= 0) cut(front, hand, 18 + level, 0.82, angle - d * 0.89, d * 2.1, style, fade, 4);
    return true;
  }
  return false;
}

export function drawOnePieceProjectile(g: G, b: Bullet, x: number, y: number, time: number): boolean {
  if (b.weapon !== 'zoro:second') return false;
  const angle = Math.atan2(b.vy, b.vx);
  const style = ONE_PIECE_MOVES.zoro[b.form];
  const center = { x, y };
  const r = Math.max(3, b.size * 1.7);
  // Three travelling crescents. Their broadest point is the actual hit centre.
  for (let i = 2; i >= 0; i--) {
    const core = on(center, angle, -i * 5 - r * 0.6);
    const wave = Math.sin(time * 26 - i * 0.8) * r * 0.2;
    cut(g, on(core, angle + Math.PI / 2, wave), r + i * 1.5, 1, angle - 1.34, 2.68, style, 1 - i * 0.22, 4);
  }
  for (const side of [-1, 1]) {
    const start = on(on(center, angle, -13), angle + Math.PI / 2, r * 0.7 * side);
    stroke(g, on(start, angle, -7), start, style.spark, 0.68);
  }
  return true;
}
