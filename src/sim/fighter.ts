import {
  AIR_JUMP_VEL,
  AIR_JUMPS,
  SPRINT_COOLDOWN,
  SPRINT_MUL,
  SPRINT_RAMP,
  SPRINT_TAP_WINDOW,
  WALL_JUMP_LOCK,
  WALL_JUMP_VX,
  WALL_JUMP_VY,
  WALL_SLIDE_MAX,
  AIM_ACCEL,
  AIM_LIMIT,
  AIM_MAX_SPEED,
  AIM_MEMORY,
  AIR_ACCEL,
  AIR_DECEL,
  ARM_LONG,
  ARM_SHORT,
  CLIMB_SPEED,
  COYOTE_TIME,
  CRAWL_SPEED,
  DIVE_VX,
  DIVE_VY,
  DT,
  FIGHTER_CROUCH_H,
  FIGHTER_H,
  FIGHTER_ROLL_H,
  FIGHTER_W,
  GRAB_RANGE,
  GRAB_TIME_MAX,
  GRAVITY,
  GROUND_ACCEL,
  GROUND_DECEL,
  ITEM_PICKUP_RANGE,
  JUMP_BUFFER,
  JUMP_CUT,
  JUMP_VEL,
  KNOCKDOWN_TIME,
  LEDGE_CLIMB_TIME,
  MAX_FALL,
  MAX_HP,
  ROLL_IFRAMES,
  ROLL_SPEED,
  ROLL_TIME,
  RUN_SPEED,
  SHOULDER_X,
  SHOULDER_Y_CROUCH,
  SHOULDER_Y_STAND,
  THROW_SPEED_X,
  THROW_SPEED_Y,
  TILE,
  FALL_DAMAGE_SPEED,
} from './constants';
import { applyHit, killFighter, sameTeam } from './combat';
import {
  AIR_KICK,
  CARRY,
  FISTS,
  GRAB,
  KICK,
  KICK_COOLDOWN,
  SLOT,
  THROW_AIM,
  TOSS,
  weaponDef,
  type MeleeHit,
  type ThrowStats,
  type WeaponDef,
} from './data/weapons';
import { detonate } from './item';
import { damageProp, onProp, pushProp, releaseProp, supportOnProps, type Prop } from './prop';
import { conveyorPush } from './gimmicks';
import { copyIntent, emptyIntent, type Intent } from './intent';
import { hasHeadroom, moveBody, newMoveResult, onOneWayOnly, type Body, type MoveResult } from './physics';
import type { World } from './world';

export type FState =
  | 'normal'
  | 'crouch'
  | 'roll'
  | 'dive'
  | 'climb'
  | 'ledge'
  | 'ledgeClimb'
  | 'melee'
  | 'kick'
  | 'aim'
  | 'flinch'
  | 'knockdown'
  | 'grabbed'
  | 'grabbing'
  | 'dead';

export interface InvItem {
  id: string;
  ammo: number;
  dur: number;
}

/** Plain data (snapshot-able). All behavior lives in the functions below. */
export interface Fighter extends Body {
  id: number;
  name: string;
  team: number;
  isBot: boolean;
  /** pressing Up (when not on a ladder / not aiming) also jumps */
  upJumps: boolean;
  px: number;
  py: number;
  facing: 1 | -1;
  state: FState;
  stateTime: number;
  hp: number;
  alive: boolean;
  /** removed from the world (fell off the map) */
  gone: boolean;
  invuln: number;
  flinchTime: number;
  coyote: number;
  jumpBuffer: number;
  jumping: boolean;
  dropTimer: number;
  /** air jumps left (double jump) */
  airJumps: number;
  /** side of the last wall jumped off (-1/1, 0 = none since landing): no climbing one wall forever */
  lastWallSide: number;
  /** reduced air control after a wall jump */
  wallLock: number;
  /** -1/1 while sliding down a wall (render) */
  wallSlide: number;
  /** sprint: direction (0 = not sprinting), time sprinting, double-tap tracking */
  sprintDir: number;
  sprintTime: number;
  sprintCooldown: number;
  lastTapDir: number;
  lastTapTime: number;
  /** last air jump time (render: flip) */
  airJumpTime: number;
  // aiming
  aimAngle: number;
  aimVel: number;
  aimHeld: boolean;
  aimEndTime: number;
  crouchAim: boolean;
  pendingShot: number;
  lastShotTime: number;
  // inventory
  inv: (InvItem | null)[];
  active: number;
  fireCooldown: number;
  kickCooldown: number;
  // melee
  combo: number;
  comboTimer: number;
  comboQueued: boolean;
  swingHit: number[];
  airKick: boolean;
  // grab
  grabTarget: number;
  grabbedBy: number;
  grabTimer: number;
  struggle: number;
  knees: number;
  thrownBy: number;
  thrownTime: number;
  // kill credit
  lastAttacker: number;
  lastWeapon: string;
  lastHitTime: number;
  // ladders / ledges
  ladderX: number;
  ledgeTx: number;
  ledgeTy: number;
  ledgeCooldown: number;
  lcFromX: number;
  lcFromY: number;
  lcToX: number;
  lcToY: number;
  // ragdoll
  rot: number;
  vrot: number;
  speedMul: number;
  // status
  /** seconds of burning left */
  burn: number;
  burnBy: number;
  burnAcc: number;
  speedBoost: number;
  strengthBoost: number;
  // throwables & gadgets
  /** >= 0: a cooked grenade's fuse in hand */
  cook: number;
  /** seconds attack has been held while aiming a throwable (throw power) */
  throwHold: number;
  /** jetpack firing this tick (render) */
  jetting: boolean;
  swingProps: number[];
  /** id of the prop held overhead (-1 = none) */
  carry: number;
  prev: Intent;
}

export interface FighterSpawn {
  name: string;
  team: number;
  isBot: boolean;
  upJumps: boolean;
}

export function createFighter(id: number, spec: FighterSpawn, x: number, y: number): Fighter {
  return {
    id,
    name: spec.name,
    team: spec.team,
    isBot: spec.isBot,
    upJumps: spec.upJumps,
    x,
    y,
    px: x,
    py: y,
    vx: 0,
    vy: 0,
    w: FIGHTER_W,
    h: FIGHTER_H,
    grounded: false,
    facing: 1,
    state: 'normal',
    stateTime: 0,
    hp: MAX_HP,
    alive: true,
    gone: false,
    invuln: 0,
    flinchTime: 0,
    coyote: 0,
    jumpBuffer: 0,
    jumping: false,
    dropTimer: 0,
    airJumps: AIR_JUMPS,
    lastWallSide: 0,
    wallLock: 0,
    wallSlide: 0,
    sprintDir: 0,
    sprintTime: 0,
    sprintCooldown: 0,
    lastTapDir: 0,
    lastTapTime: -10,
    airJumpTime: -10,
    aimAngle: 0,
    aimVel: 0,
    aimHeld: false,
    aimEndTime: -10,
    crouchAim: false,
    pendingShot: 0,
    lastShotTime: -10,
    inv: [null, null, null, null, null],
    active: SLOT.MELEE,
    fireCooldown: 0,
    kickCooldown: 0,
    combo: 0,
    comboTimer: 0,
    comboQueued: false,
    swingHit: [],
    airKick: false,
    grabTarget: -1,
    grabbedBy: -1,
    grabTimer: 0,
    struggle: 0,
    knees: 0,
    thrownBy: -1,
    thrownTime: -10,
    lastAttacker: -1,
    lastWeapon: '',
    lastHitTime: -10,
    ladderX: 0,
    ledgeTx: 0,
    ledgeTy: 0,
    ledgeCooldown: 0,
    lcFromX: 0,
    lcFromY: 0,
    lcToX: 0,
    lcToY: 0,
    rot: 0,
    vrot: 0,
    speedMul: 1,
    burn: 0,
    burnBy: -1,
    burnAcc: 0,
    speedBoost: 0,
    strengthBoost: 0,
    cook: -1,
    throwHold: 0,
    jetting: false,
    swingProps: [],
    carry: -1,
    prev: emptyIntent(),
  };
}

// ------------------------------------------------------------------ helpers

interface Edges {
  jumpP: boolean;
  attackP: boolean;
  kickP: boolean;
  interactP: boolean;
  cycleP: boolean;
  gadgetP: boolean;
  upP: boolean;
  downP: boolean;
  leftP: boolean;
  rightP: boolean;
  anyP: boolean;
}

function edges(i: Intent, p: Intent): Edges {
  const upP = i.moveY < -0.5 && p.moveY >= -0.5;
  const downP = i.moveY > 0.5 && p.moveY <= 0.5;
  const jumpP = i.jump && !p.jump;
  const attackP = i.attack && !p.attack;
  const kickP = i.kick && !p.kick;
  const interactP = i.interact && !p.interact;
  const cycleP = i.cycle && !p.cycle;
  const gadgetP = i.gadget && !p.gadget;
  const leftP = i.moveX < -0.5 && p.moveX >= -0.5;
  const rightP = i.moveX > 0.5 && p.moveX <= 0.5;
  return {
    jumpP,
    attackP,
    kickP,
    interactP,
    cycleP,
    gadgetP,
    upP,
    downP,
    leftP,
    rightP,
    anyP: jumpP || attackP || kickP || interactP || upP || downP || leftP || rightP,
  };
}

const axis = (v: number) => (v > 0.25 ? 1 : v < -0.25 ? -1 : 0);
const approach = (v: number, target: number, delta: number) =>
  v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

function setState(f: Fighter, s: FState): void {
  f.state = s;
  f.stateTime = 0;
}

export function activeWeapon(f: Fighter): WeaponDef {
  const it = f.inv[f.active];
  return it ? weaponDef(it.id) : FISTS;
}

export function activeItem(f: Fighter): InvItem | null {
  return f.inv[f.active];
}

export function shoulderY(f: Fighter): number {
  const crouched = f.crouchAim || f.state === 'crouch';
  return f.y - (crouched ? SHOULDER_Y_CROUCH : SHOULDER_Y_STAND);
}

/**
 * Gun geometry shared with the renderer. Computed in right-facing local space, then mirrored.
 * Returns shoulder, hand, muzzle (world px) and the bullet direction.
 */
export function gunGeometry(f: Fighter, def: WeaponDef) {
  const crouched = f.crouchAim || f.state === 'crouch';
  const sy = -(crouched ? SHOULDER_Y_CROUCH : SHOULDER_Y_STAND);
  const sx = SHOULDER_X;
  const handL = def.hold === 'pistol' ? ARM_LONG : ARM_SHORT;
  const c = Math.cos(f.aimAngle);
  const s = Math.sin(f.aimAngle);
  const hx = sx + c * handL;
  const hy = sy + s * handL;
  const m = def.muzzle ?? [8, 0];
  const mx = hx + c * m[0] - s * m[1];
  const my = hy + s * m[0] + c * m[1];
  return {
    shoulderX: f.x + f.facing * sx,
    shoulderY: f.y + sy,
    handX: f.x + f.facing * hx,
    handY: f.y + hy,
    muzzleX: f.x + f.facing * mx,
    muzzleY: f.y + my,
    dirX: c * f.facing,
    dirY: s,
  };
}

function restoreHeight(w: World, f: Fighter): void {
  if (hasHeadroom(w.map, f, FIGHTER_H)) {
    f.h = FIGHTER_H;
    if (f.state === 'crouch') setState(f, 'normal');
  } else {
    f.h = FIGHTER_CROUCH_H;
    if (f.grounded) setState(f, 'crouch');
  }
}

// ------------------------------------------------------------------ main update

const moveRes: MoveResult = newMoveResult();

export function updateFighter(w: World, f: Fighter, inp: Intent): void {
  f.px = f.x;
  f.py = f.y;
  if (f.gone) return;
  if (!f.alive) {
    updateCorpse(w, f);
    copyIntent(f.prev, inp);
    return;
  }
  const e = edges(inp, f.prev);
  const dt = DT;

  f.stateTime += dt;
  if (f.invuln > 0) f.invuln -= dt;
  if (f.fireCooldown > 0) f.fireCooldown -= dt;
  if (f.kickCooldown > 0) f.kickCooldown -= dt;
  if (f.comboTimer > 0) f.comboTimer -= dt;
  if (f.coyote > 0) f.coyote -= dt;
  if (f.jumpBuffer > 0) f.jumpBuffer -= dt;
  if (f.dropTimer > 0) f.dropTimer -= dt;
  if (f.ledgeCooldown > 0) f.ledgeCooldown -= dt;
  if (f.wallLock > 0) f.wallLock -= dt;
  if (f.sprintCooldown > 0) f.sprintCooldown -= dt;
  f.wallSlide = 0;
  updateSprint(w, f, inp, e, dt);
  if (e.jumpP) f.jumpBuffer = JUMP_BUFFER;
  if (f.speedBoost > 0) f.speedBoost -= dt;
  if (f.strengthBoost > 0) f.strengthBoost -= dt;
  f.jetting = false;
  f.speedMul = (activeWeapon(f).moveSpeedMul ?? 1) * (f.speedBoost > 0 ? (weaponDef('speed').powerup?.mult ?? 1) : 1);
  if (f.carry >= 0) {
    f.speedMul *= CARRY.speedMul;
    // carrying: every action button throws the prop instead
    if ((e.attackP || e.interactP || e.kickP) && (f.state === 'normal' || f.state === 'crouch')) {
      throwProp(w, f, inp);
      e.attackP = e.interactP = e.kickP = false;
    }
  }

  switch (f.state) {
    case 'normal':
      stNormal(w, f, inp, e, dt);
      break;
    case 'crouch':
      stCrouch(w, f, inp, e, dt);
      break;
    case 'roll':
      stRoll(w, f, inp, dt);
      break;
    case 'dive':
      stDive(w, f, dt);
      break;
    case 'climb':
      stClimb(w, f, inp, e, dt);
      break;
    case 'ledge':
      stLedge(w, f, inp, e);
      break;
    case 'ledgeClimb':
      stLedgeClimb(w, f);
      break;
    case 'melee':
      stMelee(w, f, inp, e, dt);
      break;
    case 'kick':
      stKick(w, f, dt);
      break;
    case 'aim':
      stAim(w, f, inp, e, dt);
      break;
    case 'flinch':
      f.vx = approach(f.vx, 0, GROUND_DECEL * 0.6 * dt);
      integrate(w, f, dt);
      if (f.stateTime >= f.flinchTime) setState(f, 'normal');
      break;
    case 'knockdown':
      stKnockdown(w, f, dt);
      break;
    case 'grabbing':
      stGrabbing(w, f, inp, e, dt);
      break;
    case 'grabbed':
      if (e.anyP) f.struggle++;
      if (f.grabbedBy < 0 || w.fighters[f.grabbedBy]?.state !== 'grabbing') {
        f.grabbedBy = -1;
        setState(f, 'normal');
      }
      break;
    case 'dead':
      break;
  }

  if (f.cook >= 0 && f.alive) {
    f.cook -= dt;
    // held it too long, or got knocked out of the throw: the grenade drops at your feet
    if (f.cook <= 0 || f.state !== 'aim' || !f.aimHeld) dropCooked(w, f);
  }

  if (f.alive && (f.state === 'normal' || f.state === 'crouch' || f.state === 'roll')) autoPickup(w, f);
  copyIntent(f.prev, inp);
}

/** Gravity + collision + landing/fall-off bookkeeping. */
function integrate(w: World, f: Fighter, dt: number, gravity = true): MoveResult {
  if (gravity) f.vy = Math.min(f.vy + GRAVITY * w.gravityAt(f.x, f.y - f.h / 2) * dt, MAX_FALL);
  const wasGrounded = f.grounded;
  const prevY = f.y;
  const thrown = f.state === 'knockdown' && f.thrownBy >= 0;
  moveBody(
    w.map,
    f,
    dt,
    {
      ignoreOneWay: f.dropTimer > 0 || f.state === 'climb',
      onSolid: thrown
        ? (tx, ty, _axis, speed) => {
            if (Math.abs(speed) > 150 && w.map.def(tx, ty).breakable) {
              w.breakTile(tx, ty);
              return true;
            }
            return false;
          }
        : undefined,
    },
    moveRes,
  );
  if (w.props.length > 0 || w.gimmicks.movers.length > 0) propContacts(w, f, prevY);
  if (f.grounded) conveyorPush(w, f);
  if (f.grounded) {
    f.coyote = COYOTE_TIME;
    f.airJumps = AIR_JUMPS;
    f.lastWallSide = 0;
    if (!wasGrounded) {
      f.jumping = false;
      if (moveRes.impactVy > 90) w.emit({ t: 'land', f: f.id, x: f.x, y: f.y, speed: moveRes.impactVy });
    }
  }
  checkOutOfWorld(w, f);
  return moveRes;
}

/** Stand on props, and shove them when walking into them. */
function propContacts(w: World, f: Fighter, prevY: number): void {
  if (!f.grounded && f.dropTimer <= 0 && f.state !== 'climb' && supportOnProps(w, f, prevY, -1)) {
    moveRes.landed = true;
    moveRes.impactVy = Math.max(moveRes.impactVy, 0);
    return;
  }
  if (f.grounded && f.vy >= 0 && onProp(w, f)) return;
  for (const p of w.props) {
    if (!p.active || (p.def.anchored && !p.released)) continue;
    if (f.y <= p.y - p.h + 2 || f.y - f.h >= p.y) continue;
    const gap = (f.w + p.w) / 2 - Math.abs(p.x - f.x);
    if (gap <= 0) continue;
    const dir = p.x >= f.x ? 1 : -1;
    if (Math.sign(f.vx) === dir) {
      const target = f.vx * 0.7;
      const pv = p.vx * p.def.mass;
      if (Math.abs(pv) < Math.abs(target)) pushProp(p, target - pv, 0);
    }
    const nx = f.x - dir * gap;
    if (!w.map.rectSolid(nx - f.w / 2, f.y - f.h, nx + f.w / 2, f.y)) f.x = nx;
  }
}

function checkOutOfWorld(w: World, f: Fighter): void {
  if (!f.alive) return;
  const out = f.y > w.killY || f.x < -160 || f.x > w.map.pxW + 160;
  if (out) {
    killFighter(w, f, { damage: 999, kbX: 0, kbY: 0, attacker: -1, weapon: 'fall', kind: 'fall' });
    f.gone = true;
    return;
  }
  if (w.map.hazardAtPx(f.x, f.y - 3) === 'water') {
    killFighter(w, f, { damage: 999, kbX: 0, kbY: 0, attacker: -1, weapon: 'water', kind: 'water' });
  }
}

// ------------------------------------------------------------------ locomotion states

function doJump(w: World, f: Fighter): void {
  f.vy = -JUMP_VEL;
  f.grounded = false;
  f.coyote = 0;
  f.jumpBuffer = 0;
  f.jumping = true;
  w.emit({ t: 'jump', f: f.id, x: f.x, y: f.y });
}

function dropThrough(f: Fighter): void {
  f.dropTimer = 0.22;
  f.y += 1;
  f.vy = Math.max(f.vy, 40);
  f.grounded = false;
  f.jumpBuffer = 0;
  f.coyote = 0;
}

function onLadder(w: World, f: Fighter): boolean {
  return w.map.ladderAtPx(f.x, f.y - f.h / 2) || w.map.ladderAtPx(f.x, f.y - 2);
}

function ladderBelow(w: World, f: Fighter): boolean {
  return w.map.ladderAtPx(f.x, f.y + 2);
}

function startClimb(w: World, f: Fighter, down: boolean): void {
  setState(f, 'climb');
  f.ladderX = Math.floor(f.x / TILE) * TILE + TILE / 2;
  f.vx = 0;
  f.vy = 0;
  f.jumping = false;
  f.h = FIGHTER_H;
  if (down) f.y += 3;
}

function horizontalControl(f: Fighter, mx: number, dt: number, speed: number): void {
  if (f.grounded) {
    const accel = mx !== 0 && (Math.sign(mx) === Math.sign(f.vx) || f.vx === 0) ? GROUND_ACCEL : GROUND_DECEL;
    f.vx = approach(f.vx, mx * speed, accel * dt);
  } else {
    f.vx = approach(f.vx, mx * speed, (mx !== 0 ? AIR_ACCEL : AIR_DECEL) * dt);
  }
}

/** Double-tap a direction to sprint; holding it keeps the sprint going. */
function updateSprint(w: World, f: Fighter, inp: Intent, e: Edges, dt: number): void {
  const tap = e.leftP ? -1 : e.rightP ? 1 : 0;
  if (tap !== 0) {
    if (tap === f.lastTapDir && w.time - f.lastTapTime < SPRINT_TAP_WINDOW && f.sprintCooldown <= 0 && f.sprintDir === 0) {
      f.sprintDir = tap;
      f.sprintTime = 0;
      w.emit({ t: 'sprint', f: f.id });
    }
    f.lastTapDir = tap;
    f.lastTapTime = w.time;
  }
  if (f.sprintDir !== 0) {
    const still = axis(inp.moveX) === f.sprintDir && (f.state === 'normal' || f.state === 'roll' || f.state === 'dive');
    if (!still) {
      f.sprintDir = 0;
      f.sprintCooldown = SPRINT_COOLDOWN;
    } else f.sprintTime += dt;
  }
}

/** Current sprint multiplier on run speed (ramps up over SPRINT_RAMP). */
export function sprintMul(f: Fighter): number {
  if (f.sprintDir === 0) return 1;
  return 1 + (SPRINT_MUL - 1) * Math.min(1, f.sprintTime / SPRINT_RAMP);
}

/** Which side (-1/1) the fighter is touching a solid wall on, 0 = none. Prefers the pressed side. */
export function wallContact(w: World, f: Fighter, prefer: number): number {
  const t = f.y - f.h + 3;
  const b = f.y - 3;
  const touch = (side: number) => {
    const x = side > 0 ? f.x + f.w / 2 + 1 : f.x - f.w / 2 - 1;
    return w.map.rectSolid(x - 0.5, t, x + 0.5, b);
  };
  if (prefer !== 0 && touch(prefer)) return prefer;
  if (touch(1)) return 1;
  if (touch(-1)) return -1;
  return 0;
}

/** Jump pressed in the air: wall jump if touching a wall (not the same one twice), else double jump. */
function airJump(w: World, f: Fighter, mx: number): boolean {
  const side = wallContact(w, f, mx);
  if (side !== 0 && side !== f.lastWallSide) {
    f.vx = -side * WALL_JUMP_VX;
    f.vy = -WALL_JUMP_VY;
    f.facing = side > 0 ? -1 : 1;
    f.lastWallSide = side;
    f.airJumps = AIR_JUMPS;
    f.wallLock = WALL_JUMP_LOCK;
    f.jumping = true;
    f.jumpBuffer = 0;
    w.emit({ t: 'jump', f: f.id, x: f.x + side * 5, y: f.y - 8, wall: side });
    return true;
  }
  if (f.airJumps > 0) {
    f.airJumps--;
    f.vy = -AIR_JUMP_VEL;
    if (mx !== 0) f.vx = mx * Math.max(Math.abs(f.vx), RUN_SPEED * f.speedMul * 0.9);
    f.jumping = true;
    f.jumpBuffer = 0;
    f.airJumpTime = w.time;
    w.emit({ t: 'jump', f: f.id, x: f.x, y: f.y, air: true });
    return true;
  }
  return false;
}

function stNormal(w: World, f: Fighter, inp: Intent, e: Edges, dt: number): void {
  if (f.h !== FIGHTER_H) restoreHeight(w, f);
  if (f.state !== 'normal') return;
  const mx = axis(inp.moveX);
  const speed = RUN_SPEED * f.speedMul * sprintMul(f);
  if (f.wallLock > 0 && !f.grounded) f.vx = approach(f.vx, mx * speed, AIR_DECEL * dt);
  else horizontalControl(f, mx, dt, speed);
  if (mx !== 0) f.facing = mx > 0 ? 1 : -1;

  // ladders
  if (inp.moveY < -0.5 && !inp.attack && onLadder(w, f)) {
    startClimb(w, f, false);
    return;
  }
  if (f.grounded && inp.moveY > 0.5 && ladderBelow(w, f) && !inp.attack) {
    startClimb(w, f, true);
    return;
  }

  if (f.upJumps && e.upP && !inp.attack) f.jumpBuffer = JUMP_BUFFER;
  if (f.jumpBuffer > 0 && (f.grounded || f.coyote > 0)) {
    if (inp.moveY > 0.5 && f.grounded && onOneWayOnly(w.map, f)) dropThrough(f);
    else doJump(w, f);
  } else if (e.jumpP && !f.grounded && f.coyote <= 0 && f.dropTimer <= 0) {
    airJump(w, f, mx);
  }
  const jumpHeld = inp.jump || (f.upJumps && inp.moveY < -0.5);
  if (f.jumping && f.vy < 0 && !jumpHeld) {
    f.vy *= JUMP_CUT;
    f.jumping = false;
  }
  if (f.vy >= 0) f.jumping = false;

  if (f.grounded) {
    if (e.downP && mx !== 0 && Math.abs(f.vx) > speed * 0.5) {
      startRoll(w, f);
      return;
    }
    if (inp.moveY > 0.5 && !e.jumpP && f.dropTimer <= 0) {
      setState(f, 'crouch');
      f.h = FIGHTER_CROUCH_H;
    }
  } else {
    if (e.downP && mx !== 0 && !onLadder(w, f)) {
      startDive(w, f);
      return;
    }
    if (f.vy > 0 && mx === f.facing && tryLedgeGrab(w, f)) return;
    if (f.vy > WALL_SLIDE_MAX * 0.5 && mx !== 0 && wallContact(w, f, mx) === mx) {
      f.wallSlide = mx;
      f.vy = Math.min(f.vy, WALL_SLIDE_MAX - GRAVITY * w.gravityAt(f.x, f.y - f.h / 2) * dt); // integrate() adds one tick of gravity
    }
    jetpack(w, f, inp, dt);
  }

  if (commonActions(w, f, inp, e)) return;
  integrate(w, f, dt);
}

/** Hold jump in the air (after the jump's rise) to fly. Fuel lives in the item's ammo. */
function jetpack(w: World, f: Fighter, inp: Intent, dt: number): void {
  const jp = f.inv[SLOT.GADGET];
  if (!jp || jp.id !== 'jetpack' || !inp.jump || f.jumping) return;
  f.vy = approach(f.vy, -175, 2300 * dt);
  f.jetting = true;
  jp.ammo -= dt;
  if (jp.ammo <= 0) {
    f.inv[SLOT.GADGET] = null;
    w.emit({ t: 'weaponBreak', f: f.id, weapon: 'jetpack', x: f.x, y: f.y - 12 });
    selectBestSlot(f);
  }
}

function stCrouch(w: World, f: Fighter, inp: Intent, e: Edges, dt: number): void {
  f.h = FIGHTER_CROUCH_H;
  const mx = axis(inp.moveX);
  if (mx !== 0) f.facing = mx > 0 ? 1 : -1;
  f.vx = approach(f.vx, mx * CRAWL_SPEED, GROUND_DECEL * dt);

  if (f.jumpBuffer > 0 && f.grounded) {
    if (onOneWayOnly(w.map, f)) {
      dropThrough(f);
      setState(f, 'normal');
      f.h = FIGHTER_H;
      integrate(w, f, dt);
      return;
    }
    if (hasHeadroom(w.map, f, FIGHTER_H)) {
      f.h = FIGHTER_H;
      setState(f, 'normal');
      doJump(w, f);
      integrate(w, f, dt);
      return;
    }
  }
  if ((inp.moveY <= 0.5 || !f.grounded) && hasHeadroom(w.map, f, FIGHTER_H)) {
    f.h = FIGHTER_H;
    setState(f, 'normal');
  }
  if (commonActions(w, f, inp, e)) return;
  integrate(w, f, dt);
}

function startRoll(w: World, f: Fighter): void {
  setState(f, 'roll');
  f.h = FIGHTER_ROLL_H;
  f.vx = f.facing * ROLL_SPEED;
  f.invuln = Math.max(f.invuln, ROLL_IFRAMES);
  w.emit({ t: 'roll', f: f.id });
}

function stRoll(w: World, f: Fighter, inp: Intent, dt: number): void {
  const t = f.stateTime;
  f.h = FIGHTER_ROLL_H;
  f.vx = f.facing * ROLL_SPEED * sprintMul(f) * (1 - (0.35 * t) / ROLL_TIME);
  if (t > 0.15 && f.jumpBuffer > 0 && f.grounded && hasHeadroom(w.map, f, FIGHTER_H)) {
    f.h = FIGHTER_H;
    setState(f, 'normal');
    doJump(w, f);
    integrate(w, f, dt);
    return;
  }
  const res = integrate(w, f, dt);
  if (t >= ROLL_TIME || (!f.grounded && t > 0.12) || res.wallX !== 0) {
    setState(f, inp.moveY > 0.5 && f.grounded ? 'crouch' : 'normal');
    restoreHeight(w, f);
  }
}

function startDive(w: World, f: Fighter): void {
  setState(f, 'dive');
  f.h = FIGHTER_ROLL_H;
  f.vx = f.facing * Math.max(DIVE_VX, Math.abs(f.vx));
  f.vy = Math.min(f.vy, DIVE_VY);
  f.jumping = false;
  w.emit({ t: 'dive', f: f.id });
}

function stDive(w: World, f: Fighter, dt: number): void {
  const res = integrate(w, f, dt);
  if (f.grounded) {
    startRoll(w, f);
    f.vx = f.facing * ROLL_SPEED;
    return;
  }
  if (res.wallX !== 0 || f.stateTime > 1.2) {
    setState(f, 'normal');
    restoreHeight(w, f);
  }
}

function stClimb(w: World, f: Fighter, inp: Intent, e: Edges, dt: number): void {
  f.x = approach(f.x, f.ladderX, 140 * dt);
  const my = Math.abs(inp.moveY) > 0.3 ? inp.moveY : 0;
  const mx = axis(inp.moveX);
  f.vx = 0;
  f.vy = my * CLIMB_SPEED;

  if (e.jumpP) {
    setState(f, 'normal');
    f.vy = -JUMP_VEL * 0.75;
    f.vx = mx * RUN_SPEED;
    f.jumping = true;
    w.emit({ t: 'jump', f: f.id, x: f.x, y: f.y });
    return;
  }
  if (mx !== 0 && my === 0 && Math.abs(inp.moveX) > 0.6) {
    setState(f, 'normal');
    f.vx = mx * RUN_SPEED * 0.6;
    f.facing = mx > 0 ? 1 : -1;
    return;
  }
  if (commonActionsLimited(w, f, e)) return;

  integrate(w, f, dt, false);
  const tx = Math.floor(f.x / TILE);
  const feetInLadder = w.map.isLadder(tx, Math.floor((f.y - 2) / TILE));
  const bodyInLadder = w.map.isLadder(tx, Math.floor((f.y - f.h / 2) / TILE));
  if (my < 0 && !feetInLadder && w.map.isLadder(tx, Math.floor((f.y + 3) / TILE))) {
    // popped out of the top: stand on the ladder top
    f.y = Math.floor((f.y + 3) / TILE) * TILE;
    f.vy = 0;
    f.grounded = true;
    setState(f, 'normal');
    return;
  }
  if (!feetInLadder && !bodyInLadder) {
    setState(f, 'normal');
    return;
  }
  if (my > 0 && moveRes.landed) setState(f, 'normal');
}

function tryLedgeGrab(w: World, f: Fighter): boolean {
  if (f.ledgeCooldown > 0 || f.h !== FIGHTER_H) return false;
  const handX = f.x + f.facing * (f.w / 2 + 2);
  const tx = Math.floor(handX / TILE);
  const handY = f.y - f.h + 3;
  const r0 = Math.floor((handY - 4) / TILE);
  const r1 = Math.floor((handY + 9) / TILE);
  for (let r = r0; r <= r1; r++) {
    const top = r * TILE;
    if (top < handY - 4 || top > handY + 9) continue;
    if (!w.map.isSolid(tx, r) || w.map.isSolid(tx, r - 1)) continue;
    // the fighter's own column must be free at the hang position
    const hangY = top + f.h - 3;
    const hangX = f.facing > 0 ? tx * TILE - f.w / 2 : (tx + 1) * TILE + f.w / 2;
    if (w.map.rectSolid(hangX - f.w / 2, hangY - f.h, hangX + f.w / 2, hangY)) continue;
    setState(f, 'ledge');
    f.x = hangX;
    f.y = hangY;
    f.vx = 0;
    f.vy = 0;
    f.ledgeTx = tx;
    f.ledgeTy = r;
    f.jumping = false;
    w.emit({ t: 'ledge', f: f.id });
    return true;
  }
  return false;
}

function stLedge(w: World, f: Fighter, inp: Intent, e: Edges): void {
  f.vx = 0;
  f.vy = 0;
  f.grounded = false;
  if (!w.map.isSolid(f.ledgeTx, f.ledgeTy)) {
    setState(f, 'normal');
    return;
  }
  const mx = axis(inp.moveX);
  if (e.jumpP || e.upP || (mx === f.facing && f.stateTime > 0.25)) {
    const top = f.ledgeTy * TILE;
    const toX = f.facing > 0 ? f.ledgeTx * TILE + f.w / 2 + 1 : (f.ledgeTx + 1) * TILE - f.w / 2 - 1;
    const probe = { ...f, x: toX, y: top };
    if (hasHeadroom(w.map, probe, FIGHTER_CROUCH_H)) {
      setState(f, 'ledgeClimb');
      f.lcFromX = f.x;
      f.lcFromY = f.y;
      f.lcToX = toX;
      f.lcToY = top;
      return;
    }
    // no room on top: hop up instead
    setState(f, 'normal');
    f.vy = -JUMP_VEL * 0.8;
    f.jumping = true;
    return;
  }
  if (e.downP) {
    setState(f, 'normal');
    f.ledgeCooldown = 0.35;
    return;
  }
  if (mx === -f.facing && e.jumpP === false && f.stateTime > 0.1 && Math.abs(inp.moveX) > 0.6) {
    setState(f, 'normal');
    f.vx = -f.facing * 70;
    f.ledgeCooldown = 0.35;
  }
}

function stLedgeClimb(w: World, f: Fighter): void {
  const t = Math.min(1, f.stateTime / LEDGE_CLIMB_TIME);
  // up first, then over
  const ty = Math.min(1, t * 1.6);
  const txp = Math.max(0, (t - 0.35) / 0.65);
  f.x = f.lcFromX + (f.lcToX - f.lcFromX) * txp;
  f.y = f.lcFromY + (f.lcToY - f.lcFromY) * ty;
  f.vx = 0;
  f.vy = 0;
  if (t >= 1) {
    f.x = f.lcToX;
    f.y = f.lcToY;
    f.grounded = true;
    setState(f, 'normal');
    restoreHeight(w, f);
  }
}

// ------------------------------------------------------------------ actions

function commonActions(w: World, f: Fighter, inp: Intent, e: Edges): boolean {
  if (e.attackP) {
    beginAttack(w, f, inp);
    return true;
  }
  if (e.kickP && f.kickCooldown <= 0) {
    startKick(w, f);
    return true;
  }
  if (e.interactP && interact(w, f)) return f.state !== 'normal' && f.state !== 'crouch';
  if (e.cycleP) cycleWeapon(w, f);
  if (e.gadgetP) quickGadget(w, f);
  return false;
}

/** Gadget button: use the gadget slot without switching to it (medkit). Passive gadgets ignore it. */
function quickGadget(w: World, f: Fighter): void {
  const g = f.inv[SLOT.GADGET];
  if (!g || weaponDef(g.id).gadget?.kind !== 'medkit') return;
  const prev = f.active;
  f.active = SLOT.GADGET;
  useMedkit(w, f);
  if (f.inv[prev] || prev === SLOT.MELEE) f.active = prev;
}

/** On ladders you can only cycle weapons / interact. */
function commonActionsLimited(w: World, f: Fighter, e: Edges): boolean {
  if (e.cycleP) cycleWeapon(w, f);
  if (e.interactP) interact(w, f);
  return false;
}

function beginAttack(w: World, f: Fighter, inp: Intent): void {
  if (f.carry >= 0) return;
  const def = activeWeapon(f);
  if (def.throw) {
    beginThrowable(w, f, def.throw, inp);
    return;
  }
  if (def.gadget?.kind === 'medkit') {
    useMedkit(w, f);
    return;
  }
  if (def.gun) {
    const item = activeItem(f);
    if (!item || item.ammo <= 0) {
      outOfAmmo(w, f);
      return;
    }
    enterAim(w, f, f.state === 'crouch' || (inp.moveY > 0.5 && f.grounded));
  } else {
    startMelee(w, f);
  }
}

function beginThrowable(w: World, f: Fighter, th: ThrowStats, inp: Intent): void {
  const item = activeItem(f)!;
  if (th.remote) {
    const live = w.items.filter((it) => it.active && it.live && it.thrownBy === f.id && it.weaponId === item.id);
    if (live.length > 0) {
      live.forEach((it, i) => (it.fuse = 0.02 + i * 0.06));
      w.emit({ t: 'pin', f: f.id, weapon: item.id });
      if (item.ammo <= 0) {
        f.inv[f.active] = null;
        selectBestSlot(f);
      }
      return;
    }
  }
  if (item.ammo <= 0) {
    f.inv[f.active] = null;
    selectBestSlot(f);
    return;
  }
  enterAim(w, f, f.state === 'crouch' || (inp.moveY > 0.5 && f.grounded));
}

function useMedkit(w: World, f: Fighter): void {
  const item = activeItem(f)!;
  if (f.hp >= MAX_HP) {
    w.emit({ t: 'empty', f: f.id });
    return;
  }
  const amount = Math.min(MAX_HP - f.hp, item.ammo);
  f.hp += amount;
  f.burn = 0;
  f.inv[f.active] = null;
  selectBestSlot(f);
  w.emit({ t: 'heal', f: f.id, amount });
}

/** Initial velocity of a throwable at the fighter's current aim and power. Shared with the arc preview. */
export function throwVelocity(f: Fighter, th: ThrowStats, power: number): { vx: number; vy: number } {
  const sp = th.speed * power;
  return {
    vx: Math.cos(f.aimAngle) * f.facing * sp + f.vx * 0.4,
    vy: Math.sin(f.aimAngle) * sp + Math.min(0, f.vy) * 0.3,
  };
}

export function throwPower(f: Fighter): number {
  return THROW_AIM.minPower + (1 - THROW_AIM.minPower) * Math.min(1, f.throwHold / THROW_AIM.rampTime);
}

/** Where a thrown object leaves the hand. */
export function throwOrigin(f: Fighter): { x: number; y: number } {
  const g = gunGeometry(f, activeWeapon(f));
  return { x: g.handX, y: g.handY + 2 };
}

function spawnLive(w: World, f: Fighter, id: string, x: number, y: number, vx: number, vy: number, fuse: number) {
  const it = w.spawnItem(id, 1, 1, x, y, vx, vy);
  it.live = true;
  it.thrownBy = f.id;
  it.fuse = fuse;
  it.vrot = f.facing * 12;
  it.noPickupTimer = 1e9;
  if (w.map.rectSolid(it.x - it.w / 2, it.y - it.h, it.x + it.w / 2, it.y)) {
    // don't spawn inside a wall: release from the body center instead
    it.x = f.x;
    it.y = f.y - 6;
  }
  return it;
}

function consumeThrowable(f: Fighter, slot: number): void {
  const inv = f.inv[slot];
  if (!inv) return;
  inv.ammo--;
  const th = weaponDef(inv.id).throw;
  if (inv.ammo <= 0 && !th?.remote) {
    f.inv[slot] = null;
    selectBestSlot(f);
  }
}

function throwIt(w: World, f: Fighter): void {
  const def = activeWeapon(f);
  const th = def.throw;
  const item = activeItem(f);
  if (!th || !item || item.ammo <= 0) return;
  const o = throwOrigin(f);
  let { vx, vy } = throwVelocity(f, th, throwPower(f));
  if (th.mine) {
    vx = f.facing * th.speed * 0.5 + f.vx * 0.3;
    vy = -60;
  }
  const fuse = th.cook ? Math.max(0.05, f.cook) : th.fuse > 0 ? th.fuse : -1;
  spawnLive(w, f, def.id, o.x, o.y, vx, vy, fuse);
  f.cook = -1;
  consumeThrowable(f, f.active);
  w.emit({ t: 'throwOut', f: f.id, weapon: def.id });
}

/** A cooked grenade leaves the hand without a throw (fuse ran out, knocked down, died). */
export function dropCooked(w: World, f: Fighter): void {
  const slot = SLOT.THROWABLE;
  const inv = f.inv[slot];
  const fuse = f.cook;
  f.cook = -1;
  if (!inv || inv.ammo <= 0) return;
  const it = spawnLive(w, f, inv.id, f.x + f.facing * 4, f.y - 8, f.vx * 0.5 + f.facing * 30, -80, Math.max(0, fuse));
  consumeThrowable(f, slot);
  if (fuse <= 0) detonate(w, it);
}

function meleeStats(f: Fighter) {
  return (activeWeapon(f).melee ?? FISTS.melee)!;
}

function startMelee(w: World, f: Fighter): void {
  const m = meleeStats(f);
  const step = f.comboTimer > 0 && f.combo < m.combo.length - 1 ? f.combo + 1 : 0;
  if (f.h !== FIGHTER_H && hasHeadroom(w.map, f, FIGHTER_H)) f.h = FIGHTER_H;
  setState(f, 'melee');
  f.combo = step;
  f.comboQueued = false;
  f.swingHit.length = 0;
  f.swingProps.length = 0;
  const hit = m.combo[step];
  if (f.grounded) f.vx = f.facing * (hit.lunge ?? 40);
  w.emit({ t: 'swing', f: f.id, weapon: activeWeapon(f).id, step });
}

function stMelee(w: World, f: Fighter, inp: Intent, e: Edges, dt: number): void {
  const m = meleeStats(f);
  const hit = m.combo[Math.min(f.combo, m.combo.length - 1)];
  const t = f.stateTime;
  const activeEnd = hit.windup + hit.active;
  const end = activeEnd + hit.recover;
  if (e.attackP && t > hit.windup * 0.5) f.comboQueued = true;
  if (f.grounded) f.vx = approach(f.vx, 0, GROUND_DECEL * 0.5 * dt);
  else f.vx = approach(f.vx, axis(inp.moveX) * RUN_SPEED * 0.6, AIR_ACCEL * 0.4 * dt);

  if (t >= hit.windup && t < activeEnd) meleeHitbox(w, f, hit, activeWeapon(f).id, 'melee', FIGHTER_H - 3, 6);

  const last = f.combo >= m.combo.length - 1;
  if (t >= activeEnd && e.kickP && f.kickCooldown <= 0) {
    startKick(w, f);
    return;
  }
  if (f.comboQueued && !last && t >= activeEnd + hit.recover * 0.35) {
    f.comboTimer = 0.3;
    startMelee(w, f);
    return;
  }
  if (t >= end) {
    f.comboTimer = last ? 0 : 0.3;
    setState(f, 'normal');
    if (f.comboQueued && last) f.comboTimer = 0;
  }
  integrate(w, f, dt);
}

/**
 * Melee hitbox in front of the fighter. yTop/yBot = distance above the feet.
 */
function meleeHitbox(w: World, f: Fighter, hit: MeleeHit, weapon: string, kind: 'melee' | 'kick', yTop: number, yBot: number): void {
  const near = f.x + f.facing * (f.w / 2 - 3);
  const far = f.x + f.facing * (f.w / 2 + hit.range);
  const l = Math.min(near, far);
  const r = Math.max(near, far);
  const t = f.y - yTop;
  const b = f.y - yBot;
  const mult = f.strengthBoost > 0 ? (weaponDef('strength').powerup?.mult ?? 1) : 1;
  const knockMul = 1 + (mult - 1) * 0.5;
  for (const p of w.props) {
    if (!p.active || f.swingProps.includes(p.id)) continue;
    if (p.x + p.w / 2 < l || p.x - p.w / 2 > r || p.y - p.h > b || p.y < t) continue;
    f.swingProps.push(p.id);
    pushProp(p, f.facing * hit.knockX * 0.8 * knockMul, Math.min(hit.knockY, -60) * 0.6);
    damageProp(w, p, hit.damage * mult, f.id);
  }
  for (const o of w.fighters) {
    if (o === f || o.gone || f.swingHit.includes(o.id)) continue;
    if (o.state === 'grabbed' && o.grabbedBy === f.id) continue;
    if (o.x + o.w / 2 < l || o.x - o.w / 2 > r || o.y - o.h > b || o.y < t) continue;
    f.swingHit.push(o.id);
    const connected = applyHit(w, o, {
      damage: hit.damage * mult,
      kbX: f.facing * hit.knockX * knockMul,
      kbY: hit.knockY * knockMul,
      attacker: f.id,
      weapon,
      kind,
      stun: hit.stun,
      knockdown: hit.knockdown,
      x: f.x + f.facing * (f.w / 2 + hit.range * 0.6),
      y: (t + b) / 2,
    });
    if (connected) wearMelee(w, f);
  }
}

function wearMelee(w: World, f: Fighter): void {
  const it = f.inv[SLOT.MELEE];
  if (!it || f.active !== SLOT.MELEE) return;
  it.dur -= 1;
  if (it.dur <= 0) {
    f.inv[SLOT.MELEE] = null;
    w.emit({ t: 'weaponBreak', f: f.id, weapon: it.id, x: f.x + f.facing * 8, y: f.y - 14 });
  }
}

function startKick(w: World, f: Fighter): void {
  if (f.h !== FIGHTER_H && hasHeadroom(w.map, f, FIGHTER_H)) f.h = FIGHTER_H;
  setState(f, 'kick');
  f.swingHit.length = 0;
  f.swingProps.length = 0;
  f.kickCooldown = KICK_COOLDOWN;
  f.airKick = !f.grounded;
  if (f.airKick) {
    f.vx = f.facing * Math.max(Math.abs(f.vx), 170);
    f.vy = Math.max(f.vy, -40);
  } else {
    f.vx = f.facing * (KICK.lunge ?? 30);
  }
  w.emit({ t: 'kick', f: f.id, air: f.airKick });
}

function stKick(w: World, f: Fighter, dt: number): void {
  const k = f.airKick ? AIR_KICK : KICK;
  const t = f.stateTime;
  if (!f.airKick) {
    f.vx = approach(f.vx, 0, GROUND_DECEL * 0.7 * dt);
    if (t >= k.windup && t < k.windup + k.active) meleeHitbox(w, f, k, 'kick', 'kick', 15, 3);
    integrate(w, f, dt);
    if (t >= k.windup + k.active + k.recover) setState(f, 'normal');
    return;
  }
  // flying kick: active until landing
  if (t >= k.windup && t < k.windup + k.active) meleeHitbox(w, f, k, 'kick', 'kick', 12, -2);
  integrate(w, f, dt);
  if (f.grounded || t > k.windup + k.active + 0.3) {
    setState(f, 'flinch');
    f.flinchTime = k.recover;
  }
}

function enterAim(w: World, f: Fighter, crouched: boolean): void {
  const wasAimRecently = w.time - f.aimEndTime < AIM_MEMORY;
  setState(f, 'aim');
  f.aimHeld = true;
  f.crouchAim = crouched;
  f.h = crouched ? FIGHTER_CROUCH_H : FIGHTER_H;
  const def = activeWeapon(f);
  if (!wasAimRecently) f.aimAngle = def.throw && !def.throw.mine ? THROW_AIM.defaultAngle : 0;
  f.aimVel = 0;
  f.pendingShot = 0;
  f.throwHold = 0;
  if (def.throw?.cook && f.cook < 0) {
    f.cook = def.throw.fuse;
    w.emit({ t: 'pin', f: f.id, weapon: def.id });
  }
  if (def.gun?.spinUp) {
    f.fireCooldown = Math.max(f.fireCooldown, def.gun.spinUp);
    w.emit({ t: 'spinUp', f: f.id });
  }
  if (def.gun?.auto && f.fireCooldown <= 0) fire(w, f);
}

function stAim(w: World, f: Fighter, inp: Intent, e: Edges, dt: number): void {
  const def = activeWeapon(f);
  const g = def.gun;
  const th = def.throw;
  if (!g && !th) {
    setState(f, 'normal');
    return;
  }
  const mx = axis(inp.moveX);
  f.h = f.crouchAim ? FIGHTER_CROUCH_H : FIGHTER_H;

  if (f.aimHeld) {
    if (mx !== 0 && mx !== f.facing) f.facing = mx > 0 ? 1 : -1;
    const my = Math.abs(inp.moveY) > 0.2 ? inp.moveY : 0;
    f.aimVel += (my * AIM_MAX_SPEED - f.aimVel) * Math.min(1, AIM_ACCEL * dt);
    f.aimAngle = clamp(f.aimAngle + f.aimVel * dt, -AIM_LIMIT, AIM_LIMIT);
    f.throwHold += dt;
    if (!inp.attack) {
      f.aimHeld = false;
      f.aimEndTime = w.time;
      f.stateTime = 0;
      if (th) throwIt(w, f);
      else if (g && !g.auto) {
        if (f.fireCooldown <= 0) fire(w, f);
        else f.pendingShot = 0.22;
      }
    } else if (g?.auto && f.fireCooldown <= 0) {
      fire(w, f);
    }
  } else {
    if (e.attackP) {
      enterAim(w, f, f.crouchAim);
      return;
    }
    if (f.pendingShot > 0) {
      f.pendingShot -= dt;
      if (f.fireCooldown <= 0) {
        fire(w, f);
        f.pendingShot = 0;
      }
    } else if (mx !== 0 || f.stateTime > 0.2 || e.jumpP) {
      setState(f, f.crouchAim && f.grounded && inp.moveY > 0.5 ? 'crouch' : 'normal');
      f.crouchAim = false;
      restoreHeight(w, f);
      if (e.jumpP && f.grounded && f.h === FIGHTER_H) doJump(w, f);
      integrate(w, f, dt);
      return;
    }
  }
  if (f.state !== 'aim') return;

  if (f.grounded) f.vx = approach(f.vx, 0, GROUND_DECEL * dt);
  else f.vx = approach(f.vx, 0, AIR_DECEL * dt);
  if (f.jumpBuffer > 0 && (f.grounded || f.coyote > 0) && !f.crouchAim) doJump(w, f);
  if (e.kickP && f.kickCooldown <= 0) {
    f.aimEndTime = w.time;
    startKick(w, f);
    return;
  }
  if (e.interactP) interact(w, f);
  integrate(w, f, dt);
}

export function fire(w: World, f: Fighter): void {
  const def = activeWeapon(f);
  const item = activeItem(f);
  const g = def.gun;
  if (!g || !item) return;
  if (item.ammo <= 0) {
    outOfAmmo(w, f);
    return;
  }
  item.ammo--;
  f.fireCooldown = 1 / g.fireRate;
  f.lastShotTime = w.time;
  const geo = gunGeometry(f, def);
  for (let i = 0; i < g.pellets; i++) {
    const a = f.aimAngle + (g.spread > 0 ? w.rng.range(-g.spread, g.spread) : 0);
    const spd = g.bulletSpeed * (g.pellets > 1 ? w.rng.range(0.85, 1.1) : 1);
    w.spawnBullet({
      x: geo.shoulderX,
      y: geo.shoulderY,
      vx: Math.cos(a) * f.facing * spd,
      vy: Math.sin(a) * spd,
      ox: geo.muzzleX,
      oy: geo.muzzleY,
      owner: f.id,
      weapon: def.id,
      damage: g.damage,
      range: g.range,
      falloff: g.falloff,
      knock: g.knockback,
      ricochet: g.ricochet,
      pierce: g.pierce,
      kind: g.projectile,
      gravity: g.gravity ?? 0,
      explosion: g.explosion ?? null,
      ignite: g.ignite ?? 0,
    });
  }
  f.vx -= geo.dirX * g.recoil;
  if (!f.grounded) f.vy -= geo.dirY * g.recoil * 0.6;
  w.emit({ t: 'shot', f: f.id, weapon: def.id, x: geo.muzzleX, y: geo.muzzleY, angle: Math.atan2(geo.dirY, geo.dirX) });
}

function outOfAmmo(w: World, f: Fighter): void {
  w.emit({ t: 'empty', f: f.id });
  tossWeapon(w, f, f.active, TOSS.speed * 0.8);
  if (f.state === 'aim') {
    f.aimEndTime = w.time;
    setState(f, 'normal');
    restoreHeight(w, f);
  }
}

/** Throw the weapon in a slot as a damaging projectile item. */
export function tossWeapon(w: World, f: Fighter, slot: number, speed: number): void {
  const it = f.inv[slot];
  if (!it) return;
  f.inv[slot] = null;
  const item = w.spawnItem(it.id, it.ammo, it.dur, f.x + f.facing * 6, f.y - 14, f.facing * speed + f.vx * 0.5, -90);
  item.thrownBy = f.id;
  item.thrownDmg = speed > 150 ? TOSS.damage : 0;
  item.noPickupBy = f.id;
  item.noPickupTimer = 0.6;
  item.vrot = f.facing * 18;
  w.emit({ t: 'toss', f: f.id, weapon: it.id });
  selectBestSlot(f);
}

export function selectBestSlot(f: Fighter): void {
  if (f.inv[f.active]) return;
  const order = [SLOT.HEAVY, SLOT.SIDEARM, SLOT.MELEE];
  for (const s of order) {
    if (f.inv[s]) {
      f.active = s;
      return;
    }
  }
  f.active = SLOT.MELEE;
}

export function cycleWeapon(w: World, f: Fighter): void {
  for (let k = 1; k <= 5; k++) {
    const s = (f.active + k) % 5;
    if (s === SLOT.MELEE || f.inv[s]) {
      f.active = s;
      break;
    }
  }
  w.emit({ t: 'cycle', f: f.id, weapon: activeWeapon(f).id });
}

// ------------------------------------------------------------------ interact / pickup / grab

function interact(w: World, f: Fighter): boolean {
  const item = w.findItemNear(f, ITEM_PICKUP_RANGE, f.id);
  if (item) {
    w.pickUp(f, item, true);
    return true;
  }
  if ((f.state === 'normal' || f.state === 'crouch') && f.grounded) {
    const p = findLiftableProp(w, f);
    if (p) {
      liftProp(w, f, p);
      return true;
    }
  }
  if (f.state === 'normal' || f.state === 'crouch') {
    const target = findGrabTarget(w, f);
    if (target) {
      startGrab(w, f, target);
      return true;
    }
  }
  // nothing to pick up or grab: throw the active weapon
  if (f.inv[f.active]) {
    tossWeapon(w, f, f.active, TOSS.speed);
    return true;
  }
  return false;
}

function findLiftableProp(w: World, f: Fighter): Prop | null {
  let best: Prop | null = null;
  let bestD = Infinity;
  for (const p of w.props) {
    if (!p.active || p.carriedBy >= 0 || p.fuse >= 0 || p.def.noCarry) continue;
    const dx = p.x - f.x;
    if (Math.abs(dx) > (f.w + p.w) / 2 + 6) continue;
    if (Math.abs(p.y - f.y) > 4) continue; // standing next to it, on the same floor
    if (Math.sign(dx) !== f.facing && Math.abs(dx) > 3) continue;
    if (Math.abs(dx) < bestD) {
      bestD = Math.abs(dx);
      best = p;
    }
  }
  return best;
}

function liftProp(w: World, f: Fighter, p: Prop): void {
  // need room overhead for the prop
  if (w.map.rectSolid(f.x - p.w / 2, f.y - FIGHTER_H - 1 - p.h, f.x + p.w / 2, f.y - FIGHTER_H - 1)) return;
  if (f.h !== FIGHTER_H) {
    if (!hasHeadroom(w.map, f, FIGHTER_H)) return;
    f.h = FIGHTER_H;
    setState(f, 'normal');
  }
  f.carry = p.id;
  p.carriedBy = f.id;
  p.thrownBy = -1;
  w.emit({ t: 'grab', f: f.id, victim: -1 });
}

function throwProp(w: World, f: Fighter, inp: Intent): void {
  const p = w.props.find((q) => q.id === f.carry);
  f.carry = -1;
  if (!p || !p.active) return;
  releaseProp(w, p);
  const up = inp.moveY < -0.5;
  const down = inp.moveY > 0.5;
  p.vx = f.facing * CARRY.throwX * (up ? 0.55 : down ? 0.35 : 1) + f.vx * 0.5;
  p.vy = up ? -330 : down ? -40 : CARRY.throwY;
  p.vrot = f.facing * 9;
  p.thrownBy = f.id;
  p.thrownT = w.time;
  p.lastBy = f.id;
  w.emit({ t: 'throw', f: f.id, victim: -1 });
}

function autoPickup(w: World, f: Fighter): void {
  const item = w.findItemNear(f, 2, f.id, true);
  if (item) w.pickUp(f, item, false);
}

function findGrabTarget(w: World, f: Fighter): Fighter | null {
  let best: Fighter | null = null;
  let bestD = Infinity;
  for (const o of w.fighters) {
    if (o === f || !o.alive || o.gone) continue;
    if (o.state === 'grabbed' || o.state === 'roll' || o.state === 'dive' || o.state === 'ledgeClimb' || o.invuln > 0) continue;
    if (!w.settings.friendlyFire && sameTeam(o, f)) continue;
    const dx = o.x - f.x;
    if (Math.abs(o.y - f.y) > 10) continue;
    if (Math.abs(dx) > GRAB_RANGE + o.w / 2) continue;
    if (Math.sign(dx) !== f.facing && Math.abs(dx) > 4) continue;
    if (Math.abs(dx) < bestD) {
      bestD = Math.abs(dx);
      best = o;
    }
  }
  return best;
}

function startGrab(w: World, f: Fighter, v: Fighter): void {
  w.releaseGrab(v);
  setState(f, 'grabbing');
  f.grabTarget = v.id;
  f.grabTimer = 0;
  f.knees = 0;
  f.h = FIGHTER_H;
  setState(v, 'grabbed');
  v.grabbedBy = f.id;
  v.struggle = 0;
  v.aimHeld = false;
  v.h = FIGHTER_H;
  w.emit({ t: 'grab', f: f.id, victim: v.id });
}

function stGrabbing(w: World, f: Fighter, inp: Intent, e: Edges, dt: number): void {
  const v = w.fighters[f.grabTarget];
  if (!v || !v.alive || v.state !== 'grabbed' || v.grabbedBy !== f.id) {
    f.grabTarget = -1;
    setState(f, 'normal');
    return;
  }
  f.grabTimer += dt;
  const mx = axis(inp.moveX);
  if (mx !== 0) f.facing = mx > 0 ? 1 : -1;
  f.vx = approach(f.vx, mx * 45, GROUND_ACCEL * dt);
  integrate(w, f, dt);
  if (!f.alive || f.state !== 'grabbing') return;

  // carry the victim in front
  let vx = f.x + f.facing * 9;
  const vy = f.y - 3;
  if (w.map.rectSolid(vx - v.w / 2, vy - v.h, vx + v.w / 2, vy)) vx = f.x;
  v.px = v.x;
  v.py = v.y;
  v.x = vx;
  v.y = vy;
  v.vx = f.vx;
  v.vy = 0;
  v.facing = f.facing > 0 ? -1 : 1;

  if ((e.attackP || e.interactP) && f.grabTimer > 0.08) {
    throwGrabbed(w, f, v, inp);
  } else if (e.kickP) {
    applyHit(w, v, { damage: GRAB.kneeDamage, kbX: 0, kbY: 0, attacker: f.id, weapon: 'knee', kind: 'melee' });
    f.knees++;
    w.emit({ t: 'kick', f: f.id, air: false });
    if (v.alive && f.knees >= GRAB.maxKnees) throwGrabbed(w, f, v, inp);
  } else if (f.grabTimer > GRAB_TIME_MAX || v.struggle >= GRAB.struggleToEscape) {
    w.releaseGrab(f);
    v.vx = f.facing * 120;
    f.vx = -f.facing * 90;
    w.emit({ t: 'escape', f: v.id });
  }
}

function throwGrabbed(w: World, f: Fighter, v: Fighter, inp: Intent): void {
  const up = inp.moveY < -0.5;
  const down = inp.moveY > 0.5;
  f.grabTarget = -1;
  setState(f, 'normal');
  v.grabbedBy = -1;
  setState(v, 'knockdown');
  v.thrownBy = f.id;
  v.thrownTime = w.time;
  v.lastAttacker = f.id;
  v.lastWeapon = 'throw';
  v.lastHitTime = w.time;
  v.vx = f.facing * THROW_SPEED_X * (up ? 0.55 : 1) + f.vx * 0.5;
  v.vy = up ? -360 : down ? 160 : THROW_SPEED_Y;
  v.grounded = false;
  v.vrot = f.facing * 14;
  applyHit(w, v, { damage: GRAB.throwDamage, kbX: 0, kbY: 0, attacker: f.id, weapon: 'throw', kind: 'throw' });
  w.emit({ t: 'throw', f: f.id, victim: v.id });
}

function stKnockdown(w: World, f: Fighter, dt: number): void {
  f.h = FIGHTER_ROLL_H;
  const thrown = f.thrownBy >= 0 && w.time - f.thrownTime < 1.5;
  if (!f.grounded) f.rot += f.vrot * dt;
  const res = integrate(w, f, dt);
  if (!f.alive) return;

  if (thrown && Math.abs(f.vx) + Math.abs(f.vy) > 200) {
    for (const o of w.fighters) {
      if (o === f || o.id === f.thrownBy || !o.alive || o.gone || f.swingHit.includes(o.id)) continue;
      if (Math.abs(o.x - f.x) > (o.w + f.w) / 2 || o.y - o.h > f.y || o.y < f.y - f.h) continue;
      f.swingHit.push(o.id);
      applyHit(w, o, {
        damage: GRAB.bodyslamDamage,
        kbX: Math.sign(f.vx) * 200,
        kbY: -140,
        attacker: f.thrownBy,
        weapon: 'bodyslam',
        kind: 'bodyslam',
        knockdown: true,
      });
      f.vx *= 0.4;
    }
  }
  if (res.wallX !== 0 && Math.abs(res.impactVx) > GRAB.wallSplatSpeed) {
    const dmg = (Math.abs(res.impactVx) - GRAB.wallSplatSpeed) * GRAB.wallSplatMul + 3;
    w.emit({ t: 'splat', f: f.id, x: f.x + res.wallX * 5, y: f.y - 10, speed: Math.abs(res.impactVx) });
    f.vx = -res.impactVx * 0.3;
    applyHit(w, f, { damage: dmg, kbX: 0, kbY: 0, attacker: -1, weapon: 'wall', kind: 'splat', ignoreInvuln: true });
    if (!f.alive) return;
  }
  if (res.landed) {
    if (res.impactVy > FALL_DAMAGE_SPEED) {
      const dmg = (res.impactVy - FALL_DAMAGE_SPEED) * 0.08 + 4;
      w.emit({ t: 'splat', f: f.id, x: f.x, y: f.y, speed: res.impactVy });
      applyHit(w, f, { damage: dmg, kbX: 0, kbY: 0, attacker: -1, weapon: 'floor', kind: 'splat', ignoreInvuln: true });
      if (!f.alive) return;
    }
    if (res.impactVy > 240) f.vy = -res.impactVy * 0.25;
  }
  if (f.grounded) {
    f.vx *= 0.84;
    f.rot = 0;
    if (f.stateTime > KNOCKDOWN_TIME && Math.abs(f.vx) < 30) {
      f.thrownBy = -1;
      f.swingHit.length = 0;
      setState(f, 'normal');
      f.invuln = Math.max(f.invuln, 0.25);
      restoreHeight(w, f);
    }
  }
}

// ------------------------------------------------------------------ corpses

function updateCorpse(w: World, f: Fighter): void {
  const dt = DT;
  f.stateTime += dt;
  f.vy = Math.min(f.vy + GRAVITY * w.gravityAt(f.x, f.y - f.h / 2) * dt, MAX_FALL);
  if (!f.grounded) f.rot += f.vrot * dt;
  moveBody(w.map, f, dt, {}, moveRes);
  conveyorPush(w, f);
  if (moveRes.wallX !== 0) {
    f.vx = -moveRes.impactVx * 0.35;
    f.vrot *= -0.5;
  }
  if (moveRes.landed) {
    if (moveRes.impactVy > 170) {
      f.vy = -moveRes.impactVy * 0.3;
      f.vrot *= 0.6;
      f.grounded = false;
      w.emit({ t: 'corpseLand', x: f.x, y: f.y, speed: moveRes.impactVy });
    }
  }
  if (f.grounded) {
    f.vx *= 0.86;
    // settle lying on the side we were spinning toward
    const target = Math.sin(f.rot) >= 0 ? Math.PI / 2 : -Math.PI / 2;
    const cur = Math.atan2(Math.sin(f.rot), Math.cos(f.rot));
    f.rot = cur + (target - cur) * 0.3;
    f.vrot = 0;
  }
  if (f.y > w.killY + 200) f.gone = true;
}
