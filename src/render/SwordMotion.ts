import type Phaser from 'phaser';
import { BF } from '../art/fighterArt';
import { moveLook } from '../art/heroMoves';
import { rosterSpecial } from '../sim/data/rosterSpecials';
import type { MeleeHit } from '../sim/data/weapons';
import type { Fighter } from '../sim/fighter';
import { formLevel } from './formLevel';

type Cut = readonly [ready: number, wind: number, contact: number, end: number];
type SwordStyle = { cuts: readonly Cut[]; length: number; width: number; frame: number; followKick?: boolean; waistDraw?: number };

const SWORDS: Readonly<Record<string, SwordStyle>> = {
  zoro: {
    cuts: [[1.06, -2.4, -0.3, 1.02], [1.02, 1.91, 0.23, -1.65], [-1.65, -2.76, -0.38, 0.86], [0.86, 2.18, 0.08, -1.45]],
    length: 14, width: 3, frame: BF.CROSS, followKick: true, waistDraw: 0,
  },
  law: {
    cuts: [[-0.68, 1.85, 0.16, -1.04], [-1.04, -1.9, -0.21, 0.45], [0.45, 2.15, 0.03, -0.25]],
    length: 16, width: 2, frame: BF.CROSS, waistDraw: 2,
  },
  ichigo: {
    cuts: [[-0.78, -2.28, -0.28, 1.08], [1.08, 2.23, 0.22, -1.65], [-1.65, -2.83, -0.42, 1.08]],
    length: 15, width: 4, frame: BF.CROSS,
  },
  rukia: {
    cuts: [[-0.75, 1.62, 0.02, -0.68], [-0.68, -1.91, -0.3, 0.96], [0.96, 2.34, 0.18, -1.75]],
    length: 11, width: 2, frame: BF.PUNCH, waistDraw: 1,
  },
  byakuya: {
    cuts: [[-0.85, -1.88, -0.1, 0.48], [0.48, 1.36, 0.06, -0.67], [-0.67, -2.11, -0.2, 0.96]],
    length: 12, width: 2, frame: BF.CROSS, waistDraw: 1,
  },
  asta: {
    cuts: [[1.34, -2.62, -0.27, 1.1], [1.1, 2.41, 0.38, -1.51], [-1.51, -2.9, -0.55, 1.22]],
    length: 14, width: 5, frame: BF.UPPER,
  },
  yami: {
    cuts: [[1.02, 2.36, 0.07, -0.58], [-0.58, -2.37, -0.19, 0.85], [0.85, 2.58, 0.1, -1.24]],
    length: 12, width: 3, frame: BF.CROSS, waistDraw: 0,
  },
  yuno: {
    cuts: [[-0.72, -1.88, -0.09, 0.83], [0.83, 2.05, 0.25, -1.43], [-1.43, -2.39, -0.19, 0.94]],
    length: 17, width: 3, frame: BF.CROSS,
  },
};

const clamp = (p: number) => Math.max(0, Math.min(1, p));
const mix = (a: number, b: number, p: number) => a + (b - a) * p;
const ease = (p: number) => p * p * (3 - 2 * p);

interface Swing {
  cut: Cut;
  length: number;
  width: number;
  frame: number;
  hit: MeleeHit;
  rear?: Cut;
  waistDraw: boolean;
}

export function swordSwing(f: Fighter, hit: MeleeHit, held: string): Swing | undefined {
  if (held !== 'fists') {
    if (held !== 'katana' && held !== 'machete' && held !== 'knife') return;
    const start = hit.arcFrom ?? -2.2;
    const end = hit.arcTo ?? 0.9;
    return {
      cut: [0.9, start, (start + end) * 0.11, end], hit,
      length: held === 'katana' ? 15 : held === 'machete' ? 11 : 6,
      width: held === 'knife' ? 2 : 3, frame: BF.CROSS,
      waistDraw: held === 'katana' && f.combo === 2,
    };
  }
  const style = SWORDS[f.hero];
  const level = formLevel(f);
  if (!style || (hit.kick && !style.followKick) || (f.hero === 'yuno' && level < 2)) return;
  const cut = style.cuts[Math.min(f.combo, style.cuts.length - 1)];
  const waistDraw = style.waistDraw === f.combo;
  const dual = !waistDraw && (f.hero === 'zoro' || (f.hero === 'ichigo' && level === 4));
  const rear: Cut | undefined = dual ? [1.78, cut[1] * -0.62, -cut[2] * 0.9, -cut[3] * 0.86] : undefined;
  return { cut, rear, hit, width: style.width, frame: style.frame, waistDraw, length: f.hero === 'yuno' ? 13 + level * 2 : style.length + level * 0.65 };
}

const HIP_X = -4;
const HIP_Y = 3;
const DRAW_FRACTION = 0.56;

export interface WaistDrawPose {
  x: number;
  y: number;
  angle: number;
  projection: number;
  visible: boolean;
}

/** A cut around the waist projects as a narrow, foreshortened sweep in side view. */
export function waistDrawPose(hit: MeleeHit, time: number): WaistDrawPose {
  const release = hit.windup * DRAW_FRACTION;
  const activeEnd = hit.windup + hit.active;
  if (time <= release) {
    const load = ease(clamp(time / release));
    return { x: mix(2, HIP_X, load), y: HIP_Y, angle: 0, projection: 0, visible: false };
  }
  if (time < hit.windup) {
    const draw = ease(clamp((time - release) / (hit.windup - release)));
    return { x: mix(HIP_X, 3.8, draw), y: HIP_Y - draw * 0.6, angle: -0.035, projection: mix(0.16, 0.94, draw), visible: true };
  }
  if (time < activeEnd) {
    const active = clamp((time - hit.windup) / hit.active);
    return {
      x: mix(3.8, 8.4, ease(active)), y: HIP_Y - 0.6 + active * 1.1,
      angle: mix(-0.035, 0.065, active), projection: mix(0.94, 0.62, active) + Math.sin(active * Math.PI) * 0.17, visible: true,
    };
  }
  const settle = ease(clamp((time - activeEnd) / hit.recover));
  return { x: mix(8.4, 4.3, settle), y: mix(HIP_Y + 0.5, HIP_Y + 1.6, settle), angle: mix(0.065, 0.83, settle), projection: mix(0.62, 1, settle), visible: true };
}

/** The wrist reaches the strike at the first damage tick and follows through during the active window. */
export function swingAngle(cut: Cut, hit: MeleeHit, time: number): number {
  const [ready, wind, contact, end] = cut;
  const draw = hit.windup * 0.67;
  const activeEnd = hit.windup + hit.active;
  if (time < draw) return mix(ready, wind, ease(clamp(time / draw)));
  if (time < hit.windup) return mix(wind, contact, clamp((time - draw) / (hit.windup - draw)) ** 1.75);
  if (time < activeEnd) return mix(contact, end, 1 - (1 - clamp((time - hit.windup) / hit.active)) ** 2);
  return mix(end, ready, ease(clamp(((time - activeEnd) / hit.recover - 0.15) / 0.85)));
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

interface Shoulder { x: number; y: number; reach: number }

function paintWaistDraw(g: Phaser.GameObjects.Graphics, f: Fighter, hit: MeleeHit, length: number): void {
  const time = f.stateTime;
  const release = hit.windup * DRAW_FRACTION;
  const activeEnd = hit.windup + hit.active;
  const style = moveLook(f.hero, formLevel(f));
  // Keep the scabbard on the belt while the sword and its hilt move out of it.
  for (let i = 0; i < 12; i++) {
    const y = HIP_Y + Math.floor(i / 4);
    g.fillStyle(0x1a1525, 0.98).fillRect(HIP_X - i, y - 1, 2, 4);
    g.fillStyle(0x514056, 0.92).fillRect(HIP_X - i, y, 1, 1);
  }
  g.fillStyle(0xab8769, 1).fillRect(HIP_X - 1, HIP_Y - 1, 2, 3);
  if (time <= release) {
    g.fillStyle(0xd4b59a, 1).fillRect(HIP_X + 1, HIP_Y, 3, 1);
    g.fillStyle(0x433441, 1).fillRect(HIP_X + 2, HIP_Y - 1, 1, 2);
    return;
  }
  const fade = 1 - clamp((time - activeEnd) / 0.088);
  if (fade <= 0) return;
  const end = Math.min(time, activeEnd);
  for (let i = 0; i <= 23; i++) {
    const progress = i / 23;
    const point = waistDrawPose(hit, mix(release, end, progress));
    const x = Math.round(point.x + Math.cos(point.angle) * point.projection * (length + 1));
    const y = Math.round(point.y + Math.sin(point.angle) * point.projection * (length + 1));
    const alpha = (0.23 + 0.64 * progress) * fade;
    g.fillStyle(style.rim, alpha).fillRect(x - 3, y - 1, 6, 3);
    g.fillStyle(style.spark, alpha).fillRect(x - 2, y, 5, 1);
    if (i % 7 === 5) g.fillStyle(style.spark, alpha * 0.45).fillRect(x - 7, y + 2 - (i % 2) * 4, 5, 1);
  }
}

/** Sample the same blade path that drives the hands. The rig handles facing and body tilt. */
export function paintSwordWake(g: Phaser.GameObjects.Graphics, f: Fighter, swing: Swing, front: Shoulder, rear: Shoulder, bladeLength = swing.length): void {
  if (swing.waistDraw) {
    paintWaistDraw(g, f, swing.hit, bladeLength);
    return;
  }
  const { hit } = swing;
  const time = f.stateTime;
  const release = hit.windup * 0.77;
  const activeEnd = hit.windup + hit.active;
  const fade = 1 - clamp((time - activeEnd) / 0.085);
  if (time <= release || fade <= 0) return;
  const last = Math.min(activeEnd, time);
  const first = Math.max(release, last - 0.088);
  const style = moveLook(f.hero, formLevel(f));
  const paint = (cut: Cut, shoulder: Shoulder, length: number, secondary: boolean) => {
    for (let i = 0; i <= 24; i++) {
      const p = i / 24;
      const angle = swingAngle(cut, hit, mix(first, last, p));
      const arm = swingArm(angle, secondary);
      const width = Math.max(1, Math.round(swing.width * Math.sin(p * Math.PI * 0.87)));
      const hx = shoulder.x + Math.cos(arm) * shoulder.reach;
      const hy = shoulder.y + Math.sin(arm) * shoulder.reach;
      const x = hx + Math.cos(angle) * (length + 1);
      const y = hy + Math.sin(angle) * (length + 1);
      const alpha = (0.18 + 0.58 * p) * fade * (secondary ? 0.67 : 1);
      g.fillStyle(style.rim, alpha).fillRect(Math.round(x - width / 2), Math.round(y - width / 2), width + 1, width + 1);
      g.fillStyle(style.spark, alpha).fillRect(Math.round(x), Math.round(y), p > 0.78 ? 2 : 1, 1);
      if (i % 7 === 3 && (f.hero === 'rukia' || f.hero === 'byakuya')) {
        g.fillStyle(style.spark, alpha * 0.72).fillRect(Math.round(x + (1 - p) * 5), Math.round(y + p * 4), 2, 1);
      }
    }
  };
  if (swing.rear) paint(swing.rear, rear, swing.length * 0.78, true);
  paint(swing.cut, front, bladeLength, false);
}
