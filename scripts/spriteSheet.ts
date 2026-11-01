// Art tool: render the baked Susanoo / Kurama / arm sprites to a PNG, scaled up, so they can be looked at big.
// usage: npx vite-node scripts/spriteSheet.ts <out.png> <susanoo|kurama|arms|fireball> [scale = 4]
// Translucent runs are blended over the background, which has a few pale stripes (a stand-in for scenery) so it is
// easy to see what shows through a spirit; a fighter-sized box stands on the feet for scale, as in game (in front).
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { armSprite, KURAMA, kuramaSprite, SUSANOO, susanooSprite, type ArmKind } from '../src/art/avatarSprites';
import { arrowSprite, fireballSprite } from '../src/art/fireSprites';
import type { Baked } from '../src/art/pixelRaster';

const [out, sheet = 'susanoo', scale = '4'] = process.argv.slice(2);
const SCALE = Math.max(1, Math.round(Number(scale)));
const BG = 0x171e30;
const STRIPE = 0x3c4a6a;

interface Item {
  baked: Baked;
  ox: number;
  oy: number;
}
const items: Item[] = [];
const fronts: Item[] = [];
let cursorX = 4;
/** a fighter-sized stand-in (10 x 22, feet at (fx, fy)), drawn over the sprites as the fighter is in game */
const fighterBox = (fx: number, fy: number): Item => {
  const runs = [];
  for (let y = 0; y < 22; y++) runs.push({ x: 0, y, w: 10, c: y < 7 ? 0xd09060 : y < 15 ? 0x3a3a52 : 0x646b87 });
  return { baked: { w: 10, h: 22, runs }, ox: fx - 5, oy: fy - 22 };
};
if (sheet === 'susanoo') {
  // each form: drawing (stages 0, 1, 2, 3), the shot, at rest; with a fighter-sized box on the feet for scale
  for (const level of [3, 4] as const) {
    for (const [stage, frame] of [[0, 0], [1, 1], [2, 2], [3, 3], [4, 0], [5, 1]]) {
      const b = susanooSprite(level, stage, frame);
      items.push({ baked: b, ox: cursorX, oy: 4 + (level - 3) * (SUSANOO.h + 4) });
      fronts.push(fighterBox(cursorX + SUSANOO.ax, 4 + (level - 3) * (SUSANOO.h + 4) + SUSANOO.ay));
      cursorX += b.w + 4;
    }
    cursorX = 4;
  }
} else if (sheet === 'fireball') {
  // the fireball at the three sizes the sim uses (radius 9 + 2.4 per form), four flicker frames, flying right and
  // aimed down; then the tiny ball at the mouth while casting, and Susanoo's arrow in flight
  let row = 4;
  for (const level of [0, 1, 2]) {
    cursorX = 4;
    const r = 9 + 2.4 * level;
    let rowH = 0;
    for (const [dir, frame] of [[0, 0], [0, 1], [0, 2], [0, 3], [3, 0], [16, 1]]) {
      const f = fireballSprite(r, dir, frame);
      items.push({ baked: f.baked, ox: cursorX, oy: row });
      cursorX += f.baked.w + 2;
      rowH = Math.max(rowH, f.baked.h);
    }
    fronts.push(fighterBox(cursorX + 8, row + rowH - 8));
    row += rowH + 2;
  }
  cursorX = 4;
  for (const r of [1.5, 2.5, 3.5]) {
    const f = fireballSprite(r, 0, 1);
    items.push({ baked: f.baked, ox: cursorX, oy: row });
    cursorX += f.baked.w + 4;
  }
  for (const [size, dir] of [[6, 0], [8, 0], [8, 2]]) {
    const a = arrowSprite(size, dir, 0);
    items.push({ baked: a.baked, ox: cursorX, oy: row });
    cursorX += a.baked.w + 4;
  }
} else if (sheet === 'kurama') {
  // the stance (four frames) and the Bijudama roar (two frames)
  let row = 0;
  for (const set of [[[0, false], [1, false], [2, false]], [[3, false], [0, true], [2, true]]] as [number, boolean][][]) {
    cursorX = 4;
    for (const [frame, roar] of set) {
      items.push({ baked: kuramaSprite(frame, roar), ox: cursorX, oy: 4 + row * (KURAMA.h + 4) });
      fronts.push(fighterBox(cursorX + KURAMA.ax, 4 + row * (KURAMA.h + 4) + KURAMA.ay));
      cursorX += KURAMA.w + 4;
    }
    row++;
  }
} else {
  // arms: the three punch steps at growing extension, three kinds, jab and uppercut
  let row = 0;
  for (const kind of ['kurama', 'susanooBone', 'susanoo', 'claw'] as ArmKind[]) {
    cursorX = 4;
    for (const [ext, step] of [[0.2, 0], [0.5, 1], [1, 2]] as [number, 0 | 1 | 2][]) {
      for (const up of [false, true]) {
        const reach = 36;
        const sx = 20;
        const sy = 24;
        const hx = sx + reach * ext;
        const hy = up ? 16 : 20;
        const mid = [(sx + hx) / 2, (sy + hy) / 2 + (up ? -9 : -5)] as [number, number];
        const a = armSprite({ kind, s: [sx, sy], e: [Math.round(mid[0]), Math.round(mid[1])], h: [Math.round(hx), hy], d: 1, thick: kind === 'claw' ? 5 : 7, step, frame: step });
        items.push({ baked: a.baked, ox: cursorX + a.ox, oy: 4 + row * 60 + a.oy });
        cursorX += 64;
      }
    }
    row++;
  }
}
const all = [...items, ...fronts];
const W = Math.max(...all.map((i) => i.ox + i.baked.w)) + 4;
const H = Math.max(...all.map((i) => i.oy + i.baked.h)) + 4;
const px = new Float32Array(W * H * 3);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    // pale diagonal stripes every 12 px (scenery behind the spirits)
    const c = (x + y) % 12 < 2 ? STRIPE : BG;
    const o = (y * W + x) * 3;
    px[o] = (c >> 16) & 255;
    px[o + 1] = (c >> 8) & 255;
    px[o + 2] = c & 255;
  }
}
for (const it of all) {
  for (const r of it.baked.runs) {
    const a = r.a ?? 1;
    for (let k = 0; k < r.w; k++) {
      const x = it.ox + r.x + k;
      const y = it.oy + r.y;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const o = (y * W + x) * 3;
      px[o] += (((r.c >> 16) & 255) - px[o]) * a;
      px[o + 1] += (((r.c >> 8) & 255) - px[o + 1]) * a;
      px[o + 2] += ((r.c & 255) - px[o + 2]) * a;
    }
  }
}
// scale up and encode a PNG
const SW = W * SCALE;
const SH = H * SCALE;
const raw = Buffer.alloc((SW * 3 + 1) * SH);
for (let y = 0; y < SH; y++) {
  raw[y * (SW * 3 + 1)] = 0;
  for (let x = 0; x < SW; x++) {
    const o = ((Math.floor(y / SCALE) * W) + Math.floor(x / SCALE)) * 3;
    const d = y * (SW * 3 + 1) + 1 + x * 3;
    raw[d] = Math.round(px[o]);
    raw[d + 1] = Math.round(px[o + 1]);
    raw[d + 2] = Math.round(px[o + 2]);
  }
}
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SW, 0);
ihdr.writeUInt32BE(SH, 4);
ihdr[8] = 8;
ihdr[9] = 2;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('wrote', out, W, 'x', H, 'sprites', all.length);
