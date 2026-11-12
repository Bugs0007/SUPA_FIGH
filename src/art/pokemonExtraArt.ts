import type { PokemonSpecies } from '../sim/data/pokemon';
import type { Material, Pen } from './pixelRaster';
import type { PokemonPose } from './pokemonArt';

const BODY = 1, BELLY = 2, DARK = 3, EXTRA = 4, ACCENT = 5, WHITE = 6, TRIM = 7, CORE = 8;
const shadow: Material = { dark: 0x151321, base: 0x252137, light: 0x443d50, hi: 0x666171 };
const ivory: Material = { dark: 0xa89fb2, base: 0xd9dce5, light: 0xf2f0df, hi: 0xfffbe9 };
const petal: Material = { dark: 0xa12e58, base: 0xd95370, light: 0xff7990, hi: 0xffabb1 };
const fern: Material = { dark: 0x30563a, base: 0x558747, light: 0x87b75a, hi: 0xc3d375 };
const sunny: Material = { dark: 0xb97d28, base: 0xf3be36, light: 0xffdf54, hi: 0xffec93 };
const blue: Material = { dark: 0x264b7e, base: 0x437aaa, light: 0x67b1d4, hi: 0x97d6e6 };
const russet: Material = { dark: 0x6a4238, base: 0xa9683b, light: 0xd9955c, hi: 0xf1bc76 };
const red: Material = { dark: 0x802d3f, base: 0xc34e4d, light: 0xee6961, hi: 0xffa17b };

function eye(r: Pen, x: number, y: number): void {
  r.line(x, y, x + 1, y + 1, WHITE);
  r.set(x + 1, y + 1, DARK);
}

function strike(pose: PokemonPose, phase: number, kind: 'punch' | 'kick', distance: number): number {
  return pose === kind ? [0.45, 1, 0.72, 0.35][phase] * distance : 0;
}

function plant(r: Pen, stage: number, pose: PokemonPose, phase: number): readonly Material[] {
  const gait = pose === 'run' || pose === 'dash' ? [0, -3, 0, 3][phase] : 0;
  const jab = strike(pose, phase, 'punch', 6);
  const heel = strike(pose, phase, 'kick', 8);
  const lean = pose === 'dash' ? 4 : jab * 0.75;
  const low = pose === 'guard' ? 3 : gait ? 1 : 0;
  const headX = 11 + lean;
  // Venusaur's trunk and canopy are behind its broad head and feet.
  if (stage === 2) {
    r.line(-6, -13, -8, -33, CORE, 8);
    r.line(-7, -23, -8, -34, TRIM, 2);
  }
  const plantY = [-29, -30, -34][stage];
  r.poly([[-8, plantY], [-20, plantY - 2], [-32, plantY + 5], [-19, plantY + 9], [-5, plantY + 5]], EXTRA);
  r.poly([[-8, plantY], [1, plantY - 4], [15, plantY + 2], [9, plantY + 8], [-4, plantY + 6]], EXTRA);
  r.line(-29, plantY + 5, -6, plantY + 1, TRIM);
  r.line(-7, plantY + 1, 10, plantY + 3, TRIM);
  if (stage === 0) {
    r.poly([[-19, -24], [-19, -34], [-13, -43], [-11, -37], [-4, -43], [-1, -35], [6, -31], [3, -24], [-7, -18]], EXTRA);
    r.stroke([[-12, -38], [-13, -29], [-9, -23]], TRIM, 2);
    r.stroke([[-3, -38], [-1, -29], [-5, -22]], TRIM, 2);
  } else if (stage === 1) {
    r.poly([[-19, -29], [-22, -39], [-15, -47], [-6, -43], [1, -47], [6, -39], [1, -29], [-8, -26]], ACCENT);
    r.stroke([[-15, -44], [-11, -36], [-9, -29]], TRIM, 2);
    r.stroke([[-1, -44], [-3, -37], [-7, -29]], TRIM, 2);
  } else {
    r.poly([[-9, -42], [-20, -47], [-33, -44], [-35, -40], [-23, -35], [-15, -36], [-7, -33], [5, -36], [20, -38], [22, -42], [12, -47], [1, -45]], ACCENT);
    r.poly([[-20, -42], [-13, -49], [-6, -49], [1, -43], [-6, -39]], ACCENT);
    r.ellipse(-7, -42, 6, 3, TRIM);
    for (const [x, y] of [[-24, -42], [-29, -40], [-15, -45], [5, -43], [13, -42], [0, -38]]) r.set(x, y, WHITE);
  }
  r.stroke([[-15, -13], [-16 - gait, -6], [-11 - gait, -2]], BELLY, 7);
  r.stroke([[6, -12], [9 + gait, -7], [12 + gait, -3]], BELLY, 7);
  r.ellipse(-6, -12 + low, 17, 11, BODY);
  r.stroke([[-13, -12], [-17 + gait, -5], [-13 + gait, -2]], BODY, 7);
  r.stroke([[7, -11], [6 - gait, -6 - heel * 0.25], [11 - gait + heel, -2 - heel * 0.5]], BODY, 7);
  r.set(-10 + gait, -2, WHITE);
  r.set(13 - gait + heel, -2 - heel * 0.5, WHITE);
  r.poly([[headX - 10, -16 + low], [headX - 10, -25 + low], [headX - 4, -22 + low], [headX + 5, -23 + low],
    [headX + 9, -26 + low], [headX + 11, -20 + low], [headX + 14, -15 + low], [headX + 11, -8 + low], [headX - 1, -7 + low]], BODY);
  r.poly([[-17, -13 + low], [-13, -17 + low], [-10, -12 + low], [-14, -9 + low]], BELLY);
  r.set(-4, -14 + low, BELLY);
  r.set(-2, -12 + low, BELLY);
  r.line(headX + 8, -13 + low, headX + 13, -14 + low, DARK);
  r.set(headX + 10, -12 + low, WHITE);
  r.line(headX + 5, -18 + low, headX + 8, -17 + low, WHITE, 2);
  r.set(headX + 8, -17 + low, ACCENT);
  return [
    { dark: 0x2c6c69, base: 0x59a78f, light: 0x82caa6, hi: 0xace4b9 },
    { dark: 0x2b6257, base: 0x3f7f67, light: 0x63a381, hi: 0x83c8a0 }, shadow, fern, petal, ivory,
    stage === 2 ? sunny : { dark: 0x4d7a42, base: 0x77ab56, light: 0xa5cc68, hi: 0xc8e47b }, russet,
  ];
}

function mouse(r: Pen, stage: number, pose: PokemonPose, phase: number): readonly Material[] {
  const evolved = stage > 0;
  const heel = strike(pose, phase, 'kick', 10);
  const jab = strike(pose, phase, 'punch', 10);
  const shift = pose === 'dash' ? 4 : 0;
  const dip = pose === 'guard' ? 3 : pose === 'run' && phase % 2 === 1 ? 1 : 0;
  const hx = 3 + shift;
  const hy = -19 + dip;
  if (evolved) {
    r.stroke([[-5, -7], [-16, -5], [-23, -14], [-23, -21], [-29, -23]], DARK, 2);
    r.poly([[-26, -21], [-34, -21], [-32, -25], [-37, -28], [-29, -31], [-31, -25], [-24, -25]], EXTRA);
  } else {
    const flick = phase % 2 ? -2 : 0;
    r.poly([[-6, -8], [-15, -8], [-14, -14], [-21, -13], [-21, -18], [-29, -18 + flick], [-25, -27 + flick], [-15, -26 + flick], [-17, -19], [-10, -20], [-11, -14], [-6, -14]], EXTRA);
    r.line(-13, -12, -6, -10, TRIM, 2);
  }
  r.stroke([[-3, -7], [-7, -2], [-2, -2]], BODY, 5);
  r.stroke([[4, -7], [5 + (phase % 2) * 2, -2 - heel * 0.4], [9 + (phase % 2) * 2 + heel, -2 - heel * 0.5]], BODY, 5);
  r.ellipse(0, -9 + dip, 8, evolved ? 10 : 8, BODY);
  if (evolved) r.ellipse(4, -9 + dip, 5, 8, BELLY);
  else r.line(-6, -12 + dip, -2, -12 + dip, TRIM, 2);
  if (evolved) {
    r.poly([[hx - 5, hy - 3], [hx - 11, hy - 9], [hx - 12, hy - 14], [hx - 7, hy - 16], [hx - 3, hy - 9]], TRIM);
    r.poly([[hx + 3, hy - 4], [hx + 7, hy - 14], [hx + 12, hy - 16], [hx + 15, hy - 13], [hx + 11, hy - 9]], TRIM);
    r.line(hx + 10, hy - 13, hx + 11, hy - 13, EXTRA);
  } else {
    r.poly([[hx - 6, hy - 3], [hx - 12, hy - 12], [hx - 13, hy - 17], [hx - 7, hy - 14], [hx - 1, hy - 5]], BODY);
    r.line(hx - 12, hy - 15, hx - 10, hy - 13, DARK, 3);
    r.poly([[hx + 4, hy - 4], [hx + 9, hy - 16], [hx + 13, hy - 18], [hx + 12, hy - 11], [hx + 8, hy - 3]], BODY);
    r.line(hx + 12, hy - 17, hx + 11, hy - 14, DARK, 2);
  }
  r.ellipse(hx, hy, 9, 7, BODY);
  r.ellipse(hx + 5, hy + 3, 6, 4, evolved ? BELLY : BODY);
  r.line(hx + 2, hy + 3, hx + 4, hy + 4, evolved ? EXTRA : ACCENT, 3);
  r.set(hx + 8, hy + 1, DARK);
  eye(r, hx + 4, hy - 2);
  const reach = pose === 'cast' || pose === 'guard' ? 4 : jab * 0.55;
  r.stroke([[4, -11 + dip], [8, -7 - reach], [11 + jab, -7 - reach]], BODY, 4);
  return [evolved ? { dark: 0xad5929, base: 0xdf8b3a, light: 0xfcb75c, hi: 0xffd18e } : sunny,
    ivory, shadow, sunny, red, ivory, russet, petal];
}

function frog(r: Pen, stage: number, pose: PokemonPose, phase: number): readonly Material[] {
  const gait = pose === 'run' || pose === 'dash' ? [-3, 1, 3, -1][phase] : 0;
  const heel = strike(pose, phase, 'kick', 15);
  const jab = strike(pose, phase, 'punch', 10);
  const dip = pose === 'guard' ? 3 : pose === 'dash' ? 2 : 0;
  const headX = stage === 0 ? 5 : 3 + dip;
  const headY = -25 + dip - stage * 3;
  const reach = pose === 'cast' || pose === 'dash' ? 7 : pose === 'guard' ? 4 : jab;
  r.stroke([[-4, -13], [-9 + gait, -7], [-3 + gait, -2]], BODY, 6);
  r.stroke([[3, -12], [10 - gait, -7 - heel * 0.22], [12 - gait + heel, -2 - heel * 0.48]], BODY, 6);
  r.line(11 - gait + heel, -2 - heel * 0.48, 16 - gait + heel, -2 - heel * 0.48, TRIM, 2);
  r.line(-4 + gait, -2, 0 + gait, -2, TRIM, 2);
  r.ellipse(-1, -15 + dip, stage === 0 ? 10 : 7, 10, BODY);
  r.ellipse(3, -14 + dip, 4, 7, BELLY);
  if (stage < 2) {
    r.ellipse(-10, headY + 8, 9, 5, WHITE);
    r.ellipse(-14, headY + 4, 4, 4, WHITE);
    r.ellipse(-6, headY + 4, 5, 5, WHITE);
    r.ellipse(0, headY + 8, 5, 3, WHITE);
    r.set(-12, headY + 6, TRIM);
    r.set(-5, headY + 8, TRIM);
    r.ellipse(headX, headY, 11, 8, BODY);
    r.ellipse(headX + 4, headY - 3, 7, 8, BELLY);
    r.ellipse(headX - 6, headY - 5, 4, 5, BODY);
    r.poly([[headX - 3, headY - 8], [headX + 3, headY - 9], [headX, headY + 2], [headX - 3, headY + 1]], TRIM);
  } else {
    const streamer = phase % 2 ? -3 : 1;
    r.stroke([[-2, -23 + dip], [-13, -24], [-22, -18 + streamer], [-29, -20 + streamer], [-34, -15]], ACCENT, 4);
    r.poly([[headX - 10, headY + 1], [headX - 13, headY - 11], [headX - 9, headY - 12], [headX - 1, headY - 7], [headX + 6, headY - 8], [headX + 12, headY - 12], [headX + 13, headY - 3], [headX + 10, headY + 6], [headX + 2, headY + 9]], BODY);
    r.poly([[headX + 2, headY - 6], [headX + 6, headY - 5], [headX + 8, headY], [headX + 3, headY + 3]], TRIM);
    r.stroke([[-8, -25 + dip], [3, -24 + dip], [11, -26 + dip]], ACCENT, 4);
    r.set(headX + 9, headY + 1, ACCENT);
  }
  r.line(headX + 7, headY - 2, headX + 9, headY - 1, DARK, 2);
  r.set(headX + 7, headY - 3, WHITE);
  r.stroke([[4, -16 + dip], [9, -12 + dip], [12 + reach, -11 - reach + dip]], BODY, 5);
  r.line(11 + reach, -11 - reach + dip, 15 + reach, -11 - reach + dip, TRIM, 2);
  return [stage === 2 ? { dark: 0x273663, base: 0x40568e, light: 0x607bc3, hi: 0x8da8db } : blue,
    stage === 2 ? ivory : sunny, shadow, blue, petal, ivory,
    { dark: 0x4680a0, base: 0x72bdcf, light: 0xa4e3e8, hi: 0xd6f3ed }, fern];
}

function gecko(r: Pen, stage: number, pose: PokemonPose, phase: number): readonly Material[] {
  const gait = pose === 'run' || pose === 'dash' ? [0, 2, 0, -2][phase] : 0;
  const heel = strike(pose, phase, 'kick', 13);
  const jab = strike(pose, phase, 'punch', 10);
  const shift = pose === 'dash' ? 5 : pose === 'guard' ? 2 : 0;
  const low = pose === 'guard' ? 3 : 0;
  const flick = phase % 2 ? 2 : 0;
  const hx = 3 + shift;
  if (stage === 2) {
    r.poly([[-6, -9], [-17, -13], [-31, -14 + flick], [-37, -19 + flick], [-31, -22 + flick], [-24, -20 + flick], [-23, -25 + flick], [-17, -21], [-14, -23], [-10, -17], [-3, -15]], EXTRA);
    r.stroke([[-35, -20 + flick], [-19, -18], [-6, -13]], TRIM, 2);
    for (const [x, y] of [[-10, -17], [-8, -21], [-5, -26]]) r.ellipse(x, y + low, 2.4, 2.8, CORE);
  } else {
    r.poly([[-5, -9], [-14, -12], [-23, -13 + flick], [-31, -21 + flick], [-28, -26 + flick], [-23, -23 + flick], [-18, -26 + flick], [-16, -19], [-10, -16], [-2, -15]], EXTRA);
    r.line(-25, -22 + flick, -8, -15, TRIM, 2);
  }
  r.stroke([[-3, -10], [-7 - gait, -6], [-2 - gait, -2]], BODY, 5);
  r.stroke([[2, -10], [6 + gait, -6 - heel * 0.23], [11 + gait + heel, -2 - heel * 0.48]], BODY, 5);
  r.line(10 + gait + heel, -2 - heel * 0.48, 14 + gait + heel, -2 - heel * 0.48, BELLY, 2);
  r.ellipse(0, -14 + low, stage === 0 ? 7 : 8, 11, BODY);
  r.ellipse(3, -13 + low, 5, 8, BELLY);
  if (stage === 1) r.poly([[hx - 5, -29 + low], [hx - 12, -39 + low], [hx - 25, -42 + low], [hx - 19, -34 + low], [hx - 13, -31 + low], [hx - 7, -26 + low]], EXTRA);
  if (stage === 2) r.poly([[hx - 8, -31 + low], [hx - 10, -39 + low], [hx - 7, -43 + low], [hx - 4, -37 + low], [hx + 5, -36 + low], [hx + 12, -29 + low], [hx + 9, -25 + low], [hx - 5, -25 + low]], BODY);
  else r.ellipse(hx, -27 + low, 10, 8, BODY);
  r.line(hx + 2, -32 + low, hx + 7, -31 + low, CORE, 3);
  r.line(hx + 5, -32 + low, hx + 6, -30 + low, DARK);
  r.line(hx + 6, -25 + low, hx + 11, -27 + low, DARK);
  const hand = pose === 'cast' || pose === 'dash' ? 7 : jab;
  r.stroke([[4, -19 + low], [8, -16 + low], [11 + hand, -13 - hand + low]], BODY, 4);
  if (stage > 0) r.poly([[8, -17 + low], [11 + hand, -19 - hand + low], [19 + hand, -16 - hand + low], [14 + hand, -14 - hand + low], [10, -14 + low]], EXTRA);
  else r.line(10 + hand, -13 - hand + low, 14 + hand, -13 - hand + low, CORE, 2);
  return [{ dark: 0x328258, base: 0x59ad62, light: 0x87ca72, hi: 0xb8e095 }, red, shadow,
    fern, petal, ivory, { dark: 0x396b3d, base: 0x6daa55, light: 0x8ec463, hi: 0xc3df87 }, sunny];
}

function aura(r: Pen, stage: number, pose: PokemonPose, phase: number): readonly Material[] {
  const evolved = stage > 0;
  const heel = strike(pose, phase, 'kick', 15);
  const jab = strike(pose, phase, 'punch', 13);
  const gait = pose === 'run' || pose === 'dash' ? [0, 3, 0, -3][phase] : 0;
  const shift = pose === 'dash' ? 4 : 0;
  const low = pose === 'guard' ? 4 : 0;
  const hx = 2 + shift;
  const hy = -27 + low - (evolved ? 2 : 0);
  r.poly([[-4, -10], [-15, -11], [-23, -15 + gait], [-21, -10 + gait], [-13, -7], [-4, -6]], BODY);
  r.stroke([[-4, -11], [-8 + gait, -5], [-5 + gait, -2]], evolved ? DARK : BODY, 5);
  r.stroke([[3, -11], [4 - gait, -5 - heel * 0.24], [10 - gait + heel, -2 - heel * 0.47]], evolved ? DARK : BODY, 5);
  r.line(9 - gait + heel, -2 - heel * 0.47, 12 - gait + heel, -2 - heel * 0.47, BODY, 2);
  r.ellipse(0, -14 + low, 7.5, 10, BODY);
  r.ellipse(3, -18 + low, 5.5, 7, evolved ? BELLY : DARK);
  r.poly([[hx - 6, hy - 2], [hx - 11, hy - 7], [hx - 11, hy - 15], [hx - 7, hy - 13], [hx - 3, hy - 6]], BODY);
  r.poly([[hx + 2, hy - 5], [hx + 5, hy - 15], [hx + 8, hy - 14], [hx + 9, hy - 6], [hx + 6, hy - 2]], BODY);
  r.line(hx + 6, hy - 12, hx + 6, hy - 8, DARK, 2);
  if (evolved) {
    r.stroke([[hx - 6, hy], [hx - 13, hy + 6], [hx - 15, hy + 11]], DARK, 4);
    r.stroke([[hx - 9, hy], [hx - 17, hy + 4], [hx - 20, hy + 7]], DARK, 3);
  } else {
    r.stroke([[hx - 8, hy], [hx - 12, hy + 3], [hx - 12, hy + 8]], DARK, 3);
  }
  r.ellipse(hx, hy, 8, 7, BODY);
  r.poly([[hx - 4, hy - 1], [hx + 6, hy - 3], [hx + 12, hy + 2], [hx + 11, hy + 6], [hx + 5, hy + 7], [hx - 2, hy + 4]], DARK);
  r.line(hx + 4, hy - 2, hx + 7, hy - 1, ACCENT, 2);
  r.set(hx + 7, hy - 1, WHITE);
  const reach = pose === 'cast' || pose === 'guard' ? 6 : jab;
  r.stroke([[3, -19 + low], [7, -15 + low], [9 + reach, -13 - reach + low]], BODY, 5);
  r.line(8 + reach, -13 - reach + low, 12 + reach, -13 - reach + low, DARK, 3);
  if (evolved) r.poly([[7, -20 + low], [14, -21 + low], [11, -17 + low]], WHITE);
  r.set(9 + reach, -14 - reach + low, WHITE);
  return [blue, { dark: 0x938568, base: 0xcbba8a, light: 0xe8d7a3, hi: 0xf8edc0 }, shadow,
    fern, red, ivory, sunny, russet];
}

function shark(r: Pen, stage: number, pose: PokemonPose, phase: number, flying: boolean): readonly Material[] {
  const heel = strike(pose, phase, 'kick', 12);
  const jab = strike(pose, phase, 'punch', 9);
  const gait = flying ? [-2, 0, 3, 1][phase] : pose === 'run' || pose === 'dash' ? [0, 3, 0, -3][phase] : 0;
  const bank = flying ? [-9, -2, 9, 3][phase] : 0;
  const rush = pose === 'dash' || flying ? 5 : 0;
  const low = pose === 'guard' ? 3 : 0;
  const head = rush + 2;
  const peak = -26 - stage * 2 + low;
  if (stage > 0) {
    r.poly([[-5, -11], [-17, -13], [-28, -12 + gait], [-33, -9 + gait], [-31, -16 + gait], [-23, -20 + gait], [-25, -23 + gait], [-18, -21], [-9, -17]], BODY);
    r.poly([[-9, -17], [-22, -28], [-16, -32], [-13, -26], [-3, -23]], EXTRA);
  }
  if (flying) {
    r.poly([[-4, -21], [-12, -25], [-18 + gait, -31 + bank * 0.55],
      [-21 + gait, -29 + bank * 0.55], [-17, -21], [-9, -17]], DARK);
    r.stroke([[-3, -13], [-9 + gait, -9], [-12 + gait, -10]], BODY, 6);
    r.stroke([[5, -11], [1 - gait, -6], [-5 - gait, -7]], BODY, 6);
    r.line(-8 - gait, -7, -4 - gait, -7, WHITE, 2);
  } else {
    r.stroke([[-4, -11], [-8 + gait, -5], [-4 + gait, -2]], BODY, 6);
    r.stroke([[5, -10], [7 - gait, -5 - heel * 0.24], [12 - gait + heel, -2 - heel * 0.45]], BODY, 6);
    r.line(11 - gait + heel, -2 - heel * 0.45, 15 - gait + heel, -2 - heel * 0.45, WHITE, 2);
  }
  r.ellipse(0, -15 + low, stage === 0 ? 11 : 9, 11, BODY);
  r.ellipse(5, -12 + low, stage === 0 ? 8 : 6, 7, BELLY);
  r.poly([[head - 12, peak + 6], [head - 8, peak - 1], [head - 13, peak - 11], [head - 6, peak - 13], [head, peak - 5],
    [head + 9, peak - 3], [head + 15, peak + 3], [head + 15, peak + 9], [head + 9, peak + 12], [head - 6, peak + 10]], BODY);
  r.poly([[head - 5, peak + 2], [head - 17, peak + 4], [head - 20, peak + 1], [head - 16, peak - 5], [head - 11, peak - 5]], EXTRA);
  r.line(head - 18, peak + 1, head - 15, peak, ACCENT, 2);
  r.poly([[head + 11, peak - 1], [head + 19, peak - 7], [head + 22, peak - 4], [head + 20, peak + 1], [head + 15, peak + 3]], EXTRA);
  r.line(head + 19, peak - 4, head + 21, peak - 4, ACCENT, 2);
  r.line(head + 8, peak + 3, head + 11, peak + 2, stage ? CORE : WHITE, 2);
  r.set(head + 11, peak + 3, DARK);
  r.line(head + 7, peak + 8, head + 14, peak + 7, DARK, 2);
  r.set(head + 11, peak + 7, WHITE);
  if (stage === 2) {
    r.poly([[head + 4, peak - 3], [head + 8, peak - 2], [head + 5, peak + 1], [head + 2, peak - 1]], CORE);
    r.poly([[-4, -16 + low], [1, -17 + low], [6, -13 + low], [3, -7 + low], [-2, -10 + low]], CORE);
  }
  if (flying && pose !== 'cast' && pose !== 'guard' && pose !== 'punch') {
    const finX = -24 + gait;
    const finY = -21 + bank;
    r.stroke([[6, -20], [0, -17], [finX + 5, finY + 2]], BODY, 5);
    r.poly([[5, -20], [-2, -18], [finX, finY], [finX + 3, finY + 8], [-5, -11], [4, -14]], EXTRA);
    r.stroke([[3, -19], [-4, -17], [finX + 2, finY + 1]], BODY, 2);
    r.set(finX + 5, finY + 4, WHITE);
  } else {
    const lift = pose === 'cast' || pose === 'guard' ? 7 : jab;
    r.stroke([[4, -19 + low], [9, -15 + low], [14 + lift, -14 - lift + low]], BODY, stage === 0 ? 4 : 5);
    if (stage > 0) r.poly([[7, -18 + low], [13 + lift, -15 - lift + low], [23 + lift, -19 - lift + low], [19 + lift, -9 - lift + low], [10, -11 + low]], EXTRA);
    r.set(15 + lift, -14 - lift + low, WHITE);
  }
  return [{ dark: 0x34375c, base: 0x52608e, light: 0x778bc0, hi: 0x9cadd8 }, red,
    shadow, { dark: 0x292646, base: 0x414566, light: 0x616a91, hi: 0x8992ac }, red, ivory, blue, sunny];
}

export function extraPokemon(r: Pen, species: PokemonSpecies, stage: number, pose: PokemonPose, phase: number, flying: boolean): readonly Material[] {
  switch (species) {
    case 'bulbasaur': return plant(r, stage, pose, phase);
    case 'pikachu': return mouse(r, stage, pose, phase);
    case 'froakie': return frog(r, stage, pose, phase);
    case 'treecko': return gecko(r, stage, pose, phase);
    case 'riolu': return aura(r, stage, pose, phase);
    case 'gible': return shark(r, stage, pose, phase, flying);
    default: return [];
  }
}

export function extraPokemonScale(species: PokemonSpecies, stage: number): number {
  switch (species) {
    case 'bulbasaur': return [0.33, 0.48, 0.88][stage];
    case 'pikachu': return [0.31, 0.53][stage];
    case 'froakie': return [0.28, 0.43, 0.80][stage];
    case 'treecko': return [0.34, 0.47, 0.87][stage];
    case 'riolu': return [0.38, 0.66][stage];
    case 'gible': return [0.4, 0.67, 0.88][stage];
    default: return 1;
  }
}
