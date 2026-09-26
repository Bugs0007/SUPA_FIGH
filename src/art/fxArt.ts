import type Phaser from 'phaser';
import { PixelCanvas } from './canvas';
import { P } from './palette';

// Small FX sprites packed into one 'fx' atlas so all particles batch into a single draw call.

type Painter = (pc: PixelCanvas, x: number, y: number) => void;

interface FxDef {
  name: string;
  w: number;
  h: number;
  paint: Painter;
}

const puff = (r: number): Painter => (pc, x, y) => {
  const c = r + 0.5;
  for (let j = 0; j < r * 2 + 1; j++)
    for (let i = 0; i < r * 2 + 1; i++) {
      const d = Math.hypot(i - r, j - r);
      if (d <= c) pc.set(x + i, y + j, P.white, d > r - 0.8 ? 150 : 255);
    }
};

const DEFS: FxDef[] = [
  { name: 'p1', w: 1, h: 1, paint: (pc, x, y) => pc.set(x, y, P.white) },
  { name: 'p2', w: 2, h: 2, paint: (pc, x, y) => pc.rect(x, y, 2, 2, P.white) },
  { name: 'p3', w: 3, h: 3, paint: (pc, x, y) => pc.rect(x, y, 3, 3, P.white) },
  { name: 'puff2', w: 5, h: 5, paint: puff(2) },
  { name: 'puff3', w: 7, h: 7, paint: puff(3) },
  { name: 'puff4', w: 9, h: 9, paint: puff(4) },
  { name: 'puff6', w: 13, h: 13, paint: puff(6) },
  {
    name: 'flash0',
    w: 11,
    h: 9,
    paint: (pc, x, y) => {
      pc.ascii(x, y, ['...o.......', '..oyo..o...', '.oyWyooyo..', 'oyWWWWWWyyo', 'yWWWWWWWWWy', 'oyWWWWWWyyo', '.oyWyooyo..', '..oyo..o...', '...o.......'], {
        o: P.orange,
        y: P.yellow,
        W: P.yellow2,
      });
    },
  },
  {
    name: 'flash1',
    w: 7,
    h: 5,
    paint: (pc, x, y) => {
      pc.ascii(x, y, ['.oyo...', 'oyWWyo.', 'yWWWWWy', 'oyWWyo.', '.oyo...'], { o: P.orange, y: P.yellow, W: P.yellow2 });
    },
  },
  {
    name: 'casing',
    w: 3,
    h: 1,
    paint: (pc, x, y) => {
      pc.set(x, y, P.brass);
      pc.set(x + 1, y, P.brass);
      pc.set(x + 2, y, P.yellow);
    },
  },
  {
    name: 'shell',
    w: 3,
    h: 2,
    paint: (pc, x, y) => {
      pc.rect(x, y, 2, 2, P.red1);
      pc.rect(x + 2, y, 1, 2, P.brass);
    },
  },
  {
    name: 'star',
    w: 7,
    h: 7,
    paint: (pc, x, y) => {
      pc.ascii(x, y, ['...W...', '...W...', '..WWW..', 'WWWWWWW', '..WWW..', '...W...', '...W...'], { W: P.white });
    },
  },
  {
    name: 'shard',
    w: 3,
    h: 2,
    paint: (pc, x, y) => {
      pc.set(x, y, P.glass2);
      pc.set(x + 1, y, P.glass1);
      pc.set(x + 1, y + 1, P.glass1);
      pc.set(x + 2, y + 1, P.glass0);
    },
  },
  {
    name: 'chip',
    w: 2,
    h: 1,
    paint: (pc, x, y) => {
      pc.set(x, y, P.wood2);
      pc.set(x + 1, y, P.wood3);
    },
  },
  {
    name: 'arrow',
    w: 7,
    h: 7,
    paint: (pc, x, y) => {
      pc.ascii(x, y, ['...k...', '..kWk..', '.kWWWk.', 'kWWWWWk', 'kkkWkkk', '..kWk..', '..kkk..'], { k: P.ink, W: P.white });
    },
  },
];

const SPLATS = [
  ['.rr.', 'rrrr', '.rr.'],
  ['r..r.', '.rrr.', 'rrrrr', '.rr..'],
  ['..r..', '.rrr.', 'rrrrr', '.rrr.', '..r.r'],
  ['rr', 'rr'],
];

export function bakeFx(scene: Phaser.Scene): void {
  const pad = 1;
  let x = 0;
  const layout: { name: string; x: number; w: number; h: number }[] = [];
  for (const d of DEFS) {
    layout.push({ name: d.name, x, w: d.w, h: d.h });
    x += d.w + pad;
  }
  SPLATS.forEach((rows, i) => {
    layout.push({ name: 'splat' + i, x, w: rows[0].length, h: rows.length });
    x += rows[0].length + pad;
  });
  const pc = new PixelCanvas(x, 16);
  DEFS.forEach((d, i) => d.paint(pc, layout[i].x, 0));
  SPLATS.forEach((rows, i) => {
    const l = layout[DEFS.length + i];
    pc.ascii(l.x, 0, rows, { r: P.blood });
  });
  const tex = scene.textures.addCanvas('fx', pc.flush())!;
  for (const l of layout) tex.add(l.name, 0, l.x, 0, l.w, l.h);
}
