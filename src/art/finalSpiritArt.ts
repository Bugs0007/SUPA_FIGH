import type Phaser from 'phaser';
import { avatarAim, FINAL_KURAMA_NECK, PERFECT_SUSANOO_LAUNCH, PERFECT_SUSANOO_RIG, susanooLean } from '../sim/data/heroes';
import { finalSpiritAtlas } from './finalSpiritAtlas';
import { type Baked, type Pt } from './pixelRaster';
import { noise, rising, Seen } from './spiritForm';

type Graphics = Phaser.GameObjects.Graphics;
type Spirit = keyof typeof finalSpiritAtlas;
type Visible = (x: number, y: number) => Seen;
/** how tall the rising front has to climb to cover the whole body (sprite top + the dithered band) */
const LIMIT = { k: 178, s: 196 } as const;
const EDGE = { k: 0xffeda1, s: 0xf3cfff } as const;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
export const smooth = (t: number): number => { const k = clamp(t); return k * k * (3 - 2 * k); };

/**
 * Where the tails / wings grow from, and the sweep of their unfurl: angles around the root (0 = straight back, + = up).
 * The tails lift from lying behind the fox up and over its back; the wings fold open downwards from the shoulders.
 */
const FAN = {
  k: { root: [-66, -65] as Pt, from: -0.7, to: 2.45, reach: 230, sway: 2.4 },
  s: { root: [-39, -134] as Pt, from: 0.9, to: -2.1, reach: 215, sway: 1 },
} as const;

// ---- clean rotation of pixel art -------------------------------------------------------------------------------
/** a rigid move: p -> R(a) p + t (local sprite coordinates, + angle = clockwise on screen = aiming down) */
interface Rigid { a: number; tx: number; ty: number }
const IDENTITY: Rigid = { a: 0, tx: 0, ty: 0 };
function about(px: number, py: number, a: number): Rigid {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { a, tx: px - (px * c - py * s), ty: py - (px * s + py * c) };
}
/** outer after inner */
function then(outer: Rigid, inner: Rigid): Rigid {
  const c = Math.cos(outer.a);
  const s = Math.sin(outer.a);
  return { a: outer.a + inner.a, tx: c * inner.tx - s * inner.ty + outer.tx, ty: s * inner.tx + c * inner.ty + outer.ty };
}
function move(T: Rigid, x: number, y: number): Pt {
  const c = Math.cos(T.a);
  const s = Math.sin(T.a);
  return [x * c - y * s + T.tx, x * s + y * c + T.ty];
}

/** A layer as a pixel grid, so it can be turned by sampling (every output pixel looks up its source pixel: no gaps, no torn rows). */
interface Grid { id: string; x0: number; y0: number; w: number; h: number; c: Int32Array; a: Float32Array; runs: Baked }
function grid(id: string, runs: Baked): Grid {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of runs.runs) {
    x0 = Math.min(x0, r.x);
    x1 = Math.max(x1, r.x + r.w);
    y0 = Math.min(y0, r.y);
    y1 = Math.max(y1, r.y + 1);
  }
  if (x0 === Infinity) x0 = y0 = x1 = y1 = 0;
  const w = x1 - x0;
  const h = y1 - y0;
  const c = new Int32Array(w * h).fill(-1);
  const a = new Float32Array(w * h);
  for (const r of runs.runs) for (let x = r.x; x < r.x + r.w; x++) {
    c[(r.y - y0) * w + x - x0] = r.c;
    a[(r.y - y0) * w + x - x0] = r.a ?? 1;
  }
  return { id, x0, y0, w, h, c, a, runs };
}

const turned = new Map<string, Baked>();
/** the layer moved by T, resampled to whole pixels (cached per pose: the aim is quantized, so poses repeat) */
function place(G: Grid, T: Rigid): Baked {
  if (Math.abs(T.a) < 1e-6 && Math.abs(T.tx) < 1e-6 && Math.abs(T.ty) < 1e-6) return G.runs;
  const key = `${G.id}|${T.a.toFixed(5)}|${T.tx.toFixed(2)}|${T.ty.toFixed(2)}`;
  const hit = turned.get(key);
  if (hit) return hit;
  if (turned.size > 360) turned.clear();
  const corners = [move(T, G.x0, G.y0), move(T, G.x0 + G.w, G.y0), move(T, G.x0, G.y0 + G.h), move(T, G.x0 + G.w, G.y0 + G.h)];
  const X0 = Math.floor(Math.min(...corners.map((p) => p[0]))) - 1;
  const X1 = Math.ceil(Math.max(...corners.map((p) => p[0]))) + 1;
  const Y0 = Math.floor(Math.min(...corners.map((p) => p[1]))) - 1;
  const Y1 = Math.ceil(Math.max(...corners.map((p) => p[1]))) + 1;
  const c = Math.cos(-T.a);
  const s = Math.sin(-T.a);
  const runs: Baked['runs'] = [];
  for (let y = Y0; y <= Y1; y++) {
    let open: { x: number; y: number; w: number; c: number; a: number } | null = null;
    for (let x = X0; x <= X1; x++) {
      const dx = x - T.tx;
      const dy = y - T.ty;
      const sx = Math.round(dx * c - dy * s) - G.x0;
      const sy = Math.round(dx * s + dy * c) - G.y0;
      const i = sx >= 0 && sy >= 0 && sx < G.w && sy < G.h ? sy * G.w + sx : -1;
      const col = i >= 0 ? G.c[i] : -1;
      if (col < 0) {
        open = null;
        continue;
      }
      const al = G.a[i];
      if (open && open.c === col && open.a === al && open.x + open.w === x) open.w++;
      else {
        open = { x, y, w: 1, c: col, a: al };
        runs.push(open);
      }
    }
  }
  const out = { w: 0, h: 0, runs };
  turned.set(key, out);
  return out;
}

function unpack(encoded: string): Baked {
  const bytes = atob(encoded);
  const runs: Baked['runs'] = [];
  for (let p = 0; p < bytes.length; p += 8) {
    const xy = bytes.charCodeAt(p) | bytes.charCodeAt(p + 1) << 8;
    runs.push({
      x: (xy & 511) - 256,
      y: ((xy >> 9) | bytes.charCodeAt(p + 2) << 7) - 224,
      w: bytes.charCodeAt(p + 3),
      c: bytes.charCodeAt(p + 4) << 16 | bytes.charCodeAt(p + 5) << 8 | bytes.charCodeAt(p + 6),
      a: bytes.charCodeAt(p + 7) / 255,
    });
  }
  return { w: 0, h: 0, runs };
}

/** split a layer pixel by pixel: [the pixels where `inside`, the rest] */
function split(image: Baked, inside: (x: number, y: number) => boolean): [Baked, Baked] {
  const a: Baked['runs'] = [];
  const b: Baked['runs'] = [];
  for (const r of image.runs) {
    let start = r.x;
    let mode = inside(r.x, r.y);
    for (let x = r.x + 1; x <= r.x + r.w; x++) {
      const m = x < r.x + r.w ? inside(x, r.y) : !mode;
      if (m === mode) continue;
      (mode ? a : b).push({ ...r, x: start, w: x - start });
      start = x;
      mode = m;
    }
  }
  return [{ w: 0, h: 0, runs: a }, { w: 0, h: 0, runs: b }];
}

// ---- the rigs --------------------------------------------------------------------------------------------------
const R = PERFECT_SUSANOO_RIG;
const WAIST: Pt = [R.waist.ahead, -R.waist.up];
const SHOULDER: Pt = [R.shoulder.ahead, -R.shoulder.up];

/**
 * The sheet bakes the drawn string into the body; those strokes never moved with the bow. Here the body loses them
 * (the string is drawn live from the bow tips to the hand) and splits at the belt into a torso that leans into the shot
 * and the legs that stay planted.
 */
const susanooBody = split(unpack(finalSpiritAtlas.s.body), (x, y) => !(x >= 36 && y >= -140 && y <= -73) && !(x >= 34 && y >= -140 && y <= -117));
const [susTorso, susLegs] = split(susanooBody[0], (_x, y) => y < WAIST[1]);

/** The front arm: the sheet's bow layer (forearm + bow) and an upper arm grown back from it into the shoulder pad. */
function bowArm(): Baked {
  const bow = unpack(finalSpiritAtlas.s.bow);
  const rows: [number, number, number][] = [
    [-116, 0x101028, .86], [-115, 0xb858f8, .94], [-114, 0x8038b8, .9], [-113, 0x7030a8, .9], [-112, 0x602098, .86],
    [-111, 0x602098, .86], [-110, 0x582090, .86], [-109, 0x582090, .86], [-108, 0x501880, .86], [-107, 0x501880, .86],
    [-106, 0x482078, .86], [-105, 0x381860, .86], [-104, 0x281048, .86], [-103, 0x101020, .86],
  ];
  const arm: Baked['runs'] = [];
  for (const [y, c, a] of rows) {
    arm.push({ x: 0, y, w: 7, c, a });
    arm.push({ x: 7, y, w: 1, c: y === -116 || y === -103 ? c : 0x281048, a: .86 }); // a plate seam
    arm.push({ x: 8, y, w: 11, c, a });
  }
  return { w: 0, h: 0, runs: [...arm, ...bow.runs] };
}

/** Kurama's legs, cut free for the leap: each turns about its joint (+ = clockwise), hind legs kicked back, forelegs reaching. */
const KURAMA_LEGS = [
  { id: 'hind', inside: (x: number, y: number) => x < -36 && y > -46, pivot: [-56, -46] as Pt, angle: 0.55 },
  { id: 'mid', inside: (x: number, y: number) => x >= -36 && x < -6 && y > -24, pivot: [-22, -26] as Pt, angle: 0.6 },
  { id: 'fore', inside: (x: number, y: number) => x >= 14 && y > -44, pivot: [16, -40] as Pt, angle: 0.22 },
];

const kBody = unpack(finalSpiritAtlas.k.body);
let rest = kBody;
const kLegs = KURAMA_LEGS.map((leg) => {
  const [piece, left] = split(rest, leg.inside);
  rest = left;
  return { ...leg, grid: grid('k-' + leg.id, piece) };
});

const layers = {
  kBody: grid('k-body', kBody),
  kTrunk: grid('k-trunk', rest),
  kBack: grid('k-back', unpack(finalSpiritAtlas.k.back)),
  kHead: grid('k-head', unpack(finalSpiritAtlas.k.head)),
  kJaw: grid('k-jaw', unpack(finalSpiritAtlas.k.jaw)),
  sTorso: grid('s-torso', susTorso),
  sLegs: grid('s-legs', susLegs),
  sBack: grid('s-back', unpack(finalSpiritAtlas.s.back)),
  sArm: grid('s-arm', bowArm()),
};

// ---- reveals ---------------------------------------------------------------------------------------------------
/** the weaker of two reveals (a pixel shows only where both let it) */
function both(a: Visible, b: Visible): Visible {
  const rank = [0, 1, 3, 2];
  return (x, y) => {
    const m = a(x, y);
    if (m === Seen.Hidden) return m;
    const n = b(x, y);
    return rank[n] < rank[m] ? n : m;
  };
}

/**
 * The tails / wings unfurl: a sweep turning around the root (each tail or feather appears in turn, its glowing edge
 * leading) and a front running out along them. Whole pixels only: nothing is squashed or stretched.
 */
function unfurl(kind: Spirit, q: number, seed: number, T: Rigid): Visible {
  if (q >= 1) return () => Seen.Full;
  const { root, from, to, reach } = FAN[kind];
  const [rx, ry] = move(T, root[0], root[1]);
  const sweep = from + (to - from) * smooth(q);
  const dir = Math.sign(to - from);
  const front = reach * clamp(q * 1.5) + 4;
  const soft = 0.22;
  return (x, y) => {
    const r = Math.hypot(x - rx, y - ry);
    const d = front - r;
    if (d < 0) return Seen.Hidden;
    // measured in the layer's own frame, so a leaned or flapping wing still opens the same way
    const ahead = (sweep - (Math.atan2(ry - y, rx - x) - T.a)) * dir;
    if (ahead < 0) return Seen.Hidden;
    const n = noise(x, y, seed);
    if (ahead < 0.05 || d < 2) return n < 0.7 ? Seen.Edge : Seen.Ghost;
    if (ahead < soft) return n < ahead / soft ? Seen.Full : Seen.Ghost;
    if (d < 10) return n < d / 10 ? Seen.Full : Seen.Ghost;
    return Seen.Full;
  };
}

/** Reveal outward from a point (the bow arm from the shoulder; a spirit forming around a fighter in the air). */
function outward(cx: number, cy: number, front: number, seed = 7): Visible {
  return (x, y) => {
    const d = front - Math.hypot(x - cx, y - cy);
    if (d < 0) return Seen.Hidden;
    if (d < 2.5) return noise(x, y, seed) < 0.75 ? Seen.Edge : Seen.Ghost;
    if (d < 9) return noise(x, y, seed) < d / 9 ? Seen.Full : Seen.Ghost;
    return Seen.Full;
  };
}

/** In the air the lower body has nothing to stand on: it thins out into flickering chakra below `top`, gone by `bottom`. */
function dissolve(top: number, bottom: number, time: number): Visible {
  const tick = Math.floor(time * 14);
  return (x, y) => {
    if (y <= top) return Seen.Full;
    const k = (y - top) / (bottom - top);
    if (k >= 1) return Seen.Hidden;
    const n = noise(x, y + tick * 3, 21);
    if (n < k) return Seen.Hidden;
    // the thinning edge glows like burning chakra rather than greying out
    if (n < k + 0.12) return Seen.Edge;
    return n < k + 0.3 ? Seen.Ghost : Seen.Full;
  };
}

export interface FinalSpiritPose {
  kind: Spirit;
  x: number;
  y: number;
  facing: number;
  alpha: number;
  time: number;
  /** 0..1 the body forming (rising out of the ground, or spreading out of the fighter in the air) */
  reveal: number;
  /** 0..1 the tails / wings unfurling (defaults to done once the body is up) */
  fan?: number;
  /** 0..1 Susanoo's bow arm forming out of the shoulder */
  weapon?: number;
  /** Kurama: how far the jaw is open (0 shut .. 1 open, up to ~1.3 for the roar). Susanoo: how far the string is drawn. */
  draw: number;
  aim: number;
  /** 0..1 the arrow of light forming on the string */
  arrow?: number;
  released?: boolean;
  /** the fighter is in the air: the airborne posture (Kurama mid-leap, Susanoo's legs trailing off as chakra) */
  air?: boolean;
}

/** World-pixel layers from the approved artwork. */
export function paintFinalSpirit(g: Graphics, pose: FinalSpiritPose): void {
  const { kind, facing, alpha, time, draw, released } = pose;
  const reveal = clamp(pose.reveal);
  if (alpha <= 0 || reveal <= 0) return;
  const isKurama = kind === 'k';
  const air = !!pose.air;
  // airborne spirits hover: a slow bob
  const x = pose.x;
  const y = pose.y + (air ? Math.round(Math.sin(time * 2.4) * 2) : 0);
  const fan = clamp(pose.fan ?? (reveal >= 1 ? 1 : 0));
  const a = avatarAim(pose.aim);
  const edge = EDGE[kind];
  // on the ground the body rises out of it; in the air it spreads out of the fighter
  const visible: Visible = reveal >= 1 ? () => Seen.Full
    : air ? outward(0, -14, smooth(reveal) * 215, 3) : rising(0, smooth(reveal) * LIMIT[kind], 12, 3);
  const fade = alpha * (0.45 + 0.55 * clamp(reveal * 2));

  const paint = (image: Baked, opacity: number, seen: Visible = visible, shift?: (v: number) => number) => {
    if (opacity <= 0) return;
    let lastColor = -1;
    let lastAlpha = -1;
    const put = (u: number, v: number, w: number, c: number, al: number) => {
      if (lastColor !== c || lastAlpha !== al) {
        g.fillStyle(c, al);
        lastColor = c;
        lastAlpha = al;
      }
      g.fillRect(Math.round(x + facing * u) - (facing < 0 ? w - 1 : 0), Math.round(y + v), w, 1);
    };
    for (const run of image.runs) {
      const base = opacity * (run.a ?? 1);
      // split the run wherever the reveal changes, so the glowing front is pixel exact
      const dx = shift ? shift(run.y) : 0;
      let start = run.x;
      let mode = seen(run.x, run.y);
      const flush = (end: number) => {
        if (end <= start || mode === Seen.Hidden) return;
        if (mode === Seen.Edge) put(start + dx, run.y, end - start, edge, clamp(base + .3));
        else put(start + dx, run.y, end - start, run.c, mode === Seen.Ghost ? base * .35 : base);
      };
      for (let px = run.x + 1; px < run.x + run.w; px++) {
        const m = seen(px, run.y);
        if (m !== mode) {
          flush(px);
          start = px;
          mode = m;
        }
      }
      flush(run.x + run.w);
    }
  };
  const line = (T: Rigid, p: Pt, q: Pt, color: number, width: number, al: number) => {
    const [u, v] = move(T, ...p);
    const [m, n] = move(T, ...q);
    g.lineStyle(width, color, al).lineBetween(x + facing * u, y + v, x + facing * m, y + n);
  };

  // The tails / wings sway as rows (whole rows move, so nothing tears apart).
  const { root, sway } = FAN[kind];
  const amp = sway * (0.35 + 0.65 * fan) * (air ? 1.5 : 1);
  const rowShift = (T: Rigid) => (v: number) => {
    const lift = clamp((move(T, root[0], root[1])[1] - v) / 150 + (isKurama ? 0.25 : 0.5));
    return Math.round(Math.sin(time * (isKurama ? 4.2 : 3) - v * 0.05) * amp * lift);
  };

  if (isKurama) {
    // in the air the tails stream back behind the leap, waving slowly
    const tailT = air ? about(root[0], root[1], avatarAim(-0.16 + 0.05 * Math.sin(time * 2.6))) : IDENTITY;
    if (fan > 0) paint(place(layers.kBack, tailT), alpha * (0.6 + 0.4 * fan), both(visible, unfurl(kind, fan, 11, tailT)), rowShift(tailT));
    if (air) {
      for (const leg of kLegs) paint(place(leg.grid, about(leg.pivot[0], leg.pivot[1], leg.angle)), fade);
      paint(layers.kTrunk.runs, fade);
    } else paint(layers.kBody.runs, fade);

    const neck = about(FINAL_KURAMA_NECK.ahead, -FINAL_KURAMA_NECK.up, a);
    const jaw = then(neck, about(70, -40, Math.round((draw * .32 - .14) * 96) / 96));
    if (draw > .05 && reveal >= .7) {
      // The mouth interior bridges the upper muzzle and the single moving lower jaw.
      const mouth: Pt[] = [move(neck, 71, -40), move(neck, 88, -42), move(neck, 124, -35), move(jaw, 110, -22), move(neck, 83, -25)];
      g.fillStyle(0x291321, fade * .88);
      g.beginPath();
      mouth.forEach(([u, v], i) => (i ? g.lineTo(x + facing * u, y + v) : g.moveTo(x + facing * u, y + v)));
      g.closePath();
      g.fillPath();
    }
    paint(place(layers.kHead, neck), fade);
    paint(place(layers.kJaw, jaw), fade);
    return;
  }

  // ---- Susanoo: the torso leans into the shot about the waist, the bow arm swings the rest about the shoulder
  const torso = about(WAIST[0], WAIST[1], susanooLean(a));
  // the arm: turned by the whole aim about the shoulder, then carried along by the lean
  const arm = then(torso, about(SHOULDER[0], SHOULDER[1], a - susanooLean(a)));
  // the wings ride the torso; in the air they spread wider and beat slowly
  const wingT = air ? then(torso, about(root[0], root[1], avatarAim(0.16 + 0.07 * Math.sin(time * 3.1)))) : torso;
  if (fan > 0) paint(place(layers.sBack, wingT), alpha * (0.6 + 0.4 * fan), both(visible, unfurl(kind, fan, 11, wingT)), rowShift(wingT));
  paint(layers.sLegs.runs, fade, air ? both(visible, dissolve(-80, -50, time)) : visible);
  paint(place(layers.sTorso, torso), fade);

  const weapon = clamp(pose.weapon ?? (reveal >= 1 ? 1 : 0));
  if (weapon <= 0) return;
  const wfade = fade * Math.min(1, 0.4 + weapon);
  // the arm grows out of the shoulder pad, then the bow out of the hand
  const [sx, sy] = move(arm, ...SHOULDER);
  paint(place(layers.sArm, arm), wfade, weapon >= 1 ? () => Seen.Full : outward(sx, sy, smooth(weapon) * 135));
  if (weapon < 1) return;

  const { ahead, up } = PERFECT_SUSANOO_LAUNCH;
  // the nock: at rest the string hangs straight between the tips, fully drawn it reaches the chin
  const hand: Pt = [58 - 24 * draw, -up];
  line(arm, [62, -174], hand, edge, 1, wfade);
  line(arm, hand, [57, -36], edge, 1, wfade);
  if (released) return;
  // the drawing hand: from the chin (on the torso) out to the nock on the string
  const [cu, cv] = move(torso, 28, -104);
  const [hu, hv] = move(arm, ...hand);
  if (Math.hypot(hu - cu, hv - cv) > 3) {
    g.lineStyle(6, 0x502088, wfade).lineBetween(x + facing * cu, y + cv, x + facing * hu, y + hv);
    g.lineStyle(1, 0xb058f0, wfade).lineBetween(x + facing * cu, y + cv - 2, x + facing * hu, y + hv - 2);
  }
  line(arm, [hand[0] - 6, hand[1]], hand, 0x9452cf, 5, wfade);
  g.fillStyle(edge, wfade).fillRect(Math.round(x + facing * hu) - 2, Math.round(y + hv) - 2, 4, 4);
  // The arrow of light: it condenses along the string from the hand to the tip, then its head ignites.
  const arrow = clamp(pose.arrow ?? 0);
  if (arrow <= 0) return;
  const tip: Pt = [ahead, -up];
  const grow = smooth(arrow / .7);
  const end: Pt = [hand[0] + (tip[0] - hand[0]) * grow, -up];
  line(arm, hand, end, 0xb07ae8, 5, wfade * .35);
  line(arm, hand, end, 0xfbe8ff, 2, wfade);
  if (arrow < .7) return;
  const head = smooth((arrow - .7) / .3);
  const pulse = 0.5 + 0.5 * Math.sin(time * 26);
  const [ex, ey] = move(arm, ...tip);
  const [bx, by] = move(arm, tip[0] - 7, -up - 4 * head);
  const [cx, cy] = move(arm, tip[0] - 7, -up + 4 * head);
  const [nx, ny] = move(arm, tip[0] + 4 * head, -up);
  g.fillStyle(0xfbe8ff, wfade).fillTriangle(x + facing * nx, y + ny, x + facing * bx, y + by, x + facing * cx, y + cy);
  g.fillStyle(edge, wfade * (.25 + .25 * pulse) * head).fillCircle(x + facing * ex, y + ey, 5 + 3 * head + pulse);
}

/** where a spirit's airborne bob puts it this frame (effects that hang off the spirit follow it) */
export const airBob = (time: number): number => Math.round(Math.sin(time * 2.4) * 2);
