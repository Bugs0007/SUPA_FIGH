import type { MapDef } from '../mapData';

type Span = [from: number, to: number, row: number, tile?: string];
type Shaft = [column: number, top: number, bottom: number];
type Prop = [column: number, row: number, tile: string];
type Bay = [from: number, to: number, bottom: number, top?: number];

interface District {
  name: string;
  width: number;
  floor: number;
  material: string;
  platform: string;
  ledges: Span[];
  ladders: Shaft[];
  loot: [column: number, floor: number][];
  bays?: Bay[];
  doors?: [from: number, to: number, bottom: number, height?: number][];
  props?: Prop[];
  floorStart?: number;
  floorEnd?: number;
  wall?: string;
  waterline?: number;
}

// Extend existing arena levels into a shorter loop. Negative columns join the
// core's floors and balconies to the district without moving spawn markers.
const DISTRICTS: Readonly<Record<string, District | undefined>> = {
  rooftops: {
    name: 'Water Tower Walk',
    width: 26, floor: 23, material: 'B', platform: '=',
    ledges: [[-1, 9, 16], [9, 23, 12], [14, 25, 19], [12, 13, 22, 'M']],
    ladders: [[4, 16, 23], [18, 12, 23]],
    loot: [[8, 16], [21, 12], [23, 23]],
    bays: [[7, 21, 23, 16]],
    props: [[9, 22, 'b'], [14, 11, 'c']],
  },
  train: {
    name: 'Observation Car',
    width: 26, floor: 20, material: 'X', platform: '=',
    ledges: [[-3, 24, 12, 'M'], [6, 20, 16, '-'], [24, 24, 13, 'G'], [24, 24, 14, 'G'], [24, 24, 15, 'G']],
    ladders: [[6, 12, 20], [20, 12, 20]],
    loot: [[12, 12], [15, 16], [21, 20]],
    bays: [[1, 24, 20, 13]],
    props: [[9, 19, 'c'], [18, 19, 'g']],
    doors: [[-4, -3, 20]],
    floorStart: -2,
    floorEnd: 21,
  },
  factory: {
    name: 'Assembly Hall',
    width: 28, floor: 32, material: '#', platform: '=',
    ledges: [[-1, 14, 22], [9, 24, 16], [17, 26, 24], [6, 16, 32, '>'], [14, 15, 29, 'X'], [14, 15, 30, 'X'], [14, 15, 31, 'X']],
    ladders: [[7, 22, 32], [12, 16, 22], [23, 16, 32]],
    loot: [[5, 22], [19, 16], [25, 32]],
    doors: [[-1, -1, 22, 4], [-1, -1, 32, 4]],
    bays: [[0, 26, 32, 1]],
    props: [[3, 31, 'c'], [20, 23, 'g']],
    floorStart: -1,
    wall: 'X',
  },
  construction: {
    name: 'Crane Yard',
    width: 29, floor: 35, material: 'D', platform: '-',
    ledges: [[-1, 10, 30], [-4, 11, 24], [9, 23, 17, '='], [17, 27, 27], [24, 26, 34, 'M']],
    ladders: [[5, 24, 35], [11, 17, 24], [21, 17, 35]],
    loot: [[7, 24], [17, 17], [26, 27]],
    bays: [[19, 22, 35, 26]],
    props: [[14, 34, 'b'], [24, 26, 'c']],
  },
  casino: {
    name: 'High-Roller Lounge',
    width: 25, floor: 32, material: '#', platform: '-',
    ledges: [[-1, 10, 22], [-1, 8, 14], [9, 23, 18], [13, 23, 27], [12, 12, 30, 'W'], [12, 12, 31, 'W']],
    ladders: [[6, 14, 32], [19, 18, 32]],
    loot: [[5, 14], [16, 18], [21, 32]],
    doors: [[-1, -1, 14], [-1, -1, 22], [-1, -1, 32, 4]],
    bays: [[0, 23, 32, 1]],
    props: [[9, 31, 'c'], [15, 11, 'l']],
    floorStart: -1,
    wall: 'B',
  },
  docks: {
    name: 'Container Pier',
    width: 28, floor: 27, material: 'X', platform: '=',
    ledges: [[-1, 10, 18, 'M'], [9, 22, 13], [16, 26, 21], [14, 16, 25, 'X'], [14, 16, 26, 'X']],
    ladders: [[7, 18, 27], [11, 13, 18], [23, 21, 27]],
    loot: [[5, 18], [19, 13], [24, 27]],
    doors: [[-1, -1, 18], [-1, -1, 27]],
    bays: [[11, 22, 27, 19]],
    props: [[11, 26, 'g'], [20, 20, 'c']],
    floorStart: -1,
  },
  office: {
    name: 'Skybridge Annex',
    width: 27, floor: 38, material: '#', platform: '=',
    ledges: [[-10, 4, 38], [-10, 22, 29], [-10, 12, 20], [7, 24, 14], [15, 25, 23], [24, 24, 25, 'G'], [24, 24, 26, 'G']],
    ladders: [[8, 14, 38], [21, 14, 38]],
    loot: [[14, 14], [18, 23], [23, 38]],
    doors: [[-11, -11, 20], [-11, -11, 29], [-11, -11, 38]],
    bays: [[4, 25, 38, 9]],
    floorStart: 4,
    props: [[16, 28, 'c'], [12, 37, 'g']],
  },
  lab: {
    name: 'Containment Wing',
    width: 28, floor: 32, material: 'X', platform: '=',
    ledges: [[-1, 14, 22], [-1, 9, 13], [11, 24, 16], [16, 26, 26], [12, 12, 29, 'G'], [12, 12, 30, 'G'], [12, 12, 31, 'G']],
    ladders: [[6, 13, 32], [21, 16, 32]],
    loot: [[8, 22], [18, 16], [25, 32]],
    doors: [[-1, -1, 13], [-1, -1, 22], [-1, -1, 32]],
    bays: [[0, 26, 32, 1]],
    props: [[17, 25, 'g'], [3, 31, 'c']],
    floorStart: -1,
    wall: 'X',
  },
  mine: {
    name: 'Crystal Galleries',
    width: 27, floor: 32, material: 'D', platform: '-',
    ledges: [[0, 11, 22, 'D'], [3, 6, 23, 'D'], [8, 19, 16], [15, 25, 26], [20, 25, 12], [8, 11, 30, 'D'], [8, 11, 31, 'D']],
    ladders: [[7, 22, 32], [10, 16, 22], [22, 12, 32]],
    loot: [[5, 22], [15, 16], [25, 26]],
    doors: [[-2, -1, 22], [-2, -1, 32]],
    bays: [[0, 25, 32, 4]],
    props: [[13, 31, 't'], [16, 25, 'c']],
    wall: 'D',
  },
  leaf: {
    name: 'Forest Shrine',
    width: 30, floor: 33, material: 'D', platform: '-',
    ledges: [[-1, 9, 19], [-1, 6, 9], [9, 23, 14], [15, 28, 25], [12, 14, 31, 'D'], [12, 14, 32, 'D']],
    ladders: [[5, 9, 33], [17, 14, 25], [25, 25, 33]],
    loot: [[7, 19], [21, 14], [27, 25]],
    doors: [[-1, -1, 9], [-1, -1, 19], [-1, -1, 33]],
    props: [[9, 32, 'c'], [20, 24, 'c']],
  },
  ship: {
    name: 'Boarding Dock',
    width: 27, floor: 20, material: 'D', platform: '-',
    ledges: [[-3, 10, 14], [-7, 9, 24], [9, 24, 10], [8, 22, 26]],
    ladders: [[4, 14, 26], [12, 10, 20], [19, 10, 26]],
    loot: [[7, 14], [14, 20], [21, 10]],
    doors: [[-8, -7, 24]],
    bays: [[3, 22, 26, 20]],
    props: [[8, 19, 'b'], [16, 9, 'c']],
    floorStart: 0,
    floorEnd: 21,
    waterline: 29,
  },
  alien: {
    name: 'Crystal Shelf',
    width: 29, floor: 32, material: 'D', platform: '-',
    ledges: [[0, 9, 22, 'D'], [-1, 9, 16], [12, 26, 12], [15, 27, 25], [8, 10, 30, 'D'], [8, 10, 31, 'D']],
    ladders: [[6, 16, 32], [20, 12, 32]],
    loot: [[8, 16], [23, 12], [26, 25]],
    doors: [[-2, -1, 32]],
    props: [[15, 31, 'c'], [17, 24, 'g']],
  },
  citadel: {
    name: 'Hanging Gardens',
    width: 27, floor: 32, material: '#', platform: '-',
    ledges: [[-3, 8, 26], [-3, 11, 16], [10, 25, 12], [13, 25, 23], [13, 16, 30, '#'], [13, 16, 31, '#']],
    ladders: [[6, 16, 32], [17, 12, 32]],
    loot: [[7, 16], [22, 12], [24, 23]],
    bays: [[2, 8, 32, 24], [17, 25, 32, 22]],
    props: [[11, 31, 'c'], [20, 22, 'c']],
  },
  neon: {
    name: 'Transit Exchange',
    width: 28, floor: 32, material: 'X', platform: '=',
    ledges: [[-3, 13, 26], [-3, 9, 16], [10, 25, 19], [14, 24, 11], [15, 18, 31, 'M']],
    ladders: [[6, 16, 32], [20, 11, 32]],
    loot: [[8, 16], [23, 19], [25, 32]],
    bays: [[0, 10, 32, 17], [13, 26, 32, 16]],
    props: [[3, 31, 'g'], [16, 18, 'c']],
  },
  dojo: {
    name: 'East Practice Court',
    width: 27, floor: 33, material: '#', platform: '-',
    ledges: [[-1, 10, 26], [-1, 8, 20], [11, 24, 17], [16, 25, 25]],
    ladders: [[6, 20, 33], [19, 17, 33]],
    loot: [[8, 20], [22, 17], [24, 33]],
    doors: [[-1, -1, 20], [-1, -1, 26], [-1, -1, 33, 4]],
    bays: [[0, 25, 33, 1]],
    props: [[13, 32, 'c'], [22, 24, 'c']],
    floorStart: -1,
    wall: '#',
  },
  museum: {
    name: 'East Sculpture Gallery',
    width: 29, floor: 33, material: '#', platform: '=',
    ledges: [[-1, 8, 25], [-1, 10, 18], [12, 26, 14], [16, 27, 23], [11, 13, 31, '#'], [11, 13, 32, '#']],
    ladders: [[6, 18, 33], [22, 14, 33]],
    loot: [[8, 18], [17, 14], [26, 23]],
    doors: [[-1, -1, 18], [-1, -1, 25], [-1, -1, 33, 4]],
    bays: [[0, 27, 33, 1]],
    props: [[8, 32, 'c'], [18, 22, 'c']],
    floorStart: -1,
    wall: '#',
  },
};

export function addArenaDistrict(def: MapDef): MapDef {
  const plan = DISTRICTS[def.id];
  if (!plan) return def;
  const oldWidth = Math.max(...def.rows.map((row) => row.length));
  const rows = def.rows.map((row) => [...row.padEnd(oldWidth + plan.width, '.')]);
  const set = (column: number, y: number, tile: string) => {
    rows[y][oldWidth + column] = tile;
  };
  const span = (from: number, to: number, y: number, tile: string) => {
    for (let column = from; column <= to; column++) set(column, y, tile);
  };

  for (const [from, to, bottom, top = Math.max(3, bottom - 26)] of plan.bays ?? []) {
    for (let y = top; y < bottom; y++) span(from, to, y, ':');
  }
  for (let y = plan.floor; y < (plan.floorEnd ?? rows.length); y++)
    span(plan.floorStart ?? 0, plan.width - 1, y, plan.material);
  if (plan.waterline !== undefined) {
    for (let y = plan.waterline; y < rows.length; y++) span(0, plan.width - 1, y, '~');
  }
  if (plan.wall) {
    span(0, plan.width - 1, 0, plan.wall);
    for (let y = 1; y < plan.floor; y++) set(plan.width - 1, y, plan.wall);
  }
  for (const [from, to, bottom, height = 3] of plan.doors ?? []) {
    for (let y = bottom - height; y < bottom; y++) span(from, to, y, '.');
  }
  for (const [from, to, y, tile] of plan.ledges) span(from, to, y, tile ?? plan.platform);
  for (const [column, top, bottom] of plan.ladders) {
    for (let y = top; y < bottom; y++) set(column, y, 'H');
  }
  for (const [column, y, tile] of plan.props ?? []) set(column, y, tile);

  const hasOrbSites = def.rows.some((row) => row.includes('P'));
  plan.loot.forEach(([column, y], i) => set(column, y - 1, hasOrbSites && i === 1 ? 'P' : 'w'));

  // The tunnel still crosses both sides of the longer train at its old speed.
  const gimmicks = def.gimmicks?.map((gimmick) => {
    if (gimmick.type !== 'hazard' || gimmick.kind !== 'tunnel' || !gimmick.sweep) return gimmick;
    const sweep = gimmick.sweep + plan.width;
    return { ...gimmick, sweep, on: gimmick.on * sweep / gimmick.sweep };
  });
  return {
    ...def,
    rows: rows.map((row) => row.join('')),
    gimmicks,
    blurb: `${def.blurb ?? ''} Explore the ${plan.name}.`.trim(),
    district: {
      column: oldWidth,
      floor: plan.floor,
      openings: (plan.wall || def.id === 'office' ? plan.doors ?? [] : []).map(([from, to, bottom, height = 3]) => ({
        x: oldWidth + from, y: bottom - height, w: to - from + 1, h: height,
      })),
    },
  };
}
