import { describe, expect, it } from 'vitest';
import { MAPS, MAP_LIST } from '../../src/sim/map/maps';
import { parseMap } from '../../src/sim/map/mapData';
import { VALLEY_H, VALLEY_LAND, VALLEY_STATUE, VALLEY_W } from '../../src/sim/map/maps/valley';
import { TileMap } from '../../src/sim/map/tilemap';
import { World } from '../../src/sim/world';

const def = MAPS.valley;
const map = new TileMap(parseMap(def));

describe('Valley of the End map', () => {
  it('is registered as "valley" in the old Waterfall Valley slot, with its own theme and blurb', () => {
    expect(def.name).toBe('VALLEY OF THE END');
    expect(def.theme).toBe('valley');
    expect(def.blurb).toBeTruthy();
    const ids = MAP_LIST.map((m) => m.id);
    expect(ids.indexOf('valley')).toBe(ids.indexOf('alien') + 1);
    expect(ids.indexOf('citadel')).toBe(ids.indexOf('valley') + 1);
  });

  it('is 80x40 and mirror-symmetric (Madara mirrors Hashirama), apart from the centre power orbs', () => {
    expect(def.rows.length).toBe(VALLEY_H);
    for (const r of def.rows) {
      expect(r.length).toBe(VALLEY_W);
      const mirrored = r.split('').reverse().join('');
      const strip = (s: string) => s.replace(/P/g, '.');
      expect(strip(r)).toBe(strip(mirrored));
    }
  });

  it('every statue part is solid stone on both sides (the art paints exactly these cells)', () => {
    for (const [name, [x0, y0, x1, y1]] of Object.entries(VALLEY_STATUE)) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        expect(def.rows[y][x], `${name} ${x},${y}`).toBe('#');
        expect(def.rows[y][VALLEY_W - 1 - x], `${name} mirrored`).toBe('#');
      }
    }
  });

  it('the river is a standable riverbed across the whole gorge: no deadly water, nowhere to fall out', () => {
    expect(def.rows.join('')).not.toContain('~');
    for (let x = 0; x < VALLEY_W; x++) expect(map.def(x, VALLEY_LAND.riverBed).solid, `riverbed at ${x}`).toBe(true);
    // open water above the bed from cliff to cliff, except where the two rocks stand at the foot of the falls
    const rocks = (x: number) => {
      const lx = x < VALLEY_W / 2 ? x : VALLEY_W - 1 - x;
      return lx >= VALLEY_LAND.rockLow[0] && lx <= VALLEY_LAND.rockHigh[2];
    };
    for (let x = VALLEY_LAND.cliffX + 1; x < VALLEY_W - 1 - VALLEY_LAND.cliffX; x++) expect(map.def(x, VALLEY_LAND.riverBed - 1).solid, `x ${x}`).toBe(rocks(x));
  });

  it('spawns on both heads, both raised hands and in the river; power orbs on the stone forearm and between the rocks', () => {
    const p = parseMap(def);
    const at = (tx: number, ty: number) => p.spawns.some((s) => s.x === tx * 16 + 8 && s.y === (ty + 1) * 16);
    const head = VALLEY_STATUE.head;
    expect(at(10, head[1] - 1) && at(VALLEY_W - 1 - 10, head[1] - 1)).toBe(true);
    expect(at(17, VALLEY_STATUE.hand[1] - 1) && at(VALLEY_W - 1 - 17, VALLEY_STATUE.hand[1] - 1)).toBe(true);
    expect(p.spawns.filter((s) => s.y === VALLEY_LAND.riverBed * 16).length).toBe(2);
    expect(p.powerSpawns.map((s) => s.y / 16)).toEqual([VALLEY_LAND.bridge[1], VALLEY_LAND.riverBed]);
    expect(p.weaponSpawns.length).toBe(8);
  });

  it('a fighter falling from the top of the gorge lands in the river alive', () => {
    const w = new World(def, [{ name: 'A', team: 1, isBot: false, upJumps: false }], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 3);
    const f = w.fighters[0];
    f.x = 19 * 16 + 8;
    f.y = 2 * 16;
    f.vx = 0;
    f.vy = 0;
    for (let t = 0; t < 60 * 4; t++) {
      w.step([]);
      w.events.length = 0;
    }
    expect(f.alive).toBe(true);
    expect(f.grounded).toBe(true);
    expect(f.y).toBe(VALLEY_LAND.riverBed * 16);
  });
});
