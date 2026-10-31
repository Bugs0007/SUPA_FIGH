import type Phaser from 'phaser';
import { hexToNum, shade } from '../art/palette';
import { moveLook } from '../art/heroMoves';
import { heroDef } from '../sim/data/heroes';
import { SHOULDER_Y_STAND } from '../sim/constants';
import type { FighterView } from './FighterView';
import { formLevel } from './formLevel';

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
      const len = 5 + stats.range * previewReach * extension;
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
