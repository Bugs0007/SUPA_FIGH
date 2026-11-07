import type { Appearance } from './appearance';
import type { PixelCanvas } from './canvas';
import type { Pose } from './fighterArt';
import type { HeroArt } from './heroArt';
import { shade } from './palette';

export const VEGETA_ART: HeroArt = {
  look: {
    design: 'vegeta', form: 0, skin: '#e7b588', hair: 'none', hairColor: '#201928', face: 'plain',
    hat: 'none', hatColor: '#201928', top: 'tracksuit', topColor: '#284b94', accentColor: '#e3b969',
    pantsColor: '#244286', shoesColor: '#e8e7ee', eyes: '#2b2135',
  },
  forms: [
    { hairColor: '#f5ce4f', eyes: '#4ee6cd' },
    { hairColor: '#fff077', eyes: '#5df6da' },
    { hairColor: '#41c8ef', eyes: '#2290dc', topColor: '#243659', pantsColor: '#253653' },
    { hairColor: '#356afa', eyes: '#73bfff', topColor: '#223c86', pantsColor: '#1c2c65', accentColor: '#f0cb82' },
  ],
  fx: [
    { aura: ['#f7c64d', '#fff3b4'], tails: 0, tailColors: ['#fff', '#fff'], power: 1, extra: 'fire' },
    { aura: ['#edaa38', '#fff8d0'], tails: 0, tailColors: ['#fff', '#fff'], power: 2, extra: 'lightning' },
    { aura: ['#2cbbeb', '#d6fcff'], tails: 0, tailColors: ['#fff', '#fff'], power: 3, extra: 'fire' },
    { aura: ['#345bfa', '#9fcfff'], tails: 0, tailColors: ['#fff', '#fff'], power: 4, extra: 'lightning' },
  ],
};

/** Hair swept up from the widow's peak, with a sharper silhouette in the charged forms. */
export function drawVegetaHead(pc: PixelCanvas, x: number, y: number, a: Appearance): void {
  const hair = a.hairColor;
  const lit = shade(hair, (a.form ?? 0) ? 0.24 : 0.12);
  pc.ascii(x + 2, y, [
    '......H.....',
    '...H.HH..H..',
    '.H.HHLH.HH..',
    '.HHHLHHHHL..',
    '..HHHLHHLH..',
    '..HHHHHLHH..',
    '..HHHH.HH...',
    '..H.H..H....',
    '..H.........',
  ], { H: hair, L: lit });
  if ((a.form ?? 0) >= 2) {
    pc.set(x + 6, y, hair);
    pc.set(x + 11, y, lit);
    pc.set(x + 3, y + 1, hair);
  }
}

export function drawVegetaBody(pc: PixelCanvas, ox: number, oy: number, pose: Pose, a: Appearance): void {
  const x = ox + 13 + pose.lean;
  const y = oy + pose.hipY - pose.torsoH;
  const belt = oy + pose.hipY;
  // White battle plate with a segmented gold abdomen over the blue jumpsuit.
  pc.rect(x, y, 6, 4, '#e1e5ed');
  pc.rect(x, y - 1, 2, 4, '#f5f0e7');
  pc.rect(x + 5, y - 1, 2, 4, '#f5f0e7');
  pc.line(x + 1, y + 2, x + 5, y + 2, '#9cabc9');
  pc.rect(x + 1, y + 3, 4, Math.max(1, pose.torsoH - 4), a.accentColor);
  for (let iy = y + 4; iy < belt - 1; iy += 2) pc.rect(x + 1, iy, 4, 1, '#aa814f');
  pc.rect(ox + 13, belt - 1, 6, 1, '#b5bdd8');
  for (const leg of [pose.back, pose.front]) {
    pc.line(ox + leg.fx, oy + leg.fy - 2, ox + leg.fx, oy + leg.fy, '#e7eaf1', 2);
    pc.set(ox + leg.fx + 2, oy + leg.fy, a.accentColor);
  }
}
