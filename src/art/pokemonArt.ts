import { pokemonStage, type PokemonSpecies } from '../sim/data/pokemon';
import type { Baked } from './pixelRaster';
import { bakeCharmanderRig } from './charmanderRig';
import { bakeCharizardRig } from './charizardRig';
import { bakeTurtleRig } from './turtleRig';
import { bakePlantRig } from './plantRig';
import { bakeFrogRig } from './frogRig';
import { bakeGeckoRig } from './geckoRig';
import { bakeElectricRig } from './electricRig';
import { bakeAuraRig } from './auraRig';
import { bakeSharkRig } from './sharkRig';
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
  const key = species + ':' + rank + ':' + pose + ':' + phase + ':' + wingPhase + ':' + mode + ':' + glide;
  const cached = frames.get(key);
  if (cached) return cached;
  let art: ReferenceFrame;
  switch (species) {
    case 'charmander':
      art = rank < 2 ? bakeCharmanderRig(rank as 0 | 1, pose, phase)
        : bakeCharizardRig(rank as 2 | 3, pose, phase, mode, wingPhase, glide);
      break;
    case 'squirtle': art = bakeTurtleRig(rank, pose, phase); break;
    case 'bulbasaur': art = bakePlantRig(rank, pose, phase); break;
    case 'froakie': art = bakeFrogRig(rank, pose, phase); break;
    case 'treecko': art = bakeGeckoRig(rank, pose, phase); break;
    case 'pikachu': art = bakeElectricRig(rank, pose, phase); break;
    case 'riolu': art = bakeAuraRig(rank, pose, phase); break;
    case 'gible': art = bakeSharkRig(rank, pose, phase, mode, wingPhase, glide); break;
  }
  const next = finishFrame(art, 1);
  frames.set(key, next);
  return next;
}
