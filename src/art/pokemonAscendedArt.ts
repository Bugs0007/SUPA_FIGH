import type { PokemonSpecies } from '../sim/data/pokemon';
import type { Material, Pen } from './pixelRaster';
import type { PokemonPose } from './pokemonArt';

const BODY = 1, LIGHT = 2, SHADOW = 3, ARMOR = 4, ACCENT = 5, PALE = 6, DETAIL = 7, CORE = 8;
const ink: Material = { dark: 0x171523, base: 0x252135, light: 0x3d3752, hi: 0x625c7d };
const ivory: Material = { dark: 0x99859a, base: 0xc8b8bd, light: 0xf6e7d7, hi: 0xffffe7 };
const red: Material = { dark: 0x741f3a, base: 0xbd374d, light: 0xf15d69, hi: 0xffa093 };
const steel: Material = { dark: 0x363b57, base: 0x697791, light: 0x9aacbb, hi: 0xd9e6e7 };
const water: Material = { dark: 0x21639b, base: 0x368bc1, light: 0x61c7e4, hi: 0xaef2fa };
const cyan: Material = { dark: 0x206594, base: 0x40b7e4, light: 0x6ee8fa, hi: 0xd2ffff };
const yellow: Material = { dark: 0xbb6f29, base: 0xf4b63f, light: 0xffd955, hi: 0xfff38e };
const green: Material = { dark: 0x285c51, base: 0x458d58, light: 0x79bd65, hi: 0xb4e686 };
const purple: Material = { dark: 0x302d54, base: 0x49567e, light: 0x687fa9, hi: 0x9cb3d0 };

function gait(pose: PokemonPose, phase: number): number {
  return pose === 'run' || pose === 'dash' ? [0, 3, 0, -3][phase] : 0;
}

function reach(pose: PokemonPose, phase: number): number {
  return pose === 'punch' ? [4, 11, 9, 5][phase] : pose === 'dash' ? 7 : pose === 'cast' ? 5 : 0;
}

function kick(pose: PokemonPose, phase: number): number {
  return pose === 'kick' ? [5, 12, 10, 6][phase] : 0;
}

function eye(r: Pen, x: number, y: number, c = ACCENT): void {
  r.line(x - 2, y - 1, x + 4, y + 1, DETAIL, 3);
  r.line(x, y, x + 3, y + 1, c, 2);
  r.set(x + 2, y, PALE);
}

function blueFlame(r: Pen, x: number, y: number, phase: number, drift: number): void {
  const tip = [0, -4, -2, 1][phase];
  r.poly([[x - 3, y + 4], [x - 7 + drift, y - 2], [x - 5 + drift, y - 9 + tip], [x - 2, y - 6],
    [x + drift, y - 15 + tip], [x + 5 + drift, y - 10], [x + 6, y - 3], [x + 3, y + 3]], ARMOR);
  r.poly([[x - 3, y + 1], [x - 4 + drift, y - 5], [x, y - 4], [x + drift, y - 10 + tip],
    [x + 3, y - 5], [x + 3, y], [x, y + 3]], CORE);
}

function dragonX(r: Pen, pose: PokemonPose, phase: number, flying: boolean): readonly Material[] {
  const step = gait(pose, phase);
  const arm = reach(pose, phase);
  const heel = kick(pose, phase);
  const tuck = pose === 'guard' ? 4 : 0;
  const bank = flying ? [-9, -3, 7, -3][phase] : [-2, 0, 2, 0][phase];
  const neck = pose === 'dash' ? 8 : flying ? 5 : 0;
  const fx = 2 + neck;
  const hy = -40 + tuck;
  r.poly([[-5, -21], [1, -37], [7, -50 + bank], [11, -44 + bank], [13, -34 + bank],
    [17, -25], [7, -27], [3, -21]], SHADOW);
  r.poly([[-1, -24], [3, -36], [7, -46 + bank], [10, -40 + bank], [11, -34 + bank], [7, -31], [4, -27]], ARMOR);
  r.stroke([[-7, -9], [-16, -6], [-29, -8], [-38, -17], [-40, -23]], SHADOW, 7);
  r.stroke([[-8, -11], [-19, -9], [-29, -11], [-37, -18]], BODY, 4);
  r.line(-36, -17, -39, -22, LIGHT, 2);
  blueFlame(r, -40, -22, phase, -1);
  r.poly([[-4, -19], [-13, -26], [-21, -33 + bank], [-24, -43 + bank], [-34, -46 + bank],
    [-39, -40 + bank], [-47, -37 + bank], [-45, -30 + bank], [-35, -31 + bank],
    [-33, -22 + bank], [-27, -25 + bank], [-19, -17 + bank], [-15, -20]], BODY);
  r.poly([[-6, -19], [-18, -27], [-25, -42 + bank], [-35, -42 + bank], [-43, -35 + bank],
    [-34, -34 + bank], [-32, -25 + bank], [-27, -28 + bank], [-21, -20 + bank], [-15, -23]], ARMOR);
  r.stroke([[-24, -40 + bank], [-27, -31 + bank], [-32, -25 + bank]], SHADOW, 2);
  r.stroke([[-24, -40 + bank], [-23, -32 + bank], [-21, -20 + bank]], BODY, 2);
  r.line(-33, -42 + bank, -27, -39 + bank, CORE, 2);
  r.stroke([[1, -13], [7 - step, flying ? -11 : -5], [11 - step, flying ? -8 : -2]], SHADOW, 7);
  r.ellipse(-1, -14 + tuck, 12, 13, BODY);
  r.poly([[-3, -11 + tuck], [2, -26 + tuck], [4 + neck, -34 + tuck], [13 + neck, -35 + tuck],
    [15 + neck, -29 + tuck], [11, -23 + tuck], [10, -13 + tuck], [6, -6 + tuck]], BODY);
  r.poly([[7 + neck, -28 + tuck], [11 + neck, -27 + tuck], [10, -19 + tuck], [8, -10 + tuck],
    [4, -5 + tuck], [-2, -5 + tuck], [-5, -12 + tuck], [0, -20 + tuck]], LIGHT);
  r.line(-3, -12 + tuck, 7, -12 + tuck, ARMOR);
  r.line(1, -19 + tuck, 9, -18 + tuck, ARMOR);
  const toes = flying ? -7 : -2 - heel * 0.46;
  r.stroke([[-6, -10], [-8 + step, -6 - heel * 0.3], [-2 + step + heel, toes]], BODY, 7);
  r.line(-1 + step + heel, toes, 5 + step + heel, toes, PALE, 2);
  r.poly([[6, -28 + tuck], [9, -30 + tuck], [14, -26 + tuck], [12, -20 + tuck]], CORE);
  r.stroke([[6, -25 + tuck], [11, -22 + tuck], [17 + arm, -20 - arm * 0.4 + tuck]], BODY, 5);
  r.line(16 + arm, -20 - arm * 0.4 + tuck, 21 + arm, -21 - arm * 0.4 + tuck, PALE, 2);
  r.poly([[fx, hy + 5], [fx - 3, hy - 5], [fx - 7, hy - 10], [fx + 1, hy - 8], [fx + 6, hy - 4],
    [fx + 11, hy - 4], [fx + 9, hy - 12], [fx + 15, hy - 9], [fx + 18, hy - 3],
    [fx + 22, hy + 1], [fx + 29, hy + 4], [fx + 30, hy + 8], [fx + 25, hy + 11], [fx + 11, hy + 9]], BODY);
  r.poly([[fx + 6, hy + 4], [fx + 12, hy + 4], [fx + 17, hy + 8], [fx + 26, hy + 8], [fx + 22, hy + 12], [fx + 10, hy + 10]], LIGHT);
  eye(r, fx + 14, hy + 1, ACCENT);
  r.line(fx + 18, hy + 8, fx + 28, hy + 7, DETAIL, 2);
  r.set(fx + 26, hy + 5, DETAIL);
  r.set(fx + 23, hy + 7, PALE);
  r.poly([[fx + 24, hy + 8], [fx + 30, hy + 8], [fx + 37, hy + 5], [fx + 34, hy + 10 + phase % 2],
    [fx + 28, hy + 13], [fx + 23, hy + 12]], CORE);
  return [
    { dark: 0x212536, base: 0x343e54, light: 0x526178, hi: 0x71829a }, cyan, ink,
    { dark: 0x244672, base: 0x326891, light: 0x4c9bb8, hi: 0x77cfe1 }, red, ivory, ink, cyan,
  ];
}

function cannonTurtle(r: Pen, pose: PokemonPose, phase: number): readonly Material[] {
  const step = gait(pose, phase), arm = reach(pose, phase), heel = kick(pose, phase);
  const low = pose === 'guard' ? 4 : 0;
  const recoil = pose === 'cast' ? [0, 5, 3, 1][phase] : 0;
  r.stroke([[-11, -10], [-23, -9], [-29, -14]], BODY, 5);
  r.stroke([[0, -12], [6 - step, -6], [13 - step, -3]], SHADOW, 7);
  r.ellipse(-7, -17 + low, 17, 17, SHADOW);
  r.poly([[-8, -35 + low], [-17, -35 + low], [-23, -29 + low], [-23, -18 + low],
    [-19, -10 + low], [-9, -5 + low], [1, -7 + low], [8, -17 + low], [6, -27 + low]], ARMOR);
  r.stroke([[-21, -24 + low], [-13, -20 + low], [-7, -27 + low], [-13, -33 + low]], SHADOW, 2);
  r.stroke([[-13, -20 + low], [-13, -13 + low], [-19, -11 + low]], SHADOW, 2);
  r.stroke([[-13, -13 + low], [-6, -8 + low], [3, -13 + low]], SHADOW, 2);
  r.ellipse(5, -16 + low, 10, 14, LIGHT);
  r.stroke([[-1, -20 + low], [7, -19 + low], [13, -22 + low]], ARMOR, 2);
  r.stroke([[-2, -14 + low], [7, -13 + low], [13, -15 + low]], ARMOR, 2);
  r.line(4, -24 + low, 4, -8 + low, ARMOR);
  r.stroke([[-6, -10], [-6 + step, -6 - heel * 0.3], [1 + step + heel, -3 - heel * 0.5]], BODY, 8);
  r.line(1 + step + heel, -3 - heel * 0.5, 7 + step + heel, -3 - heel * 0.5, PALE, 2);
  // Back cannon is supported at its base by the shell's high shoulder plate.
  r.poly([[-18, -29 + low], [-22, -38 + low], [-20, -45 + low], [-11, -50 + low], [6 - recoil, -50 + low],
    [10 - recoil, -47 + low], [23 - recoil, -47 + low], [24 - recoil, -38 + low], [6 - recoil, -37 + low],
    [1, -34 + low], [-8, -34 + low], [-8, -29 + low]], ACCENT);
  r.stroke([[-19, -42 + low], [-11, -47 + low], [4 - recoil, -47 + low]], PALE, 2);
  r.line(7 - recoil, -47 + low, 7 - recoil, -38 + low, SHADOW, 2);
  r.rect(20 - recoil, -46 + low, 5, 9, LIGHT);
  r.rect(22 - recoil, -44 + low, 4, 6, DETAIL);
  r.set(24 - recoil, -41 + low, CORE);
  const nx = pose === 'dash' ? 5 : 0;
  r.poly([[4, -23 + low], [4 + nx, -32 + low], [6 + nx, -38 + low], [12 + nx, -34 + low], [18 + nx, -34 + low],
    [21 + nx, -37 + low], [23 + nx, -31 + low], [29 + nx, -27 + low], [28 + nx, -22 + low], [19 + nx, -20 + low]], BODY);
  eye(r, 18 + nx, -30 + low, CORE);
  r.line(20 + nx, -24 + low, 28 + nx, -25 + low, DETAIL);
  r.stroke([[7, -21 + low], [13, -16 + low], [20 + arm, -16 - arm * 0.28 + low]], BODY, 8);
  r.stroke([[12, -18 + low], [18 + arm, -16 - arm * 0.28 + low], [24 + arm, -17 - arm * 0.28 + low]], ACCENT, 5);
  r.line(24 + arm, -19 - arm * 0.28 + low, 24 + arm, -15 - arm * 0.28 + low, DETAIL, 2);
  r.set(24 + arm, -17 - arm * 0.28 + low, CORE);
  return [water, { dark: 0x9a7a64, base: 0xc7a472, light: 0xeac492, hi: 0xffddae },
    { dark: 0x473244, base: 0x63484e, light: 0x93644f, hi: 0xba8862 },
    { dark: 0x4e343e, base: 0x8c5d43, light: 0xbc8655, hi: 0xe0b47b }, steel, ivory, ink, cyan];
}

function flowerTurtle(r: Pen, pose: PokemonPose, phase: number): readonly Material[] {
  const step = gait(pose, phase), arm = reach(pose, phase), heel = kick(pose, phase);
  const low = pose === 'guard' ? 4 : 0;
  r.stroke([[-18, -11], [-21 - step, -5], [-16 - step, -3]], SHADOW, 10);
  r.stroke([[8, -13], [11 + step, -6], [15 + step, -3]], SHADOW, 9);
  r.ellipse(-6, -15 + low, 24, 14, BODY);
  r.poly([[-26, -15 + low], [-23, -20 + low], [-17, -21 + low], [-13, -17 + low], [-16, -13 + low], [-22, -10 + low]], SHADOW);
  r.stroke([[-18, -12], [-23 + step, -6], [-18 + step, -3]], BODY, 11);
  r.stroke([[6, -12], [5 - step, -7], [12 - step + heel, -3 - heel * 0.35]], BODY, 10);
  r.line(11 - step + heel, -3 - heel * 0.35, 16 - step + heel, -3 - heel * 0.35, PALE, 2);
  r.line(-20 + step, -3, -14 + step, -3, PALE, 2);
  r.stroke([[-5, -23 + low], [-8, -34 + low], [-8, -43 + low]], CORE, 12);
  r.line(-10, -36 + low, -9, -26 + low, LIGHT, 2);
  const leaf = -35 + low;
  r.poly([[-8, leaf - 3], [-21, leaf - 5], [-40, leaf], [-46, leaf + 6], [-38, leaf + 6], [-38, leaf + 11],
    [-27, leaf + 9], [-24, leaf + 13], [-12, leaf + 8], [-3, leaf + 4]], ARMOR);
  r.poly([[-10, leaf - 4], [6, leaf - 6], [20, leaf - 4], [31, leaf + 2], [21, leaf + 5],
    [21, leaf + 8], [10, leaf + 7], [5, leaf + 11], [-8, leaf + 5]], ARMOR);
  r.stroke([[-6, leaf], [-22, leaf + 3], [-38, leaf + 5]], LIGHT, 2);
  r.stroke([[-8, leaf - 1], [8, leaf + 1], [22, leaf + 3]], LIGHT, 2);
  const fy = -48 + low + (phase % 2);
  r.poly([[-12, fy + 2], [-23, fy - 5], [-39, fy - 4], [-46, fy + 1], [-39, fy + 6], [-26, fy + 9],
    [-15, fy + 7], [-8, fy + 8], [1, fy + 10], [16, fy + 8], [29, fy + 2], [25, fy - 4], [11, fy - 5], [-2, fy]], ACCENT);
  r.poly([[-23, fy + 1], [-20, fy - 6], [-11, fy - 9], [-5, fy - 8], [5, fy - 7], [7, fy - 2], [1, fy + 4], [-14, fy + 5]], ACCENT);
  r.ellipse(-8, fy, 9, 4, CORE);
  r.line(-13, fy, -5, fy - 2, LIGHT, 2);
  for (const [x, y] of [[-40, 1], [-33, 3], [-28, -3], [-24, 5], [-18, -5], [-9, -7], [8, -4], [17, 4], [22, 1], [6, 7]]) r.set(x, fy + y, PALE);
  const hx = 14 + arm * 0.55;
  r.poly([[hx - 10, -16 + low], [hx - 9, -28 + low], [hx - 4, -32 + low], [hx + 1, -26 + low],
    [hx + 7, -27 + low], [hx + 13, -32 + low], [hx + 15, -24 + low], [hx + 20, -19 + low],
    [hx + 19, -13 + low], [hx + 11, -9 + low], [hx - 1, -10 + low]], BODY);
  r.ellipse(hx + 6, -26 + low, 4, 2.5, ACCENT);
  r.set(hx + 6, -27 + low, CORE);
  eye(r, hx + 11, -23 + low);
  r.line(hx + 7, -15 + low, hx + 18, -16 + low, DETAIL, 2);
  r.line(hx + 12, -15 + low, hx + 15, -14 + low, PALE, 2);
  return [{ dark: 0x2b6e68, base: 0x54a589, light: 0x80c7a0, hi: 0xaadcae }, yellow,
    { dark: 0x285252, base: 0x3d7466, light: 0x619382, hi: 0x8eb4a1 }, green,
    { dark: 0x9a2d58, base: 0xd95276, light: 0xf8798a, hi: 0xffaaa7 }, ivory, ink, yellow];
}

function raichuX(r: Pen, pose: PokemonPose, phase: number): readonly Material[] {
  const arm = reach(pose, phase), heel = kick(pose, phase);
  const hover = [0, -2, -3, -1][phase];
  const x = pose === 'dash' ? 5 : 0;
  const y = hover + (pose === 'guard' ? 3 : 0);
  r.stroke([[-7, -11 + y], [-13, -12 + y], [-21, -10 + y], [-26, -5 + y]], SHADOW, 2);
  r.stroke([[-7, -12 + y], [-14, -15 + y], [-23, -16 + y], [-31, -19 + y]], SHADOW, 2);
  r.poly([[-23, -7 + y], [-29, -8 + y], [-38, -5 + y], [-34, -1 + y], [-44, -1 + y],
    [-41, 2 + y], [-31, 2 + y], [-33, -3 + y], [-25, -3 + y]], ARMOR);
  r.poly([[-28, -18 + y], [-36, -19 + y], [-38, -24 + y], [-47, -24 + y], [-42, -18 + y],
    [-44, -15 + y], [-35, -14 + y], [-34, -17 + y], [-28, -16 + y]], ARMOR);
  r.line(-43, -22 + y, -36, -20 + y, CORE, 2);
  r.line(-41, 0 + y, -35, 0 + y, CORE, 2);
  r.stroke([[-4, -11 + y], [-9, -7 + y], [-9, -4 + y]], SHADOW, 6);
  r.ellipse(-1, -12 + y, 11, 11, BODY);
  r.ellipse(3, -12 + y, 7, 8, LIGHT);
  r.stroke([[2, -9 + y], [5 + heel, -5 - heel * 0.34 + y], [9 + heel, -4 - heel * 0.34 + y]], SHADOW, 5);
  r.poly([[x - 6, -24 + y], [x - 13, -31 + y], [x - 14, -39 + y], [x - 8, -37 + y], [x - 4, -31 + y], [x, -25 + y]], BODY);
  r.poly([[x + 3, -26 + y], [x + 9, -38 + y], [x + 13, -42 + y], [x + 14, -36 + y], [x + 10, -29 + y], [x + 7, -24 + y]], BODY);
  r.line(x - 13, -38 + y, x - 11, -34 + y, DETAIL, 3);
  r.line(x + 13, -41 + y, x + 12, -36 + y, DETAIL, 3);
  r.ellipse(x + 2, -24 + y, 10, 7, BODY);
  r.ellipse(x + 8, -21 + y, 7, 4, LIGHT);
  r.ellipse(x + 4, -22 + y, 3, 2.2, ACCENT);
  eye(r, x + 6, -26 + y, DETAIL);
  r.set(x + 13, -22 + y, DETAIL);
  r.stroke([[5, -17 + y], [10, -13 + y], [13 + arm, -15 - arm * 0.45 + y]], SHADOW, 7);
  r.ellipse(14 + arm, -15 - arm * 0.45 + y, 4.8, 4.4, BODY);
  r.line(12 + arm, -17 - arm * 0.45 + y, 16 + arm, -17 - arm * 0.45 + y, CORE, 2);
  return [yellow, ivory, { dark: 0x774834, base: 0xad713e, light: 0xd39b54, hi: 0xeebd69 },
    { dark: 0x88702d, base: 0xcc9e38, light: 0xffda52, hi: 0xfff490 }, red, ivory, ink, yellow];
}

function battleBond(r: Pen, pose: PokemonPose, phase: number): readonly Material[] {
  const step = gait(pose, phase), arm = reach(pose, phase), heel = kick(pose, phase);
  const low = pose === 'guard' ? 4 : pose === 'dash' ? 2 : 0;
  const flex = [0, 2, -1, -3][phase];
  const hx = pose === 'dash' ? 8 : 1;
  const hy = -33 + low;
  // The water blade travels behind the torso on the shoulder line.
  r.poly([[-11, -24 + low], [-13, -39 + low], [-23, -50 + low], [-26, -44 + low], [-22, -32 + low], [-36, -38 + low],
    [-43, -36 + low], [-35, -27 + low], [-24, -25 + low], [-36, -16 + low], [-41, -5 + low],
    [-30, -8 + low], [-20, -18 + low], [-19, -11 + low], [-12, -4 + low], [-12, -18 + low]], ARMOR);
  r.stroke([[-23, -48 + low], [-21, -35 + low], [-17, -24 + low], [-34, -11 + low]], CORE, 2);
  r.line(-39, -35 + low, -19, -25 + low, LIGHT, 2);
  r.stroke([[-4, -14], [-12 + step, -7], [-9 + step, -3]], SHADOW, 6);
  r.stroke([[4, -13], [12 - step, -8 - heel * 0.45], [16 - step + heel, -3 - heel * 0.5]], BODY, 6);
  r.line(15 - step + heel, -3 - heel * 0.5, 20 - step + heel, -3 - heel * 0.5, PALE, 2);
  r.ellipse(-1, -16 + low, 7, 10, BODY);
  r.ellipse(3, -17 + low, 4, 6, LIGHT);
  r.stroke([[-5, -26 + low], [-15, -22 + flex], [-27, -24 + flex], [-34, -17 + flex]], ACCENT, 4);
  r.poly([[hx - 9, hy + 5], [hx - 13, hy - 7], [hx - 9, hy - 10], [hx - 1, hy - 6], [hx + 5, hy - 7],
    [hx + 12, hy - 13], [hx + 16, hy - 8], [hx + 14, hy + 2], [hx + 10, hy + 8], [hx + 2, hy + 10]], BODY);
  r.poly([[hx - 11, hy - 8], [hx - 9, hy - 10], [hx, hy - 4], [hx - 4, hy - 1]], DETAIL);
  r.poly([[hx + 9, hy - 8], [hx + 13, hy - 13], [hx + 16, hy - 8], [hx + 13, hy]], DETAIL);
  r.poly([[hx + 3, hy - 7], [hx + 8, hy - 8], [hx + 12, hy - 3], [hx + 10, hy + 2], [hx + 5, hy + 3], [hx + 4, hy]], ACCENT);
  eye(r, hx + 8, hy + 1, CORE);
  r.stroke([[hx - 6, hy + 6], [hx + 2, hy + 8], [hx + 11, hy + 6]], ACCENT, 4);
  r.stroke([[4, -20 + low], [10, -15 + low], [15 + arm, -14 - arm * 0.6 + low]], BODY, 5);
  r.line(14 + arm, -14 - arm * 0.6 + low, 19 + arm, -14 - arm * 0.6 + low, PALE, 2);
  r.ellipse(10 - step, -8 - heel * 0.45, 2.1, 2.2, PALE);
  return [{ dark: 0x25346b, base: 0x405ca0, light: 0x5e80cc, hi: 0x9aaaf0 }, ivory, purple, water,
    { dark: 0x9f234b, base: 0xd64162, light: 0xff7081, hi: 0xffa49c }, ivory, ink, cyan];
}

function megaGecko(r: Pen, pose: PokemonPose, phase: number): readonly Material[] {
  const step = gait(pose, phase), arm = reach(pose, phase), heel = kick(pose, phase);
  const low = pose === 'guard' ? 4 : 0;
  const tw = [0, 2, -2, -1][phase];
  r.poly([[-7, -12], [-15, -13], [-25, -12 + tw], [-26, -16 + tw], [-34, -15 + tw],
    [-33, -20 + tw], [-41, -19 + tw], [-39, -23 + tw], [-50, -26 + tw], [-40, -28 + tw],
    [-41, -31 + tw], [-33, -30 + tw], [-33, -34 + tw], [-26, -30 + tw], [-23, -32 + tw],
    [-15, -26 + tw], [-8, -23], [-1, -17]], ARMOR);
  r.stroke([[-46, -26 + tw], [-34, -25 + tw], [-22, -23 + tw], [-6, -17]], LIGHT, 2);
  r.line(-38, -29 + tw, -35, -20 + tw, ACCENT, 2);
  r.line(-28, -30 + tw, -24, -16 + tw, ACCENT, 2);
  r.line(-18, -27 + tw, -14, -15 + tw, ACCENT, 2);
  r.stroke([[-4, -12], [-9 + step, -7], [-6 + step, -2]], SHADOW, 7);
  r.stroke([[3, -12], [8 - step, -7 - heel * 0.4], [13 - step + heel, -3 - heel * 0.46]], BODY, 7);
  r.line(12 - step + heel, -3 - heel * 0.46, 17 - step + heel, -3 - heel * 0.46, LIGHT, 2);
  r.ellipse(-1, -16 + low, 8, 12, BODY);
  r.poly([[4, -25 + low], [7, -21 + low], [8, -15 + low], [5, -8 + low], [2, -10 + low], [1, -19 + low]], ACCENT);
  for (const [x, y, sz] of [[-9, -17, 2.5], [-9, -23, 3], [-7, -29, 3.2], [-5, -34, 2.6]]) r.ellipse(x, y + low, sz, sz, CORE);
  const hx = pose === 'dash' ? 6 : 1;
  r.poly([[hx - 8, -31 + low], [hx - 12, -42 + low], [hx - 10, -47 + low], [hx - 6, -41 + low], [hx - 3, -36 + low],
    [hx + 4, -38 + low], [hx + 9, -42 + low], [hx + 10, -36 + low], [hx + 16, -31 + low],
    [hx + 18, -28 + low], [hx + 13, -25 + low], [hx + 2, -25 + low]], BODY);
  r.line(hx - 10, -45 + low, hx - 8, -42 + low, ACCENT, 2);
  eye(r, hx + 9, -34 + low, CORE);
  r.line(hx + 11, -28 + low, hx + 17, -29 + low, DETAIL);
  r.stroke([[4, -23 + low], [10, -18 + low], [14 + arm, -17 - arm * 0.5 + low]], BODY, 5);
  r.poly([[7, -23 + low], [14 + arm, -22 - arm * 0.5 + low], [24 + arm, -23 - arm * 0.5 + low],
    [22 + arm, -18 - arm * 0.5 + low], [28 + arm, -18 - arm * 0.5 + low], [18 + arm, -13 - arm * 0.5 + low], [10, -15 + low]], ARMOR);
  r.line(18 + arm, -17 - arm * 0.5 + low, 25 + arm, -20 - arm * 0.5 + low, LIGHT, 2);
  return [green, { dark: 0x3f783e, base: 0x78b54e, light: 0xa5d66c, hi: 0xd5ed91 },
    { dark: 0x234a42, base: 0x367350, light: 0x609858, hi: 0x7bb370 }, green, red, ivory, ink, yellow];
}

function megaAura(r: Pen, pose: PokemonPose, phase: number): readonly Material[] {
  const step = gait(pose, phase), arm = reach(pose, phase), heel = kick(pose, phase);
  const low = pose === 'guard' ? 5 : 0;
  const x = pose === 'dash' ? 6 : 1;
  const hy = -32 + low;
  const flick = [0, 1, -3, -1][phase];
  r.poly([[-5, -10], [-15, -13], [-23, -12 + flick], [-30, -15 + flick], [-27, -10 + flick], [-15, -7], [-5, -7]], BODY);
  r.stroke([[-5, -12], [-8 + step, -7], [-7 + step, -3]], DETAIL, 6);
  r.line(-8 + step, -3, -2 + step, -3, ACCENT, 4);
  r.stroke([[2, -12], [7 - step, -7 - heel * 0.3], [12 - step + heel, -3 - heel * 0.5]], DETAIL, 6);
  r.line(10 - step + heel, -3 - heel * 0.5, 16 - step + heel, -3 - heel * 0.5, ACCENT, 4);
  r.poly([[-5, -10 + low], [-10, -18 + low], [-10, -24 + low], [-6, -27 + low], [6, -25 + low], [9, -21 + low],
    [8, -13 + low], [4, -9 + low], [-1, -12 + low]], BODY);
  r.poly([[-4, -24 + low], [1, -27 + low], [8, -24 + low], [10, -18 + low], [7, -11 + low], [1, -14 + low], [-2, -19 + low]], LIGHT);
  r.poly([[5, -22 + low], [14, -21 + low], [8, -17 + low]], PALE);
  r.stroke([[x - 4, hy], [x - 14, hy + 5], [x - 25, hy + 6 + flick], [x - 33, hy + 12 + flick]], DETAIL, 5);
  r.stroke([[x - 6, hy + 3], [x - 14, hy + 10], [x - 24, hy + 15 + flick], [x - 28, hy + 22 + flick]], DETAIL, 5);
  r.line(x - 32, hy + 11 + flick, x - 35, hy + 13 + flick, ACCENT, 3);
  r.line(x - 26, hy + 19 + flick, x - 29, hy + 23 + flick, ACCENT, 3);
  r.poly([[x - 8, hy - 2], [x - 12, hy - 11], [x - 11, hy - 19], [x - 7, hy - 16], [x - 4, hy - 7]], BODY);
  r.poly([[x + 2, hy - 4], [x + 6, hy - 18], [x + 9, hy - 15], [x + 10, hy - 7], [x + 6, hy - 1]], BODY);
  r.line(x + 7, hy - 15, x + 7, hy - 8, DETAIL, 2);
  r.ellipse(x, hy, 8, 7, BODY);
  r.poly([[x - 5, hy], [x + 4, hy - 4], [x + 11, hy - 2], [x + 15, hy + 3], [x + 12, hy + 7], [x + 4, hy + 6]], DETAIL);
  eye(r, x + 6, hy - 1);
  r.stroke([[5, -24 + low], [9, -19 + low], [14 + arm, -19 - arm * 0.46 + low]], BODY, 6);
  r.ellipse(16 + arm, -19 - arm * 0.46 + low, 4, 3.3, ACCENT);
  r.poly([[12 + arm, -20 - arm * 0.46 + low], [15 + arm, -26 - arm * 0.46 + low],
    [17 + arm, -20 - arm * 0.46 + low], [20 + arm, -23 - arm * 0.46 + low], [20 + arm, -18 - arm * 0.46 + low]], PALE);
  return [{ dark: 0x2a477a, base: 0x4879b2, light: 0x6a9fcb, hi: 0x94c9df },
    { dark: 0x9f855e, base: 0xcbb681, light: 0xe9d5a0, hi: 0xffedb9 }, ink, steel, red, ivory, ink, cyan];
}

function megaShark(r: Pen, pose: PokemonPose, phase: number, flying: boolean): readonly Material[] {
  const step = gait(pose, phase), arm = reach(pose, phase), heel = kick(pose, phase);
  const low = pose === 'guard' ? 4 : 0;
  const fin = flying ? [-5, -2, 4, 0][phase] : 0;
  const x = pose === 'dash' || flying ? 5 : 1;
  const hy = -37 + low;
  r.poly([[-5, -14], [-18, -14], [-31, -15 + fin], [-43, -10 + fin], [-42, -15 + fin], [-33, -24 + fin],
    [-36, -28 + fin], [-25, -25 + fin], [-15, -20], [-5, -20]], BODY);
  r.poly([[-5, -20], [-17, -29 + fin], [-23, -39 + fin], [-15, -38 + fin], [-7, -30 + fin], [-1, -28]], SHADOW);
  r.poly([[-8, -22], [-12, -31 + fin], [-15, -33 + fin], [-12, -26], [-5, -24]], LIGHT);
  r.stroke([[-6, -14], [-11 + step, flying ? -10 : -6], [-8 + step, flying ? -11 : -3]], SHADOW, 8);
  r.stroke([[2, -13], [6 - step, (flying ? -8 : -6) - heel * 0.31], [13 - step + heel, (flying ? -8 : -3) - heel * 0.45]], BODY, 8);
  r.line(12 - step + heel, (flying ? -8 : -3) - heel * 0.45, 17 - step + heel, (flying ? -8 : -3) - heel * 0.45, PALE, 2);
  r.ellipse(-1, -17 + low, 10, 13, BODY);
  r.poly([[3, -26 + low], [9, -24 + low], [11, -20 + low], [9, -13 + low], [4, -7 + low], [0, -12 + low], [1, -18 + low]], ACCENT);
  r.poly([[3, -18 + low], [8, -17 + low], [6, -11 + low], [3, -9 + low], [2, -13 + low]], CORE);
  for (const yy of [-22, -18, -14]) {
    r.poly([[-8, yy + low], [-12, yy + 2 + low], [-6, yy + 3 + low], [-4, yy + 2 + low]], PALE);
  }
  r.poly([[x - 10, hy + 4], [x - 10, hy - 3], [x - 14, hy - 11], [x - 6, hy - 14], [x + 1, hy - 7],
    [x + 9, hy - 6], [x + 17, hy - 2], [x + 22, hy + 4], [x + 21, hy + 10],
    [x + 13, hy + 13], [x, hy + 12], [x - 7, hy + 10]], BODY);
  r.poly([[x - 4, hy], [x - 15, hy - 5], [x - 21, hy - 4], [x - 22, hy + 1], [x - 18, hy + 5], [x - 7, hy + 4]], SHADOW);
  r.line(x - 20, hy, x - 17, hy + 1, ACCENT, 2);
  r.poly([[x + 13, hy - 4], [x + 23, hy - 9], [x + 27, hy - 6], [x + 25, hy - 1], [x + 19, hy + 1]], SHADOW);
  r.line(x + 24, hy - 6, x + 26, hy - 5, ACCENT, 2);
  r.poly([[x + 5, hy - 6], [x + 11, hy - 5], [x + 7, hy], [x + 4, hy - 2]], CORE);
  eye(r, x + 13, hy + 1, CORE);
  r.stroke([[x + 8, hy + 7], [x + 15, hy + 8], [x + 21, hy + 6]], DETAIL, 2);
  r.set(x + 16, hy + 7, PALE);
  r.stroke([[5, -24 + low], [12, -18 + low], [15 + arm, -17 + fin + low]], BODY, 7);
  r.poly([[8, -21 + low], [17 + arm, -18 + fin + low], [25 + arm, -23 + fin + low],
    [37 + arm, -20 + fin + low], [29 + arm, -14 + fin + low], [19 + arm, -12 + fin + low], [12, -13 + low]], ACCENT);
  r.stroke([[18 + arm, -14 + fin + low], [26 + arm, -15 + fin + low], [36 + arm, -20 + fin + low]], PALE, 2);
  return [purple, water, { dark: 0x262238, base: 0x363950, light: 0x545b78, hi: 0x7785a2 },
    steel, red, ivory, ink, yellow];
}

export const ASCENDED_POKEMON_SCALE: Record<PokemonSpecies, number> = {
  charmander: 1, squirtle: 0.97, bulbasaur: 0.9, pikachu: 0.73,
  froakie: 0.87, treecko: 0.92, riolu: 0.76, gible: 0.97,
};

export function ascendedPokemon(r: Pen, species: PokemonSpecies, pose: PokemonPose, phase: number, flying: boolean): readonly Material[] {
  switch (species) {
    case 'charmander': return dragonX(r, pose, phase, flying);
    case 'squirtle': return cannonTurtle(r, pose, phase);
    case 'bulbasaur': return flowerTurtle(r, pose, phase);
    case 'pikachu': return raichuX(r, pose, phase);
    case 'froakie': return battleBond(r, pose, phase);
    case 'treecko': return megaGecko(r, pose, phase);
    case 'riolu': return megaAura(r, pose, phase);
    case 'gible': return megaShark(r, pose, phase, flying);
  }
}
