import type Phaser from 'phaser';
import { avatarAim, FINAL_KURAMA_NECK, PERFECT_SUSANOO_PIVOT, PERFECT_SUSANOO_LAUNCH } from '../sim/data/heroes';
import { finalSpiritAtlas } from './finalSpiritAtlas';
import { type Baked, type Pt } from './pixelRaster';
import { easeOut, paintReveal, rising, Seen } from './spiritForm';

type Graphics = Phaser.GameObjects.Graphics;
type Spirit = keyof typeof finalSpiritAtlas;
const LIMIT = { k: 226, s: 187 } as const;
const EDGE = { k: 0xffeda1, s: 0xf3cfff } as const;
const clamp = (n: number) => Math.max(0, Math.min(1, n));

function unpack(encoded: string): Baked {
  const bytes = atob(encoded);
  const runs: Baked['runs'] = [];
  for (let p = 0; p < bytes.length; p += 8) {
    const xy = bytes.charCodeAt(p) | bytes.charCodeAt(p + 1) << 8;
    runs.push({
      x: (xy & 511) - 256,
      y: ((xy >> 9) | bytes.charCodeAt(p + 2) << 7) - 224,
      w: bytes.charCodeAt(p + 3),
      c: bytes.charCodeAt(p + 4) << 16 | bytes.charCodeAt(p + 5) << 8 | bytes.charCodeAt(p + 6),
      a: bytes.charCodeAt(p + 7) / 255,
    });
  }
  return { w: 0, h: 0, runs };
}

const atlas = {
  k: { body: unpack(finalSpiritAtlas.k.body), back: unpack(finalSpiritAtlas.k.back),
    head: unpack(finalSpiritAtlas.k.head), jaw: unpack(finalSpiritAtlas.k.jaw) },
  s: { body: unpack(finalSpiritAtlas.s.body), back: unpack(finalSpiritAtlas.s.back),
    bow: unpack(finalSpiritAtlas.s.bow) },
};

function rotation(px: number, py: number, angle: number): (x: number, y: number) => Pt {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return (x, y) => [px + (x - px) * c - (y - py) * s, py + (x - px) * s + (y - py) * c];
}

export interface FinalSpiritPose {
  kind: Spirit;
  x: number;
  y: number;
  facing: number;
  alpha: number;
  time: number;
  reveal: number;
  draw: number;
  aim: number;
  released?: boolean;
}

/** World-pixel layers from the approved artwork. The body stays planted as the weapon or jaw articulates. */
export function paintFinalSpirit(g: Graphics, pose: FinalSpiritPose): void {
  const { kind, x, y, facing, alpha, time, draw, released } = pose;
  const reveal = clamp(pose.reveal);
  if (alpha <= 0 || reveal <= 0) return;
  const isKurama = kind === 'k';
  const pivot = isKurama ? FINAL_KURAMA_NECK : PERFECT_SUSANOO_PIVOT;
  const aim = rotation(pivot.ahead, -pivot.up, avatarAim(pose.aim));
  const edge = EDGE[kind];
  const visible = reveal === 1 ? () => Seen.Full : rising(0, easeOut(reveal) * (LIMIT[kind] + 13), 10);
  const fade = alpha * clamp(reveal * 4);
  const spread = easeOut((reveal - .37) / .59);

  const paint = (image: Baked, opacity: number, transform?: (u: number, v: number) => Pt, sx = 1) => {
    if (opacity <= 0) return;
    if (!transform) {
      paintReveal(g, image, x, y, facing < 0, opacity, visible, edge);
      return;
    }
    let lastColor = -1;
    let lastAlpha = -1;
    for (const run of image.runs) {
      const [u, v] = transform(run.x, run.y);
      const mode = visible(Math.round(u), Math.round(v));
      if (!mode) continue;
      const w = Math.max(1, Math.round(run.w * sx));
      const c = mode === Seen.Edge ? edge : run.c;
      const a = clamp(opacity * (run.a ?? 1) * (mode === Seen.Ghost ? .35 : 1) + (mode === Seen.Edge ? .2 : 0));
      if (lastColor !== c || lastAlpha !== a) {
        g.fillStyle(c, a);
        lastColor = c;
        lastAlpha = a;
      }
      g.fillRect(Math.round(x + facing * u) - (facing < 0 ? w - 1 : 0), Math.round(y + v), w, 1);
    }
  };

  const rootX = isKurama ? -66 : -39;
  const rootY = isKurama ? -65 : -134;
  const sx = .46 + .54 * spread;
  paint(atlas[kind].back, alpha * spread, (u, v) => [
    rootX + (u - rootX) * sx,
    rootY + (v - rootY) * (.34 + .66 * spread) +
      Math.sin(time * 7 + (u - rootX) * .045) * (isKurama ? 2 : 1.25) * spread,
  ], sx);
  paint(atlas[kind].body, fade);

  if (isKurama) {
    const jaw = rotation(70, -40, draw * .32 - .14);
    if (reveal >= .88) {
      // The mouth interior bridges the upper muzzle and the single moving lower jaw.
      const lip = jaw(110, -22);
      const mouth: Pt[] = [[71, -40], [88, -42], [124, -35], lip, [83, -25]];
      g.fillStyle(0x291321, fade * .88);
      g.beginPath();
      for (let i = 0; i < mouth.length; i++) {
        const [u, v] = aim(...mouth[i]);
        if (i === 0) g.moveTo(x + facing * u, y + v);
        else g.lineTo(x + facing * u, y + v);
      }
      g.closePath();
      g.fillPath();
    }
    paint(atlas.k.head, fade, aim);
    paint(atlas.k.jaw, fade, (u, v) => aim(...jaw(u, v)));
    return;
  }

  if (reveal <= .82) return;
  const line = (a: Pt, b: Pt, color: number, width: number) => {
    const [u, v] = aim(...a);
    const [m, n] = aim(...b);
    g.lineStyle(width, color, fade).lineBetween(x + facing * u, y + v, x + facing * m, y + n);
  };
  // The arm starts at the shoulder. The stationary chest remains underneath throughout the draw.
  const [u, v] = aim(22, -108);
  g.lineStyle(9, 0x542587, fade).lineBetween(x + facing * 7, y - 109, x + facing * u, y + v);
  paint(atlas.s.bow, fade, aim);
  const { ahead, up } = PERFECT_SUSANOO_LAUNCH;
  const hand: Pt = [57 - 41 * draw, -up];
  line([62, -174], hand, edge, 1);
  line(hand, [65, -36], edge, 1);
  if (!released) {
    line([hand[0] - 7, hand[1]], hand, 0x9452cf, 5);
    const [hx, hy] = aim(...hand);
    g.fillStyle(edge, fade).fillRect(Math.round(x + facing * hx) - 2, Math.round(y + hy) - 2, 4, 4);
    if (draw > .12) line(hand, [ahead, -up], 0xfbe8ff, 2);
  }
}
