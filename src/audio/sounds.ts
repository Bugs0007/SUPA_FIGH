import type { SfxDef } from './sfxr';

// Every sound in the game, as synth parameters. Tweak freely.

export const SOUNDS: Record<string, SfxDef> = {
  swing: [{ wave: 'noise', freq: 2400, slide: -1.5, attack: 0.02, sustain: 0.02, decay: 0.08, lowpass: 0.25, volume: 0.22 }],
  punch: [
    { wave: 'noise', freq: 1400, slide: -3, decay: 0.07, lowpass: 0.5, volume: 0.45 },
    { wave: 'sine', freq: 160, slide: -3, decay: 0.1, volume: 0.6 },
  ],
  kick: [
    { wave: 'noise', freq: 900, slide: -3, decay: 0.1, lowpass: 0.4, volume: 0.5 },
    { wave: 'sine', freq: 120, slide: -3, decay: 0.16, volume: 0.8, punch: 0.3, sustain: 0.02 },
  ],
  pistol: [
    { wave: 'noise', freq: 1800, slide: -2.5, decay: 0.16, sustain: 0.01, punch: 0.6, volume: 0.55 },
    { wave: 'square', freq: 700, slide: -6, decay: 0.05, volume: 0.25 },
  ],
  shotgun: [
    { wave: 'noise', freq: 900, slide: -2, sustain: 0.03, punch: 0.8, decay: 0.34, volume: 0.8, lowpass: 0.7 },
    { wave: 'sine', freq: 95, slide: -2, decay: 0.24, volume: 0.9 },
    { wave: 'noise', freq: 3000, delay: 0.24, decay: 0.05, volume: 0.15 },
    { wave: 'noise', freq: 2200, delay: 0.33, decay: 0.05, volume: 0.15 },
  ],
  empty: [{ wave: 'square', freq: 1600, decay: 0.025, volume: 0.25, duty: 0.3 }],
  ricochet: [{ wave: 'sine', freq: 2600, slide: -1.6, decay: 0.28, vibDepth: 0.04, vibSpeed: 40, volume: 0.25 }],
  impact: [{ wave: 'noise', freq: 2600, slide: -2, decay: 0.05, volume: 0.22 }],
  impactWood: [{ wave: 'noise', freq: 700, slide: -2, decay: 0.06, lowpass: 0.4, volume: 0.3 }],
  glass: [
    { wave: 'noise', freq: 6000, decay: 0.35, highpass: 0.6, volume: 0.35, tremolo: 30 },
    { wave: 'sine', freq: 3200, slide: 1, decay: 0.12, volume: 0.1, delay: 0.02 },
    { wave: 'sine', freq: 4100, slide: -1, decay: 0.1, volume: 0.1, delay: 0.07 },
  ],
  jump: [{ wave: 'square', freq: 260, slide: 2.2, decay: 0.09, duty: 0.25, volume: 0.1 }],
  land: [{ wave: 'noise', freq: 500, slide: -2, decay: 0.06, lowpass: 0.3, volume: 0.25 }],
  roll: [{ wave: 'noise', freq: 300, attack: 0.03, sustain: 0.1, decay: 0.15, lowpass: 0.2, volume: 0.25 }],
  pickup: [{ wave: 'square', freq: 600, arpMul: 1.5, arpTime: 0.05, decay: 0.12, sustain: 0.03, duty: 0.4, volume: 0.18 }],
  cycle: [{ wave: 'square', freq: 900, decay: 0.03, duty: 0.2, volume: 0.12 }],
  toss: [{ wave: 'noise', freq: 1600, slide: -1, attack: 0.02, decay: 0.12, lowpass: 0.3, volume: 0.2 }],
  bonk: [
    { wave: 'square', freq: 500, slide: -3, decay: 0.08, volume: 0.25 },
    { wave: 'noise', freq: 1200, decay: 0.05, volume: 0.25 },
  ],
  hurt: [{ wave: 'saw', freq: 420, slide: -2.5, decay: 0.12, volume: 0.2 }],
  death: [
    { wave: 'saw', freq: 380, slide: -2.2, decay: 0.45, volume: 0.3, vibDepth: 0.05, vibSpeed: 12 },
    { wave: 'noise', freq: 700, slide: -1.5, decay: 0.3, lowpass: 0.35, volume: 0.35 },
  ],
  thud: [
    { wave: 'sine', freq: 110, slide: -2, decay: 0.14, volume: 0.6 },
    { wave: 'noise', freq: 400, decay: 0.08, lowpass: 0.3, volume: 0.3 },
  ],
  splat: [
    { wave: 'noise', freq: 600, slide: -2, decay: 0.16, lowpass: 0.35, volume: 0.5 },
    { wave: 'sine', freq: 80, slide: -1, decay: 0.15, volume: 0.6 },
  ],
  grab: [{ wave: 'square', freq: 340, slide: -1, decay: 0.07, duty: 0.3, volume: 0.18 }],
  throw: [{ wave: 'noise', freq: 1800, slide: -1.2, attack: 0.03, sustain: 0.05, decay: 0.2, lowpass: 0.3, volume: 0.35 }],
  spawn: [
    { wave: 'sine', freq: 1200, slide: 2, decay: 0.12, volume: 0.15 },
    { wave: 'sine', freq: 1800, slide: 2, decay: 0.12, volume: 0.1, delay: 0.06 },
  ],
  break: [
    { wave: 'noise', freq: 900, decay: 0.2, lowpass: 0.5, volume: 0.4 },
    { wave: 'noise', freq: 400, delay: 0.05, decay: 0.15, lowpass: 0.3, volume: 0.3 },
  ],
  uiMove: [{ wave: 'square', freq: 880, decay: 0.035, duty: 0.25, volume: 0.12 }],
  uiOk: [{ wave: 'square', freq: 660, arpMul: 2, arpTime: 0.05, sustain: 0.04, decay: 0.1, duty: 0.25, volume: 0.15 }],
  uiBack: [{ wave: 'square', freq: 500, slide: -2, decay: 0.08, duty: 0.25, volume: 0.13 }],
  roundStart: [
    { wave: 'square', freq: 440, sustain: 0.08, decay: 0.05, duty: 0.3, volume: 0.15 },
    { wave: 'square', freq: 660, sustain: 0.08, decay: 0.05, duty: 0.3, volume: 0.15, delay: 0.12 },
    { wave: 'square', freq: 880, sustain: 0.16, decay: 0.2, duty: 0.3, volume: 0.18, delay: 0.24 },
  ],
  roundEnd: [
    { wave: 'square', freq: 880, sustain: 0.08, decay: 0.05, duty: 0.4, volume: 0.15 },
    { wave: 'square', freq: 660, sustain: 0.08, decay: 0.05, duty: 0.4, volume: 0.15, delay: 0.12 },
    { wave: 'square', freq: 990, sustain: 0.3, decay: 0.3, duty: 0.4, volume: 0.18, delay: 0.24 },
  ],
  slowmo: [{ wave: 'sine', freq: 180, slide: -1.2, attack: 0.05, sustain: 0.2, decay: 0.6, volume: 0.35, vibDepth: 0.03, vibSpeed: 5 }],
  announce: [
    { wave: 'sine', freq: 90, slide: -0.5, sustain: 0.1, decay: 0.4, volume: 0.6 },
    { wave: 'noise', freq: 200, decay: 0.3, lowpass: 0.15, volume: 0.3 },
  ],
};
