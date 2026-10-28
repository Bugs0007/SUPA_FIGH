// Small UI kit shared by the menu scenes: input glyphs (keyboard keycaps, PlayStation / Xbox buttons, touch
// buttons), a hint bar that shows the controls of whatever device the player is using, panels and rows.

import type Phaser from 'phaser';
import { textWidth } from '../art/font';
import { inputDevice, PAD_NAMES, type Device, type PadStyle } from '../input/devices';
import { VIEW_H, VIEW_W } from '../game/display';

// ------------------------------------------------------------------ pixel glyphs

const SHAPES: Record<'cross' | 'circle' | 'square' | 'triangle', string[]> = {
  cross: ['#.....#', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '#.....#'],
  circle: ['..###..', '.#...#.', '#.....#', '#.....#', '#.....#', '.#...#.', '..###..'],
  square: ['#######', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#######'],
  triangle: ['...#...', '..#.#..', '..#.#..', '.#...#.', '.#...#.', '#.....#', '#######'],
};

/** PlayStation symbol colours (the colours Sony prints on the buttons). */
const PS_COLOR = { cross: 0x7aa8ff, circle: 0xff6a6a, square: 0xff9ad8, triangle: 0x5ae0b0 };
/** Xbox face button colours. */
const XBOX_COLOR = [0x5ac85a, 0xea4a4a, 0x4a8af0, 0xf8c840];
const PS_SHAPE = ['cross', 'circle', 'square', 'triangle'] as const;

export type GlyphStyle = PadStyle;

export const GLYPH_H = 11;

export interface Placed {
  w: number;
}

/** Painter that draws into one Graphics and borrows BitmapTexts from a pool (so it can be redrawn each change). */
export class GlyphPainter {
  private used = 0;
  private pool: Phaser.GameObjects.BitmapText[] = [];

  constructor(
    private scene: Phaser.Scene,
    readonly g: Phaser.GameObjects.Graphics,
    private depth: number,
  ) {}

  hideAll(): void {
    this.g.setVisible(false);
    for (const t of this.pool) t.setVisible(false);
  }

  /** call before a redraw */
  begin(): void {
    this.g.clear().setVisible(true);
    this.used = 0;
    for (const t of this.pool) t.setVisible(false);
  }

  private text(s: string, x: number, y: number, tint: number, font: 'sm' | 'smo' = 'sm'): Phaser.GameObjects.BitmapText {
    let t = this.pool[this.used];
    if (!t) {
      t = this.scene.add.bitmapText(0, 0, font, '').setDepth(this.depth);
      this.pool.push(t);
    }
    this.used++;
    return t.setFont(font).setText(s).setPosition(Math.round(x), Math.round(y)).setTint(tint).setVisible(true);
  }

  /** plain label; returns its width */
  label(s: string, x: number, y: number, tint = 0xc3c9dc): number {
    this.text(s, x, y, tint);
    return textWidth(s, 'sm');
  }

  /** a keyboard key (or a touch / pad pill): rounded cap with text. `@up` `@down` `@left` `@right` draw arrows. */
  keycap(s: string, x: number, y: number, color = 0x8d95b0): number {
    const arrow = s.startsWith('@');
    const w = arrow ? 11 : Math.max(9, textWidth(s, 'sm') + 5);
    const g = this.g;
    g.fillStyle(0x0a0c14, 1).fillRect(x, y + 1, w, 9);
    g.fillStyle(0x2a3048, 1).fillRect(x + 1, y, w - 2, 9);
    g.fillStyle(0x3d4666, 1).fillRect(x + 1, y, w - 2, 1);
    g.lineStyle(1, color, 0.9).strokeRect(x + 0.5, y + 0.5, w - 1, 8);
    if (arrow) this.arrow(s.slice(1) as 'up' | 'down' | 'left' | 'right', x + w / 2, y + 4.5, 0xffffff);
    else this.text(s, x + 3, y + 2, 0xffffff);
    return w;
  }

  private arrow(dir: 'up' | 'down' | 'left' | 'right', cx: number, cy: number, c: number): void {
    const g = this.g;
    g.fillStyle(c, 1);
    const x = Math.round(cx);
    const y = Math.round(cy);
    if (dir === 'up') g.fillTriangle(x, y - 3, x - 3, y + 2, x + 3, y + 2);
    else if (dir === 'down') g.fillTriangle(x, y + 3, x - 3, y - 2, x + 3, y - 2);
    else if (dir === 'left') g.fillTriangle(x - 3, y, x + 2, y - 3, x + 2, y + 3);
    else g.fillTriangle(x + 3, y, x - 2, y - 3, x - 2, y + 3);
  }

  /** a gamepad face button 0..3 (A/B/X/Y or cross/circle/square/triangle) */
  face(button: number, style: GlyphStyle, x: number, y: number): number {
    const g = this.g;
    const cx = x + 5.5;
    const cy = y + 5.5;
    g.fillStyle(0x0a0c14, 1).fillCircle(cx, cy + 0.5, 5.5);
    if (style === 'ps') {
      const shape = PS_SHAPE[button];
      g.fillStyle(0x1c2236, 1).fillCircle(cx, cy, 5.5);
      g.fillStyle(PS_COLOR[shape], 1);
      SHAPES[shape].forEach((row, r) => {
        for (let c = 0; c < row.length; c++) if (row[c] === '#') g.fillRect(x + 2 + c - 0, y + 2 + r - 0, 1, 1);
      });
      // (the 7x7 symbol sits in the 11x11 badge: shrink slightly by clipping nothing, it fits)
    } else {
      g.fillStyle(XBOX_COLOR[button] ?? 0x8d95b0, 1).fillCircle(cx, cy, 5.5);
      g.fillStyle(0xffffff, 0.25).fillRect(x + 3, y + 1, 5, 1);
      this.text(PAD_NAMES.xbox[button] ?? '?', x + 4, y + 3, 0xffffff, 'smo');
    }
    return GLYPH_H;
  }

  /** shoulder / trigger / system buttons as a pill: "L1", "RB", "START"... */
  pill(button: number, style: GlyphStyle, x: number, y: number): number {
    return this.keycap(PAD_NAMES[style][button] ?? 'B' + button, x, y, 0xb090e0);
  }

  /** d-pad icon, the arms in `dirs` highlighted (u d l r) */
  dpad(x: number, y: number, dirs = 'udlr'): number {
    const g = this.g;
    const on = (c: string) => (dirs.includes(c) ? 0xffffff : 0x5a6280);
    g.fillStyle(0x0a0c14, 1).fillRect(x + 3, y + 1, 5, 11).fillRect(x, y + 4, 11, 5);
    g.fillStyle(on('u'), 1).fillRect(x + 4, y, 3, 4);
    g.fillStyle(on('d'), 1).fillRect(x + 4, y + 7, 3, 4);
    g.fillStyle(on('l'), 1).fillRect(x, y + 4, 4, 3);
    g.fillStyle(on('r'), 1).fillRect(x + 7, y + 4, 4, 3);
    g.fillStyle(0x3d4666, 1).fillRect(x + 4, y + 4, 3, 3);
    return 11;
  }

  /** the glyph of one standard-mapping pad button */
  padButton(button: number, style: GlyphStyle, x: number, y: number): number {
    if (button <= 3) return this.face(button, style, x, y);
    if (button >= 12 && button <= 15) return this.dpad(x, y, 'udlr'[button - 12]);
    return this.pill(button, style, x, y);
  }
}

// ------------------------------------------------------------------ hint bar

/** One hint: what a button does, per device. */
export interface Hint {
  label: string;
  /** keyboard keycaps ('ENTER', 'ESC', '@up'...) */
  kb: string[];
  /** pad buttons (standard numbering) */
  pad: number[];
  /** touch pills */
  touch: string[];
  /** show the d-pad icon instead of a button glyph on pads */
  padMove?: 'ud' | 'lr' | 'udlr';
}

export const hint = {
  move: (label = 'MOVE', axis: 'ud' | 'lr' | 'udlr' = 'udlr'): Hint => ({
    label,
    kb: axis === 'ud' ? ['@up', '@down'] : axis === 'lr' ? ['@left', '@right'] : ['@up', '@down', '@left', '@right'],
    pad: [],
    touch: [],
    padMove: axis,
  }),
  ok: (label = 'SELECT'): Hint => ({ label, kb: ['ENTER'], pad: [0], touch: ['OK'] }),
  back: (label = 'BACK'): Hint => ({ label, kb: ['ESC'], pad: [1], touch: ['BACK'] }),
  key: (label: string, kb: string[], pad: number[] = [], touch: string[] = []): Hint => ({ label, kb, pad, touch }),
};

/** Bottom strip: "[arrows] MOVE  [ENTER] SELECT  [ESC] BACK" for the keyboard, glyphs for pads, pills for touch. */
export class HintBar {
  private painter: GlyphPainter;
  private sig = '';
  private strip: Phaser.GameObjects.Graphics;
  private items: Hint[] = [];

  constructor(scene: Phaser.Scene, private y = VIEW_H - 15, depth = 30) {
    this.strip = scene.add.graphics().setDepth(depth - 1);
    this.painter = new GlyphPainter(scene, scene.add.graphics().setDepth(depth), depth);
  }

  set(items: Hint[]): void {
    this.items = items;
    this.sig = '';
  }

  /** redraw when the device (or its pad style) changed */
  update(): void {
    const dev = inputDevice.current;
    const showPad = dev === 'keyboard' && inputDevice.padConnected;
    const sig = `${dev}|${inputDevice.pad}|${showPad}|${this.items.map((i) => i.label).join(',')}`;
    if (sig === this.sig) return;
    this.sig = sig;
    const groups: Device[] = showPad ? ['keyboard', inputDevice.pad] : [dev];
    const p = this.painter;
    p.begin();
    const widths = groups.map((d) => this.measure(d));
    const gap = 12;
    const total = widths.reduce((a, b) => a + b, 0) + (groups.length - 1) * gap * 2;
    let x = Math.round((VIEW_W - total) / 2);
    this.strip.clear().fillStyle(0x080a12, 0.82).fillRect(0, this.y - 3, VIEW_W, 18);
    this.strip.fillStyle(0x3a3054, 1).fillRect(0, this.y - 3, VIEW_W, 1);
    groups.forEach((d, gi) => {
      if (gi > 0) {
        p.g.fillStyle(0x3a3054, 1).fillRect(x - gap, this.y, 1, 9);
        x += gap;
      }
      for (const it of this.items) x = this.drawItem(p, it, d, x) + 9;
      x -= 9;
    });
  }

  private specs(it: Hint, d: Device): string[] | number[] {
    return d === 'keyboard' ? it.kb : d === 'touch' ? it.touch : it.pad;
  }

  private measure(d: Device): number {
    let w = 0;
    for (const it of this.items) {
      const specs = this.specs(it, d);
      if (d !== 'keyboard' && d !== 'touch' && it.padMove) w += 11 + 3;
      else for (const s of specs) w += (typeof s === 'string' ? (s.startsWith('@') ? 11 : Math.max(9, textWidth(s, 'sm') + 5)) : s <= 3 ? 11 : Math.max(9, textWidth(PAD_NAMES.ps[s] ?? 'B', 'sm') + 5)) + 2;
      w += textWidth(it.label, 'sm') + 3 + 9;
    }
    return w - 9;
  }

  private drawItem(p: GlyphPainter, it: Hint, d: Device, x0: number): number {
    let x = x0;
    const y = this.y;
    if (d === 'keyboard' || d === 'touch') {
      for (const s of this.specs(it, d) as string[]) x += p.keycap(s, x, y) + 2;
    } else if (it.padMove) {
      x += p.dpad(x, y - 1, it.padMove === 'ud' ? 'ud' : it.padMove === 'lr' ? 'lr' : 'udlr') + 3;
    } else {
      for (const b of it.pad) x += p.padButton(b, d, x, y - 1) + 2;
    }
    x += 1;
    x += p.label(it.label, x, y + 2) + 2;
    return x;
  }

  /** show / hide the bar (hidden bars cost nothing: don't call update() while hidden) */
  setVisible(v: boolean): void {
    this.strip.setVisible(v);
    if (v) this.sig = '';
    else this.painter.hideAll();
  }

  destroy(): void {
    this.strip.destroy();
    this.painter.g.destroy();
  }
}

// ------------------------------------------------------------------ panels & rows

/** Dark panel with a coloured title strip (the look of the title screen cards). */
export function panel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number, active = true): void {
  g.fillStyle(0x000000, 0.4).fillRect(x + 3, y + 5, w, h);
  g.fillStyle(0x101523, 0.95).fillRect(x, y, w, h);
  g.fillStyle(0x222c43, 0.6).fillRect(x + 2, y + 13, w - 4, 20);
  g.lineStyle(1, color, active ? 1 : 0.4).strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  g.fillStyle(0x000000, 0.4).fillRect(x + 2, y + h - 3, w - 4, 2);
  g.fillStyle(color, active ? 1 : 0.8).fillRect(x, y, w, 12);
  g.fillStyle(0xffffff, 0.23).fillRect(x + 1, y + 1, w - 2, 1);
}

/** Highlight bar behind the focused row, with a blinking arrow. */
export function rowBar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, blink: boolean): void {
  g.fillStyle(0x3a3054, 1).fillRect(x, y, w, h);
  g.fillStyle(0xf8c840, 0.9).fillRect(x, y, 2, h);
  g.fillStyle(blink ? 0xffffff : 0xf8c840, 1).fillTriangle(x + 4, y + h / 2 - 3, x + 4, y + h / 2 + 3, x + 7, y + h / 2);
}

/** A 0..1 meter: filled blocks. */
export function meter(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, v: number, color: number): void {
  g.fillStyle(0x0a0c14, 1).fillRect(x, y, w, 7);
  g.fillStyle(0x2a3048, 1).fillRect(x + 1, y + 1, w - 2, 5);
  const fill = Math.round((w - 2) * Math.max(0, Math.min(1, v)));
  g.fillStyle(color, 1).fillRect(x + 1, y + 1, fill, 5);
  g.fillStyle(0xffffff, 0.3).fillRect(x + 1, y + 1, fill, 1);
}

/** An ON/OFF switch. */
export function toggle(g: Phaser.GameObjects.Graphics, x: number, y: number, on: boolean): void {
  g.fillStyle(0x0a0c14, 1).fillRect(x, y, 22, 9);
  g.fillStyle(on ? 0x2f7a3a : 0x3a3448, 1).fillRect(x + 1, y + 1, 20, 7);
  g.fillStyle(on ? 0x8af08a : 0x8d95b0, 1).fillRect(on ? x + 12 : x + 2, y + 2, 8, 5);
}
