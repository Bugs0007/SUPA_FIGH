import Phaser from 'phaser';
import { armFrame, BF, FRAME_META, type FighterTextures } from '../art/fighterArt';
import { moveLook } from '../art/heroMoves';
import { formFx } from '../art/heroArt';
import { hexToNum } from '../art/palette';
import type { Fighter } from '../sim/fighter';
import type { FighterView } from './FighterView';
import { formLevel } from './formLevel';

type Graphics = Phaser.GameObjects.Graphics;
interface Echo {
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  head: Phaser.GameObjects.Image;
  front: Phaser.GameObjects.Image;
  back: Phaser.GameObjects.Image;
}

/** Pooled visual assistants and form choreography. No simulation fighters are created here. */
export class HeroChoreography {
  private echoes = new Map<number, Echo[]>();
  private blinks: { id: number; t: number; level: number; fromX: number; fromY: number; toX: number; toY: number }[] = [];

  constructor(scene: Phaser.Scene, private views: FighterView[], private back: Graphics, private front: Graphics) {
    for (const v of views) {
      if (v.fighter.master >= 0 || !['naruto', 'goku'].includes(v.fighter.hero)) continue;
      const echoes: Echo[] = [];
      for (let i = 0; i < (v.fighter.hero === 'naruto' ? 2 : 3); i++) {
        const body = scene.add.image(0, 0, v.tex.body, BF.WINDUP).setOrigin(0.5, 1);
        const head = scene.add.image(0, 0, v.tex.head, 0).setOrigin(0.5, 13 / 16);
        const front = scene.add.image(0, 0, v.tex.arm, 0);
        const back = scene.add.image(0, 0, v.tex.arm, 0).setTint(0xb3acc9);
        const root = scene.add.container(0, 0, [back, body, head, front]).setDepth(38).setVisible(false);
        echoes.push({ root, body, head, front, back });
      }
      this.echoes.set(v.fighter.id, echoes);
    }
  }

  private pose(e: Echo, tex: FighterTextures, frame: number, angle: number): void {
    const m = FRAME_META[frame];
    e.body.setTexture(tex.body, frame);
    e.head.setTexture(tex.head, 0).setPosition(m.neckX - 16, m.neckY - 32);
    e.front.setTexture(tex.arm, armFrame(angle, 1)).setPosition(m.shX - 16, m.shY - 32);
    e.back.setTexture(tex.arm, armFrame(angle + 0.4, 1)).setPosition(m.bshX - 16, m.bshY - 32);
  }

  begin(dt: number): void {
    for (const echoes of this.echoes.values()) for (const e of echoes) e.root.setVisible(false);
    for (let i = this.blinks.length - 1; i >= 0; i--) {
      const b = this.blinks[i];
      b.t += dt;
      const v = this.views[b.id];
      if (b.t > 0.32 || !v?.fighter.alive || v.fighter.gone) { this.blinks.splice(i, 1); continue; }
      const echoes = this.echoes.get(b.id) ?? [];
      echoes.forEach((e, k) => {
        const t = k / echoes.length;
        this.pose(e, v.texFor(b.level), BF.WINDUP, -1.5);
        e.root.setVisible(true).setPosition(b.fromX + (b.toX - b.fromX) * t, b.fromY + (b.toY - b.fromY) * t + 12)
          .setScale(v.fighter.facing, 1).setAlpha((1 - b.t / 0.32) * (0.5 - k * 0.09));
        this.front.fillStyle(moveLook('goku', b.level).spark, (1 - b.t / 0.32) * 0.7)
          .fillRect(Math.round(e.root.x) - 7, Math.round(e.root.y) - 23 + k * 3, 16, 1);
      });
    }
  }

  blink(id: number, fromX: number, fromY: number, toX: number, toY: number): void {
    this.blinks = this.blinks.filter(b => b.id !== id);
    this.blinks.push({ id, t: 0, level: formLevel(this.views[id].fighter), fromX, fromY, toX, toY });
  }

  /** Cubic chakra limb, painted in integer pixels at the same density as the fighter. */
  curve(g: Graphics, points: [number, number, number, number, number, number, number, number], color: number, width: number, alpha = 1): void {
    const [x0, y0, x1, y1, x2, y2, x3, y3] = points;
    g.fillStyle(color, alpha);
    const steps = Math.min(56, Math.max(24, Math.ceil(Math.hypot(x3 - x0, y3 - y0) * 1.5)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const u = 1 - t;
      const x = u ** 3 * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * x3;
      const y = u ** 3 * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * y3;
      g.fillRect(Math.round(x) - Math.floor(width / 2), Math.round(y) - Math.floor(width / 2), width, width);
    }
  }

  rasengan(v: FighterView, x: number, y: number, ox: number, oy: number, phase: number, time: number): void {
    const f = v.fighter;
    const level = formLevel(f);
    const style = moveLook(f.hero, level);
    const assistFade = Math.max(0, Math.min(1, (0.48 - f.stateTime) / 0.18));
    if (f.master < 0 && assistFade > 0) {
      const helpers = this.echoes.get(f.id) ?? [];
      for (let i = 0; i < Math.min(style.helpers, helpers.length); i++) {
        const e = helpers[i];
        const ex = x + f.facing * (i === 0 ? -11 : 8);
        const ey = y + (i === 0 ? 0 : 2);
        this.pose(e, v.texFor(level), BF.WINDUP, i === 0 ? -0.25 : 2.8);
        e.root.setVisible(true).setPosition(ex, ey).setScale(f.facing, 1).setAlpha(assistFade * 0.65);
        // Both clones visibly knead the same sphere, rather than making unrelated attacks.
        this.curve(this.front, [ex, ey - 17, ex + f.facing * 7, ey - 18, ox - f.facing * 4, oy - 6, ox, oy - 2], hexToNum(v.lookFor(level).skin), 2, assistFade * 0.8);
        this.front.fillStyle(0xe2f5ff, assistFade * 0.22).fillRect(Math.round(ex) - 9, Math.round(ey) - 4, 18, 3);
      }
    }
    for (let i = 0; i < style.shapingArms; i++) {
      const upper = i % 2 === 0;
      const sweep = Math.sin(time * 14 + i) * 2;
      const spread = 15 + i * 4;
      const side = f.facing;
      const points: [number, number, number, number, number, number, number, number] = [x - side * 5, y - 9, x - side * spread, y - (upper ? 34 : 3), ox + side * (9 + i * 3), oy + (upper ? -12 : 12) + sweep, ox + side * 2, oy + (upper ? -3 : 3) * phase];
      const width = level === 4 ? 4 : level === 1 ? 3 : 4;
      const color = level === 4 ? 0xf9c341 : hexToNum(formFx('naruto', level).tailColors[0]);
      // Most of the shaping limb stays behind the fighter; only its fingertips cup the orb.
      this.curve(this.back, points, style.rim, width + 1, level === 1 ? 0.18 : 0.5);
      this.curve(this.back, points, color, width - 1, level === 1 ? 0.55 : 0.75);
      this.curve(this.back, points, level === 3 ? 0xefdfc1 : style.spark, 1, 0.65);
      this.front.fillStyle(level === 3 ? 0xefdfc1 : style.spark, 0.8).fillRect(Math.round(ox) + side * 2, Math.round(oy) + (upper ? -4 : 3), 2, 2);
      if (level === 4) {
        // Three chakra fingers cup the orb, with the cloak's black markings on the wrist.
        for (let finger = -1; finger <= 1; finger++) this.front.fillStyle(style.spark, 0.85).fillRect(Math.round(ox) + side * (3 + Math.abs(finger)), Math.round(oy) + finger * 3, 2, 2);
      }
    }
  }

  cast(v: FighterView, x: number, y: number, time: number): void {
    const f = v.fighter;
    const level = formLevel(f);
    const style = moveLook('naruto', level);
    const echoes = this.echoes.get(f.id) ?? [];
    if (f.cloneCount === 0) echoes.forEach((e, i) => {
      this.pose(e, v.texFor(level), BF.WINDUP, 0.25);
      e.root.setVisible(true).setPosition(x + (i === 0 ? -1 : 1) * 18, y).setScale(f.facing, 1).setAlpha(0.65);
    });
    // Smoke drifts upward after the already-visible clones appear; no orbit or reveal delay.
    for (let i = 0; i < 7; i++) {
      const side = i % 2 ? -1 : 1;
      const drift = (time * 14 + i * 3) % 18;
      this.back.fillStyle(level > 0 ? style.spark : 0xe8eff7, 0.28).fillRect(Math.round(x + side * (15 + i % 3)), Math.round(y - 4 - drift), 3, 2);
    }
    this.front.fillStyle(level > 0 ? style.spark : 0xe8eff7, 0.8).fillRect(Math.round(x) + f.facing * 3, Math.round(y) - 14, 2, 4);
  }

  /** Form-specific limb path. Gear 5 bends like a cartoon; Gear 4 coils like a spring. */
  rubberPath(f: Fighter, x: number, y: number, len: number, time: number, g = this.front): void {
    const style = moveLook('luffy', formLevel(f));
    if (style.rubber !== 'cartoon' && style.rubber !== 'haki') return;
    const dx = Math.cos(f.stretchAngle) * f.facing;
    const dy = Math.sin(f.stretchAngle);
    const px = -dy;
    const py = dx;
    const endX = x + dx * len;
    const endY = y + dy * len;
    const bend = style.rubber === 'cartoon' ? Math.sin(time * 13) * Math.min(15, len * 0.2) : Math.min(8, len * 0.08);
    const points: [number, number, number, number, number, number, number, number] = [x, y, x + dx * len / 3 + px * bend, y + dy * len / 3 + py * bend, x + dx * len * 2 / 3 - px * bend, y + dy * len * 2 / 3 - py * bend, endX, endY];
    this.curve(g, points, 0x171523, 5);
    this.curve(g, points, style.core, 3);
    this.curve(g, points, style.rubber === 'haki' ? 0xb63551 : 0xffe3ca, 1);
  }

  destroy(): void {
    for (const echoes of this.echoes.values()) for (const e of echoes) e.root.destroy();
    this.echoes.clear();
    this.blinks = [];
  }
}
