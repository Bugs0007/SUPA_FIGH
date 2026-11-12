import type { Appearance } from './appearance';
import type { PixelCanvas } from './canvas';
import type { Pose } from './fighterArt';
import type { HeroArt } from './heroArt';
import { bake, Raster } from './pixelRaster';

const JACKET = '#2f5db3';
const LAPEL = '#edf0e2';
const DENIM = '#527ab3';
const CAP = '#cc3a41';
const INK = '#211b2c';
const SKIN = '#eec193';
const GLOVE = '#376547';

export const ASH_ART: HeroArt = {
  look: {
    design: 'ash', skin: SKIN, hair: 'short', hairColor: INK, face: 'plain',
    hat: 'none', hatColor: CAP, top: 'jacket', topColor: JACKET, accentColor: LAPEL,
    pantsColor: DENIM, shoesColor: '#354152', eyes: '#322533', trim: GLOVE,
  },
  forms: [],
  fx: [],
};

/** Ash's Indigo League cap, angled visor and the fringe below the cap. */
export function drawAshHead(pc: PixelCanvas, x: number, y: number): void {
  pc.ascii(x + 2, y + 1, [
    '....OOOO....',
    '..OOCCCOO...',
    '.OCCCCWWO...',
    '.OCCCWMWOO..',
    '.OCCCWWCCCOO',
    '.OOOOOOOCCCO',
    '.HHHH...OOO.',
    '.H.HH.......',
    '..HH........',
  ], { O: INK, C: CAP, W: '#f6efdd', M: '#428260', H: INK });
  pc.set(x + 11, y + 10, '#b57e69');
  pc.set(x + 5, y + 11, INK);
}

export function drawAshBody(pc: PixelCanvas, ox: number, oy: number, pose: Pose, a: Appearance): void {
  const x = ox + 13 + pose.lean;
  const y = oy + pose.hipY - pose.torsoH;
  const belt = oy + pose.hipY;
  pc.rect(x, y, 5, Math.max(3, pose.torsoH - 1), a.topColor);
  pc.rect(x + 3, y + 1, 2, Math.max(2, pose.torsoH - 2), '#292832');
  pc.rect(x - 1, y, 2, 2, LAPEL);
  pc.rect(x + 4, y, 2, 2, LAPEL);
  pc.set(x + 1, belt - 2, '#f6d264');
  pc.set(x + 4, belt - 2, '#f6d264');
  pc.line(x - 2, y + 2, x - 2, belt - 1, '#294638', 2);
  pc.set(x - 2, y + 2, '#68956a');
  for (const leg of [pose.back, pose.front]) {
    pc.line(ox + leg.fx, oy + leg.fy, ox + leg.fx + 2, oy + leg.fy, '#e7ded1');
    pc.set(ox + leg.fx + 2, oy + leg.fy - 1, '#303746');
  }
}

const RIDER_PALETTE = [
  { dark: 0x1d366c, base: 0x2f5db3, light: 0x588de2, hi: 0x82a7ed },
  { dark: 0x34537b, base: 0x527ab3, light: 0x7398d2, hi: 0x8eaee1 },
  { dark: 0xaaa29b, base: 0xe7ded1, light: 0xf2ebdf, hi: 0xfffcf0 },
  { dark: 0x1f382b, base: 0x376547, light: 0x57875e, hi: 0x85a675 },
  { dark: 0xb77c61, base: 0xeec193, light: 0xffd2a8, hi: 0xffdfb9 },
  { dark: 0x15111e, base: 0x211b2c, light: 0x373044, hi: 0x55475a },
  { dark: 0x932c3b, base: 0xcc3a41, light: 0xe86a59, hi: 0xff8e73 },
];

export const ASH_RIDER_HIP = [10, 16] as const;

/** Draw the far leg under the mount so the rider straddles its back. */
function bakeFarLeg() {
  const r = new Raster(27, 26);
  r.stroke([[10, 16], [16, 19], [15, 23]], 2, 3);
  r.line(15, 23, 18, 23, 6, 2);
  r.line(15, 24, 18, 24, 3);
  return bake(r, RIDER_PALETTE, 0x211b2c, false);
}

/** The hips and grip stay planted as Ash leans into the flight. */
function bakeAshRider(tuck: number) {
  const r = new Raster(27, 26);
  const shoulderX = 12 + tuck * 2;
  const shoulderY = 10 + tuck;
  const headX = shoulderX + 1;
  const headY = shoulderY - 5;
  r.stroke([[10, 16], [15, 18], [12, 22]], 2, 4);
  r.line(11, 22, 15, 22, 6, 2);
  r.line(11, 23, 15, 23, 3);
  r.poly([[8, 15], [shoulderX - 3, shoulderY], [shoulderX + 2, shoulderY - 1],
    [shoulderX + 3, shoulderY + 3], [12, 17], [8, 17]], 1);
  r.poly([[shoulderX - 4, shoulderY], [shoulderX - 2, shoulderY + 1], [10, 15], [6, 15], [6, 12]], 4);
  r.stroke([[shoulderX + 1, shoulderY + 2], [shoulderX + 2, 14], [20, 13]], 3, 2);
  r.line(19, 13, 21, 13, 4, 2);
  r.poly([[headX - 3, headY], [headX + 2, headY], [headX + 4, headY + 3],
    [headX + 3, headY + 5], [headX, headY + 5], [headX - 3, headY + 3]], 5);
  r.line(headX - 3, headY + 1, headX - 2, headY + 4, 6, 2);
  r.set(headX + 2, headY + 2, 6);
  r.poly([[headX - 4, headY], [headX - 3, headY - 3], [headX + 1, headY - 4],
    [headX + 3, headY - 2], [headX + 3, headY], [headX + 7, headY + 1],
    [headX + 6, headY + 2], [headX - 4, headY + 1]], 7);
  r.line(headX + 1, headY - 2, headX + 2, headY, 3, 2);
  r.set(headX + 2, headY - 1, 4);
  return bake(r, RIDER_PALETTE, 0x211b2c, false);
}

export const ASH_RIDER_FAR_LEG = bakeFarLeg();
export const ASH_RIDER_POSES = [0, 1, 2].map(bakeAshRider);
