import type Phaser from 'phaser';
import { ASH_RIDER_FAR_LEG, ASH_RIDER_HIP, ASH_RIDER_POSES } from '../art/ashArt';
import { dragonFlame } from '../art/charizardMotion';
import { paintRuns, type Baked, type Pt } from '../art/pixelRaster';
import { pokemonFrame, type PokemonFlight, type PokemonPose } from '../art/pokemonArt';
import { pokemonEvolutionTime, pokemonStage, POKEMON_TIMING, type PokemonSpecies, type PokemonState } from '../sim/data/pokemon';
import type { Fighter } from '../sim/fighter';
import type { Bullet } from '../sim/projectile';
import type { SimEvent } from '../sim/events';
import { pokemonAttack, pokemonMelee } from '../sim/data/pokemonAttacks';
import { drawPokemonAttack, drawPokemonImpact, drawPokemonProjectile, type PokemonImpact } from './PokemonAttackArt';

type Graphics = Phaser.GameObjects.Graphics;
type Colors = readonly [shadow: number, bright: number, core: number];
const FIRE: Colors = [0xb3382d, 0xff8336, 0xffe5a0];
const BLUE_FIRE: Colors = [0x193381, 0x46bffc, 0xc6f8ff];
const WATER: Colors = [0x235991, 0x54c8e8, 0xc3f9ff];
const LEAF: Colors = [0x356955, 0x9adc55, 0xe8ffad];
const SPARK: Colors = [0x945e2d, 0xffd344, 0xfff8bd];
const DRAGON: Colors = [0x564185, 0x9c92f2, 0xe9d5ff];
const STEEL: Colors = [0x333f85, 0x62a5f4, 0xdeecff];
const WHITE = 0xfffae6;
const INK = 0x241b2d;
const TAU = Math.PI * 2;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const unit = (value: number) => Math.max(0, Math.min(1, value));

export function pokemonArtHeight(f: Fighter): number {
  if (!f.pokemon) return f.h;
  const { species, stage } = f.pokemon;
  const frame = pokemonFrame(species, stage, 'idle', 0, false);
  return Math.max(f.h, frame.artHeight) + (!f.grounded && pokemonStage(species, stage).flies ? 8 : 0);
}

function colors(species: string): Colors {
  switch (species) {
    case 'charmander': return FIRE;
    case 'bulbasaur': case 'treecko': return LEAF;
    case 'pikachu': return SPARK;
    case 'gible': return DRAGON;
    case 'riolu': return STEEL;
    default: return WATER;
  }
}

function shotColors(weapon: string): Colors {
  switch (weapon) {
    case 'ash:fireball': return FIRE;
    case 'ash:blueFire': return BLUE_FIRE;
    case 'ash:grass': return LEAF;
    case 'ash:electric': return SPARK;
    case 'ash:dragon': return DRAGON;
    case 'ash:aura': return STEEL;
    default: return WATER;
  }
}

function dot(g: Graphics, x: number, y: number, c: number, a = 1, size = 1): void {
  g.fillStyle(c, a).fillRect(Math.round(x - (size - 1) / 2), Math.round(y - (size - 1) / 2), size, size);
}

function pxSprite(g: Graphics, sprite: Baked, x: number, y: number, ox: number, oy: number, d: number, opacity = 1): void {
  paintRuns(g, sprite, Math.round(x) - d * ox, Math.round(y) - oy, d < 0, opacity);
}

function partnerSprite(
  g: Graphics, frame: ReturnType<typeof pokemonFrame>, x: number, y: number, d: number, white: number, opacity: number,
  time: number, breath: number, wind: number,
): void {
  pxSprite(g, frame.sprite, x, y, frame.originX, frame.originY, d, opacity);
  const fire = frame.fire;
  if (fire) {
    const phase = Math.floor(time * 19) & 7;
    const blue = fire.size >= 12;
    const tailX = x + fire.tail[0] * d;
    const tailY = y + fire.tail[1];
    g.save();
    g.translateCanvas(Math.round(tailX), Math.round(tailY));
    g.rotateCanvas(-d * wind * 0.94);
    pxSprite(g, dragonFlame(fire.size, phase, blue), 0, 0, fire.size + 2, fire.size + 3, d, opacity);
    g.restore();
    if (fire.size >= 6) {
      for (let i = 0; i < 3; i++) {
        const age = (time * 4.2 + i / 3) % 1;
        dot(g, tailX - d * (2 + age * (4 + i)), tailY - fire.size * (0.6 + age * 0.85),
          (blue ? BLUE_FIRE : FIRE)[i % 2 ? 1 : 2], (1 - age) * opacity * 0.75);
      }
    }
    if (fire.muzzle && blue && breath === 0) {
      // Mega X's cheek fire trails behind the jaw even when it is not attacking.
      for (const side of [-1, 1]) {
        g.save();
        g.translateCanvas(Math.round(x + d * (fire.muzzle[0] - 3)), Math.round(y + fire.muzzle[1] + side * 2));
        g.rotateCanvas(-d * (0.95 + wind * 0.4));
        pxSprite(g, dragonFlame(4, (phase + side) & 7, true), 0, 0, 6, 7, d, opacity * (side < 0 ? 0.6 : 0.9));
        g.restore();
      }
    } else if (fire.muzzle && breath > 0) {
      const size = Math.round(3 + breath * (blue ? 12 : Math.min(9, fire.size)));
      g.save();
      g.translateCanvas(Math.round(x + d * (fire.muzzle[0] - (breath ? 0 : 2))), Math.round(y + fire.muzzle[1]));
      g.rotateCanvas(d * (breath ? 1.75 : -0.8));
      pxSprite(g, dragonFlame(size, phase, blue), 0, 0, size + 2, size + 3, 1, opacity);
      g.restore();
    }
  }
  if (white > 0) pxSprite(g, frame.white, x, y, frame.originX, frame.originY, d, white * opacity);
}

interface BodyMotion {
  wings: number;
  steps: number;
  pitch: number;
  air: boolean;
  grounded: boolean;
  takeoff: number;
  landing: number;
  glide: number;
  perched: boolean;
  hitch: number;
  hitchFrom?: Pt;
}

interface PartnerAnchors {
  muzzle?: Pt;
  grip?: Pt;
}

function placePartner(
  g: Graphics, frame: ReturnType<typeof pokemonFrame>, f: Fighter, x: number, y: number, motion: BodyMotion,
  mounted: boolean, white: number, opacity: number, time: number, breath: number,
): PartnerAnchors {
  const d = f.facing;
  const speed = Math.hypot(f.vx, f.vy);
  const wind = unit(Math.abs(f.vx) / 185);
  const pitch = f.grounded ? 0 : motion.pitch;
  const lift = 0;
  const pivot = Math.round(f.h * 0.47);
  if (motion.air && speed > 65) {
    const dx = f.vx / speed;
    const dy = f.vy / speed;
    for (let i = 0; i < 4; i++) {
      const drift = (time * 3 + i * 0.27) % 1;
      const away = 14 + drift * 21;
      const side = (i - 1.5) * f.h * 0.24;
      const sx = x - dx * away - dy * side;
      const sy = y - pivot - dy * away + dx * side;
      g.lineStyle(1, i % 2 ? 0xc5e8ee : 0xf8efe1, (1 - drift) * unit(speed / 220) * 0.48)
        .lineBetween(Math.round(sx), Math.round(sy), Math.round(sx - dx * (6 + drift * 9)), Math.round(sy - dy * (6 + drift * 9)));
    }
  }
  g.save();
  g.translateCanvas(Math.round(x), Math.round(y) - pivot + lift);
  g.rotateCanvas(d * pitch);
  const [saddleX, saddleY] = frame.saddle ?? [-Math.round(f.w * 0.35), -Math.round(f.h * 0.54)];
  const lean = f.state === 'block' ? 2 : Math.min(2, Math.floor(speed / 58));
  const [hipX, hipY] = ASH_RIDER_HIP;
  const seatX = d * saddleX;
  const seatY = pivot + saddleY;
  if (mounted) pxSprite(g, ASH_RIDER_FAR_LEG, seatX, seatY, hipX, hipY, d, opacity);
  partnerSprite(g, frame, 0, pivot, d, white, opacity, time, breath, wind);
  if (mounted) pxSprite(g, ASH_RIDER_POSES[lean], seatX, seatY, hipX, hipY, d, opacity);
  g.restore();
  const cos = Math.cos(pitch);
  const sin = Math.sin(pitch);
  const anchor = ([ax, ay]: Pt): Pt => [
    x + d * (ax * cos - (ay + pivot) * sin),
    y - pivot + lift + ax * sin + (ay + pivot) * cos,
  ];
  const muzzle = frame.muzzle ?? frame.fire?.muzzle;
  return { muzzle: muzzle && anchor(muzzle), grip: frame.grip && anchor(frame.grip) };
}

function sparks(g: Graphics, x: number, y: number, p: number, radius: number, palette: Colors, count = 10): void {
  const strength = 1 - p;
  for (let i = 0; i < count; i++) {
    const a = i * TAU / count + p * 0.4;
    const r = (0.45 + ((i * 7) % 13) * 0.045) * radius;
    dot(g, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7, palette[i % 2 ? 1 : 2], strength, i % 3 === 0 ? 2 : 1);
  }
}

function ball(g: Graphics, x: number, y: number, spread = 0): void {
  x = Math.round(x);
  y = Math.round(y);
  const lid = y - spread;
  g.fillStyle(INK, 1).fillRect(x - 2, lid - 3, 5, 4).fillRect(x - 3, lid - 2, 7, 3)
    .fillRect(x - 3, y, 7, 3).fillRect(x - 2, y + 2, 5, 2);
  g.fillStyle(0xd94448, 1).fillRect(x - 2, lid - 2, 5, 2);
  g.fillStyle(0xff9379, 1).fillRect(x - 1, lid - 2, 2, 1);
  g.fillStyle(0xd5d6e0, 1).fillRect(x - 2, y + 1, 5, 2);
  dot(g, x, y, WHITE);
}

function release(g: Graphics, f: Fighter, trainer: Fighter | undefined, x: number, y: number, alpha: number, age: number): number {
  const flyTime = POKEMON_TIMING.release * 0.43;
  const bx = x - f.facing * 5;
  const by = y - 4;
  if (age < flyTime) {
    const throwTime = 0.047;
    const p = unit((age - throwTime) / (flyTime - throwTime));
    const hand = mix(-5, 7, unit(age / throwTime));
    const tx = trainer ? mix(trainer.px, trainer.x, alpha) + f.facing * hand : bx - f.facing * 19;
    const ty = trainer ? mix(trainer.py, trainer.y, alpha) - 19 : by - 15;
    ball(g, mix(tx, bx, p), mix(ty, by, p) - Math.sin(p * Math.PI) * 13);
    return 0;
  }
  const p = unit((age - flyTime) / (POKEMON_TIMING.release - flyTime));
  const cy = y - f.h * 0.55;
  const light = 1 - p;
  g.fillStyle(0xff7474, 0.45 * light).fillTriangle(bx, by, x - 6 - p * 10, cy - 3, x + 6 + p * 10, cy - 3);
  g.fillStyle(WHITE, 0.87 * light).fillTriangle(bx, by, x - 2 - p * 7, cy, x + 2 + p * 7, cy);
  sparks(g, x, cy, p, 8 + p * 20, [INK, 0xffa58a, WHITE]);
  if (p < 0.7) ball(g, bx, by, 2 + Math.round(Math.sin(p * Math.PI) * 3));
  return p;
}

function recall(g: Graphics, f: Fighter, trainer: Fighter | undefined, x: number, y: number, alpha: number, age: number): number {
  const p = unit(age / POKEMON_TIMING.recall);
  const cx = x;
  const cy = y - f.h * 0.52;
  const bx = trainer ? mix(trainer.px, trainer.x, alpha) + trainer.facing * 7 : cx - f.facing * 18;
  const by = trainer ? mix(trainer.py, trainer.y, alpha) - 13 : cy;
  const gather = unit(p / 0.29);
  const returnT = unit((p - 0.15) / 0.76);
  const tipX = mix(cx, bx, returnT ** 1.35);
  const tipY = mix(cy, by, returnT ** 1.35);
  const a = Math.sin(p * Math.PI) ** 0.6;
  g.lineStyle(4, 0xb63252, a * 0.65).lineBetween(bx, by, tipX, tipY);
  g.lineStyle(1, 0xff8394, a).lineBetween(bx, by, tipX, tipY);
  dot(g, tipX, tipY, WHITE, a, 2 + Math.round((1 - returnT) * 3));
  for (let i = 0; i < 9; i++) {
    const angle = i * TAU / 9 + p;
    const radius = (1 - returnT) * (5 + f.h * 0.39) * (1 - gather * 0.46);
    dot(g, tipX + Math.cos(angle) * radius, tipY + Math.sin(angle) * radius * 0.75,
      i % 3 === 0 ? WHITE : 0xff667f, a, i % 3 === 0 ? 2 : 1);
  }
  ball(g, bx, by, p < 0.9 ? 2 : 0);
  return gather;
}

function evolve(g: Graphics, x: number, y: number, h: number, p: number, palette: Colors): void {
  const flare = Math.sin(p * Math.PI);
  const cy = y - h * 0.56;
  const height = h + 11 * flare;
  g.fillStyle(palette[1], 0.21 * flare).fillEllipse(x, cy, 12 + 33 * flare, height * 1.35);
  g.fillStyle(palette[2], 0.25 * flare).fillEllipse(x, cy, 9 + 17 * flare, height * 1.18);
  for (let i = 0; i < 13; i++) {
    const a = i * TAU / 13 + p * TAU * 1.4;
    const radius = 9 + 18 * flare;
    const yy = y - (i * 0.12 + p * 1.6) % 1 * height;
    const xx = x + Math.cos(a) * radius;
    const c = palette[i % 2 ? 2 : 1];
    if (palette === LEAF) {
      const side = Math.sin(a) > 0 ? 1 : -1;
      g.fillStyle(c, flare * 0.85).fillTriangle(xx - 2, yy - side * 2, xx + 3, yy + side * 2, xx + 1, yy - side * 2);
    } else if (palette === WATER) {
      g.lineStyle(1, c, flare * 0.86).strokeCircle(xx, yy, 1 + i % 3);
    } else if (palette === SPARK && i % 4 === 0) {
      lightning(g, xx, yy, x, cy, Math.floor(p * 24), flare * 0.8, 2);
    } else {
      dot(g, xx, yy, c, flare * 0.95, 2);
      if (i % 3 === 0) g.fillStyle(WHITE, flare * 0.7).fillRect(Math.round(xx), Math.round(yy - 4), 1, 4);
    }
  }
  if (p > 0.48) {
    const wave = (p - 0.48) / 0.52;
    g.lineStyle(1, palette[2], (1 - wave) * 0.9).strokeEllipse(x, y - 3, 12 + wave * 56, 4 + wave * 15);
    sparks(g, x, cy, wave, 9 + wave * 40, palette, 15);
  }
}

function ascension(g: Graphics, x: number, y: number, h: number, t: number, palette: Colors, bond: boolean): void {
  const cy = y - h * 0.55;
  const gather = unit(t / 0.47);
  const burst = unit((t - 0.47) / 0.53);
  const alpha = (t < 0.47 ? gather : 1 - burst) * 0.92;
  const width = 8 + h * 0.38;
  if (bond) {
    for (let i = 0; i < 4; i++) {
      const phase = (i * 0.24 + t * 1.38) % 1;
      const wy = y - h * (0.1 + phase * 1.16);
      const spread = width * (1.7 - phase * 0.58) + burst * 23;
      g.lineStyle(i % 2 ? 2 : 1, palette[i % 2 ? 1 : 2], alpha * (1 - phase * 0.46))
        .strokeEllipse(x, wy, spread * 2, 5 + phase * 6);
    }
    sparks(g, x, cy, burst, 14 + width * gather + burst * 29, palette, 19);
    return;
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const phase = (i * 0.2 + t * 1.7) % 1;
      const px = x + side * (width * (1.55 - gather) + phase * 8 + burst * 37);
      const py = y - h * (0.1 + phase * 0.9) - burst * 12;
      const len = 6 + i * 2;
      g.fillStyle(palette[0], alpha * 0.82).fillTriangle(px, py + 4, px - side * 5, py - len * 0.54, px + side * 3, py - len);
      g.fillStyle(palette[2], alpha).fillTriangle(px, py + 1, px - side * 2, py - len * 0.5, px + side * 2, py - len + 1);
    }
  }
  if (t >= 0.47) {
    for (let i = 0; i < 3; i++) {
      const r = 0.18 * i + burst;
      g.lineStyle(i === 0 ? 2 : 1, palette[i === 0 ? 2 : 1], alpha * (1 - i * 0.2))
        .strokeEllipse(x, y - i * h * 0.24, width * (1.2 + r * 4), 4 + r * (8 + i * 5));
    }
  }
}

function lightning(g: Graphics, x: number, y: number, tx: number, ty: number, tick: number, alpha: number, width: number): void {
  const length = Math.hypot(tx - x, ty - y) || 1;
  const nx = (y - ty) / length;
  const ny = (tx - x) / length;
  let px = x;
  let py = y;
  for (let i = 1; i <= 6; i++) {
    const side = i === 6 ? 0 : Math.sin(i * 15 + tick * 2) * Math.min(8, length * 0.16);
    const qx = mix(x, tx, i / 6) + nx * side;
    const qy = mix(y, ty, i / 6) + ny * side;
    g.lineStyle(width, SPARK[1], alpha * 0.85).lineBetween(px, py, qx, qy);
    g.lineStyle(1, WHITE, alpha).lineBetween(px, py, qx, qy);
    px = qx;
    py = qy;
  }
}

function ultimate(g: Graphics, f: Fighter, p: PokemonState, x: number, y: number, palette: Colors, muzzle?: Pt): void {
  const t = unit(p.age / POKEMON_TIMING.ultimate);
  const released = p.age >= POKEMON_TIMING.ultimateHit;
  const burst = unit((p.age - POKEMON_TIMING.ultimateHit) / (POKEMON_TIMING.ultimate - POKEMON_TIMING.ultimateHit));
  const d = f.facing;
  const cy = y - f.h * 0.57;
  const cx = x + d * (f.w / 2 + 3);
  const intensity = released ? 1 - burst : unit(t * 2);
  const tick = Math.floor(t * 18);

  if (p.species === 'charmander' && p.stage === 2) {
    if (p.holding) {
      const rising = p.age < 0.38;
      const offset = rising ? 1 : -1;
      const spin = p.age * 30;
      for (let i = 0; i < 8; i++) {
        const phase = i / 8;
        const a = spin - phase * TAU;
        const px = x + Math.cos(a) * (12 + phase * 20);
        const py = y - f.h * 0.42 + offset * phase * 27 + Math.sin(a) * 8;
        g.lineStyle(i % 3 === 0 ? 2 : 1, FIRE[i % 3], (1 - phase) * 0.83)
          .lineBetween(px, py, px - d * (6 + phase * 9), py + offset * (5 + phase * 5));
      }
    } else if (p.fired && released) {
      const width = 24 + burst * 81;
      g.lineStyle(2, FIRE[2], intensity).strokeEllipse(x, y, width, 4 + burst * 9);
      g.lineStyle(1, FIRE[1], intensity).strokeEllipse(x, y + 3, width * 0.83, 3 + burst * 6);
      for (let i = 0; i < 12; i++) {
        const side = (i % 2 ? 1 : -1) * (6 + burst * (9 + i * 3));
        const height = Math.sin(burst * Math.PI) * (6 + i % 4 * 6);
        dot(g, x + side, y - height, i % 3 ? 0x9e6c63 : FIRE[2], intensity, i % 3 === 0 ? 3 : 2);
      }
    }
    return;
  }
  if (p.species === 'charmander' && p.stage === 3) {
    if (!released) {
      const pull = unit(t / 0.7);
      const [focusX, focusY] = muzzle ?? [x + d * 21, y - f.h * 0.89];
      for (let i = 0; i < 13; i++) {
        const swirl = (t * 2.7 + i / 13) % 1;
        const angle = swirl * TAU * 1.25 + i * TAU / 13;
        const radius = (1 - swirl) * (28 + pull * 12);
        const xx = focusX + Math.cos(angle) * radius;
        const yy = focusY + Math.sin(angle) * radius * 0.61;
        g.lineStyle(1 + i % 2, BLUE_FIRE[i % 3], swirl * pull * 0.82)
          .lineBetween(xx, yy, xx + Math.sin(angle) * 5, yy - Math.cos(angle) * 3);
      }
      dot(g, focusX, focusY, BLUE_FIRE[2], pull, 2 + Math.round(pull * 4));
    } else {
      for (let i = 0; i < 3; i++) {
        const sweep = unit(burst * 1.6 - i * 0.22);
        const span = 18 + sweep * 62;
        const center = x + d * (12 + sweep * 39);
        g.lineStyle(2 - i * 0.5, BLUE_FIRE[i], (1 - burst) * (1 - i * 0.15))
          .strokeEllipse(center, y - 2 - i * 3, span, 3 + sweep * 12);
      }
    }
    return;
  }
  if (palette === SPARK) {
    const radius = 7 + t * 19;
    if (released) lightning(g, cx + d * 8, cy - 46, cx, cy, tick, intensity, 4);
    for (let i = 0; i < 3; i++) {
      const a = t * 12 + i * TAU / 3;
      lightning(g, x + Math.cos(a) * radius, cy + Math.sin(a) * radius * 0.75, cx, cy, tick + i, intensity * 0.8, 2);
    }
    return;
  }
  if (p.species === 'gible') {
    for (let i = 0; i < 7; i++) {
      const dx = (i - 3) * (4 + t * 2);
      const fall = (t * 2.4 + i * 0.21) % 1;
      const px = cx + dx - d * 12 * (1 - fall);
      const py = cy - 39 + fall * 39;
      g.lineStyle(i % 2 ? 2 : 3, DRAGON[1], intensity * (0.34 + fall * 0.52)).lineBetween(px - d * 4, py - 10, px, py);
      dot(g, px, py, DRAGON[2], intensity, i % 2 ? 2 : 3);
    }
    return;
  }
  if (p.species === 'treecko' || p.species === 'bulbasaur') {
    const radius = 8 + t * 22;
    const plantX = p.species === 'bulbasaur' ? x - d * f.w * 0.23 : cx;
    const plantY = p.species === 'bulbasaur' ? y - f.h * 0.88 : cy;
    for (let i = 0; i < 8; i++) {
      const a = t * 12 + i * TAU / 8;
      const px = plantX + Math.cos(a) * radius;
      const py = plantY + Math.sin(a) * radius * 0.52;
      const leaf = Math.cos(a) > 0 ? 5 : -5;
      g.fillStyle(i % 3 === 0 ? LEAF[2] : LEAF[1], intensity * 0.9)
        .fillTriangle(px + leaf, py - 2, px - leaf, py + 2, px, py + 4);
    }
    if (p.species === 'bulbasaur' && p.stage >= 2) {
      const ray = 4 + t * 14;
      g.fillStyle(0xfff3a0, intensity * 0.9).fillCircle(plantX, plantY, 2 + t * 4);
      g.lineStyle(1, 0xffef86, intensity).lineBetween(plantX - ray, plantY, plantX + ray, plantY);
    }
    return;
  }
  if (palette === WATER) {
    const column = p.species === 'squirtle' && p.stage >= 2 ? 2 : 1;
    for (let i = 0; i < 8; i++) {
      const drift = (t * 2 + i * 0.19) % 1;
      const px = cx + (i % 2 ? 1 : -1) * (3 + drift * (12 + column * 5));
      const py = cy + 8 - drift * 25;
      g.lineStyle(1, WATER[1], intensity * (1 - drift)).strokeCircle(px, py, 1 + i % 3);
      dot(g, px, py - 1, WATER[2], intensity * (1 - drift));
    }
    return;
  }
  if (palette === STEEL) {
    const radius = 5 + t * 11;
    g.fillStyle(STEEL[0], intensity * 0.65).fillCircle(cx, cy, radius);
    g.lineStyle(1, STEEL[2], intensity).strokeEllipse(cx, cy, radius * 2.5, radius);
    g.fillStyle(STEEL[2], intensity).fillCircle(cx, cy, radius * 0.38);
    sparks(g, cx, cy, burst, radius * 2.2, STEEL, 6);
    return;
  }
  for (let i = 0; i < 11; i++) {
    const phase = (t * 2 + i * 0.21) % 1;
    const a = t * 15 + i * TAU / 11;
    const px = cx + Math.cos(a) * (7 + phase * 13);
    const py = cy + 6 - phase * 22;
    dot(g, px, py, palette[i % 3], intensity * (1 - phase), 2 + i % 2);
  }
}

function clawSweep(g: Graphics, x: number, y: number, d: number, progress: number, size: number, palette: Colors, count: number): void {
  const alpha = 1 - progress;
  for (let i = 0; i < count; i++) {
    const radius = size * (1 - i * 0.16);
    for (let j = 0; j < 6; j++) {
      const u = j / 6;
      const a = -1.33 + progress * 0.95 + u * 2.25;
      const b = a + 0.41;
      g.lineStyle(Math.max(1, Math.round((1 - u) * (i === 0 ? 3 : 2))), palette[i === 0 ? 2 : 1], alpha * (1 - u * 0.55))
        .lineBetween(x + d * Math.cos(a) * radius, y + Math.sin(a) * radius * 0.66 + i * 2,
          x + d * Math.cos(b) * radius, y + Math.sin(b) * radius * 0.66 + i * 2);
    }
  }
}

function action(g: Graphics, f: Fighter, p: PokemonState, x: number, y: number, palette: Colors, muzzle?: Pt): void {
  const d = f.facing;
  const chest = y - f.h * 0.52;
  if ((p.move === 'punch' || p.move === 'kick') && p.fired) {
    const heavy = p.move === 'kick';
    const fade = unit(1 - p.age / (heavy ? 0.17 : 0.12));
    const reach = f.w * 0.5 + (heavy ? 13 : 8);
    const at = chest + (heavy ? f.h * 0.14 : 0);
    if (p.stage > 0 && (p.species === 'charmander' || p.species === 'gible' || p.species === 'treecko')) {
      const edge = p.species === 'gible' && p.stage === 3 ? [0x542943, 0xed4568, 0xffadac] as const : palette;
      clawSweep(g, x + d * f.w * 0.18, at, d, 1 - fade, reach, edge, heavy || p.species === 'gible' ? 3 : 2);
      return;
    }
    if (p.species === 'squirtle' || p.species === 'froakie' || p.species === 'riolu') {
      const impactX = x + d * reach * 0.73;
      const width = 4 + (1 - fade) * (heavy ? 21 : 13);
      g.lineStyle(1, palette[2], fade * 0.9).strokeEllipse(impactX, at, width, width * 0.64);
      sparks(g, impactX, at, 1 - fade, width, palette, p.species === 'riolu' ? 5 : 8);
      return;
    }
    for (let i = 0; i < (heavy ? 3 : 2); i++) {
      const py = at + (i - 1) * (heavy ? 4 : 3);
      g.fillStyle(palette[i === 0 ? 2 : 1], fade * (i === 0 ? 0.95 : 0.67))
        .fillTriangle(x + d * (f.w * 0.18 + i * 3), py - (heavy ? 4 : 1), x + d * (reach + i * 2), py, x + d * (reach - 6), py + 2);
    }
    if (heavy) sparks(g, x + d * reach, at, 1 - fade, 5 + (1 - fade) * 10, palette, 7);
  } else if (p.move === 'dash') {
    const strength = Math.min(1, Math.abs(f.vx) / 125);
    for (let i = 0; i < 7; i++) {
      const offset = (i * 7 + p.age * 113) % 29;
      const px = x - d * (f.w / 2 + offset);
      const py = chest + (i - 3) * f.h / 10;
      g.lineStyle(i % 3 === 0 ? 2 : 1, palette[i % 3], (1 - offset / 29) * strength * 0.85)
        .lineBetween(px, py, px - d * (5 + i % 3 * 3), py + i % 2);
    }
    if (palette === SPARK) lightning(g, x - d * 28, chest + 4, x, chest, Math.floor(p.age * 35), strength, 2);
    if (p.species === 'charmander' && p.stage > 0) {
      const sweep = unit(p.age / POKEMON_TIMING.dash);
      if (p.stage === 3) {
        clawSweep(g, x + d * f.w * 0.28, chest, d, sweep, f.w * 0.75 + 14, BLUE_FIRE, 3);
      } else {
        for (let i = 0; i < 7; i++) {
          const trail = (p.age * 7 + i / 7) % 1;
          const xx = x + d * (f.w * 0.49 - trail * 35);
          const yy = chest + Math.sin(trail * TAU * 1.25 + i) * (5 + f.h * 0.15);
          g.fillStyle(FIRE[i % 3], (1 - trail) * strength * 0.76)
            .fillTriangle(xx + d * 3, yy + 2, xx - d * (7 + trail * 7), yy - 3, xx, yy - 4);
        }
      }
    } else if (p.species === 'treecko' && p.stage > 0) {
      const reach = f.w / 2 + 11;
      g.fillStyle(LEAF[1], strength * 0.85).fillTriangle(x, chest + 6, x + d * reach, chest - 7, x + d * (reach + 3), chest - 2);
      g.lineStyle(1, LEAF[2], strength).lineBetween(x + d * 2, chest + 4, x + d * reach, chest - 7);
    } else if (p.species === 'bulbasaur' && p.stage > 0) {
      const reach = f.w / 2 + 16;
      for (const side of [-1, 1]) {
        const swing = Math.sin(p.age * 22) * side * 5;
        const bend = chest - 5 + swing;
        g.lineStyle(2, LEAF[0], strength).lineBetween(x - d * 4, chest - 7, x + d * reach * 0.48, bend)
          .lineBetween(x + d * reach * 0.48, bend, x + d * reach, chest + side * 4);
        g.lineStyle(1, LEAF[1], strength).lineBetween(x + d * reach * 0.48, bend, x + d * reach, chest + side * 4);
      }
    } else if (p.species === 'gible' && p.stage > 0) {
      clawSweep(g, x + d * f.w * 0.28, chest, d, unit(p.age / POKEMON_TIMING.dash),
        f.w * 0.72 + 12, p.stage === 3 ? [0x542943, 0xed4568, 0xffadac] : DRAGON, 3);
    }
  } else if ((p.move === 'guard' || p.mounted) && f.state === 'block') {
    const gx = x + d * (f.w / 2 + 4);
    const h = 4 + f.h * 0.25;
    g.lineStyle(1, palette[1], 0.68).lineBetween(gx - d * 3, chest - h, gx, chest - h + 4)
      .lineBetween(gx, chest - h + 4, gx, chest + h - 4).lineBetween(gx, chest + h - 4, gx - d * 3, chest + h);
    dot(g, gx, chest + Math.sin(p.age * 19) * h * 0.55, palette[2]);
  } else if (p.move === 'shot' && p.species !== 'charmander') {
    const t = p.age - POKEMON_TIMING.shotFire;
    const sx = x + d * (f.w / 2 + 4);
    const sy = y - f.h * 0.57;
    if (t <= 0) dot(g, sx, sy, palette[1], 0.75, 2 + Math.round(unit(p.age / POKEMON_TIMING.shotFire) * 2));
    else if (t < 0.18) sparks(g, sx, sy, t / 0.18, 3 + t * 56, palette, 7);
  } else if (p.move === 'ultimate') {
    ultimate(g, f, p, x, y, palette, muzzle);
  } else if (p.move === 'mount') {
    const pulse = (p.age * 3.4) % 1;
    const drop = y + 3 + 10 * pulse;
    g.lineStyle(1, 0xd5eaf0, 0.55 * (1 - pulse)).strokeEllipse(x, drop, 16 + pulse * 29, 3 + 5 * pulse);
  }
}

function projectile(
  g: Graphics, b: Bullet, x: number, y: number, species: PokemonSpecies | undefined, time: number, muzzle?: Pt,
): void {
  const palette = shotColors(b.weapon);
  const speed = Math.hypot(b.vx, b.vy) || 1;
  const dx = b.vx / speed;
  const dy = b.vy / speed;
  const size = Math.max(2, b.size);
  const solarBeam = species === 'bulbasaur' && b.form >= 2 && b.tier === 2;
  const tail = Math.min(b.traveled, solarBeam ? 45 + size * 4 : 8 + size * 3);
  let tx = x - dx * tail;
  let ty = y - dy * tail;
  const overhead = b.tier === 2 && (species === 'gible' || species === 'pikachu');
  if (muzzle && !overhead) {
    const offsetX = muzzle[0] - (x - dx * b.traveled);
    const offsetY = muzzle[1] - (y - dy * b.traveled);
    const tipBlend = unit(1 - b.traveled / 32);
    const tailBlend = unit(1 - (b.traveled - tail) / 32);
    x += offsetX * tipBlend;
    y += offsetY * tipBlend;
    tx += offsetX * tailBlend;
    ty += offsetY * tailBlend;
  }
  if (palette === SPARK) {
    lightning(g, tx, ty, x, y, Math.floor(time * 32), 1, b.tier === 2 ? 5 : 3);
    if (b.tier === 2) lightning(g, tx - dy * size, ty + dx * size, x, y, Math.floor(time * 27), 0.7, 2);
    dot(g, x, y, WHITE, 1, 3);
    return;
  }
  if (solarBeam) {
    g.lineStyle(size * 2.3, 0xbda63e, 0.5).lineBetween(tx, ty, x, y);
    g.lineStyle(size * 1.35, 0xffd758, 0.86).lineBetween(tx, ty, x, y);
    g.lineStyle(size * 0.62, 0xfff2a1, 1).lineBetween(mix(tx, x, 0.1), mix(ty, y, 0.1), x, y);
    g.fillStyle(0xfff9bf, 1).fillCircle(x, y, size * 0.72);
    return;
  }
  if (species === 'froakie' && b.form >= 2) {
    const spin = time * 21;
    const radius = size * (b.tier === 2 ? 1.5 : 1.35);
    g.lineStyle(1, WATER[1], 0.55).lineBetween(tx, ty, x, y);
    for (let i = 0; i < 4; i++) {
      const a = spin + i * TAU / 4;
      const bx = x + Math.cos(a) * radius;
      const by = y + Math.sin(a) * radius;
      const cx = x + Math.cos(a - 1.15) * radius * 0.42;
      const cy = y + Math.sin(a - 1.15) * radius * 0.42;
      g.fillStyle(WATER[0], 0.84).fillTriangle(x, y, bx, by, cx, cy);
      g.lineStyle(1, WATER[2], 1).lineBetween(bx, by, cx, cy);
    }
    dot(g, x, y, WATER[2], 1, 2 + Math.floor(size * 0.33));
    return;
  }
  if (species === 'froakie' && b.tier !== 2) {
    const pulse = (time * 8 + b.serial) % 1;
    g.fillStyle(WATER[0], 0.56).fillCircle(x, y, size);
    g.lineStyle(1, WATER[1], 0.88).strokeCircle(x, y, size);
    g.lineStyle(1, WATER[2], 0.78 * (1 - pulse)).strokeCircle(x, y, size * (0.65 + pulse * 0.65));
    dot(g, x - dx, y - 1, WATER[2], 0.95, 2);
    return;
  }
  if (species === 'treecko' && b.form < 2 && b.tier < 2) {
    g.lineStyle(1, LEAF[1], 0.55).lineBetween(tx, ty, x, y);
    g.lineStyle(3, 0x5c7c38, 1).lineBetween(x - dx * size, y - dy * size, x + dx * 2, y + dy * 2);
    dot(g, x + dx, y + dy, 0xd1e87f, 1, 2);
    return;
  }
  if (palette === LEAF) {
    const angle = time * 15 + b.serial;
    const lx = Math.cos(angle) * (size + 2);
    const ly = Math.sin(angle) * (size + 2);
    if (species === 'bulbasaur' && b.form >= 2) {
      g.fillStyle(0xa64f78, 0.9).fillEllipse(x, y, 3 + Math.abs(lx) * 1.45, 3 + Math.abs(ly) * 1.45);
      g.lineStyle(1, 0xffbec9, 0.94).lineBetween(x + lx, y + ly, x - lx, y - ly);
      dot(g, x, y, 0xf293aa, 1, 2);
      return;
    }
    g.lineStyle(1, palette[1], 0.62).lineBetween(tx, ty, x, y);
    g.fillStyle(palette[0], 1).fillTriangle(x + lx, y + ly, x - lx, y - ly, x - dy * size, y + dx * size);
    g.fillStyle(palette[1], 1).fillTriangle(x + lx, y + ly, x - lx, y - ly, x + dy * size, y - dx * size);
    g.lineStyle(1, palette[2], 0.88).lineBetween(x + lx, y + ly, x - lx, y - ly);
    return;
  }
  if (species === 'charmander' && b.form < 2 && b.tier === 2) {
    // Fire Spin travels as a helix of flame with a hot center.
    for (let i = 14; i >= 0; i--) {
      const p = i / 14;
      const angle = time * 27 - p * TAU * 2.1;
      const radius = size * (0.65 + p * 0.25);
      const side = Math.cos(angle) * radius;
      const xx = mix(x, tx, p) - dy * side;
      const yy = mix(y, ty, p) + dx * side;
      const front = Math.sin(angle) > 0;
      dot(g, xx, yy, FIRE[front ? 1 : 0], 1 - p * 0.58, front ? 4 : 3);
      dot(g, xx + dx, yy + dy, FIRE[2], (1 - p) * 0.9, 1);
    }
    dot(g, x + dx * 2, y + dy * 2, FIRE[2], 1, 4);
    return;
  }
  if ((palette === FIRE || palette === BLUE_FIRE) && (b.tier === 2 || b.form >= 1)) {
    g.lineStyle(size * 0.7, palette[0], 0.78).lineBetween(tx, ty, x, y);
    const tongues = b.tier === 2 ? 13 : 9;
    for (let i = 0; i < tongues; i++) {
      const p = i / tongues;
      const offset = Math.sin(p * TAU * 2 + time * 31) * size * (1 - p * 0.6);
      const px = mix(x, tx, p) - dy * offset;
      const py = mix(y, ty, p) + dx * offset;
      dot(g, px, py, palette[0], 1 - p, Math.max(2, Math.floor(size * (1 - p))));
      dot(g, px + dx, py + dy, palette[i % 2 ? 1 : 2], 1 - p, Math.max(1, Math.floor(size * 0.54 * (1 - p))));
    }
    g.fillStyle(palette[2], 0.94).fillCircle(x, y, size * 0.47);
    return;
  }
  if (species === 'charmander' && b.form === 0) {
    const phase = Math.floor(time * 19) & 7;
    g.save();
    g.translateCanvas(Math.round(x), Math.round(y));
    g.rotateCanvas(Math.atan2(dy, dx) + Math.PI / 2);
    pxSprite(g, dragonFlame(4, phase, false), 0, 0, 6, 7, 1);
    g.restore();
    for (let i = 0; i < 6; i++) {
      const age = (time * 7 + i / 6) % 1;
      const side = Math.sin(i * 3 + time * 9) * (1 + age * 4);
      dot(g, x - dx * age * tail - dy * side, y - dy * age * tail + dx * side,
        FIRE[i % 3], 1 - age, i % 2 ? 1 : 2);
    }
    return;
  }
  if (palette === STEEL) {
    g.fillStyle(STEEL[0], 0.9).fillCircle(x, y, size * 1.16);
    g.lineStyle(1, STEEL[2], 0.83).strokeEllipse(x, y, size * 2.25, size * 0.7);
    g.fillStyle(STEEL[1], 1).fillCircle(x, y, size * 0.76);
    g.fillStyle(STEEL[2], 1).fillCircle(x + dx, y + dy, size * 0.46);
    const wave = (time * 8 + b.serial) % 1;
    g.lineStyle(1, STEEL[1], 1 - wave).strokeCircle(mix(x, tx, wave), mix(y, ty, wave), size * (0.62 + wave * 0.54));
    return;
  }
  const jet = b.weapon === 'ash:hydroCannon' || b.weapon === 'ash:waterGun';
  g.lineStyle(size * 1.8, palette[0], jet ? 0.83 : 0.7).lineBetween(tx, ty, x, y);
  g.lineStyle(Math.max(2, size), palette[1], 0.93).lineBetween(mix(tx, x, 0.25), mix(ty, y, 0.25), x, y);
  g.fillStyle(palette[1], 1).fillCircle(Math.round(x), Math.round(y), size);
  g.fillStyle(palette[2], 1).fillCircle(Math.round(x + dx), Math.round(y + dy), Math.max(1, size * 0.56));
  for (let i = 0; i < 5; i++) {
    const p = (time * 10 + i * 0.29 + b.serial) % 1;
    const side = (i % 2 ? -1 : 1) * size * (1 + p);
    dot(g, mix(x, tx, p) - dy * side, mix(y, ty, p) + dx * side, palette[i % 3], 1 - p, i % 2 ? 1 : 2);
  }
}

export class AshArt {
  private sprites: Graphics;
  private passengers: Graphics;
  private effects: Graphics;
  private readonly muzzles = new Map<number, Pt>();
  readonly heldTargets = new Map<number, Pt>();
  private readonly motion = new Map<number, BodyMotion>();
  private lastTime = 0;
  private readonly impacts: { effect: PokemonImpact; age: number }[] = [];

  constructor(scene: Phaser.Scene) {
    this.sprites = scene.add.graphics().setDepth(41);
    this.passengers = scene.add.graphics().setDepth(39);
    this.effects = scene.add.graphics().setDepth(56);
  }

  hit(event: Extract<SimEvent, { t: 'hit' }>, fighters: readonly Fighter[], bullets: readonly Bullet[]): void {
    if (!event.weapon.startsWith('ash:') || event.corpse || event.kind === 'fire' || event.kind === 'drain') return;
    const attacker = fighters[event.attacker];
    const partner = attacker?.pokemon ? attacker : fighters[attacker?.trainer?.active ?? -1];
    const projectile = event.kind === 'bullet' || event.kind === 'explosion'
      ? bullets.filter(b => b.pokemon && b.weapon === event.weapon && b.owner === event.attacker)
        .sort((a, b) => Math.hypot(a.x - event.x, a.y - event.y) - Math.hypot(b.x - event.x, b.y - event.y))[0] : undefined;
    const species = projectile?.pokemon || partner?.pokemon?.species || attacker?.trainer?.species;
    if (!species) return;
    this.impacts.push({ age: 0, effect: {
      x: event.x, y: event.y, facing: event.dirX >= 0 ? 1 : -1, species,
      stage: projectile?.form ?? partner?.pokemon?.stage ?? attacker?.trainer?.stage ?? 0,
      mode: projectile ? projectile.tier === 2 ? 'ultimate' : 'shot'
        : partner?.pokemon?.move === 'ultimate' ? 'ultimate' : event.kind === 'bullet' ? 'shot' : 'melee',
      combo: partner?.combo ?? 0,
    } });
    if (this.impacts.length > 48) this.impacts.shift();
  }

  sync(fighters: readonly Fighter[], bullets: readonly Bullet[], alpha: number, time: number): void {
    const delta = Math.min(0.05, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    this.sprites.clear();
    this.passengers.clear();
    this.effects.clear();
    this.muzzles.clear();
    this.heldTargets.clear();
    // Place the holder first so a grabbed Pokémon can follow its moving hands.
    const drawingOrder = [...fighters.filter(f => f.pokemon?.holding), ...fighters.filter(f => !f.pokemon?.holding)];
    for (const f of drawingOrder) {
      const p = f.pokemon;
      if (!p || (!f.alive && (p.move !== 'ko' || p.age >= POKEMON_TIMING.faint + POKEMON_TIMING.recall))) continue;
      const heldAt = this.heldTargets.get(f.id);
      let x = heldAt?.[0] ?? mix(f.px, f.x, alpha);
      let y = heldAt ? heldAt[1] + f.h / 2 : mix(f.py, f.y, alpha);
      const trainer = fighters[f.master];
      const stage = pokemonStage(p.species, p.stage);
      const palette = p.species === 'charmander' && p.stage >= 3 ? BLUE_FIRE : colors(p.species);
      const flight = stage.flies && !f.grounded && f.flying && !p.perched;
      const mounted = !!(p.mounted && trainer?.trainer?.mounted && trainer.alive);
      const speed = Math.abs(f.vx);
      const cruise = unit(speed / 185);
      const climb = Math.max(-1, Math.min(1, f.vy / 175));
      const motion = this.motion.get(f.id) ?? {
        wings: f.id * 0.13, steps: 0, pitch: 0, air: false, grounded: f.grounded, takeoff: 0, landing: 0, glide: 0,
        perched: !!p.perched, hitch: 0,
      };
      if (p.perched && !motion.perched) {
        motion.hitch = 0.2;
        motion.hitchFrom = [p.goalX, p.goalY];
      }
      motion.perched = !!p.perched;
      motion.hitch = p.perched ? Math.max(0, motion.hitch - delta) : 0;
      if (motion.hitch > 0 && motion.hitchFrom) {
        const hop = unit(1 - motion.hitch / 0.2);
        x = mix(motion.hitchFrom[0], x, hop);
        y = mix(motion.hitchFrom[1], y, hop) - Math.sin(hop * Math.PI) * 5;
      }
      motion.takeoff = !flight ? 0 : motion.grounded ? 0.25 : Math.max(0, motion.takeoff - delta);
      motion.landing = f.grounded && !motion.grounded ? 0.24 : Math.max(0, motion.landing - delta);
      if (motion.takeoff > 0) motion.wings = 0.5;
      motion.air = flight;
      motion.grounded = f.grounded;
      const flightStyle: PokemonFlight = !flight ? 'none'
        : f.sprintDir !== 0 || speed > 255 ? 'sprint' : speed > 36 ? 'cruise' : 'hover';
      const glide = flightStyle === 'sprint' ? 2 : flightStyle === 'cruise' ? 1 : 0;
      motion.glide = flight ? mix(motion.glide, glide, 1 - Math.exp(-delta * 8)) : 0;
      if (flight && motion.takeoff <= 0) {
        const cadence = flightStyle === 'hover' ? 2.15 + Math.max(0, -climb) * 0.5 : flightStyle === 'sprint' ? 3.6 : 1.65;
        motion.wings += delta * cadence;
      }
      if (!flight && speed > 9) {
        const cadence = Math.min(4.8, speed > 112 ? 2.1 + speed / 110 : 1.1 + speed / 65);
        motion.steps += delta * cadence;
      }
      const tilt = flight
        ? climb * 0.16
        : !f.grounded ? cruise * 0.11 + climb * 0.1 : 0;
      motion.pitch = mix(motion.pitch, tilt, 1 - Math.exp(-delta * 11));
      this.motion.set(f.id, motion);
      const guarding = (p.move === 'guard' || p.mounted) && f.state === 'block';
      const strike = p.move === 'kick' || p.move === 'punch' && f.combo === 2 ? 'kick'
        : p.move === 'punch' && f.combo === 1 ? 'backhand' : p.move === 'punch' ? 'punch' : null;
      const target = fighters[p.target];
      const melee = pokemonMelee(p.species, p.stage, p.move === 'kick' || f.combo === 2);
      const windingUp = strike && !p.fired && target?.alive
        && Math.abs(target.x - f.x) < (f.w + target.w) / 2 + melee.reach + 3 && Math.abs(target.y - f.y) < f.h;
      const movement: PokemonPose = motion.takeoff > 0 ? 'takeoff' : motion.landing > 0 && speed < 112 ? 'land'
        : !f.grounded && !flight ? 'air' : !flight && speed > 112 ? 'run' : !flight && speed > 9 ? 'walk' : 'idle';
      const seismicToss = p.species === 'charmander' && p.stage === 2 && p.move === 'ultimate';
      const hurting = (f.state === 'flinch' || f.state === 'knockdown');
      const pose: PokemonPose = p.move === 'ko' ? 'faint' : hurting ? 'hurt' : p.perched ? 'cling'
        : guarding ? 'guard' : seismicToss ? p.fired ? 'toss' : 'grab' : strike && p.fired ? melee.hits > 1
          ? p.shots === 1 ? 'punch' : p.shots === 2 ? 'backhand' : 'kick' : strike
        : windingUp ? 'windup' : p.move === 'dash' ? 'dash' : p.move === 'shot' || p.move === 'ultimate' ? 'cast'
        : movement;
      const flightPhase = Math.floor(motion.wings * 8);
      let phase = flight ? flightPhase : pose === 'run' || pose === 'walk' || pose === 'dash' ? Math.floor(motion.steps * 8) : Math.floor(time * 10);
      if (pose === 'punch' || pose === 'backhand' || pose === 'kick') {
        const duration = p.shots < melee.hits ? melee.interval : melee.recovery;
        const elapsed = Math.max(0, p.age - Math.max(0, p.shots - 1) * melee.interval);
        phase = Math.min(7, Math.floor(elapsed / duration * 8));
      }
      else if (pose === 'hurt') phase = Math.min(7, Math.floor(f.stateTime / Math.max(0.2, f.flinchTime) * 8));
      else if (pose === 'faint') phase = Math.min(7, Math.floor(p.age / 0.3 * 8));
      else if (pose === 'takeoff') phase = Math.min(7, Math.floor((1 - motion.takeoff / 0.25) * 8));
      else if (pose === 'land') phase = Math.min(7, Math.floor((1 - motion.landing / 0.24) * 8));
      else if (pose === 'windup') phase = Math.min(7, Math.floor(p.shots / 60 / melee.windup * 8));
      else if (pose === 'grab') phase = Math.min(7, Math.floor(p.age / POKEMON_TIMING.ultimateHit * 8));
      else if (pose === 'toss') phase = Math.min(7, Math.floor((p.age - POKEMON_TIMING.ultimateHit) / 0.25 * 8));
      else if (pose === 'cast') {
        const attack = pokemonAttack(p.species, p.stage, p.move === 'ultimate' ? 'ultimate' : 'shot');
        phase = p.age < attack.windup ? (p.age < attack.windup * 0.55 ? 0 : 1)
          : p.age < attack.windup + attack.active ? 2 + Math.floor((p.age - attack.windup) * 16) % 2
          : Math.min(7, 4 + Math.floor((p.age - attack.windup - attack.active) / attack.recovery * 4));
      }
      let rank = p.stage;
      let white = 0;
      let opacity = 1;
      let showAction = false;
      if (p.move === 'release') {
        const progress = release(this.effects, f, trainer, x, y, alpha, p.age);
        if (progress === 0) continue;
        rank = p.previousStage;
        white = 1 - progress;
        opacity = unit(progress * 4);
      } else if (p.move === 'recall') {
        white = recall(this.effects, f, trainer, x, y, alpha, p.age);
        opacity = 1 - white * white;
      } else if (p.move === 'evolve') {
        const duration = pokemonEvolutionTime(p.species, p.stage, p.previousStage);
        const progress = unit(p.age / duration);
        const major = duration === POKEMON_TIMING.ascend;
        rank = progress < (major ? 0.47 : 0.43) ? p.previousStage : p.stage;
        white = major ? unit(1 - Math.abs(progress - 0.47) * 3.3) ** 2 : Math.sin(progress * Math.PI) ** 1.25;
        if (major) ascension(this.effects, x, y, f.h, progress, palette, pokemonStage(p.species, p.stage).special === 'bond');
        else evolve(this.effects, x, y, f.h, progress, palette);
      } else if (p.move === 'ko') {
        rank = p.previousStage;
        if (p.age < POKEMON_TIMING.faint) {
          const progress = unit(p.age / POKEMON_TIMING.faint);
          white = Math.max(0, 1 - progress * 3) * 0.65;
        } else {
          white = recall(this.effects, f, trainer, x, y, alpha, p.age - POKEMON_TIMING.faint);
          opacity = 1 - white * white;
        }
      } else {
        showAction = true;
        if (f.state === 'flinch' && f.stateTime < 0.075) white = 0.55;
      }
      const frame = pokemonFrame(p.species, rank, pose, phase, flight, flightPhase, flightStyle, motion.glide);
      const attack = p.move === 'shot' || p.move === 'ultimate' && !seismicToss
        ? pokemonAttack(p.species, p.stage, p.move === 'ultimate' ? 'ultimate' : 'shot') : undefined;
      const fireAt = attack?.windup;
      const breath = frame.fire?.muzzle && attack && p.age >= attack.windup && p.age <= attack.windup + attack.active ? 1 : 0;
      const anchors = placePartner(p.perched ? this.passengers : this.sprites, frame, f, x, y, motion, mounted, white, opacity, time, breath);
      if (showAction && !drawPokemonAttack(this.effects, f, p, x, y, anchors.muzzle, time, target)) action(this.effects, f, p, x, y, palette, anchors.muzzle);
      if (anchors.muzzle && fireAt !== undefined && p.age >= fireAt) this.muzzles.set(f.master, anchors.muzzle);
      if (p.holding && anchors.grip) this.heldTargets.set(f.grabTarget, anchors.grip);
    }
    for (const b of bullets) {
      if (!b.active || !b.weapon.startsWith('ash:')) continue;
      const owner = fighters[b.owner];
      if (drawPokemonProjectile(this.effects, b, mix(b.px, b.x, alpha), mix(b.py, b.y, alpha), time)) continue;
      projectile(this.effects, b, mix(b.px, b.x, alpha), mix(b.py, b.y, alpha),
        b.pokemon || owner?.trainer?.species || owner?.pokemon?.species, time, this.muzzles.get(b.owner));
    }
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const impact = this.impacts[i];
      impact.age += delta;
      if (impact.age > (impact.effect.mode === 'ultimate' ? 0.44 : 0.3)) this.impacts.splice(i, 1);
      else drawPokemonImpact(this.effects, impact.effect, impact.age);
    }
  }

  destroy(): void {
    this.sprites.destroy();
    this.passengers.destroy();
    this.effects.destroy();
  }
}
