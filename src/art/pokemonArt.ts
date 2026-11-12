import type { Baked } from './pixelRaster';
import { pokemonStage, type PokemonSpecies } from '../sim/data/pokemon';
import { bakeCharmanderRig } from './charmanderRig';
import { bakeCharizardRig } from './charizardRig';
import { scalePokemonFrame, type ReferenceFrame } from './pokemonSpriteMotion';

export type PokemonPose = 'idle' | 'walk' | 'run' | 'cast' | 'dash' | 'guard' | 'punch' | 'kick' | 'windup'
  | 'air' | 'land' | 'takeoff' | 'grab' | 'toss' | 'hurt' | 'faint' | 'cling';
export type PokemonFlight = 'none' | 'hover' | 'cruise' | 'sprint';
export const POKEMON_ORIGIN_X = 53;
export const POKEMON_ORIGIN_Y = 65;

interface Frame extends ReferenceFrame {
  white: Baked;
  artHeight: number;
}

const frames = new Map<string, Frame>();

function finishFrame(art: ReferenceFrame, scale: number): Frame {
  const frame = scale === 1 ? art : scalePokemonFrame(art, scale, scale, scale);
  const { sprite, originY } = frame;
  const top = sprite.runs.reduce((y, run) => Math.min(y, run.y), originY);
  const white = { ...sprite, runs: sprite.runs.map(run => ({ ...run, c: 0xfff8dc })) };
  return { ...frame, white, artHeight: originY - top };
}


export function pokemonFrame(
  species: PokemonSpecies, stage: number, pose: PokemonPose, frame: number, flying: boolean,
  flightFrame = frame, flight: PokemonFlight = flying ? 'hover' : 'none', flightBlend?: number,
): Frame {
  const form = pokemonStage(species, stage);
  const rank = Math.min(form.maxStage, Math.max(0, Math.floor(stage)));
  const phase = frame & 7;
  const airborne = form.flies && flying;
  const wingPhase = airborne ? flightFrame & 7 : phase;
  const glide = airborne ? Math.round(Math.max(0, Math.min(2, flightBlend ?? (flight === 'sprint' ? 2 : flight === 'cruise' ? 1 : 0))) * 8) / 8 : 0;
  const mode = airborne ? flight : 'none';
  const key = rank + ':' + pose + ':' + phase + ':' + wingPhase + ':' + mode + ':' + glide;
  const cached = frames.get(key);
  if (cached) return cached;
  const body = rank < 2
    ? bakeCharmanderRig(rank as 0 | 1, pose, phase)
    : bakeCharizardRig(rank as 2 | 3, pose, phase, mode, wingPhase, glide);
  const next = finishFrame(body, 1);
  frames.set(key, next);
  return next;
}
