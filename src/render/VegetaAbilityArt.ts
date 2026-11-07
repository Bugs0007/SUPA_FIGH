import type Phaser from 'phaser';
import { heroDef } from '../sim/data/heroes';
import { beamOrigin, dashDir } from '../sim/hero';
import type { Bullet } from '../sim/projectile';
import type { FighterView } from './FighterView';
import { formLevel } from './formLevel';

type Graphics = Phaser.GameObjects.Graphics;
const FORM_BEAMS = [
  { rim: 0x953de4, core: 0xe3b7ff, spark: 0xf4baff },
  { rim: 0x963de4, core: 0xf1caff, spark: 0xee82ff },
  { rim: 0xd97622, core: 0xffdb77, spark: 0xfff7bc },
  { rim: 0x369adb, core: 0xffed96, spark: 0xb6f9ff },
  { rim: 0x374dff, core: 0x99bfff, spark: 0xc5f8ff },
] as const;

const BANG_RIM = 0x2875dd;
const BANG_CORE = 0xa5f1ff;

function pixel(g: Graphics, x: number, y: number, size: number, color: number, alpha = 1): void {
  g.fillStyle(color, alpha).fillRect(Math.round(x - size / 2), Math.round(y - size / 2), size, size);
}

function sphere(g: Graphics, x: number, y: number, r: number, rim: number, core: number, time: number): void {
  for (let i = -Math.floor(r); i <= Math.floor(r); i++) {
    const half = Math.floor(Math.sqrt(r * r - i * i));
    g.fillStyle(rim).fillRect(Math.round(x) - half, Math.round(y) + i, half * 2 + 1, 1);
    if (half > 1 && Math.abs(i) < r - 1) g.fillStyle(core).fillRect(Math.round(x) - half + 1, Math.round(y) + i, half * 2 - 1, 1);
  }
  pixel(g, x - r * 0.18, y - r * 0.2, Math.max(1, Math.round(r * 0.8)), 0xfffcdf);
  for (let i = 0; i < 6; i++) {
    const a = time * 10 + i * Math.PI / 3;
    pixel(g, x + Math.cos(a) * (r + 2), y + Math.sin(a) * (r + 2), 1 + (i % 2), core, 0.85);
  }
}

export function drawVegetaFighter(back: Graphics, front: Graphics, view: FighterView, x: number, y: number, time: number): boolean {
  const f = view.fighter;
  if (f.hero !== 'vegeta' || f.state !== 'special') return false;
  const h = heroDef(f.hero)!;
  const level = formLevel(f);
  const { rim, core, spark } = FORM_BEAMS[level];
  const face = f.facing;
  if (f.specialKind === 'rasengan') {
    const dir = dashDir(f);
    const speed = Math.hypot(f.vx, f.vy);
    const windup = h.base.dash!.windup;
    const k = Math.min(1, f.stateTime / windup);
    if (f.recoverAt > 0) return true;
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2;
      const r = speed > 10 ? 8 + Math.sin(a) * 3 : 9 + (1 - k) * 6;
      const px = x + dir.x * (speed > 10 ? 6 : 1) + Math.cos(a) * r;
      const py = y - 12 + dir.y * 6 + Math.sin(a) * r;
      pixel(front, px, py, 1 + (i % 3 === 0 ? 1 : 0), i % 2 ? rim : core, 0.6 + k * 0.3);
    }
    if (speed > 10) {
      // A short wedge leads the armored shoulder. The wake spreads behind it.
      for (let i = -6; i <= 6; i++) {
        const lead = 12 - i * i * 0.17;
        pixel(front, x + dir.x * lead - dir.y * i, y - 12 + dir.y * lead + dir.x * i, Math.abs(i) < 3 ? 2 : 1, Math.abs(i) < 3 ? core : rim, 0.9);
      }
      for (let i = 0; i < 8; i++) {
        const d = 5 + (time * 175 + i * 5) % 35;
        const spread = (i % 4 - 1.5) * (3 + d * 0.09);
        pixel(back, x - dir.x * d - dir.y * spread, y - 12 - dir.y * d + dir.x * spread, i % 3 === 0 ? 3 : 2, i % 2 ? rim : core, (1 - d / 42) * 0.8);
      }
    }
    return true;
  }
  if (f.specialKind === 'fireball') {
    const cast = h.second.fireball!;
    const hand = view.frontHand() ?? { x: x + face * 8, y: y - 15 };
    const dx = face * Math.cos(f.stretchAngle);
    const dy = Math.sin(f.stretchAngle);
    if (f.charge !== -2) {
      const t = Math.min(1, f.stateTime / cast.windup);
      const r = 1.1 + 3.1 * t;
      const cx = hand.x + dx * (r + 0.5);
      const cy = hand.y + dy * (r + 0.5);
      sphere(front, cx, cy, r, BANG_RIM, BANG_CORE, time);
      // The orb condenses against the extended palm, with short inward streams.
      for (let i = 0; i < 5; i++) {
        const angle = i * 1.2566 + time * 6;
        const reach = r + 2 + (1 - (t * 1.5 + i * 0.24) % 1) * 8;
        pixel(front, cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach, 1, BANG_CORE, 0.35 + 0.6 * t);
      }
    } else {
      const release = (f.stateTime - cast.windup) / 0.14;
      if (release < 1) {
        const r = 2 + Math.max(0, release) * 9;
        for (let i = 0; i < 12; i++) {
          const angle = i * Math.PI / 6;
          const shift = r * Math.cos(angle) * 0.35;
          const perpendicular = r * Math.sin(angle);
          pixel(front, hand.x + dx * shift - dy * perpendicular, hand.y + dy * shift + dx * perpendicular, 1, BANG_CORE, 1 - Math.max(0, release));
        }
      }
    }
    return true;
  }
  if (f.specialKind !== 'superCharge' && f.specialKind !== 'superBeam') return false;
  const o = beamOrigin({ ...f, x, y });
  if (f.specialKind === 'superCharge') {
    const k = Math.min(1, f.charge / h.super.beam!.minCharge);
    const hand = view.frontHand() ?? o;
    const rear = view.backHand() ?? { x: x - face * 6, y: y - 12 };
    // Galick Gun cups one violet core. Final Flash gathers at both outstretched palms.
    const anchors = level === 1 || k >= 0.88 ? [{ x: (hand.x + rear.x) / 2, y: (hand.y + rear.y) / 2 }] : [hand, rear];
    for (const [index, at] of anchors.entries()) {
      const radius = 1.2 + k * (anchors.length === 1 ? 5.2 : 3.2);
      sphere(front, at.x, at.y, radius, rim, core, time + index);
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4 + time * (index ? -3 : 3);
        const r = radius + 4 + (1 - (time * 2.4 + i * 0.17) % 1) * 16;
        pixel(back, at.x + Math.cos(a) * r, at.y + Math.sin(a) * r, 1 + Number(i % 3 === 0), i % 2 ? rim : spark, 0.35 + k * 0.5);
      }
    }
    return true;
  }

  const dx = face * Math.cos(f.stretchAngle), dy = Math.sin(f.stretchAngle);
  const half = f.beamWidth;
  if (half <= 0.2 || f.stretchLen <= 0) return true;
  for (let d = 0; d < f.stretchLen; d += 2) {
    const cx = o.x + dx * d, cy = o.y + dy * d;
    const width = half * Math.min(1, 0.4 + d / 15);
    for (let n = -Math.floor(width); n <= Math.floor(width); n += 2) {
      const stripe = Math.abs(n) < width * 0.35;
      const bright = Math.sin(d * 0.3 - time * 64 + n * 0.7) > 0.1;
      pixel(front, cx - dy * n, cy + dx * n, 2, stripe ? 0xfffbeb : bright ? core : rim, 0.95);
    }
    if (level === 1) {
      // Two crossing violet ribbons keep Galick Gun distinct from the gold beams.
      const wave = Math.sin(d * 0.19 - time * 46) * (width + 3);
      pixel(front, cx - dy * wave, cy + dx * wave, 2, spark, 0.87);
      pixel(front, cx + dy * wave, cy - dx * wave, 1, rim, 0.93);
    } else if (d % 4 === 0) {
      const pulse = (d / 4 - Math.floor(time * 48)) % 6;
      const flare = pulse === 0 ? 6 : pulse === 1 || pulse === -5 ? 3 : 0;
      for (const side of [-1, 1]) {
        const lash = side * (width + 2 + flare);
        pixel(front, cx - dy * lash, cy + dx * lash, flare > 0 ? 2 : 1, spark, 0.82);
      }
    }
  }
  sphere(front, o.x + dx * f.stretchLen, o.y + dy * f.stretchLen, half * 0.72, rim, core, time);
  return true;
}

export function drawVegetaProjectile(g: Graphics, b: Bullet, x: number, y: number, time: number): boolean {
  if (b.weapon !== 'vegeta:second') return false;
  const sp = Math.hypot(b.vx, b.vy) || 1;
  for (let i = 4; i > 0; i--) {
    const d = i * (b.size + 2);
    const width = Math.max(2, b.size - i);
    const side = (i % 2 ? -1 : 1) * (i + 1);
    pixel(g, x - b.vx / sp * d - b.vy / sp * side, y - b.vy / sp * d + b.vx / sp * side, width, i % 2 ? BANG_RIM : BANG_CORE, 0.8 - i * 0.13);
  }
  sphere(g, x, y, b.size, BANG_RIM, BANG_CORE, time);
  return true;
}
