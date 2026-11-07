export interface RosterSpecial {
  name: string;
  description: string;
  reach: number;
  windup: number;
  duration: number;
  cooldown: number;
  demoGap: number;
  /** Times, in seconds from input, when the attack's distinct beats resolve. */
  beats: readonly [number, ...number[]];
}

function move(name: string, description: string, reach: number, demoGap: number,
  cooldown: number, duration: number, ...beats: [number, ...number[]]): RosterSpecial {
  return { name, description, reach, demoGap, cooldown, duration, windup: beats[0], beats };
}

const SPECIALS: Readonly<Partial<Record<string, RosterSpecial>>> = {
  '': move('SHOULDER CHECK', 'STEP IN WITH A SHOULDER AND SEND A NEARBY RIVAL TUMBLING.', 32, 22, 4.4, 0.45, 0.14),
  vegeta: move('ROYAL KNUCKLE', 'A CLOSE STRIKE PRIMES A SECOND KI BURST AT THE POINT OF IMPACT.', 31, 23, 5.8, 0.59, 0.17, 0.36),
  zoro: move("LION'S SONG", 'SHEATHE, DRAW, AND CUT THROUGH RIVALS IN A STRAIGHT LINE.', 86, 56, 5.7, 0.52, 0.22),
  sanji: move('PARTY TABLE KICK COURSE', 'TRAVEL INTO A HANDSTAND SPIN AND SWEEP RIVALS UP ON THE FINAL KICK.', 52, 28, 5.7, 0.64, 0.13, 0.25, 0.39),
  law: move('TAKT', 'LIFT THE RIVAL WITH ROOM AND SLAM THEM BACK DOWN.', 143, 92, 6.8, 0.68, 0.26, 0.47),
  ichigo: move('SYZYGY', 'A LOW CUT LIFTS THE RIVAL INTO A SECOND BLADE COMING DOWN.', 37, 26, 5.3, 0.53, 0.15, 0.29),
  rukia: move('WHITE RIBBON SNARE', 'MARK THE GROUND, BIND RIVALS IN FROST, THEN RAISE A COLUMN OF ICE.', 126, 83, 6.1, 0.75, 0.37, 0.53),
  byakuya: move('SAKURASHIGURE', 'RAIN THREE WAVES OF BLADE PETALS OVER A MARKED AREA.', 148, 106, 6.2, 0.77, 0.25, 0.40, 0.56),
  asta: move('CAUSALITY BREAK', 'CUT THROUGH A NEARBY RIVAL, DISPEL ENERGY SHOTS AND CLEAR YOUR OWN BURNING.', 43, 30, 5.6, 0.43, 0.16),
  yuno: move('GALE VORTEX', 'PULL RIVALS IN WITH TWO WIND PULSES, THEN LAUNCH THEM UPWARD.', 133, 96, 6.7, 0.81, 0.22, 0.39, 0.58),
  yami: move('BLACK MOON', 'OPEN A DARK FIELD THAT SWALLOWS SHOTS, THEN SLASH THROUGH IT.', 48, 37, 6.2, 0.64, 0.15, 0.42),
};

export function rosterSpecial(hero: string): RosterSpecial | undefined {
  return Object.hasOwn(SPECIALS, hero) ? SPECIALS[hero] : undefined;
}
