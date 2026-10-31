import type { MapDef } from '../mapData';

// Valley of the End: two colossal stone statues face each other across a gorge, a waterfall between them and a
// shallow river below (you stand in it: no fall deaths here). Left = the Senju founder (long straight hair), right =
// the Uchiha (spiky mane); both raise one hand in the two-finger seal of confrontation. Their heads, shoulders, raised
// hands, armour skirts and pedestals are the platforms; vines hang down the canyon walls and cliff faces.
// The rows are built from the part boxes below (left half authored, right half mirrored), so the art
// (art/valleyArt.ts) paints the statues over exactly the cells they collide with.

export const VALLEY_W = 80;
export const VALLEY_H = 40;

/** Inclusive tile box [x0, y0, x1, y1] in the LEFT half; the right half mirrors it (x -> W - 1 - x). */
export type TileBox = readonly [number, number, number, number];

/** The left statue's body parts, top to bottom (all solid stone). */
export const VALLEY_STATUE = {
  head: [7, 4, 12, 6],
  hairBack: [5, 5, 6, 12],
  shoulders: [4, 7, 14, 7],
  torso: [6, 7, 13, 12],
  armpit: [14, 8, 14, 8],
  forearm: [14, 9, 14, 10],
  hand: [15, 8, 17, 9],
  fingers: [16, 6, 16, 7],
  skirt: [5, 13, 15, 14],
  legs: [6, 15, 13, 17],
  pedestal: [4, 18, 15, 19],
} as const satisfies Record<string, TileBox>;

/** Terrain landmarks (tile rows / columns) shared with the art. */
export const VALLEY_LAND = {
  /** the cliffs the statues stand on: solid from this row down, columns 0..cliffX (mirrored) */
  cliffTop: 20,
  cliffX: 17,
  /** riverbed top row (fighters stand in the river with their feet on it) */
  riverBed: 37,
  /** the two rocks at the foot of the falls (left one; mirrored) */
  rockLow: [33, 33, 34, 36] as TileBox,
  rockHigh: [35, 31, 36, 36] as TileBox,
  /** the fallen stone forearm lodged in the crest of the falls (centre ledge) and the shelf mid-falls */
  bridge: [36, 20, 39, 20] as TileBox,
  shelf: [37, 27, 39, 27] as TileBox,
} as const;

/** One-way stone ledges on the gorge walls (left half; mirrored). */
const LEDGES: TileBox[] = [
  [21, 32, 24, 32],
  [26, 28, 30, 28],
  [28, 24, 32, 24],
  [21, 20, 25, 20],
  [26, 16, 30, 16],
  [20, 12, 23, 12],
  VALLEY_LAND.shelf,
  VALLEY_LAND.bridge,
];

function buildRows(): string[] {
  const W = VALLEY_W;
  const g = Array.from({ length: VALLEY_H }, () => Array<string>(W).fill('.'));
  const put = (x: number, y: number, c: string) => {
    g[y][x] = c;
    g[y][W - 1 - x] = c;
  };
  const box = ([x0, y0, x1, y1]: TileBox, c: string) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, c);
  };
  const { cliffTop, cliffX, riverBed } = VALLEY_LAND;
  box([0, 0, 1, VALLEY_H - 1], '#'); // canyon walls at the map edges
  box([0, cliffTop, cliffX, VALLEY_H - 1], '#'); // the cliffs
  box([cliffX + 1, riverBed, W / 2 - 1, VALLEY_H - 1], '#'); // riverbed
  for (const part of Object.values(VALLEY_STATUE)) box(part, '#');
  box(VALLEY_LAND.rockLow, '#');
  box(VALLEY_LAND.rockHigh, '#');
  for (const l of LEDGES) box(l, '-');
  // vines: down the canyon wall behind the statue, and from the raised hand down the cliff into the river
  for (let y = 3; y < cliffTop; y++) put(2, y, 'H');
  for (let y = VALLEY_STATUE.hand[1] - 1; y < riverBed; y++) put(cliffX + 1, y, 'H');
  // spawns: head, raised hand, behind the statue, pedestal front, river
  for (const [x, y] of [[10, 3], [17, 7], [3, 19], [14, 17], [24, 36]]) put(x, y, 'S');
  // weapons: back shoulder, low outcrop, rock, high ledge
  for (const [x, y] of [[4, 6], [22, 31], [35, 30], [28, 15]]) put(x, y, 'w');
  // power orbs: on the stone forearm (centre, high) and in the river between the rocks
  g[19][39] = 'P';
  g[36][39] = 'P';
  return g.map((r) => r.join(''));
}

export const valleyOfTheEnd: MapDef = {
  id: 'valley',
  name: 'VALLEY OF THE END',
  theme: 'valley',
  blurb: 'Two stone giants face off across the falls. Fight on their heads and raised hands, or knee-deep in the river.',
  rows: buildRows(),
  gimmicks: [],
};
