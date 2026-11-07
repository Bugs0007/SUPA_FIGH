import type { Appearance } from './appearance';
import type { PixelCanvas } from './canvas';
import type { FormFx, HeroArt } from './heroArt';
import { shade } from './palette';

function aura(main: string, glow: string, power: number, extra?: FormFx['extra']): FormFx {
  return { aura: [main, glow], tails: 0, tailColors: [main, glow], power, extra };
}

export const BLACK_CLOVER_ART: Record<string, HeroArt> = {
  asta: {
    look: {
      design: 'asta', form: 0, skin: '#efbd91', hair: 'none', hairColor: '#c2c8c2',
      face: 'plain', hat: 'none', hatColor: '#211d2e', eyes: '#3e8e57',
      top: 'jacket', topColor: '#e1d7b9', accentColor: '#34414f', pantsColor: '#4f5c76', shoesColor: '#69372d',
      trim: '#292438',
    },
    forms: [
      { eyes: '#cc3a40', accentColor: '#633442', trim: '#382536' },
      { eyes: '#ff4249', hairColor: '#a2a6a5', accentColor: '#54263a', trim: '#272031' },
      { eyes: '#f95257', topColor: '#3b3147', pantsColor: '#352b41', shoesColor: '#221f32', trim: '#1d192a' },
      { eyes: '#ff5a4b', hairColor: '#dbd8d0', topColor: '#34283e', pantsColor: '#2c253a', shoesColor: '#221d30', trim: '#171322' },
    ],
    fx: [aura('#95233b', '#f87466', 1), aura('#6a1837', '#ff5a50', 2, 'fire'),
      aura('#582438', '#fd6163', 3, 'lightning'), aura('#43172d', '#ff8c75', 4, 'lightning')],
  },
  yuno: {
    look: {
      design: 'yuno', form: 0, skin: '#edca9e', hair: 'none', hairColor: '#2e2637',
      face: 'plain', hat: 'none', hatColor: '#4bba75', eyes: '#a27228',
      top: 'gi', topColor: '#302c3f', accentColor: '#d7bd63', pantsColor: '#343042', shoesColor: '#6e523a',
      trim: '#d4bb70',
    },
    forms: [
      { eyes: '#77ca74', hatColor: '#74e985', trim: '#d8f0b2' },
      { eyes: '#71e58d', topColor: '#36675a', hatColor: '#a5f9a0', trim: '#c3ed8a' },
      { eyes: '#c7fba5', topColor: '#b3d7b8', accentColor: '#73a776', hatColor: '#c7ffa8', trim: '#e3f6ac' },
      { eyes: '#f9df89', topColor: '#edf3d6', accentColor: '#6ba486', hatColor: '#fff0a7', trim: '#f5d883' },
    ],
    fx: [aura('#3cbf77', '#d5ffc2', 1, 'steam'), aura('#46bd8c', '#cefff0', 2, 'steam'),
      aura('#72d47d', '#efffc7', 3), aura('#8fe1a2', '#fff6ac', 4, 'lightning')],
  },
  yami: {
    look: {
      design: 'yami', form: 0, skin: '#d9a075', hair: 'none', hairColor: '#292437',
      face: 'plain', hat: 'none', hatColor: '#252031', eyes: '#4e494d',
      top: 'tank', topColor: '#e1d8bf', accentColor: '#b6915b', pantsColor: '#3b3a51', shoesColor: '#382733',
      trim: '#252235',
    },
    forms: [
      { trim: '#362541', accentColor: '#a78ac0', eyes: '#756395' },
      { trim: '#302345', accentColor: '#b68ad2', eyes: '#9374bc' },
      { trim: '#2e1d42', accentColor: '#a479dc', eyes: '#c0a0eb', topColor: '#cec6b9' },
      { trim: '#281832', accentColor: '#d0aff2', eyes: '#dfbaff', topColor: '#e2cdea', pantsColor: '#30263e' },
    ],
    fx: [aura('#583363', '#c69ae7', 1), aura('#63428c', '#cf9cf9', 2),
      aura('#4a2377', '#b78efb', 3, 'lightning'), aura('#38184f', '#dfbaff', 4, 'lightning')],
  },
};

/** Shoulder insignias and coat hems follow the existing body pose. */
export function drawBlackCloverBody(pc: PixelCanvas, x: number, y: number, waistX: number, waistY: number, a: Appearance): void {
  const level = a.form ?? 0;
  if (a.design === 'asta' || a.design === 'yami') {
    const armor = a.design === 'asta' && level >= 3;
    const cape = a.trim ?? '#292438';
    const gold = armor ? '#be414a' : '#b08b52';
    pc.rect(x - 1, y, 7, 2, cape);
    pc.line(x - 1, y + 1, x - 2, Math.min(y + 5, waistY), cape, 2);
    pc.set(x, y + 1, gold);
    pc.set(x + 1, y + 2, gold);
    pc.set(x + 2, y + 1, gold);
    pc.set(x + 1, y + 3, armor ? '#ef6862' : '#e3bc73');
    if (armor) {
      pc.rect(x + 4, y + 1, 3, 2, '#1e182b');
      if (waistY - y >= 6) {
        pc.line(x + 2, y + 3, waistX + 3, waistY - 1, '#a8374a');
        pc.set(x + 4, y + 4, '#f06f63');
      }
    }
    if (a.design === 'yami') {
      pc.rect(waistX - 1, waistY - 1, 8, 2, '#715042');
      pc.set(waistX + 3, waistY - 1, '#c1935e');
      pc.rect(waistX - 2, waistY + 1, 3, 1, '#3c2d3d');
    }
    return;
  }
  if (a.design !== 'yuno') return;
  const mantle = a.trim ?? '#d4bb70';
  const lining = level > 0 ? '#68b777' : '#926638';
  pc.rect(x - 1, y, 7, 2, mantle);
  pc.line(x - 1, y + 1, x - 2, Math.min(y + 6, waistY), lining, 2);
  pc.set(x + 2, y + 1, '#fff0b2');
  pc.set(x + 4, y + 1, '#fff0b2');
  pc.set(x + 3, y + 3, '#74ce9a');
  if (waistY - y >= 6) pc.line(x + 5, y + 3, waistX + 5, waistY - 1, lining);
}

const HAIR = {
  asta: ['..H...L...', '.HH.HLL.H.', 'HHLLLLLHHH', '.HHHHHHHH.', 'DHHDHHHH..', 'D.DH......'],
  yuno: ['..DHHL....', '.DHHLLHH..', 'DHHHHHLLH.', 'DHHHHHHHHH', 'DHHDHH.DHH', 'D.DDH...D.', '..D.D.....'],
  yami: ['...H.H....', '.HHHLH.H..', 'DHHHHLHHH.', 'DHHHHHHHHD', 'DDDH.DH.D.', '..D.......'],
};

export function drawBlackCloverHead(pc: PixelCanvas, ox: number, oy: number, a: Appearance, mode: number): void {
  if (a.design !== 'asta' && a.design !== 'yuno' && a.design !== 'yami') return;
  const level = a.form ?? 0;
  pc.ascii(ox + 3, oy + 2, HAIR[a.design], { H: a.hairColor, L: shade(a.hairColor, 0.26), D: shade(a.hairColor, -0.3) });
  if (a.design === 'asta') {
    pc.rect(ox + 4, oy + 6, 8, 2, '#252135');
    pc.set(ox + 7, oy + 6, '#bc8f4a');
    pc.set(ox + 8, oy + 7, '#e1b765');
    pc.set(ox + 9, oy + 6, '#bc8f4a');
    if (level >= 2) {
      pc.line(ox + 6, oy + 4, ox + 4, oy + 1, '#281b2a', 2);
      pc.set(ox + 4, oy, '#77404a');
      pc.line(ox + 6, oy + 8, ox + 8, oy + 11, '#4d2939');
    }
    if (level >= 3) {
      pc.line(ox + 11, oy + 4, ox + 12, oy + 1, '#281b2a', 2);
      pc.set(ox + 13, oy, '#a4484e');
      pc.rect(ox + 4, oy + 8, 3, 3, '#332232');
      if (level === 4) pc.line(ox + 6, oy + 12, ox + 9, oy + 10, '#712837');
    }
  } else if (a.design === 'yuno' && level > 0) {
    // The spirit crown expands across the hair as the wind form matures.
    const light = level === 4 ? '#fff6c1' : '#defac2';
    pc.ascii(ox + 3, oy + 1, level === 1 ? ['.L...', 'LLG..', '.GGG.'] : [
      '..L..L.L..', '..LL.GLL..', '.G.GGGGGG.',
    ], { L: light, G: a.hatColor });
    if (mode === 0) pc.line(ox + 6, oy + 8, ox + 7, oy + 10, '#7ccc82');
  } else if (a.design === 'yami') {
    // Keep the stubble inside his cheek and square chin. A protruding accessory reads as another jaw pixel.
    const stubble = shade(a.skin, -0.31);
    pc.set(ox + 7, oy + 11, stubble);
    pc.set(ox + 8, oy + 12, stubble);
    pc.set(ox + 10, oy + 12, stubble);
    if (mode === 0) {
      pc.set(ox + 10, oy + 11, shade(a.skin, -0.48));
      if (level >= 3) pc.set(ox + 9, oy + 7, '#845ea0');
    }
  }
}
