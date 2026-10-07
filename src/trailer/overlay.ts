import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../game/display';
import { bindZoom } from '../scenes/ui';
import type { MatchScene } from '../scenes/MatchScene';

interface Item {
  main: Phaser.GameObjects.BitmapText;
  shadow: Phaser.GameObjects.BitmapText;
  at: number;
  dur: number;
  y: number;
  anim: 'slam' | 'fade' | 'pop';
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t);

/** Trailer title/caption overlay drawn above the match (fades, dim, pixel-font slams). Frame-driven, no tweens. */
export class TrailerOverlay extends Phaser.Scene {
  private items: Item[] = [];
  private fade!: Phaser.GameObjects.Rectangle;
  private flash!: Phaser.GameObjects.Rectangle;
  private dimRect!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('trailerHud');
  }

  create(): void {
    bindZoom(this, VIEW_W, VIEW_H);
    const ms = this.scene.get('match') as MatchScene;
    const spec = ms.trailer!.spec;
    this.items = [];
    this.dimRect = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x05030a, 0).setOrigin(0, 0).setDepth(1);
    for (const o of spec.overlays ?? []) {
      const font = o.font ?? 'pxo';
      const sc = o.scale ?? 3;
      const col = o.color ?? 0xfff2a0;
      const shadow = this.add.bitmapText(VIEW_W / 2 + sc, (o.y ?? 150) + sc, font, o.text).setOrigin(0.5).setScale(sc).setTint(0x7a1020).setDepth(10).setVisible(false);
      const main = this.add.bitmapText(VIEW_W / 2, o.y ?? 150, font, o.text).setOrigin(0.5).setScale(sc).setTint(col).setDepth(11).setVisible(false);
      this.items.push({ main, shadow, at: o.at, dur: o.dur, y: o.y ?? 150, anim: o.anim ?? 'slam' });
    }
    this.fade = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x000000, 0).setOrigin(0, 0).setDepth(50);
    this.flash = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0xffffff, 0).setOrigin(0, 0).setDepth(51);
  }

  override update(): void {
    const ms = this.scene.get('match') as MatchScene;
    const rig = ms.trailer;
    if (!rig) return;
    const vf = rig.vf;
    const spec = rig.spec;
    // dim (behind the end card) ramps in with the first overlay
    this.dimRect.setAlpha(spec.dim ?? 0);
    let fa = 0;
    if (spec.fadeIn) fa = Math.max(fa, 1 - clamp(vf / spec.fadeIn, 0, 1));
    if (spec.fadeOut) fa = Math.max(fa, clamp((vf - (spec.frames - spec.fadeOut)) / spec.fadeOut, 0, 1));
    this.fade.setAlpha(fa);
    let wa = 0;
    if (spec.flashIn) wa = Math.max(wa, 1 - clamp(vf / spec.flashIn, 0, 1));
    if (spec.flashOut) wa = Math.max(wa, clamp((vf - (spec.frames - spec.flashOut)) / spec.flashOut, 0, 1));
    this.flash.setAlpha(wa);
    for (const it of this.items) {
      const t = vf - it.at;
      const on = t >= 0 && t < it.dur;
      it.main.setVisible(on);
      it.shadow.setVisible(on);
      if (!on) continue;
      const baseScale = it.main.scale;
      const base = (it.main.getData('s') as number | undefined) ?? baseScale;
      it.main.setData('s', base);
      let s = base;
      let a = 1;
      let ox = 0;
      let oy = 0;
      if (it.anim === 'slam') {
        const p = clamp(t / 7, 0, 1);
        s = base * (1 + 1.6 * (1 - easeOut(p)));
        a = clamp(t / 3, 0, 1);
        if (t < 14) {
          const amp = (1 - t / 14) * 5;
          ox = Math.round(Math.sin(t * 5.1) * amp);
          oy = Math.round(Math.cos(t * 4.3) * amp);
        }
      } else if (it.anim === 'pop') {
        const p = clamp(t / 8, 0, 1);
        s = base * (0.6 + 0.4 * easeOut(p) + 0.12 * Math.sin(p * Math.PI));
        a = clamp(t / 3, 0, 1);
      } else {
        a = clamp(t / 10, 0, 1);
      }
      a *= clamp((it.dur - t) / 8, 0, 1);
      const sh = Math.max(1, Math.round(base / 3));
      it.main.setScale(s).setAlpha(a).setPosition(VIEW_W / 2 + ox, it.y + oy);
      it.shadow.setScale(s).setAlpha(a).setPosition(VIEW_W / 2 + ox + sh, it.y + oy + sh);
    }
  }
}
