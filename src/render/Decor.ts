import Phaser from 'phaser';
import { bakeDecor, DECOR, type DecorDef } from '../art/decorArt';
import { hexToNum } from '../art/palette';
import { TILE } from '../sim/constants';
import type { MapDef } from '../sim/map/mapData';
import { TK } from '../sim/map/tiles';
import type { TileMap } from '../sim/map/tilemap';

export interface PlacedDecor {
  def: DecorDef;
  /** top-left px */
  x: number;
  y: number;
  /** animation phase offset (s) */
  phase: number;
}

/** Small deterministic RNG (decor must look the same every time a map loads, and in replays). */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Pick decoration spots for a map. Wall props need open back wall over their whole footprint, floor
 * props a solid/one-way surface under every column, ceiling props a solid tile above, building
 * windows non-breakable brick/concrete all around. Props keep a little air between them, and the
 * total count scales with the open wall area.
 */
export function placeDecor(map: TileMap, def: MapDef): PlacedDecor[] {
  const defs = DECOR[def.theme ?? 'arena'];
  if (!defs?.length) return [];
  const rand = rng(hashString(def.id));
  const empty = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < map.w && ty < map.h && map.get(tx, ty) === TK.EMPTY;
  const back = (tx: number, ty: number) => map.back[ty * map.w + tx] === 1;
  const floorAt = (tx: number, ty: number) => {
    const d = map.def(tx, ty);
    return ty < map.h && (d.solid || d.oneWay) && !d.conveyor;
  };
  const solidAt = (tx: number, ty: number) => ty >= 0 && map.def(tx, ty).solid;
  const faceAt = (tx: number, ty: number) => {
    if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return false;
    const d = map.def(tx, ty);
    return d.solid && !d.breakable && (d.material === 'brick' || d.material === 'concrete');
  };
  // spawn / weapon markers keep their tiles readable
  const reserved = new Set<number>();
  def.rows.forEach((row, ty) => {
    for (let tx = 0; tx < row.length; tx++) if ('SwP'.includes(row[tx])) reserved.add(ty * map.w + tx);
  });

  const tilesOf = (x: number, y: number, w: number, h: number) => {
    const out: [number, number][] = [];
    for (let ty = Math.floor(y / TILE); ty <= Math.floor((y + h - 1) / TILE); ty++)
      for (let tx = Math.floor(x / TILE); tx <= Math.floor((x + w - 1) / TILE); tx++) out.push([tx, ty]);
    return out;
  };

  const fits = (d: DecorDef, x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x + d.w > map.pxW || y + d.h > map.pxH) return false;
    const cells = tilesOf(x, y, d.w, d.h);
    if (d.place === 'face') return tilesOf(x - 4, y - 4, d.w + 8, d.h + 8).every(([tx, ty]) => faceAt(tx, ty));
    if (!cells.every(([tx, ty]) => empty(tx, ty) && !reserved.has(ty * map.w + tx))) return false;
    if (d.place !== 'outdoor' && !cells.every(([tx, ty]) => back(tx, ty))) return false;
    const tx0 = Math.floor(x / TILE);
    const tx1 = Math.floor((x + d.w - 1) / TILE);
    if (d.place === 'floor' || d.place === 'outdoor') {
      const below = (y + d.h) / TILE;
      for (let tx = tx0; tx <= tx1; tx++) if (!floorAt(tx, below)) return false;
    } else if (d.place === 'ceiling') {
      const above = y / TILE - 1;
      for (let tx = tx0; tx <= tx1; tx++) if (!solidAt(tx, above)) return false;
    }
    if (d.place === 'wall' || d.place === 'ceiling') {
      // keep wall props clear of walkable surfaces, so nothing reads like an item lying on a floor
      const row = Math.floor((d.place === 'ceiling' ? y + d.h + 10 : y + d.h + 8) / TILE);
      for (let tx = tx0; tx <= tx1; tx++) if (row < map.h && floorAt(tx, row) && row * TILE < y + d.h + 10) return false;
    }
    return true;
  };

  const placed: PlacedDecor[] = [];
  const overlaps = (d: DecorDef, x: number, y: number) => {
    const m = d.place === 'face' ? 4 : 10;
    return placed.some((p) => x < p.x + p.def.w + m && x + d.w + m > p.x && y < p.y + p.def.h + m && y + d.h + m > p.y);
  };

  // how many: proportional to open back wall (indoors) or building faces (rooftops)
  let open = 0;
  let faces = 0;
  for (let ty = 0; ty < map.h; ty++)
    for (let tx = 0; tx < map.w; tx++) {
      if (empty(tx, ty) && back(tx, ty)) open++;
      if (faceAt(tx, ty)) faces++;
    }
  const target = Math.min(70, Math.round(open / 34) + Math.round(faces / 7));
  const total = defs.reduce((s, d) => s + d.weight, 0);
  // no single prop may dominate a map (variety over repetition)
  const cap = (d: DecorDef) => (d.place === 'face' ? Infinity : Math.max(2, Math.ceil((target * d.weight * 1.4) / total)));
  const used = new Map<string, number>();
  const pick = () => {
    let r = rand() * total;
    for (const d of defs) if ((r -= d.weight) < 0) return d;
    return defs[defs.length - 1];
  };

  for (let attempt = 0; attempt < target * 60 && placed.length < target; attempt++) {
    const d = pick();
    if ((used.get(d.id) ?? 0) >= cap(d)) continue;
    const tx = Math.floor(rand() * map.w);
    const ty = Math.floor(rand() * map.h);
    let x: number;
    let y: number;
    if (d.place === 'floor' || d.place === 'outdoor') {
      x = tx * TILE + Math.floor(rand() * 8);
      y = (ty + 1) * TILE - d.h;
    } else if (d.place === 'ceiling') {
      x = tx * TILE + Math.floor(rand() * 8);
      y = ty * TILE;
    } else {
      x = tx * TILE + Math.floor(rand() * 8);
      y = ty * TILE + Math.floor(rand() * 8);
    }
    x = Math.round(x);
    y = Math.round(y);
    if (!fits(d, x, y) || overlaps(d, x, y)) continue;
    placed.push({ def: d, x, y, phase: rand() * 10 });
    used.set(d.id, (used.get(d.id) ?? 0) + 1);
  }
  return placed;
}

interface DecorView {
  p: PlacedDecor;
  img: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image | null;
  frame: number;
}

/** The decoration layer of a match: images behind the action, animated frames, flickering light pools. */
export class DecorLayer {
  private views: DecorView[] = [];

  constructor(scene: Phaser.Scene, map: TileMap, def: MapDef) {
    const atlas = bakeDecor(scene, def.theme ?? 'arena');
    if (!atlas) return;
    for (const p of placeDecor(map, def)) {
      const d = p.def;
      const img = scene.add
        .image(p.x, p.y, atlas.key, atlas.frame(d.id, 0))
        .setOrigin(0, 0)
        // building faces sit on top of the solid tiles; everything else on the back wall
        .setDepth(d.place === 'face' ? 21 : 1);
      let glow: Phaser.GameObjects.Image | null = null;
      if (d.glow) {
        glow = scene.add
          .image(p.x + d.glow.x, p.y + d.glow.y, 'fx', 'glowBig')
          .setScale(d.glow.r / 15)
          .setTint(hexToNum(d.glow.color))
          .setAlpha(d.glow.alpha)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(d.place === 'face' ? 22 : 2);
      }
      this.views.push({ p, img, glow, frame: 0 });
    }
    this.key = atlas.key;
    this.frameName = atlas.frame;
  }

  private key = '';
  private frameName: (id: string, f: number) => string = () => '';

  get count(): number {
    return this.views.length;
  }

  update(time: number): void {
    for (const v of this.views) {
      const d = v.p.def;
      if ((d.frames ?? 1) > 1) {
        const f = Math.floor((time + v.p.phase) / (d.period ?? 0.5)) % (d.frames ?? 1);
        if (f !== v.frame) {
          v.frame = f;
          v.img.setFrame(this.frameName(d.id, f));
        }
      }
      if (v.glow && d.glow) {
        let a = d.glow.alpha;
        if (d.glow.flicker) {
          const t = time * 7 + v.p.phase * 13;
          a *= 0.85 + Math.sin(t) * 0.08 + Math.sin(t * 2.7) * 0.05;
          // a rare short dip, like a bad bulb
          if (Math.sin(time * 0.9 + v.p.phase * 5) > 0.985) a *= 0.4;
        }
        v.glow.setAlpha(a);
      }
    }
  }

  destroy(): void {
    for (const v of this.views) {
      v.img.destroy();
      v.glow?.destroy();
    }
    this.views = [];
    void this.key;
  }
}
