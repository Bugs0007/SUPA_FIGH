/** Form-specific art direction. These values never change damage, reach or cooldowns. */
export interface HeroMoveLook {
  name: string;
  core: number;
  rim: number;
  spark: number;
  helpers: number;
  shapingArms: number;
  lightning: number;
  rubber: 'plain' | 'jet' | 'inflated' | 'haki' | 'cartoon';
}

const look = (name: string, core: number, rim: number, spark: number, extras: Partial<HeroMoveLook> = {}): HeroMoveLook => ({ name, core, rim, spark, helpers: 0, shapingArms: 0, lightning: 0, rubber: 'plain', ...extras });

export const HERO_MOVES: Record<string, readonly HeroMoveLook[]> = {
  sasuke: [
    look('CHIDORI', 0xe0f7ff, 0x398fe3, 0xffffff, { lightning: 2 }),
    look('SHARINGAN CHIDORI', 0xe0f7ff, 0x398fe3, 0xffffff, { lightning: 3 }),
    look('CURSE MARK CHIDORI', 0xe0f7ff, 0x398fe3, 0xffffff, { lightning: 4 }),
    look('MANGEKYO CHIDORI', 0xe0f7ff, 0x398fe3, 0xffffff, { lightning: 4 }),
    look('SIX PATHS CHIDORI', 0xe0f7ff, 0x398fe3, 0xffffff, { lightning: 5 }),
  ],
  naruto: [
    look('RASENGAN', 0x8ddcff, 0x357be8, 0xe2f8ff),
    look('TAIL + CLONE RASENGAN', 0x8ddcff, 0xb92545, 0xff9d82, { helpers: 2, shapingArms: 1 }),
    look('CRIMSON CHAKRA RASENGAN', 0xed7887, 0x731330, 0xffb299, { shapingArms: 4 }),
    look('SKELETAL CHAKRA RASENGAN', 0xef6d86, 0x301125, 0xf1dfbe, { shapingArms: 6 }),
    look('KURAMA CHAKRA-ARM RASENGAN', 0xffedac, 0xe7a722, 0xfffbe0, { shapingArms: 2 }),
  ],
  luffy: [
    look('GUM-GUM', 0xedbd97, 0x422a32, 0xffffff),
    look('JET', 0xf3a4ad, 0xed637e, 0xffffff, { rubber: 'jet' }),
    look('ELEPHANT', 0xf0bc96, 0x5a3440, 0xffffff, { rubber: 'inflated' }),
    look('KONG', 0x211d32, 0xa62543, 0xf36a7b, { rubber: 'haki' }),
    look('NIKA', 0xf3d0b3, 0xf5f4ed, 0xffffff, { rubber: 'cartoon' }),
  ],
  goku: [
    look('KAMEHAMEHA', 0xa5e7ff, 0x337dda, 0xe9faff),
    look('SUPER SAIYAN KAMEHAMEHA', 0xb6e9ff, 0x438ae3, 0xffe274),
    look('SSJ2 KAMEHAMEHA', 0xc9efff, 0x568eee, 0xffffa4, { lightning: 2 }),
    look('SSJ3 KAMEHAMEHA', 0xd6f2ff, 0x648cde, 0xffcf65, { lightning: 3 }),
    look('GOD KAMEHAMEHA', 0xd5fcff, 0x2189d6, 0x71e3ff, { lightning: 4 }),
  ],
};

export function moveLook(hero: string, level: number): HeroMoveLook {
  const forms = Object.hasOwn(HERO_MOVES, hero) ? HERO_MOVES[hero] : HERO_MOVES.goku;
  return forms[Math.max(0, Math.min(forms.length - 1, Math.floor(level)))];
}
