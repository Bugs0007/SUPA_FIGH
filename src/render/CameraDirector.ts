import type Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../game/display';
import { spiritBounds } from '../sim/data/heroes';
import type { Fighter } from '../sim/fighter';
import type { World } from '../sim/world';

/** Screen-space margins (native px) kept around framed fighters: HUD score bar on top, player panels below. */
const PAD_X = 44;
const PAD_TOP = 34;
const PAD_BOTTOM = 50;
/** never zoom in further than this */
const Z_MAX = 1.7;
/** don't zoom out past this just to show bots; human players can force it lower */
const Z_COMFORT = 0.62;
/** absolute floor (huge maps with players at opposite corners) */
const Z_FLOOR = 0.3;

interface Box {
  l: number;
  r: number;
  t: number;
  b: number;
  n: number;
}

const emptyBox = (): Box => ({ l: Infinity, r: -Infinity, t: Infinity, b: -Infinity, n: 0 });

function addPoint(box: Box, x: number, top: number, bottom: number): void {
  box.l = Math.min(box.l, x);
  box.r = Math.max(box.r, x);
  box.t = Math.min(box.t, top);
  box.b = Math.max(box.b, bottom);
  box.n++;
}

function merge(a: Box, b: Box): Box {
  if (!b.n) return a;
  if (!a.n) return b;
  return { l: Math.min(a.l, b.l), r: Math.max(a.r, b.r), t: Math.min(a.t, b.t), b: Math.max(a.b, b.b), n: a.n + b.n };
}

/** Largest zoom at which the box fits inside the view with the screen-space margins. */
function fitZoom(b: Box): number {
  const zx = (VIEW_W - PAD_X * 2) / Math.max(1, b.r - b.l);
  const zy = (VIEW_H - PAD_TOP - PAD_BOTTOM) / Math.max(1, b.b - b.t);
  return Math.min(zx, zy);
}

/** Range of camera centers (one axis) that keeps [lo, hi] inside a view of half-size `half` with margins. */
function centerRange(lo: number, hi: number, half: number, padLo: number, padHi: number): [number, number] {
  return [hi + padHi - half, lo - padLo + half];
}

const clamp = (v: number, a: number, b: number) => (a > b ? (a + b) / 2 : Math.max(a, Math.min(b, v)));

/**
 * Smart shared camera. Human players are a hard constraint: the camera zooms out as far as needed and,
 * after smoothing, corrects instantly if anyone would leave the screen (so nobody ever plays blind).
 * Bots and ghosts are framed too while that keeps a comfortable zoom; otherwise the view leans toward
 * them as far as it can without losing a player. Margins are in screen pixels so the HUD (score bar,
 * player panels) never covers a fighter. Also: map clamping, cinematic focus, trauma-based shake.
 */
export class CameraDirector {
  x = 0;
  y = 0;
  z = 1;
  private trauma = 0;
  private shakeT = 0;
  private readonly avatarReveals = new Map<number, { scale: number; remaining: number }>();
  shakeScale = 1;
  /** zoom out no further than this just to show bots (phones raise it: tiny screens, big fighters) */
  comfort = Z_COMFORT;
  private first = true;
  /** trailer mode: a scripted camera (world x/y, zoom, smoothing 1/s) replaces the automatic framing */
  manual: { x: number; y: number; z: number; k: number } | null = null;

  constructor(
    private cam: Phaser.Cameras.Scene2D.Camera,
    public baseZoom: number,
  ) {}

  /** short colour flash over the whole view (transformations) */
  flash(ms: number, r: number, g: number, b: number): void {
    this.cam.flash(ms, r, g, b, true);
  }

  addTrauma(v: number): void {
    this.trauma = Math.min(1, this.trauma + v * this.shakeScale);
  }

  /** Frame a forming avatar when it fits alongside the fighters. */
  revealAvatar(fid: number, scale: number, duration: number): void {
    this.avatarReveals.set(fid, { scale, remaining: duration });
  }

  /** Bounds of fighters that must stay on screen (living humans) and of everyone else worth showing. */
  /**
   * Network matches: the fighters this device plays. They are the hard constraint instead of "every human",
   * so ten players on ten phones don't force one huge zoom-out. null = every human (local play).
   */
  mustIds: ReadonlySet<number> | null = null;

  private gather(w: World): { must: Box; nice: Box } {
    const must = emptyBox();
    const nice = emptyBox();
    const humans = w.fighters.some((f) => f.master < 0 && !f.isBot);
    for (const f of w.fighters) {
      if (f.trainer?.mounted) continue; // The rider is already included in the Pokémon's framing.
      const shown = !f.gone && (f.alive || f.stateTime <= 1.2);
      if (shown) {
        const controller = f.pokemon?.mounted ? w.fighters[f.master] : f;
        const mainBody = !f.pokemon || f.pokemon.mounted;
        const isMust = mainBody && (this.mustIds ? this.mustIds.has(controller.id) && f.alive : humans ? !controller.isBot && f.alive : true);
        const box = isMust ? must : nice;
        addPoint(box, f.x, f.y - (f.pokemon ? Math.max(26, f.h + 9) : 40), f.y + 2);
      }
      if (!f.alive && f.ghost) addPoint(nice, f.gx, f.gy - 30, f.gy + 4);
      // Ultimates need full framing. A form reveal is optional when players are far apart.
      const ultimateAvatar = f.state === 'special' && f.specialKind === 'bomb';
      const reveal = f.powerLevel === 4 ? this.avatarReveals.get(f.id) : undefined;
      if (shown && f.alive && f.power === 'hero' && (ultimateAvatar || reveal)) {
        const s = spiritBounds(f.hero, f.powerLevel);
        if (s) {
          const scale = ultimateAvatar ? 1 : reveal?.scale ?? 1;
          const left = f.facing >= 0 ? s.back : s.front;
          const right = f.facing >= 0 ? s.front : s.back;
          const box = ultimateAvatar ? must : nice;
          addPoint(box, f.x - left * scale, f.y - s.up * scale, f.y + 2);
          addPoint(box, f.x + right * scale, f.y - s.up * scale, f.y + 2);
        }
      }
    }
    return { must, nice };
  }

  update(dt: number, w: World, focus: { x: number; y: number; follow?: boolean; snap?: boolean } | null): void {
    for (const [fid, reveal] of this.avatarReveals) {
      reveal.remaining -= dt;
      if (reveal.remaining <= 0) this.avatarReveals.delete(fid);
    }
    const mapW = w.map.pxW;
    const mapH = w.map.pxH;
    const { must, nice } = this.gather(w);
    const all = merge(must, nice);

    let tz: number;
    let tx: number;
    let ty: number;
    if (!all.n) {
      tz = Math.max(Z_FLOOR, Math.min(VIEW_W / mapW, VIEW_H / mapH));
      tx = mapW / 2;
      ty = mapH / 2;
    } else {
      const zMust = must.n ? fitZoom(must) : Z_MAX;
      const zAll = fitZoom(all);
      // everyone if it's comfortable; never zoom out further than needed for the humans
      tz = Math.max(zAll, Math.min(this.comfort, zMust));
      tz = Math.max(Z_FLOOR, Math.min(Z_MAX, tz, zMust));
      // aim at everyone, but only as far as the humans stay framed
      const ax = (all.l + all.r) / 2;
      const ay = (all.t + all.b) / 2 + (PAD_BOTTOM - PAD_TOP) / 2 / tz;
      if (must.n) {
        const [x0, x1] = centerRange(must.l, must.r, VIEW_W / tz / 2, PAD_X / tz, PAD_X / tz);
        const [y0, y1] = centerRange(must.t, must.b, VIEW_H / tz / 2, PAD_TOP / tz, PAD_BOTTOM / tz);
        tx = clamp(ax, x0, x1);
        ty = clamp(ay, y0, y1);
      } else {
        tx = ax;
        ty = ay;
      }
    }

    if (this.manual) {
      tx = this.manual.x;
      ty = this.manual.y;
      tz = this.manual.z;
    } else if (focus) {
      tx = focus.x;
      ty = focus.y - 10;
      tz = Math.max(tz * 1.35, 1.7);
    }

    if (this.first || focus?.snap) {
      this.x = tx;
      this.y = ty;
      this.z = tz;
      this.first = false;
    }
    // zooming out reacts faster than zooming in (losing sight of someone is worse than a wide shot)
    const kz = this.manual ? 1 - Math.exp(-dt * this.manual.k) : 1 - Math.exp(-dt * (focus ? 6 : tz < this.z ? 5 : 2.2));
    const kp = this.manual ? 1 - Math.exp(-dt * this.manual.k * 1.3) : 1 - Math.exp(-dt * (focus ? 8 : 6));
    this.z += (tz - this.z) * kz;
    this.x += (tx - this.x) * kp;
    this.y += (ty - this.y) * kp;

    // hard guarantee: after smoothing, every human player is still inside the safe area
    if (!focus && !this.manual && must.n) this.keepInView(must);
    // Replay victims remain framed even during fast knockback or after leaving the arena.
    if (focus?.follow) {
      const victim = emptyBox();
      addPoint(victim, focus.x, focus.y - 40, focus.y + 2);
      this.keepInView(victim);
    }

    // clamp to map (or center when the view is bigger than the map)
    const halfW = VIEW_W / this.z / 2;
    const halfH = VIEW_H / this.z / 2;
    const cx = focus?.follow ? this.x : halfW * 2 >= mapW ? mapW / 2 : Math.max(halfW, Math.min(mapW - halfW, this.x));
    const cy = focus?.follow ? this.y : halfH * 2 >= mapH ? mapH / 2 : Math.max(halfH, Math.min(mapH - halfH, this.y));

    // shake
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.shakeT += dt * 60;
    const s = this.trauma * this.trauma;
    const ox = s * 7 * noise(this.shakeT, 1);
    const oy = s * 7 * noise(this.shakeT, 2);

    this.cam.setZoom(this.baseZoom * this.z);
    this.cam.centerOn(cx + ox, cy + oy);
  }

  /** Zoom out / shift just enough that the box fits the current view with (slightly smaller) margins. */
  private keepInView(b: Box): void {
    const need = Math.max(Z_FLOOR, fitZoom(b) * 1.0);
    if (this.z > need) this.z = need;
    const halfW = VIEW_W / this.z / 2;
    const halfH = VIEW_H / this.z / 2;
    // allow the margins to shrink to 60% before forcing the camera over
    const [x0, x1] = centerRange(b.l, b.r, halfW, (PAD_X * 0.6) / this.z, (PAD_X * 0.6) / this.z);
    const [y0, y1] = centerRange(b.t, b.b, halfH, (PAD_TOP * 0.6) / this.z, (PAD_BOTTOM * 0.6) / this.z);
    this.x = clamp(this.x, x0, x1);
    this.y = clamp(this.y, y0, y1);
  }

  /** Is a fighter fully on screen (used by tests)? */
  static inView(cam: Phaser.Cameras.Scene2D.Camera, f: Fighter): boolean {
    const v = cam.worldView;
    return f.x >= v.x && f.x <= v.right && f.y - 22 >= v.y && f.y <= v.bottom;
  }
}

function noise(t: number, seed: number): number {
  return Math.sin(t * 1.7 + seed * 10) * 0.6 + Math.sin(t * 3.1 + seed * 4) * 0.4;
}
