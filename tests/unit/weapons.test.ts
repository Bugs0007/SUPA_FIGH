import { describe, expect, it } from 'vitest';
import { AIR_KICK, FISTS, KICK, SLOT, WEAPONS, freshAmmo } from '../../src/sim/data/weapons';

describe('weapon data', () => {
  const all = Object.values(WEAPONS);

  it('ids match keys', () => {
    for (const [k, w] of Object.entries(WEAPONS)) expect(w.id).toBe(k);
  });

  it('every weapon has a valid slot and exactly one behavior', () => {
    for (const w of all) {
      expect(Object.values(SLOT)).toContain(w.slot);
      const kinds = [w.gun, w.melee, w.throw, w.gadget, w.powerup].filter(Boolean).length;
      expect(kinds, w.id).toBe(1);
    }
  });

  it('guns have sane stats', () => {
    for (const w of all) {
      const g = w.gun;
      if (!g) continue;
      expect(g.damage, w.id).toBeGreaterThan(0);
      expect(g.fireRate, w.id).toBeGreaterThan(0);
      expect(g.pellets, w.id).toBeGreaterThanOrEqual(1);
      expect(g.ammo, w.id).toBeGreaterThan(0);
      expect(g.range, w.id).toBeGreaterThan(50);
      expect(g.falloff, w.id).toBeGreaterThan(0);
      expect(g.falloff, w.id).toBeLessThanOrEqual(1);
      // bullets must not skip more than ~2 tiles per tick
      expect(g.bulletSpeed / 60, w.id).toBeLessThan(40);
      expect(w.muzzle, w.id).toBeDefined();
      expect(w.slot === SLOT.SIDEARM || w.slot === SLOT.HEAVY, w.id).toBe(true);
    }
  });

  it('no gun kills in one shot at point blank from full health (except by design)', () => {
    for (const w of all) {
      const g = w.gun;
      if (!g) continue;
      expect(g.damage * g.pellets, w.id).toBeLessThan(100);
    }
  });

  it('slots match behavior', () => {
    for (const w of all) {
      if (w.melee) expect(w.slot, w.id).toBe(SLOT.MELEE);
      if (w.throw) expect(w.slot, w.id).toBe(SLOT.THROWABLE);
      if (w.gadget || w.powerup) expect(w.slot, w.id).toBe(SLOT.GADGET);
    }
  });

  it('throwables and gadgets start with something to use', () => {
    for (const w of all) {
      if (w.throw || w.gadget) expect(freshAmmo(w), w.id).toBeGreaterThan(0);
      if (w.throw) {
        expect(w.throw.speed, w.id).toBeGreaterThan(0);
        // every throwable must do *something*
        expect(!!w.throw.explosion || !!w.throw.fire, w.id).toBe(true);
      }
    }
  });

  it('explosions have sane radii', () => {
    for (const w of all) {
      const ex = w.gun?.explosion ?? w.throw?.explosion;
      if (!ex) continue;
      expect(ex.radius, w.id).toBeGreaterThan(16);
      expect(ex.radius, w.id).toBeLessThan(120);
      expect(ex.breakRadius, w.id).toBeLessThanOrEqual(ex.radius);
    }
  });

  it('melee hits have positive timings', () => {
    const weaponHits = all.flatMap((w) => w.melee?.combo ?? []);
    for (const hit of [...FISTS.melee!.combo, KICK, AIR_KICK, ...weaponHits]) {
      expect(hit.windup).toBeGreaterThan(0);
      expect(hit.active).toBeGreaterThan(0);
      expect(hit.recover).toBeGreaterThan(0);
      expect(hit.damage).toBeGreaterThan(0);
    }
  });
});
