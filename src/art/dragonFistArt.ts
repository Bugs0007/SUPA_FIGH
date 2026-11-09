import type Phaser from 'phaser';
import { DRAGON_FIST } from '../sim/data/heroes';

type Point = readonly [x: number, y: number];
type Graphics = Phaser.GameObjects.Graphics;

const INK = 0x592412;
const BRONZE = 0xa24a18;
const AMBER = 0xd87b1d;
const GOLD = 0xf2ae35;
const LIGHT = 0xffd369;
const WHITE = 0xffedb0;
const clamp = (x: number) => Math.max(0, Math.min(1, x));

/** The film's long, wingless golden dragon. Its head follows the punch and its coil trails behind Goku. */
export function drawDragonFist(back: Graphics, front: Graphics, x: number, y: number, facing: number, angle: number, time: number): void {
  const age = time - DRAGON_FIST.windup;
  if (age < 0) {
    const charge = clamp(time / DRAGON_FIST.windup);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3 + charge * 1.4;
      const r = 8 - 5 * charge;
      front.fillStyle(i % 2 ? LIGHT : GOLD, charge).fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 2, 2);
    }
    return;
  }
  const reveal = clamp(age / .10);
  const fade = 1 - clamp((time - DRAGON_FIST.windup - DRAGON_FIST.active) / .19);
  const alpha = Math.min(1, .35 + age * 18) * fade;
  if (alpha <= 0) return;

  const rise = 11 * clamp((age - .18) / .32);
  const distance = 8 + 15 * reveal;
  const c = Math.cos(angle - rise * .018), s = Math.sin(angle - rise * .018);
  const scale = .62 + .46 * reveal;
  const px = x + facing * Math.cos(angle) * distance;
  const py = y + Math.sin(angle) * distance - rise;
  const world = ([u, v]: Point) => ({ x: Math.round(px + facing * (u * c - v * s) * scale), y: Math.round(py + (u * s + v * c) * scale) });
  const polygon = (g: Graphics, color: number, points: readonly Point[], opacity = 1) => {
    g.fillStyle(color, alpha * opacity).fillPoints(points.map(world), true);
  };
  const line = (g: Graphics, color: number, width: number, points: readonly Point[], opacity = 1) => {
    const path = points.map(world);
    g.lineStyle(width, color, alpha * opacity).strokePoints(path);
  };

  // Coiling cross-sections, drawn tail first. The pale belly follows the actual bend.
  const reach = 29 + reveal * 62;
  const body = (p: number): Point => [
    -11 - reach * p,
    3 + Math.sin(p * Math.PI * .86) * (Math.sin(p * 6.8 - age * 7) * (10 + reveal * 10) - 17) - p * 8,
  ];
  const section = (p: number, side: number): Point => {
    const [bx, by] = body(p);
    const [ex, ey] = body(p + .015);
    const tangent = Math.hypot(ex - bx, ey - by) || 1;
    const r = .5 + 8.8 * (1 - p) ** .88;
    return [bx + (ey - by) / tangent * r * side, by - (ex - bx) / tangent * r * side];
  };
  const band = (p0: number, p1: number, a: number, b: number): Point[] => [section(p0, a), section(p1, a), section(p1, b), section(p0, b)];
  const segments = 18;
  for (let i = segments - 1; i >= 0; i--) {
    const p = i / segments, q = (i + 1) / segments;
    polygon(back, INK, band(p, q, -1.16, 1.18));
    polygon(back, GOLD, band(p, q, -.98, .56));
    polygon(back, AMBER, band(p, q, -.98, -.29));
    polygon(back, LIGHT, band(p, q, .42, .97));
    line(back, BRONZE, 1, [section(p, .30), section(p, .96)], .56);
    if (i % 3 === 1 && i < segments - 3) line(back, LIGHT, 1, [section(p, -.78), section(p + .028, -.48)], .54);
    if (i % 2 === 0 && i < segments - 2) {
      const [bx, by] = section(p, -1);
      const spike = 5 + (1 - p) * 3 + i % 3;
      polygon(back, INK, [[bx + 4, by + 1], [bx - 6, by - spike], [bx - 5, by + 1]]);
      polygon(back, AMBER, [[bx + 1, by], [bx - 5, by - spike + 2], [bx - 3, by + 1]]);
    }
  }

  // The neck throws hooked claws ahead as the coil tightens.
  polygon(back, BRONZE, [[-30, -6], [-25, -12], [-17, -13], [-14, -10], [-20, -8], [-17, -6], [-20, -4]]);
  polygon(back, INK, [[-31, 4], [-24, 3], [-22, 12], [-13, 15], [-7, 12], [-8, 17], [-15, 21], [-24, 18]]);
  polygon(back, GOLD, [[-29, 5], [-25, 5], [-23, 13], [-15, 17], [-10, 15], [-14, 19], [-23, 16]]);
  for (const tip of [[-9, 13], [-10, 16], [-14, 19]] as const) {
    line(back, WHITE, 1, [tip, [tip[0] + 4, tip[1] - 2], [tip[0] + 5, tip[1] - 5]]);
  }

  // Back-swept antlers and a torn mane sit behind the actor and the face.
  polygon(back, INK, [[-17, -9], [-24, -18], [-35, -21], [-40, -28], [-31, -24], [-26, -25], [-27, -32], [-23, -35], [-23, -28], [-20, -22], [-13, -15]]);
  polygon(back, AMBER, [[-17, -11], [-25, -20], [-34, -22], [-37, -25], [-30, -23], [-25, -24], [-26, -30], [-23, -33], [-24, -28], [-19, -21], [-14, -15]]);
  polygon(back, INK, [[-14, -11], [-20, -17], [-31, -22], [-26, -12], [-39, -14], [-31, -5], [-37, -5], [-25, 1], [-32, 4], [-20, 6], [-22, 12], [-9, 9], [-8, -9]]);
  polygon(back, BRONZE, [[-16, -10], [-26, -16], [-24, -10], [-34, -11], [-28, -6], [-30, -4], [-22, 1], [-28, 4], [-20, 4], [-20, 9], [-11, 7]]);
  polygon(back, GOLD, [[-14, -8], [-22, -13], [-20, -8], [-29, -9], [-21, -4], [-25, -3], [-17, 0], [-21, 5], [-13, 4]]);

  const open = 2 + 6 * (1 - clamp((age - .075) / .16));
  polygon(front, INK, [[-21, 1], [-21, -10], [-15, -16], [-10, -19], [-2, -18], [6, -15], [10, -12],
    [19, -12], [31, -9], [35, -6], [36, -1], [32, 3], [25, 5], [16, 5], [7, 8], [-2, 12], [-14, 9]]);
  polygon(front, AMBER, [[-19, 0], [-19, -8], [-13, -15], [-9, -17], [-2, -16], [6, -13], [10, -10],
    [19, -10], [31, -7], [34, -4], [34, -1], [30, 1], [23, 3], [15, 3], [6, 7], [-3, 10], [-13, 7]]);
  polygon(front, GOLD, [[-16, -9], [-10, -15], [-3, -15], [4, -13], [9, -10], [18, -10], [28, -8],
    [33, -5], [33, -2], [24, 0], [12, -1], [5, 1], [0, 4], [-8, 2], [-15, -2]]);
  polygon(front, LIGHT, [[-11, -13], [-5, -15], [1, -13], [8, -9], [17, -9], [28, -7], [31, -5],
    [25, -5], [16, -6], [9, -6], [3, -10], [-4, -11]]);
  polygon(front, BRONZE, [[-17, -4], [-11, -7], [-5, -4], [-1, 0], [-7, 1], [-13, 4], [-17, 2]]);
  polygon(front, GOLD, [[-16, -3], [-11, -5], [-8, -4], [-6, -2], [-10, -1], [-14, 1]]);
  line(front, BRONZE, 1, [[6, -3], [10, -4], [15, -4], [20, -3]], .92);
  line(front, INK, 2, [[26, -6], [29, -6], [30, -4]]);

  // Brow and eye read as one angular, low glare even at game zoom.
  polygon(front, INK, [[-12, -10], [-4, -13], [3, -12], [11, -7], [7, -4], [1, -4], [-5, -7]]);
  polygon(front, WHITE, [[-4, -9], [2, -9], [8, -6], [3, -5], [-1, -6]]);
  polygon(front, 0xbf541d, [[1, -9], [4, -8], [3, -5], [1, -6]]);
  polygon(front, BRONZE, [[-13, -11], [-5, -15], [2, -13], [11, -8], [7, -7], [1, -10], [-5, -10]]);
  line(front, LIGHT, 1, [[-11, -12], [-5, -14], [2, -13], [8, -9]], .88);

  // The upper muzzle stays rigid while the lower jaw bites down during contact.
  polygon(front, INK, [[-12, 0], [-5, -1], [2, 2], [12, 1], [22, 0], [33, -1], [30, open + 1],
    [21, open + 5], [12, open + 8], [4, open + 10], [-4, open + 8], [-10, open + 4]]);
  polygon(front, 0x421a12, [[-9, 1], [-4, 0], [4, 3], [16, 2], [25, 0], [31, 0], [27, open + 1],
    [20, open + 3], [11, open + 6], [3, open + 6], [-4, open + 4]]);
  polygon(front, AMBER, [[-8, 3], [-3, open + 2], [5, open + 6], [13, open + 5], [22, open + 2], [30, open - 1],
    [29, open + 1], [21, open + 4], [13, open + 7], [4, open + 8], [-4, open + 5]]);
  line(front, LIGHT, 1, [[-4, open + 3], [5, open + 7], [13, open + 6], [22, open + 3]], .8);
  for (const [x0, y0, width, height] of [[4, 2, 5, 7], [12, 1, 4, 4], [20, 0, 5, 6], [27, -1, 4, 4]] as const) {
    polygon(front, WHITE, [[x0, y0], [x0 + width, y0], [x0 + width - 2, y0 + height]]);
  }
  polygon(front, LIGHT, [[10, open + 6], [14, open + 5], [12, open + 2]]);

  polygon(front, INK, [[-13, -14], [-18, -23], [-24, -28], [-34, -31], [-38, -38], [-29, -34], [-21, -32],
    [-23, -37], [-20, -43], [-16, -44], [-19, -38], [-17, -33], [-13, -29], [-8, -24], [-7, -16]]);
  polygon(front, GOLD, [[-12, -15], [-17, -23], [-24, -29], [-33, -32], [-36, -36], [-28, -33], [-20, -30],
    [-21, -37], [-18, -42], [-19, -37], [-16, -31], [-12, -27], [-9, -23], [-9, -17]]);
  line(front, WHITE, 1, [[-34, -34], [-27, -31], [-19, -28], [-14, -24], [-11, -19]], .88);
  line(front, LIGHT, 1, [[29, -3], [34, -9], [42, -13], [48, -12], [52, -8]], .9);
  line(front, GOLD, 1, [[29, -1], [36, 0], [41, 4], [47, 6], [51, 3]], .85);

  for (let i = 0; i < 10; i++) {
    const p = (i / 10 + age * 1.8) % 1;
    const [bx, by] = body(p);
    const point = world([bx - 3, by + (i % 2 ? 1 : -1) * (10 + i % 4 * 2)]);
    front.fillStyle(i % 3 ? GOLD : WHITE, alpha * (1 - p) * .75).fillRect(point.x, point.y, i % 3 ? 2 : 3, 1);
  }
}
