import type Phaser from 'phaser';
import { hexToNum, shade } from '../art/palette';
import { moveLook } from '../art/heroMoves';
import { heroDef, JET_BAZOOKA, superFistFor } from '../sim/data/heroes';
import { SHOULDER_Y_STAND } from '../sim/constants';
import type { FighterView } from './FighterView';
import { formLevel } from './formLevel';
import { gatlingReach } from '../sim/hero';

type Graphics = Phaser.GameObjects.Graphics;
type Point = { x: number; y: number };

/** Read-only attack art. Every hand ends at the simulation's existing reach. */
export class LuffyAbilityArt {
  constructor(private back: Graphics, private front: Graphics) {}

  private polygon(g: Graphics, points: Point[], color: number, alpha: number): void {
    g.fillStyle(color, alpha).fillPoints(points.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) })), true);
  }

  /** A clenched hand: stepped knuckles, curled thumb, palm plane and wrist. */
  private fist(g: Graphics, x: number, y: number, dx: number, dy: number, side: number, r: number, skin: string, haki: boolean, alpha: number, squash = 1): void {
    const px = -dy * side;
    const py = dx * side;
    const point = (u: number, v: number, scale = r): Point => ({
      x: x + dx * u * scale * squash + px * v * scale / squash,
      y: y + dy * u * scale * squash + py * v * scale / squash,
    });
    const shape = [[-.95, -.48], [-.62, -.84], [-.08, -.96], [.48, -.86], [.88, -.58], [1, -.23], [1, .45], [.68, .74], [.04, .88], [-.63, .65], [-.98, .18]];
    const base = haki ? 0x252133 : hexToNum(skin);
    const shadow = haki ? 0x100f20 : hexToNum(shade(skin, -.3));
    const light = haki ? 0x633447 : hexToNum(shade(skin, .18));
    this.polygon(g, shape.map(([u, v]) => point(u, v, r + 1)), 0x171321, alpha);
    this.polygon(g, shape.map(([u, v]) => point(u, v)), base, alpha);
    this.polygon(g, [[-.62, -.7], [-.08, -.8], [.5, -.7], [.78, -.42], [.18, -.39], [-.48, -.42]].map(([u, v]) => point(u, v)), light, alpha);
    this.polygon(g, [[-.8, .25], [.85, .28], [.65, .62], [.02, .72], [-.52, .5]].map(([u, v]) => point(u, v)), shadow, alpha);
    // The thumb crosses the palm instead of a round highlight impersonating a hand.
    const thumb = [[-.8, -.05], [-.25, -.1], [.18, .08], [.33, .35], [.08, .58], [-.42, .51], [-.77, .28]];
    if (r >= 4) {
      this.polygon(g, thumb.map(([u, v]) => point(u, v, r + .55)), shadow, alpha);
      this.polygon(g, thumb.map(([u, v]) => point(u, v)), base, alpha);
      for (const v of [-.38, -.08, .22]) {
        const a = point(.65, v), b = point(.93, v + .06);
        g.lineStyle(Math.max(1, Math.floor(r / 18)), shadow, alpha).lineBetween(Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y));
      }
    }
    if (haki) {
      // Haki follows the knuckle planes and wrist, rather than rings around the arm.
      const a = point(-.48, -.68), b = point(.36, -.77), c = point(.75, -.44);
      g.lineStyle(Math.max(1, Math.floor(r / 12)), 0xb43b50, alpha).lineBetween(a.x, a.y, b.x, b.y).lineBetween(b.x, b.y, c.x, c.y);
      const w = point(-.86, .12), z = point(-.55, .47);
      g.lineStyle(1, 0xef7980, alpha * .8).lineBetween(w.x, w.y, z.x, z.y);
    }
  }

  private limb(g: Graphics, x: number, y: number, dx: number, dy: number, side: number, len: number, r: number, skin: string, haki: boolean, bend: number, alpha: number): void {
    const px = -dy * side, py = dx * side;
    const sections = Math.max(4, Math.min(72, Math.ceil(len / 3)));
    const points: { x: number; y: number; width: number }[] = [];
    for (let i = 0; i <= sections; i++) {
      const t = i / sections;
      // A single continuous S-curve; no second straight arm beneath it.
      const wave = Math.sin(t * Math.PI * 2) * bend * Math.sin(t * Math.PI);
      points.push({ x: x + dx * len * t + px * wave, y: y + dy * len * t + py * wave, width: 1.2 + Math.min(5.5, r * .15) * t * t });
    }
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const quad = (extra: number, offset = 0) => [
        { x: a.x + px * (a.width + extra + offset), y: a.y + py * (a.width + extra + offset) },
        { x: b.x + px * (b.width + extra + offset), y: b.y + py * (b.width + extra + offset) },
        { x: b.x + px * (-b.width - extra + offset), y: b.y + py * (-b.width - extra + offset) },
        { x: a.x + px * (-a.width - extra + offset), y: a.y + py * (-a.width - extra + offset) },
      ];
      const coated = haki && i / sections > .55;
      this.polygon(g, quad(1), 0x171321, alpha);
      this.polygon(g, quad(0), coated ? 0x252133 : hexToNum(skin), alpha);
      const highlight = coated ? 0x7b354a : hexToNum(shade(skin, .17));
      g.lineStyle(1, highlight, alpha * .85).lineBetween(Math.round(a.x - px * a.width * .5), Math.round(a.y - py * a.width * .5), Math.round(b.x - px * b.width * .5), Math.round(b.y - py * b.width * .5));
    }
  }

  arm(v: FighterView, x: number, y: number): void {
    const f = v.fighter, level = formLevel(f), style = moveLook('luffy', level);
    const superMove = f.specialKind === 'superFist';
    const haki = level === 3 || (superMove && level >= 2);
    const radius = superMove ? Math.max(3, f.beamWidth) : level === 2 || level === 3 ? 5 : level === 4 ? 3.5 : 2.5;
    const dx = Math.cos(f.stretchAngle) * f.facing, dy = Math.sin(f.stretchAngle);
    const len = f.w / 2 + f.stretchLen;
    const sx = x + f.facing * 2, sy = y - SHOULDER_Y_STAND + 1;
    const g = f.specialKind === 'swing' ? this.back : this.front;
    const nika = superMove && style.rubber === 'cartoon' ? superFistFor('luffy', level) : null;
    const impactAge = nika ? f.stateTime - nika.out : -1;
    const recoil = impactAge >= 0 ? Math.cos(impactAge * 29) * Math.exp(-impactAge * 11) : 0;
    const bend = style.rubber === 'cartoon' ? Math.sin(f.stateTime * 16) * Math.min(11, len * .1) - recoil * Math.min(9, len * .08) : style.rubber === 'haki' ? Math.sin(f.stateTime * 20) * Math.min(4, len * .035) : 0;
    const skin = v.lookFor(level).skin;
    this.limb(g, sx, sy, dx, dy, f.facing, len, radius, skin, haki, bend, 1);
    const tip = { x: sx + dx * len, y: sy + dy * len };
    this.fist(g, tip.x, tip.y, dx, dy, f.facing, radius, skin, haki, 1, 1 - recoil * 0.18);
    if (nika && impactAge >= 0 && impactAge < 0.24) this.nikaRebound(tip, dx, dy, radius, impactAge);
    if(f.specialKind==='pistol'&&!f.armBack&&(f.grip==='ladder'||f.grip==='platform')){
      const ax=Math.round(f.anchorX),ay=Math.round(f.anchorY);
      g.fillStyle(0xffdf8a,.9);
      for(const side of [-1,1]){
        g.fillRect(ax+side*5-(side<0?0:2),ay-5,3,1);
        g.fillRect(ax+side*5-(side<0?0:2),ay+5,3,1);
        g.fillRect(ax+side*5,ay-5,1,3);g.fillRect(ax+side*5,ay+3,1,3);
      }
    }
    if (f.specialKind !== 'swing' && f.specialKind !== 'rocket') {
      // Directional speed strokes stop before the hand. They never orbit it.
      const active = Math.min(1, len / 45);
      for (let i = -1; i <= 1; i++) {
        const px = -dy * f.facing, py = dx * f.facing;
        const d = Math.max(3, len - radius - 8 - Math.abs(i) * 5);
        const a = Math.min(18, d * .3);
        g.lineStyle(1, style.rubber === 'jet' ? 0xffe7ed : style.rubber === 'cartoon' ? 0xfffdf3 : haki ? 0xc94860 : 0xf1d4b5, active * .48)
          .lineBetween(Math.round(sx + dx * (d - a) + px * i * (radius + 3)), Math.round(sy + dy * (d - a) + py * i * (radius + 3)), Math.round(sx + dx * d + px * i * (radius + 3)), Math.round(sy + dy * d + py * i * (radius + 3)));
      }
    }
  }

  /** At full extension, the fist squashes and kicks two ripples back down the elastic strike. */
  private nikaRebound(tip: Point, dx: number, dy: number, radius: number, time: number): void {
    for (const lag of [0, 0.06]) {
      const k = (time - lag) / 0.18;
      if (k < 0 || k >= 1) continue;
      const distance = radius * (0.58 + k * 1.3);
      const wide = radius * (0.83 + k * 0.5);
      for (let i = 0; i < 20; i++) {
        if (i % 5 === 4) continue;
        const angle = i / 20 * Math.PI * 2;
        const u = Math.cos(angle) * wide * 0.48 - distance;
        const w = Math.sin(angle) * wide;
        const x = Math.round(tip.x + dx * u - dy * w);
        const y = Math.round(tip.y + dy * u + dx * w);
        this.back.fillStyle(i % 3 ? 0xfff7ec : 0xffdca2, (1 - k) * 0.85).fillRect(x, y, 2, i % 3 ? 2 : 1);
      }
    }
  }

  /** Stretch to a real grip, pull against it, then let the arms snap back with an elastic follow-through. */
  jet(v:FighterView,x:number,y:number):void{
    const f=v.fighter,t=f.stateTime,pre=Math.min(1,t/JET_BAZOOKA.windup),release=Math.max(0,t-JET_BAZOOKA.windup);
    const skin=v.lookFor(formLevel(f)).skin,haki=formLevel(f)>=3;
    const rootX=v.root.x,rootY=v.root.y;
    if(f.jetMode==='kick'){
      const hold=release===0?1:Math.max(0,1-release/.16);
      const hx=x+f.facing*18*Math.max(0,1-release/.1),hy=y-14;
      const dx=hx-rootX,dy=hy-(rootY-15),len=Math.hypot(dx,dy)||1;
      if(hold>0){this.limb(this.front,rootX,rootY-15,dx/len,dy/len,f.facing,len,3,skin,haki,Math.sin(pre*Math.PI)*5,hold);this.fist(this.front,hx,hy,dx/len,dy/len,f.facing,3,skin,haki,hold);}
      const kickX=x+f.facing*Math.cos(f.stretchAngle)*24,kickY=y-13+Math.sin(f.stretchAngle)*24;
      if(release<.15&&release>0)for(let i=0;i<4;i++)this.front.fillStyle(0xfff0cf,.7).fillRect(Math.round(kickX+f.facing*i*4),Math.round(kickY-4+i*3),3,1);
      return;
    }
    const stretch=release===0?Math.min(1,pre*3):Math.max(0,1-release/.15);
    for(const side of [-1,1]){
      const sx=rootX+f.facing*side*2,sy=rootY-15+side*2;
      const dx=f.jetAnchorX-sx,dy=f.jetAnchorY-sy,len=Math.hypot(dx,dy)||1;
      const reach=Math.max(6,Math.min(JET_BAZOOKA.anchorRange,len)*stretch);
      this.limb(this.back,sx,sy,dx/len,dy/len,side,reach,3.5,skin,haki,Math.sin(pre*Math.PI)*9*(release===0?1:stretch),1);
      this.fist(this.back,sx+dx/len*reach,sy+dy/len*reach,dx/len,dy/len,side,3,skin,haki,1);
    }
    if(release>0)for(let i=0;i<5;i++)this.back.fillStyle(0xffeee2,.35*(1-i/6)).fillRect(Math.round(x-f.facing*(12+i*8)),Math.round(y-14+i%2*5),6,1);
  }

  combo(v:FighterView,x:number,y:number,reach:number,extension:number,alpha:number,upper:boolean,kick:boolean):void{
    if(alpha<=0)return;
    const f=v.fighter,lv=formLevel(f),skin=v.lookFor(lv).skin;
    const haki=lv===3||lv===4, r=lv===2?4:lv>=3?3.5:2.2;
    const len=Math.max(3,(reach-r-2)*extension),sx=x+f.facing*2,sy=y-(kick?8:16);
    const bend=lv===4?Math.sin(extension*Math.PI)*7:upper?-Math.sin(extension*Math.PI)*4:0;
    const dx=f.facing,dy=0;
    this.limb(this.front,sx,sy,dx,dy,f.facing,len,r,skin,haki,bend,alpha);
    this.fist(this.front,sx+dx*len,sy,dx,dy,f.facing,r,skin,haki,alpha);
    if(lv===1)for(let i=0;i<3;i++)this.back.lineStyle(2,0xffe4e8,alpha*.25)
      .lineBetween(x-f.facing*(5+i*3),y-4-i*5,x-f.facing*(9+i*3),y-15-i*5);
    if(lv===4)this.front.lineStyle(1,0xffffff,alpha*.7).lineBetween(sx,sy-3,sx+dx*(len-3),sy-3);
  }

  /**
   * Hold BLOCK, one guard per gear: a rubber bounce, steam, an inflated fist shield, Boundman's balloon belly and, in
   * Gear Fifth, the floor itself pulled up like a rubber sheet (both throw projectiles back, sim/projectile.ts).
   * A blocked hit (blockStun) makes every one of them flex.
   */
  guard(v: FighterView, x: number, y: number, time: number): void {
    const f = v.fighter, d = f.facing, level = formLevel(f), g = this.front;
    const flex = f.blockStun > 0 ? Math.min(1, f.blockStun / .12) : 0;
    const skin = v.lookFor(level).skin;
    const px = Math.round(x), py = Math.round(y);
    if (level === 0) {
      // a thin rubber film bows out in front of the crossed arms, and rebounds on a hit
      const bow = 2 + flex * 4 + Math.sin(time * 9) * .6;
      g.lineStyle(1, 0xfff4e0, .28 + flex * .5);
      let prev: Point | null = null;
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const p = { x: Math.round(px + d * (9 + Math.sin(t * Math.PI) * bow)), y: Math.round(py - 29 + t * 26) };
        if (prev) g.lineBetween(prev.x, prev.y, p.x, p.y);
        prev = p;
      }
    } else if (level === 1) {
      // Gear Second: the blood pumps and steam streams off the shoulders and back
      for (let i = 0; i < 7; i++) {
        const k = ((time * 1.6 + i * .31) % 1);
        const side = i % 2 ? 1 : -1;
        const sx = px - d * (3 + (i % 3) * 3) + side * (1 + k * 2), sy = py - 18 - k * 20;
        g.fillStyle(0xffe9ee, (1 - k) * .75).fillRect(Math.round(sx), Math.round(sy), k < .5 ? 2 : 3, k < .5 ? 2 : 1);
      }
      g.lineStyle(1, 0xff9aa8, .35 + flex * .4).lineBetween(px + d * 7, py - 26, px + d * 7, py - 6);
    } else if (level === 2) {
      // Gear Third: one arm swells into a fist as big as a shield, held across the body
      const swell = 1 + flex * .12 + Math.sin(time * 7) * .04;
      this.limb(g, px + d * 2, py - 21, d, 0, d, 6, 5, skin, false, 0, 1);
      this.fist(g, px + d * 13, py - 18, d, 0, d, 8 * swell, skin, false, 1);
      g.lineStyle(1, 0xfffdf3, .55 + flex * .3);
      for (let i = -1; i <= 1; i++) g.lineBetween(px + d * 5, py - 30 + i * 4, px + d * 9, py - 30 + i * 4);
    } else if (level === 3) {
      this.balloon(v, px, py, time, flex);
    } else {
      this.rubberFloor(v, px, py, time, flex);
    }
  }

  /**
   * Gear Fourth's guard: the whole body blows up like a glossy black balloon (FighterView.puffAmount) and the tummy
   * rebounds on every blocked hit and reflected shot (FighterView.bellyBounce: a damped spring, + = pushed forward).
   */
  private balloon(v: FighterView, px: number, py: number, time: number, flex: number): void {
    const f = v.fighter, d = f.facing, g = this.front;
    const p = v.puffAmount, b = v.bellyBounce;
    if (p < 0.03) return;
    const ease = 1 - (1 - p) * (1 - p);
    const wob = Math.sin(time * 7) * 0.02 * p;
    const rx = (6 + 10.5 * ease) * (1 + b * 0.2 + wob);
    const ry = (7 + 6.5 * ease) * (1 - b * 0.14 - wob);
    const cx = px + d * (1 + 2 * ease + b * 1.5), cy = py - 12.5 - ease * 0.5;
    const N = 28;
    // the belly pushes out toward the front when it rebounds (b > 0) and sinks in when it is squashed (b < 0)
    const ring = (kx: number, ky: number, dx = 0, dy = 0): Point[] => {
      const out: Point[] = [];
      for (let i = 0; i < N; i++) {
        const a = i / N * Math.PI * 2;
        const front = Math.max(0, Math.cos(a) * d);
        out.push({ x: cx + dx + Math.cos(a) * rx * kx + d * front * b * 3 * kx, y: cy + dy + Math.sin(a) * ry * ky });
      }
      return out;
    };
    g.fillStyle(0x000000, 0.28 * ease).fillEllipse(Math.round(cx), py, Math.round(rx * 1.8), 3);
    this.polygon(g, ring(1.1, 1.14), 0x0e0a14, 1);
    this.polygon(g, ring(1, 1), 0x2b2338, 0.99);
    // the lower half falls into shadow, the rim lights up red where the Haki shines through
    this.polygon(g, ring(0.88, 0.5, -d * rx * 0.1, ry * 0.45), 0x171220, 0.85);
    const rim: Point[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = (-0.42 + i / 12 * 0.84) * Math.PI;
      rim.push({ x: Math.round(cx + d * Math.cos(a) * rx * 0.97 + d * Math.max(0, Math.cos(a)) * b * 3), y: Math.round(cy + Math.sin(a) * ry * 0.97) });
    }
    g.lineStyle(1, 0xc94860, 0.7 + flex * 0.3).strokePoints(rim, false);
    // gloss: a pale crescent and a glint on the upper front, sliding a little as the belly bounces
    const gx = cx + d * rx * (0.3 + b * 0.08), gy = cy - ry * 0.42;
    this.polygon(g, [{ x: gx - 3, y: gy + 1 }, { x: gx, y: gy - 1.5 }, { x: gx + 4, y: gy - 1 }, { x: gx + 2, y: gy + 0.5 }, { x: gx - 1, y: gy + 1.5 }], 0xfff0f2, 0.78);
    g.fillStyle(0xffffff, 0.95).fillRect(Math.round(gx + d * 3), Math.round(gy - 2), 1, 1);
    // Haki veins and a navel
    g.lineStyle(1, 0x7b354a, 0.85);
    for (const k of [-0.3, 0.05, 0.4]) g.lineBetween(Math.round(cx + d * rx * 0.1), Math.round(cy + ry * k), Math.round(cx + d * rx * 0.62), Math.round(cy + ry * (k + 0.1)));
    g.fillStyle(0x0b0810, 1).fillRect(Math.round(cx + d * rx * 0.5), Math.round(cy + ry * 0.2), 2, 2);
    // the tied nozzle at the back, and its string
    const nx = cx - d * rx * 1.02, ny = cy + ry * 0.45;
    this.polygon(g, [{ x: nx + d * 1, y: ny - 2 }, { x: nx - d * 3, y: ny }, { x: nx + d * 1, y: ny + 2 }], 0xc94860, 1);
    g.lineStyle(1, 0xc94860, 0.8).lineBetween(Math.round(nx - d * 3), Math.round(ny), Math.round(nx - d * 5), Math.round(ny + 3 + Math.sin(time * 9)));
    // a rebound throws a ripple and stretch marks across the skin
    const mag = Math.min(1, Math.abs(b));
    if (mag > 0.12) {
      g.lineStyle(1, 0xffd7dd, mag * 0.65).strokePoints(ring(1.12 + mag * 0.12, 1.14 + mag * 0.12), true);
      for (const k of [-0.5, 0, 0.5]) {
        const ax = cx + d * rx * (0.55 + 0.1 * Math.cos(k)), ay = cy + ry * k * 0.9;
        g.lineStyle(1, 0xfff4cf, mag * 0.7).lineBetween(Math.round(ax), Math.round(ay), Math.round(ax + d * (3 + mag * 4)), Math.round(ay + k * 3));
      }
    }
    if (flex > 0) this.polygon(g, ring(1, 1), 0xffffff, flex * 0.22);
  }

  /** Gear Fifth's guard: the ground bulges up in front of him like a sheet of rubber and wobbles, then snaps on a reflect. */
  private rubberFloor(v: FighterView, px: number, py: number, time: number, flex: number): void {
    const f = v.fighter, d = f.facing, g = this.front;
    const rise = Math.min(1, f.stateTime / .14);
    const height = 30 * (1 - (1 - rise) * (1 - rise));
    const sway = Math.sin(time * 8) * 1.4 + flex * 6;
    const N = 9;
    const edge = (t: number) => {
      const bow = 7 + Math.sin(t * Math.PI * .85) * 8 * rise + flex * 3 * Math.sin(t * Math.PI);
      const ahead = bow + sway * t * t;
      const half = (4.6 - 1.6 * t) / 2;
      return { y: py - t * height, inner: px + d * (ahead - half), outer: px + d * (ahead + half) };
    };
    // the dirt and tiles the sheet is made of, pushed up around its foot
    const foot = edge(0);
    this.polygon(g, [{ x: foot.inner - d * 5, y: py }, { x: foot.inner - d * 1, y: py - 3 }, { x: foot.outer + d * 5, y: py - 2 }, { x: foot.outer + d * 9, y: py }], 0x7a6247, .9);
    g.lineStyle(1, 0xb99b72, .9).lineBetween(Math.round(foot.inner - d * 2), py - 3, Math.round(foot.outer + d * 5), py - 2);
    for (let i = 0; i < N; i++) {
      const a = edge(i / N), b = edge((i + 1) / N);
      const quad = (grow: number): Point[] => [{ x: a.inner - d * grow, y: a.y }, { x: b.inner - d * grow, y: b.y }, { x: b.outer + d * grow, y: b.y }, { x: a.outer + d * grow, y: a.y }];
      this.polygon(g, quad(1), 0x4a3a2b, .95);
      this.polygon(g, quad(0), i < 3 ? 0xcdb48a : i % 2 ? 0xf4efe6 : 0xe6dcc9, .96);
      // the sheen travels up the stretched surface
      const glint = ((time * 1.3) % 1) * N;
      if (Math.abs(i - glint) < 1.2) this.polygon(g, quad(0), 0xffffff, .55);
      g.lineStyle(1, 0xffffff, .5).lineBetween(Math.round(a.inner + d * 1), Math.round(a.y), Math.round(b.inner + d * 1), Math.round(b.y));
    }
    const top = edge(1);
    g.fillStyle(0xfff9ec, .95).fillRect(Math.round(Math.min(top.inner, top.outer)), Math.round(top.y) - 1, 4, 1);
    // cracks fan out along the floor from where it was pulled up
    g.lineStyle(1, 0x4a3a2b, .8);
    for (const k of [1, 2]) g.lineBetween(Math.round(foot.outer + d * (6 + k * 3)), py, Math.round(foot.outer + d * (9 + k * 5)), py);
    if (flex > 0) {
      g.fillStyle(0xffffff, flex * .55).fillRect(Math.round(Math.min(foot.inner, top.outer)) - 1, Math.round(py - height * .5) - 3, 5, 6);
      g.lineStyle(1, 0xfff4cf, flex * .8);
      for (let i = -1; i <= 1; i++) g.lineBetween(Math.round(px + d * 14), Math.round(py - height * .5) + i * 4, Math.round(px + d * (19 + flex * 5)), Math.round(py - height * .5) + i * 6);
    }
  }

  gatling(v: FighterView, x: number, y: number, previewReach: number): void {
    const f = v.fighter, level = formLevel(f), style = moveLook('luffy', level);
    const stats = heroDef('luffy')!.second.gatling!;
    const count = level === 1 ? 5 : level >= 3 ? 4 : 3;
    const skin = v.lookFor(level).skin;
    const haki = level === 3;
    const radius = level === 2 || haki ? 4.5 : level === 4 ? 3.5 : 2.5;
    const fade = Math.min(1, Math.max(0, (stats.time + .12 - f.stateTime) / .12));
    for (let i = 0; i < count; i++) {
      const phase = (f.stateTime / (stats.every * count) + i / count) % 1;
      const extension = phase < .34 ? phase / .34 : Math.max(0, (1 - phase) / .66);
      const len = 5 + gatlingReach(f) * previewReach * extension;
      const lane = (i - (count - 1) / 2) * (level === 2 ? 5.5 : 4);
      const sx = x + f.facing * 2, sy = y - SHOULDER_Y_STAND + 1;
      const dy = lane / Math.max(20, len), dx = Math.sqrt(Math.max(.75, 1 - dy * dy)) * f.facing;
      const alpha = fade * (phase < .45 ? .95 : .2 + .4 * extension);
      const bend = style.rubber === 'cartoon' ? Math.sin(phase * Math.PI * 2) * 4 : 0;
      this.limb(this.front, sx, sy, dx, dy, f.facing, len, radius, skin, haki, bend, alpha);
      this.fist(this.front, sx + dx * len, sy + dy * len, dx, dy, f.facing, radius, skin, haki, alpha);
      if (extension > .6) this.front.lineStyle(1, haki ? 0xdc5970 : 0xffeddf, alpha * .6).lineBetween(Math.round(sx + dx * (len - 15)), Math.round(sy + dy * len - radius - 2), Math.round(sx + dx * (len - 5)), Math.round(sy + dy * len - radius - 2));
    }
  }
}
