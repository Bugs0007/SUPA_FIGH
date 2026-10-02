import Phaser from 'phaser';
import type { Appearance } from '../art/appearance';
import { Art } from '../art';
import { ARM_LENGTHS, armFrame, BF, FRAME_META, HEAD } from '../art/fighterArt';
import { ARM_LONG, ARM_SHORT, ROLL_TIME } from '../sim/constants';
import { SLOT, weaponDef } from '../sim/data/weapons';
import { activeWeapon, type Fighter } from '../sim/fighter';

/** Rig pivot: body center, this many px above the feet. */
const RIG_Y = 11;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Visual puppet for one fighter. Reads sim state; never writes it. */
export class FighterView {
  readonly root: Phaser.GameObjects.Container;
  private rig: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Image;
  private head: Phaser.GameObjects.Image;
  private backArm: Phaser.GameObjects.Image;
  private frontArm: Phaser.GameObjects.Image;
  private weapon: Phaser.GameObjects.Image;
  private pack: Phaser.GameObjects.Image;
  private ghostImg: Phaser.GameObjects.Container;
  /** chaos modifier: 2x heads */
  bigHead = false;
  readonly tag: Phaser.GameObjects.BitmapText;
  private runPhase = 0;
  private climbPhase = 0;
  private squash = 0;
  private flash = 0;
  private lieAmount = 0;
  private lastHp: number;
  /** smoothed hp for the damage trail on the health bar */
  hpTrail: number;
  readonly color: number;

  constructor(
    scene: Phaser.Scene,
    readonly fighter: Fighter,
    look: Appearance,
    color: number,
    label: string,
  ) {
    const tex = Art.fighter(scene, look);
    this.color = color;
    this.root = scene.add.container(fighter.x, fighter.y);
    this.rig = scene.add.container(0, -RIG_Y);
    this.backArm = scene.add.image(0, 0, tex.arm, 0).setTint(0xb0a8c0);
    this.body = scene.add.image(0, RIG_Y, tex.body, BF.IDLE0).setOrigin(0.5, 1);
    this.head = scene.add.image(0, 0, tex.head, HEAD.NORMAL).setOrigin(8 / 16, 13 / 16);
    this.weapon = scene.add.image(0, 0, 'weapons').setVisible(false);
    const jf = Art.weapon('jetpack');
    this.pack = scene.add.image(-5, RIG_Y - 13, jf?.key ?? 'weapons', jf?.frame).setVisible(false);
    this.frontArm = scene.add.image(0, 0, tex.arm, 0);
    this.rig.add([this.pack, this.backArm, this.body, this.head, this.weapon, this.frontArm]);
    this.root.add(this.rig);
    this.root.setDepth(40);
    this.tag = scene.add.bitmapText(fighter.x, fighter.y - 34, 'smo', label.toUpperCase()).setOrigin(0.5, 1).setTint(color).setDepth(70);
    // ghost: a translucent, tinted copy of the body + head (Brawl, after death)
    this.ghostImg = scene.add.container(0, 0).setDepth(64).setVisible(false).setAlpha(0.5);
    this.ghostImg.add(scene.add.image(0, 0, tex.body, BF.FALL).setOrigin(0.5, 1).setTint(0xb0e0ff));
    const gm = FRAME_META[BF.FALL];
    this.ghostImg.add(scene.add.image(gm.neckX - 16, gm.neckY - 32, tex.head, HEAD.DEAD).setOrigin(8 / 16, 13 / 16).setTint(0xb0e0ff));
    this.lastHp = fighter.hp;
    this.hpTrail = fighter.hp;
  }

  onLand(speed: number): void {
    this.squash = Math.min(0.35, speed / 1200);
  }

  onJump(): void {
    this.squash = -0.2;
  }

  onHit(): void {
    this.flash = 0.07;
  }

  destroy(): void {
    this.root.destroy();
    this.tag.destroy();
    this.ghostImg.destroy();
  }

  private updateGhost(time: number): void {
    const f = this.fighter;
    const show = !f.alive && f.ghost;
    this.ghostImg.setVisible(show);
    if (!show) return;
    const bob = Math.sin(time * 3 + f.id) * 2;
    this.ghostImg
      .setPosition(Math.round(f.gx), Math.round(f.gy + 12 + bob))
      .setScale(f.facing, 1)
      .setAlpha(f.ghostCd <= 0 ? 0.55 + Math.sin(time * 8) * 0.15 : 0.35);
  }

  /** frame px -> rig-local px */
  private fp(x: number, y: number): [number, number] {
    return [x - 16, y - 32 + RIG_Y];
  }

  update(alpha: number, dt: number, time: number, simTime: number): void {
    const f = this.fighter;
    this.updateGhost(time);
    if (f.gone) {
      this.root.setVisible(false);
      this.tag.setVisible(false);
      return;
    }
    const x = lerp(f.px, f.x, alpha);
    const y = lerp(f.py, f.y, alpha);
    this.root.setVisible(true);

    if (f.hp < this.lastHp) this.onHit();
    this.lastHp = f.hp;
    this.hpTrail = this.hpTrail > f.hp ? Math.max(f.hp, this.hpTrail - dt * 60) : f.hp;

    // ---- choose body frame, arm angles, rig rotation
    let frame: number = BF.IDLE0;
    let front = 1.45;
    let back = 1.75;
    let frontLen = 0;
    let backLen = 0;
    let rigRot = 0;
    let lie = 0;
    let showWeapon = true;
    let weaponAngle: number | null = null;
    let headFrame: number = HEAD.NORMAL;
    let hideArms = false;
    let bodyRot = 0;
    const def = activeWeapon(f);
    const isGun = !!def.gun;
    const rifle = def.hold === 'rifle';
    const speed = Math.abs(f.vx);

    const gunIdle = () => {
      if (isGun) {
        front = 0.55;
        back = 0.55;
        frontLen = rifle ? 0 : 1;
        backLen = 1;
        weaponAngle = 0.55;
      }
    };

    switch (f.state) {
      case 'normal': {
        if (f.grounded) {
          if (speed > 15) {
            this.runPhase += (speed * dt) / 5.5;
            frame = BF.RUN0 + (Math.floor(this.runPhase) % 6);
            const s = Math.sin((this.runPhase / 6) * Math.PI * 2);
            front = Math.PI / 2 - s * 0.9;
            back = Math.PI / 2 + s * 0.9;
          } else {
            frame = Math.floor(time * 1.6) % 2 === 0 ? BF.IDLE0 : BF.IDLE1;
          }
        } else if (f.wallSlide !== 0) {
          frame = BF.FALL;
          front = -1.3;
          back = -1.7;
          frontLen = 1;
          backLen = 1;
        } else {
          frame = f.vy < 0 ? BF.JUMP : BF.FALL;
          front = f.vy < 0 ? -0.7 : -0.3 + Math.sin(time * 18) * 0.3;
          back = f.vy < 0 ? -2.3 : 3.8 + Math.sin(time * 18 + 1) * 0.3;
          // double jump: one quick front flip
          const flip = (simTime - f.airJumpTime) / 0.32;
          if (flip >= 0 && flip < 1) {
            frame = BF.TUMBLE;
            rigRot = flip * Math.PI * 2;
          }
        }
        gunIdle();
        break;
      }
      case 'crouch':
        frame = speed > 5 ? (Math.floor(time * 6) % 2 === 0 ? BF.CRAWL0 : BF.CRAWL1) : BF.CROUCH;
        front = 0.9;
        back = 1.3;
        gunIdle();
        break;
      case 'roll':
        frame = BF.ROLL;
        hideArms = true;
        showWeapon = false;
        bodyRot = Math.floor((f.stateTime / ROLL_TIME) * 4) * (Math.PI / 2);
        break;
      case 'dive':
        frame = BF.STRETCH;
        rigRot = Math.min(1, f.stateTime / 0.08) * (Math.PI / 2);
        front = -Math.PI / 2 - 0.1;
        back = -Math.PI / 2 + 0.1;
        frontLen = 1;
        backLen = 1;
        break;
      case 'climb':
        this.climbPhase += Math.abs(f.vy) * dt * 0.12;
        frame = Math.floor(this.climbPhase) % 2 === 0 ? BF.CLIMB0 : BF.CLIMB1;
        front = -Math.PI / 2 + (frame === BF.CLIMB0 ? 0.35 : -0.1);
        back = -Math.PI / 2 + (frame === BF.CLIMB0 ? -0.1 : 0.35);
        frontLen = 1;
        backLen = 1;
        showWeapon = false;
        break;
      case 'ledge':
        frame = BF.LEDGE;
        front = -1.35;
        back = -1.55;
        frontLen = 1;
        backLen = 1;
        showWeapon = false;
        break;
      case 'ledgeClimb':
        frame = BF.JUMP;
        front = -0.3;
        back = -0.5;
        showWeapon = false;
        break;
      case 'melee': {
        const m = (def.melee ?? weaponDef('fists').melee)!;
        const hit = m.combo[Math.min(f.combo, m.combo.length - 1)];
        const t = f.stateTime;
        const inWind = t < hit.windup;
        const inActive = t >= hit.windup && t < hit.windup + hit.active;
        frame = t < hit.windup + hit.active + hit.recover * 0.5 ? BF.PUNCH : BF.IDLE0;
        if (def.hold === 'fist') {
          if (f.combo === 0) {
            front = inWind ? 0.5 : inActive ? 0 : 0.4;
            frontLen = inActive ? 1 : 0;
            back = 1.4;
          } else if (f.combo === 1) {
            back = inWind ? 0.5 : inActive ? 0 : 0.4;
            backLen = inActive ? 1 : 0;
            front = 1.2;
          } else {
            const p = Math.min(1, t / (hit.windup + hit.active));
            front = lerp(1.3, -1.1, p);
            frontLen = 1;
            back = 1.6;
          }
        } else {
          const p = Math.min(1, Math.max(0, (t - hit.windup * 0.3) / (hit.windup + hit.active)));
          front = lerp(hit.arcFrom ?? -2.2, hit.arcTo ?? 0.9, p);
          frontLen = 1;
          back = 1.5;
          weaponAngle = front;
        }
        break;
      }
      case 'kick':
        frame = f.airKick ? BF.AIRKICK : BF.KICK;
        front = f.airKick ? -0.4 : 2.3;
        back = f.airKick ? 2.7 : 2.0;
        gunIdle();
        if (isGun) weaponAngle = 1.2;
        break;
      case 'aim': {
        frame = f.crouchAim ? BF.CROUCH : BF.AIM;
        if (def.throw) {
          // wind up over the shoulder while aiming, follow through after the release
          const a = f.aimAngle;
          const follow = Math.min(1, f.stateTime / 0.12);
          front = f.aimHeld ? -2.5 + a * 0.3 : lerp(-2.5, a + 0.3, follow);
          frontLen = 1;
          back = a;
          backLen = 1;
          weaponAngle = front;
          showWeapon = f.aimHeld || follow < 0.2;
          break;
        }
        const recoil = Math.max(0, 1 - (simTime - f.lastShotTime) * 12);
        const a = f.aimAngle - recoil * 0.12;
        front = a;
        back = a;
        frontLen = rifle ? 0 : 1;
        backLen = 1;
        weaponAngle = a;
        break;
      }
      case 'flinch':
        frame = BF.HURT;
        front = -2.3;
        back = 2.6;
        headFrame = HEAD.HURT;
        break;
      case 'knockdown':
        headFrame = HEAD.HURT;
        showWeapon = false;
        if (f.grounded) {
          frame = BF.STRETCH;
          rigRot = -Math.PI / 2;
          lie = 1;
          front = -2.6;
          back = 2.5;
        } else {
          frame = BF.TUMBLE;
          rigRot = f.thrownBy >= 0 ? f.rot * f.facing : -0.6;
          front = -2.4 + Math.sin(time * 20) * 0.4;
          back = 2.4 + Math.cos(time * 20) * 0.4;
        }
        break;
      case 'grabbing':
        frame = BF.AIM;
        front = 0;
        back = 0.3;
        frontLen = 1;
        backLen = 1;
        showWeapon = false;
        break;
      case 'grabbed':
        frame = BF.DANGLE;
        headFrame = HEAD.HURT;
        front = -2 + Math.sin(time * 25) * 0.5;
        back = -1.2 + Math.cos(time * 23) * 0.5;
        showWeapon = false;
        break;
      case 'dead':
        headFrame = HEAD.DEAD;
        showWeapon = false;
        if (f.grounded) {
          frame = BF.STRETCH;
          rigRot = f.rot * f.facing;
          lie = 1;
          front = 2.9;
          back = 0.6;
        } else {
          frame = BF.TUMBLE;
          rigRot = f.rot * f.facing;
          front = -2.5;
          back = 2.2;
        }
        break;
    }

    // carrying a prop overhead: both arms up
    if (f.carry >= 0 && f.alive && (f.state === 'normal' || f.state === 'crouch' || f.state === 'flinch')) {
      front = -1.75;
      back = -1.45;
      frontLen = 1;
      backLen = 1;
      showWeapon = false;
    }

    // ---- apply
    this.lieAmount += (lie - this.lieAmount) * Math.min(1, dt * 20);
    this.root.setPosition(x, y);
    this.squash *= Math.pow(0.001, dt * 6);
    const sq = this.squash;
    this.root.setScale(f.facing * (1 + sq * 0.6), 1 - sq);
    this.rig.setPosition(0, lerp(-RIG_Y, -4, this.lieAmount));
    this.rig.setRotation(rigRot);

    const meta = FRAME_META[frame];
    this.body.setFrame(frame);
    if (frame === BF.ROLL) {
      this.body.setOrigin(0.5, 25 / 32);
      this.body.setPosition(0, RIG_Y - 7);
      this.body.setRotation(bodyRot);
    } else {
      this.body.setOrigin(0.5, 1);
      this.body.setPosition(0, RIG_Y);
      this.body.setRotation(0);
    }

    this.head.setVisible(!meta.hideHead);
    if (!meta.hideHead) {
      const [hx, hy] = this.fp(meta.neckX, meta.neckY);
      this.head.setPosition(hx, hy);
      this.head.setFrame(headFrame);
      this.head.setScale(this.bigHead ? 2 : 1);
    }

    const armsVisible = !hideArms && !meta.hideArms;
    this.frontArm.setVisible(armsVisible);
    this.backArm.setVisible(armsVisible);
    const [sx, sy] = this.fp(meta.shX, meta.shY);
    const [bsx, bsy] = this.fp(meta.bshX, meta.bshY);
    if (armsVisible) {
      this.frontArm.setPosition(sx, sy).setFrame(armFrame(front, frontLen));
      this.backArm.setPosition(bsx, bsy).setFrame(armFrame(back, backLen));
    }

    // held weapon
    this.pack.setVisible(f.alive && f.inv[SLOT.GADGET]?.id === 'jetpack' && !meta.hideArms && frame !== BF.ROLL);
    this.pack.setY(RIG_Y - 13 + (frame === BF.CROUCH || frame === BF.CRAWL0 || frame === BF.CRAWL1 ? 7 : 0));
    const item = f.inv[f.active];
    const wf = item && item.id !== 'jetpack' ? Art.weapon(item.id) : undefined;
    if (wf && showWeapon && armsVisible && f.alive) {
      const ang = weaponAngle ?? front;
      const handL = frontLen === 1 ? ARM_LONG : ARM_SHORT;
      const len = ARM_LENGTHS[frontLen] ?? handL;
      this.weapon
        .setVisible(true)
        .setTexture(wf.key, wf.frame)
        .setOrigin((wf.gripX + 0.5) / wf.w, (wf.gripY + 0.5) / wf.h)
        .setPosition(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len)
        .setRotation(ang);
    } else {
      this.weapon.setVisible(false);
    }

    // hit flash / spawn blink
    if (this.flash > 0) {
      this.flash -= dt;
      for (const p of [this.body, this.head, this.frontArm, this.backArm]) p.setTintFill(0xffffff);
    } else if (f.burn > 0 && Math.floor(time * 14) % 2 === 0) {
      for (const p of [this.body, this.head, this.frontArm]) p.setTint(0xffa060);
      this.backArm.setTint(0xc08060);
    } else if (!f.alive && f.burn > 0) {
      for (const p of [this.body, this.head, this.frontArm, this.backArm]) p.setTint(0x605050);
    } else {
      this.body.clearTint();
      this.head.clearTint();
      this.frontArm.clearTint();
      this.backArm.setTint(0xb0a8c0);
    }
    const blink = f.alive && f.invuln > 0 && f.state !== 'roll' && Math.floor(time * 20) % 2 === 0;
    this.root.setAlpha(blink ? 0.45 : 1);

    this.tag.setVisible(f.alive);
    this.tag.setPosition(Math.round(x), Math.round(y - 30));
  }
}
