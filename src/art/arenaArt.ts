import type Phaser from 'phaser';
import { PixelCanvas, hash2 } from './canvas';
import { shade } from './palette';
import { parseMap, type MapDef } from '../sim/map/mapData';
import { bakeValleyScenery } from './valleyArt';
import { paintDistrict } from './districtArt';
export const ARENA_COLORS: Record<string, [
  string,
  string,
  string
]> = {
  arena: ['#79a9ca', '#df9e54', '#222e47'], rooftops: ['#64cdd9', '#e88ac5', '#262445'], train: ['#e1b86e', '#88cde1', '#252c45'],
  factory: ['#e89950', '#7fb8a3', '#35252d'], construction: ['#efc96b', '#89bfd1', '#394c60'], casino: ['#edba65', '#e378a7', '#3e1e3b'],
  docks: ['#e1ad81', '#85ccd2', '#253b51'], office: ['#b8dce8', '#85babd', '#32495e'], lab: ['#7ce4bc', '#e6bc6b', '#193b42'],
  mine: ['#a286df', '#70c8cc', '#302738'], leaf: ['#94bd68', '#d3b079', '#2d463b'], ship: ['#d8ad6c', '#a1d5d8', '#3d3c4b'], alien: ['#9c8ae0', '#73dbc9', '#3d2b59'],
  valley: ['#a9c48a', '#e7b98a', '#2a3a36'], citadel: ['#e9d2a0', '#9dbbd1', '#40566b'], neon: ['#61d7ee', '#ec7cb9', '#282a52'],
  dojo: ['#e8b070', '#d0604a', '#3a2418'], museum: ['#e8d8b0', '#9ab8d0', '#3a3640'],
};

/** Bounding box (px) of the open "window" cells of an indoor map: interior cells with no back wall. */
function openingBox(map: ReturnType<typeof parseMap>, width: number): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 1; y < map.h - 1; y++)
    for (let x = 1; x < width / 16 - 1; x++) {
      if (map.back[y * map.w + x] || map.tiles[y * map.w + x]) continue;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  return x1 < 0 ? null : { x0: x0 * 16, y0: y0 * 16, x1: (x1 + 1) * 16, y1: (y1 + 1) * 16 };
}

/** Tournament hall: timber frame and slid-open shoji screens around the view, pillars, crowd banners. */
function dojoScenery(pc: PixelCanvas, map: ReturnType<typeof parseMap>, w: number, h: number): void {
  const o = openingBox(map, w);
  const timber = '#3a2416', timberLit = '#5a3a24', paper = '#8a7a62', red = '#8a2e26', gold = '#c8984a';
  if (o) {
    // lintel and sill beams, posts every few panels; the screens stand slid aside at both ends
    pc.rect(o.x0 - 6, o.y0 - 6, o.x1 - o.x0 + 12, 6, timber);
    pc.rect(o.x0 - 6, o.y0 - 6, o.x1 - o.x0 + 12, 1, timberLit);
    pc.rect(o.x0 - 6, o.y1, o.x1 - o.x0 + 12, 5, timber);
    for (let x = o.x0; x <= o.x1; x += 92) pc.rect(Math.min(x, o.x1 - 4), o.y0, 4, o.y1 - o.y0, timber);
    for (const sx of [o.x0 + 4, o.x1 - 40]) {
      pc.rect(sx, o.y0, 36, o.y1 - o.y0, paper);
      for (let x = sx; x <= sx + 36; x += 9) pc.rect(x, o.y0, 1, o.y1 - o.y0, timber);
      for (let y = o.y0; y < o.y1; y += 12) pc.rect(sx, y, 36, 1, timber);
    }
  }
  // round pillars along the hall and crowd banners hanging from the lintel
  for (const x of [w * 0.19, w * 0.81]) {
    pc.rect(x - 7, 16, 14, h - 64, timber);
    pc.rect(x - 5, 16, 3, h - 64, timberLit);
    pc.rect(x - 9, h - 54, 18, 6, '#2a180e');
  }
  if (o) for (let i = 0; i < 4; i++) {
    const x = o.x0 + 70 + i * ((o.x1 - o.x0 - 140) / 3);
    const bh = 64 + (i % 2) * 18;
    pc.rect(x - 9, o.y0, 18, bh, i % 2 ? red : '#2e3a5a');
    pc.rect(x - 9, o.y0 + bh - 4, 18, 4, gold);
    pc.circle(x, o.y0 + 24, 5, gold);
    pc.circle(x, o.y0 + 24, 3, i % 2 ? red : '#2e3a5a');
  }
}

/** Museum atrium: iron-and-glass roof over the skylight, fluted columns, exhibition banners. */
function museumScenery(pc: PixelCanvas, map: ReturnType<typeof parseMap>, w: number, h: number): void {
  const o = openingBox(map, w);
  const iron = '#2a2e3a', ironLit = '#4a5266', stone = '#7a746a', stoneLit = '#948e82', stoneDark = '#5a554e';
  if (o) {
    // glass: a sparse dither of pale panes, iron ribs and a barrel-vault arch
    for (let y = o.y0; y < o.y1; y++)
      for (let x = o.x0; x < o.x1; x++) if (((x + y * 3) & 7) === 0) pc.set(x, y, '#9ab8d0', 70);
    for (let x = o.x0; x <= o.x1; x += 48) pc.rect(Math.min(x, o.x1 - 2), o.y0, 2, o.y1 - o.y0, iron);
    for (let y = o.y0 + 40; y < o.y1; y += 48) pc.rect(o.x0, y, o.x1 - o.x0, 2, iron);
    const cx = (o.x0 + o.x1) / 2, rx = (o.x1 - o.x0) / 2;
    for (let x = o.x0; x < o.x1; x++) {
      const t = (x - cx) / rx;
      const y = Math.round(o.y1 - 8 - Math.sqrt(Math.max(0, 1 - t * t)) * (o.y1 - o.y0 - 20));
      pc.rect(x, y, 1, 3, iron);
      pc.set(x, y, ironLit);
    }
    pc.rect(o.x0 - 4, o.y1, o.x1 - o.x0 + 8, 6, stoneDark);
    pc.rect(o.x0 - 4, o.y1, o.x1 - o.x0 + 8, 1, stoneLit);
  }
  // fluted columns between the floor and the gallery level
  const base = h - 48;
  for (const fx of [0.2, 0.36, 0.64, 0.8]) {
    const x = Math.round(w * fx);
    const top = 16 * 17;
    pc.rect(x - 8, top, 16, base - top, stone);
    for (let k = -6; k <= 6; k += 4) pc.rect(x + k, top + 6, 1, base - top - 12, stoneDark);
    pc.rect(x - 7, top, 3, base - top, stoneLit);
    pc.rect(x - 11, top, 22, 5, stoneLit);
    pc.rect(x - 11, base - 6, 22, 6, stoneDark);
  }
  // exhibition banners on the side walls
  for (const [x, c] of [[w * 0.09, '#6a2a3a'], [w * 0.91, '#2a4a6a']] as const) {
    pc.rect(x - 10, 60, 20, 70, c);
    pc.rect(x - 10, 60, 20, 3, '#c8a860');
    pc.rect(x - 6, 76, 12, 2, '#c8a860');
    pc.rect(x - 4, 82, 8, 1, '#c8a860');
  }
}
/** World-sized architectural detail, shared by live arenas and the menu's full-map renders. */
export function bakeArenaScenery(scene: Phaser.Scene, def: MapDef): string {
  if (def.theme === 'valley')
    return bakeValleyScenery(scene, def); // the statues are the terrain: painted cell by cell (valleyArt.ts)
  const key = 'arena-scenery-' + def.id;
  if (scene.textures.exists(key))
    return key;
  const map = parseMap(def), w = (def.district?.column ?? map.w) * 16, h = map.h * 16;
  const colors = ARENA_COLORS[def.theme] ?? ARENA_COLORS.arena;
  const pc = new PixelCanvas(map.w * 16, h), [accent, warm, dark] = colors;
  const natural = ['leaf', 'citadel', 'alien', 'mine'].includes(def.theme);
  // Architectural bays, cables and masonry make empty wall rooms feel inhabited.
  // (the open halls paint their own architecture: dojoScenery / museumScenery)
  const bays = def.theme !== 'dojo' && def.theme !== 'museum';
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      if (!bays || !map.back[y * map.w + x])
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
      const above = def.rows[y - 1]?.[x] ?? '';
      if (!'-=MBXD#'.includes(c) || !('.SwPbctg'.includes(above) || (x * 16 >= w && above === ':')))
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
  if (def.theme === 'leaf') {
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
  if (def.theme === 'citadel') {
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
  else if (def.theme === 'dojo')
    dojoScenery(pc, map, w, h);
  else if (def.theme === 'museum')
    museumScenery(pc, map, w, h);
  else if (def.theme === 'alien' || def.theme === 'mine') {
    for (let i = 0; i < 15; i++) {
      const x = 30 + hash2(i, 0) * (w - 60), y = 90 + hash2(i, 1) * (h - 190);
      pc.line(x, y, x - 8, y + 28, dark, 9);
      pc.line(x, y, x + 2, y + 29, accent, 5);
      pc.line(x, y, x + 1, y + 20, warm, 1);
      pc.bloom(x, y + 12, 50, 65, accent, .2);
    }
  }
  if (def.district) paintDistrict(pc, def.id, def.district, map.w, colors);
  scene.textures.addCanvas(key, pc.flush());
  return key;
}
