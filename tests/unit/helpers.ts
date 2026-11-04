import { HEROES } from '../../src/sim/data/heroes';
import type { FighterSpawn } from '../../src/sim/fighter';
import { emptyIntent, type Intent } from '../../src/sim/intent';
import type { MapDef } from '../../src/sim/map/mapData';
import { World } from '../../src/sim/world';

export const FLAT: MapDef = {
  id: 'flat',
  name: 'flat',
  theme: 'arena',
  rows: [
    '..............................',
    '..............................',
    '..............................',
    '..............................',
    '..............................',
    '.......------.................',
    '..............................',
    '..............................',
    '..S.....................S.....',
    '##############################',
    '##############################',
  ],
};

export function spec(name: string, team = 0): FighterSpawn {
  return { name, team, isBot: false, upJumps: false };
}

export function makeWorld(map: MapDef = FLAT, n = 2, weaponSpawnRate = 0): World {
  const specs = Array.from({ length: n }, (_, i) => spec('F' + i));
  return new World(map, specs, { friendlyFire: false, weaponSpawnRate, gravityScale: 1 }, 42);
}

export function intent(p: Partial<Intent> = {}): Intent {
  return { ...emptyIntent(), ...p };
}

/** Step the world n ticks with per-fighter intents from a callback. */
export function run(w: World, ticks: number, fn: (tick: number) => Intent[] = () => []): void {
  for (let t = 0; t < ticks; t++) w.step(fn(t));
}

/**
* Gathered ultimates take `ULT_WINDUP` seconds in the real game. Tests about aim, damage or projectile collisions are not about
* the wind-up: they call this once to get the old short wind-ups back (module state is per test file).
*/
export function shortUltimateWindups(): void {
  const quick: Record<string, number> = { sasuke: 0.65, naruto: 0.45, goku: 0.95 };
  for (const [id, t] of Object.entries(quick)) HEROES[id].super.bomb!.windup = t;
}
