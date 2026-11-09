import type Phaser from 'phaser';
import { SHOULDER_Y_STAND } from '../sim/constants';
import { BLEACH_HEROES } from '../sim/data/bleachHeroes';
import { bombWindup } from '../sim/data/heroes';
import { activeWeapon, type Fighter } from '../sim/fighter';
import { beamOrigin, dashDir, rasenganPoint } from '../sim/hero';
import type { Bullet } from '../sim/projectile';
import type { FighterView } from './FighterView';
import { formLevel } from './formLevel';

type Graphics = Phaser.GameObjects.Graphics;
type Ink = readonly [rim: number, core: number];

const ICE = [0x69b9ed, 0xe7fdff] as const;
const PETALS = [0xa94f92, 0xffb5d6] as const;
const WINGS = [0x9984bd, 0xfff1f0] as const;
const MOON = [0x537bbd, 0xc5efff] as const;
const BLACK_MOON = [0x312037, 0xff5362] as const;
const HOLLOW = [0x7d2749, 0xff8763] as const;
const GOLD = [0xca652c, 0xffdc8e] as const;
const DUAL_STEEL = [0x3b3249, 0xd1c2b1] as const;
const TAU = Math.PI * 2;

export function isBleachFighter(hero: string): boolean {
  return Object.hasOwn(BLEACH_HEROES, hero);
}

/** The blade can pivot around the fist independently of the arm and body animation. */
export function bleachBladeAngle(f: Fighter, front: number): number {
  if (f.state === 'melee') return f.combo === 3 ? -1.3 : front + (f.combo === 1 ? -0.14 : 0.14);
  if (f.state === 'special') {
    if (f.specialKind === 'rasengan') return front - 0.24;
    if (f.specialKind === 'bomb' && f.hero === 'ichigo' && formLevel(f) === 4 && f.charge < 0) {
      const windup = bombWindup(BLEACH_HEROES.ichigo.super.bomb!);
      const p = Math.min(1, Math.max(0, (f.stateTime - windup) / 0.09));
      return -1.7 + p * (1.95 + f.stretchAngle);
    }
    if (f.specialKind === 'fireball' || f.specialKind === 'bomb') return f.charge < 0 ? f.stretchAngle + 0.16 : -1.7;
    if (f.specialKind === 'beam') return f.stretchAngle;
  }
  return -0.8 + Math.sin(front) * 0.24;
}

function dot(g: Graphics, x: number, y: number, size: number, color: number, alpha = 1): void {
  const r = Math.max(1, Math.round(size));
  g.fillStyle(color, alpha).fillRect(Math.round(x - r * 0.5), Math.round(y - r * 0.5), r, r);
}

function line(g: Graphics, x: number, y: number, tx: number, ty: number, w: number, color: number, alpha = 1): void {
  g.lineStyle(w, color, alpha).lineBetween(Math.round(x), Math.round(y), Math.round(tx), Math.round(ty));
}

function blade(g: Graphics, x: number, y: number, angle: number, length: number, ink: Ink, alpha: number): void {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const tx = x + dx * length, ty = y + dy * length;
  line(g, x - dx * 2, y - dy * 2, x, y, 2, 0x30263d, alpha);
  line(g, x - dy * 2, y + dx * 2, x + dy * 2, y - dx * 2, 1, ink[0], alpha);
  line(g, x, y, tx, ty, 3, ink[0], alpha);
  line(g, x - dy, y + dx, tx, ty, 1, ink[1], alpha);
  dot(g, tx, ty, 1, 0xffffff, alpha);
}

function crescent(g: Graphics, x: number, y: number, aim: number, r: number, ink: Ink, alpha: number): void {
  const vx = Math.cos(aim), vy = Math.sin(aim);
  for (let i = -10; i <= 10; i++) {
    const u = i / 10;
    const travel = (0.33 - u * u * 0.9) * r;
    const px = x + vx * travel - vy * u * r;
    const py = y + vy * travel + vx * u * r;
    const width = 1 + r * 0.34 * (1 - u * u);
    dot(g, px, py, width + 2, ink[0], alpha * 0.25);
    dot(g, px, py, width, ink[0], alpha);
    dot(g, px + vx, py + vy, 1 + width * 0.25, ink[1], alpha);
  }
}

function flake(g: Graphics, x: number, y: number, r: number, angle: number, alpha: number): void {
  for (let k = 0; k < 3; k++) {
    const a = angle + k * Math.PI / 3, dx = Math.cos(a) * r, dy = Math.sin(a) * r;
    line(g, x - dx, y - dy, x + dx, y + dy, 1, ICE[1], alpha);
  }
  dot(g, x, y, 2, 0xffffff, alpha);
}

function petal(g: Graphics, x: number, y: number, a: number, ink: Ink, scale: number, alpha: number): void {
  const dx = Math.cos(a) * scale, dy = Math.sin(a) * scale;
  line(g, x - dx, y - dy, x + dx, y + dy, 2, ink[0], alpha * 0.85);
  dot(g, x + dx, y + dy, Math.max(1, scale * 0.8), ink[1], alpha);
}

function petals(g: Graphics, x: number, y: number, r: number, time: number, count: number, ink: Ink, alpha: number): void {
  for (let i = 0; i < count; i++) {
    const a = i * 2.39996 + time * (5 + i % 3);
    const reach = r * (0.23 + 0.77 * (i / count));
    petal(g, x + Math.cos(a) * reach, y + Math.sin(a) * reach, a + 0.75, ink, 1.4 + i % 3 * 0.3, alpha);
  }
}

function colorFor(hero: string, level: number): Ink {
  if (hero === 'rukia') return ICE;
  if (hero === 'byakuya') return level === 4 ? WINGS : PETALS;
  if (level === 4) return GOLD;
  if (level === 1) return BLACK_MOON;
  return level > 0 ? HOLLOW : MOON;
}

function drawFinisherKick(g: Graphics, f: Fighter, x: number, y: number, level: number, ink: Ink): void {
  const hit = BLEACH_HEROES[f.hero].combo[f.combo];
  if (!hit?.kick || f.stateTime < hit.windup * 0.7 || f.stateTime > hit.windup + hit.active + 0.06) return;
  const progress = Math.min(1, (f.stateTime - hit.windup * 0.7) / (hit.active + 0.03));
  const fade = 1 - Math.max(0, f.stateTime - hit.windup - hit.active) / 0.06;
  const r = hit.range + 4 + level;
  for (let i = 0; i < 5; i++) line(g, x + f.facing * (4 + progress * 6), y - 10,
    x + f.facing * (r + i % 2 * 3), y - 10 + (i - 2) * 3, 1, ink[i % 2], fade * 0.7);
}

function drawDash(g: Graphics, f: Fighter, x: number, y: number, level: number, time: number, ink: Ink): void {
  const dash = BLEACH_HEROES[f.hero].base.dash!;
  const center = rasenganPoint({ ...f, x, y });
  const d = dashDir(f);
  const form = Math.min(1, f.stateTime / dash.windup);
  const recovery = f.recoverAt > 0 ? Math.max(0, 1 - (f.stateTime - f.recoverAt) / dash.recover) : 1;
  const angle = Math.atan2(d.y, d.x);
  if (f.hero === 'rukia') {
    const trail = (5 + level) * form;
    blade(g, center.x - d.x * trail, center.y - d.y * trail, angle, trail * 1.7, ICE, recovery);
    if (form === 1) for (let i = 0; i < 7; i++) {
      const travel = (time * 110 + i * 6) % 31;
      const px = center.x - d.x * travel + d.y * (i % 3 - 1) * 4;
      const py = center.y - d.y * travel - d.x * (i % 3 - 1) * 4;
      line(g, px, py, px - d.x * (3 + i % 3), py - d.y * (3 + i % 3), 1, ICE[i % 2], recovery * (1 - travel / 36));
    }
  } else {
    crescent(g, center.x, center.y, angle, (dash.radius + level) * form, ink, recovery);
    if (form === 1) for (let i = 0; i < 7; i++) {
      const offset = (i - 3) * 2;
      const travel = 4 + (time * 160 + i * 13) % 23;
      const px = center.x - d.x * travel - d.y * offset, py = center.y - d.y * travel + d.x * offset;
      line(g, px, py, px - d.x * (5 + i % 3 * 3), py - d.y * (5 + i % 3 * 3), 1, ink[i % 2], 0.55 * recovery);
    }
  }
}

function drawIceBeam(g: Graphics, f: Fighter, x: number, y: number, time: number): void {
  const { x: ox, y: oy } = beamOrigin({ ...f, x, y });
  if (f.specialKind === 'beamCharge') {
    const p = Math.min(1, f.charge / BLEACH_HEROES.rukia.second.beam!.maxCharge);
    flake(g, ox, oy, 2 + p * 7, -time * 2, 0.6 + p * 0.4);
    return;
  }
  const len = f.stretchLen, width = f.beamWidth;
  if (len <= 0 || width <= 0.2) return;
  const dx = f.facing * Math.cos(f.stretchAngle), dy = Math.sin(f.stretchAngle);
  line(g, ox, oy, ox + dx * len, oy + dy * len, Math.max(1, width), ICE[1], 0.72);
  for (let dist = 0; dist < len; dist += 6) {
    const px = ox + dx * dist, py = oy + dy * dist;
    const crest = width * (0.72 + 0.26 * Math.sin(dist * 0.28 - time * 32));
    const run = Math.min(len - dist, 10);
    for (const side of [-1, 1]) {
      const cx = px - side * dy * crest;
      const cy = py + side * dx * crest;
      const tx = px + dx * run, ty = py + dy * run;
      g.fillStyle(side === -1 ? ICE[1] : ICE[0], 0.55).fillTriangle(
        Math.round(px), Math.round(py), Math.round(cx), Math.round(cy), Math.round(tx), Math.round(ty));
      if (dist % 12 === 0) line(g, cx, cy, tx, ty, 1, ICE[side === -1 ? 0 : 1], 0.76);
    }
  }
  flake(g, ox + dx * len, oy + dy * len, width * 0.78 + 1, time * 2, 0.88);
}

/** The far blade fan folds above the rear shoulder. Both wings trail behind the side-facing silhouette. */
function drawWhiteWings(g: Graphics, x: number, y: number, facing: number, progress: number, time: number, alpha: number): void {
  for (const side of [0, 1]) {
    for (let i = 0; i < 8; i++) {
      const px = x - facing * (1 + i * 0.32 + side * 2);
      const py = y + i * 0.55 - side * 3;
      const angle = facing > 0 ? Math.PI + 0.9 - i * 0.11 + side * 0.31 : -0.9 + i * 0.11 - side * 0.31;
      const flex = Math.sin(time * 6 + i * 0.26) * 1.1;
      const span = (30 - i * 2 + flex) * progress * (1 - side * 0.2);
      blade(g, px, py, angle, span, WINGS, alpha * (side === 0 ? 0.95 : 0.55));
    }
  }
}

function drawFrostBurst(back: Graphics, front: Graphics, x: number, y: number, floor: number, range: number, level: number, t: number): void {
  const fade = 1 - t;
  const rise = Math.min(1, 0.34 + t * 8);
  for (let i = 0; i < 48; i++) {
    const a = i * TAU / 48;
    const px = x + Math.cos(a) * range, py = y + Math.sin(a) * range;
    if (py < floor) dot(back, px, py, i % 4 === 0 ? 3 : 1, ICE[i % 2], fade * 0.78);
    if (i % 4 !== 0) continue;
    const branch = 0.46 + i % 5 * 0.1;
    const sx = x + Math.cos(a) * range * branch;
    const sy = Math.min(floor - 4, y + Math.sin(a) * range * branch);
    line(back, x + (sx - x) * 0.3, y + (sy - y) * 0.3, sx, sy, 2, ICE[0], fade * 0.55);
    flake(back, sx, sy, (3 + level * 0.62) * rise, a, fade * 0.83);
  }

  // Facets rise from the lower half of the burst. Keep the solid frost behind the fighter.
  for (let i = -5; i <= 5; i++) {
    const u = i / 6;
    const px = x + range * u;
    const cap = range * Math.sqrt(1 - u * u);
    const bottom = Math.min(floor, y + cap * 0.54);
    const tip = Math.max(y - cap, bottom - cap * rise * (i % 2 === 0 ? 1.42 : 0.99));
    const side = Math.sign(i) * 4;
    const half = Math.max(2, range * 0.067);
    back.fillStyle(ICE[0], fade * 0.58).fillTriangle(
      Math.round(px - half), Math.round(bottom), Math.round(px + half), Math.round(bottom),
      Math.round(px + side), Math.round(tip));
    line(back, px, bottom, px + side, tip, 1 + level * 0.33, ICE[1], fade * 0.94);
    if (i % 2 === 0 && i !== 0) dot(front, px + side, tip, 2 + level * 0.3, 0xffffff, fade);
  }
  if (level === 4) flake(back, x, y, range * 0.5 * rise, -Math.PI / 2, fade * 0.65);
}

function drawPetalBankai(back: Graphics, front: Graphics, view: FighterView, x: number, y: number, time: number, level: number, ink: Ink, progress: number, alpha: number, previewReach: number): void {
  const f = view.fighter;
  if (level === 4) {
    const shoulder = view.rearShoulder() ?? { x: x - f.facing * 4, y: y - 15 };
    const rearX = x - f.facing * Math.max(2, (x - shoulder.x) * f.facing);
    drawWhiteWings(back, rearX, shoulder.y, f.facing, progress * Math.min(1, previewReach * 2), time, alpha);
  } else if (level >= 2) {
    const count = level === 3 ? 10 : 8;
    for (let i = 0; i < count; i++) {
      const p = Math.max(0, Math.min(1, (progress - i * 0.039) * 2.4));
      if (p <= 0) continue;
      const angle = i * TAU / count;
      const px = x + Math.cos(angle) * (25 + level * 4) * previewReach;
      const py = y - Math.sin(angle) * 6 - p * (level === 3 ? 18 : 11);
      blade(back, px, py, -Math.PI * 0.5, p * (level === 3 ? 10 : 14), ink, alpha * 0.65 * p);
    }
  }
  petals(front, x, y - 16, (7 + 2 * level) * progress, time, 14 + level * 2, ink, alpha);
}

function drawBomb(back: Graphics, front: Graphics, view: FighterView, x: number, y: number, time: number, level: number, ink: Ink, previewReach: number): void {
  const f = view.fighter;
  const b = BLEACH_HEROES[f.hero].super.bomb!;
  const released = f.charge < 0;
  const t = Math.min(1, Math.max(0, f.stateTime - bombWindup(b)) / 0.3);
  const progress = released ? 1 : Math.max(0, Math.min(1, f.charge));
  const alpha = released ? 1 - t : 0.4 + progress * 0.6;
  if (b.centered) {
    const range = (b.radius + b.radiusPerLevel * Math.max(0, level - 1)) * previewReach;
    if (released) drawFrostBurst(back, front, x, y - f.h * 0.5, f.grounded ? y + 1 : Infinity, range, level, t);
  } else if (f.hero === 'byakuya') {
    drawPetalBankai(back, front, view, x, y, time, level, ink, progress, alpha, previewReach);
  } else {
    const a = Math.atan2(Math.sin(f.stretchAngle), Math.cos(f.stretchAngle) * f.facing);
    const r = (b.size + b.sizePerLevel * Math.max(0, level - 1)) * progress;
    const mx = x + f.facing * (8 + progress * (r + 4)), my = y - SHOULDER_Y_STAND - 2;
    if (level === 4) {
      const first = Math.min(1, progress * 1.7), second = Math.max(0, (progress - 0.45) / 0.55);
      crescent(front, mx, my + (1 - first) * 5, a - 0.66, r * first, GOLD, alpha * 0.93 * first);
      if (second > 0) crescent(front, mx, my - (1 - second) * 8, a + 0.66, r * second, GOLD, alpha * second);
      if (released && t < 0.25) dot(front, mx, my, 6, 0xfff2c7, 1 - t * 4);
    } else if (level === 3) {
      const core = 2 + r * 0.44;
      dot(front, mx, my, core + 4, HOLLOW[0], alpha * 0.9);
      dot(front, mx, my, core, HOLLOW[1], alpha);
      dot(front, mx + Math.cos(a), my + Math.sin(a), core * 0.45, 0xffe3ad, alpha);
      for (let i = 0; i < 7; i++) {
        const angle = i * TAU / 7 + time * 8;
        const tip = core + (i % 2 + 1) * progress * 4;
        line(front, mx + Math.cos(angle) * core, my + Math.sin(angle) * core,
          mx + Math.cos(angle) * tip, my + Math.sin(angle) * tip, 1, HOLLOW[1], alpha * 0.75);
      }
    } else {
      crescent(front, mx, my, a, r, ink, alpha * 0.95);
    }
    for (let i = 0; i < 10; i++) {
      const angle = i * TAU / 10 + time * 3.5;
      dot(back, mx + Math.cos(angle) * r * 1.2, my + Math.sin(angle) * r * 1.2, 1 + i % 2, ink[i % 2], alpha * 0.65);
    }
  }
}

function drawOffhand(back: Graphics, view: FighterView, time: number): void {
  const f = view.fighter;
  const hand = view.backHand();
  if (!hand) return;
  const swordAngle = view.swordAngle(true);
  let angle = swordAngle ?? -2.2 + Math.sin(time * 6) * 0.13;
  if (f.state === 'special' && f.specialKind === 'bomb') {
    angle = f.charge < 0 ? f.stretchAngle - 0.7 : -2.3 + Math.max(0, f.charge) * 1.5;
  }
  const aim = f.facing > 0 ? angle : Math.PI - angle;
  blade(back, hand.x, hand.y, aim, swordAngle === undefined ? 11 : 14 * view.swordProjection(true), DUAL_STEEL, 1);
}

function drawSnowRibbon(back: Graphics, view: FighterView, time: number): void {
  const f = view.fighter;
  const hand = view.frontHand();
  if (!hand) return;
  let x = hand.x - f.facing * 2, y = hand.y + 1;
  for (let i = 1; i <= 7; i++) {
    const px = x - f.facing * 2;
    const py = hand.y + i * 0.66 + Math.sin(time * 11 - i * 0.65) * i * 0.52;
    line(back, x, y, px, py, 1, i % 3 === 0 ? ICE[0] : ICE[1], 0.84);
    x = px;
    y = py;
  }
}

/** The rig draws the sword; these effects share the simulated aim, reach and windup. */
export function drawBleachFighter(back: Graphics, front: Graphics, view: FighterView, x: number, y: number, time: number, previewReach: number): boolean {
  const f = view.fighter;
  if (!isBleachFighter(f.hero)) return false;
  const level = formLevel(f), ink = colorFor(f.hero, level);
  const freeHand = f.alive && f.carry < 0 && activeWeapon(f).hold === 'fist'
    && (f.state === 'normal' || f.state === 'crouch' || f.state === 'melee' || f.state === 'special' || f.state === 'block' || f.state === 'kick');
  if (freeHand && f.hero === 'ichigo' && level === 4) drawOffhand(back, view, time);
  if (freeHand && f.hero === 'rukia' && level > 0) drawSnowRibbon(back, view, time);
  if (f.hero === 'byakuya' && level >= 2) {
    petals(back, x, y - 14, 10 + level * 2, time * 0.55, 4 + level, ink, 0.5);
  } else if (f.hero === 'rukia' && level === 4) {
    for (let i = 0; i < 5; i++) {
      const rise = (time * 16 + i * 6) % 32;
      flake(back, x + Math.sin(time * 3 + i * 3.7) * 13, y - 2 - rise, 1 + i % 2, time + i, 0.52);
    }
  }
  if (f.state === 'melee' && activeWeapon(f).hold === 'fist') drawFinisherKick(front, f, x, y, level, ink);
  if (f.state !== 'special') return false;
  switch (f.specialKind) {
    case 'rasengan': drawDash(front, f, x, y, level, time, ink); return true;
    case 'blink': petals(front, x, y - 14, 14, time, 13, ink, Math.max(0, 1 - f.stateTime / 0.18)); return true;
    case 'fireball': {
      const s = BLEACH_HEROES[f.hero].second.fireball!;
      const progress = f.charge < 0 ? 1 : Math.min(1, f.stateTime / s.windup);
      const alpha = f.charge < 0 ? Math.max(0, 1 - (f.stateTime - s.windup) / s.recover) : progress;
      const a = Math.atan2(Math.sin(f.stretchAngle), Math.cos(f.stretchAngle) * f.facing);
      const px = x + Math.cos(a) * (7 + progress * 4), py = y - 16 + Math.sin(a) * 8;
      const hand = view.frontHand();
      if (hand) line(front, hand.x, hand.y, px, py, 1, ink[1], alpha * 0.36);
      if (f.hero === 'byakuya') petals(front, px, py, 7 + level, time, 12, ink, alpha);
      else crescent(front, px, py, a, (6 + level) * progress, ink, alpha);
      return true;
    }
    case 'beamCharge':
    case 'beam': drawIceBeam(front, f, x, y, time); return true;
    case 'bomb': drawBomb(back, front, view, x, y, time, level, ink, previewReach); return true;
    default: return false;
  }
}

export function drawBleachProjectile(g: Graphics, b: Bullet, x: number, y: number, time: number): boolean {
  const superMove = b.tier === 2;
  const a = Math.atan2(b.vy, b.vx), dx = Math.cos(a), dy = Math.sin(a);
  if (b.weapon === 'ichigo:second' || b.weapon === 'ichigo:super') {
    const ink = colorFor('ichigo', b.form);
    const cross = superMove && b.form === 4;
    for (let i = 0; i < 6; i++) {
      const d = (time * 110 + i * 4) % 24;
      const side = Math.sin(i * 4.8) * b.size * 0.64;
      const px = x - dx * d - dy * side, py = y - dy * d + dx * side;
      line(g, px, py, px - dx * 6, py - dy * 6, 1, ink[i % 2], 0.6 * (1 - d / 25));
    }
    if (superMove && b.form === 3) {
      for (let i = 0; i < 17; i++) {
        const u = i / 17 * TAU, r = b.size * (0.84 + 0.12 * Math.sin(time * 55 + i));
        const px = x + Math.cos(u) * r, py = y + Math.sin(u) * r;
        line(g, px, py, x - dx * (8 + i % 3), y - dy * (8 + i % 3), 2, ink[0], 0.74);
        dot(g, px, py, 2, ink[1]);
      }
      dot(g, x, y, b.size * 0.8, 0xffb76c);
    } else {
      crescent(g, x, y, a - (cross ? 0.64 : 0), b.size, ink, 1);
      if (cross) {
        crescent(g, x, y, a + 0.64, b.size, [0xea9748, 0xfff0b5], 1);
        dot(g, x + dx * b.size * 0.3, y + dy * b.size * 0.3, b.size * 0.35, 0xfff9d5);
      }
    }
    return true;
  }
  if (b.weapon === 'byakuya:second' || b.weapon === 'byakuya:super') {
    const ink = colorFor('byakuya', superMove ? b.form : 0);
    const r = b.size;
    if (superMove && b.form >= 3) {
      // Senkei condenses its petals into a staggered line of blades. The final
      // release is one bright blade with the rest of the petals streaming behind it.
      if (b.form === 3) {
        for (let i = -2; i <= 2; i++) {
          const back = Math.abs(i) * r * 0.58, side = i * r * 0.35;
          const px = x - dx * back - dy * side, py = y - dy * back + dx * side;
          blade(g, px - dx * r, py - dy * r, a, r * 1.82, ink, 1 - Math.abs(i) * 0.15);
        }
      } else {
        blade(g, x - dx * r * 1.4, y - dy * r * 1.4, a, r * 2.2, WINGS, 1);
        for (const side of [-1, 1]) {
          line(g, x - dx * r * 1.25 - dy * r * 0.48 * side,
            y - dy * r * 1.25 + dx * r * 0.48 * side,
            x + dx * r * 0.68, y + dy * r * 0.68, 2, WINGS[1], 0.7);
        }
      }
    }
    for (let i = 0; i < (superMove ? 28 : 16); i++) {
      const travel = (time * 100 + i * 9) % (r * 2.6 + 8);
      const offset = Math.sin(i * 4.8 + time * 19) * r * (1 - travel / (r * 4.5 + 8));
      petal(g, x - dx * travel - dy * offset, y - dy * travel + dx * offset,
        a + Math.sin(i + time * 13), ink, superMove ? 2.1 : 1.35, b.form >= 3 && superMove ? 0.54 : 0.76);
    }
    if (!superMove || b.form < 3) petals(g, x, y, r, time, superMove ? 15 : 7, ink, 1);
    return true;
  }
  return false;
}
