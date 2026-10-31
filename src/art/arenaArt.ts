import type Phaser from 'phaser';
import { PixelCanvas, hash2 } from './canvas';
import { shade } from './palette';
import { parseMap, type MapDef } from '../sim/map/mapData';
export const ARENA_COLORS: Record<string, [
  string,
  string,
  string
]> = {
  arena: ['#79a9ca', '#df9e54', '#222e47'], rooftops: ['#64cdd9', '#e88ac5', '#262445'], train: ['#e1b86e', '#88cde1', '#252c45'],
  factory: ['#e89950', '#7fb8a3', '#35252d'], construction: ['#efc96b', '#89bfd1', '#394c60'], casino: ['#edba65', '#e378a7', '#3e1e3b'],
  docks: ['#e1ad81', '#85ccd2', '#253b51'], office: ['#b8dce8', '#85babd', '#32495e'], lab: ['#7ce4bc', '#e6bc6b', '#193b42'],
  mine: ['#a286df', '#70c8cc', '#302738'], leaf: ['#94bd68', '#d3b079', '#2d463b'], ship: ['#d8ad6c', '#a1d5d8', '#3d3c4b'], alien: ['#9c8ae0', '#73dbc9', '#3d2b59'],
  valley: ['#82d8ce', '#e1cf9c', '#2a514d'], citadel: ['#e9d2a0', '#9dbbd1', '#40566b'], neon: ['#61d7ee', '#ec7cb9', '#282a52'],
};
/** World-sized architectural detail, shared by live arenas and the menu's full-map renders. */
export function bakeArenaScenery(scene: Phaser.Scene, def: MapDef): string {
  const key = 'arena-scenery-' + def.id;
  if (scene.textures.exists(key))
    return key;
  const map = parseMap(def), w = map.w * 16, h = map.h * 16;
  const pc = new PixelCanvas(w, h), [accent, warm, dark] = ARENA_COLORS[def.theme] ?? ARENA_COLORS.arena;
  const natural = ['leaf', 'valley', 'citadel', 'alien', 'mine'].includes(def.theme);
  // Architectural bays, cables and masonry make empty wall rooms feel inhabited.
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      if (!map.back[y * map.w + x])
        continue;
      if (x % 8 === 0)
        pc.rect(x * 16, y * 16, 3, 16, dark);
      if (y % 6 === 0)
        pc.rect(x * 16, y * 16, 16, 2, shade(dark, .2));
      if (x % 8 === 3 && y % 6 === 2) {
        pc.rect(x * 16, y * 16, 24, 12, dark);
        pc.rect(x * 16 + 3, y * 16 + 3, 18, 2, accent);
        pc.rect(x * 16 + 3, y * 16 + 7, 11, 1, warm);
        pc.bloom(x * 16 + 12, y * 16 + 4, 38, 28, accent, .13);
      }
    }
  // Surface-mounted supports and inset illumination follow real platforms; no fake collision surfaces.
  for (let y = 3; y < map.h - 1; y++)
    for (let x = 1; x < map.w - 1; x++) {
      const c = def.rows[y][x];
      if (!'-=MBXD#'.includes(c) || !'.SwPbctg'.includes(def.rows[y - 1]?.[x] ?? ''))
        continue;
      const px = x * 16, py = y * 16;
      if (x % 5 === 0) {
        pc.line(px + 2, py + 4, px + 10, py + 15, dark, 2);
        pc.rect(px + 1, py + 4, 11, 2, shade(dark, .25));
      }
      if (x % 7 === 2) {
        pc.rect(px + 4, py - 2, 4, 2, accent);
        pc.bloom(px + 6, py, 28, 16, accent, .2);
      }
      if (natural && x % 3 === 0) {
        pc.line(px + 4, py + 2, px + 6, py + 14, dark);
        pc.rect(px + 4, py + 9, 3, 4, accent);
      }
    }
  const horizon = h - 64;
  if (['leaf', 'valley'].includes(def.theme)) {
    for (const x of [w * .15, w * .82]) {
      pc.rect(x - 7, 80, 14, h - 150, dark);
      for (let i = 0; i < 7; i++) {
        const xx = x + (i - 3) * 18, yy = 65 + Math.abs(i - 3) * 13;
        pc.circle(xx, yy, 34, shade(dark, .1));
        pc.circle(xx - 5, yy - 7, 27, shade(accent, -.25));
        pc.circle(xx - 10, yy - 13, 17, shade(accent, -.05));
      }
    }
  }
  if (def.theme === 'valley') {
    const x = w * .5;
    pc.rect(x - 35, 0, 70, horizon, '#407f89');
    pc.rect(x - 22, 0, 44, horizon, '#78bdc1');
    for (let i = 0; i < 14; i++) {
      const xx = x - 31 + i * 5;
      pc.rect(xx, hash2(i, 1) * 60, 2, horizon, '#b5e6dc');
    }
    pc.bloom(x, horizon, 170, 65, '#c6efe1', .4);
    for (const side of [-1, 1]) {
      const sx = x + side * 155;
      pc.rect(sx - 22, horizon - 115, 44, 110, '#3f5d5c');
      pc.circle(sx, horizon - 137, 23, '#486765');
      pc.rect(sx - 30, horizon - 115, 60, 17, '#577c70');
      pc.rect(sx - 14, horizon - 141, 27, 8, '#213c40');
      pc.rect(sx - 25, horizon - 20, 50, 14, '#2d494a');
    }
  }
  else if (def.theme === 'citadel') {
    for (let i = 0; i < 5; i++) {
      const x = 60 + i * (w - 120) / 4, y = 80 + (i % 2) * 90;
      pc.rect(x - 22, y, 44, 9, '#c4b99a');
      pc.rect(x - 16, y + 9, 32, 33, '#5b7380');
      pc.line(x - 14, y + 39, x + 4, y + 58, '#465e70', 9);
      pc.rect(x - 22, y - 3, 44, 3, '#9bb387');
      pc.rect(x - 8, y - 38, 6, 38, '#c6c2ae');
      pc.rect(x + 9, y - 38, 6, 38, '#c6c2ae');
      pc.rect(x - 12, y - 42, 32, 5, '#e8d7ad');
    }
  }
  else if (def.theme === 'neon' || def.theme === 'rooftops') {
    for (let i = 0; i < 7; i++) {
      const x = 20 + i * (w - 40) / 7, y = 80 + (i % 3) * 75;
      pc.rect(x, y, 56, h - y - 70, dark);
      pc.rect(x - 3, y - 5, 62, 5, shade(dark, .3));
      for (let yy = y + 15; yy < h - 80; yy += 22)
        for (let xx = x + 8; xx < x + 50; xx += 15)
          pc.rect(xx, yy, 7, 9, hash2(xx, yy) > .4 ? shade(accent, -.3) : shade(warm, -.45));
      pc.rect(x + 4, y + 24, 45, 16, dark);
      pc.rect(x + 7, y + 27, 37, 3, i % 2 ? accent : warm);
      pc.bloom(x + 28, y + 30, 65, 35, i % 2 ? accent : warm, .16);
    }
  }
  else if (['factory', 'lab', 'train', 'office', 'arena'].includes(def.theme)) {
    for (let i = 0; i < 5; i++) {
      const x = 42 + i * (w - 84) / 5;
      pc.rect(x, 22, 5, h - 70, dark);
      pc.rect(x + 2, 22, 1, h - 70, shade(accent, -.35));
      pc.rect(x - 18, 25, 42, 12, dark);
      pc.rect(x - 14, 28, 34, 3, accent);
      pc.bloom(x + 3, 30, 100, 55, accent, .2);
    }
  }
  else if (['ship', 'docks'].includes(def.theme)) {
    for (let i = 0; i < 5; i++) {
      const x = 60 + i * (w - 120) / 4;
      pc.rect(x, horizon - 175, 5, 180, dark);
      pc.line(x, horizon - 172, x + 65, horizon - 135, warm, 2);
      pc.line(x + 65, horizon - 135, x + 65, horizon - 10, dark);
      pc.rect(x + 35, horizon - 5, 70, 8, dark);
    }
  }
  else if (def.theme === 'casino') {
    for (let x = 45; x < w; x += 140) {
      pc.rect(x, 35, 5, h - 100, '#795c3f');
      pc.rect(x + 4, 35, 2, h - 100, warm);
      pc.circle(x + 4, 95, 15, accent);
      pc.bloom(x + 4, 95, 75, 80, warm, .16);
    }
  }
  else if (def.theme === 'alien' || def.theme === 'mine') {
    for (let i = 0; i < 15; i++) {
      const x = 30 + hash2(i, 0) * (w - 60), y = 90 + hash2(i, 1) * (h - 190);
      pc.line(x, y, x - 8, y + 28, dark, 9);
      pc.line(x, y, x + 2, y + 29, accent, 5);
      pc.line(x, y, x + 1, y + 20, warm, 1);
      pc.bloom(x, y + 12, 50, 65, accent, .2);
    }
  }
  scene.textures.addCanvas(key, pc.flush());
  return key;
}
