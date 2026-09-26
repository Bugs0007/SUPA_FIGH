import type Phaser from 'phaser';
import { PixelCanvas } from './canvas';
import { P } from './palette';

// Weapon sprites as ASCII pixel maps (fill only; the outline is generated).
// grip = pixel the hand holds (weapon-local, before outline padding). Barrel points right (+x).
// Muzzle offsets in sim/data/weapons.ts are measured from this grip.

interface WeaponArt {
  rows: string[];
  grip: [number, number];
}

const PAL: Record<string, string> = {
  g: P.steel2,
  d: P.steel0,
  m: P.steel1,
  l: P.steel4,
  w: P.wood2,
  W: P.wood1,
  y: P.brass,
  r: P.red1,
  b: P.ink2,
  o: P.orange,
  k: P.concrete2,
};

export const WEAPON_ART: Record<string, WeaponArt> = {
  pistol: {
    grip: [1, 3],
    rows: [
      'gggggggggl', //
      'dddddddddd',
      'dd.d......',
      'dd........',
      'bb........',
    ],
  },
  shotgun: {
    grip: [5, 3],
    rows: [
      'wwww..ggggggggggggl', //
      'wwwwwmddddddddddddd',
      'ww...dd..WWWWW.....',
      '.....dd............',
    ],
  },
};

export interface WeaponFrame {
  key: string;
  frame: string;
  /** grip position in the frame (px, including outline padding) — use as sprite origin */
  gripX: number;
  gripY: number;
  w: number;
  h: number;
}

const frames = new Map<string, WeaponFrame>();

export function bakeWeapons(scene: Phaser.Scene): void {
  const ids = Object.keys(WEAPON_ART);
  const cellW = 32;
  const cellH = 16;
  const pc = new PixelCanvas(cellW * ids.length, cellH);
  const layout: { id: string; x: number; w: number; h: number }[] = [];
  ids.forEach((id, i) => {
    const art = WEAPON_ART[id];
    const w = art.rows[0].length + 2;
    const h = art.rows.length + 2;
    const x = i * cellW;
    pc.ascii(x + 1, 1, art.rows, PAL);
    pc.outline(x, 0, w, h);
    layout.push({ id, x, w, h });
  });
  const tex = scene.textures.addCanvas('weapons', pc.flush())!;
  for (const l of layout) {
    tex.add(l.id, 0, l.x, 0, l.w, l.h);
    const art = WEAPON_ART[l.id];
    frames.set(l.id, { key: 'weapons', frame: l.id, gripX: art.grip[0] + 1, gripY: art.grip[1] + 1, w: l.w, h: l.h });
  }
}

export function weaponFrame(id: string): WeaponFrame | undefined {
  return frames.get(id);
}
