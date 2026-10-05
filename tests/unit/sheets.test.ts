import { describe, expect, it } from 'vitest';
import { animFor, SHEET_ANIMS, sheetFrame, validateSheet, type ExternalSheetDef } from '../../src/art/externalSheets';
import { HERO_ART } from '../../src/art/heroArt';
import { HEROES } from '../../src/sim/data/heroes';
import { makeWorld, run } from './helpers';

function demoSheet(): ExternalSheetDef {
  const anims = Object.fromEntries(SHEET_ANIMS.map((a, i) => [a, { row: i, frames: 4, fps: 10 }])) as ExternalSheetDef['anims'];
  return { key: 'demo', url: 'sprites/demo.png', frameW: 32, frameH: 32, columns: 6, originX: 16, originY: 31, scale: 1, hitbox: { x: 11, y: 7, w: 10, h: 24 }, anims };
}

describe('external sprite sheets', () => {
  it('a complete low-res sheet validates', () => {
    expect(validateSheet(demoSheet(), 6 * 32, SHEET_ANIMS.length * 32)).toEqual([]);
  });

  it('rejects hi-res frames, missing animations and rows outside the image', () => {
    const d = demoSheet();
    d.frameH = 96;
    delete (d.anims as Partial<ExternalSheetDef['anims']>).kick;
    const problems = validateSheet(d, 6 * 32, 4 * 32).join(' | ');
    expect(problems).toContain('frameH 96');
    expect(problems).toContain("missing animation 'kick'");
    expect(problems).toContain('below the image');
  });

  it('maps fighter states to animations and frames', () => {
    const w = makeWorld();
    run(w, 3);
    const f = w.fighters[0];
    expect(animFor(f, w.time).anim).toBe('idle');
    f.state = 'melee';
    f.combo = 2;
    expect(animFor(f, w.time).anim).toBe('punch3');
    f.state = 'normal';
    f.power = 'hero';
    f.powerLevel = 1;
    expect(animFor(f, w.time).anim).toBe('poweredIdle');
    f.grounded = false;
    f.airJumpTime = w.time - 0.1;
    expect(animFor(f, w.time).anim).toBe('doubleJump');
    const d = demoSheet();
    expect(sheetFrame(d, 'run', 0, false)).toBe(d.anims.run.row * 6);
    expect(sheetFrame(d, 'run', 0.25, false)).toBe(d.anims.run.row * 6 + 2);
    expect(sheetFrame(d, 'run', 0.45, false)).toBe(d.anims.run.row * 6 + 0); // loops after 4 frames
  });
});

describe('hero looks', () => {
  it('every hero has procedural art at the standard pixel scale', () => {
    for (const id of Object.keys(HEROES)) {
      const a = HERO_ART[id];
      expect(a, id).toBeDefined();
      // parts drawn by the same modular baker as everyone else (no special sprite sizes)
      expect(typeof a.look.hair).toBe('string');
      expect(a.forms.length, id).toBe(4);
      expect(a.fx.length, id).toBe(a.forms.length);
    }
  });
});
