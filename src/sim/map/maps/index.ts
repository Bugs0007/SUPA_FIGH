import type { MapDef } from '../mapData';
import { testArena } from './testArena';

export const MAPS: Record<string, MapDef> = {
  [testArena.id]: testArena,
};

export const MAP_LIST: MapDef[] = Object.values(MAPS);

export function getMap(id: string): MapDef {
  return MAPS[id] ?? testArena;
}
