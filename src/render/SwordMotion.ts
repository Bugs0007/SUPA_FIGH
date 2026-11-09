import type Phaser from 'phaser';
import { BF } from '../art/fighterArt';
import { moveLook } from '../art/heroMoves';
import { rosterSpecial } from '../sim/data/rosterSpecials';
import type { MeleeHit } from '../sim/data/weapons';
import type { Fighter } from '../sim/fighter';
import { formLevel } from './formLevel';

type Cut = 'draw' | 'reverse' | 'sweep' | 'cleave' | 'rise' | 'thrust';
type SwordStyle = { cuts: readonly Cut[]; length: number; width: number; weight: number; twoHanded?: boolean; followKick?: boolean };

const SWORDS: Readonly<Record<string, SwordStyle>> = {
  zoro: {
    cuts: ['draw', 'reverse', 'rise', 'sweep'],
    length: 14, width: 3, weight: 1.06, followKick: true,
  },
  law: {
    cuts: ['draw', 'rise', 'reverse'],
    length: 16, width: 2, weight: 0.93,
  },
  ichigo: {
    cuts: ['sweep', 'rise', 'cleave'],
    length: 15, width: 4, weight: 1.16, twoHanded: true,
  },
  rukia: {
    cuts: ['draw', 'rise', 'reverse'],
    length: 11, width: 2, weight: 0.79,
  },
  byakuya: {
    cuts: ['draw', 'reverse', 'thrust'],
    length: 12, width: 2, weight: 0.88,
  },
  asta: {
    cuts: ['cleave', 'sweep', 'rise'],
    length: 14, width: 5, weight: 1.30, twoHanded: true,
  },
  yami: {
    cuts: ['draw', 'reverse', 'cleave'],
    length: 12, width: 3, weight: 1.07,
  },
  yuno: {
    cuts: ['reverse', 'thrust', 'rise'],
    length: 17, width: 3, weight: 0.86,
  },
};

const clamp = (p: number) => Math.max(0, Math.min(1, p));
const mix = (a: number, b: number, p: number) => a + (b - a) * p;
const ease = (p: number) => p * p * (3 - 2 * p);

const HELD_CUTS: Readonly<Record<string, readonly Cut[]>> = {
  katana: ['draw', 'reverse', 'cleave'],
  machete: ['cleave', 'sweep', 'reverse'],
  knife: ['thrust', 'reverse', 'thrust'],
};

interface Swing {
  cut: Cut;
  length: number;
  width: number;
  hit: MeleeHit;
  previous?: Cut;
  rear?: Cut;
  weight: number;
  twoHanded: boolean;
}

export function swordSwing(f: Fighter, hit: MeleeHit, held: string): Swing | undefined {
  if (held !== 'fists') {
    const cuts = HELD_CUTS[held];
    if (!cuts) return;
    return {
      cut: cuts[Math.min(f.combo, cuts.length - 1)], previous: cuts[f.combo - 1], hit,
      length: held === 'katana' ? 15 : held === 'machete' ? 11 : 6,
      width: held === 'knife' ? 2 : 3,
      weight: held === 'knife' ? 0.73 : 1,
      twoHanded: held === 'katana',
    };
  }
  const style = SWORDS[f.hero];
  const level = formLevel(f);
  if (!style || (hit.kick && !style.followKick) || (f.hero === 'yuno' && level < 2)) return;
  const cut = style.cuts[Math.min(f.combo, style.cuts.length - 1)];
  const dual = cut !== 'draw' && (f.hero === 'zoro' || (f.hero === 'ichigo' && level === 4));
  const rear = dual ? (cut === 'rise' ? 'reverse' : 'rise') : undefined;
  return { cut, previous: style.cuts[f.combo - 1], rear, hit, width: style.width, weight: style.weight, twoHanded: !!style.twoHanded && !dual,
    length: f.hero === 'yuno' ? 13 + level * 2 : style.length + level * 0.65 };
}

interface Hand {
  x: number;
  y: number;
}

interface BladeHand extends Hand {
  angle: number;
  projection: number;
  visible: boolean;
}

export interface SwordPose {
  frame: number;
  front: BladeHand;
  back: Hand;
  rearBlade?: BladeHand;
  sheath?: Hand;
  tilt: number;
  plant: number;
}

// Tip offsets are fractions of the full blade length. A sideways cut passes through
// depth by shortening near the camera, then extends across the opponent at contact.
type GripKey = readonly [x: number, y: number, tipX: number, tipY: number];
type CutKeys = readonly [coil: GripKey, pass: GripKey, hit: GripKey, exit: GripKey, finish: GripKey];

const CUT_KEYS: Readonly<Record<Cut, CutKeys>> = {
  draw: [[-3.1, 4.4, 0, 0], [4, 3.8, -0.72, 0.07], [12.1, 0.7, 0.99, -0.03],
    [10.3, 1.3, 0.76, 0.22], [7.6, 2.9, 0.24, 0.28]],
  reverse: [[3.2, 3.8, -0.46, 0.23], [5.6, 2.6, -0.10, 0.27], [12, 2.2, 0.99, 0.01],
    [7.1, 2.6, 0.53, -0.26], [-0.9, 3.8, -0.69, -0.13]],
  sweep: [[-3.1, 1, -0.84, -0.17], [3.8, 1.2, -0.12, -0.27], [12.6, 0.6, 1, 0.03],
    [9.1, 3.4, 0.61, 0.19], [0.3, 3.8, -0.76, 0.07]],
  cleave: [[-3.5, -7.4, -0.66, -0.69], [3.8, -7.7, 0.39, -0.76], [11.7, -0.9, 0.94, 0.34],
    [8.7, 3.7, 0.65, 0.40], [2.4, 5.1, -0.62, 0.20]],
  rise: [[0, 4.5, -0.75, 0.24], [4.2, 4, 0.48, 0.31], [11.4, -2.6, 0.87, -0.49],
    [8.5, -5.4, 0.43, -0.79], [3.7, -6.1, -0.32, -0.79]],
  thrust: [[-2, 1, 0.61, -0.22], [3.5, -0.2, 0.91, -0.02], [14, -1, 1, 0],
    [11.3, -0.6, 0.99, 0.04], [6, 0.6, 0.87, -0.12]],
};

const GUARD: GripKey = [4.8, 3.5, 0.73, 0.48];

function blendKey(a: GripKey, b: GripKey, p: number): GripKey {
  return [mix(a[0], b[0], p), mix(a[1], b[1], p), mix(a[2], b[2], p), mix(a[3], b[3], p)];
}

function drawPass(coil: GripKey, pass: GripKey, p: number, sheath: Hand, length: number): GripKey {
  const [x, y] = blendKey(coil, pass, p);
  // Expose only the steel between the hand and the mouth of the sheath until the release.
  const drawn = clamp((x - coil[0]) / 2.4);
  return [x, y, (sheath.x - x) * drawn / length, (sheath.y - y) * drawn / length];
}

function gripKey(cut: Cut, hit: MeleeHit, time: number, settle: number, length: number, sheath?: Hand, previous?: Cut): GripKey {
  const [coil, pass, impact, exit, finish] = CUT_KEYS[cut];
  const wind = clamp(time / Math.max(0.001, hit.windup));
  if (wind < 1) {
    if (sheath) {
      const drawn = drawPass(coil, pass, ease(clamp(wind / 0.61)), sheath, length);
      if (wind < 0.61) return drawn;
      const turn: GripKey = [6.7, 1.8, -0.05, 0.25];
      if (wind < 0.79) return blendKey(drawn, turn, (wind - 0.61) / 0.18);
      return blendKey(turn, impact, (wind - 0.79) / 0.21);
    }
    const loaded = previous ? blendKey(CUT_KEYS[previous][4], coil, ease(clamp(wind / 0.35))) : coil;
    if (wind < 0.53) return blendKey(loaded, pass, ease(clamp((wind - 0.19) / 0.34)));
    return blendKey(pass, impact, ((wind - 0.53) / 0.47) ** 1.1);
  }
  const follow = clamp((time - hit.windup) / Math.max(0.001, hit.active));
  if (follow < 0.34) return blendKey(impact, exit, follow / 0.34);
  const carried = blendKey(exit, finish, ease(clamp((follow - 0.34) / 0.46)));
  return blendKey(carried, GUARD, settle);
}

function bladeHand(key: GripKey, grounded: boolean, length: number, dx = 0, dy = 0): BladeHand {
  const [x, y, tipX, tipY] = key;
  const down = grounded ? Math.min(tipY, (9.5 - y - dy) / length) : tipY;
  const projection = Math.hypot(tipX, down);
  return { x: x + dx, y: y + dy, angle: Math.atan2(down, tipX), projection, visible: projection > 0.07 };
}

/** Key both the hilt and the blade tip through coil, contact and a held finish. */
export function swordPose(swing: Swing, time: number, grounded: boolean): SwordPose {
  const { hit, cut, previous, weight, length } = swing;
  const wind = clamp(time / Math.max(0.001, hit.windup));
  const shift = ease(clamp((wind - 0.18) / 0.82));
  const recovery = time - hit.windup - hit.active;
  const settle = ease(clamp((recovery - hit.recover * 0.36) / Math.max(0.001, hit.recover * 0.64)));
  const tilt = mix(mix(-0.11 * weight, cut === 'rise' ? -0.035 : 0.105 * weight, shift), 0, settle);
  // The hip moves farther forward than the scabbard, so the rear hand can pull
  // the mouth clear while staying close to the belt instead of reaching back.
  const sheath = cut === 'draw' ? { x: mix(-5.5, -2.8, shift), y: mix(4.65, 4.15, shift) } : undefined;
  const front = bladeHand(gripKey(cut, hit, time, settle, length, sheath, previous), grounded, length);
  const rearBlade = swing.rear ? bladeHand(gripKey(swing.rear, hit, time - hit.active * 0.22, settle, length), grounded, length * 0.78, -2.7, 1.2) : undefined;
  const back = rearBlade ?? (swing.twoHanded && !sheath
    ? { x: front.x - Math.cos(front.angle) * 3.25, y: front.y - Math.sin(front.angle) * 3.25 }
    : sheath ?? { x: mix(-7.3, -2.8, shift), y: mix(0.8, 3.8, shift) });

  const horizontal = cut === 'draw' || cut === 'reverse' || cut === 'sweep';
  const coil = horizontal ? BF.SWORD_COIL : BF.SWORD_LOAD;
  const contact = horizontal ? BF.SWORD_SWEEP : cut === 'rise' ? BF.SWORD_RISE : BF.SWORD_CUT;
  const finish = horizontal ? BF.SWORD_WRAP : BF.SWORD_FINISH;
  const wrapped = time >= hit.windup + hit.active * 0.55;
  const frame = grounded
    ? settle > 0.81 ? BF.IDLE0 : wrapped ? finish : wind >= 0.62 ? contact : coil
    : wind >= 0.62 ? (cut === 'rise' ? BF.UPPER : BF.CROSS) : BF.JUMP;
  return { frame, front, back, rearBlade, sheath, tilt, plant: mix(-7, horizontal ? 9 : 8, shift) };
}

export function swingArm(blade: number, rear = false): number {
  return blade * (rear ? 0.61 : 0.66) + (rear ? 0.48 : 0.16);
}

interface SpecialSwordPose {
  frame: number;
  front: number;
  back: number;
  lean: number;
  blade?: number;
  rear?: number;
}

/** Poses for each beat of the roster specials, driven by the same timestamps as damage. */
export function rosterSwordPose(f: Fighter): SpecialSwordPose | undefined {
  const special = rosterSpecial(f.hero);
  if (!special) return;
  const t = f.stateTime;
  const [first, second = first] = special.beats;
  const wind = ease(clamp(t / first));
  const firstCut = clamp((t - first) / 0.11);
  const secondCut = clamp((t - second) / 0.12);
  const settle = ease(clamp((t - special.duration + 0.13) / 0.13));
  const aim = (frame: number, front: number, back: number, lean: number): SpecialSwordPose => ({
    frame: settle >= 0.72 ? BF.IDLE0 : frame,
    front: mix(front, 1.45, settle), back: mix(back, 1.75, settle), lean: lean * (1 - settle),
  });
  const bladePose = (frame: number, blade: number, lean: number, rear?: number): SpecialSwordPose => ({
    ...aim(frame, swingArm(blade), rear === undefined ? 1.7 : swingArm(rear, true), lean),
    blade: mix(blade, 0.9, settle),
    rear: rear === undefined ? undefined : mix(rear, 1.75, settle),
  });
  switch (f.hero) {
    case 'zoro':
      return t < first
        ? bladePose(BF.WINDUP, mix(1.2, 2.7, wind), -0.19, 2.25)
        : bladePose(BF.CROSS, mix(-0.18, 1.04, firstCut), 0.25, 1.9);
    case 'law': {
      const pointing = t < first ? mix(0.84, 0.08, wind) : t < second ? mix(0.08, -1.13, firstCut) : mix(-1.13, 0.94, secondCut);
      return aim(t < first ? BF.WINDUP : t < second ? BF.AIM : BF.CROSS, pointing, t < second ? 1.82 : -0.28, t < second ? -0.06 : 0.22);
    }
    case 'ichigo':
      if (t < first) return bladePose(BF.WINDUP, mix(-0.72, 2.3, wind), -0.18, -1.7);
      if (t < second) return bladePose(BF.UPPER, mix(0.3, -1.56, firstCut), 0.11, -1.8);
      return bladePose(BF.CROSS, mix(-1.16, 1.02, secondCut), 0.23, mix(-1.6, 0.83, secondCut));
    case 'rukia':
      if (t < first) return bladePose(BF.WINDUP, mix(-1.1, 0.58, wind), -0.08);
      if (t < second) return bladePose(BF.CROUCH, mix(0.58, 1.38, firstCut), 0.15);
      return bladePose(BF.UPPER, mix(-0.24, -1.64, secondCut), 0.09);
    case 'byakuya':
      return bladePose(t < first ? BF.WINDUP : BF.AIM, t < first ? mix(0.86, -1.78, wind) : mix(-1.78, -0.12, firstCut), -0.05);
    case 'asta':
      return t < first
        ? bladePose(BF.WINDUP, mix(1.37, -2.75, wind), -0.22, -1.92)
        : bladePose(BF.CROSS, mix(-0.14, 1.19, firstCut), 0.24, 0.71);
    case 'yami':
      return t < first ? bladePose(BF.WINDUP, mix(1.45, -1.8, wind), -0.11)
        : t < second ? bladePose(BF.CROUCH, mix(-1.8, 2.3, firstCut), -0.09)
        : bladePose(BF.UPPER, mix(0.19, -1.49, secondCut), 0.23);
  }
}

export function swordPivotOffset(pose: SwordPose, soleY: number): Hand {
  const c = Math.cos(pose.tilt), s = Math.sin(pose.tilt);
  return { x: pose.plant * (1 - c) + soleY * s, y: soleY * (1 - c) - pose.plant * s };
}

export function paintSwordScabbard(g: Phaser.GameObjects.Graphics, pose: SwordPose): void {
  const sheath = pose.sheath;
  if (!sheath) return;
  const x = sheath.x, y = sheath.y;
  g.lineStyle(4, 0x181323).lineBetween(x, y, x - 12, y + 3);
  g.lineStyle(1, 0x625167).lineBetween(x, y - 1, x - 12, y + 2);
  g.fillStyle(0xad8b6e).fillRect(Math.round(x) - 1, Math.round(y) - 2, 2, 4);
  if (!pose.front.visible) {
    g.lineStyle(2, 0xb9a289).lineBetween(x, y, pose.front.x + 1.8, pose.front.y - 0.4);
    g.fillStyle(0x292331).fillRect(Math.round(pose.front.x) + 1, Math.round(pose.front.y) - 2, 2, 3);
  }
}

/** Reproject the last blade positions through their foot pivots into the current pose. */
export function paintSwordWake(g: Phaser.GameObjects.Graphics, f: Fighter, swing: Swing, current: SwordPose,
  soleY: number, bladeLength = swing.length): void {
  const { hit } = swing;
  const time = f.stateTime;
  const release = hit.windup * (swing.cut === 'draw' ? 0.76 : 0.54);
  const activeEnd = hit.windup + hit.active;
  const fade = 1 - clamp((time - activeEnd) / 0.067);
  if (time <= release || fade <= 0) return;
  const last = Math.min(activeEnd, time);
  const first = Math.max(release, last - 0.055);
  const style = moveLook(f.hero, formLevel(f));
  const origin = swordPivotOffset(current, soleY);
  const c0 = Math.cos(current.tilt), s0 = Math.sin(current.tilt);

  const paint = (secondary: boolean) => {
    let previous: { near: Hand; tip: Hand } | undefined;
    for (let i = 0; i <= 10; i++) {
      const p = i / 10;
      const sample = swordPose(swing, mix(first, last, p), f.grounded);
      const hand = secondary ? sample.rearBlade : sample.front;
      if (!hand?.visible) continue;
      const distance = (secondary ? swing.length * 0.78 : bladeLength) * hand.projection;
      const offset = swordPivotOffset(sample, soleY);
      const c = Math.cos(sample.tilt), s = Math.sin(sample.tilt);
      const point = (part: number, edge: number): Hand => {
        const x = hand.x + (Math.cos(hand.angle) * distance * part - Math.sin(hand.angle) * edge);
        const y = hand.y + (Math.sin(hand.angle) * distance * part + Math.cos(hand.angle) * edge);
        const dx = x * c - y * s + offset.x - origin.x;
        const dy = x * s + y * c + offset.y - origin.y;
        return { x: dx * c0 + dy * s0, y: -dx * s0 + dy * c0 };
      };
      const edge = swing.cut === 'draw' || swing.cut === 'reverse' || swing.cut === 'sweep' ? 0.75 : swing.width * 0.22;
      const next = { near: point(0.52, edge), tip: point(1, -edge * 0.4) };
      if (previous) {
        const strength = (0.1 + p * 0.46) * fade * (secondary ? 0.5 : 1);
        g.fillStyle(style.rim, strength).beginPath().moveTo(previous.near.x, previous.near.y)
          .lineTo(previous.tip.x, previous.tip.y).lineTo(next.tip.x, next.tip.y)
          .lineTo(next.near.x, next.near.y).closePath().fillPath();
        g.lineStyle(1, style.spark, strength).lineBetween(previous.tip.x, previous.tip.y, next.tip.x, next.tip.y);
      }
      previous = next;
    }
  };
  if (swing.rear) paint(true);
  paint(false);
}
