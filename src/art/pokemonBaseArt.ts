import type { PokemonSpecies } from '../sim/data/pokemon';
import type { Material, Pen } from './pixelRaster';
import type { PokemonPose } from './pokemonArt';

const HIDE = 1, LIGHT = 2, SHADOW = 3, TRIM = 4, ACCENT = 5, WHITE = 6, INK = 7, CORE = 8;
const ivory: Material = { dark: 0xbaa896, base: 0xe7d9bd, light: 0xfff1d2, hi: 0xfffbef };
const ink: Material = { dark: 0x181323, base: 0x242136, light: 0x393953, hi: 0x54516b };
const ruby: Material = { dark: 0x8b233f, base: 0xd94d50, light: 0xf97062, hi: 0xffaa89 };
const amber: Material = { dark: 0xaf6727, base: 0xf6ac31, light: 0xffd357, hi: 0xfff185 };
const leaf: Material = { dark: 0x225f46, base: 0x428647, light: 0x75b94d, hi: 0xb2d562 };

interface Motion {
  lean: number;
  low: number;
  foot: number;
  punch: number;
  kick: number;
}

function motion(pose: PokemonPose, phase: number): Motion {
  const strike = [2, 5, 4, 2][phase];
  return {
    lean: pose === 'dash' ? 3 : pose === 'punch' || pose === 'kick' ? 1 : 0,
    low: pose === 'guard' || pose === 'dash' ? 2 : pose === 'run' && phase % 2 ? 1 : 0,
    foot: pose === 'run' || pose === 'dash' ? [0, 2, 0, -2][phase] : 0,
    punch: pose === 'punch' ? strike : pose === 'cast' ? 3 : 0,
    kick: pose === 'kick' ? strike : 0,
  };
}

function toe(r: Pen, x: number, y: number, m: Motion, color = HIDE): void {
  const lift = m.kick ? Math.max(2, Math.floor(m.kick * 0.72)) : 0;
  r.stroke([[x, y], [x + 1 + m.foot, y + 3 - lift], [x + 4 + m.foot + m.kick, y + 3 - lift]], color, 3);
  r.set(x + 4 + m.foot + m.kick, y + 3 - lift, LIGHT);
}

function face(r: Pen, x: number, y: number, pupil = INK): void {
  r.rect(x, y, 3, 3, INK);
  r.set(x, y, WHITE);
  r.set(x + 1, y + 1, pupil);
}

function charm(r: Pen, m: Motion, phase: number): readonly Material[] {
  const x = m.lean, y = m.low;
  const flick = [0, -2, -1, 0][phase];
  r.stroke([[-2, -4], [-8, -3], [-12, -5], [-13, -8 + flick]], SHADOW, 3);
  r.stroke([[-2, -5], [-8, -4], [-11, -5], [-12, -8 + flick]], HIDE, 2);
  r.poly([[-14, -5 + flick], [-16, -8 + flick], [-14, -12 + flick], [-13, -10 + flick], [-11, -14 + flick],
    [-10, -11 + flick], [-9, -8 + flick], [-11, -5 + flick]], ACCENT);
  r.poly([[-14, -7 + flick], [-14, -9 + flick], [-12, -10 + flick], [-11, -12 + flick], [-10, -8 + flick], [-12, -6 + flick]], CORE);
  r.line(-5 - m.foot, -3, -2 - m.foot, -1, SHADOW, 3);
  r.ellipse(0, -5 + y, 4.6, 5.3, HIDE);
  r.ellipse(2, -5 + y, 2.8, 4.3, LIGHT);
  toe(r, 0, -4, m);
  r.stroke([[0, -8 + y], [3, -6 + y], [5 + m.punch, -7 - Math.min(2, m.punch) + y]], HIDE, 2);
  r.poly([[x - 6, -10 + y], [x - 7, -14 + y], [x - 4, -18 + y], [x + 1, -19 + y],
    [x + 5, -17 + y], [x + 6, -14 + y], [x + 9, -12 + y], [x + 7, -9 + y], [x + 1, -8 + y]], HIDE);
  r.line(x + 3, -10 + y, x + 7, -10 + y, LIGHT);
  face(r, x + 2, -16 + y, TRIM);
  r.set(x + 7, -12 + y, SHADOW);
  r.set(x + 6, -9 + y, ACCENT);
  return [
    { dark: 0xa64631, base: 0xec7936, light: 0xffa04c, hi: 0xffbe75 },
    ivory, { dark: 0x873646, base: 0xb95c31, light: 0xe1803c, hi: 0xf39a52 },
    { dark: 0x20566b, base: 0x32799b, light: 0x4cabbb, hi: 0x7cddd8 }, ruby, ivory, ink, amber,
  ];
}

function turtle(r: Pen, m: Motion, phase: number): readonly Material[] {
  const x = m.lean, y = m.low;
  const tail = phase % 2;
  r.stroke([[-5, -4], [-10, -5], [-13, -8 - tail], [-12, -11 - tail], [-9, -11 - tail], [-8, -9 - tail]], HIDE, 3);
  r.line(-12, -8 - tail, -10, -9 - tail, LIGHT);
  r.line(-5 - m.foot, -4, -3 - m.foot, -1, SHADOW, 3);
  r.ellipse(-3, -6 + y, 6.8, 6, TRIM);
  r.line(-8, -7 + y, -5, -10 + y, CORE);
  r.stroke([[-8, -7 + y], [-5, -5 + y], [-5, -2 + y]], SHADOW);
  r.ellipse(1, -6 + y, 4.1, 5.4, LIGHT);
  r.line(0, -5 + y, 3, -5 + y, TRIM);
  toe(r, 0, -4, m);
  r.stroke([[0, -9 + y], [3, -8 + y], [5 + m.punch, -6 - m.punch * 0.4 + y]], HIDE, 3);
  r.poly([[x - 6, -11 + y], [x - 7, -14 + y], [x - 5, -17 + y], [x - 1, -18 + y], [x + 4, -17 + y],
    [x + 7, -15 + y], [x + 9, -12 + y], [x + 6, -10 + y], [x, -9 + y]], HIDE);
  face(r, x + 2, -15 + y, ACCENT);
  r.line(x + 5, -11 + y, x + 7, -11 + y, INK);
  r.set(x + 7, -13 + y, SHADOW);
  return [
    { dark: 0x267799, base: 0x59bbd4, light: 0x86dfdf, hi: 0xb6f1ee }, ivory,
    { dark: 0x2d5572, base: 0x448fa4, light: 0x68bbc6, hi: 0x9bdedb },
    { dark: 0x59313b, base: 0x8b5540, light: 0xb5774a, hi: 0xd49d62 }, ruby, ivory, ink, amber,
  ];
}

function sprout(r: Pen, m: Motion): readonly Material[] {
  const x = m.lean + m.punch * 0.45, y = m.low;
  r.line(-8 - m.foot, -6, -8 - m.foot, -2, SHADOW, 4);
  r.line(4 + m.foot, -5, 5 + m.foot, -2, SHADOW, 4);
  r.ellipse(-4, -7 + y, 9, 6, HIDE);
  r.line(-9 + m.foot, -6, -9 + m.foot, -2, HIDE, 4);
  toe(r, 3, -4, m);
  r.poly([[-12, -10 + y], [-13, -15 + y], [-11, -20 + y], [-7, -18 + y], [-5, -22 + y], [-2, -18 + y],
    [2, -16 + y], [2, -11 + y], [-4, -9 + y]], TRIM);
  r.stroke([[-11, -18 + y], [-11, -14 + y], [-8, -11 + y]], SHADOW, 2);
  r.stroke([[-4, -20 + y], [-4, -15 + y], [-1, -12 + y]], CORE);
  r.poly([[x - 3, -8 + y], [x - 2, -15 + y], [x + 1, -17 + y], [x + 3, -14 + y], [x + 7, -15 + y],
    [x + 9, -17 + y], [x + 11, -13 + y], [x + 13, -10 + y], [x + 11, -6 + y], [x + 4, -5 + y]], HIDE);
  r.poly([[-10, -9 + y], [-7, -10 + y], [-6, -7 + y], [-9, -6 + y]], SHADOW);
  r.set(x + 2, -10 + y, SHADOW);
  face(r, x + 7, -13 + y, ACCENT);
  r.line(x + 8, -8 + y, x + 12, -9 + y, INK);
  r.set(x + 10, -7 + y, WHITE);
  return [
    { dark: 0x276c65, base: 0x57aa91, light: 0x87d0ad, hi: 0xb3e2b9 }, ivory,
    { dark: 0x27534b, base: 0x387960, light: 0x629975, hi: 0x8bc699 }, leaf, ruby, ivory, ink,
    { dark: 0x3a7342, base: 0x77a94e, light: 0xa0cb60, hi: 0xc5e074 },
  ];
}

function pika(r: Pen, m: Motion, phase: number): readonly Material[] {
  const x = m.lean, y = m.low;
  const flick = [0, -1, -2, -1][phase];
  r.poly([[-4, -4], [-9, -5], [-8, -9], [-13, -8], [-13, -12 + flick], [-18, -11 + flick],
    [-15, -17 + flick], [-8, -18 + flick], [-10, -13 + flick], [-5, -14], [-6, -7], [-2, -7]], LIGHT);
  r.line(-7, -7, -3, -5, TRIM, 2);
  r.line(-5 - m.foot, -3, -2 - m.foot, -1, TRIM, 3);
  r.ellipse(-1, -5 + y, 5, 5, HIDE);
  r.line(-5, -7 + y, -2, -7 + y, TRIM, 2);
  toe(r, 0, -4, m);
  r.stroke([[1, -7 + y], [4 + m.punch, -6 - m.punch * 0.4 + y]], HIDE, 3);
  r.poly([[x - 4, -11 + y], [x - 10, -18 + y], [x - 10, -21 + y], [x - 6, -19 + y], [x - 1, -13 + y]], HIDE);
  r.poly([[x + 2, -13 + y], [x + 6, -21 + y], [x + 9, -22 + y], [x + 7, -16 + y], [x + 5, -12 + y]], HIDE);
  r.line(x - 10, -20 + y, x - 8, -18 + y, INK, 2);
  r.line(x + 8, -21 + y, x + 7, -19 + y, INK, 2);
  r.ellipse(x + 1, -12 + y, 6.5, 5.2, HIDE);
  r.rect(x + 3, -14 + y, 2, 2, INK);
  r.set(x + 3, -14 + y, WHITE);
  r.ellipse(x + 1, -10 + y, 2.3, 1.9, ACCENT);
  r.set(x, -11 + y, WHITE);
  r.set(x + 6, -10 + y, ACCENT);
  r.set(x + 7, -11 + y, INK);
  return [amber, { dark: 0xc98422, base: 0xffc136, light: 0xffde5b, hi: 0xfff7a0 }, ink,
    { dark: 0x664132, base: 0x8e5434, light: 0xb47b40, hi: 0xd39c56 }, ruby, ivory, ink, amber];
}

function bubble(r: Pen, m: Motion): readonly Material[] {
  const x = m.lean, y = m.low;
  r.stroke([[-4, -7], [-8 - m.foot, -4], [-5 - m.foot, -2]], SHADOW, 3);
  r.ellipse(-2, -6 + y, 5.1, 5, HIDE);
  toe(r, 1, -4, m);
  r.ellipse(-6, -10 + y, 4.5, 3.2, LIGHT);
  r.ellipse(-9, -13 + y, 2.6, 2.5, WHITE);
  r.ellipse(-4, -13 + y, 3, 3, WHITE);
  r.set(-8, -10 + y, TRIM);
  r.ellipse(x + 2, -12 + y, 6.5, 4.6, HIDE);
  r.ellipse(x - 2, -15 + y, 3.2, 3, HIDE);
  r.ellipse(x + 5, -15 + y, 3.8, 4, TRIM);
  r.line(x + 5, -18 + y, x + 5, -13 + y, INK, 2);
  r.set(x + 4, -17 + y, WHITE);
  r.line(x + 1, -11 + y, x + 6, -11 + y, SHADOW);
  r.stroke([[1, -9 + y], [4, -7 + y], [6 + m.punch, -5 - m.punch * 0.45 + y]], HIDE, 2);
  return [
    { dark: 0x306884, base: 0x66b8d4, light: 0x8ce0e5, hi: 0xb3f5f0 }, ivory,
    { dark: 0x28536d, base: 0x417d9a, light: 0x60a8bf, hi: 0x9dd5d6 }, amber, ruby, ivory, ink, amber,
  ];
}

function gecko(r: Pen, m: Motion, phase: number): readonly Material[] {
  const x = m.lean, y = m.low, flick = phase % 2;
  r.poly([[-3, -5], [-9, -5], [-14, -8 - flick], [-17, -12 - flick], [-15, -14 - flick],
    [-12, -11 - flick], [-9, -13 - flick], [-8, -9], [-3, -8]], TRIM);
  r.line(-14, -10 - flick, -7, -7, LIGHT);
  r.line(-4 - m.foot, -5, -3 - m.foot, -2, TRIM, 3);
  r.ellipse(-1, -7 + y, 4.7, 6.7, HIDE);
  r.ellipse(1, -7 + y, 2.4, 4.3, ACCENT);
  toe(r, 0, -4, m);
  r.poly([[x - 6, -11 + y], [x - 5, -16 + y], [x - 1, -19 + y], [x + 4, -19 + y], [x + 8, -16 + y],
    [x + 10, -13 + y], [x + 7, -10 + y], [x + 1, -9 + y]], HIDE);
  r.line(x + 2, -16 + y, x + 6, -15 + y, CORE, 2);
  r.line(x + 5, -16 + y, x + 5, -15 + y, INK);
  r.line(x + 5, -12 + y, x + 8, -13 + y, INK);
  r.stroke([[1, -9 + y], [4, -7 + y], [6 + m.punch, -6 - m.punch * 0.4 + y]], HIDE, 2);
  r.line(6 + m.punch, -6 - m.punch * 0.4 + y, 8 + m.punch, -6 - m.punch * 0.4 + y, LIGHT);
  return [
    { dark: 0x2f865c, base: 0x63b96a, light: 0x98d57c, hi: 0xc9e998 },
    { dark: 0x407d4b, base: 0x7bc267, light: 0xa7db7a, hi: 0xcce98d }, ink, leaf, ruby, ivory, ink, amber,
  ];
}

function pup(r: Pen, m: Motion): readonly Material[] {
  const x = m.lean, y = m.low;
  r.stroke([[-4, -6], [-9, -7], [-12, -11]], HIDE, 2);
  r.stroke([[-4, -6], [-6 - m.foot, -3], [-3 - m.foot, -2]], SHADOW, 3);
  r.ellipse(-1, -8 + y, 4.5, 6, HIDE);
  r.ellipse(1, -10 + y, 2.5, 4, SHADOW);
  toe(r, 0, -4, m);
  r.poly([[x - 5, -14 + y], [x - 8, -21 + y], [x - 7, -24 + y], [x - 3, -22 + y], [x, -16 + y]], HIDE);
  r.poly([[x + 2, -16 + y], [x + 5, -24 + y], [x + 7, -22 + y], [x + 7, -16 + y], [x + 4, -13 + y]], HIDE);
  r.stroke([[x - 4, -14 + y], [x - 7, -10 + y], [x - 7, -7 + y]], SHADOW, 2);
  r.ellipse(x, -15 + y, 5.5, 4.3, HIDE);
  r.poly([[x - 2, -16 + y], [x + 3, -17 + y], [x + 7, -15 + y], [x + 8, -12 + y], [x + 3, -11 + y]], INK);
  r.ellipse(x + 3, -16 + y, 2.5, 2.1, SHADOW);
  r.set(x + 4, -16 + y, ACCENT);
  r.set(x + 2, -17 + y, WHITE);
  r.line(x + 4, -13 + y, x + 7, -13 + y, HIDE);
  r.set(x + 8, -13 + y, INK);
  r.stroke([[2, -10 + y], [4, -8 + y], [6 + m.punch, -7 - m.punch * 0.4 + y]], HIDE, 3);
  r.set(6 + m.punch, -8 - m.punch * 0.4 + y, WHITE);
  return [
    { dark: 0x2d4c78, base: 0x4e8fbd, light: 0x71bce2, hi: 0x9bdaea }, ivory, ink, leaf, ruby, ivory, ink, amber,
  ];
}

function jaw(r: Pen, m: Motion): readonly Material[] {
  const x = m.lean, y = m.low;
  r.stroke([[-3, -4], [-8, -4], [-11, -8]], SHADOW, 3);
  r.line(-5 - m.foot, -5, -5 - m.foot, -2, SHADOW, 3);
  r.ellipse(-1, -7 + y, 6.7, 6.4, HIDE);
  r.ellipse(1, -5 + y, 3.6, 4.2, ACCENT);
  toe(r, 0, -4, m);
  r.poly([[x - 8, -11 + y], [x - 5, -16 + y], [x - 6, -20 + y], [x - 3, -21 + y], [x, -17 + y],
    [x + 5, -17 + y], [x + 9, -14 + y], [x + 11, -10 + y], [x + 8, -7 + y], [x + 1, -7 + y]], HIDE);
  r.poly([[x - 5, -11 + y], [x - 13, -12 + y], [x - 12, -15 + y], [x - 6, -15 + y]], SHADOW);
  r.line(x - 11, -13 + y, x - 8, -13 + y, ACCENT, 2);
  r.poly([[x + 6, -16 + y], [x + 11, -18 + y], [x + 13, -16 + y], [x + 9, -13 + y]], SHADOW);
  r.set(x + 11, -16 + y, ACCENT);
  face(r, x + 4, -15 + y, INK);
  r.stroke([[x + 2, -10 + y], [x + 6, -9 + y], [x + 10, -11 + y]], INK, 2);
  r.set(x + 6, -10 + y, WHITE);
  r.set(x + 9, -10 + y, WHITE);
  r.stroke([[3, -7 + y], [6 + m.punch, -6 - m.punch * 0.4 + y]], HIDE, 3);
  return [
    { dark: 0x343a64, base: 0x6273a3, light: 0x8d9dcd, hi: 0xb5c2e3 }, ivory,
    { dark: 0x29223f, base: 0x484b76, light: 0x656b9e, hi: 0x8a92b8 }, leaf, ruby, ivory, ink, amber,
  ];
}

export const BASE_POKEMON_SCALE: Record<PokemonSpecies, number> = {
  charmander: 0.80, squirtle: 0.77, bulbasaur: 0.73, pikachu: 0.65,
  froakie: 0.71, treecko: 0.72, riolu: 0.74, gible: 0.74,
};

export function basePokemon(r: Pen, species: PokemonSpecies, pose: PokemonPose, phase: number): readonly Material[] {
  const m = motion(pose, phase);
  switch (species) {
    case 'charmander': return charm(r, m, phase);
    case 'squirtle': return turtle(r, m, phase);
    case 'bulbasaur': return sprout(r, m);
    case 'pikachu': return pika(r, m, phase);
    case 'froakie': return bubble(r, m);
    case 'treecko': return gecko(r, m, phase);
    case 'riolu': return pup(r, m);
    case 'gible': return jaw(r, m);
  }
}
