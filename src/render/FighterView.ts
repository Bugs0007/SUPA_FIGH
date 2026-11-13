import { formLevel } from './formLevel';
import Phaser from 'phaser';
import type { Appearance } from '../art/appearance';
import { Art } from '../art';
import { ARM_GUARD, ARM_LENGTHS, armFrame, BF, FRAME_META, HEAD, type FighterTextures } from '../art/fighterArt';
import { bleachBlade } from '../art/bleachArt';
import { formCount, formLook } from '../art/heroArt';
import { animFor, EXTERNAL_SHEETS, sheetFrame, type ExternalSheetDef } from '../art/externalSheets';
import { ARM_LONG, ARM_SHORT, FIGHTER_CROUCH_H, ROLL_TIME } from '../sim/constants';
import { SLOT, weaponDef } from '../sim/data/weapons';
import { activeWeapon, type Fighter } from '../sim/fighter';
import { baseAbility, formLayers, usesAmaterasu } from '../sim/hero';
import { heroDef, CLONE_SLINGSHOT, DRAGON_FIST, FORM_COMBO, JET_BAZOOKA } from '../sim/data/heroes';
import type { PokemonState } from '../sim/data/pokemon';
import { blackCloverSwordArm } from './BlackCloverAbilityArt';
import { bleachBladeAngle } from './BleachAbilityArt';
import { onePiecePose } from './OnePieceAbilityArt';
import { nonSwordRosterSpecialPose } from './RosterSpecialArt';
import { paintSwordScabbard, paintSwordWake, rosterSwordPose, swordPivotOffset, swordPose, swordSwing, type SwordPose } from './SwordMotion';
import { transformationPose, transformationTiming } from './TransformationArt';

/** Rig pivot: body center, this many px above the feet. */
const RIG_Y = 11;
const ARM_FRAME_SIZE = 17;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function tintTransform(img: Phaser.GameObjects.Image, color: number, flash: number): void {
  if (flash > 0.8) {
    img.setTintFill(color);
    return;
  }
  const r = Math.round(lerp(255, color >> 16 & 255, flash));
  const g = Math.round(lerp(255, color >> 8 & 255, flash));
  const b = Math.round(lerp(255, color & 255, flash));
  img.setTint(r << 16 | g << 8 | b);
}
/** shortest signed difference a - b between two angles */
const angleDelta = (a: number, b: number) => {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/** Split the baked sleeve at the elbow, keeping the hand on the authored sword grip. */
function poseSwordArm(upper: Phaser.GameObjects.Image, forearm: Phaser.GameObjects.Image, lengthFrame: number,
  shoulderX: number, shoulderY: number, handX: number, handY: number): void {
  const dx = handX - shoulderX, dy = handY - shoulderY;
  const reach = Math.hypot(dx, dy);
  const bend = Math.sqrt(Math.max(0, 4.6 ** 2 - (reach / 2) ** 2));
  const elbowX = (shoulderX + handX) / 2 - (reach > 0.01 ? dy / reach : 1) * bend;
  const elbowY = (shoulderY + handY) / 2 + (reach > 0.01 ? dx / reach : 0) * bend;
  const length = ARM_LENGTHS[lengthFrame] ?? ARM_LENGTHS[0];
  const split = Math.ceil(length / 2);
  const seam = 8 + split;
  const frame = armFrame(0, lengthFrame);

  upper.setFrame(frame).setPosition(shoulderX, shoulderY)
    .setRotation(Math.atan2(elbowY - shoulderY, elbowX - shoulderX))
    .setScale(Math.hypot(elbowX - shoulderX, elbowY - shoulderY) / split, 1)
    .setCrop(0, 0, seam + 1, ARM_FRAME_SIZE);
  forearm.setFrame(frame).setPosition(elbowX, elbowY)
    .setOrigin((seam + 0.5) / ARM_FRAME_SIZE, 0.5)
    .setRotation(Math.atan2(handY - elbowY, handX - elbowX))
    .setScale(Math.hypot(handX - elbowX, handY - elbowY) / (length - split), 1)
    .setCrop(seam, 0, ARM_FRAME_SIZE - seam, ARM_FRAME_SIZE);
}

/** Visual puppet for one fighter. Reads sim state; never writes it. */
export class FighterView {
  readonly root: Phaser.GameObjects.Container;
  private rig: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Image;
  private head: Phaser.GameObjects.Image;
  private backArm: Phaser.GameObjects.Image;
  private backForearm: Phaser.GameObjects.Image;
  private frontArm: Phaser.GameObjects.Image;
  private frontForearm: Phaser.GameObjects.Image;
  private weapon: Phaser.GameObjects.Image;
  private swordWake: Phaser.GameObjects.Graphics;
  private swordScabbard: Phaser.GameObjects.Graphics;
  private swordAngles: { front: number; rear?: number } | null = null;
  private meleeSword: SwordPose | null = null;
  private pack: Phaser.GameObjects.Image;
  private ghostImg: Phaser.GameObjects.Container;
  /** chaos modifier: 2x heads */
  bigHead = false;
  readonly tag: Phaser.GameObjects.BitmapText;
  private runPhase = 0;
  private climbPhase = 0;
  private squash = 0;
  /** Gear Fourth's guard: 0..1 how far the body has blown up like a balloon, and the tummy's rebound (damped spring, + = forward) */
  private puff = 0;
  private belly = 0;
  private bellyV = 0;
  private lastStun = 0;
  private flash = 0;
  private lieAmount = 0;
  /** displayed arm angles (eased toward the pose's targets during locomotion) */
  private armF = 1.45;
  private armB = 1.75;
  private gripX = 0;
  private gripY = 0;
  private rearGripX = 0;
  private rearGripY = 0;
  /** seconds left of the landing crouch frame */
  private landT = 0;
  /** turn-around squeeze (1 -> 0) */
  private turnT = 0;
  private lastFacing: number;
  /** smoothed lean (rig rotation) */
  private lean = 0;
  /** Render-only form transition. Gameplay receives the new form immediately. */
  private xform: { age: number; level: number; previous: number; color: number } | null = null;
  private shownLevel = 0;
  private lastHp: number;
  /** smoothed hp for the damage trail on the health bar */
  hpTrail: number;
  readonly color: number;
  /** normal + fully transformed textures (heroes) */
  readonly tex: FighterTextures;
  /** textures per transformation form level (index 0 = level 1); empty for non-heroes */
  readonly formTex: FighterTextures[];
  private curTex: FighterTextures;
  readonly look: Appearance;
  /** external PNG sheet replacing the modular rig (heroes only, when it loaded) */
  private sheet: { def: ExternalSheetDef; img: Phaser.GameObjects.Image } | null = null;

  constructor(
    scene: Phaser.Scene,
    readonly fighter: Fighter,
    look: Appearance,
    color: number,
    label: string,
  ) {
    const tex = Art.fighter(scene, look);
    this.tex = tex;
    this.curTex = tex;
    this.look = look;
    this.formTex = [];
    for (let l = 1; l <= formCount(fighter.skinHero ?? fighter.hero); l++) this.formTex.push(Art.fighter(scene, formLook(fighter.skinHero ?? fighter.hero, l)!));
    this.color = color;
    this.root = scene.add.container(fighter.x, fighter.y);
    this.rig = scene.add.container(0, -RIG_Y);
    this.backArm = scene.add.image(0, 0, tex.arm, 0).setTint(0xb0a8c0);
    this.backForearm = scene.add.image(0, 0, tex.arm, 0).setTint(0xb0a8c0).setVisible(false);
    this.body = scene.add.image(0, RIG_Y, tex.body, BF.IDLE0).setOrigin(0.5, 1);
    this.head = scene.add.image(0, 0, tex.head, HEAD.NORMAL).setOrigin(8 / 16, 13 / 16);
    this.weapon = scene.add.image(0, 0, 'weapons').setVisible(false);
    this.swordWake = scene.add.graphics();
    this.swordScabbard = scene.add.graphics();
    const jf = Art.weapon('jetpack');
    this.pack = scene.add.image(-5, RIG_Y - 13, jf?.key ?? 'weapons', jf?.frame).setVisible(false);
    this.frontArm = scene.add.image(0, 0, tex.arm, 0);
    this.frontForearm = scene.add.image(0, 0, tex.arm, 0).setVisible(false);
    this.rig.add([this.pack, this.swordScabbard, this.backArm, this.backForearm, this.body, this.head, this.swordWake,
      this.weapon, this.frontArm, this.frontForearm]);
    this.root.add(this.rig);
    this.root.setDepth(40);
    this.tag = scene.add.bitmapText(fighter.x, fighter.y - 35, 'smo', label.toUpperCase()).setOrigin(0.5, 1).setTint(color).setDepth(70);
    // ghost: a translucent, tinted copy of the body + head (Brawl, after death)
    this.ghostImg = scene.add.container(0, 0).setDepth(64).setVisible(false).setAlpha(0.5);
    this.ghostImg.add(scene.add.image(0, 0, tex.body, BF.FALL).setOrigin(0.5, 1).setTint(0xb0e0ff));
    const gm = FRAME_META[BF.FALL];
    this.ghostImg.add(scene.add.image(gm.neckX - 16, gm.neckY - 32, tex.head, HEAD.DEAD).setOrigin(8 / 16, 13 / 16).setTint(0xb0e0ff));
    this.lastHp = fighter.hp;
    this.hpTrail = fighter.hp;
    this.lastFacing = fighter.facing;
    const sd = EXTERNAL_SHEETS[fighter.skinHero ?? fighter.hero];
    if (sd && scene.textures.exists(sd.key)) {
      const img = scene.add.image(0, 0, sd.key, 0).setOrigin(sd.originX / sd.frameW, sd.originY / sd.frameH);
      this.root.add(img);
      this.rig.setVisible(false);
      this.sheet = { def: sd, img };
    }
  }

  /** Sheet-based hero: one image, frame picked from the fighter's state (art/externalSheets.ts). */
  private updateSheet(x: number, y: number, dt: number, time: number, simTime: number, pose?: ReturnType<typeof transformationPose>): void {
    const f = this.fighter;
    const { def, img } = this.sheet!;
    const { anim, t } = animFor(f, simTime);
    img.setFrame(sheetFrame(def, anim, t, this.shownLevel > 0));
    const squash = pose?.squash ?? 0;
    this.root.setPosition(x, y).setScale(f.facing * (1 + squash * 0.6), 1 - squash)
      .setRotation(f.state === 'dead' && !f.grounded ? f.rot * f.facing : 0);
    if (pose?.flash && this.xform) {
      tintTransform(img, this.xform.color, pose.flash);
    } else if (this.flash > 0) {
      this.flash -= dt;
      img.setTintFill(0xffffff);
    } else if (f.burn > 0 && Math.floor(time * 14) % 2 === 0) img.setTint(f.burnStyle==='amaterasu'?0xa78abd:0xffa060);
    else img.clearTint();
    this.root.setAlpha(f.alive && f.invuln > 0 && f.state !== 'roll' && Math.floor(time * 20) % 2 === 0 ? 0.45 : 1);
    this.tag.setVisible(f.alive).setPosition(Math.round(x), Math.round(y - 35 - formLayers(f) * 3));
  }

  /** the transformed (powered) textures are on screen (tests / debug) */
  get showsPowered(): boolean {
    return this.curTex !== this.tex;
  }

  /** textures for a form level (0 / out of range = the base look) */
  texFor(level: number): FighterTextures {
    return level > 0 ? (this.formTex[Math.min(level, this.formTex.length) - 1] ?? this.tex) : this.tex;
  }

  /** look of a form level (0 = base) */
  lookFor(level: number): Appearance {
    return level > 0 ? (formLook(this.fighter.skinHero ?? this.fighter.hero, level) ?? this.look) : this.look;
  }

  /** World position of the modular front hand, including the current pose's lean and squash. */
  frontHand(): { x: number; y: number } | null {
    if (!this.frontArm.visible || this.sheet) return null;
    return this.rig.getWorldTransformMatrix().transformPoint(this.gripX, this.gripY);
  }

  /** World position of the off hand, transformed with the body. */
  backHand(): { x: number; y: number } | null {
    if (!this.backArm.visible || this.sheet) return null;
    return this.rig.getWorldTransformMatrix().transformPoint(this.rearGripX, this.rearGripY);
  }

  /** Mirrored-local blade angle, including the current pose's body lean. */
  swordAngle(rear = false): number | undefined {
    const angle = rear ? this.swordAngles?.rear : this.swordAngles?.front;
    if (angle === undefined) return;
    const matrix = this.rig.getWorldTransformMatrix();
    const direction = matrix.transformPoint(Math.cos(angle), Math.sin(angle));
    return Math.atan2(direction.y - matrix.ty, (direction.x - matrix.tx) * this.fighter.facing);
  }

  swordDrawVisible(): boolean {
    return this.meleeSword?.front.visible ?? true;
  }

  swordProjection(rear = false): number {
    const blade = rear ? this.meleeSword?.rearBlade : this.meleeSword?.front;
    return blade?.projection ?? 1;
  }

  mouth(): { x: number; y: number } | null {
    if (!this.head.visible || this.sheet) return null;
    return this.head.getWorldTransformMatrix().transformPoint(3, -1);
  }

  /** World-space attachment for rear effects, including the current pose's flip and lean. */
  rearShoulder(): { x: number; y: number } | null {
    if (!this.backArm.visible || this.sheet) return null;
    return this.rig.getWorldTransformMatrix().transformPoint(this.backArm.x, this.backArm.y);
  }

  onLand(speed: number): void {
    this.squash = Math.min(0.35, speed / 1200);
    if (speed > 160) this.landT = Math.min(0.14, 0.05 + speed / 4000);
  }

  /** how inflated the Gear Fourth balloon guard is (0..1) */
  get puffAmount(): number {
    return this.puff;
  }

  /** the balloon belly's rebound: + pushed forward, - squashed in */
  get bellyBounce(): number {
    return this.belly;
  }

  /** a shot thrown back (or a blocked hit) sets the Gear Fourth tummy bouncing */
  kickBelly(strength: number): void {
    if (this.puff > 0.3) this.bellyV += strength;
  }

  onJump(): void {
    this.squash = -0.2;
  }

  onTransform(color: number, level: number): void {
    this.xform = { age: 0, level, previous: this.shownLevel, color };
    if (!level || !transformationTiming(this.fighter.hero, level)) this.squash = -0.3;
  }

  /** Naruto's fox stance: forms 1-3 run on four legs (not the base and not the final form) */
  private get fox(): boolean {
    const f = this.fighter;
    const lv = this.shownLevel;
    return f.hero === 'naruto' && lv >= 1 && lv <= 3;
  }

  /** Sprinting with the arms trailing behind in the air (Naruto in his base and final form, data: HeroDefinition.sprintArmsBack) */
  private get armsBackSprint(): boolean {
    const f = this.fighter;
    const a = heroDef(f.hero)?.sprintArmsBack;
    if (!a || f.sprintDir === 0) return false;
    const lv = formLevel(f);
    return lv > 0 ? a.levels.includes(lv) : a.base;
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

  update(alpha: number, dt: number, time: number, simTime: number, partner?: PokemonState): void {
    const f = this.fighter;
    this.updateGhost(time);
    if (f.gone) {
      this.xform = null;
      this.root.setVisible(false);
      this.tag.setVisible(false);
      return;
    }
    const x = lerp(f.px, f.x, alpha);
    const y = lerp(f.py, f.y, alpha);
    this.root.setVisible(true);

    // (chip damage through a raised guard does not flash the body: the shield flash shows it)
    if (f.hp < this.lastHp && f.state !== 'block') this.onHit();
    this.lastHp = f.hp;
    this.hpTrail = this.hpTrail > f.hp ? Math.max(f.hp, this.hpTrail - dt * 60) : f.hp;
    const level = formLevel(f);
    const timing = this.xform && this.xform.level > 0 ? transformationTiming(f.hero, this.xform.level) : undefined;
    if (this.xform) {
      this.xform.age += dt;
      if (!f.alive || this.xform.age >= (timing?.duration ?? 0.55) || (timing && level !== this.xform.level)) this.xform = null;
    }
    const transform = this.xform && timing ? transformationPose(timing, this.xform.age) : undefined;
    this.shownLevel = transform?.before ? this.xform!.previous : level;
    if (this.sheet) {
      this.updateSheet(x, y, dt, time, simTime, transform);
      return;
    }

    // ---- choose body frame, arm angles, rig rotation
    let frame: number = BF.IDLE0;
    let front = 1.45;
    let back = 1.75;
    let frontLen = 0;
    let backLen = 0;
    let rigRot = 0;
    let rigLift = 0;
    let frontArmYScale = 1;
    let lie = 0;
    let showWeapon = true;
    let weaponAngle: number | null = null;
    let headFrame: number = HEAD.NORMAL;
    let hideArms = false;
    /** blocking: bent guard arm frames instead of straight ones */
    let guardArms = false;
    let bodyRot = 0;
    let swing: ReturnType<typeof swordSwing>;
    this.swordAngles = null;
    this.meleeSword = null;
    this.swordWake.clear();
    this.swordScabbard.clear();
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

    let smoothArms = false;
    let leanTarget = 0;
    let bob = 0;
    if (this.landT > 0) this.landT -= dt;
    switch (f.state) {
      case 'normal': {
        smoothArms = true;
        if (this.fox && !isGun && !f.flying) {
          if (f.grounded) {
            if (speed > 15) {
              this.runPhase += (speed * dt) / 6;
              frame = BF.FOX_RUN0 + (Math.floor(this.runPhase) % 4);
              const sw = Math.sin((this.runPhase / 4) * Math.PI * 2);
              front = 1.15 - sw * 0.55;
              back = 1.15 + sw * 0.55;
            } else {
              frame = Math.floor(time * 1.6 + f.id) % 2 === 0 ? BF.FOX_IDLE0 : BF.FOX_IDLE1;
              front = 1.2;
              back = 1.05;
            }
          } else {
            frame = BF.FOX_JUMP;
            front = 0.5;
            back = 0.3;
          }
          frontLen = 1;
          backLen = 1;
        } else if (f.flying && ((f.sprintDir !== 0 && Math.abs(f.vx) > 50) || (f.flyRush !== 0 && Math.abs(f.vy) > 50))) {
          // flight rush: the superman glide, body flat, one fist thrust ahead, pitched into the climb or dive
          frame = BF.STRETCH;
          // (a vertical rush points the whole body up or down: head first)
          const pitch = Math.atan2(f.vy, Math.abs(f.vx));
          leanTarget = f.flyRush !== 0 ? Math.PI / 2 + pitch : Math.PI / 2 - 0.12 + Math.max(-0.5, Math.min(0.5, pitch * 0.8));
          front = -Math.PI / 2 - 0.06;
          back = -Math.PI / 2 + 0.7 + Math.sin(time * 9) * 0.05;
          frontLen = 1;
          backLen = 1;
          smoothArms = false;
          bob = Math.round(Math.sin(time * 5 + f.id) * 1);
        } else if (f.flying) {
          // levitating: calm hover, lean into the direction of travel, arms trail behind
          frame = BF.HOVER;
          const nvx = f.vx / 135;
          const nvy = f.vy / 135;
          leanTarget = Math.max(-0.35, Math.min(0.35, nvx * f.facing * 0.32));
          front = 1.9 - nvy * 0.6 + Math.sin(time * 3) * 0.08;
          back = 2.25 - nvy * 0.5 + Math.sin(time * 3 + 1) * 0.08;
          bob = Math.round(Math.sin(time * 4 + f.id) * 1);
        } else if (f.grounded) {
          const skidding = speed > 55 && Math.sign(f.vx) === -f.facing;
          if (this.landT > 0 && speed < 60) {
            frame = BF.LAND;
            front = 0.9;
            back = 2.3;
          } else if (skidding) {
            frame = BF.SKID;
            front = -0.6;
            back = 2.6;
            leanTarget = -0.08;
          } else if (speed > 15) {
            this.runPhase += (speed * dt) / 5.5;
            frame = BF.RUN0 + (Math.floor(this.runPhase) % 6);
            const s = Math.sin((this.runPhase / 6) * Math.PI * 2);
            // arms pump opposite to the legs; bent (short) arms read as running, not strolling
            front = Math.PI / 2 - s * 1.05 - 0.25;
            back = Math.PI / 2 + s * 1.05 - 0.25;
            leanTarget = f.sprintDir !== 0 ? 0.13 : (speed / 118) * 0.05;
            if (this.armsBackSprint && !isGun) {
              // the anime run: leaning far forward, both arms floating straight back behind the body
              front = Math.PI + 0.3 + Math.sin(time * 14) * 0.04;
              back = Math.PI + 0.12 + Math.sin(time * 14 + 1) * 0.04;
              frontLen = 1;
              backLen = 1;
              leanTarget = 0.36;
            }
          } else {
            // breathing (each fighter on its own phase), arms hang loose and sway a little
            const ph = time * 1.4 + f.id * 0.37;
            frame = Math.floor(ph) % 2 === 0 ? BF.IDLE0 : BF.IDLE1;
            front = 1.38 + Math.sin(ph * Math.PI) * 0.06;
            back = 1.7 + Math.sin(ph * Math.PI + 0.5) * 0.06;
          }
        } else if (f.wallSlide !== 0) {
          frame = BF.FALL;
          front = -1.3;
          back = -1.7;
          frontLen = 1;
          backLen = 1;
        } else {
          // rising / apex / falling
          if (f.vy < -90) {
            frame = BF.JUMP;
            front = -0.9;
            back = 2.5;
          } else if (f.vy < 90) {
            frame = BF.APEX;
            front = -0.15;
            back = 3.5;
          } else {
            frame = BF.FALL;
            front = -1.1 + Math.sin(time * 18) * 0.35;
            back = -1.9 + Math.sin(time * 18 + 1) * 0.35;
          }
          leanTarget = Math.max(-0.12, Math.min(0.12, (f.vx * f.facing) / 900));
          // double jump: gather the knees, then spring open with the arms thrown overhead and ease back to the jump pose
          const dj = (simTime - f.airJumpTime) / 0.38;
          if (dj >= 0 && dj < 1) {
            const open = Math.min(1, dj / 0.4);
            const settle = Math.max(0, (dj - 0.4) / 0.6);
            frame = dj < 0.4 ? BF.APEX : BF.JUMP;
            front = (1.1 + (-2.3 - 1.1) * open) * (1 - settle) + -0.9 * settle;
            back = (1.4 + (-2.7 - 1.4) * open) * (1 - settle) + 2.5 * settle;
            frontLen = back > 0 ? 0 : 1;
            backLen = frontLen;
            leanTarget = (-0.14 * (1 - open) + 0.1 * open) * (1 - settle);
            smoothArms = false;
          }
        }
        if (isGun) smoothArms = false;
        gunIdle();
        break;
      }
      case 'wallwalk': {
        // chakra feet: lying along the wall, feet on it, running up / down (rig is turned 90 degrees below)
        smoothArms = true;
        showWeapon = false;
        const moving = Math.abs(f.vy) > 8;
        if (moving) this.runPhase += (Math.abs(f.vy) * dt) / 5.5;
        frame = moving ? BF.RUN0 + (Math.floor(this.runPhase) % 6) : BF.IDLE0;
        const sw = Math.sin((this.runPhase / 6) * Math.PI * 2);
        front = moving ? Math.PI / 2 - sw * 1.05 - 0.25 : 1.4;
        back = moving ? Math.PI / 2 + sw * 1.05 - 0.25 : 1.7;
        if (moving && this.armsBackSprint) {
          front = Math.PI + 0.3;
          back = Math.PI + 0.12;
          frontLen = 1;
          backLen = 1;
        }
        rigRot = -Math.PI / 2;
        leanTarget = 0;
        break;
      }
      case 'crouch':
        if (this.fox && !isGun) {
          frame = BF.FOX_IDLE1;
          front = 1.25;
          back = 1.1;
          frontLen = 1;
          backLen = 1;
          break;
        }
        if (speed > 5) this.runPhase += (speed * dt) / 4;
        frame = speed > 5 ? (Math.floor(this.runPhase) % 2 === 0 ? BF.CRAWL0 : BF.CRAWL1) : BF.CROUCH;
        front = 0.9;
        back = 1.3;
        smoothArms = !isGun;
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
        const heroCombo = def.hold === 'fist' ? heroDef(f.hero)?.combo : undefined;
        const m = heroCombo ? { combo: heroCombo } : (def.melee ?? weaponDef('fists').melee)!;
        const hit = m.combo[Math.min(f.combo, m.combo.length - 1)];
        const t = f.stateTime;
        const inWind = t < hit.windup;
        const inActive = t >= hit.windup && t < hit.windup + hit.active;
        const striking = t < hit.windup + hit.active + hit.recover * 0.5;
        // anticipation -> strike pose per combo step (jab / cross / haymaker) -> settle
        const strikeFrame = hit.kick ? BF.KICK : f.combo === 0 ? BF.PUNCH : f.combo === 1 ? BF.CROSS : BF.UPPER;
        frame = inWind && hit.windup >= 0.05 ? BF.WINDUP : striking ? strikeFrame : BF.IDLE0;
        if (inActive) leanTarget = f.combo === 2 ? 0.12 : 0.05;
        swing = swordSwing(f, hit, def.id);
        if (swing) {
          const pose = swordPose(swing, t, f.grounded);
          this.meleeSword = pose;
          weaponAngle = pose.front.angle;
          this.swordAngles = { front: weaponAngle, rear: pose.rearBlade?.angle };
          frame = pose.frame;
          frontLen = 1;
          backLen = 1;
          smoothArms = false;
        } else if (def.hold === 'fist') {
          if (f.combo === 0) {
            front = inWind ? 0.5 : inActive ? 0 : 0.4;
            frontLen = inActive ? 1 : 0;
            back = 1.4;
          } else if (f.combo === 1) {
            back = inWind ? 0.5 : inActive ? 0 : 0.4;
            backLen = inActive ? 1 : 0;
            front = 1.2;
          } else if (hit.kick) {
            // the combo's finishing kick: fists up in a guard, leg out
            front = 2.3;
            back = 2.0;
            leanTarget = inActive ? -0.1 : 0;
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
        if(heroCombo&&f.hero==='naruto'&&formLevel(f)>0&&formLevel(f)<4){
          frame=formLevel(f)>1?BF.FOX_IDLE0:BF.WINDUP;
          front=1.4;back=1.7;frontLen=backLen=0;leanTarget=inActive?.12:-.06;
        }
        if(heroCombo&&((f.hero==='sasuke'&&formLevel(f)>=3)||(f.hero==='naruto'&&formLevel(f)===4))){
          frame=BF.WINDUP;
          front=.9;back=1.2;frontLen=0;backLen=0;
          leanTarget=inActive?.08:0;
        }
        break;
      }
      case 'special': {
        // hero moves (D51, D58). Stretch arms, beams, orbs and auras are drawn by HeroFx.
        const kind = f.specialKind;
        const level = formLevel(f);
        frame = f.flying ? BF.HOVER : BF.AIM;
        front = 0;
        back = 0.1;
        frontLen = 1;
        backLen = 1;
        showWeapon = false;
        if (kind === 'rosterSpecial') {
          const blade = rosterSwordPose(f);
          if (blade) {
            frame = blade.frame;
            front = blade.front;
            back = blade.back;
            leanTarget = blade.lean;
            if (blade.blade !== undefined) {
              weaponAngle = blade.blade;
              this.swordAngles = { front: blade.blade, rear: blade.rear };
            }
          } else {
            const pose = nonSwordRosterSpecialPose(f);
            if (pose) {
              frame = pose.frame;
              front = pose.front;
              back = pose.back;
              frontLen = pose.frontLen;
              backLen = pose.backLen;
              rigRot = pose.rigRot;
              rigLift = pose.rigLift;
              frontArmYScale = pose.armYScale;
              leanTarget = pose.leanTarget;
            }
          }
          break;
        }
        if(kind==='formCombo'&&f.hero==='luffy'){
          const pre=Math.min(1,f.stateTime/JET_BAZOOKA.windup),released=f.stateTime>=JET_BAZOOKA.windup;
          hideArms=true;smoothArms=false;leanTarget=0;
          if(f.jetMode==='kick'){
            frame=released?(f.stateTime<JET_BAZOOKA.windup+.12?BF.KICK:BF.CROSS):BF.WINDUP;
            rigRot=released?(f.stretchAngle*.7+.12)*Math.max(0,1-(f.stateTime-JET_BAZOOKA.windup)/.3):-.18*Math.sin(pre*Math.PI);
          }else{
            frame=released?BF.STRETCH:f.grounded?BF.CROUCH:BF.WINDUP;
            rigRot=released?Math.PI/2+Math.atan2(f.vy,f.vx*f.facing):-.25*Math.sin(pre*Math.PI/2);
          }
        } else if (kind === 'formCombo' && f.hero === 'naruto') {
          smoothArms=false; frame=BF.STRETCH;leanTarget=0;
          if(f.stateTime<CLONE_SLINGSHOT.windup){
            rigRot=Math.PI/2;front=Math.PI/2;back=1.9;
          }else{
            rigRot=Math.PI/2+Math.atan2(f.vy,f.vx*f.facing);
            front=-Math.PI/2;back=-Math.PI/2+.12;
          }
        } else if (kind === 'dragonFist') {
          const loading = f.stateTime < DRAGON_FIST.windup;
          const punching = !loading && f.stateTime < DRAGON_FIST.windup + DRAGON_FIST.active;
          frame = loading ? BF.WINDUP : punching ? BF.CROSS : BF.AIM;
          front = loading ? 2.48 : punching ? f.stretchAngle - .15 : -.4;
          back = loading ? 1.83 : 2.66;
          backLen = 0;
          leanTarget = loading ? -.13 : punching ? .24 : .03;
          smoothArms = false;
        } else if (kind === 'formCombo' && f.hero === 'goku') {
          const release = f.stateTime - FORM_COMBO.windup;
          frame = release < 0 ? BF.WINDUP : release < 0.11 ? BF.CROSS : BF.AIM;
          front = release < 0 ? -1.38 : release < 0.11 ? -0.18 : 0.65;
          back = release < 0 ? 2.1 : 2.55;
          backLen = 0;
          leanTarget = release < 0 ? -0.05 : release < 0.11 ? 0.2 : 0.03;
          smoothArms = false;
        } else if (kind === 'pistol' || kind === 'superFist') {
          const move = kind === 'superFist' ? heroDef('luffy')!.super.fist! : baseAbility(f)?.stretch;
          const extending = f.stateTime < (move?.out ?? .12);
          const early = f.stateTime < .045;
          frame = early ? BF.WINDUP : extending ? BF.CROSS : BF.AIM;
          back = early ? 2.6 : extending ? 1.9 : 1.3;
          backLen = 0;
          leanTarget = (early ? -.1 : extending ? .18 : .02) + f.stretchAngle * .1;
          if (f.hero === 'luffy' && level === 1) leanTarget += 0.12;
          if (f.hero === 'luffy' && level === 3) {
            leanTarget += early ? -.04 : .04;
          }
          if (f.hero === 'luffy' && level === 4) rigRot = Math.sin(f.stateTime * 18) * .055;
        } else if (kind === 'swing') {
          // hanging from the rope: the roped arm reaches up, legs trail behind the swing
          frame = BF.FALL;
          front = f.stretchAngle;
          back = 2.4;
          backLen = 1;
          // (the body hangs along the rope: head toward the anchor)
          rigRot = Math.max(-1, Math.min(1, Math.atan2((f.anchorX - x) * f.facing, -(f.anchorY - (y - 12)))));
        } else if (kind === 'rocket') {
          // yanked toward the fist: stretched out in the direction of travel
          frame = BF.APEX;
          // (head leads a little toward the fist; straight up stays upright)
          rigRot = Math.max(0, Math.min(0.7, 0.35 + f.stretchAngle * 0.35));
          back = 2.8;
          backLen = 1;
        } else if (kind === 'rasengan') {
          const dash = baseAbility(f)?.dash;
          const forming = !!dash && f.stateTime < dash.windup;
          // the orb forms between cupped hands, then the palm drives it forward
          frame = forming ? BF.WINDUP : f.recoverAt === 0 ? BF.UPPER : BF.CROSS;
          front = forming ? 0.55 : 0;
          back = forming ? 0.75 : 2.6;
          backLen = forming ? 1 : 0;
          leanTarget = forming ? -0.05 : 0.22;
          if (f.hero === 'naruto' && (level === 2 || level === 3)) {
            frame = forming ? BF.FOX_IDLE1 : BF.FOX_JUMP;
            front = 1.15;
            back = 1.4;
            leanTarget = 0.12;
          } else if (f.hero === 'naruto' && level === 4) {
            // The cloak's chakra hands perform the kneading while his own palm guides it.
            back = 1.8;
            backLen = 0;
            leanTarget = forming ? 0 : 0.12;
          }
          if (f.hero === 'sasuke') {
            frame = forming ? BF.WINDUP : BF.CROSS;
            front = forming ? .7 : 0;
            back = forming ? 1.9 : 2.7;
            backLen = 1;
            leanTarget = forming ? -.08 : .26;
          }
          // aimed off the horizontal: the palm points along the aim, and the body tips into a diagonal / vertical dash
          const fox = f.hero === 'naruto' && (level === 2 || level === 3);
          if (f.dashAngle !== 0 && !fox) {
            front = f.dashAngle;
            if (!forming && f.recoverAt === 0) rigRot = Math.max(-0.3, Math.min(0.6, f.dashAngle * 0.4));
          }
        } else if (kind === 'fireball') {
          frame = f.charge === -2 ? BF.CROSS : BF.WINDUP;
          front = -.8;
          back = -.55;
          leanTarget = f.charge === -2 ? .1 : -.06;
          if (f.hero === 'vegeta') {
            const windup = heroDef(f.hero)!.second.fireball!.windup;
            const ready = Math.min(1, f.stateTime / (windup * 0.52));
            const settle = Math.max(0, Math.min(1, (f.stateTime - windup - 0.075) / 0.13));
            frame = f.charge === -2 && settle < 0.45 ? BF.CROSS : BF.AIM;
            front = lerp(lerp(-0.53, f.stretchAngle, ready), 1.05, settle);
            back = 2.4;
            backLen = 0;
            leanTarget = f.charge === -2 ? lerp(0.18, 0, settle) : -0.04;
            smoothArms = false;
          }
          if(usesAmaterasu(f)){
            frame=f.charge===-2?BF.IDLE0:BF.WINDUP;
            front=-1.3;back=1.6;leanTarget=0;
          }
        } else if (kind === 'beamCharge' || kind === 'superCharge') {
          frame = BF.WINDUP;
          front = 0.9 + Math.sin(time * 50) * 0.05;
          back = 1.2;
          leanTarget = -0.1;
          if (f.hero === 'goku') {
            // Plant the stance and cup both hands beside the rear hip.
            front = 2.27 + Math.sin(time * 45) * 0.04;
            back = 1.38;
            frontLen = 0;
            backLen = 0;
            leanTarget = -0.14;
          } else if (f.hero === 'vegeta') {
            const charge = heroDef(f.hero)!.super.beam!.minCharge;
            const converge = Math.max(0, Math.min(1, (f.charge / charge - 0.74) / 0.22));
            front = lerp(level === 1 ? -0.7 : -0.36, f.stretchAngle, converge);
            back = lerp(level === 1 ? -0.4 : 2.8, f.stretchAngle + 0.16, converge);
            leanTarget = lerp(-0.15, 0.02, converge);
            smoothArms = false;
          }
        } else if (kind === 'beam' || kind === 'superBeam') {
          frame = BF.CROSS;
          front = f.stretchAngle;
          back = f.stretchAngle + 0.15;
          leanTarget = 0.12;
          if (f.hero === 'goku' || f.hero === 'vegeta') {
            leanTarget = f.stateTime < 0.06 ? 0.2 : 0.08;
            smoothArms = false;
          }
        } else if (kind === 'gatling') {
          // alternating fast punches
          const left = Math.floor(f.stateTime / 0.06) % 2 === 0;
          frame = left ? BF.PUNCH : BF.CROSS;
          front = left ? 0 : 1.1;
          back = left ? 1.1 : 0;
          frontLen = left ? 1 : 0;
          backLen = left ? 0 : 1;
          leanTarget = 0.1;
        } else if (kind === 'bomb') {
          // arms raised, holding the orb overhead
          frame = BF.AIM;
          front = -1.7;
          back = -1.4;
          leanTarget = -0.08;
          if (f.hero === 'goku' && (f.charge > 0.75 || f.charge < 0)) {
            // The completed Spirit Bomb is hurled forward; teleport poses are independent.
            const push = f.charge < 0 ? 1 : (f.charge - 0.75) / 0.25;
            front = lerp(-1.7, 0, push);
            back = lerp(-1.4, 0.15, push);
            frame = push > 0.6 ? BF.CROSS : BF.AIM;
            leanTarget = push * 0.1;
          }
          if (f.hero === 'naruto' && (level === 2 || level === 3)) {
            frame = BF.FOX_IDLE0;
            front = 1.15;
            back = 1.35;
            leanTarget = -0.08;
          }
          if (f.hero === 'sasuke') {
            frame = f.charge === -2 ? BF.CROSS : BF.WINDUP;
            front = f.stretchAngle;
            back = f.charge === -2 ? 1.7 : .7;
            leanTarget = f.charge === -2 ? .1 : -.07;
          }
        } else if (kind === 'blink') {
          frame = BF.WINDUP;
          front = -1.55;
          back = 1.8;
          frontLen = 1;
          leanTarget = -0.04;
        } else {
          // clones: a two-handed seal
          frame = BF.WINDUP;
          front = 0.4;
          back = 0.6;
        }
        break;
      }
      case 'block':
        // forearms up in front of the face / chest, knees bent (crouching guard: the crouch frame)
        frame = f.h <= FIGHTER_CROUCH_H ? BF.CROUCH : BF.GUARD;
        guardArms = true;
        front = -0.9;
        back = -0.6;
        // rocks back a touch while a blocked hit is absorbed
        leanTarget = f.blockStun > 0 ? -0.1 : 0.03;
        // a gun / throwable / gadget is lowered (out of sight) behind the guard; a melee weapon is held up across it
        if (!def.melee) showWeapon = false;
        break;
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

    const cloverSword = swing ? null : blackCloverSwordArm(f);
    if (cloverSword !== null) {
      front = cloverSword;
      frontLen = 1;
      smoothArms = false;
      if (f.state === 'special' && f.specialKind === 'bomb' && f.charge === -2) {
        frame = BF.CROSS;
        back = 0.85;
        leanTarget = 0.18;
      }
    } else if (f.hero === 'yuno' && f.state === 'special') {
      if (f.specialKind === 'fireball') {
        front = f.charge === -2 ? f.stretchAngle : -0.4;
        back = f.charge === -2 ? 2.3 : 0.8;
      } else if (f.specialKind === 'rasengan') {
        back = f.recoverAt > 0 ? 1.8 : 2.75;
        leanTarget = f.recoverAt > 0 ? -0.1 : 0.25;
      }
    }
    const piecePose = swing ? undefined : onePiecePose(f);
    if (piecePose) {
      frame = piecePose.frame;
      front = piecePose.arm;
      back = piecePose.backArm;
      leanTarget = piecePose.lean;
      smoothArms = false;
    }

    // carrying a prop overhead: both arms up
    if (f.carry >= 0 && f.alive && (f.state === 'normal' || f.state === 'crouch' || f.state === 'flinch')) {
      front = -1.75;
      back = -1.45;
      frontLen = 1;
      backLen = 1;
      showWeapon = false;
    }

    if (partner?.move === 'release' && partner.age < 0.24 && (f.state === 'normal' || f.state === 'crouch')) {
      const windup = partner.age < 0.047;
      const throwPhase = Math.max(0, Math.min(1, (partner.age - 0.047) / 0.096));
      const recover = Math.max(0, (partner.age - 0.143) / 0.097);
      frame = windup ? BF.WINDUP : BF.CROSS;
      front = lerp(-2.56, -0.15, throwPhase) + recover * 1.15;
      back = lerp(0.3, 2.2, throwPhase);
      frontLen = 1;
      leanTarget = lerp(-0.09, 0.12, throwPhase) * (1 - recover);
      smoothArms = false;
      showWeapon = false;
    }

    // ease arm swings between locomotion poses (attacks and aiming stay snappy)
    if (smoothArms) {
      const k = Math.min(1, dt * 22);
      this.armF += angleDelta(front, this.armF) * k;
      this.armB += angleDelta(back, this.armB) * k;
      front = this.armF;
      back = this.armB;
    } else {
      this.armF = front;
      this.armB = back;
    }

    // ---- apply
    if (f.hero === 'luffy' && formLevel(f) === 3 && f.grounded && f.state === 'normal' && speed < 15) bob = -Math.round((Math.sin(time * 6) + 1) * 1.5);
    const want = this.texFor(this.shownLevel);
    if (want !== this.curTex) {
      this.curTex = want;
      this.body.setTexture(want.body);
      this.head.setTexture(want.head);
      this.frontArm.setTexture(want.arm);
      this.frontForearm.setTexture(want.arm);
      this.backArm.setTexture(want.arm);
      this.backForearm.setTexture(want.arm);
    }
    this.lieAmount += (lie - this.lieAmount) * Math.min(1, dt * 20);
    // turning around on the ground: a quick horizontal squeeze sells the direction change
    if (f.facing !== this.lastFacing) {
      this.lastFacing = f.facing;
      if (f.alive && f.grounded && (f.state === 'normal' || f.state === 'crouch')) this.turnT = 1;
    }
    this.turnT = Math.max(0, this.turnT - dt / 0.09);
    this.root.setPosition(x, y + bob);
    if(f.hero==='luffy'&&f.state==='special'&&f.specialKind==='formCombo'&&f.jetMode!=='kick'&&f.stateTime<JET_BAZOOKA.windup){
      const pre=f.stateTime/JET_BAZOOKA.windup;
      this.root.setPosition(x-f.facing*Math.sin(pre*Math.PI/2)*7,y+Math.sin(pre*Math.PI)*2);
    }
    if(f.hero==='naruto'&&f.state==='special'&&f.specialKind==='formCombo'&&f.stateTime<CLONE_SLINGSHOT.windup){
      const a=f.stateTime/CLONE_SLINGSHOT.windup*Math.PI*2*CLONE_SLINGSHOT.turns;
      this.root.setPosition(x+f.facing*Math.cos(a)*CLONE_SLINGSHOT.swingRadius,y+Math.sin(a)*4);
    }
    this.squash *= Math.pow(0.001, dt * 6);
    const sq = this.squash + (transform?.squash ?? 0);
    // Gear Fourth's guard blows the body up like a balloon; blocked hits bounce the tummy
    const balloon = f.alive && f.state === 'block' && f.hero === 'luffy' && formLevel(f) === 3;
    this.puff += ((balloon ? 1 : 0) - this.puff) * Math.min(1, dt * (balloon ? 16 : 9));
    if (balloon && f.blockStun > this.lastStun + 0.01) this.kickBelly(7);
    this.lastStun = f.blockStun;
    const sdt = Math.min(dt, 1 / 30);
    this.bellyV += (-260 * this.belly - 9 * this.bellyV) * sdt;
    this.belly += this.bellyV * sdt;
    if (!balloon && this.puff < 0.01) this.puff = this.belly = this.bellyV = 0;
    this.root.setScale(f.facing * (1 + sq * 0.6) * (1 - this.turnT * 0.35) * (1 + this.puff * 0.08 + this.belly * 0.1), (1 - sq) * (1 + this.puff * 0.04 - this.belly * 0.08));
    if(f.hero==='naruto'&&f.state==='special'&&f.specialKind==='formCombo'&&f.stateTime<CLONE_SLINGSHOT.windup){
      const turn=Math.sin(f.stateTime/CLONE_SLINGSHOT.windup*Math.PI*2*CLONE_SLINGSHOT.turns);
      this.root.scaleX*= (turn>=0?1:-1)*(.55+.45*Math.abs(turn));
    }
    // on a wall the body lies along it: pull the rig off the wall so the feet touch it, not the middle
    const pivot = this.meleeSword ? swordPivotOffset(this.meleeSword, RIG_Y) : { x: 0, y: 0 };
    this.rig.setPosition((f.state === 'wallwalk' ? -6 : 0) + pivot.x, lerp(-RIG_Y, -4, this.lieAmount) - rigLift + pivot.y);
    if (this.meleeSword) this.lean = this.meleeSword.tilt;
    else this.lean += (leanTarget - this.lean) * Math.min(1, dt * 14);
    this.rig.setRotation(rigRot + this.lean);

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
    const signatureBlade = def.hold === 'fist' && armsVisible && f.alive && f.carry < 0
      && (f.state === 'normal' || f.state === 'crouch' || f.state === 'melee' || f.state === 'special' || f.state === 'block' || f.state === 'kick')
      ? bleachBlade(this.root.scene, f.hero, formLevel(f))
      : undefined;
    // A beam keeps the modular arms planted at its origin, unlike a stretched limb.
    const beamArm = f.specialKind === 'beam' || f.specialKind === 'superBeam';
    const drawnArm = f.stretchLen > 0 && f.state !== 'kick' && !beamArm;
    this.frontArm.setVisible(armsVisible && (!drawnArm || cloverSword !== null || signatureBlade !== undefined));
    this.backArm.setVisible(armsVisible);
    const [sx, sy] = this.fp(meta.shX, meta.shY);
    const [bsx, bsy] = this.fp(meta.bshX, meta.bshY);
    const armLength = ARM_LENGTHS[frontLen] ?? (frontLen === 1 ? ARM_LONG : ARM_SHORT);
    const rearLength = ARM_LENGTHS[backLen] ?? ARM_SHORT;
    const pose = this.meleeSword;
    this.frontForearm.setVisible(!!pose && this.frontArm.visible);
    this.backForearm.setVisible(!!pose && this.backArm.visible);
    if (armsVisible) {
      if (pose) {
        this.armF = Math.atan2(pose.front.y - sy, pose.front.x - sx);
        this.armB = Math.atan2(pose.back.y - bsy, pose.back.x - bsx);
        poseSwordArm(this.frontArm, this.frontForearm, frontLen, sx, sy, pose.front.x, pose.front.y);
        poseSwordArm(this.backArm, this.backForearm, backLen, bsx, bsy, pose.back.x, pose.back.y);
      } else {
        if (this.frontArm.isCropped) this.frontArm.setCrop();
        if (this.backArm.isCropped) this.backArm.setCrop();
        this.frontArm.setPosition(sx, sy).setRotation(0).setScale(1, frontArmYScale).setFrame(guardArms ? ARM_GUARD : armFrame(front, frontLen));
        this.backArm.setPosition(bsx, bsy).setRotation(0).setScale(1).setFrame(guardArms ? ARM_GUARD + 1 : armFrame(back, backLen));
      }
    }
    this.gripX = pose?.front.x ?? (guardArms ? sx + 5 : sx + Math.cos(front) * armLength);
    this.gripY = pose?.front.y ?? (guardArms ? sy - 3 : sy + Math.sin(front) * armLength * frontArmYScale);
    this.rearGripX = pose?.back.x ?? (guardArms ? bsx + 3 : bsx + Math.cos(back) * rearLength);
    this.rearGripY = pose?.back.y ?? (guardArms ? bsy - 2 : bsy + Math.sin(back) * rearLength);

    // held weapon
    this.pack.setVisible(f.alive && f.inv[SLOT.GADGET]?.id === 'jetpack' && !meta.hideArms && frame !== BF.ROLL);
    this.pack.setY(RIG_Y - 13 + (frame === BF.CROUCH || frame === BF.CRAWL0 || frame === BF.CRAWL1 ? 7 : 0));
    const item = f.inv[f.active];
    const wf = signatureBlade ?? (item && item.id !== 'jetpack' ? Art.weapon(item.id) : undefined);
    if (swing && pose && armsVisible) {
      paintSwordScabbard(this.swordScabbard, pose);
      paintSwordWake(this.swordWake, f, swing, pose, RIG_Y, wf ? wf.w - wf.gripX - 2 : undefined);
    }
    if (wf && (showWeapon || signatureBlade) && armsVisible && f.alive && this.swordDrawVisible()) {
      const ang = weaponAngle ?? front;
      const trackGrip = guardArms || this.swordAngles !== null;
      this.weapon
        .setVisible(true)
        .setTexture(wf.key, wf.frame)
        .setScale(this.swordProjection(), 1)
        .setOrigin((wf.gripX + 0.5) / wf.w, (wf.gripY + 0.5) / wf.h)
        // guarding: the weapon is held up across the body in the raised fist
        .setPosition(trackGrip ? this.gripX : sx + Math.cos(ang) * armLength, trackGrip ? this.gripY : sy + Math.sin(ang) * armLength)
        .setRotation(guardArms ? -1.3 : signatureBlade && this.swordAngles === null ? bleachBladeAngle(f, front) : ang);
    } else {
      this.weapon.setVisible(false);
    }

    // hit flash / spawn blink
    if (transform?.flash && this.xform) {
      for (const p of [this.body, this.head, this.frontArm, this.backArm, this.frontForearm, this.backForearm]) {
        tintTransform(p, this.xform.color, transform.flash);
      }
    } else if (this.xform && !timing) {
      const c = Math.floor(this.xform.age * 28) % 2 === 0 ? this.xform.color : 0xffffff;
      for (const p of [this.body, this.head, this.frontArm, this.backArm, this.frontForearm, this.backForearm]) p.setTintFill(c);
    } else if (this.flash > 0) {
      this.flash -= dt;
      for (const p of [this.body, this.head, this.frontArm, this.backArm, this.frontForearm, this.backForearm]) p.setTintFill(0xffffff);
    } else if (f.burn > 0 && Math.floor(time * 14) % 2 === 0) {
      for (const p of [this.body, this.head, this.frontArm, this.frontForearm]) p.setTint(f.burnStyle==='amaterasu'?0xa78abd:0xffa060);
      this.backArm.setTint(f.burnStyle==='amaterasu'?0x6e507d:0xc08060);
      this.backForearm.setTint(f.burnStyle==='amaterasu'?0x6e507d:0xc08060);
    } else if (!f.alive && f.burn > 0) {
      for (const p of [this.body, this.head, this.frontArm, this.backArm, this.frontForearm, this.backForearm]) p.setTint(0x605050);
    } else {
      this.body.clearTint();
      this.head.clearTint();
      this.frontArm.clearTint();
      this.frontForearm.clearTint();
      this.backArm.setTint(0xb0a8c0);
      this.backForearm.setTint(0xb0a8c0);
    }
    const blink = f.alive && f.invuln > 0 && f.state !== 'roll' && Math.floor(time * 20) % 2 === 0;
    this.root.setAlpha(blink ? 0.45 : 1);

    this.tag.setVisible(f.alive);
    this.tag.setPosition(Math.round(x), Math.round(y - 35 - formLayers(f) * 3));
  }
}
