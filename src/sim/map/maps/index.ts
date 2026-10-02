import type { MapDef } from '../mapData';
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
];

export const MAPS: Record<string, MapDef> = Object.fromEntries(MAP_LIST.map((m) => [m.id, m]));

export function getMap(id: string): MapDef {
  return MAPS[id] ?? testArena;
}
