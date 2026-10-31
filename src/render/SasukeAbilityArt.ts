import type Phaser from 'phaser';
import { moveLook } from '../art/heroMoves';
import { HEROES } from '../sim/data/heroes';
import type { Fighter } from '../sim/fighter';
import type { Bullet } from '../sim/projectile';
import { formLevel } from './formLevel';
import { AvatarArt } from './AvatarArt';
import { dashDir, rasenganPoint, usesAmaterasu } from '../sim/hero';
import { arrowSprite, FIRE, fireballSprite, heading } from '../art/fireSprites';
import { paintRuns } from '../art/pixelRaster';
type G = Phaser.GameObjects.Graphics;
/** the fireball gathering at Sasuke's mouth (radius from r0 to r0 + grow over the windup), its flicker rate and embers */
const FIRE_CAST = { r0: 1.5, grow: 2.5, ahead: 5, up: 19, fps: 14, embers: 5 };
/** Match and gallery share this art. All positions follow the real fighter / projectile. */
export class SasukeAbilityArt {
  private avatar: AvatarArt;
  constructor(private back: G, private front: G) { this.avatar = new AvatarArt(back,front); }
  private bolt(g: G, x: number, y: number, dx: number, dy: number, color: number, time: number, seed: number, width = 1): void {
    const len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    g.lineStyle(width, color, 0.95).beginPath().moveTo(Math.round(x), Math.round(y));
    for (let i = 1; i <= 7; i++) {
      const k = i / 7;
      const jitter = i === 7 ? 0 : Math.sin(seed * 3.4 + i * 9.7 + Math.floor(time * 20)) * 3;
      g.lineTo(Math.round(x + dx * k + nx * jitter), Math.round(y + dy * k + ny * jitter));
    }
    g.strokePath();
  }
  fighter(f: Fighter, x: number, y: number, time: number): void {
    const lv = formLevel(f), d = f.facing, look = moveLook('sasuke', lv), g = this.front;
    const special = f.state === 'special';
    if (lv >= 3 && f.state==='normal') {
      // A subtle spectral rib guard leaves the fighter silhouette readable.
      this.back.lineStyle(1, 0xa77adc, 0.32);
      for (let i = 0; i < 3; i++) {
        const yy=y-10-i*5;
        this.back.strokePoints([{x:x-d*12,y:yy-3},{x:x-d*4,y:yy},{x:x+d*11,y:yy-3},{x:x+d*13,y:yy+1}],false);
      }
    }
    if (!special)
      return;
    if (f.specialKind === 'rasengan') {
      const windup = HEROES.sasuke.base.dash!.windup;
      const forming = f.stateTime < windup;
      // the lightning sits where the sim's orb is (aimed in any of 8 directions)
      const dir = dashDir(f), px = -dir.y, py = dir.x;
      const orb = rasenganPoint({ ...f, x, y } as Fighter);
      const palmX = orb.x, palmY = orb.y;
      const power = forming ? Math.max(0.2, f.stateTime / windup) : f.recoverAt ? 0.4 : 1;
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4 + Math.sin(time * 13 + k) * .3;
        const len = (7 + (k % 3) * 3 + lv) * power;
        this.bolt(g, palmX, palmY, Math.cos(a) * len, Math.sin(a) * len, k % 2 ? look.core : look.rim, time, k, k % 3 ? 1 : 2);
      }
      g.fillStyle(look.core, .95).fillRect(Math.round(palmX - 2), Math.round(palmY - 2), 4, 4);
      if (!forming && !f.recoverAt) {
        // streaks trail straight back along the dash
        for (let i = 0; i < 3; i++) {
          const s = (i - 1) * 7, len = 24 + i * 6, wob = Math.sin(time * 28 + i) * 4;
          this.bolt(this.back, x - dir.x * 3 + px * s, y - 12 - dir.y * 3 + py * s, -dir.x * len + px * wob, -dir.y * len + py * wob, look.rim, time, i + 10);
        }
      }
    }
    else if (f.specialKind === 'fireball' && f.charge !== -2) {
      const k = Math.min(1, f.stateTime / (usesAmaterasu(f)?HEROES.sasuke.second.amaterasu!.windup:HEROES.sasuke.second.fireball!.windup));
      if(usesAmaterasu(f)) {
        const eyeX=x+d*3,eyeY=y-23;
        g.fillStyle(0xf24468,.6+k*.4).fillRect(Math.round(eyeX),Math.round(eyeY),2,1);
        g.lineStyle(1,0x77253e,.9).lineBetween(eyeX+d,eyeY+1,eyeX+d*2,eyeY+5);
        for(let i=0;i<3;i++)g.lineStyle(1,0xc76a9b,.3+k*.4).lineBetween(eyeX+d*(3+i*2),eyeY-2+i,eyeX+d*(7+i*3),eyeY-3+i);
        return;
      }
      // the jutsu gathers at the mouth as a small pixel fireball that grows until the real one is spat out
      const r = FIRE_CAST.r0 + k * FIRE_CAST.grow;
      const ball = fireballSprite(r, heading(d, 0), Math.floor(time * FIRE_CAST.fps));
      paintRuns(g, ball.baked, Math.round(x + d * (FIRE_CAST.ahead + r)) + ball.ox, Math.round(y - FIRE_CAST.up) + ball.oy);
    }
    else if (f.specialKind === 'bomb') {
      const since = f.charge === -2 ? f.stateTime - HEROES.sasuke.super.bomb!.windup : -1;
      const strength = f.charge === -2 ? Math.max(0, 1 - since / .3) : Math.min(1, f.charge + .35);
      if (lv >= 3)
        this.avatar.susanoo(x,y,d,lv,strength,time,f.charge,Math.max(0,since));
      if (f.charge === -2)
        return;
      if(lv>=3)return;
      const length = 23 * Math.max(.1,f.charge);
      const ax = x + d * 9, ay = y - 17;
      for (let i = 0; i < 3; i++)
        this.bolt(g, ax, ay, d * length, Math.sin(time * 16 + i) * 2, i ? look.rim : look.core, time, i, i ? 1 : 2);
      g.lineStyle(1, 0xffffff, .9).lineBetween(ax, ay, ax + d * length, ay);
    }
  }
  projectile(g: G, b: Bullet, x: number, y: number, time: number): void {
    const speed = Math.hypot(b.vx, b.vy) || 1, dx = b.vx / speed, dy = b.vy / speed;
    const nx = -dy, ny = dx, size = b.size;
    const point = (a: number, r: number) => ({ x: x + dx * a + nx * r, y: y + dy * a + ny * r });
    if (b.weapon === 'sasuke:second') {
      // a pixel sprite as big as the hitbox, flickering through four frames, shedding embers that drop and cool
      const cx = Math.round(x), cy = Math.round(y);
      for (let i = 0; i < FIRE_CAST.embers; i++) {
        const phase = (time * 3 + i * 0.29) % 1, side = (i % 2 ? 1 : -1) * size * (0.25 + (i % 3) * 0.2);
        const p = point(-size * (1.1 + phase * 1.8), side);
        const c = FIRE.embers[Math.min(FIRE.embers.length - 1, Math.floor(phase * FIRE.embers.length))];
        g.fillStyle(c, 1).fillRect(Math.round(p.x), Math.round(p.y + phase * phase * 6), phase < 0.35 ? 2 : 1, phase < 0.35 ? 2 : 1);
      }
      const ball = fireballSprite(size, heading(dx, dy), Math.floor(time * FIRE_CAST.fps));
      paintRuns(g, ball.baked, cx + ball.ox, cy + ball.oy);
    }
    else if (size > 5.5) {
      // Susanoo's arrow
      const arrow = arrowSprite(size, heading(dx, dy), Math.floor(time * 20));
      paintRuns(g, arrow.baked, Math.round(x) + arrow.ox, Math.round(y) + arrow.oy);
    }
    else {
      // the lower forms: a Chidori spear of lightning
      const c = 0x83ccff, length = 22 + size * 2;
      g.lineStyle(size * .9, c, .18).lineBetween(x - dx * length * 1.5, y - dy * length * 1.5, x, y);
      g.lineStyle(2, c).lineBetween(x - dx * length, y - dy * length, x + dx * size, y + dy * size);
      g.fillStyle(c).fillPoints([point(size * 1.5, 0), point(-size, -size), point(-size * .5, 0), point(-size, size)], true);
      g.lineStyle(1, 0xf9edff).lineBetween(x - dx * length, y - dy * length, x + dx * size, y + dy * size);
      this.bolt(g, x, y, -dx * length, -dy * length, c, time, 18);
    }
  }
}
