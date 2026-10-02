import { hexToNum, P } from '../art/palette';
import { audio } from '../audio/AudioManager';
import { VIEW_W } from '../game/display';
import { settings } from '../game/settings';
import { TILE } from '../sim/constants';
import { weaponDef } from '../sim/data/weapons';
import type { SimEvent } from '../sim/events';
import { activeWeapon, gunGeometry } from '../sim/fighter';
import { TK } from '../sim/map/tiles';
import type { World } from '../sim/world';
import type { CameraDirector } from './CameraDirector';
import type { WorldRenderer } from './WorldRenderer';

export type UiEvent =
  | { t: 'kill'; killer: number; victim: number; weapon: string; cause: string; env: boolean }
  | { t: 'announce'; text: string; color: number };

const IMPACT_SOUND: Record<string, string> = { wood: 'impactWood', dirt: 'impactWood' };

/** Shot sound per weapon (default: pistol). */
const SHOT_SOUND: Record<string, string> = {
  shotgun: 'shotgun',
  revolver: 'magnum',
  uzi: 'smg',
  smg: 'smg',
  rifle: 'rifle',
  sniper: 'sniper',
  minigun: 'minigun',
  flamer: 'flame',
  bazooka: 'rocket',
  flaregun: 'flare',
};

const SWING_PITCH: Record<string, number> = { knife: 1.4, machete: 1.1, bat: 0.85, pipe: 0.9, sledge: 0.6 };

const POWERUP_TEXT: Record<string, [string, string]> = {
  speed: ['SPEED!', P.yellow],
  strength: ['STRENGTH!', P.red2],
  bulletTime: ['BULLET TIME!', P.glass1],
};

export function weaponLabel(id: string): string {
  const special: Record<string, string> = {
    kick: 'KICK',
    knee: 'KNEE',
    throw: 'THROW',
    bodyslam: 'BODYSLAM',
    fall: 'GRAVITY',
    water: 'WATER',
    wall: 'WALL',
    floor: 'FLOOR',
    fire: 'FIRE',
    barrel: 'BARREL',
    crate: 'CRATE',
    gas: 'GAS CAN',
    suddendeath: 'SUDDEN DEATH',
  };
  return special[id] ?? weaponDef(id).name;
}

/** Maps sim events to particles, sounds, shake, hit-stop and UI events. */
export class Juice {
  /** seconds of hit-stop requested (the frame loop freezes the sim) */
  hitstop = 0;
  ui: UiEvent[] = [];

  constructor(
    private r: WorldRenderer,
    private cam: CameraDirector,
  ) {}

  private pan(x: number): number {
    return Math.max(-0.8, Math.min(0.8, ((x - this.cam.x) / (VIEW_W / 2 / this.cam.z)) * 0.8));
  }

  private sfx(id: string, x: number, vol = 1, pitch = 1): void {
    audio.play(id, { volume: vol, pan: this.pan(x), pitch });
  }

  handle(e: SimEvent, w: World): void {
    const fx = this.r.fx;
    fx.gore = settings.gore;
    switch (e.t) {
      case 'shot': {
        const f = w.fighters[e.f];
        const def = weaponDef(e.weapon);
        const big = (def.gun?.pellets ?? 1) > 1 || def.hold === 'rifle';
        if (e.weapon !== 'flamer') fx.muzzle(e.x, e.y, e.angle, big);
        if (def.casing) {
          const g = gunGeometry(f, activeWeapon(f));
          fx.casing(g.handX, g.handY - 1, f.facing, e.weapon === 'shotgun');
        }
        if (e.weapon === 'bazooka') fx.smoke(e.x - Math.cos(e.angle) * 16, e.y - Math.sin(e.angle) * 16, 6, 0x8a8698);
        this.sfx(SHOT_SOUND[e.weapon] ?? 'pistol', e.x, e.weapon === 'flamer' ? 0.5 : 1);
        this.cam.addTrauma(def.gun?.shake ?? 0.1);
        break;
      }
      case 'hit': {
        const heavy = e.kind === 'kick' || e.damage >= 10 || e.kind === 'bodyslam' || e.kind === 'splat';
        if (e.kind === 'fire' || e.kind === 'drain') {
          if (!e.corpse) this.r.views[e.victim]?.onHit();
          break;
        }
        if (e.kind === 'explosion') {
          fx.blood(e.x, e.y, e.dirX, e.dirY, e.corpse ? 4 : 10);
        } else if (e.kind === 'bullet') {
          fx.blood(e.x, e.y, e.dirX, e.dirY, e.corpse ? 3 : 6);
          fx.sparks(e.x, e.y, -e.dirX, -e.dirY, 2, 0xffffff, 90);
          if (!e.corpse) this.sfx('hurt', e.x, 0.5, 1.2);
        } else if (e.kind === 'melee' || e.kind === 'kick' || e.kind === 'throw' || e.kind === 'bodyslam') {
          fx.hitStar(e.x, e.y, heavy);
          fx.blood(e.x, e.y, e.dirX || 1, e.dirY - 0.3, heavy ? 6 : 3);
          this.sfx(e.kind === 'kick' || heavy ? 'kick' : 'punch', e.x);
          if (heavy && !e.corpse) this.hitstop = Math.max(this.hitstop, 0.06);
        }
        if (!e.corpse) {
          this.cam.addTrauma(heavy ? 0.28 : e.kind === 'bullet' ? 0.08 : 0.14);
          if (settings.damageNumbers && e.damage > 0) {
            const col = e.damage >= 15 ? hexToNum(P.orange) : hexToNum(P.yellow2);
            this.r.floatText(e.x + (Math.random() - 0.5) * 6, e.y - 6, String(Math.round(e.damage)), col);
          }
        }
        break;
      }
      case 'kill': {
        fx.blood(e.x, e.y, 0, -1, 16);
        this.sfx('death', e.x);
        this.cam.addTrauma(0.45);
        this.ui.push({ t: 'kill', killer: e.killer, victim: e.victim, weapon: e.weapon, cause: e.cause, env: e.env });
        break;
      }
      case 'impact': {
        const metal = e.material === 'metal';
        fx.sparks(e.x, e.y, e.nx || (Math.random() - 0.5), e.ny || -0.5, metal ? 6 : 3, metal ? 0xfff4a0 : 0xd8d0c0, metal ? 180 : 110);
        if (!metal) fx.dust(e.x + e.nx * 2, e.y + e.ny * 2 + 2, 1, 15);
        this.sfx(IMPACT_SOUND[e.material] ?? 'impact', e.x, 0.6);
        break;
      }
      case 'ricochet':
        fx.sparks(e.x, e.y, 0, -1, 8, 0xfff4a0, 220);
        this.sfx('ricochet', e.x, 0.7);
        break;
      case 'splinter':
        fx.chips(e.x, e.y, 3);
        this.sfx('impactWood', e.x, 0.5);
        break;
      case 'tileBreak': {
        const x = e.tx * TILE + 8;
        const y = e.ty * TILE + 8;
        if (e.kind === TK.GLASS) {
          fx.shards(x, y, 14);
          this.sfx('glass', x);
        } else {
          fx.chips(x, y, 8);
          this.sfx('break', x);
        }
        this.cam.addTrauma(0.1);
        break;
      }
      case 'jump':
        this.r.views[e.f]?.onJump();
        if (e.wall) {
          fx.dust(e.x, e.y, 3, 30);
          this.sfx('jump', e.x, 0.7, 1.15);
        } else if (e.air) {
          fx.motes(e.x, e.y, 5, 0xffffff);
          this.sfx('jump', e.x, 0.6, 1.3);
        } else {
          fx.dust(e.x, e.y, 2, 25);
          this.sfx('jump', e.x, 0.6);
        }
        break;
      case 'sprint': {
        const f = w.fighters[e.f];
        fx.dust(f.x, f.y, 3, 50);
        this.sfx('swing', f.x, 0.6, 0.7);
        break;
      }
      case 'land':
        this.r.views[e.f]?.onLand(e.speed);
        fx.dust(e.x, e.y, Math.min(6, Math.floor(e.speed / 90)), 35 + e.speed * 0.05);
        this.sfx('land', e.x, Math.min(1, e.speed / 400));
        break;
      case 'swing':
        this.sfx('swing', w.fighters[e.f].x, 0.8, (SWING_PITCH[e.weapon] ?? 1) + e.step * 0.1);
        break;
      case 'kick':
        this.sfx('swing', w.fighters[e.f].x, 0.9, 0.8);
        break;
      case 'roll': {
        const f = w.fighters[e.f];
        fx.dust(f.x, f.y, 3, 30);
        this.sfx('roll', f.x, 0.7);
        break;
      }
      case 'dive':
        this.sfx('swing', w.fighters[e.f].x, 0.8, 0.7);
        break;
      case 'ledge':
        this.sfx('grab', w.fighters[e.f].x, 0.4, 1.4);
        break;
      case 'pickup':
        this.sfx('pickup', e.x, 0.8);
        this.r.floatText(e.x, e.y - 14, '+' + weaponLabel(e.weapon), 0xffffff);
        break;
      case 'toss':
        this.sfx('toss', w.fighters[e.f].x);
        break;
      case 'empty': {
        const f = w.fighters[e.f];
        this.sfx('empty', f.x);
        this.r.floatText(f.x, f.y - 30, 'EMPTY!', hexToNum(P.red2));
        break;
      }
      case 'cycle':
        this.sfx('cycle', w.fighters[e.f].x, 0.7);
        break;
      case 'grab':
        this.sfx('grab', w.fighters[e.f].x);
        break;
      case 'throw':
        this.sfx('throw', w.fighters[e.f].x);
        this.cam.addTrauma(0.12);
        break;
      case 'escape':
        this.sfx('swing', w.fighters[e.f].x, 0.7, 1.3);
        break;
      case 'bonk':
        fx.hitStar(e.x, e.y, false);
        this.sfx('bonk', e.x);
        break;
      case 'splat':
        fx.blood(e.x, e.y, 0, -1, 10);
        fx.dust(e.x, e.y, 3, 40);
        this.sfx('splat', e.x);
        this.cam.addTrauma(0.3);
        this.hitstop = Math.max(this.hitstop, 0.05);
        break;
      case 'itemLand':
        this.sfx('impact', e.x, 0.25, 1.6);
        break;
      case 'weaponSpawn':
        fx.sparks(e.x, e.y - 8, 0, -1, 10, 0xffffff, 80);
        this.sfx('spawn', e.x, 0.6);
        break;
      case 'corpseLand':
        fx.dust(e.x, e.y, 3, 40);
        this.sfx('thud', e.x, Math.min(1, e.speed / 300));
        break;
      case 'explosion': {
        const big = e.radius >= 45;
        fx.explosion(e.x, e.y, e.radius);
        this.sfx(big ? 'explosion' : 'explosionSmall', e.x);
        this.cam.addTrauma(e.shake);
        this.hitstop = Math.max(this.hitstop, big ? 0.08 : 0.05);
        break;
      }
      case 'ignite': {
        const f = w.fighters[e.f];
        this.sfx('ignite', f.x, 0.7);
        if (f.alive) this.r.floatText(f.x, f.y - 30, 'BURNING!', hexToNum(P.orange));
        break;
      }
      case 'extinguish': {
        const f = w.fighters[e.f];
        fx.smoke(f.x, f.y - 10, 4, 0x8a8698);
        this.sfx('hiss', f.x, 0.6);
        break;
      }
      case 'tileIgnite':
        this.sfx('ignite', e.tx * TILE + 8, 0.35, 0.8);
        break;
      case 'propHit':
        if (e.type === 'crate') {
          fx.chips(e.x, e.y, 3);
          this.sfx('impactWood', e.x, 0.7);
        } else {
          fx.sparks(e.x, e.y, 0, -1, 4, 0xfff4a0, 140);
          this.sfx('clang', e.x, 0.6);
        }
        break;
      case 'propBreak':
        if (e.type === 'crate') {
          fx.chips(e.x, e.y, 16);
          fx.dust(e.x, e.y + 6, 4, 40);
          this.sfx('crate', e.x);
          this.cam.addTrauma(0.15);
        }
        break;
      case 'pin':
        this.sfx('pin', w.fighters[e.f].x, 0.8);
        break;
      case 'throwOut':
        this.sfx('toss', w.fighters[e.f].x, 1, 0.9);
        break;
      case 'stick':
        this.sfx('stick', e.x, 0.8);
        break;
      case 'mineArm':
        this.sfx('beep', e.x, 0.7);
        break;
      case 'mineTrigger':
        this.sfx('beep2', e.x);
        this.r.floatText(e.x, e.y - 10, '!', hexToNum(P.red2), true);
        break;
      case 'burst':
        fx.shards(e.x, e.y, 10);
        for (let i = 0; i < 14; i++) fx.flame(e.x + (Math.random() - 0.5) * 20, e.y, 1.5, (Math.random() - 0.5) * 80);
        this.sfx('glass', e.x);
        this.sfx('ignite', e.x);
        this.cam.addTrauma(0.2);
        break;
      case 'powerup': {
        const [text, col] = POWERUP_TEXT[e.kind] ?? ['POWER!', P.white];
        fx.motes(e.x, e.y - 6, 14, hexToNum(col));
        this.sfx('powerup', e.x);
        this.r.floatText(e.x, e.y - 22, text, hexToNum(col), true);
        if (e.kind === 'bulletTime') {
          this.ui.push({ t: 'announce', text: 'BULLET TIME', color: hexToNum(col) });
          audio.play('slowmo');
        }
        break;
      }
      case 'heal': {
        const f = w.fighters[e.f];
        fx.motes(f.x, f.y - 10, 12, hexToNum(P.green2));
        this.sfx('heal', f.x);
        this.r.floatText(f.x, f.y - 30, '+' + Math.round(e.amount), hexToNum(P.green2), true);
        break;
      }
      case 'respawn':
        fx.sparks(e.x, e.y - 10, 0, -1, 14, 0xffffff, 120);
        fx.motes(e.x, e.y - 8, 8, 0xffffff);
        this.sfx('spawn', e.x);
        break;
      case 'spinUp':
        this.sfx('spinup', w.fighters[e.f].x, 0.8);
        break;
      case 'weaponBreak':
        fx.chips(e.x, e.y, 10);
        this.sfx('break', e.x);
        this.r.floatText(e.x, e.y - 10, 'BROKE!', 0xffffff);
        break;
    }
  }
}
