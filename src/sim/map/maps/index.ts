import type { MapDef } from '../mapData';
import { addArenaDistrict } from './arenaDistricts';
import { casino } from './casino';
import { construction } from './construction';
import { docks } from './docks';
import { factory } from './factory';
import { mine } from './mine';
import { neonRooftops } from './rooftops';
import { nightTrain } from './train';
import { officeTower } from './office';
import { secretLab } from './lab';
import { testArena } from './testArena';
import { leafForest } from './leaf';
import { grandLineShip } from './ship';
import { alienPlanet } from './alien';
import { citadel, neon } from './expansion';
import { valleyOfTheEnd } from './valley';
import { tournamentHall } from './dojo';
import { museumAtrium } from './museum';

export const MAP_LIST: MapDef[] = [
  testArena,
  neonRooftops,
  nightTrain,
  factory,
  construction,
  casino,
  docks,
  officeTower,
  secretLab,
  mine,
  // M9 anime universe maps (any hero can fight on any map)
  leafForest,
  grandLineShip,
  alienPlanet,
  valleyOfTheEnd,
  citadel,
  neon,
  // open indoor halls built for hero fights (long clear lines for supers and ultimates)
  tournamentHall,
  museumAtrium,
].map(addArenaDistrict);

export const MAPS: Record<string, MapDef> = Object.fromEntries(MAP_LIST.map((m) => [m.id, m]));

export function getMap(id: string): MapDef {
  return MAPS[id] ?? testArena;
}

/** Seeded shuffled rotation: every arena appears once before repeats, identical on LAN mirrors. */
export function roundMap(id: string, seed: number, round: number): MapDef {
  if (id !== 'random') return getMap(id);
  const pool = [...MAP_LIST];
  let state = seed >>> 0;
  for (let i = pool.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool[Math.max(0, round - 1) % pool.length];
}
