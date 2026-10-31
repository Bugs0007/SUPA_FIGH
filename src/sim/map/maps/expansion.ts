import type { MapDef } from '../mapData';
/** Three readable three-lane arenas: every high route has ladders and a drop-through escape. */
function arena(id: string, name: string, theme: string, blurb: string, ground: string, platform: string): MapDef {
  const w = 64, h = 36;
  const grid = Array.from({ length: h }, () => Array(w).fill('.'));
  const run = (x: number, y: number, n: number, c: string) => { for (let i = 0; i < n; i++)
    grid[y][x + i] = c; };
  for (let y = 32; y < h; y++)
    run(0, y, w, ground);
  const ledges = theme === 'citadel'
    ? [[3, 26, 18], [43, 26, 18], [18, 22, 12], [35, 22, 11], [3, 16, 12], [49, 16, 12], [21, 13, 8], [35, 13, 8], [24, 10, 16], [5, 5, 14], [45, 5, 14]]
    : theme === 'neon'
      ? [[3, 26, 18], [43, 26, 18], [18, 22, 28], [3, 16, 19], [42, 16, 19], [24, 10, 16], [5, 5, 14], [45, 5, 14], [3, 20, 9], [52, 20, 9], [18, 7, 9], [37, 7, 9]]
      : [[3, 26, 18], [43, 26, 18], [18, 22, 28], [3, 16, 19], [42, 16, 19], [24, 10, 16], [5, 5, 14], [45, 5, 14]];
  for (const [x, y, n] of ledges)
    run(x, y, n, platform);
  for (const x of [10, 54])
    for (let y = 5; y < 32; y++)
      grid[y][x] = 'H';
  for (let y = 10; y < 26; y++)
    grid[y][32] = 'H';
  for (const [x, y] of [[6, 31], [18, 31], [44, 31], [58, 31], [6, 25], [56, 25], [26, 21], [38, 21], [8, 15], [55, 15]])
    grid[y][x] = 'S';
  for (const [x, y] of [[14, 25], [48, 25], [28, 21], [12, 15], [50, 15], [28, 9], [8, 4], [52, 4]])
    grid[y][x] = 'w';
  grid[9][35] = 'P';
  for (const [x, y, c] of [[22, 31, 'c'], [41, 31, 'c'], [17, 25, 'b'], [46, 25, 'b'], [19, 15, 'g'], [44, 15, 'g']] as const)
    grid[y][x] = c;
  return { id, name, theme, blurb, rows: grid.map(r => r.join('')), gimmicks: [] };
}
export const valley = arena('valley', 'WATERFALL VALLEY', 'valley', 'Cross the falls, fight over the shrine bridge, or flank through the lower river terraces.', 'D', '-');
valley.powerBias = 'kurama';
valley.gimmicks = [{ type: 'mover', kind: 'platform', x: 25, y: 28, w: 4, path: [[0, 0], [0, -8], [12, -8]], speed: 55, pause: .65 }];
export const citadel = arena('citadel', 'SKY CITADEL', 'citadel', 'Floating gardens, rising stone lifts and a low-gravity central lane reward aerial attacks.', '#', '-');
citadel.gravityScale = .9;
citadel.gimmicks = [{ type: 'mover', kind: 'elevator', x: 22, y: 29, w: 4, path: [[0, 0], [0, -14]], speed: 48, pause: .8 }, { type: 'mover', kind: 'platform', x: 40, y: 13, w: 4, swing: { length: 64, amp: .5, period: 5.8 } }, { type: 'gravity', x: 27, y: 4, w: 10, h: 27, mult: .58 }];
export const neon = arena('neon', 'NEON CROSSING', 'neon', 'Fast rooftops above, conveyor lanes below. Watch the warning lights before the central laser fires.', 'X', '=');
neon.rows[32] = neon.rows[32].slice(0, 24) + '>>>>>>' + 'XX' + '<<<<<<' + neon.rows[32].slice(38);
neon.gimmicks = [{ type: 'hazard', kind: 'laser', x: 31, y: 28, w: 2, h: 4, off: 5.5, on: 1.1, warn: 1, damage: 16, knockY: -180 }, { type: 'mover', kind: 'girder', x: 22, y: 27, w: 4, path: [[0, 0], [16, 0]], speed: 65, pause: .5 }, { type: 'drops', every: [16, 23], xs: [14, 32, 49], pool: ['shotgun', 'rifle', 'grenade'] }];
