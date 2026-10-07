// Prints a map as ASCII with tile rulers + the standable floor runs (feet y in px), for placing trailer shots.
// Usage: npx vite-node scripts/trailer/maps.ts <mapId> [x0 x1]   (x range in tiles)
import { getMap } from '../../src/sim/map/maps';

const id = process.argv[2] ?? 'leaf';
const x0 = Number(process.argv[3] ?? 0);
const m = getMap(id);
const w = m.rows[0].length;
const x1 = Number(process.argv[4] ?? w);
console.log(`${m.id} "${m.name}" theme=${m.theme} ${w}x${m.rows.length} tiles = ${w * 16}x${m.rows.length * 16}px gimmicks=${(m.gimmicks ?? []).map((g) => (g as { kind?: string }).kind ?? g.type).join(',')}`);
let ruler = '    ';
for (let x = x0; x < x1; x++) ruler += x % 10 === 0 ? String(Math.floor(x / 10) % 10) : ' ';
console.log(ruler);
console.log('    ' + Array.from({ length: x1 - x0 }, (_, i) => (x0 + i) % 10).join(''));
m.rows.forEach((r, y) => console.log(String(y).padStart(3) + ' ' + r.slice(x0, x1)));
const solid = (c: string) => '#MXBWGD'.includes(c);
const floor = (c: string) => solid(c) || c === '-' || c === '=';
console.log('floors (feet y px, x range px) — surfaces with 3 free rows above:');
for (let y = 3; y < m.rows.length; y++) {
  let run = -1;
  for (let x = 0; x <= w; x++) {
    const c = m.rows[y]?.[x] ?? '#';
    const free = (yy: number) => !solid(m.rows[yy]?.[x] ?? '#');
    const ok = x < w && floor(c) && free(y - 1) && free(y - 2) && free(y - 3);
    if (ok && run < 0) run = x;
    if (!ok && run >= 0) {
      if (x - run >= 3) console.log(`  y=${y * 16} x=${run * 16}..${x * 16} (tiles ${run}-${x - 1}, row ${y})`);
      run = -1;
    }
  }
}
