import type Phaser from 'phaser';
import type { Pt } from '../art/pixelRaster';
import { pokemonAttack, pokemonMelee } from '../sim/data/pokemonAttacks';
import type { PokemonSpecies, PokemonState } from '../sim/data/pokemon';
import type { Fighter } from '../sim/fighter';
import type { Bullet } from '../sim/projectile';

type Graphics = Phaser.GameObjects.Graphics;
type Palette = readonly [shadow: number, color: number, light: number, core: number];
const FIRE: Palette = [0x8f302e, 0xf6652d, 0xffbc48, 0xfff2bc];
const BLUE_FIRE: Palette = [0x182b70, 0x286bc6, 0x45cfff, 0xd0ffff];
const WATER: Palette = [0x244b81, 0x298dc2, 0x73d8f1, 0xe1fbff];
const LEAF: Palette = [0x265b4b, 0x5b9d44, 0xc2e363, 0xf2ffbb];
const ELECTRIC: Palette = [0x9b6630, 0xf9be2e, 0xffeb6e, 0xffffe0];
const AURA: Palette = [0x233b75, 0x4387d4, 0x76dbf3, 0xe0fdff];
const DRAGON: Palette = [0x323264, 0x6865bc, 0x9ed9f2, 0xf2f3ff];
const INK = 0x161e31;
const TAU = Math.PI * 2;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const point = (a: Pt, b: Pt, t: number): Pt => [mix(a[0], b[0], t), mix(a[1], b[1], t)];

function palette(species: PokemonSpecies, stage: number): Palette {
  switch (species) {
    case 'charmander': return stage === 3 ? BLUE_FIRE : FIRE;
    case 'bulbasaur': case 'treecko': return LEAF;
    case 'pikachu': return ELECTRIC;
    case 'riolu': return AURA;
    case 'gible': return DRAGON;
    default: return WATER;
  }
}

function pixel(g: Graphics, x: number, y: number, color: number, alpha = 1, size = 1): void {
  g.fillStyle(color, alpha).fillRect(Math.round(x - size / 2), Math.round(y - size / 2), size, size);
}

function segment(g: Graphics, a: Pt, b: Pt, width: number, color: number, alpha = 1): void {
  g.lineStyle(width, color, alpha).lineBetween(Math.round(a[0]), Math.round(a[1]), Math.round(b[0]), Math.round(b[1]));
}

function ray(a: Pt, b: Pt): { dx: number; dy: number; length: number } {
  const length = Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1]));
  return { dx: (b[0] - a[0]) / length, dy: (b[1] - a[1]) / length, length };
}

function flecks(g: Graphics, center: Pt, age: number, radius: number, colors: Palette, count = 10, stretch = 1): void {
  const t = clamp(age);
  for (let i = 0; i < count; i++) {
    const angle = i * 2.399963 + 0.21;
    const distance = radius * (0.34 + i % 4 * 0.19) * (0.2 + t);
    const x = center[0] + Math.cos(angle) * distance;
    const y = center[1] + Math.sin(angle) * distance * stretch + t * t * 5;
    const trail: Pt = [x - Math.cos(angle) * (2 + t * 4), y - Math.sin(angle) * (2 + t * 4) * stretch];
    segment(g, trail, [x, y], i % 3 === 0 ? 2 : 1, colors[1 + i % 3], (1 - t) * 0.95);
  }
}

function zigzag(g: Graphics, start: Pt, end: Pt, phase: number, width: number, colors: Palette, alpha = 1): void {
  const { dx, dy, length } = ray(start, end);
  const steps = Math.max(3, Math.ceil(length / 11));
  let previous = start;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const jag = i === steps ? 0 : Math.sin(i * 7.3 + phase * 2.8) * (3 + width);
    const next: Pt = [mix(start[0], end[0], t) - dy * jag, mix(start[1], end[1], t) + dx * jag];
    segment(g, previous, next, width + 2, colors[1], alpha * 0.56);
    segment(g, previous, next, width, colors[3], alpha);
    if (i % 3 === 1 && i < steps) {
      const branch: Pt = [next[0] + dx * 5 - dy * 9, next[1] + dy * 5 + dx * 9];
      segment(g, next, branch, 1, colors[2], alpha * 0.7);
    }
    previous = next;
  }
}

function leaf(g: Graphics, at: Pt, angle: number, size: number, colors: Palette, alpha = 1): void {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const tip: Pt = [at[0] + dx * size, at[1] + dy * size];
  const back: Pt = [at[0] - dx * size * 0.75, at[1] - dy * size * 0.75];
  g.fillStyle(colors[1], alpha).fillTriangle(tip[0], tip[1], back[0], back[1], at[0] - dy * size * 0.5, at[1] + dx * size * 0.5);
  g.fillStyle(colors[2], alpha).fillTriangle(tip[0], tip[1], back[0], back[1], at[0] + dy * size * 0.5, at[1] - dx * size * 0.5);
  segment(g, back, tip, 1, colors[3], alpha * 0.8);
}

function crescent(g: Graphics, center: Pt, radius: number, start: number, sweep: number, colors: Palette, alpha: number, thickness = 3): void {
  for (let i = 0; i < 12; i++) {
    const a = start + sweep * i / 12;
    const b = start + sweep * (i + 1) / 12;
    const t = Math.sin((i + 1) / 13 * Math.PI);
    const near: Pt = [center[0] + Math.cos(a) * radius, center[1] + Math.sin(a) * radius * 0.68];
    const far: Pt = [center[0] + Math.cos(b) * radius, center[1] + Math.sin(b) * radius * 0.68];
    segment(g, near, far, thickness * t + 1, colors[1], alpha * 0.76);
    segment(g, near, far, 1, colors[3], alpha * t);
  }
}

function charge(g: Graphics, at: Pt, amount: number, colors: Palette, time: number, large: boolean): void {
  const radius = (large ? 10 : 5) * amount;
  for (let i = 0; i < 6; i++) {
    const angle = i * TAU / 6 + time * 4;
    const distance = 3 + radius + (1 - amount) * 10;
    const start: Pt = [at[0] + Math.cos(angle) * distance, at[1] + Math.sin(angle) * distance * 0.68];
    const end: Pt = [at[0] + Math.cos(angle) * radius * 0.55, at[1] + Math.sin(angle) * radius * 0.4];
    segment(g, start, end, i % 2 ? 1 : 2, colors[i % 2 ? 2 : 1], amount * 0.75);
  }
  g.fillStyle(colors[0], 0.88).fillCircle(Math.round(at[0]), Math.round(at[1]), 1 + radius * 0.63);
  g.fillStyle(colors[2], 0.94).fillCircle(Math.round(at[0]), Math.round(at[1]), 1 + radius * 0.42);
  pixel(g, at[0] - 1, at[1] - 1, colors[3], 1, 1 + Math.floor(amount * 2));
}

function flameJet(g: Graphics, start: Pt, end: Pt, width: number, time: number, colors: Palette, alpha = 1): void {
  const { dx, dy, length } = ray(start, end);
  const steps = Math.max(7, Math.ceil(length / 7));
  const ribbon = (scale: number, color: number, opacity: number) => {
    const top: { x: number; y: number }[] = [], bottom: { x: number; y: number }[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const center = Math.sin(t * 8 - time * 19) * width * t * 0.18;
      const half = Math.max(0.6, width * (0.15 + t * 0.85) * scale
        * (0.82 + Math.sin(i * 2.3 - time * 25) * 0.18));
      const along = length * t;
      top.push({ x: Math.round(start[0] + dx * along - dy * (center - half)), y: Math.round(start[1] + dy * along + dx * (center - half)) });
      bottom.push({ x: Math.round(start[0] + dx * along - dy * (center + half)), y: Math.round(start[1] + dy * along + dx * (center + half)) });
    }
    g.fillStyle(color, opacity).fillPoints([...top, ...bottom.reverse()], true);
  };
  ribbon(1, colors[0], alpha * 0.93);
  ribbon(0.78, colors[1], alpha);
  ribbon(0.4, colors[2], alpha * 0.96);
  for (let i = 0; i < 4; i++) {
    const t = (time * 3.6 + i / 4) % 1;
    const at = point(start, end, t);
    const side = Math.sin(t * 8 - time * 19) * width * t * 0.18;
    const a: Pt = [at[0] - dy * side, at[1] + dx * side];
    const advance = Math.min(length * (1 - t), 5 + t * 8);
    segment(g, a, [a[0] + dx * advance, a[1] + dy * advance], 1 + t * width * 0.12, colors[3], alpha * (0.85 - t * 0.3));
  }
  for (let i = 0; i < 8; i++) {
    const t = (time * 2.4 + i / 8) % 1;
    const side = Math.sin(i * 2.7) * width * (0.6 + t);
    pixel(g, mix(start[0], end[0], t) - dy * side, mix(start[1], end[1], t) + dx * side - t * 3,
      colors[i % 2 ? 1 : 2], (1 - t) * alpha, i % 3 === 0 ? 2 : 1);
  }
}

function waterJet(g: Graphics, start: Pt, end: Pt, width: number, time: number, alpha = 1): void {
  const { dx, dy, length } = ray(start, end);
  segment(g, start, end, width * 1.7, WATER[0], alpha * 0.75);
  segment(g, start, end, width, WATER[1], alpha * 0.96);
  segment(g, start, end, Math.max(1, width * 0.36), WATER[3], alpha);
  const rings = Math.max(3, Math.floor(length / 16));
  for (let i = 0; i < rings; i++) {
    const t = (time * 2.6 + i / rings) % 1;
    const at = point(start, end, t);
    const radius = width * (0.8 + t * 0.6);
    const left: Pt = [at[0] - dy * radius, at[1] + dx * radius];
    const right: Pt = [at[0] + dy * radius, at[1] - dx * radius];
    segment(g, [left[0] - dx * 2, left[1] - dy * 2], right, 1, WATER[2], alpha * 0.75);
  }
  flecks(g, end, (time * 4) % 1, width * 2.2, WATER, 10);
}

function beam(g: Graphics, start: Pt, end: Pt, width: number, colors: Palette, time: number): void {
  const { dx, dy, length } = ray(start, end);
  segment(g, start, end, width * 2.2, colors[0], 0.46);
  segment(g, start, end, width * 1.25, colors[1], 0.94);
  segment(g, start, end, Math.max(1, width * 0.6), colors[2], 1);
  segment(g, start, end, Math.max(1, width * 0.22), colors[3], 1);
  for (let i = 0; i < 8; i++) {
    const t = (time * 2 + i / 8) % 1;
    const at = point(start, end, t);
    const offset = (i % 2 ? -1 : 1) * width * (1.3 + Math.sin(t * Math.PI));
    const a: Pt = [at[0] - dy * offset, at[1] + dx * offset];
    const b: Pt = [a[0] + dx * Math.min(11, length * 0.07), a[1] + dy * Math.min(11, length * 0.07)];
    segment(g, a, b, 1, colors[2], 1 - t);
  }
}

function warning(g: Graphics, center: Pt, radius: number, progress: number, colors: Palette): void {
  const width = radius * (1.2 - progress * 0.2);
  g.lineStyle(1, colors[1], 0.3 + progress * 0.45).strokeEllipse(center[0], center[1], width * 2, 5);
  for (const side of [-1, 1]) {
    const x = center[0] + side * (width + 3);
    segment(g, [x, center[1] - 2], [x + side * 5, center[1] - 2], 1, colors[2], 0.75);
  }
  pixel(g, center[0], center[1], colors[3], 0.7, 2);
}

function eruption(g: Graphics, center: Pt, progress: number, radius: number, colors: Palette): void {
  const intensity = Math.sin(Math.min(0.99, progress) * Math.PI);
  const rise = Math.sin(Math.min(1, progress * 1.5) * Math.PI * 0.7);
  for (let i = -3; i <= 3; i++) {
    const x = center[0] + i * radius * 0.26;
    const h = (18 + (3 - Math.abs(i)) * 8) * rise;
    const half = 3 + (3 - Math.abs(i)) * 0.6;
    g.fillStyle(colors[0], intensity * 0.86).fillTriangle(x - half - 2, center[1], x + half + 2, center[1], x + i * 2, center[1] - h);
    g.fillStyle(colors[1], intensity).fillTriangle(x - half, center[1], x + half, center[1], x + i, center[1] - h * 0.85);
    g.fillStyle(colors[3], intensity * 0.9).fillTriangle(x - 1, center[1], x + 1, center[1], x, center[1] - h * 0.57);
  }
  g.lineStyle(2, colors[2], (1 - progress) * 0.95).strokeEllipse(center[0], center[1] + 1, radius * (1 + progress) * 2, 4 + progress * 9);
}

function rootBurst(g: Graphics, center: Pt, progress: number, radius: number): void {
  const rise = Math.sin(Math.min(1, progress * 1.5) * Math.PI * 0.8);
  const fade = Math.min(1, (1 - progress) * 3);
  for (let i = -3; i <= 3; i++) {
    const root: Pt = [center[0] + i * radius * 0.28, center[1]];
    const elbow: Pt = [root[0] + (i % 2 ? -1 : 1) * 7, root[1] - (13 + Math.abs(i) * 3) * rise];
    const tip: Pt = [root[0] - i * 3, root[1] - (32 - Math.abs(i) * 4) * rise];
    segment(g, root, elbow, 7, LEAF[0], fade);
    segment(g, elbow, tip, 5, LEAF[0], fade);
    segment(g, [root[0] - 1, root[1]], [elbow[0] - 1, elbow[1]], 3, LEAF[1], fade);
    segment(g, elbow, tip, 2, LEAF[2], fade);
    leaf(g, tip, -1.7 + i * 0.2, 5, LEAF, fade);
    pixel(g, root[0] + 4, root[1] - progress * 13, 0x8a7354, fade, 2);
  }
}

function surf(g: Graphics, center: Pt, progress: number, radius: number, facing: number): void {
  const fade = Math.min(1, (1 - progress) * 3);
  const height = Math.sin(progress * Math.PI) * 32;
  for (let i = 0; i < 9; i++) {
    const along = (i / 8 - 0.5) * radius * 2;
    const x = center[0] + along;
    const crestY = center[1] - height * (0.5 + Math.sin(i * 0.55) * 0.4);
    segment(g, [x, center[1]], [x, crestY], radius * 0.28, WATER[0], fade * 0.9);
    segment(g, [x + facing * 2, center[1]], [x + facing * 2, crestY + 2], radius * 0.21, WATER[1], fade);
    segment(g, [x - facing * 3, crestY - 2], [x + facing * 5, crestY + 1], 3, WATER[2], fade);
    pixel(g, x - facing * 4, crestY - 4, WATER[3], fade, 2);
  }
}

function melee(g: Graphics, f: Fighter, p: PokemonState, x: number, y: number): boolean {
  const strike = p.move === 'punch' || p.move === 'kick';
  if (!strike || !p.fired) return false;
  const colors = palette(p.species, p.stage);
  const combo = p.move === 'kick' ? 2 : Math.max(0, Math.min(2, f.combo));
  const profile = pokemonMelee(p.species, p.stage, combo === 2);
  const pulseAge = p.age - Math.max(0, p.shots - 1) * profile.interval;
  const progress = clamp(pulseAge / Math.max(0.1, profile.recovery));
  const fade = (1 - progress) ** 1.4;
  const d = f.facing;
  const chest: Pt = [x + d * f.w * 0.35, y - f.h * (combo === 2 ? 0.42 : 0.6)];
  const radius = f.w * 0.5 + (combo === 2 ? 19 : 12);
  const start = d > 0 ? -1.6 + combo * 0.2 : -1.55 - combo * 0.2;
  if (p.species === 'bulbasaur') {
    for (let i = 0; i < (combo === 2 ? 3 : 2); i++) {
      const root: Pt = [x - d * f.w * 0.2, y - f.h * 0.63];
      const tip: Pt = [chest[0] + d * radius * (0.8 + i * 0.1), chest[1] + (i - 1) * 5];
      const bend: Pt = [mix(root[0], tip[0], 0.52), root[1] - 10 + progress * 20];
      segment(g, root, bend, 3, LEAF[0], fade);
      segment(g, bend, tip, 2, LEAF[1], fade);
      segment(g, bend, tip, 1, LEAF[2], fade * 0.9);
    }
  } else if (p.species === 'treecko' || p.species === 'charmander' || p.species === 'gible') {
    const count = p.species === 'treecko' ? 1 : combo === 2 ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const center: Pt = [chest[0] + d * (i * 3 - 4), chest[1] + (i - (count - 1) / 2) * 3];
      const angle = start + (combo === 1 ? 1.3 : 0) + progress * d * 0.7;
      crescent(g, center, radius - i * 2, angle, d * (combo === 1 ? -2.3 : 2.2), colors, fade, combo === 2 ? 4 : 2);
    }
    if (p.species === 'treecko') leaf(g, [chest[0] + d * radius * 0.6, chest[1] - 1], d > 0 ? -0.5 : 3.6, 6, LEAF, fade);
  } else if (p.species === 'pikachu') {
    const tip: Pt = [chest[0] + d * radius, chest[1] + (combo === 1 ? -4 : 2)];
    segment(g, [x - d * 5, chest[1] + 2], tip, combo === 2 ? 4 : 2, ELECTRIC[1], fade * 0.55);
    zigzag(g, chest, tip, Math.floor(p.age * 40), 1, ELECTRIC, fade);
    crescent(g, chest, radius, start, d * 2.2, ELECTRIC, fade, 2);
  } else if (p.species === 'riolu') {
    const tip: Pt = [chest[0] + d * radius * 0.75, chest[1]];
    segment(g, [x - d * 4, chest[1]], tip, combo === 2 ? 5 : 3, AURA[1], fade * 0.65);
    segment(g, chest, tip, 1, AURA[3], fade);
    g.lineStyle(1, AURA[2], fade).strokeEllipse(tip[0], tip[1], 4 + progress * 20, 4 + progress * 15);
    flecks(g, tip, progress, combo === 2 ? 20 : 12, AURA, 7);
  } else {
    crescent(g, chest, radius, start, d * 2.4, WATER, fade, combo === 2 ? 4 : 2);
    const tip: Pt = [chest[0] + d * radius * 0.8, chest[1]];
    flecks(g, tip, progress, combo === 2 ? 19 : 11, WATER, p.species === 'froakie' ? 7 : 11);
  }
  if (combo === 2) flecks(g, [chest[0] + d * radius * 0.8, chest[1]], progress, 19, colors, 10);
  return true;
}

/** Move choreography is tied to the same anticipation, pulse and recovery timing as damage. */
export function drawPokemonAttack(
  g: Graphics, f: Fighter, p: PokemonState, x: number, y: number, muzzle: Pt | undefined, time: number,
  target?: Pick<Fighter, 'h'>,
): boolean {
  if (melee(g, f, p, x, y)) return true;
  if (p.move !== 'shot' && p.move !== 'ultimate') return false;
  if (p.species === 'charmander' && p.stage === 2 && p.move === 'ultimate') return false;
  const profile = pokemonAttack(p.species, p.stage, p.move === 'ultimate' ? 'ultimate' : 'shot');
  const colors = p.species === 'treecko' && p.stage === 3 && p.move === 'shot' ? DRAGON : palette(p.species, p.stage);
  const origin: Pt = muzzle ?? [x + f.facing * (f.w / 2 + 3), y - f.h * 0.57];
  const aim: Pt = [p.goalX, p.goalY];
  const elapsed = p.age - profile.windup;
  const charging = clamp(p.age / Math.max(0.01, profile.windup));
  const ground: Pt = [aim[0], aim[1] + (target?.h ?? 26) / 2];
  const marked = profile.kind === 'ground' || profile.kind === 'thunder' || profile.kind === 'meteor';
  if (elapsed < 0) {
    charge(g, origin, charging, colors, time, p.move === 'ultimate');
    if (marked) warning(g, ground, profile.radius ?? profile.size * 2.5, charging, colors);
    if (profile.kind === 'shuriken') {
      shuriken(g, origin, 3 + charging * profile.size, time * 9, charging);
    } else if (profile.kind === 'beam' && p.species === 'bulbasaur') {
      for (let i = 0; i < 5; i++) {
        const angle = i * TAU / 5 + time * 2;
        const a: Pt = [origin[0] + Math.cos(angle) * (7 + charging * 11), origin[1] + Math.sin(angle) * (5 + charging * 6)];
        leaf(g, a, angle - 0.8, 2 + charging * 2, colors, charging * 0.8);
      }
    }
    return true;
  }
  const active = elapsed <= profile.active + 0.015;
  const recovery = clamp((elapsed - profile.active) / Math.max(0.01, profile.recovery));
  if (!active && !(profile.kind === 'ground' && elapsed < profile.active + 0.24)) {
    const age = clamp(recovery * 1.3);
    flecks(g, origin, age, 7, colors, 5);
    if (profile.kind === 'stream') {
      for (let i = 0; i < 4; i++) {
        const t = (time * 2.3 + i / 4) % 1;
        pixel(g, origin[0] - f.facing * t * 3, origin[1] - 3 - t * 8, colors[2], (1 - recovery) * (1 - t) * 0.5);
      }
    }
    return true;
  }
  const grow = clamp(elapsed / 0.065);
  const progress = clamp(elapsed / Math.max(0.01, profile.active));
  const end = point(origin, aim, grow);
  const width = Math.max(2, profile.width ?? profile.size * 0.7);
  switch (profile.kind) {
    case 'stream':
      if (p.species === 'squirtle' && p.stage === 2) {
        const second: Pt = [origin[0] - f.facing * 7, origin[1] - 5];
        waterJet(g, second, end, width * 0.7, time - 0.04, 0.88);
        waterJet(g, origin, end, width * 0.85, time);
      } else if (p.species === 'squirtle' || p.species === 'froakie') waterJet(g, origin, end, width, time);
      else flameJet(g, origin, end, width, time, colors);
      break;
    case 'beam':
      if (p.species === 'squirtle') {
        waterJet(g, origin, end, width, time);
        const second: Pt = [origin[0] - f.facing * 9, origin[1] - 5];
        waterJet(g, second, end, width * 0.5, time - 0.03, 0.8);
        for (let i = 0; i < 3; i++) {
          const pulse = (elapsed * 5 + i / 3) % 1;
          const at = point(origin, end, pulse);
          g.lineStyle(1, WATER[3], (1 - pulse) * 0.7).strokeEllipse(at[0], at[1], width * (0.5 + pulse), width * (2 + pulse));
        }
      } else beam(g, origin, end, width, colors, time);
      g.lineStyle(1, colors[3], 0.9).strokeEllipse(origin[0], origin[1], 5 + width * 2, 6 + width * 2);
      break;
    case 'chain':
      zigzag(g, origin, aim, Math.floor(time * 28), 2, colors);
      flecks(g, aim, (elapsed * 7) % 1, 12, colors, 8);
      break;
    case 'palm': {
      if (p.species === 'treecko') {
        for (let i = 0; i < 4; i++) {
          const bend: Pt = [mix(origin[0], aim[0], 0.5), mix(origin[1], aim[1], 0.5) + Math.sin(elapsed * 25 + i) * 8];
          segment(g, origin, bend, 2, LEAF[0], 0.9);
          segment(g, bend, aim, 1, LEAF[2], 0.95);
          const energy = point(aim, origin, (elapsed * 5 + i / 4) % 1);
          pixel(g, energy[0], energy[1], LEAF[3], 1, 2);
        }
        break;
      }
      if (p.species === 'squirtle') {
        crescent(g, origin, Math.min(profile.range, 24 + progress * 35), f.facing > 0 ? -1.3 : 1.9,
          f.facing * 2.5, WATER, 1 - progress * 0.5, 5);
        break;
      }
      const { dx, dy } = ray(origin, aim);
      const at = point(origin, aim, progress);
      g.lineStyle(2, colors[1], 1 - progress * 0.4).strokeEllipse(at[0], at[1], width * (0.5 + progress), width * 2.5);
      segment(g, origin, aim, 1, colors[3], 1 - progress);
      for (let i = 0; i < 6; i++) {
        const side = (i - 2.5) * width * 0.37;
        const a: Pt = [origin[0] - dy * side, origin[1] + dx * side];
        const b: Pt = [aim[0] - dy * side, aim[1] + dx * side];
        segment(g, a, b, 1, colors[i % 2 ? 1 : 2], (1 - progress) * 0.7);
      }
      break;
    }
    case 'thunder': {
      const strike: Pt = [aim[0], aim[1] - 104];
      zigzag(g, strike, ground, Math.floor(time * 34), p.move === 'ultimate' ? 3 : 2, colors);
      g.lineStyle(1, colors[2], 1 - progress).strokeEllipse(ground[0], ground[1], 12 + progress * 50, 3 + progress * 7);
      break;
    }
    case 'ground': {
      const radius = profile.radius ?? 38;
      const dx = Math.max(-profile.range, Math.min(profile.range, ground[0] - x));
      for (let i = 0; i < profile.pulses; i++) {
        const age = elapsed - i * profile.interval;
        if (age < 0 || age > 0.24) continue;
        const t = (i + 1) / profile.pulses;
        const wave = clamp(age / 0.24);
        const center: Pt = [x + dx * t, mix(y, ground[1], t)];
        if (p.species === 'treecko') rootBurst(g, center, wave, radius);
        else if (p.species === 'froakie') surf(g, center, wave, radius, f.facing);
        else eruption(g, center, wave, radius, colors);
        for (const side of [-1, 1]) {
          segment(g, [center[0], center[1] + 1], [center[0] + side * radius * (0.4 + wave), center[1] + 1], 2, colors[1], 1 - wave);
        }
      }
      break;
    }
    case 'meteor':
      warning(g, ground, profile.radius ?? 27, 1 - progress * 0.5, colors);
      break;
    default: {
      const sincePulse = profile.pulses > 1 ? elapsed % Math.max(0.025, profile.interval) : elapsed;
      const flash = clamp(1 - sincePulse / 0.11);
      if (flash > 0) {
        const tip: Pt = [origin[0] + f.facing * (4 + profile.size), origin[1]];
        segment(g, origin, tip, Math.max(2, profile.size * 0.55), colors[1], flash);
        pixel(g, origin[0], origin[1], colors[3], flash, 2 + Math.floor(flash * 3));
      }
      break;
    }
  }
  return true;
}

function projectileTrail(g: Graphics, at: Pt, b: Bullet, time: number, colors: Palette, length: number): Pt {
  const speed = Math.max(1, Math.hypot(b.vx, b.vy));
  const dx = b.vx / speed, dy = b.vy / speed;
  const distance = Math.min(b.traveled, length);
  const tail: Pt = [at[0] - dx * distance, at[1] - dy * distance];
  for (let i = 0; i < 5; i++) {
    const t = (time * 7 + i / 5) % 1;
    const side = Math.sin(i * 2.6) * b.size * t;
    pixel(g, mix(at[0], tail[0], t) - dy * side, mix(at[1], tail[1], t) + dx * side, colors[1 + i % 2], (1 - t) * 0.65, i % 2 ? 1 : 2);
  }
  return tail;
}

function shuriken(g: Graphics, at: Pt, radius: number, angle: number, alpha = 1): void {
  for (let i = 0; i < 4; i++) {
    const a = angle + i * TAU / 4;
    const tip: Pt = [at[0] + Math.cos(a) * radius, at[1] + Math.sin(a) * radius];
    const back: Pt = [at[0] + Math.cos(a - 1.15) * radius * 0.46, at[1] + Math.sin(a - 1.15) * radius * 0.46];
    g.fillStyle(WATER[0], alpha).fillTriangle(at[0], at[1], tip[0], tip[1], back[0], back[1]);
    g.fillStyle(WATER[2], alpha).fillTriangle(at[0], at[1], tip[0], tip[1],
      mix(at[0], back[0], 0.6), mix(at[1], back[1], 0.6));
    segment(g, tip, back, 1, WATER[3], alpha);
  }
  pixel(g, at[0], at[1], WATER[3], alpha, Math.max(2, Math.floor(radius * 0.3)));
}

/** Source tags survive reflection, so a redirected shot retains its Pokémon's design. */
export function drawPokemonProjectile(g: Graphics, b: Bullet, x: number, y: number, time: number): boolean {
  if (!b.pokemon) return false;
  const profile = pokemonAttack(b.pokemon, b.form, b.tier === 2 ? 'ultimate' : 'shot');
  const colors = b.pokemon === 'treecko' && b.form === 3 && profile.kind === 'bolt' ? DRAGON : palette(b.pokemon, b.form);
  const at: Pt = [x, y];
  const speed = Math.max(1, Math.hypot(b.vx, b.vy));
  const dx = b.vx / speed, dy = b.vy / speed;
  const angle = Math.atan2(dy, dx);
  const radius = Math.max(2, b.size);
  const tail = projectileTrail(g, at, b, time, colors, 14 + radius * 4);
  if (profile.kind === 'shuriken') {
    shuriken(g, tail, radius * 0.82, time * 24 - 0.8, 0.25);
    shuriken(g, at, radius * 1.4, time * 24);
    return true;
  }
  if (profile.kind === 'spiral') {
    for (let i = 15; i >= 0; i--) {
      const t = i / 15;
      const spin = time * 26 - t * TAU * 2.4;
      const width = radius * (0.45 + Math.sin(t * Math.PI) * 0.55);
      const side = Math.cos(spin) * width;
      const here: Pt = [mix(x, tail[0], t) - dy * side, mix(y, tail[1], t) + dx * side];
      pixel(g, here[0], here[1], colors[Math.sin(spin) > 0 ? 2 : 1], 1 - t * 0.6, 3 + (i % 3 === 0 ? 1 : 0));
    }
    pixel(g, x + dx * 2, y + dy * 2, colors[3], 1, 3);
    return true;
  }
  if (profile.kind === 'fan') {
    segment(g, tail, at, 1, colors[2], 0.6);
    leaf(g, at, angle + time * 12, radius + 3, colors);
    return true;
  }
  if (profile.kind === 'meteor') {
    flameJet(g, tail, at, radius * 0.85, time, colors);
    g.fillStyle(INK, 1).fillCircle(x, y, radius);
    g.fillStyle(colors[0], 1).fillTriangle(x - radius, y + radius * 0.1, x + radius * 0.2, y - radius,
      x + radius, y + radius * 0.6);
    segment(g, [x - radius * 0.6, y - radius * 0.1], [x + radius * 0.1, y + radius * 0.5], 2, colors[2]);
    segment(g, [x + radius * 0.1, y + radius * 0.5], [x + radius * 0.6, y - radius * 0.2], 1, colors[3]);
    return true;
  }
  if (b.pokemon === 'froakie' && b.form === 0) {
    const wobble = 1 + Math.sin(time * 17 + b.serial) * 0.08;
    g.fillStyle(WATER[0], 0.42).fillEllipse(x, y, radius * 2 * wobble, radius * 2 / wobble);
    g.lineStyle(1, WATER[2], 0.95).strokeEllipse(x, y, radius * 2 * wobble, radius * 2 / wobble);
    pixel(g, x - radius * 0.35, y - radius * 0.5, WATER[3], 1, 2);
    pixel(g, x + radius * 0.35, y + radius * 0.4, WATER[2], 0.8);
    return true;
  }
  if (b.pokemon === 'treecko' && b.form < 2) {
    segment(g, tail, at, 1, LEAF[2], 0.62);
    segment(g, [x - dx * radius, y - dy * radius], [x + dx * 2, y + dy * 2], 3, LEAF[0]);
    pixel(g, x + dx, y + dy, LEAF[2], 1, 2);
    return true;
  }
  if (b.pokemon === 'bulbasaur') {
    const spin = time * 8;
    g.fillStyle(LEAF[0], 1).fillCircle(x, y, radius);
    g.fillStyle(LEAF[1], 1).fillCircle(x - dx, y - dy, radius * 0.8);
    for (let i = 0; i < 4; i++) {
      const a = spin + i * TAU / 4;
      segment(g, [x + Math.cos(a) * radius * 0.75, y + Math.sin(a) * radius * 0.75],
        [x + Math.cos(a + 0.6) * radius * 0.5, y + Math.sin(a + 0.6) * radius * 0.5], 2, LEAF[2]);
    }
    pixel(g, x - radius * 0.3, y - radius * 0.3, LEAF[3], 1, 2);
    return true;
  }
  if (b.pokemon === 'treecko' && b.form === 2) {
    g.fillStyle(LEAF[0], 1).fillCircle(x, y, radius);
    g.fillStyle(LEAF[1], 1).fillCircle(x + dx, y + dy, radius * 0.78);
    g.fillStyle(LEAF[2], 1).fillCircle(x + dx * 2, y + dy * 2, radius * 0.5);
    for (let i = 0; i < 3; i++) {
      const a = time * 12 + i * TAU / 3;
      leaf(g, [x + Math.cos(a) * radius, y + Math.sin(a) * radius], a + 1, radius * 0.4, LEAF, 0.9);
    }
    pixel(g, x + dx * 3 - 1, y + dy * 3 - 1, LEAF[3], 1, 2);
    return true;
  }
  if (b.pokemon === 'charmander') {
    flameJet(g, tail, at, radius * 0.75, time, colors);
    pixel(g, x + dx * radius * 0.3, y + dy * radius * 0.3, colors[3], 1, Math.max(2, radius * 0.55));
    return true;
  }
  if (b.pokemon === 'pikachu') {
    zigzag(g, tail, at, Math.floor(time * 30), b.tier === 2 ? 3 : 2, colors);
    pixel(g, x, y, colors[3], 1, 3);
    return true;
  }
  if (b.pokemon === 'squirtle') {
    const pulse = (time * 8 + b.serial * 0.17) % 1;
    g.fillStyle(WATER[0], 0.95).fillCircle(x, y, radius);
    g.fillStyle(WATER[1], 0.98).fillCircle(x + dx, y + dy, radius * 0.74);
    g.lineStyle(1, WATER[2], 0.9).strokeEllipse(x, y, radius * (1.5 + pulse), radius * (1 + pulse * 0.4));
    g.lineStyle(1, WATER[3], 0.9).strokeEllipse(x, y, radius, radius * 0.65);
    pixel(g, x - 1, y - 2, WATER[3], 1, 2);
    return true;
  }
  if (b.pokemon === 'riolu') {
    segment(g, tail, at, radius * 0.65, AURA[1], 0.48);
    g.fillStyle(AURA[0], 1).fillCircle(x, y, radius);
    g.fillStyle(AURA[1], 1).fillCircle(x + dx, y + dy, radius * 0.78);
    g.fillStyle(AURA[2], 1).fillCircle(x + dx * 2, y + dy * 2, radius * 0.48);
    const spin = time * 13;
    crescent(g, at, radius * 0.95, spin, 2.1, AURA, 0.94, 2);
    crescent(g, at, radius * 0.8, spin + Math.PI, 2.1, AURA, 0.8, 1);
    pixel(g, x + dx * 2 - 1, y + dy * 2 - 1, AURA[3], 1, 2);
    return true;
  }
  if (b.pokemon === 'gible' || b.pokemon === 'treecko') {
    // A compact jaw and swept horns lead the pulse, rather than an indistinct orb.
    const atLocal = (along: number, across: number): Pt => [x + dx * along - dy * across, y + dy * along + dx * across];
    flameJet(g, tail, at, radius * 0.55, time, colors);
    const top = atLocal(-radius, -radius * 0.7), nose = atLocal(radius, -radius * 0.2);
    const jaw = atLocal(radius * 0.6, radius * 0.65), back = atLocal(-radius, radius * 0.6);
    const silhouette = [top, atLocal(-radius * 1.4, -radius * 1.3), atLocal(-radius * 0.1, -radius * 0.65),
      nose, atLocal(radius * 0.8, radius * 0.1), atLocal(radius * 0.15, radius * 0.05),
      atLocal(radius * 0.5, radius * 0.35), jaw, back];
    g.fillStyle(colors[0], 1).fillPoints(silhouette.map(([px, py]) => ({ x: px, y: py })), true);
    segment(g, atLocal(-radius * 0.6, -radius * 0.5), nose, 3, colors[1]);
    segment(g, atLocal(-radius, -radius * 0.7), atLocal(-radius * 1.5, -radius * 1.3), 2, colors[2]);
    segment(g, atLocal(radius * 0.4, radius * 0.2), jaw, 1, colors[3]);
    const eye = atLocal(radius * 0.2, -radius * 0.25);
    pixel(g, eye[0], eye[1], colors[3], 1, 2);
    return true;
  }
  return false;
}

export interface PokemonImpact {
  x: number;
  y: number;
  facing: number;
  species: PokemonSpecies;
  stage: number;
  mode: 'melee' | 'shot' | 'ultimate';
  combo: number;
  blocked?: boolean;
}

/** Event-driven aftermath persists after the projectile has disappeared on contact. */
export function drawPokemonImpact(g: Graphics, impact: PokemonImpact, age: number): void {
  const ultimate = impact.mode === 'ultimate';
  const duration = ultimate ? 0.44 : 0.3;
  const progress = clamp(age / duration);
  if (progress >= 1) return;
  const dragonPulse = impact.species === 'treecko' && impact.stage === 3 && impact.mode === 'shot';
  const colors = dragonPulse ? DRAGON : palette(impact.species, impact.stage);
  const at: Pt = [impact.x, impact.y];
  const radius = (ultimate ? 27 : 12 + impact.stage * 1.5) * (impact.blocked ? 0.65 : 1);
  const fade = (1 - progress) ** 1.3 * (impact.blocked ? 0.7 : 1);
  if (impact.species === 'pikachu') {
    for (let i = 0; i < 5; i++) {
      const a = i * TAU / 5 + progress * 0.4;
      const end: Pt = [at[0] + Math.cos(a) * radius * (0.45 + progress), at[1] + Math.sin(a) * radius * (0.45 + progress)];
      zigzag(g, at, end, i + Math.floor(age * 30), i % 2 ? 1 : 2, colors, fade);
    }
  } else if (impact.species === 'squirtle' || impact.species === 'froakie') {
    for (let i = 0; i < 3; i++) {
      const p = clamp(progress * 1.45 - i * 0.18);
      g.lineStyle(i ? 1 : 2, colors[2 + i % 2], fade * (1 - i * 0.2))
        .strokeEllipse(at[0], at[1], 4 + radius * p * 2, 3 + radius * p * 1.4);
    }
    flecks(g, at, progress, radius, colors, ultimate ? 18 : 10, 0.8);
  } else if (impact.species === 'bulbasaur' || impact.species === 'treecko' && !dragonPulse) {
    for (let i = 0; i < 7; i++) {
      const a = i * TAU / 7 + age * 3;
      const distance = radius * (0.2 + progress);
      leaf(g, [at[0] + Math.cos(a) * distance, at[1] + Math.sin(a) * distance * 0.75], a + progress * 5, 3 + i % 2, colors, fade);
    }
    segment(g, [at[0] - radius * progress, at[1]], [at[0] + radius * progress, at[1]], 1, colors[3], fade);
  } else if (impact.species === 'riolu') {
    g.lineStyle(2, colors[2], fade).strokeEllipse(at[0], at[1], 3 + radius * progress * 2, 3 + radius * progress * 1.6);
    flecks(g, at, progress, radius, colors, 12);
  } else {
    const width = radius * (0.3 + progress);
    for (let i = 0; i < 7; i++) {
      const a = i * TAU / 7 - 0.7;
      const tip: Pt = [at[0] + Math.cos(a) * width, at[1] + Math.sin(a) * width * 0.8];
      const side: Pt = [at[0] + Math.cos(a + 0.7) * width * 0.35, at[1] + Math.sin(a + 0.7) * width * 0.28];
      g.fillStyle(colors[i % 2 ? 1 : 2], fade).fillTriangle(at[0], at[1], tip[0], tip[1], side[0], side[1]);
    }
    flecks(g, at, progress, radius * 1.2, colors, 12);
  }
  if (progress < 0.25) {
    const length = radius * (0.3 + progress * 3);
    const angle = impact.mode === 'melee' ? (impact.combo === 1 ? -0.55 : impact.combo === 2 ? 0.4 : 0.1) : 0;
    const dx = (impact.facing || 1) * Math.cos(angle), dy = Math.sin(angle);
    segment(g, [at[0] - dx * length, at[1] - dy * length], [at[0] + dx * length, at[1] + dy * length], 2, colors[3], fade);
    segment(g, [at[0] + dy * length * 0.6, at[1] - dx * length * 0.6], [at[0] - dy * length * 0.6, at[1] + dx * length * 0.6], 1, colors[3], fade);
  }
}
