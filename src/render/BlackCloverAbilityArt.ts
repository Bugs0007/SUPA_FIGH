import type Phaser from 'phaser';
import { SHOULDER_Y_STAND } from '../sim/constants';
import { heroDef } from '../sim/data/heroes';
import { activeWeapon, type Fighter } from '../sim/fighter';
import { beamOrigin, dashDir, rasenganPoint } from '../sim/hero';
import type { Bullet } from '../sim/projectile';
import type { FighterView } from './FighterView';
import { formLevel } from './formLevel';

type Graphics = Phaser.GameObjects.Graphics;
type Point = { x: number; y: number };
type CloverHero = 'asta' | 'yuno' | 'yami';
type BladeUser = Exclude<CloverHero, 'yuno'>;

const PALETTES = {
  asta: { dark: 0x251728, mid: 0x9b2844, bright: 0xff6e67, light: 0xffbc99 },
  yuno: { dark: 0x174c4b, mid: 0x4abc81, bright: 0xb6ffb1, light: 0xf3ffe3 },
  yami: { dark: 0x1a1225, mid: 0x5b3281, bright: 0xc58bff, light: 0xf1ddff },
};

function isClover(hero: string): hero is CloverHero {
  return hero === 'asta' || hero === 'yuno' || hero === 'yami';
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const mix = (from: number, to: number, progress: number) => from + (to - from) * progress;

function pixel(g: Graphics, x: number, y: number, size = 1): void {
  const half = Math.floor(size / 2);
  g.fillRect(Math.round(x) - half, Math.round(y) - half, size, size);
}

/** A stepped segment, in the same logical pixels as the fighter. */
function line(g: Graphics, x: number, y: number, endX: number, endY: number, size = 1): void {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(endX - x), Math.abs(endY - y)) / size));
  for (let i = 0; i <= steps; i++) pixel(g, mix(x, endX, i / steps), mix(y, endY, i / steps), size);
}

function arc(g: Graphics, x: number, y: number, rx: number, ry: number, start: number, end: number, size = 1): void {
  const steps = Math.max(8, Math.ceil(Math.max(rx, ry) * Math.abs(end - start) / 2.3));
  for (let i = 0; i <= steps; i++) {
    const angle = mix(start, end, i / steps);
    pixel(g, x + Math.cos(angle) * rx, y + Math.sin(angle) * ry, size);
  }
}

function diamond(g: Graphics, x: number, y: number, size: number, color: number, alpha = 1): void {
  g.fillStyle(color, alpha);
  line(g, x - size, y, x + size, y);
  line(g, x, y - size, x, y + size);
  pixel(g, x, y, 2);
}

function devilWing(g: Graphics, root: Point, rear: number, span: number, rise: number, level: number): void {
  const c = PALETTES.asta;
  const ridge = (p: number) => -rise * (p < 0.44 ? p / 0.44 * 0.82 : mix(0.82, 1, (p - 0.44) / 0.56));
  for (let i = 0; i <= span; i++) {
    const p = i / span;
    const x = root.x + rear * i;
    const y = root.y + ridge(p);
    const scallop = Math.pow((p * 4) % 1, 2);
    const height = Math.max(1, Math.round((1 - p) * (5 + scallop * 13) + Math.sin(p * Math.PI) * 4));
    g.fillStyle(c.dark, 0.98);
    g.fillRect(Math.round(x), Math.round(y), 1, height);
    g.fillStyle(c.mid, 0.8);
    pixel(g, x, y);
    if (level >= 3 && i % 4 === 0) {
      g.fillStyle(c.bright, 0.7);
      pixel(g, x, y + 1);
    }
  }
  g.fillStyle(c.mid, 0.65);
  for (const p of [0.25, 0.5, 0.75]) {
    line(g, root.x + rear * span * p * 0.66, root.y + ridge(p * 0.66) + 2,
      root.x + rear * span * p, root.y + ridge(p) + (1 - p) * 13);
  }
}

function spiritWing(g: Graphics, root: Point, rear: number, span: number, rise: number, level: number, time: number): void {
  const c = PALETTES.yuno;
  const count = level >= 3 ? 6 : 5;
  for (let i = count - 1; i >= 0; i--) {
    const p = i / (count - 1);
    const sx = root.x + rear * span * p * 0.35;
    const sy = root.y - rise * p * 0.42;
    const ex = root.x + rear * span * mix(0.54, 1, p);
    const ey = root.y + mix(6, -rise, p) + Math.sin(time * 7 + i * 0.7) * 1.6;
    const mx = mix(sx, ex, 0.63);
    const my = mix(sy, ey, 0.63) + 2;
    g.fillStyle(c.dark, 0.8);
    line(g, sx, sy, mx, my, 4);
    line(g, mx, my, ex, ey, 3);
    g.fillStyle(c.mid, 0.82);
    line(g, sx, sy - 1, mx, my - 1, 3);
    g.fillStyle(i === count - 1 || level === 4 ? c.light : c.bright, 0.85);
    line(g, mx, my - 1, ex, ey - 1);
  }
}

function formDetails(back: Graphics, front: Graphics, view: FighterView, hero: CloverHero, level: number, x: number, y: number, time: number): void {
  const f = view.fighter;
  const d = f.facing;
  if ((hero === 'asta' && level >= 2) || (hero === 'yuno' && level > 0)) {
    const shoulder = view.rearShoulder();
    if (!shoulder) return;
    // A single visible wing trails the side-on silhouette. The body occludes its root as the rig leans.
    const root = { x: x - d * Math.max(2, (x - shoulder.x) * d), y: shoulder.y + 1 };
    const folded = f.state === 'block' || (f.specialKind === 'rasengan' && f.state === 'special');
    const span = Math.round((14 + level * 2 + (f.flying ? 5 : 0)) * (folded ? 0.8 : 1));
    const rise = (13 + level * 2) * (folded ? 0.58 : 1) + Math.sin(time * (f.flying ? 9 : 4)) * 2;
    if (hero === 'asta') devilWing(back, root, -d, span, rise, level);
    else {
      spiritWing(back, root, -d, span, rise, level, time);
      if (level === 4) for (const [dx, dy] of [[8, -rise - 11], [span + 5, -rise + 1], [span + 11, 1]]) {
        const pulse = Math.sin(time * 6 + dx);
        diamond(back, root.x - dx * d, root.y + dy, pulse > 0.4 ? 3 : 2, 0xffe89c, 0.7 + pulse * 0.2);
      }
    }
  } else if (hero === 'yami' && level >= 3 && f.state === 'block') {
    // The guard folds a dark moon around the raised sword and flashes when it catches a blow.
    const radius = 16 + level;
    const shimmer = f.blockStun > 0 ? 1 : 0.66;
    back.fillStyle(PALETTES.yami.dark, 0.58).fillCircle(Math.round(x), Math.round(y - 13), radius);
    front.fillStyle(PALETTES.yami.mid, shimmer);
    arc(front, x, y - 13, radius, radius - 2, -2.35, 2.1, 3);
    front.fillStyle(PALETTES.yami.bright, shimmer);
    arc(front, x, y - 13, radius + 1, radius - 1, -1.95, 0.85);
  }
}

/** Angle shared by the sword art and the modular hand pose. */
export function blackCloverSwordArm(f: Fighter): number | null {
  if (!isClover(f.hero) || f.hero === 'yuno') return null;
  const h = heroDef(f.hero);
  if (!h) return null;
  const time = f.stateTime;
  if (f.state === 'block' && activeWeapon(f).hold === 'fist') return f.hero === 'asta' ? -1.16 : -1.72;
  if (f.state !== 'special') return null;
  if (f.specialKind === 'rasengan' && h.base.dash) {
    if (time < h.base.dash.windup) return f.hero === 'yami' ? 1.85 : -1.95;
    if (f.recoverAt === 0) return f.dashAngle + 0.05;
    return mix(f.dashAngle, 0.8, clamp((time - f.recoverAt) / h.base.dash.recover));
  }
  if (f.specialKind === 'fireball') return f.charge === -2 ? f.stretchAngle + 0.16 : -1.8;
  if (f.specialKind === 'beamCharge') return 1.15;
  if (f.specialKind === 'beam') return f.stretchAngle;
  if (f.specialKind === 'bomb' && h.super.bomb) {
    if (h.super.bomb.centered) {
      // The active frame starts overhead, then the sword comes down through the hit and settles low.
      return time < 0.11 ? mix(-1.73, 0.8, clamp(time / 0.11)) : mix(0.8, 1.5, clamp((time - 0.11) / 0.19));
    }
    const cast = h.super.bomb.windup;
    if (time < cast) return mix(1.1, -1.62, clamp((time / cast - 0.2) / 0.6));
    return mix(f.stretchAngle + 0.05, 1.1, clamp((time - cast) / 0.3));
  }
  return null;
}

function sword(g: Graphics, hero: BladeUser, hand: Point, facing: number, angle: number, length: number, thickness: number, powered: boolean, alpha = 1): void {
  const c = PALETTES[hero];
  const dx = Math.cos(angle) * facing;
  const dy = Math.sin(angle);
  const normalX = -Math.sin(angle) * facing;
  const normalY = Math.cos(angle);
  const broad = hero === 'asta';
  const width = Math.max(2, thickness);
  const fuller = powered ? (broad ? 0x514054 : c.mid) : (broad ? 0x484050 : 0x747286);
  const cuttingEdge = powered ? (broad ? 0xd4a8ba : c.bright) : (broad ? 0x8c8396 : 0xd3d7df);
  // Flat edge, broad fuller and a clipped point for the Demon-Slayer; the katana is slimmer and bends forward.
  for (let step = 2; step <= length; step++) {
    const t = step / length;
    const half = Math.max(0, Math.floor(width * Math.min(1, (1 - t) * (broad ? 7 : 12)) / 2));
    const bend = broad ? 0 : t * t * 2;
    const x = hand.x + dx * step - normalX * bend;
    const y = hand.y + dy * step - normalY * bend;
    g.fillStyle(c.dark, alpha);
    line(g, x - normalX * (half + 1), y - normalY * (half + 1), x + normalX * (half + 1), y + normalY * (half + 1), 2);
    g.fillStyle(fuller, alpha);
    line(g, x - normalX * half, y - normalY * half, x + normalX * half, y + normalY * half);
    g.fillStyle(cuttingEdge, alpha);
    pixel(g, x - normalX * half, y - normalY * half);
  }
  const guard = broad ? 3 : 2;
  g.fillStyle(broad ? 0x826174 : 0x9c7350, alpha);
  line(g, hand.x - normalX * guard + dx, hand.y - normalY * guard + dy, hand.x + normalX * guard + dx, hand.y + normalY * guard + dy, 2);
  g.fillStyle(0xa08a91, alpha);
  pixel(g, hand.x - dx * 3, hand.y - dy * 3, 2);
}

function crescent(g: Graphics, x: number, y: number, dx: number, dy: number, radius: number, width: number, hero: BladeUser, alpha = 1): void {
  const color = PALETTES[hero];
  const count = Math.ceil(radius * 2.4);
  for (let i = -count; i <= count; i++) {
    const p = i / count;
    const bend = radius * (0.45 - p * p * 0.82);
    const height = radius * p;
    const px = x + bend * dx - height * dy;
    const py = y + bend * dy + height * dx;
    const thick = Math.max(1, Math.round((1 - p * p) * width));
    g.fillStyle(color.dark, alpha);
    line(g, px - dx * thick, py - dy * thick, px + dx, py + dy, 2);
    g.fillStyle(color.mid, alpha);
    line(g, px - dx * (thick - 1), py - dy * (thick - 1), px, py);
    g.fillStyle(Math.abs(p) < 0.34 ? color.light : color.bright, alpha);
    pixel(g, px + dx, py + dy);
  }
}

function wind(g: Graphics, x: number, y: number, dx: number, dy: number, radius: number, time: number, alpha = 1): void {
  const c = PALETTES.yuno;
  for (let layer = 0; layer < 3; layer++) {
    const length = 20 + layer * 6;
    g.fillStyle(layer === 0 ? c.light : layer === 1 ? c.bright : c.mid, alpha * (1 - layer * 0.14));
    for (let i = 0; i <= length; i++) {
      const t = i / length;
      const along = radius * (0.55 - t * (1.5 + layer * 0.32));
      const around = Math.sin(t * 7.8 + time * 27 + layer * 2.1) * radius * (0.14 + t * 0.75);
      pixel(g, x + along * dx - around * dy, y + along * dy + around * dx, t > 0.12 && t < 0.63 && layer < 2 ? 2 : 1);
    }
  }
}

function sylph(g: Graphics, x: number, y: number, time: number, alpha: number): void {
  const flutter = Math.sin(time * 23) * 2;
  const c = PALETTES.yuno;
  g.fillStyle(c.mid, alpha * 0.55);
  line(g, x, y, x - 5, y - 3 - flutter, 2);
  line(g, x, y, x + 5, y - 3 - flutter, 2);
  g.fillStyle(c.bright, alpha);
  line(g, x, y + 1, x, y + 4, 2);
  g.fillStyle(c.light, alpha);
  pixel(g, x, y - 2, 2);
  pixel(g, x - 4, y - 2 - flutter);
  pixel(g, x + 4, y - 2 - flutter);
}

function windVortex(g: Graphics, x: number, y: number, dx: number, dy: number, radius: number, time: number, level: number): void {
  const c = PALETTES.yuno;
  for (let strand = 0; strand < 3; strand++) {
    for (let i = 0; i <= 22; i++) {
      const p = i / 22;
      const along = radius * (0.72 - 2.45 * p);
      const around = Math.sin(p * 8.3 - time * 28 + strand * Math.PI * 2 / 3) * radius * p;
      g.fillStyle(strand === 0 ? c.light : strand === 1 ? c.bright : c.mid, (1 - p * 0.55) * (strand === 2 ? 0.66 : 0.95));
      pixel(g, x + dx * along - dy * around, y + dy * along + dx * around, strand < 2 && p < 0.63 ? 2 : 1);
    }
  }
  if (level === 4) diamond(g, x, y, 2, 0xffefad);
}

/** The dimension cut runs along a bright, narrow seam with two offset planes of shadow. */
function darkRift(g: Graphics, x: number, y: number, dx: number, dy: number, radius: number, time: number, alpha: number): void {
  const c = PALETTES.yami;
  g.fillStyle(c.mid, alpha * 0.65);
  for (let i = -4; i <= 4; i++) {
    const p = i / 4;
    const across = radius * p;
    const behind = radius * (0.52 + Math.abs(p) * 0.48);
    const sx = x - dy * across, sy = y + dx * across;
    const jitter = Math.sin(time * 31 + i * 2.7) * 2;
    line(g, sx, sy, sx - dx * behind - dy * jitter, sy - dy * behind + dx * jitter);
  }
  const seam = radius * 0.9;
  g.fillStyle(c.dark, alpha * 0.86);
  line(g, x - dy * seam + dx, y + dx * seam + dy, x + dy * seam - dx, y - dx * seam - dy, 3);
  g.fillStyle(c.light, alpha * 0.93);
  line(g, x - dy * seam, y + dx * seam, x + dy * seam, y - dx * seam);
}

function drawBeam(g: Graphics, f: Fighter, hero: 'yuno' | 'yami', x: number, y: number, time: number): void {
  const width = f.beamWidth;
  const reach = f.stretchLen;
  if (reach <= 0 || width <= 0.2) return;
  const origin = beamOrigin(f);
  const sx = x + origin.x - f.x;
  const sy = y + origin.y - f.y;
  const dx = Math.cos(f.stretchAngle) * f.facing;
  const dy = Math.sin(f.stretchAngle);
  const c = PALETTES[hero];
  const level = formLevel(f);
  for (let d = 0; d <= reach; d += 2) {
    const taper = Math.min(1, d / 12 + 0.35, (reach - d) / 11 + 0.17);
    const centerX = sx + dx * d;
    const centerY = sy + dy * d;
    const w = Math.max(1, width * taper);
    if (hero === 'yami') {
      const ragged = w + Math.sin(d * 0.56 - time * 35) * 1.2;
      g.fillStyle(c.dark, 0.95);
      line(g, centerX - dy * ragged, centerY + dx * ragged, centerX + dy * ragged, centerY - dx * ragged, 3);
      g.fillStyle(c.bright, 0.78);
      pixel(g, centerX - dy * ragged, centerY + dx * ragged, 2);
      pixel(g, centerX + dy * ragged, centerY - dx * ragged, 2);
      if (d % 6 === 0) {
        g.fillStyle(c.light, 0.55);
        pixel(g, centerX, centerY);
      }
    } else {
      g.fillStyle(c.mid, 0.45);
      line(g, centerX - dy * w * 0.8, centerY + dx * w * 0.8, centerX + dy * w * 0.8, centerY - dx * w * 0.8, 3);
      g.fillStyle(c.light, 0.86);
      pixel(g, centerX, centerY, 2);
      for (let strand = 0; strand < 3; strand++) {
        const curl = Math.sin(d * 0.15 - time * 26 + strand * 2.1) * w;
        g.fillStyle(strand === 0 ? c.light : c.bright, 0.8);
        pixel(g, centerX - dy * curl, centerY + dx * curl, 2);
      }
      if (level === 4 && d % 26 === 0) diamond(g, centerX, centerY, 2, 0xffe9a0);
    }
  }
}

function windBlade(front: Graphics, hand: Point, facing: number, angle: number, level: number, time: number): void {
  const c = PALETTES.yuno;
  const dx = facing * Math.cos(angle), dy = Math.sin(angle);
  const length = 13 + level * 2;
  front.fillStyle(c.dark, 0.72);
  line(front, hand.x, hand.y, hand.x + dx * length, hand.y + dy * length, 4);
  front.fillStyle(c.mid, 0.95);
  line(front, hand.x, hand.y, hand.x + dx * length, hand.y + dy * length, 3);
  front.fillStyle(level === 4 ? 0xfff3b7 : c.light, 1);
  line(front, hand.x + dx * 2, hand.y + dy * 2, hand.x + dx * (length + 2), hand.y + dy * (length + 2));
  diamond(front, hand.x + dx * 3, hand.y + dy * 3, 2, c.bright);
  wind(front, hand.x + dx * length, hand.y + dy * length, dx, dy, level + 2, time, 0.68);
}

/** Draw the form silhouette and choreography from the authoritative move clock. */
export function drawBlackCloverFighter(back: Graphics, front: Graphics, view: FighterView, x: number, y: number, time: number, previewReach: number): boolean {
  const f = view.fighter;
  const hero = f.hero;
  if (!isClover(hero)) return false;
  const level = formLevel(f);
  const d = f.facing;
  const h = heroDef(hero)!;
  const c = PALETTES[hero];
  formDetails(back, front, view, hero, level, x, y, time);
  const swordArm = (activeWeapon(f).hold === 'fist' ? view.swordAngle() : undefined) ?? blackCloverSwordArm(f);
  const hand = swordArm === null ? null : view.frontHand();

  if (f.state !== 'special') {
    if (hero !== 'yuno' && hand && swordArm !== null && f.state === 'block') {
      sword(front, hero, hand, d, swordArm, hero === 'asta' ? 17 : 13, hero === 'asta' ? 6 : 2, level > 0);
    } else if (hero !== 'yuno' && hand && swordArm !== null) {
      if (view.swordDrawVisible()) {
        const length = ((hero === 'asta' ? 14 : 12) + level * 0.65) * view.swordProjection();
        sword(front, hero, hand, d, swordArm, length, hero === 'asta' ? 5 : 2, level > 0);
      }
    }
    else if (hero === 'yuno' && hand && swordArm !== null) windBlade(front, hand, d, swordArm, level, time);
    else if (hero !== 'yuno' && (f.state === 'normal' || f.state === 'crouch')) {
      const bob = Math.sin(time * (Math.abs(f.vx) > 25 ? 17 : 5));
      sword(back, hero, { x: x - d * 3, y: y - 8 + bob }, d, -2.06, hero === 'asta' ? 16 : 13, hero === 'asta' ? 5 : 2, false);
    }
    return false;
  }

  const cast = f.stateTime;
  const kind = f.specialKind;
  if (kind === 'rasengan' && h.base.dash) {
    const dir = dashDir(f);
    const p = rasenganPoint(f);
    const cx = x + p.x - f.x;
    const cy = y + p.y - f.y;
    const ready = cast >= h.base.dash.windup;
    const fade = f.recoverAt > 0 ? 1 - clamp((cast - f.recoverAt) / h.base.dash.recover) : 1;
    if (hero === 'yuno') {
      wind(ready ? front : back, cx, cy, dir.x, dir.y, ready ? 12 + level : 6, time, fade);
      if (ready) {
        back.fillStyle(c.bright, fade * 0.65);
        for (let i = -1; i <= 1; i++) {
          const offset = i * 5;
          line(back, x - dir.y * offset, y - 13 + dir.x * offset,
            x - dir.x * (21 - Math.abs(i) * 5) - dir.y * offset,
            y - 13 - dir.y * (21 - Math.abs(i) * 5) + dir.x * offset);
        }
      }
      return true;
    }
    if (hand && swordArm !== null) sword(front, hero, hand, d, swordArm, (hero === 'asta' ? 15 : 13) + level, hero === 'asta' ? 6 : 2, level > 0 || ready);
    if (ready) {
      if (hero === 'asta') crescent(front, cx, cy, dir.x, dir.y, h.base.dash.radius + level, 4, hero, fade * 0.94);
      else darkRift(front, cx, cy, dir.x, dir.y, h.base.dash.radius + level, time, fade);
      back.fillStyle(c.bright, fade * 0.5);
      for (let i = 0; i < 4; i++) {
        const side = i * 4 - 7;
        const trailX = cx - dir.x * (10 + i * 3) - dir.y * side;
        const trailY = cy - dir.y * (10 + i * 3) + dir.x * side;
        line(back, trailX, trailY, trailX - dir.x * (12 - i * 2), trailY - dir.y * (12 - i * 2));
      }
    }
    return true;
  }

  if (kind === 'fireball' && h.second.fireball) {
    const launch = h.second.fireball.windup;
    const dx = d * Math.cos(f.stretchAngle), dy = Math.sin(f.stretchAngle);
    const ox = x + dx * 4, oy = y - SHOULDER_Y_STAND - 3 + dy * 4;
    if (hero === 'yuno') {
      const k = clamp(cast / launch);
      if (cast < launch) wind(front, ox, oy, dx, dy, 4 + k * 6, time, k);
      else wind(back, ox, oy, dx, dy, 7, time, 1 - clamp((cast - launch) / h.second.fireball.recover));
    } else if (hero === 'asta' && hand && swordArm !== null) {
      // Black Slash has the lighter Demon-Dweller profile. Demon-Slayer keeps the broad edge for his rush and super.
      sword(front, hero, hand, d, swordArm, 15 + level, 3, true);
      const fade = cast < launch ? clamp(cast / launch) : 1 - clamp((cast - launch) / 0.13);
      crescent(front, ox + 5 * dx, oy + 5 * dy, dx, dy, 4 + level, 3, hero, fade);
    }
    return true;
  }

  if (kind === 'beamCharge' || kind === 'superCharge' || kind === 'beam' || kind === 'superBeam') {
    if (hero === 'asta') return false;
    if (hero === 'yami' && hand && swordArm !== null) sword(front, hero, hand, d, swordArm, 12, 2, true);
    if (kind === 'beam' || kind === 'superBeam') {
      drawBeam(front, f, hero, x, y, time);
      if (hero === 'yuno' && level === 4 && f.beamWidth > 0.2) {
        const origin = beamOrigin(f);
        const dx = d * Math.cos(f.stretchAngle), dy = Math.sin(f.stretchAngle);
        const startX = x + origin.x - f.x, startY = y + origin.y - f.y;
        for (const distance of [3, f.stretchLen * 0.5, f.stretchLen]) {
          const cx = startX + dx * distance, cy = startY + dy * distance;
          diamond(front, cx, cy, 3, 0xffe5a0, 0.87);
          back.fillStyle(0xffe5a0, 0.49);
          arc(back, cx, cy, 5, 7, time * 9, time * 9 + Math.PI * 1.7);
        }
      }
    } else {
      const max = hero === 'yuno' ? h.super.beam!.minCharge : h.second.beam!.maxCharge;
      const k = clamp(f.charge / max);
      const ox = x + d * (7 + k * 4);
      const oy = y - 16;
      if (hero === 'yuno') {
        const gather = clamp((k - 0.12) / 0.79);
        sylph(back, mix(x - d * 12, ox - d * 2, gather), mix(y - 32, oy - 1, gather) - Math.sin(time * 12) * 2, time, 1 - gather * 0.75);
        wind(front, ox, oy, d, 0, 6 + k * 12, time, 0.65 + k * 0.35);
        diamond(front, ox, oy, 2 + k * 3, level === 4 ? 0xffe89c : c.light);
      } else {
        const cx = hand && swordArm !== null ? hand.x + d * Math.cos(swordArm) * 12 : ox;
        const cy = hand && swordArm !== null ? hand.y + Math.sin(swordArm) * 12 : oy;
        front.fillStyle(c.dark, 1).fillCircle(Math.round(cx), Math.round(cy), 2 + k * 5);
        front.fillStyle(c.bright, 0.84);
        arc(front, cx, cy, 3 + k * 5, 2 + k * 4, time * 13, time * 13 + 4.6, 2);
        darkRift(back, cx, cy, d, 0, 4 + k * 7, time, k * 0.7);
      }
    }
    return true;
  }

  if (kind === 'bomb' && h.super.bomb && hero !== 'yuno') {
    const b = h.super.bomb;
    if (hero === 'asta') {
      const recovery = clamp(cast / 0.3);
      const radius = (b.radius + b.radiusPerLevel * (level - 1)) * Math.min(1, previewReach * 1.38);
      const swordLength = mix(radius * 0.66, 15, recovery);
      if (hand && swordArm !== null) {
        if (recovery < 0.42) sword(back, hero, hand, d, swordArm - 0.68, swordLength, 8, true, (1 - recovery / 0.42) * 0.36);
        sword(front, hero, hand, d, swordArm, swordLength, mix(11, 5, recovery), true);
      }
      const cy = y - f.h * 0.5;
      const fade = 1 - recovery;
      back.fillStyle(c.dark, fade * 0.94);
      arc(back, x, cy, radius, radius * 0.4, 0, Math.PI * 2, 5);
      back.fillStyle(c.bright, fade * 0.8);
      arc(back, x, cy, radius, radius * 0.4, 0, Math.PI * 2, 2);
      for (let i = 0; i < 14; i++) {
        const angle = i * Math.PI / 7 + 0.2;
        const distance = radius * (0.77 + recovery * 0.32 + (i % 3) * 0.09);
        const sx = x + Math.cos(angle) * distance;
        const sy = cy + Math.sin(angle) * distance * 0.4;
        front.fillStyle(i % 3 === 0 ? c.light : c.mid, fade * 0.8);
        line(front, sx, sy, sx + Math.cos(angle) * (4 + fade * 5), sy + Math.sin(angle) * 5 - 4, i % 3 === 0 ? 2 : 1);
      }
    } else {
      const charging = cast < b.windup;
      const k = clamp(cast / b.windup);
      const recovery = clamp((cast - b.windup) / 0.3);
      if (hand && swordArm !== null) sword(front, hero, hand, d, swordArm, 13 + k * 6, 2 + k * 2, true);
      const span = (b.size + b.sizePerLevel * (level - 1)) * (0.3 + k * 0.8);
      const dx = Math.cos(f.stretchAngle) * d, dy = Math.sin(f.stretchAngle);
      darkRift(front, x + d * (7 + span * (charging ? k * 0.4 : recovery)), y - 16, dx, dy, span, time, charging ? 0.35 + k * 0.6 : 1 - recovery);
      if (charging) {
        front.fillStyle(c.bright, k * 0.65);
        arc(front, x, y - 15, 12 + k * 13, 8 + k * 10, -1.8, 1.8);
      }
    }
    return true;
  }
  return false;
}

/** Launch form is stored on the projectile, so its colors and silhouette survive de-transformation. */
export function drawBlackCloverProjectile(g: Graphics, bullet: Bullet, x: number, y: number, time: number): boolean {
  const id = bullet.weapon;
  if (id !== 'asta:second' && id !== 'yuno:second' && id !== 'yami:super') return false;
  const speed = Math.hypot(bullet.vx, bullet.vy) || 1;
  const dx = bullet.vx / speed, dy = bullet.vy / speed;
  if (id === 'yuno:second') {
    windVortex(g, x, y, dx, dy, bullet.size + 3, time, bullet.form);
    return true;
  }
  const hero = id === 'asta:second' ? 'asta' : 'yami';
  const radius = bullet.size + (hero === 'yami' ? 3 : 1);
  if (hero === 'yami') {
    darkRift(g, x, y, dx, dy, radius, time, 1);
    if (bullet.form >= 3) darkRift(g, x - dx * 7, y - dy * 7, dx, dy, radius * 0.7, time + 0.14, 0.34);
    return true;
  }
  crescent(g, x, y, dx, dy, radius, 3, hero);
  g.fillStyle(PALETTES[hero].mid, 0.58);
  for (let i = 0; i < 4; i++) {
    const offset = (i - 1.5) * radius * 0.45;
    const px = x - dx * (4 + i * 2) - dy * offset;
    const py = y - dy * (4 + i * 2) + dx * offset;
    line(g, px, py, px - dx * (6 + radius * 0.35), py - dy * (6 + radius * 0.35));
  }
  return true;
}
