import { describe, expect, it } from 'vitest';
import { dragonFlame } from '../../src/art/charizardMotion';
import { pokemonFrame } from '../../src/art/pokemonArt';

describe('Charizard sprite rig', () => {
  it.each([2, 3])('keeps both feet planted throughout stage %i idle', stage => {
    for (let phase = 0; phase < 8; phase++) {
      const { sprite, originX, originY } = pokemonFrame('charmander', stage, 'idle', phase, false);
      const floor = sprite.runs.filter(run => run.y === originY - 1);
      expect(floor.some(run => run.x < originX)).toBe(true);
      expect(floor.some(run => run.x > originX)).toBe(true);
      expect(sprite.runs.every(run => run.y < originY)).toBe(true);
    }
  });

  it('gives Mega Charizard a taller and wider grounded silhouette', () => {
    const bounds = (stage: number) => {
      const { sprite, originY } = pokemonFrame('charmander', stage, 'idle', 0, false);
      const left = Math.min(...sprite.runs.map(run => run.x));
      const right = Math.max(...sprite.runs.map(run => run.x + run.w));
      return { width: right - left, height: originY - Math.min(...sprite.runs.map(run => run.y)) };
    };
    expect(bounds(3).width).toBeGreaterThan(bounds(2).width);
    expect(bounds(3).height).toBeGreaterThan(bounds(2).height);
  });

  it('moves the wings independently of a firing pose and animates both flame colors', () => {
    const raised = pokemonFrame('charmander', 3, 'cast', 3, true, 0);
    const lowered = pokemonFrame('charmander', 3, 'cast', 3, true, 4);
    expect(raised.sprite.runs).not.toEqual(lowered.sprite.runs);
    expect(raised.saddle).toEqual(lowered.saddle);
    expect(dragonFlame(7, 0, false).runs).not.toEqual(dragonFlame(7, 4, false).runs);
    expect(dragonFlame(12, 0, true).runs).not.toEqual(dragonFlame(12, 4, true).runs);
  });
});
