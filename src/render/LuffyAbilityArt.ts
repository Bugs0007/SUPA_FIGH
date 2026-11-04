import type Phaser from 'phaser';
import { hexToNum, shade } from '../art/palette';
import { moveLook } from '../art/heroMoves';
import { heroDef, JET_BAZOOKA } from '../sim/data/heroes';
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
  private fist(g: Graphics, x: number, y: number, dx: number, dy: number, side: number, r: number, skin: string, haki: boolean, alpha: number): void {
    const px = -dy * side;
    const py = dx * side;
    const point = (u: number, v: number, scale = r): Point => ({ x: x + dx * u * scale + px * v * scale, y: y + dy * u * scale + py * v * scale });
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
    const bend = style.rubber === 'cartoon' ? Math.sin(f.stateTime * 16) * Math.min(11, len * .1) : style.rubber === 'haki' ? Math.sin(f.stateTime * 20) * Math.min(4, len * .035) : 0;
    const skin = v.lookFor(level).skin;
    this.limb(g, sx, sy, dx, dy, f.facing, len, radius, skin, haki, bend, 1);
    this.fist(g, sx + dx * len, sy + dy * len, dx, dy, f.facing, radius, skin, haki, 1);
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
   * Hold BLOCK, one guard per gear: a rubber bounce, steam, an inflated fist shield, a Haki-armoured Boundman body and, in
   * Gear Fifth, the floor itself pulled up like a rubber sheet (it throws projectiles back, sim/projectile.ts).
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
      // Gear Fourth, Boundman: the whole body puffs up inside a shell of black Haki
      const breathe = 1 + Math.sin(time * 6) * .035 + flex * .08;
      const shell: Point[] = [];
      for (let i = 0; i < 20; i++) {
        const a = i / 20 * Math.PI * 2;
        shell.push({ x: px + Math.cos(a) * 12.5 * breathe + d * 1.5, y: py - 17 + Math.sin(a) * 17.5 * breathe });
      }
      this.polygon(this.back, shell, 0x14101f, .62);
      g.lineStyle(1, 0xc94860, .75 + flex * .25).strokePoints(shell.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) })), true);
      g.lineStyle(1, 0x7b354a, .8);
      for (const k of [-6, 0, 6]) g.lineBetween(px + d * 4, py - 17 + k - 4, px + d * 10, py - 17 + k);
      g.fillStyle(0xef7980, .35 + flex * .4).fillRect(px + d * 7 - 1, py - 31, 2, 6);
    } else {
      this.rubberFloor(v, px, py, time, flex);
    }
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
