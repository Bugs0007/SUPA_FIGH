// Edit decisions and film-set directions. The game's combat code is never modified.
const still = who => ({ at: 0, dur: 3000, who, idle: true });
const press = (at, who, btn, dur = 3) => ({ at, dur, who, idle: true, ability: btn !== 'kick', kick: btn !== 'ability' });
const shot = (id, source, seconds, overrides = {}) => ({ id, source, seconds, frames: Math.round(seconds * 60), overrides: { overlays: [], fadeIn: 0, fadeOut: 0, flashIn: 0, flashOut: 0, dim: 0, slow: [], ...overrides } });
const spirit = {
  start: 4, clean: true,
  place: [{ x: 950, y: 512, facing: 1 }, { x: 1140, y: 512, facing: -1, hp: 70 }],
  forms: [{ at: 0, who: 0, level: 4 }],
  patches: [still(0), still(1), press(12, 0, 'both')],
  cam: [{ at: 0, track: [0], dx: 15, dy: -34, z: 2.2, k: 8 }, { at: 55, track: [0, 1], dy: -30, fit: [1.4, 1.9], pad: 45, k: 12 }],
};
const lineup = {
  start: 4, clean: true,
  place: [{ x: 860, y: 512, facing: 1 }, { x: 925, y: 512, facing: 1 }, { x: 990, y: 512, facing: -1 }],
  forms: [{ at: 0, who: 0, level: 4 }, { at: 0, who: 1, level: 4 }, { at: 0, who: 2, level: 4 }],
  patches: [still(0), still(1), still(2)],
  cam: [{ at: 0, track: [0, 1, 2], dy: -45, z: 2.65, k: 4, drift: 1.04 }],
};
export const cut = [
  shot('hook', 'godkame', 1.6, { ...spirit, start: 85, cam: [{ at: 0, track: [0, 1], dy: -25, z: 1.8, k: 8 }] }),
  shot('lineup', 'open', 2.4, lineup),
  shot('rasengan', 'rasengan', 1.6, { slow: [{ at: 23, dur: 18, scale: 0.35, ease: 2 }] }),
  shot('pistol', 'pistol', 1.6, { slow: [{ at: 25, dur: 14, scale: 0.4, ease: 2 }] }),
  shot('blink', 'fly', 1.6, { forms: [], place: [{ x: 850, y: 512, facing: 1 }, { x: 970, y: 512, facing: -1 }], patches: [still(0), still(1), press(18, 0, 'ability')], cam: [{ at: 0, track: [0, 1], z: 3, dy: -22, k: 8 }] }),
  shot('saiyan', 'ladder', 2.4, { forms: [{ at: 12, who: 0, level: 1 }, { at: 42, who: 0, level: 2 }, { at: 72, who: 0, level: 3 }, { at: 102, who: 0, level: 4 }] }),
  shot('cloak', 'kurama', 1.6, { forms: [{ at: 0, who: 0, level: 1 }, { at: 12, who: 0, level: 2 }, { at: 36, who: 0, level: 3 }, { at: 66, who: 0, level: 4 }] }),
  shot('gear5', 'gear5', 1.6, { forms: [{ at: 0, who: 0, level: 3 }, { at: 16, who: 0, level: 4 }] }),
  shot('clones', 'clones', 2.4, { forms: [], patches: [still(0), still(1), press(14, 0, 'kick')], cam: [{ at: 0, track: [0, 1], z: 2.7, dy: -24, k: 6 }] }),
  shot('gatling', 'gatling', 2.4),
  shot('kame', 'kame', 3.2, { slow: [{ at: 50, dur: 32, scale: 0.45 }] }),
  shot('bajrang', 'bajrang', 3.2, { place: [{ x: 380, y: 304, facing: 1 }, { x: 680, y: 304, facing: -1, hp: 100 }], cam: [{ at: 0, track: [0], dx: 50, z: 2.4, dy: -30, k: 6 }, { at: 8, x: 545, y: 274, z: 1.3, k: 12 }], slow: [{ at: 20, dur: 48, scale: 0.22, ease: 2 }] }),
  shot('beast', 'bijudama', 3.2, { slow: [{ at: 65, dur: 24, scale: 0.5 }] }),
  shot('spirit', 'godkame', 4, { ...spirit, slow: [{ at: 95, dur: 72, scale: 0.25, ease: 2 }] }),
  shot('chaos', 'brawlA', 2.4, { cam: [{ at: 0, track: [0, 1, 2], fit: [1.2, 2.3], pad: 55, dy: -25, k: 6 }] }),
  shot('rooftops', null, 2.4, { map: 'rooftops', seed: 28, heroes: ['naruto', 'luffy', 'goku', '', '', ''], powers: true, start: 280, cam: [{ at: 0, track: [0, 1, 2, 3, 4, 5], fit: [0.7, 1.6], pad: 40, dy: -20, k: 5, cine: 1.8 }] }),
  shot('weapons', null, 3.2, { map: 'factory', seed: 17, heroes: ['', '', '', '', '', ''], start: 230, powers: false, cam: [{ at: 0, track: [0, 1, 2, 3, 4, 5], fit: [0.8, 1.6], pad: 35, dy: -25, k: 5, cine: 1.8 }] }),
  shot('end', 'end', 4.2, { ...lineup, dim: 0.28 }),
];
export const DURATION = cut.reduce((n, s) => n + s.seconds, 0);
if (Math.abs(DURATION - 45) > 0.001) throw new Error(`Wrong duration ${DURATION}`);

// Cards sit in the bottom title-safe band, leaving combat unobscured.
export const cards = [
  { at: 0.05, dur: 1.5, text: 'TINY FIGHTERS.', sub: 'HUGE POWER.', style: 'hook' },
  { at: 1.6, dur: 2.4, text: 'BRAWLKAI', sub: 'ANIME POWER. ARCADE CHAOS.', style: 'brand' },
  { at: 4, dur: 1.6, text: 'RASENGAN', sub: 'NARUTO', hue: '#ffd84a' },
  { at: 5.6, dur: 1.6, text: 'GUM-GUM PISTOL', sub: 'LUFFY', hue: '#ff9568' },
  { at: 7.2, dur: 1.6, text: 'INSTANT TRANSMISSION', sub: 'GOKU', hue: '#6ad0ff' },
  { at: 8.8, dur: 5.6, text: 'POWER UP.', sub: 'UNLEASH YOUR NEXT FORM.', style: 'chapter' },
  { at: 14.4, dur: 2.4, text: 'SHADOW CLONES', sub: 'BRING BACKUP.', hue: '#ffd84a' },
  { at: 16.8, dur: 2.4, text: 'GUM-GUM GATLING', sub: 'KEEP THE HITS COMING.', hue: '#ff9568' },
  { at: 19.2, dur: 3.2, text: 'KAMEHAMEHA', sub: 'MAKE SOME SPACE.', hue: '#6ad0ff' },
  { at: 22.4, dur: 3.2, text: 'BAJRANG GUN', sub: 'GO BIG.', hue: '#ff9568' },
  { at: 25.6, dur: 3.2, text: 'TAILED BEAST BOMB', sub: 'UNLEASH THE BEAST.', hue: '#ffd84a' },
  { at: 28.8, dur: 4, text: 'SPIRIT BOMB', sub: 'ONE GIANT FINISH.', hue: '#6ad0ff' },
  { at: 32.8, dur: 8, text: 'PURE ARCADE CHAOS.', sub: 'LOCAL MULTIPLAYER + BOTS / UP TO 10 FIGHTERS', style: 'chapter' },
  { at: 40.8, dur: 4.2, text: 'BRAWLKAI', sub: 'PLAY FREE IN YOUR BROWSER', style: 'end' },
];
