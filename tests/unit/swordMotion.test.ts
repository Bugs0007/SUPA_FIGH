import { describe, expect, it } from 'vitest';
import { BF } from '../../src/art/fighterArt';
import { swordPose, swordSwing } from '../../src/render/SwordMotion';
import { HEROES } from '../../src/sim/data/heroes';
import { createFighter } from '../../src/sim/fighter';

function yamiLink(combo: number) {
  const fighter = createFighter(0, { hero: 'yami', name: 'Yami', team: 0, isBot: false, upJumps: false }, 0, 0);
  fighter.combo = combo;
  const hit = HEROES.yami.combo![combo];
  const swing = swordSwing(fighter, hit, 'fists')!;
  return { hit, at: (time: number) => swordPose(swing, time, true) };
}

describe('waist-level sword combo', () => {
  it('exposes steel toward the sheath before extending it into the cut', () => {
    const { at, hit } = yamiLink(0);
    expect(at(0).front.visible).toBe(false);
    const draw = at(hit.windup * 0.53);
    expect(draw.front.visible).toBe(true);
    expect(draw.front.x).toBeGreaterThan(draw.sheath!.x);
    expect(Math.cos(draw.front.angle)).toBeLessThan(-0.9);
    const contact = at(hit.windup);
    expect(contact.frame).toBe(BF.SWORD_SWEEP);
    expect(Math.cos(contact.front.angle + contact.tilt)).toBeGreaterThan(0.98);
    expect(contact.front.projection).toBeGreaterThan(0.95);
  });

  it('carries the reverse cut across the waist into a braced finish', () => {
    const { at, hit } = yamiLink(1);
    const contact = at(hit.windup);
    const finish = at(hit.windup + hit.active);
    expect(contact.front.x).toBeGreaterThan(10);
    expect(finish.front.x).toBeLessThan(0);
    expect(Math.cos(finish.front.angle + finish.tilt)).toBeLessThan(-0.9);
    expect(Math.abs(finish.front.y - contact.front.y)).toBeLessThan(2);
    expect(finish.frame).toBe(BF.SWORD_WRAP);
    expect(finish.plant).toBe(contact.plant);
  });
});
