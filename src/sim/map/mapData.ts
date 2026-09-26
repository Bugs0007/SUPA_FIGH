import { TILE } from '../constants';
import { CHAR_TO_KIND, TK } from './tiles';

/**
 * A map is data: ASCII rows + metadata. Legend (see tiles.ts for tile chars):
 *   '#' concrete  'M' metal  'X' steel  'B' brick  'W' thin wood wall  'G' glass  'D' dirt
 *   '-' wood one-way platform  '=' metal one-way platform  'H' ladder  '~' water (deadly)
 *   ':' background wall (decor only)  '.' or ' ' empty
 *   'S' fighter spawn (need 10)  'w' weapon spawn  'c' crate  'b' explosive barrel  'g' gas canister
 * Markers are placed in the cell the fighter/item stands IN (feet at the bottom of that cell).
 */
export interface MapDef {
  id: string;
  name: string;
  rows: string[];
  /** art theme key (background, palette) */
  theme: string;
  gravityScale?: number;
  /** extra px below the map before fighters die (default 48) */
  killMargin?: number;
  /** description shown in the lobby */
  blurb?: string;
}

export interface MapPoint {
  x: number;
  y: number;
}

export interface PropSpawn extends MapPoint {
  type: 'crate' | 'barrel' | 'gas';
}

export interface ParsedMap {
  w: number;
  h: number;
  tiles: Uint8Array;
  /** 1 where a background wall should be drawn */
  back: Uint8Array;
  spawns: MapPoint[];
  weaponSpawns: MapPoint[];
  props: PropSpawn[];
}

const PROP_CHARS: Record<string, PropSpawn['type']> = { c: 'crate', b: 'barrel', g: 'gas' };

export function parseMap(def: MapDef): ParsedMap {
  const h = def.rows.length;
  const w = Math.max(...def.rows.map((r) => r.length));
  const tiles = new Uint8Array(w * h);
  const back = new Uint8Array(w * h);
  const spawns: MapPoint[] = [];
  const weaponSpawns: MapPoint[] = [];
  const props: PropSpawn[] = [];
  const charAt = (x: number, y: number) => (y >= 0 && y < h ? def.rows[y][x] ?? '.' : '.');

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = charAt(x, y);
      const i = y * w + x;
      const foot = { x: x * TILE + TILE / 2, y: (y + 1) * TILE };
      if (c === ':') back[i] = 1;
      else if (c === 'S') spawns.push(foot);
      else if (c === 'w') weaponSpawns.push(foot);
      else if (PROP_CHARS[c]) props.push({ ...foot, type: PROP_CHARS[c] });
      else if (c !== '.' && c !== ' ') {
        const k = CHAR_TO_KIND[c];
        if (k === undefined) throw new Error(`Map ${def.id}: unknown char '${c}' at ${x},${y}`);
        tiles[i] = k;
      }
    }
  }

  // Non-':' non-solid cells inside rooms (markers, ladders, platforms) inherit the back wall
  // when surrounded by it, so rooms don't get holes where markers were placed. A few passes let
  // the fill propagate through runs of platforms/markers.
  const isBack = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && back[y * w + x] === 1;
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (back[i]) continue;
        const k = tiles[i];
        if (k !== TK.EMPTY && k !== TK.LADDER && k !== TK.PLAT_WOOD && k !== TK.PLAT_METAL) continue;
        const l = isBack(x - 1, y);
        const r = isBack(x + 1, y);
        const u = isBack(x, y - 1);
        const d = isBack(x, y + 1);
        const n = +l + +r + +u + +d;
        const marker = charAt(x, y) !== '.' && charAt(x, y) !== ' ' && k === TK.EMPTY;
        if ((l && r) || (u && d) || n >= 3 || (marker && n >= 1)) {
          back[i] = 1;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  return { w, h, tiles, back, spawns, weaponSpawns, props };
}
