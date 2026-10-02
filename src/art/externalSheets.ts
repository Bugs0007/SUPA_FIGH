// External PNG sprite sheets for heroes (M9, optional). The procedural modular fighter is the default
// and the reference for pixel density; a sheet registered here replaces it for one hero, as long as
// the PNG loads (otherwise the game falls back to the procedural look). Format: docs/ASSETS.md.
//
// Rules: same logical pixel scale as the procedural fighters (~20–30 px tall), transparent
// background, no anti-aliasing, fixed frame size, one animation per row, feet at the origin.
// Collision is never taken from the sheet: the hitbox below is documentation for artists.

import type { Fighter } from '../sim/fighter';

/** Every animation a hero sheet must provide (row in the PNG + frame count + playback speed). */
export const SHEET_ANIMS = [
  'idle',
  'walk',
  'run',
  'jump',
  'doubleJump',
  'wallJump',
  'punch1',
  'punch2',
  'punch3',
  'kick',
  'grab',
  'throw',
  'hurt',
  'knockdown',
  'death',
  'pickup',
  'fire',
  'poweredIdle',
] as const;
export type SheetAnim = (typeof SHEET_ANIMS)[number];

export interface SheetAnimDef {
  row: number;
  frames: number;
  fps: number;
  /** default true; false = hold the last frame */
  loop?: boolean;
}

export interface ExternalSheetDef {
  /** Phaser texture key */
  key: string;
  /** path under public/ (served from the site root, works with base './') */
  url: string;
  frameW: number;
  frameH: number;
  /** frames per row in the PNG */
  columns: number;
  /** feet center inside a frame (px) */
  originX: number;
  originY: number;
  /** sheet px per logical game px: must stay 1 (integer scaling happens on the canvas) */
  scale: 1;
  /** where the 10x24 physics box sits in the frame (documentation only) */
  hitbox: { x: number; y: number; w: number; h: number };
  anims: Record<SheetAnim, SheetAnimDef>;
  /** optional overrides while fully transformed (e.g. yellow-haired rows) */
  powered?: Partial<Record<SheetAnim, SheetAnimDef>>;
}

/** hero id → sheet. Empty by default: every hero is procedural. */
export const EXTERNAL_SHEETS: Record<string, ExternalSheetDef> = {};

/** Problems with a sheet definition (empty = valid). Pure: unit tested. */
export function validateSheet(d: ExternalSheetDef, imageW?: number, imageH?: number): string[] {
  const out: string[] = [];
  if (d.scale !== 1) out.push('scale must be 1 (same pixel density as procedural fighters)');
  if (d.frameH < 20 || d.frameH > 48) out.push(`frameH ${d.frameH}: heroes are ~20-30 px tall, frames 20-48 px`);
  if (d.frameW < 16 || d.frameW > 48) out.push(`frameW ${d.frameW}: frames 16-48 px wide`);
  if (d.originX < 0 || d.originX > d.frameW || d.originY < 0 || d.originY > d.frameH) out.push('origin outside the frame');
  const rows = new Set<number>();
  const check = (name: string, a: SheetAnimDef | undefined) => {
    if (!a) {
      out.push(`missing animation '${name}'`);
      return;
    }
    if (a.frames < 1 || a.frames > d.columns) out.push(`'${name}': ${a.frames} frames (1..${d.columns})`);
    if (a.fps <= 0 || a.fps > 30) out.push(`'${name}': fps ${a.fps} (1..30)`);
    if (a.row < 0) out.push(`'${name}': negative row`);
    rows.add(a.row);
    if (imageW !== undefined && d.columns * d.frameW > imageW) out.push(`image is narrower than ${d.columns} columns`);
    if (imageH !== undefined && (a.row + 1) * d.frameH > imageH) out.push(`'${name}': row ${a.row} is below the image`);
  };
  for (const name of SHEET_ANIMS) check(name, d.anims[name]);
  for (const [name, a] of Object.entries(d.powered ?? {})) check('powered.' + name, a);
  return [...new Set(out)];
}

/** Which animation a fighter is in right now, and for how long (pure: unit tested). */
export function animFor(f: Fighter, simTime: number): { anim: SheetAnim; t: number } {
  const t = f.stateTime;
  switch (f.state) {
    case 'dead':
      return { anim: 'death', t };
    case 'knockdown':
    case 'roll':
    case 'dive':
      return { anim: 'knockdown', t };
    case 'flinch':
    case 'grabbed':
      return { anim: 'hurt', t };
    case 'grabbing':
      return { anim: 'grab', t };
    case 'melee':
      return { anim: f.combo === 0 ? 'punch1' : f.combo === 1 ? 'punch2' : 'punch3', t };
    case 'kick':
      return { anim: 'kick', t };
    case 'aim':
      return { anim: f.cook >= 0 || f.throwHold > 0 ? 'throw' : 'fire', t };
    case 'special':
      return { anim: f.specialKind === 'stretch' ? 'punch3' : 'fire', t };
    case 'climb':
    case 'ledge':
    case 'ledgeClimb':
      return { anim: 'jump', t };
    default:
      break;
  }
  if (!f.grounded) {
    if (simTime - f.airJumpTime < 0.32) return { anim: 'doubleJump', t: simTime - f.airJumpTime };
    if (f.wallLock > 0) return { anim: 'wallJump', t };
    return { anim: 'jump', t };
  }
  const speed = Math.abs(f.vx);
  if (speed > 100) return { anim: 'run', t: simTime };
  if (speed > 15) return { anim: 'walk', t: simTime };
  return { anim: f.power && f.powerFull ? 'poweredIdle' : 'idle', t: simTime };
}

/** Frame index in the sheet texture for an animation at time t. */
export function sheetFrame(d: ExternalSheetDef, anim: SheetAnim, t: number, powered: boolean): number {
  const a = (powered ? d.powered?.[anim] : undefined) ?? d.anims[anim];
  const i = Math.floor(Math.max(0, t) * a.fps);
  const k = a.loop === false ? Math.min(a.frames - 1, i) : i % a.frames;
  return a.row * d.columns + k;
}
