import { describe, expect, it } from 'vitest';
import { HEROES, SASUKE_ARROW, ULT_WINDUP, bombRange, bombSpeed } from '../../src/sim/data/heroes';

describe('ultimate wind-up and Naruto\'s ladder', () => {
  it('every gathered ultimate takes the same, fair-to-counter time; Luffy has none', () => {
    expect(ULT_WINDUP).toBeGreaterThanOrEqual(2);
    expect(ULT_WINDUP).toBeLessThanOrEqual(3);
    for (const id of ['sasuke', 'naruto', 'goku']) expect(HEROES[id].super.bomb!.windup, id).toBe(ULT_WINDUP);
    expect(HEROES.luffy.super.bomb).toBeUndefined();
  });

  it('Naruto\'s ultimate gets faster and longer ranged with every form, ending at Sasuke\'s final arrow', () => {
    const n = HEROES.naruto.super.bomb!;
    const s = HEROES.sasuke.super.bomb!;
    const speeds = [1, 2, 3, 4].map((l) => bombSpeed('naruto', n, l));
    const ranges = [1, 2, 3, 4].map((l) => bombRange('naruto', n, l));
    for (let i = 1; i < 4; i++) {
      expect(speeds[i]).toBeGreaterThan(speeds[i - 1]);
      expect(ranges[i]).toBeGreaterThan(ranges[i - 1]);
    }
    expect(speeds[3]).toBeCloseTo(bombSpeed('sasuke', s, 4), 0);
    expect(ranges[3]).toBe(SASUKE_ARROW.lockRange);
    expect(bombRange('sasuke', s, 4)).toBe(SASUKE_ARROW.lockRange);
  });
});
