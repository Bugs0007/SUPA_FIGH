import type Phaser from 'phaser';
import type { Appearance } from './appearance';
import { PixelCanvas } from './canvas';
import type { FormFx, HeroArt } from './heroArt';
import { P, shade } from './palette';
import type { WeaponFrame } from './weaponArt';

type BleachFighter = 'ichigo' | 'rukia' | 'byakuya';

const SILK = '#ece9e9';
const HAKAMA = '#29273a';
const ROBE = '#282637';
const LINING = '#54556b';

function reiatsu(aura: FormFx['aura'], power: number, extra?: FormFx['extra']): FormFx {
  return { aura, tails: 0, tailColors: aura, power, extra };
}

export const BLEACH_ART: Record<BleachFighter, HeroArt> = {
  ichigo: {
    look: {
      design: 'ichigo', form: 0, skin: '#efbd94', hair: 'spiky', hairColor: '#f67a2e',
      face: 'plain', hat: 'none', hatColor: P.ink, top: 'gi', topColor: ROBE,
      accentColor: SILK, pantsColor: HAKAMA, shoesColor: '#b4a5a5', eyes: '#6d3c2d',
    },
    forms: [
      { accentColor: '#a7374a', topColor: '#232032', shoesColor: '#aaa3a8' },
      { accentColor: '#c74549', topColor: '#292137', eyes: '#ffbd49' },
      { skin: '#f0e3d1', hair: 'saiyan3', hairColor: '#bd432b', top: 'chakra', topColor: '#e3d3bd', accentColor: '#8d343a', pantsColor: '#28222f', eyes: '#eeb33b' },
      { hairColor: '#ef8135', topColor: '#272235', accentColor: '#eee5d5', pantsColor: '#282535', eyes: '#f2bc55' },
    ],
    fx: [
      reiatsu(['#326ea6', '#94e2fc'], 1),
      reiatsu(['#8c2b4e', '#fc7a66'], 2, 'fire'),
      reiatsu(['#a31f3a', '#ffc97d'], 3, 'fire'),
      reiatsu(['#c1692d', '#ffe2ab'], 4, 'lightning'),
    ],
  },
  rukia: {
    look: {
      design: 'rukia', form: 0, skin: '#f0ccba', hair: 'bob', hairColor: '#23243d',
      face: 'plain', hat: 'none', hatColor: P.ink, top: 'gi', topColor: '#2c2a42',
      accentColor: '#f0eff7', pantsColor: '#24283b', shoesColor: '#b6abb6', eyes: '#524d83',
    },
    forms: [
      { accentColor: '#d5edf5', eyes: '#6669aa' },
      { topColor: '#414c65', accentColor: '#d9f9ff', eyes: '#7299be' },
      { skin: '#d8d7e6', hairColor: '#394462', topColor: '#575c79', accentColor: '#eefcff', eyes: '#afe7ff' },
      { skin: '#f5e5e8', hair: 'long', hairColor: '#eeeaf7', topColor: '#f5f1f7', accentColor: '#accce2', pantsColor: '#dfe6f7', shoesColor: '#c6d6ed', eyes: '#95b4dc' },
    ],
    fx: [
      reiatsu(['#499fbc', '#c5faff'], 1, 'steam'),
      reiatsu(['#73b8eb', '#deffff'], 2, 'steam'),
      reiatsu(['#9ac7eb', '#f5ffff'], 3, 'steam'),
      reiatsu(['#bde6fa', '#f5fcff'], 4, 'steam'),
    ],
  },
  byakuya: {
    look: {
      design: 'byakuya', form: 0, skin: '#e8c2ac', hair: 'long', hairColor: '#262336',
      face: 'plain', hat: 'none', hatColor: P.ink, top: 'gi', topColor: ROBE,
      accentColor: '#dceae8', pantsColor: '#272537', shoesColor: '#b5aab5', eyes: '#393c62',
    },
    forms: [
      { accentColor: '#dbe4ef', eyes: '#64659a' },
      { topColor: '#2f2640', accentColor: '#e5d8ef', eyes: '#7a589e' },
      { topColor: '#3b2644', accentColor: '#f4d5e8', eyes: '#af6f99' },
      { topColor: '#41415c', accentColor: '#faf3e8', eyes: '#d5c3ed' },
    ],
    fx: [
      reiatsu(['#ab5a98', '#f9acd1'], 1),
      reiatsu(['#cf639f', '#ffcadf'], 2),
      reiatsu(['#b56bdd', '#f9ccff'], 3),
      reiatsu(['#c9a9e2', '#fff0e9'], 4),
    ],
  },
};

interface BodyPose {
  hipY: number;
  torsoH: number;
  lean: number;
  back: { kx: number; ky: number; fx: number; fy: number };
  front: { kx: number; ky: number; fx: number; fy: number };
}

/** Shared Soul Reaper robe, with independently shaped sash, haori and furisode. */
export function drawBleachBody(pc: PixelCanvas, ox: number, oy: number, pose: BodyPose, a: Appearance): void {
  const level = a.form ?? 0;
  const ichigo = a.design === 'ichigo', rukia = a.design === 'rukia';
  const captain = a.design === 'byakuya';
  if (!ichigo && !rukia && !captain) return;
  const hip = oy + pose.hipY;
  const x = ox + 13 + Math.round(pose.lean);
  const y = hip - pose.torsoH;
  const pale = rukia && level === 4;
  const seam = pale ? shade(a.topColor, -0.22) : shade(a.topColor, 0.33);
  for (const [i, leg] of [pose.back, pose.front].entries()) {
    const dye = i === 0 ? shade(a.pantsColor, -0.25) : a.pantsColor;
    pc.line(ox + leg.kx, oy + leg.ky, ox + leg.fx - 1, oy + leg.fy - 1, dye, 2);
    pc.line(ox + leg.kx + 1, oy + leg.ky, ox + leg.fx + 1, oy + leg.fy - 1, shade(dye, 0.16));
    pc.set(ox + leg.fx + 1, oy + leg.fy, shade(a.shoesColor, 0.25));
  }
  if (ichigo && level === 3) {
    // The Full Hollow's rib markings end at the torn black trousers.
    pc.line(x - 1, y, ox + 10, hip - 1, '#a74435', 2);
    pc.line(x - 2, y + 1, ox + 9, hip - 3, '#653042');
    pc.line(x + 2, y + 1, x + 1, hip - 2, '#8c3438');
    pc.line(x + 4, y + 1, x + 5, hip - 2, '#8c3438');
    if (pose.torsoH >= 5) pc.rect(x + 2, y + 3, 3, 2, '#2b1c28');
    pc.rect(ox + 13, hip, 5, 1, '#6f3d48');
    return;
  }
  pc.line(x + 1, y, x + 4, y + 3, pale ? a.accentColor : SILK);
  pc.line(x + 5, y + 1, x + 2, hip - 1, seam);
  pc.rect(ox + 13, hip - 1, 6, 2, a.accentColor);
  if (captain) {
    // Split, ivory captain's haori and the silk scarf that trails behind it.
    pc.line(x, y + 1, ox + 11, hip + 2, '#c3bbc9', 2);
    pc.line(x + 5, y + 1, ox + 19, hip + 1, '#f5efe9', 2);
    pc.line(ox + 11, hip + 1, ox + 10, hip + 4, '#958ea8', 2);
    pc.line(x + 3, y - 1, x - 2, y + 1, a.accentColor, 2);
    pc.line(x - 2, y + 1, x - 5, y + 4, shade(a.accentColor, -0.08), 2);
    pc.set(x - 5, y + 4, '#f6f3e8');
    if (level >= 3) {
      pc.line(x + 5, y + 1, ox + 21, hip + 4, level === 4 ? '#f7eedb' : '#be8cae');
      pc.set(ox + 20, hip + 2, '#6c566c');
    }
  } else if (rukia && level === 4) {
    // Hakka no Togame has a layered white collar and a broad, split hem.
    pc.line(x - 1, y + 1, ox + 10, hip + 4, '#a6c5e2', 2);
    pc.line(x + 5, y + 2, ox + 21, hip + 5, '#f4fbff', 2);
    pc.line(ox + 12, hip + 1, ox + 11, hip + 5, '#f3f8ff');
    pc.line(x, y - 1, x + 3, y + 2, '#faffff', 2);
    pc.line(x + 5, y - 1, x + 4, y + 2, '#d6e5f9');
    pc.set(ox + 20, hip + 4, '#c9e5f2');
  } else {
    pc.line(ox + 14, hip, ox + 11, hip + 4, a.accentColor);
    if (ichigo) {
      const strap = level === 0 ? '#a74246' : level === 4 ? '#e0d4bd' : '#902a42';
      pc.line(x + 1, y + 1, x + 4, hip - 1, strap);
      pc.set(x + 2, y + 2, shade(strap, 0.28));
      if (level === 4) pc.line(x + 5, y + 1, x + 1, hip - 2, '#b7a78f');
    }
  }
  // A wrapped hilt peeks above the back in the roster portraits and empty-handed poses.
  if (ichigo && level === 0) {
    pc.line(x - 4, y - 3, x - 1, y + 3, '#77717e', 2);
    pc.line(x - 4, y - 3, x - 2, y + 1, '#ede5da');
    pc.set(x - 3, y - 1, '#b7a5aa');
  } else if (rukia && level > 0) {
    pc.line(x - 2, y + 1, x - 3, y + 5, '#cadcea');
    pc.set(x - 4, y + 5, '#f4ffff');
  }
}

export function drawBleachHead(pc: PixelCanvas, ox: number, oy: number, a: Appearance, mode: number): void {
  const level = a.form ?? 0;
  if (a.design === 'ichigo') {
    if (level === 2) {
      // Ivory Hollow mask, with the black eye slot and vermilion stripes cut into it.
      pc.ascii(ox + 5, oy + 6, [
        '..IRWWW.',
        '.IWRWWW.',
        '.WRWKKW.',
        '.WRWWWR.',
        '..IWWRI.',
        '...IWW..',
      ], { I: '#b8a7a2', W: '#f8eddb', K: '#40222e', R: '#9c283c' });
      pc.set(ox + 10, oy + 8, mode === 0 ? '#eab13c' : '#67423b');
    } else if (level === 3) {
      pc.ascii(ox + 4, oy + 4, [
        'W........W',
        '.W......W.',
        '.WI....IW.',
        '..IRWWRI..',
        '..IRWWRI..',
        '..WKKKKW..',
        '...RWWR...',
        '...IWWI...',
      ], { I: '#cdb5a2', W: '#f1e1c6', R: '#9e403a', K: '#2a1c29' });
      pc.set(ox + 10, oy + 9, mode === 0 ? '#ffcd63' : '#67423b');
    } else if (level === 4) {
      pc.ascii(ox + 2, oy + 1, [
        'W.....',
        'WI....',
        '.WW...',
        '.IW...',
        '..WW..',
        '..IWW.',
        '...IWR',
      ], { W: '#fff0d4', I: '#c3ab9c', R: '#743749' });
      pc.line(ox + 6, oy + 8, ox + 7, oy + 11, '#513041');
    } else {
      for (const [x, y] of [[4, 3], [6, 3], [7, 2], [10, 3], [12, 4]]) pc.set(ox + x, oy + y, a.hairColor);
      pc.set(ox + 10, oy + 5, '#ffad55');
    }
  } else if (a.design === 'rukia') {
    const dark = shade(a.hairColor, -0.23);
    // The long central lock keeps Rukia's face distinct from the other dark-haired fighters.
    pc.line(ox + 10, oy + 5, ox + 8, oy + 9, dark);
    pc.line(ox + 10, oy + 5, ox + 9, oy + 7, a.hairColor);
    pc.set(ox + 4, oy + 9, a.hairColor);
    if (level === 4) {
      pc.line(ox + 4, oy + 4, ox + 11, oy + 4, '#e6f7ff');
      pc.rect(ox + 6, oy + 3, 2, 1, '#f9ffff');
      pc.rect(ox + 7, oy + 2, 1, 1, '#f9ffff');
      pc.set(ox + 10, oy + 3, '#c1dff3');
      pc.line(ox + 4, oy + 8, ox + 3, oy + 12, '#c6dff6');
    }
  } else if (a.design === 'byakuya') {
    // White kenseikan on the crown and temple, with a long face-framing lock.
    pc.line(ox + 6, oy + 2, ox + 10, oy + 2, '#e6dfea');
    for (const x of [6, 8, 10]) pc.rect(ox + x, oy + 3, 1, 2, '#c2b6d4');
    pc.line(ox + 10, oy + 5, ox + 8, oy + 9, a.hairColor);
    pc.rect(ox + 4, oy + 7, 1, 3, '#ded4eb');
    pc.set(ox + 4, oy + 9, LINING);
  }
}

interface BladeDesign {
  rows: string[];
  palette: Record<string, string>;
  gripY: number;
}

const CLEAVER: BladeDesign = {
  rows: [
    '.....ssssssssssss..',
    '....sddddddddddddss',
    'hhhhGdddddddddddss.',
    '....Gsssssssssss...',
    '.....sss...........',
  ],
  palette: { s: '#dbd7df', d: '#54516c', h: '#d7c6bc', G: '#a69aa6' },
  gripY: 2,
};
const BANKAI: BladeDesign = {
  rows: ['.....G.sssssssssss.', 'rhrhGgdddddddddddds', '.....G.ssssssssss..'],
  palette: { G: '#9a454f', g: '#ce7776', d: '#3f314b', s: '#776078', h: '#2a2134', r: '#ae454e' },
  gripY: 1,
};
const TRUE_ZANGETSU: BladeDesign = {
  rows: ['.......ssssssssss...', 'hhhhGGsddddddddddss.', '.....Gddddddddddddss', '......sssssssssssss.'],
  palette: { h: '#b8a894', G: '#4a3b3d', d: '#332c42', s: '#b6acbb' },
  gripY: 1,
};
const ICE_BLADE: BladeDesign = {
  rows: ['....G.ssssssssss..', 'dhhhGwwwwwwwwwwwws', '....G....sssss....'],
  palette: { G: '#b5d8e8', h: '#f0eaf5', d: '#a1add0', s: '#c5effa', w: '#fff9fd' },
  gripY: 1,
};
const PETAL_BLADE: BladeDesign = {
  rows: ['....GG.sssssssss...', 'hphhGgddddddddddsss', '....GG.sssssssssss.'],
  palette: { G: '#c19565', g: '#eec398', h: '#543555', p: '#a06489', s: '#ece6ed', d: '#a4a1be' },
  gripY: 1,
};
const WHITE_BLADE: BladeDesign = {
  rows: ['.....gwwwwwwwwww...', 'phpgGGwwwwwwwwwwww.', '.....gswwwwwwwwwww.'],
  palette: { G: '#fbf4d7', g: '#d5bfe0', h: '#f6dbe8', p: '#9173a9', w: '#fff7f5', s: '#d8c4ed' },
  gripY: 1,
};

export function bleachBlade(scene: Phaser.Scene, hero: string, level: number): WeaponFrame | undefined {
  let blade: BladeDesign;
  if (hero === 'ichigo') blade = level === 0 || level === 3 ? CLEAVER : level === 4 ? TRUE_ZANGETSU : BANKAI;
  else if (hero === 'rukia') blade = ICE_BLADE;
  else if (hero === 'byakuya') blade = level === 4 ? WHITE_BLADE : PETAL_BLADE;
  else return undefined;
  const key = `zanpakuto-${hero}-${level}`;
  const w = Math.max(...blade.rows.map(row => row.length)) + 2;
  const h = blade.rows.length + 2;
  if (!scene.textures.exists(key)) {
    const pc = new PixelCanvas(w, h);
    pc.ascii(1, 1, blade.rows, blade.palette);
    pc.outline(0, 0, w, h);
    pc.flush();
    scene.textures.addCanvas(key, pc.canvas);
  }
  return { key, frame: '__BASE', gripX: 3, gripY: blade.gripY + 1, w, h };
}
