import { formLevel } from './formLevel';
import Phaser from 'phaser';
import { BOOST_COLORS, formFx, type FormFx } from '../art/heroArt';
import { hexToNum, P } from '../art/palette';
import { SHOULDER_Y_STAND } from '../sim/constants';
import { heroDef } from '../sim/data/heroes';
import type { Fighter } from '../sim/fighter';
import { baseAbility, beamOrigin, rasenganPoint } from '../sim/hero';
import type { World } from '../sim/world';
import type { FighterView } from './FighterView';
import type { Fx } from './Fx';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** Particles to emit this frame for a continuous rate (per second). */
const emitCount = (rate: number, dt: number) => Math.floor(rate * dt + Math.random());

const INK = hexToNum(P.ink);

/** [main, highlight] colours of a fighter's current power (form, or the generic boost). */
export function powerColors(f: Fighter): [number, number] {
  const lv = formLevel(f);
  const c = lv > 0 ? formFx(f.hero, lv).aura : BOOST_COLORS;
  return [hexToNum(c[0]), hexToNum(c[1])];
}

/**
 * A fan of wavy chakra tails behind a fighter standing at (x, y = feet), tipped with a brighter colour.
 * `scale` lets menus draw them at preview size.
 */
export function drawTails(g: Phaser.GameObjects.Graphics, fxd: FormFx, x: number, y: number, facing: number, time: number, scale: number, fox = false): void {
  const n = fxd.tails;
  if (n <= 0) return;
  const body = hexToNum(fxd.tailColors[0]);
  const tip = hexToNum(fxd.tailColors[1]);
  const bx = x - facing * (fox ? 6 : 3) * scale;
  const by = y - (fox ? 6 : 8) * scale;
  const ghost = !!fxd.ghostTails;
  const len = (9 + Math.min(n, 6) * 1.2) * scale;
  for (let k = 0; k < n; k++) {
    // fan: theta 0 = straight back, pi/2 = straight up; nine tails also spread over the head
    const t = n === 1 ? 0.4 : k / (n - 1);
    const theta = n >= 9 ? -0.15 + t * 1.95 : 0.12 + t * 1.3;
    const ux = -facing * Math.cos(theta);
    const uy = -Math.sin(theta);
    for (const pass of [0, 1]) {
      for (let s = 1; s <= 9; s++) {
        const d = (s / 9) * len;
        const wave = Math.sin(time * 3.2 + s * 0.55 + k * 1.7) * (1 + s * 0.28) * 0.7 * scale;
        const px = bx + ux * d - uy * wave;
        const py = by + uy * d + ux * wave;
        const thick = (s < 3 ? 3 : s < 7 ? 2 : 1) * scale;
        const o = scale;
        // ghost tails (form 1) are pure crimson aura: no solid body, no outline
        if (ghost) {
          if (pass === 1) g.fillStyle(s >= 6 ? tip : body, 0.5 - s * 0.03).fillRect(Math.round(px) - o, Math.round(py) - o, thick + 2 * o, thick + 2 * o);
        } else if (pass === 0) g.fillStyle(INK, 1).fillRect(Math.round(px) - o, Math.round(py) - o, thick + 2 * o, thick + 2 * o);
        else g.fillStyle(s >= 7 ? tip : body, 1).fillRect(Math.round(px), Math.round(py), thick, thick);
      }
    }
  }
}

/**
 * Hero visuals (M9, reworked M11): per-form auras (orbiting pixels, steam, fire, clouds, lightning),
 * chakra tails, stretched rubber limbs and giant fists, beams, charge orbs.
 * Pixel discs are drawn row by row so they keep hard edges at every zoom.
 */
export class HeroFx {
  private back: Phaser.GameObjects.Graphics;
  private front: Phaser.GameObjects.Graphics;
  private orbs: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    private world: World,
    private views: FighterView[],
    private fx: Fx,
  ) {
    this.back = scene.add.graphics().setDepth(39);
    this.front = scene.add.graphics().setDepth(41);
    this.orbs = scene.add.graphics().setDepth(57);
  }

  destroy(): void {
    this.back.destroy();
    this.front.destroy();
    this.orbs.destroy();
  }

  /** Filled pixel disc (hard edges). */
  private disc(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, color: number, alpha = 1): void {
    const x0 = Math.round(cx);
    const y0 = Math.round(cy);
    const rr = Math.max(0.5, r);
    g.fillStyle(color, alpha);
    for (let dy = -Math.floor(rr); dy <= Math.floor(rr); dy++) {
      const half = Math.floor(Math.sqrt(rr * rr - dy * dy) + 0.25);
      g.fillRect(x0 - half, y0 + dy, half * 2 + 1, 1);
    }
  }

  private xforms: { fid: number; t: number; c0: number; c1: number; level: number; burst: boolean }[] = [];

  /**
   * The one universal transformation animation (D61): energy streams in while the body flickers (0.35 s),
   * then a burst: two shockwave rings, a pillar of light and a spray of sparks. Bigger with the form level.
   */
  startTransform(fid: number, level: number, c0: number, c1: number): void {
    this.xforms.push({ fid, t: 0, c0, c1, level: Math.max(1, level), burst: false });
  }

  private ring(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, color: number, alpha: number, ry = 1): void {
    const n = Math.max(12, Math.round(r * 2.4));
    g.fillStyle(color, alpha);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      g.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * ry), 2, 2);
    }
  }

  private drawTransforms(alpha: number, dt: number): void {
    const g = this.orbs;
    for (let i = this.xforms.length - 1; i >= 0; i--) {
      const x = this.xforms[i];
      x.t += dt;
      const f = this.world.fighters[x.fid];
      if (!f || x.t > 1.1) {
        this.xforms.splice(i, 1);
        continue;
      }
      const px = lerp(f.px, f.x, alpha);
      const py = lerp(f.py, f.y, alpha);
      const cy = py - 11;
      const big = 0.8 + x.level * 0.25;
      if (x.t < 0.35) {
        // charge: a contracting ring on the ground, energy streaming into the body
        const k = x.t / 0.35;
        this.ring(g, px, py - 1, (1 - k) * 26 * big + 4, x.c1, 0.9, 0.22);
        this.disc(g, px, cy, 2 + k * 6, x.c0, 0.35 + k * 0.4);
        if (dt > 0) {
          for (let n = emitCount(70, dt); n > 0; n--) {
            const a = rnd(0, Math.PI * 2);
            const r = rnd(16, 30) * big;
            this.fx.spawn({ frame: 'p1', x: px + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.9, vx: -Math.cos(a) * r * 3.2, vy: -Math.sin(a) * r * 3, life: 0.3, a0: 0.2, a1: 1, tint: Math.random() < 0.5 ? x.c0 : x.c1, add: true, depth: 58 });
          }
        }
      } else {
        if (!x.burst) {
          x.burst = true;
          if (dt > 0) this.fx.sparks(px, cy, 0, -1, 14 + x.level * 6, x.c1, 260 + x.level * 40);
        }
        const k = (x.t - 0.35) / 0.75;
        const fade = Math.max(0, 1 - k);
        // two shockwave rings, the second a little later
        this.ring(g, px, py - 1, 4 + k * 46 * big, x.c1, fade, 0.22);
        if (k > 0.15) this.ring(g, px, py - 1, 4 + (k - 0.15) * 40 * big, 0xffffff, fade * 0.8, 0.22);
        // pillar of light
        const w = Math.max(0, (10 + x.level * 3) * (1 - k) * (k < 0.1 ? k * 10 : 1));
        const h = 150;
        g.fillStyle(x.c0, 0.5 * fade).fillRect(Math.round(px - w / 2 - 2), Math.round(py - h), Math.round(w + 4), h);
        g.fillStyle(x.c1, 0.8 * fade).fillRect(Math.round(px - w / 2), Math.round(py - h), Math.round(w), h);
        g.fillStyle(0xffffff, fade).fillRect(Math.round(px - w / 4), Math.round(py - h), Math.max(1, Math.round(w / 2)), h);
        // ground flash
        g.fillStyle(0xffffff, 0.6 * fade).fillRect(Math.round(px - 20 * big * (1 - k * 0.5)), Math.round(py - 1), Math.round(40 * big * (1 - k * 0.5)), 2);
      }
    }
  }

  sync(alpha: number, dt: number, time: number): void {
    this.back.clear();
    this.front.clear();
    this.orbs.clear();
    for (const v of this.views) {
      const f = v.fighter;
      if (!f.alive || f.gone) continue;
      const x = lerp(f.px, f.x, alpha);
      const y = lerp(f.py, f.y, alpha);
      if (f.power || formLevel(f) > 0) this.aura(f, x, y, dt, time);
      if (formLevel(f) > 0) this.tails(f, x, y, time);
      if (f.flying) this.flight(f, x, y, dt, time);
      const sk = f.specialKind;
      if (f.state === 'special') {
        if (sk === 'rasengan') this.rasengan(f, x, y, dt, time);
        else if (sk === 'beamCharge' || sk === 'superCharge') this.chargeGlow(f, x, y, time, sk === 'superCharge');
        else if (sk === 'beam' || sk === 'superBeam') this.beam(f, x, y, dt, time, sk === 'superBeam');
        else if (sk === 'gatling') this.gatling(v, x, y, time);
        else if (sk === 'bomb') this.bombOrb(f, x, y, time, dt);
      }
      if (f.stretchLen > 0 && sk !== 'beam' && sk !== 'superBeam') this.stretchLimb(v, x, y);
    }
    this.drawOrbs(alpha, dt, time);
    this.drawTransforms(alpha, dt);
  }

  // ------------------------------------------------------------------ auras and tails

  private aura(f: Fighter, x: number, y: number, dt: number, time: number): void {
    const [c0, c1] = powerColors(f);
    const expiring = f.power === 'boost' && f.powerTime < 3 && Math.floor(time * 10) % 2 === 0;
    if (expiring) return;
    const fxd = formLevel(f) > 0 ? formFx(f.hero, formLevel(f)) : null;
    const pw = fxd?.power ?? 0;
    const cy = y - 11;
    const n = fxd ? 4 + pw * 3 : 6;
    const rx = fxd ? 9 + pw : 8;
    const ry = fxd ? 13 + pw * 1.5 : 12;
    for (let i = 0; i < n; i++) {
      const a = time * (fxd ? 4 + pw : 3.5) + (i * Math.PI * 2) / n;
      if ((Math.floor(time * 24) + i) % 5 === 0) continue;
      const px = Math.round(x + Math.cos(a) * rx);
      // flame-like: pixels drift upward along the ellipse
      const py = Math.round(cy + Math.sin(a) * ry - Math.abs(Math.cos(a * 0.5)) * 2);
      const g = Math.sin(a) < 0 ? this.back : this.front;
      g.fillStyle(i % 2 ? c1 : c0, 0.9).fillRect(px - 1, py - 1, pw >= 3 ? 3 : 2, pw >= 3 ? 3 : 2);
    }
    // ground glow under the feet
    this.back.fillStyle(c0, 0.25).fillRect(Math.round(x) - 7 - pw, Math.round(y) - 1, 14 + pw * 2, 1);
    if (!fxd) {
      if (dt > 0) for (let i = emitCount(6, dt); i > 0; i--) this.mote(x, y, c0, c1, 0.5);
      return;
    }
    if (dt <= 0) return;
    switch (fxd.extra) {
      case 'steam':
        for (let i = emitCount(10 + pw * 6, dt); i > 0; i--) {
          this.fx.spawn({ frame: 'puff3', x: x + rnd(-5, 5), y: y - rnd(4, 20), vx: rnd(-10, 10), vy: rnd(-40, -20), drag: 1.5, life: rnd(0.4, 0.8), s0: 0.4, s1: 1.4, a0: 0.55, a1: 0, tint: Math.random() < 0.5 ? c0 : c1, depth: 42 });
        }
        break;
      case 'clouds':
        // Nika: puffy white clouds swirl around
        for (let i = emitCount(16, dt); i > 0; i--) {
          const a = rnd(0, Math.PI * 2);
          this.fx.spawn({ frame: 'puff4', x: x + Math.cos(a) * 11, y: y - 11 + Math.sin(a) * 15, vx: Math.cos(a) * 14, vy: rnd(-24, -6), drag: 1, life: rnd(0.5, 0.9), s0: 0.5, s1: 1.8, a0: 0.7, a1: 0, tint: Math.random() < 0.5 ? 0xffffff : c1, depth: Math.random() < 0.5 ? 38 : 43 });
        }
        break;
      case 'fire':
        for (let i = emitCount(26, dt); i > 0; i--) {
          this.fx.spawn({ frame: Math.random() < 0.4 ? 'p2' : 'p1', x: x + rnd(-8, 8), y: y - rnd(0, 20), vx: rnd(-8, 8), vy: rnd(-90, -40), life: rnd(0.3, 0.6), a0: 1, a1: 0, tint: Math.random() < 0.5 ? c1 : c0, add: Math.random() < 0.5, depth: 42 });
        }
        break;
      case 'lightning':
        this.lightning(f, x, y, c1, pw);
        for (let i = emitCount(14 + pw * 5, dt); i > 0; i--) this.mote(x, y, c0, c1, 1);
        break;
      default:
        for (let i = emitCount(8 + pw * 6, dt); i > 0; i--) this.mote(x, y, c0, c1, 1);
    }
  }

  private mote(x: number, y: number, c0: number, c1: number, k: number): void {
    this.fx.spawn({ frame: Math.random() < 0.3 ? 'p2' : 'p1', x: x + rnd(-7, 7), y: y - rnd(0, 22), vx: rnd(-6, 6), vy: rnd(-55, -25) * k, life: rnd(0.25, 0.5), a0: 1, a1: 0, tint: Math.random() < 0.6 ? c0 : c1, add: true, depth: 42 });
  }

  /** Crackling lightning: short bright zigzags around the body (redrawn every frame, so it flickers). */
  private lightning(f: Fighter, x: number, y: number, color: number, pw: number): void {
    if (Math.random() < 0.55) return;
    const g = this.front;
    const bolts = 1 + (pw >= 3 ? 1 : 0);
    for (let b = 0; b < bolts; b++) {
      let px = x + rnd(-9, 9);
      let py = y - rnd(2, 24);
      const dir = Math.random() < 0.5 ? -1 : 1;
      for (let i = 0; i < 5; i++) {
        const nx = px + dir * rnd(1, 3);
        const ny = py + rnd(-3, 3);
        g.fillStyle(0xffffff, 1).fillRect(Math.round(Math.min(px, nx)), Math.round(Math.min(py, ny)), Math.max(1, Math.abs(Math.round(nx - px))), 1);
        g.fillStyle(color, 0.8).fillRect(Math.round(nx), Math.round(ny), 1, 1);
        px = nx;
        py = ny;
      }
    }
    void f;
  }

  /** Chakra tails (Naruto's forms) behind the body. */
  private tails(f: Fighter, x: number, y: number, time: number): void {
    const fox = f.hero === 'naruto' && formLevel(f) >= 1 && formLevel(f) <= 3 && f.state !== 'melee' && f.state !== 'special';
    drawTails(this.back, formFx(f.hero, formLevel(f)), x, y, f.facing, time, 1, fox);
    if (formFx(f.hero, formLevel(f)).ghostTails && Math.random() < 0.5) {
      // the aura tail sheds crimson sparks
      this.fx.spawn({ frame: 'p1', x: x - f.facing * rnd(5, 18), y: y - rnd(8, 22), vy: rnd(-30, -10), life: rnd(0.2, 0.4), a0: 1, a1: 0, tint: 0xff4a3a, add: true, depth: 42 });
    }
  }

  // ------------------------------------------------------------------ flight, rasengan

  /** Hold-Up flight (final forms): a soft ki shell and a downdraft while flying. */
  private flight(f: Fighter, x: number, y: number, dt: number, time: number): void {
    const g = this.front;
    const cy = y - 11;
    const sp = Math.hypot(f.vx, f.vy);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = time * 4 + (i * Math.PI * 2) / n;
      if ((Math.floor(time * 20) + i) % 4 === 0) continue;
      const px = Math.round(x + Math.cos(a) * 9);
      const py = Math.round(cy + Math.sin(a) * 13);
      (Math.sin(a) < 0 ? this.back : g).fillStyle(i % 2 ? 0xffffff : 0xa8e0ff, 0.55 + Math.min(0.35, sp / 400)).fillRect(px, py, 1, 1);
    }
    if (dt > 0) {
      for (let i = emitCount(10 + sp * 0.08, dt); i > 0; i--) {
        this.fx.spawn({ frame: 'p1', x: x + rnd(-3, 3), y: y + rnd(-1, 2), vx: -f.vx * 0.3 + rnd(-10, 10), vy: rnd(20, 50) - f.vy * 0.2, life: rnd(0.15, 0.3), a0: 0.9, a1: 0, tint: Math.random() < 0.5 ? 0xa8e0ff : 0xffffff, add: true, depth: 42 });
      }
    }
  }

  /** Rasengan: a spinning blue orb that forms in the palm, then rides the dash with a trail. */
  private rasengan(f: Fighter, x: number, y: number, dt: number, time: number): void {
    const d = baseAbility(f)?.dash;
    if (!d) return;
    const t = f.stateTime;
    const forming = t < d.windup;
    const k = forming ? Math.min(1, t / d.windup) : 1;
    if (!forming && f.recoverAt > 0) return; // (the orb fades once the dash is over)
    const { x: ox, y: oy } = rasenganPoint({ ...f, x } as Fighter);
    const cy = oy - f.y + y;
    const r = 1 + k * 3.2 + Math.sin(time * 50) * 0.4 + (f.power === 'hero' ? f.powerLevel * 0.5 : 0);
    const g = this.orbs;
    this.disc(g, ox, cy, r + 1.5, hexToNum('#2a6ad8'), 0.85);
    this.disc(g, ox, cy, r, hexToNum('#7ac8ff'), 1);
    this.disc(g, ox, cy, Math.max(0.8, r * 0.45), 0xffffff, 1);
    for (let i = 0; i < 4; i++) {
      const a = time * 30 + (i * Math.PI) / 2;
      g.fillStyle(i % 2 ? 0xffffff : hexToNum('#bfe8ff'), 1).fillRect(Math.round(ox + Math.cos(a) * (r + 1)), Math.round(cy + Math.sin(a) * (r + 1) * 0.6), 1, 1);
    }
    if (dt > 0) {
      for (let i = emitCount(forming ? 30 : 70, dt); i > 0; i--) {
        const a = Math.random() * Math.PI * 2;
        const rr = forming ? 8 : 3;
        this.fx.spawn({
          frame: 'p1',
          x: ox + Math.cos(a) * rr,
          y: cy + Math.sin(a) * rr,
          vx: forming ? -Math.cos(a) * 40 : -f.facing * rnd(40, 90),
          vy: forming ? -Math.sin(a) * 40 : rnd(-15, 15),
          life: rnd(0.12, 0.25),
          a0: 1,
          a1: 0,
          tint: Math.random() < 0.5 ? hexToNum('#7ac8ff') : 0xffffff,
          add: true,
          depth: 58,
        });
      }
    }
  }

  // ------------------------------------------------------------------ rubber limbs and giant fists

  /** Rubber arm (or leg for a stretch kick) from the body out to the current reach. */
  private stretchLimb(v: FighterView, x: number, y: number): void {
    const f = v.fighter;
    const look = v.lookFor(formLevel(f));
    const combo = heroDef(f.hero)?.combo;
    const kick = f.state === 'kick' || (f.state === 'melee' && !!combo?.[Math.min(f.combo, combo.length - 1)]?.kick);
    const angled = f.state === 'special' && (f.specialKind === 'pistol' || f.specialKind === 'rocket' || f.specialKind === 'swing' || f.specialKind === 'superFist') && Math.abs(f.stretchAngle) > 0.01;
    const big = f.specialKind === 'superFist';
    if (angled) {
      this.angledArm(f, x, y, hexToNum(look.skin), big ? f.beamWidth : 2);
      return;
    }
    const ly = Math.round(kick ? y - 5 : y - SHOULDER_Y_STAND + 1);
    const x0 = Math.round(x + f.facing * 2);
    const len = Math.round(f.w / 2 + f.stretchLen);
    const x1 = x0 + f.facing * len;
    const l = Math.min(x0, x1);
    const w = Math.abs(x1 - x0);
    const g = this.front;
    const skin = hexToNum(look.skin);
    const fist = big ? f.beamWidth : 0;
    g.fillStyle(INK, 1).fillRect(l - 1, ly - 2 - fist * 0.3, w + 2, 4 + fist * 0.6);
    g.fillStyle(skin, 1).fillRect(l, ly - 1 - fist * 0.3, w, 2 + fist * 0.6);
    g.fillStyle(hexToNum(P.white), 0.5);
    for (let i = 6; i < w - 6; i += 7) g.fillRect(l + i, ly - 1, 2, 1);
    const fx0 = x1 - (f.facing > 0 ? 1 : 3);
    g.fillStyle(INK, 1).fillRect(fx0 - 1 - fist, ly - 3 - fist, 6 + fist * 2, 6 + fist * 2);
    g.fillStyle(kick ? hexToNum(look.shoesColor) : skin, 1).fillRect(fx0 - fist, ly - 2 - fist, 4 + fist * 2, 4 + fist * 2);
  }

  /** An angled rubber arm stepped pixel by pixel, a fist (radius `fist`) at the end. */
  private angledArm(f: Fighter, x: number, y: number, skin: number, fist: number): void {
    // a rope-arm hanging from a ceiling runs behind the body, not over his face
    const g = f.specialKind === 'swing' ? this.back : this.front;
    const dx = Math.cos(f.stretchAngle) * f.facing;
    const dy = Math.sin(f.stretchAngle);
    const x0 = x + f.facing * 2;
    const y0 = y - SHOULDER_Y_STAND + 1;
    const len = f.w / 2 + f.stretchLen;
    const th = 1 + Math.floor(fist / 3);
    g.fillStyle(INK, 1);
    for (let d = 0; d <= len; d += 1) g.fillRect(Math.round(x0 + dx * d) - 2 - th, Math.round(y0 + dy * d) - 2 - th, 4 + th * 2, 4 + th * 2);
    g.fillStyle(skin, 1);
    for (let d = 0; d <= len; d += 1) g.fillRect(Math.round(x0 + dx * d) - 1 - th, Math.round(y0 + dy * d) - 1 - th, 2 + th * 2, 2 + th * 2);
    const fx = Math.round(x0 + dx * len);
    const fy = Math.round(y0 + dy * len);
    const r = Math.max(2, fist);
    this.disc(g, fx, fy, r + 1, INK);
    this.disc(g, fx, fy, r, skin);
    if (r > 4) {
      // knuckle lines on the giant fist
      g.fillStyle(hexToNum(P.ink), 0.45);
      for (let i = -1; i <= 1; i++) g.fillRect(fx + f.facing * (r - 2), fy + i * 3 - 1, 1, 2);
    }
  }

  /** Gum-Gum Gatling: several fists flicker out in front at different heights and reaches. */
  private gatling(v: FighterView, x: number, y: number, time: number): void {
    const f = v.fighter;
    const g = heroDef(f.hero)?.second.gatling;
    if (!g) return;
    const look = v.lookFor(formLevel(f));
    const skin = hexToNum(look.skin);
    const fr = this.front;
    const step = Math.floor(time * 30);
    for (let i = 0; i < 5; i++) {
      const phase = (step + i * 3) % 6;
      const reach = (phase / 5) * (g.range + 8) * (0.7 + 0.3 * ((i * 7 + step) % 3) / 2);
      const ly = Math.round(y - SHOULDER_Y_STAND + 1 + ((i * 5 + step * 2) % 11) - 5);
      const x0 = Math.round(x + f.facing * 3);
      const x1 = x0 + f.facing * Math.round(reach);
      const l = Math.min(x0, x1);
      const w = Math.abs(x1 - x0);
      fr.fillStyle(INK, 1).fillRect(l - 1, ly - 2, w + 2, 4);
      fr.fillStyle(skin, 1).fillRect(l, ly - 1, w, 2);
      fr.fillStyle(INK, 1).fillRect(x1 - 3, ly - 3, 6, 6);
      fr.fillStyle(skin, 1).fillRect(x1 - 2, ly - 2, 4, 4);
    }
  }

  // ------------------------------------------------------------------ beams and orbs

  /** Kamehameha charge: a glowing ball between the hands that grows while the button is held. */
  private chargeGlow(f: Fighter, x: number, y: number, time: number, isSuper: boolean): void {
    const h = heroDef(f.hero);
    const maxC = isSuper ? (h?.super.beam?.minCharge ?? 0.5) : (h?.second.beam?.maxCharge ?? 1);
    const k = Math.min(1, Math.max(0, f.charge) / maxC);
    const [c0, c1] = isSuper && f.power === 'hero' ? powerColors(f) : [hexToNum('#5ab0ff'), hexToNum('#e8f8ff')];
    const hx = x + f.facing * 6;
    const hy = y - 7;
    const r = 1.5 + k * (isSuper ? 6 : 4.5) + Math.sin(time * 40) * 0.5;
    this.disc(this.front, hx, hy, r + 1, c0, 0.8);
    this.disc(this.front, hx, hy, r * 0.6, c1, 1);
    if (Math.random() < 0.7) this.fx.spawn({ frame: 'p1', x: hx + rnd(-14, 14), y: hy + rnd(-14, 14), vx: (hx - x) * 0, life: 0.18, a0: 1, a1: 0, tint: c1, add: true, depth: 58 });
  }

  /** The beam itself: layered coloured bands with a white core, ragged at the edge. */
  private beam(f: Fighter, x: number, y: number, dt: number, time: number, isSuper: boolean): void {
    if (f.beamWidth <= 0.2 || f.stretchLen <= 0) return;
    const o = beamOrigin({ ...f, x, y } as Fighter);
    const dx = Math.cos(f.stretchAngle) * f.facing;
    const dy = Math.sin(f.stretchAngle);
    const len = f.stretchLen;
    const half = f.beamWidth;
    const [c0, c1] = isSuper && f.power === 'hero' ? powerColors(f) : [hexToNum('#4a9aff'), hexToNum('#bfe8ff')];
    const g = this.orbs;
    const px = -dy;
    const py = dx;
    for (let d = 0; d <= len; d += 2) {
      const wob = Math.sin(time * 40 + d * 0.3) * 0.6;
      const taper = d < 6 ? 0.6 + d / 15 : 1;
      const cx = o.x + dx * d;
      const cy = o.y + dy * d;
      const rr = half * taper + wob;
      for (const [k, col, a] of [[1.25, c0, 0.45], [1, c0, 1], [0.6, c1, 1], [0.28, 0xffffff, 1]] as const) {
        const r = Math.max(0.5, rr * k);
        g.fillStyle(col, a).fillRect(Math.round(cx - r * Math.abs(px) - 1), Math.round(cy - r * Math.abs(py) - 1), Math.max(2, Math.round(r * Math.abs(px) * 2 + 2)), Math.max(2, Math.round(r * Math.abs(py) * 2 + 2)));
      }
    }
    // impact flare at the far end
    this.disc(g, o.x + dx * len, o.y + dy * len, half * 1.3, c1, 0.9);
    if (dt > 0) {
      for (let i = emitCount(40 + half * 8, dt); i > 0; i--) {
        const d = Math.random() * len;
        this.fx.spawn({ frame: 'p1', x: o.x + dx * d + rnd(-half, half) * px, y: o.y + dy * d + rnd(-half, half) * py, vx: rnd(-20, 20), vy: rnd(-30, 10), life: rnd(0.1, 0.3), a0: 1, a1: 0, tint: Math.random() < 0.5 ? c1 : c0, add: true, depth: 58 });
      }
    }
  }

  /** Tailed Beast Bomb charging overhead (the flying orb is drawn by drawOrbs). */
  private bombOrb(f: Fighter, x: number, y: number, time: number, dt: number): void {
    if (f.charge < 0) return;
    const [c0, c1] = powerColors(f);
    const k = Math.max(0.1, Math.min(1, f.charge));
    const r = 1.5 + k * (3.5 + f.powerLevel * 1.2);
    const cx = x + f.facing * 2;
    const cy = y - 31 - r * 0.5;
    const g = this.orbs;
    this.disc(g, cx, cy, r + 2, c1, 0.5);
    this.disc(g, cx, cy, r + 1, c0, 1);
    this.disc(g, cx, cy, Math.max(1, r - 1), hexToNum('#18060c'), 1);
    for (let i = 0; i < 6; i++) {
      const a = time * 11 + (i * Math.PI) / 3;
      g.fillStyle(i % 2 ? c1 : c0, 1).fillRect(Math.round(cx + Math.cos(a) * (r + 2)) - 1, Math.round(cy + Math.sin(a) * (r + 2)) - 1, 2, 2);
    }
    if (dt > 0) {
      for (let i = emitCount(40, dt); i > 0; i--) {
        const a = Math.random() * Math.PI * 2;
        this.fx.spawn({ frame: 'p1', x: cx + Math.cos(a) * (r + 10), y: cy + Math.sin(a) * (r + 10), vx: -Math.cos(a) * 50, vy: -Math.sin(a) * 50, life: 0.2, a0: 1, a1: 0, tint: c1, add: true, depth: 58 });
      }
    }
  }

  private drawOrbs(alpha: number, dt: number, time: number): void {
    const g = this.orbs;
    for (const bl of this.world.bullets) {
      if (!bl.active) continue;
      if (bl.kind === 'cannonball') {
        const cx = lerp(bl.px, bl.x, alpha);
        const cy = lerp(bl.py, bl.y, alpha);
        this.disc(g, cx, cy, 3.5, INK, 1);
        this.disc(g, cx - 1, cy - 1, 1, hexToNum(P.steel2), 1);
        continue;
      }
      if (bl.kind !== 'chakra' && bl.kind !== 'ki') continue;
      const x = lerp(bl.px, bl.x, alpha);
      const y = lerp(bl.py, bl.y, alpha);
      const r = Math.max(2, bl.size + 1);
      const sp = Math.hypot(bl.vx, bl.vy) || 1;
      if (bl.kind === 'chakra') {
        // the Tailed Beast Bomb: dark core, ringed in the owner's current form colours
        const owner = this.world.fighters[bl.owner];
        const [c0, c1] = owner?.power === 'hero' ? powerColors(owner) : [hexToNum('#c8202a'), hexToNum('#ff7a2a')];
        this.disc(g, x, y, r + 2, c1, 0.85);
        this.disc(g, x, y, r + 1, c0, 1);
        this.disc(g, x, y, r - 1, hexToNum('#2a0610'), 1);
        for (let i = 0; i < 6; i++) {
          const a = time * 9 + (i * Math.PI) / 3;
          g.fillStyle(i % 2 ? c1 : 0xffffff, 1).fillRect(Math.round(x + Math.cos(a) * (r + 2)) - 1, Math.round(y + Math.sin(a) * (r + 2)) - 1, 2, 2);
        }
        for (let i = emitCount(40 + r * 5, dt); i > 0; i--) {
          this.fx.spawn({ frame: 'p2', x: x - (bl.vx / sp) * r, y: y + rnd(-r, r), vx: -bl.vx * 0.15 + rnd(-15, 15), vy: rnd(-20, 20), life: rnd(0.15, 0.3), a0: 1, a1: 0, tint: Math.random() < 0.5 ? c0 : c1, add: true, depth: 56 });
        }
      } else {
        this.disc(g, x, y, r + 1, hexToNum('#7ad8ff'), 0.8);
        this.disc(g, x, y, r, hexToNum('#fff8c0'), 1);
        this.disc(g, x, y, Math.max(1, r - 2), 0xffffff, 1);
        for (let i = emitCount(30 + r * 6, dt); i > 0; i--) {
          this.fx.spawn({ frame: 'p1', x: x - (bl.vx / sp) * r, y: y + rnd(-r, r), vx: -bl.vx * 0.1, vy: rnd(-10, 10), life: rnd(0.1, 0.25), a0: 1, a1: 0, tint: Math.random() < 0.5 ? hexToNum('#7ad8ff') : 0xffffff, add: true, depth: 56 });
        }
      }
    }
  }
}
