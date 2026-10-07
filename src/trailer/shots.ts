// Trailer shots (data). Each shot is one deterministic scene: a map, a seed, bot heroes, where they start,
// scripted intent patches (in sim TICKS since match start), and a camera / slow-mo / overlay plan (in VIDEO
// FRAMES since the shot's first recorded frame). 60 fps, 1 beat = 24 frames at 150 BPM.
// To add a shot: append to SHOTS, then `sh scripts/trailer/preview.sh <id>` (see scripts/trailer/README.md).

export interface Place {
  /** px; y = feet */
  x: number;
  y: number;
  facing?: 1 | -1;
  hp?: number;
}

export interface Patch {
  at: number;
  dur: number;
  who: number;
  /** walk toward this fighter index */
  face?: number;
  /** clear the bot's own intent for the window first */
  idle?: boolean;
  moveX?: number;
  moveY?: number;
  jump?: boolean;
  attack?: boolean;
  kick?: boolean;
  ability?: boolean;
  interact?: boolean;
}

export interface CamKey {
  /** first video frame this key applies to */
  at: number;
  /** follow these fighter indices (centroid) */
  track?: number[];
  /** fixed world position when `track` is absent; offsets when it is present */
  x?: number;
  y?: number;
  dx?: number;
  dy?: number;
  z?: number;
  /** auto-zoom to fit the tracked fighters, clamped to [min, max] */
  fit?: [number, number];
  pad?: number;
  /** smoothing speed (1/s); higher = snappier */
  k?: number;
  /** when the sim's own kill slow-mo is running, focus its spot at (at least) this zoom */
  cine?: number;
  /** push-in (>1) / pull-back (<1): zoom multiplier reached at `until` (default shot end) */
  drift?: number;
  until?: number;
}

export interface Overlay {
  at: number;
  dur: number;
  text: string;
  /** native px (640x360 view) */
  y?: number;
  scale?: number;
  color?: number;
  anim?: 'slam' | 'fade' | 'pop';
  font?: 'pxo' | 'smo';
}

export interface ShotSpec {
  id: string;
  map: string;
  seed: number;
  /** hero id per fighter ('' = scrapper); every fighter is a bot */
  heroes: string[];
  /** bot difficulty (default expert) */
  diff?: 'easy' | 'normal' | 'hard' | 'expert';
  /** natural power-orb spawns (default off: orbs only where `items` puts them) */
  powers?: boolean;
  place?: (Place | null)[];
  /** remove the map's crates / barrels / dropped items before the first tick (clean title / end cards) */
  clean?: boolean;
  /** sim ticks simulated (unrecorded) before frame 0 */
  start?: number;
  /** form level changes: at = sim tick (0 = silently before the first tick) */
  forms?: { at: number; who: number; level: number }[];
  /** items spawned at a tick (e.g. a power orb to pick up) */
  items?: { at: number; id: string; x: number; y: number }[];
  patches?: Patch[];
  cam: CamKey[];
  slow?: { at: number; dur: number; scale: number; ease?: number }[];
  overlays?: Overlay[];
  /** fade from / to black (frames) */
  fadeIn?: number;
  fadeOut?: number;
  /** white flash in / out (frames) */
  flashIn?: number;
  flashOut?: number;
  /** dim the picture (0..1), e.g. behind a title */
  dim?: number;
  /** length in video frames */
  frames: number;
}

// ---- authoring helpers -------------------------------------------------------------------------
/** hold a fighter still (bot AI off) for the whole shot */
const still = (who: number, dur = 900): Patch => ({ at: 0, dur, who, idle: true });
type Btn = 'ability' | 'kick' | 'both';
/** press a hero button (both = super) at a sim tick, holding `dur` ticks, optionally facing a target */
const press = (at: number, who: number, btn: Btn, dur = 3, extra: Partial<Patch> = {}): Patch => ({
  at,
  dur,
  who,
  idle: true,
  ability: btn !== 'kick',
  kick: btn !== 'ability',
  ...extra,
});

const GOLD = 0xffd84a;
const CYAN = 0x6ad0ff;
const ORANGE = 0xff9a3a;
const WHITE = 0xffffff;

export const SHOTS: Record<string, ShotSpec> = {
  // ---------------------------------------------------------------- title
  open: {
    id: 'open', map: 'alien', seed: 31, heroes: ['naruto', 'luffy', 'goku'], start: 4, clean: true,
    place: [{ x: 625, y: 512, facing: 1 }, { x: 682, y: 512, facing: 1 }, { x: 742, y: 512, facing: -1 }],
    forms: [{ at: 0, who: 0, level: 4 }, { at: 0, who: 1, level: 4 }, { at: 0, who: 2, level: 4 }],
    patches: [still(0), still(1), still(2)],
    cam: [{ at: 0, track: [0, 1, 2], fit: [2, 2.6], pad: 150, dy: -34, k: 3, drift: 1.06 }],
    overlays: [
      { at: 48, dur: 144, text: 'BRAWLKAI', y: 112, scale: 7, color: GOLD, anim: 'slam' },
      { at: 96, dur: 96, text: 'TINY FIGHTERS. HUGE POWER.', y: 168, scale: 2, color: WHITE, anim: 'fade' },
    ],
    fadeIn: 20, flashOut: 6, dim: 0.18,
    frames: 192,
  },

  // ---------------------------------------------------------------- beat 1: base abilities (2 beats each)
  rasengan: {
    id: 'rasengan', map: 'leaf', seed: 21, heroes: ['naruto', 'luffy'], start: 9,
    place: [{ x: 1060, y: 528, facing: 1 }, { x: 1118, y: 528, facing: -1 }],
    patches: [still(0), still(1), press(15, 0, 'ability', 3, { face: 1 })],
    cam: [{ at: 0, track: [0, 1], z: 3.2, dy: -20, k: 6 }],
    slow: [{ at: 23, dur: 9, scale: 0.25, ease: 2 }],
    overlays: [{ at: 4, dur: 44, text: 'RASENGAN', y: 306, scale: 3, color: CYAN, anim: 'slam' }],
    frames: 48,
  },
  pistol: {
    id: 'pistol', map: 'ship', seed: 22, heroes: ['luffy', 'goku'], start: 6,
    place: [{ x: 420, y: 304, facing: 1 }, { x: 500, y: 304, facing: -1 }],
    patches: [still(0), still(1), press(24, 0, 'ability')],
    cam: [{ at: 0, track: [0, 1], z: 3, dy: -20, k: 6 }],
    slow: [{ at: 25, dur: 9, scale: 0.25, ease: 2 }],
    overlays: [{ at: 4, dur: 44, text: 'GUM-GUM PISTOL', y: 306, scale: 3, color: ORANGE, anim: 'slam' }],
    frames: 48,
  },
  fly: {
    id: 'fly', map: 'alien', seed: 23, heroes: ['goku', 'naruto'], start: 4,
    place: [{ x: 830, y: 512, facing: 1 }, { x: 960, y: 512, facing: -1 }],
    forms: [{ at: 0, who: 0, level: 1 }],
    patches: [
      still(0), still(1),
      press(8, 0, 'ability'),
      { at: 14, dur: 8, who: 0, idle: true, moveY: -1 },
      { at: 45, dur: 20, who: 0, idle: true, kick: true, moveX: 0.6 },
      { at: 65, dur: 6, who: 0, idle: true, moveY: 1, moveX: 0.6 },
    ],
    cam: [{ at: 0, track: [0], z: 3.4, dy: -10, k: 4 }, { at: 52, track: [0, 1], fit: [2, 2.8], pad: 50, dy: -20, k: 9 }],
    slow: [{ at: 72, dur: 14, scale: 0.35, ease: 2 }],
    overlays: [{ at: 4, dur: 46, text: 'LEVITATION', y: 306, scale: 3, color: WHITE, anim: 'slam' }, { at: 52, dur: 42, text: 'KAMEHAMEHA', y: 306, scale: 3, color: CYAN, anim: 'slam' }],
    frames: 96,
  },

  // ---------------------------------------------------------------- beat 2: power orbs & transformations
  ladder: {
    id: 'ladder', map: 'alien', seed: 24, heroes: ['goku', 'naruto'], start: 4,
    place: [{ x: 860, y: 512, facing: 1 }, { x: 1100, y: 512, facing: -1 }],
    forms: [{ at: 4, who: 0, level: 1 }, { at: 34, who: 0, level: 2 }, { at: 62, who: 0, level: 3 }],
    patches: [still(0), still(1)],
    cam: [{ at: 0, track: [0], z: 3.4, dy: -20, k: 5, drift: 1.15 }],
    frames: 96,
  },
  kurama: {
    id: 'kurama', map: 'alien', seed: 25, heroes: ['naruto', 'luffy'], start: 4,
    place: [{ x: 860, y: 512, facing: 1 }, { x: 1100, y: 512, facing: -1 }],
    forms: [{ at: 0, who: 0, level: 3 }, { at: 4, who: 0, level: 4 }],
    patches: [still(0), still(1)],
    cam: [{ at: 0, track: [0], z: 3.4, dy: -20, k: 5, drift: 1.12 }],
    frames: 48,
  },
  gear5: {
    id: 'gear5', map: 'ship', seed: 26, heroes: ['luffy', 'goku'], start: 4,
    place: [{ x: 420, y: 304, facing: 1 }, { x: 700, y: 304, facing: -1 }],
    forms: [{ at: 0, who: 0, level: 3 }, { at: 4, who: 0, level: 4 }],
    patches: [still(0), still(1)],
    cam: [{ at: 0, track: [0], z: 3.4, dy: -20, k: 5, drift: 1.12 }],
    frames: 48,
  },

  // ---------------------------------------------------------------- beat 3: second abilities
  kame: {
    id: 'kame', map: 'alien', seed: 11, heroes: ['goku', 'naruto'], start: 4,
    place: [{ x: 830, y: 512, facing: 1 }, { x: 1045, y: 512, facing: -1 }],
    forms: [{ at: 0, who: 0, level: 3 }],
    patches: [still(0), still(1), press(8, 0, 'kick', 43)],
    cam: [{ at: 0, track: [0], z: 3.6, dy: -20, k: 5 }, { at: 46, track: [0, 1], fit: [1.7, 2.4], pad: 40, dy: -20, k: 14 }],
    slow: [{ at: 50, dur: 40, scale: 0.35 }],
    overlays: [{ at: 8, dur: 100, text: 'KAMEHAMEHA', y: 306, scale: 3, color: CYAN, anim: 'slam' }],
    frames: 120,
  },
  clones: {
    id: 'clones', map: 'leaf', seed: 25, heroes: ['naruto', 'luffy'], start: 4,
    place: [{ x: 100, y: 528, facing: 1 }, { x: 180, y: 528, facing: -1 }],
    forms: [{ at: 0, who: 0, level: 2 }],
    patches: [still(0), still(1), press(10, 0, 'kick')],
    cam: [{ at: 0, track: [0, 1], z: 3, dy: -20, k: 6 }],
    overlays: [{ at: 4, dur: 68, text: 'SHADOW CLONES', y: 306, scale: 3, color: ORANGE, anim: 'slam' }],
    frames: 72,
  },
  gatling: {
    id: 'gatling', map: 'ship', seed: 26, heroes: ['luffy', 'goku'], start: 4,
    place: [{ x: 420, y: 304, facing: 1 }, { x: 468, y: 304, facing: -1 }],
    forms: [{ at: 0, who: 0, level: 2 }],
    patches: [still(0), still(1), press(8, 0, 'kick')],
    cam: [{ at: 0, track: [0, 1], z: 3.4, dy: -20, k: 6 }],
    overlays: [{ at: 4, dur: 90, text: 'GUM-GUM GATLING', y: 306, scale: 3, color: ORANGE, anim: 'slam' }],
    frames: 96,
  },

  // ---------------------------------------------------------------- beat 4: super moves
  bajrang: {
    id: 'bajrang', map: 'ship', seed: 27, heroes: ['luffy', 'goku'], start: 4,
    place: [{ x: 380, y: 304, facing: 1 }, { x: 500, y: 304, facing: -1 }],
    forms: [{ at: 0, who: 0, level: 4 }],
    patches: [still(0), still(1), press(16, 0, 'both')],
    cam: [{ at: 0, track: [0], z: 3.2, dy: -20, k: 5 }, { at: 14, track: [0], dx: 70, z: 2.2, dy: -20, k: 10 }],
    slow: [{ at: 25, dur: 20, scale: 0.3, ease: 2 }],
    frames: 72,
  },
  bijudama: {
    id: 'bijudama', map: 'docks', seed: 28, heroes: ['naruto', 'luffy'], start: 4,
    place: [{ x: 960, y: 288, facing: 1 }, { x: 1105, y: 288, facing: -1 }],
    forms: [{ at: 0, who: 0, level: 4 }],
    patches: [still(0), still(1), press(4, 0, 'both')],
    cam: [{ at: 0, track: [0], z: 3.2, dy: -20, k: 5 }, { at: 36, track: [0, 1], fit: [1.6, 2.4], dy: -20, k: 8 }],
    frames: 120,
  },
  godkame: {
    id: 'godkame', map: 'alien', seed: 29, heroes: ['goku', 'naruto'], start: 4,
    place: [{ x: 500, y: 512, facing: 1 }, { x: 840, y: 512, facing: -1 }],
    forms: [{ at: 0, who: 0, level: 4 }],
    patches: [still(0), still(1), press(12, 0, 'both')],
    cam: [{ at: 0, track: [0], z: 3.2, dy: -20, k: 5 }, { at: 26, track: [0, 1], fit: [1.5, 2.1], pad: 40, dy: -20, k: 10 }, { at: 76, track: [1], z: 2.4, dy: -10, k: 7 }],
    slow: [{ at: 40, dur: 20, scale: 0.45 }, { at: 80, dur: 40, scale: 0.4 }],
    overlays: [{ at: 112, dur: 32, text: 'K.O.!', y: 150, scale: 8, color: 0xff4a3a, anim: 'slam' }],
    frames: 144,
  },
  // ---------------------------------------------------------------- end card (the heroes standing off, dimmed)
  end: {
    id: 'end', map: 'alien', seed: 33, heroes: ['naruto', 'luffy', 'goku'], start: 4, clean: true,
    place: [{ x: 625, y: 512, facing: 1 }, { x: 682, y: 512, facing: 1 }, { x: 742, y: 512, facing: -1 }],
    forms: [{ at: 0, who: 0, level: 4 }, { at: 0, who: 1, level: 4 }, { at: 0, who: 2, level: 4 }],
    patches: [still(0), still(1), still(2)],
    cam: [{ at: 0, track: [0, 1, 2], fit: [2, 2.6], pad: 150, dy: -44, k: 3, drift: 1.04 }],
    overlays: [
      { at: 0, dur: 288, text: 'BRAWLKAI', y: 96, scale: 7, color: GOLD, anim: 'slam' },
      { at: 40, dur: 248, text: 'PLAY FREE IN YOUR BROWSER', y: 150, scale: 2, color: WHITE, anim: 'fade' },
      { at: 72, dur: 216, text: 'SUPA-FIGH.VERCEL.APP', y: 190, scale: 3, color: CYAN, anim: 'pop' },
    ],
    flashIn: 8, fadeOut: 30, dim: 0.5,
    frames: 288,
  },

  // ---------------------------------------------------------------- natural bot-vs-bot brawls (found with scripts/trailer/scout.ts)
  brawlA: {
    id: 'brawlA', map: 'alien', seed: 14, heroes: ['naruto', 'luffy', 'goku'], start: 131,
    forms: [{ at: 0, who: 0, level: 3 }, { at: 0, who: 1, level: 3 }, { at: 0, who: 2, level: 3 }],
    cam: [{ at: 0, track: [0, 1, 2], fit: [1.3, 2.6], pad: 80, dy: -20, k: 4 }],
    frames: 330,
  },
  finale: {
    id: 'finale', map: 'alien', seed: 14, heroes: ['naruto', 'luffy', 'goku'], start: 300,
    forms: [{ at: 0, who: 0, level: 3 }, { at: 0, who: 1, level: 3 }, { at: 0, who: 2, level: 3 }],
    cam: [{ at: 0, track: [2, 0], fit: [1.5, 2], pad: 24, dy: -20, k: 5 }],
    frames: 144,
  },
  /** poster.jpg: the beam clash with the logo on top (not part of the cut; record with --every, take frame 76) */
  poster: {
    id: 'poster', map: 'alien', seed: 14, heroes: ['naruto', 'luffy', 'goku'], start: 300,
    forms: [{ at: 0, who: 0, level: 3 }, { at: 0, who: 1, level: 3 }, { at: 0, who: 2, level: 3 }],
    cam: [{ at: 0, track: [2, 0], fit: [1.5, 2], pad: 24, dx: -45, dy: -20, k: 5 }],
    overlays: [
      { at: 0, dur: 200, text: 'BRAWLKAI', y: 70, scale: 8, color: GOLD, anim: 'fade' },
      { at: 0, dur: 200, text: 'TINY FIGHTERS. HUGE POWER.', y: 126, scale: 2, color: WHITE, anim: 'fade' },
    ],
    frames: 100,
  },
  brawlB: {
    id: 'brawlB', map: 'alien', seed: 10, heroes: ['naruto', 'luffy', 'goku'], start: 34,
    forms: [{ at: 0, who: 0, level: 3 }, { at: 0, who: 1, level: 3 }, { at: 0, who: 2, level: 3 }],
    cam: [{ at: 0, track: [0, 1, 2], fit: [1.3, 2.6], pad: 80, dy: -20, k: 4 }],
    frames: 330,
  },
};

/** the cut, in order; durations are the shots' `frames` (150 BPM: 24 frames per beat, 96 per bar) */
export const TIMELINE = ['open', 'rasengan', 'pistol', 'fly', 'ladder', 'kurama', 'gear5', 'kame', 'clones', 'gatling', 'bajrang', 'bijudama', 'finale', 'godkame', 'end'];

export function shotById(id: string | null): ShotSpec | null {
  return id ? (SHOTS[id] ?? null) : null;
}

/**
 * `?trailer=1` without a shot: a free-running, real-time bots-only match for screen recording. No HUD, no name
 * tags, power orbs on, a camera that frames the action. Params: heroes=naruto,luffy,goku  map=alien  seed=1  diff=expert
 */
export function freeShot(params: URLSearchParams): ShotSpec {
  const heroes = (params.get('heroes') ?? 'naruto,luffy,goku').split(',').filter((h) => h !== undefined);
  const diff = params.get('diff');
  return {
    id: 'free',
    map: params.get('map') ?? 'alien',
    seed: Number(params.get('seed') ?? 1) || 1,
    heroes,
    diff: diff === 'easy' || diff === 'normal' || diff === 'hard' ? diff : 'expert',
    powers: params.get('powers') !== '0',
    cam: [{ at: 0, track: heroes.map((_, i) => i), fit: [0.75, 2.3], pad: 70, dy: -20, k: 4, cine: 2.2 }],
    frames: Number.MAX_SAFE_INTEGER,
  };
}
