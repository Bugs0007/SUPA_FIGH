import { applyHit, sameTeam } from './combat';
import { AIR_ACCEL, BLOCK, DT, FIGHTER_H, FIGHTER_W, GRAVITY, GROUND_ACCEL, GROUND_DECEL, JUMP_VEL, MAX_FALL, SPRINT_COOLDOWN, SPRINT_TAP_WINDOW } from './constants';
import { POWER_ORB } from './data/heroes';
import { createPokemon, POKE_BALL, pokemonEvolutionTime, pokemonStage, POKEMON_DAMAGE, POKEMON_TIMING, TRAINER_HP, trainerTeam, type PokemonMove, type PokemonSpecies, type PokemonState, type TrainerPartner, type TrainerState } from './data/pokemon';
import { createFighter, cycleWeapon, sprintMul, type Fighter } from './fighter';
import { outOfWorld } from './fall';
import type { Intent } from './intent';
import { moveBody, newMoveResult, onOneWayOnly, segmentAabb } from './physics';
import type { World } from './world';
import { pokemonAttack, pokemonAttackDuration, pokemonEmission, pokemonMelee } from './data/pokemonAttacks';
import { stepPokemonAttack } from './pokemonAttacks';

type Commands = { attackP: boolean; abilityP: boolean; kickP: boolean; gadgetP: boolean; cycleP: boolean };
const timing = POKEMON_TIMING;
const BLOCK_BRACE = 0.9;
const ORB_DASH_RANGE = 350;
const ORB_DASH_SPEED = 340;
const PARKED = -2;
const result = newMoveResult();
const RIDE_FLIGHT = { horizontal: 216, climb: 174, dive: 210, acceleration: 1320, takeoff: 96 } as const;
const RIDE_RUN_SPEED = 150;
function partner(w: World, owner: Fighter): Fighter | undefined {
  const t = owner.trainer!;
  if (t.slot < 0) t.slot = w.fighters.find(f => f.master === owner.id && f.pokemon?.species === t.species)?.id ?? -1;
  const member = trainerTeam(t).find(member => member.species === t.species);
  if (member) member.slot = t.slot;
  return w.fighters[t.slot];
}

function saveSelected(t: TrainerState): void {
  const member = trainerTeam(t).find(member => member.species === t.species);
  if (member) Object.assign(member, { slot: t.slot, stage: t.stage, cooldown: t.cooldown,
    shotCd: t.shotCd, dashCd: t.dashCd, ultimateCd: t.ultimateCd });
}

function selectMember(t: TrainerState, member: TrainerPartner): void {
  t.species = member.species;
  t.slot = member.slot;
  t.stage = member.stage;
  t.cooldown = member.cooldown;
  t.shotCd = member.shotCd;
  t.dashCd = member.dashCd;
  t.ultimateCd = member.ultimateCd;
}

function tickTeam(t: TrainerState): void {
  saveSelected(t);
  const team = trainerTeam(t);
  // A reserve is a real second chance, not a background respawn timer.  A knocked
  // out partner stays in its ball while any other teammate can still fight; only
  // after Ash has exhausted the whole team do their balls regenerate together.
  const teamWiped = team.length > 0 && team.every(member => member.cooldown > 0);
  for (const member of team) {
    if (teamWiped) member.cooldown = Math.max(0, member.cooldown - DT);
    member.shotCd = Math.max(0, member.shotCd - DT);
    member.dashCd = Math.max(0, member.dashCd - DT);
    member.ultimateCd = Math.max(0, member.ultimateCd - DT);
  }
  selectMember(t, t.team.find(member => member.species === t.species)!);
}

/** The opponent a trainer has in play, excluding a partner already returning to its ball. */
export function deployedPartner(w: World, trainer: Fighter): Fighter | undefined {
  const active = w.fighters[trainer.trainer?.active ?? -1];
  return active?.alive && !active.gone && active.master === trainer.id &&
    active.pokemon && active.pokemon.move !== 'recall' ? active : undefined;
}

/** Health stays locked until a released partner has finished returning to its ball. */
export function trainerProtected(w: World, trainer: Fighter): boolean {
  const f = w.fighters[trainer.trainer?.active ?? -1];
  return !!(f && !f.gone && f.master === trainer.id && f.pokemon &&
    (f.alive || f.pokemon.move === 'ko' && f.pokemon.age < timing.faint + timing.recall));
}

function changeMove(p: PokemonState, move: PokemonMove): void {
  p.move = move;
  p.age = 0;
  p.fired = false;
  p.shots = 0;
  p.queued = false;
  p.recalling = false;
  p.stuckFor = 0;
  p.followDistance = -1;
}

function deploy(w: World, owner: Fighter, f: Fighter, previousStage?: number): void {
  const t = owner.trainer!;
  const stage = pokemonStage(t.species, t.stage);
  const recalledHp = f.pokemon?.move === 'recall' && f.pokemon.stage === t.stage ? f.hp : stage.hp;
  const x = owner.x + owner.facing * (owner.w + stage.width) / 2;
  const clear = !w.map.rectSolid(x - stage.width / 2, owner.y - stage.height, x + stage.width / 2, owner.y);
  Object.assign(f, createFighter(f.id, {
    name: stage.name, team: f.team, isBot: false, upJumps: false, master: owner.id, companion: t.species,
  }, clear ? x : owner.x, owner.y));
  const p = createPokemon(t.species, t.stage);
  f.pokemon = p;
  f.w = stage.width;
  f.h = stage.height;
  f.maxHp = stage.hp;
  f.hp = previousStage === undefined ? Math.min(recalledHp, stage.hp) : stage.hp;
  f.facing = owner.facing;
  f.invuln = 0.48;
  f.grounded = owner.grounded;
  t.active = f.id;
  t.cooldown = 0;
  t.pending = '';
  t.attackHeld = 0;
  if (previousStage !== undefined) {
    p.previousStage = previousStage;
    f.invuln = timing.release + pokemonEvolutionTime(p.species, p.stage, previousStage);
  }
  changeMove(p, 'release');
  saveSelected(t);
}

export function selectedPartnerBall(f: Fighter): boolean {
  return f.inv[f.active]?.id === POKE_BALL;
}

function beginRecall(w: World, owner: Fighter, f: Fighter): void {
  unmount(w, owner, f);
  w.releaseGrab(f);
  f.pokemon!.holding = false;
  f.pokemon!.perched = false;
  f.vx = f.vy = 0;
  f.flying = false;
  f.state = 'normal';
  changeMove(f.pokemon!, 'recall');
}

function unmount(w: World, owner: Fighter, f: Fighter): void {
  const t = owner.trainer!;
  if (!t.mounted) return;
  const p = f.pokemon!;
  if (p.holding) w.releaseGrab(f);
  p.holding = false;
  t.mounted = false;
  t.blockHeld = 0;
  p.mounted = false;
  f.sprintDir = 0;
  f.sprintTime = 0;
  f.lastTapDir = 0;
  owner.w = FIGHTER_W;
  owner.h = FIGHTER_H;
  owner.flying = false;
  owner.grounded = false;
  owner.vx = f.vx * 0.55;
  owner.vy = -125;
  const x = f.x - f.facing * (f.w + owner.w) / 2;
  const y = f.y - f.h * 0.45;
  if (!w.map.rectSolid(x - owner.w / 2, y - owner.h, x + owner.w / 2, y)) {
    owner.x = x;
    owner.y = y;
  }
  owner.invuln = Math.max(owner.invuln, 0.25);
  changeMove(p, 'follow');
}

export function knockOutPokemon(w: World, f: Fighter): void {
  const owner = w.fighters[f.master];
  w.releaseGrab(f);
  if (owner?.trainer) {
    unmount(w, owner, f);
    owner.trainer.active = f.id;
    const member = trainerTeam(owner.trainer).find(member => member.species === f.pokemon!.species);
    if (member) member.cooldown = timing.knockout;
    if (owner.trainer.species === f.pokemon!.species) owner.trainer.cooldown = timing.knockout;
    owner.trainer.blockHeld = 0;
    owner.trainer.attackHeld = 0;
  }
  f.hp = 0;
  f.alive = false;
  f.state = 'dead';
  f.vx = f.vy = 0;
  f.flying = false;
  changeMove(f.pokemon!, 'ko');
  f.pokemon!.perched = false;
}

export function recallPokemon(w: World, owner: Fighter): void {
  for (const f of w.fighters) {
    if (f.master !== owner.id || !f.pokemon || !f.alive) continue;
    knockOutPokemon(w, f);
    f.gone = true;
  }
  owner.trainer!.active = -1;
  owner.trainer!.pending = '';
}

export function evolvePartner(w: World, owner: Fighter, species?: PokemonSpecies): void {
  const t = owner.trainer!;
  saveSelected(t);
  const active = w.fighters[t.active];
  const selectedSpecies = species ?? (active && !active.gone ? active.pokemon?.species : undefined) ?? t.species;
  const member = trainerTeam(t).find(member => member.species === selectedSpecies);
  if (!member) return;
  if (member.slot < 0) member.slot = w.fighters.find(f => f.master === owner.id && f.pokemon?.species === selectedSpecies)?.id ?? -1;
  const f = w.fighters[member.slot];
  if (!f?.pokemon) return;
  const before = member.stage;
  const previous = pokemonStage(member.species, before);
  member.stage = Math.min(before + 1, previous.maxStage);
  member.cooldown = member.shotCd = member.dashCd = member.ultimateCd = 0;
  if (t.species === member.species) selectMember(t, member);
  const stage = pokemonStage(member.species, member.stage);
  const p = f.pokemon;
  if (!f.alive || p.move === 'recall') {
    // A stored partner evolves in its ball. Only a selected Attack releases it.
    p.previousStage = p.move === 'ko' || p.move === 'recall' || p.stage === before
      ? Math.min(before, p.previousStage) : before;
    p.stage = member.stage;
    f.name = stage.name;
    f.w = stage.width;
    f.h = stage.height;
    f.hp = f.maxHp = stage.hp;
    if (p.move !== 'recall' && p.move !== 'ko') changeMove(p, 'evolve');
    return;
  }
  f.name = stage.name;
  f.w = stage.width;
  f.h = stage.height;
  f.hp = f.maxHp = stage.hp;
  w.releaseGrab(f);
  p.holding = false;
  f.state = 'normal';
  p.previousStage = before;
  p.stage = member.stage;
  if (w.map.rectSolid(f.x - f.w / 2, f.y - f.h, f.x + f.w / 2, f.y) || p.perched && !canPerch(f)) {
    beginRecall(w, owner, f);
    return;
  }
  f.invuln = Math.max(f.invuln, pokemonEvolutionTime(p.species, p.stage, before));
  changeMove(p, 'evolve');
}

function visibleEnemy(w: World, owner: Fighter, sight: Fighter, melee = false): Fighter | undefined {
  let target: Fighter | undefined;
  let trainer: Fighter | undefined;
  let distance = melee ? Infinity : 440;
  let trainerDistance = distance;
  const y = sight.y - sight.h * 0.55;
  const seenDistance = (enemy: Fighter, range: number): number => {
    if (enemy === owner || enemy.master === owner.id || !enemy.alive || enemy.gone
      || enemy.trainer?.mounted || enemy.pokemon?.move === 'recall' || sameTeam(owner, enemy)) return Infinity;
    const ey = enemy.y - enemy.h * 0.5;
    const d = Math.hypot(enemy.x - sight.x, ey - y);
    return d < range && (melee || w.map.clearShot(sight.x, y, enemy.x, ey)) ? d : Infinity;
  };
  for (const enemy of w.fighters) {
    const d = seenDistance(enemy, enemy.trainer ? trainerDistance : distance);
    if (!Number.isFinite(d)) continue;
    if (enemy.trainer) {
      trainerDistance = d;
      trainer = enemy;
    } else {
      distance = d;
      target = enemy;
    }
  }
  return target ?? trainer;
}

function command(w: World, owner: Fighter, f: Fighter, move: 'punch' | 'kick' | 'shot' | 'dash' | 'ultimate'): boolean {
  const p = f.pokemon!;
  const melee = move === 'punch' || move === 'kick';
  const enemy = move === 'dash' ? undefined : visibleEnemy(w, owner, melee || p.mounted ? f : owner, melee);
  if (melee && !enemy) return false;
  let x = enemy?.x ?? f.x + owner.facing * 130;
  let y = enemy?.y ?? (melee || move === 'dash' ? f.y : f.y + pokemonEmission(p.species, p.stage)[1]);
  if (move === 'dash') {
    let range = ORB_DASH_RANGE;
    for (const item of w.items) {
      if (!item.active || item.weaponId !== POWER_ORB) continue;
      const distance = Math.hypot(item.x - f.x, item.y - f.y);
      if (distance >= range || !w.map.clearShot(f.x, f.y - f.h / 2, item.x, item.y - item.h / 2)) continue;
      range = distance;
      x = item.x;
      y = item.y;
    }
    if (range === ORB_DASH_RANGE) return false;
  }
  const approaching = p.move === 'punch' && !p.fired;
  if (move === 'punch' && approaching && p.target === enemy?.id) return true;
  if (move === 'punch' && !approaching) {
    f.combo = f.comboTimer > 0 ? (f.combo + 1) % 3 : 0;
    f.comboTimer = 0;
  }
  changeMove(p, move);
  if (p.perched) {
    p.perched = false;
    f.vy = -65;
    f.grounded = false;
  }
  if (f.state === 'block') f.state = 'normal';
  p.target = enemy?.id ?? -1;
  if (melee) p.engaged = p.target;
  p.goalX = x;
  p.goalY = y;
  if (Math.abs(p.goalX - f.x) > 1) f.facing = p.goalX > f.x ? 1 : -1;
  return true;
}

export function stepTrainer(w: World, owner: Fighter, input: Intent, edge: Commands): boolean {
  const t = owner.trainer!;
  owner.maxHp = TRAINER_HP;
  owner.hp = Math.min(owner.hp, TRAINER_HP);
  tickTeam(t);
  const carrying = w.fighters[t.active];
  if (t.mounted && carrying?.pokemon && !pokemonStage(carrying.pokemon.species, carrying.pokemon.stage).rideable) unmount(w, owner, carrying);
  t.blockHeld = input.block ? t.blockHeld + DT : 0;
  if (edge.cycleP) {
    cycleWeapon(w, owner);
    edge.cycleP = false;
    t.attackHeld = 0;
  }
  const selected = selectedPartnerBall(owner);
  const ballSpecies = selected ? owner.inv[owner.active]?.pokemon ?? t.species : undefined;
  if (ballSpecies && ballSpecies !== t.species) {
    const member = t.team.find(member => member.species === ballSpecies);
    if (member) {
      saveSelected(t);
      selectMember(t, member);
      t.pending = '';
      t.blockHeld = t.attackHeld = 0;
      const previous = w.fighters[t.active];
      if (previous?.alive && previous.pokemon?.move !== 'recall') beginRecall(w, owner, previous);
    }
  }
  if (!selected) t.pending = '';
  const f = partner(w, owner);
  const { attackP, abilityP, kickP, gadgetP } = edge;
  edge.abilityP = edge.gadgetP = false;
  const current = w.fighters[t.active];
  if (current?.gone) t.active = -1;
  if (current && !current.gone && (current !== f || !current.alive && t.cooldown > 0 || current.pokemon?.move === 'recall')) {
    if (selected && f && t.cooldown <= 0 && attackP) t.pending = t.species;
    // A fainted partner cannot command attacks, but its exposed human may still punch or kick.
    if (current.alive || current !== f || t.pending) edge.attackP = edge.kickP = false;
    t.attackHeld = 0;
    return false;
  }
  if (!f?.alive) {
    t.attackHeld = 0;
    if (selected && f && t.cooldown <= 0 && (attackP || t.pending === t.species)) {
      const stored = f.pokemon;
      const pending = stored?.stage === t.stage && stored.previousStage < stored.stage ? stored.previousStage : undefined;
      deploy(w, owner, f, pending);
      edge.attackP = edge.kickP = false;
    }
    return false;
  }
  const p = f.pokemon!;
  edge.attackP = edge.kickP = false;
  if (p.move === 'guard' && owner.prev.block && !input.block && !p.recalling) p.age = 0;
  if (t.mounted && gadgetP) {
    unmount(w, owner, f);
    t.attackHeld = 0;
    return false;
  }
  if (p.move === 'recall') return false;
  if (!selected || abilityP || kickP) {
    t.attackHeld = 0;
  } else if (input.attack) {
    if (attackP || t.attackHeld > 0) t.attackHeld = (t.attackHeld || 0) + DT;
    if (t.attackHeld >= timing.holdToRecall) {
      t.attackHeld = 0;
      beginRecall(w, owner, f);
      return false;
    }
  } else {
    t.attackHeld = 0;
  }
  const ready = (p.move === 'follow' || p.move === 'guard' || p.move === 'carry' || p.move === 'punch' && !p.fired) &&
    f.state !== 'flinch' && f.state !== 'knockdown' && f.state !== 'grabbed';
  if (selected && attackP && !input.block && p.move === 'punch' && p.fired) p.queued = true;
  if (ready && !t.mounted && !p.recalling && f.state === 'block' && t.blockHeld >= timing.holdToMount && pokemonStage(p.species, p.stage).rideable) {
    p.engaged = -1;
    changeMove(p, 'mount');
  } else if (selected && ready && (t.mounted || !input.block)) {
    if (p.move === 'guard' && (attackP || abilityP || kickP)) {
      changeMove(p, 'follow');
      partnerGuard(f, false);
    }
    if ((abilityP && input.kick || kickP && input.ability) && t.ultimateCd <= 0) {
      t.ultimateCd = 5.5;
      command(w, owner, f, 'ultimate');
    } else if (abilityP && t.shotCd <= 0) {
      t.shotCd = 0.85;
      command(w, owner, f, 'shot');
    } else if (kickP && t.dashCd <= 0 &&
      (input.moveY < -0.3 && command(w, owner, f, 'dash') || command(w, owner, f, 'kick'))) {
      t.dashCd = 1.2;
    } else if (attackP) command(w, owner, f, 'punch');
  }
  saveSelected(t);
  return t.mounted;
}

function flyToward(f: Fighter, x: number, y: number, speed: number): void {
  const dx = x - f.x;
  const dy = y - f.y;
  const d = Math.hypot(dx, dy);
  const v = d ? Math.min(speed / d, 1 / DT) : 0;
  f.vx = dx * v;
  f.vy = dy * v;
}

function rideAxis(value: number): number {
  return Math.abs(value) < 0.15 ? 0 : Math.max(-1, Math.min(1, value));
}

function rideVertical(input: Intent): number {
  const vertical = rideAxis(input.moveY);
  return vertical > 0 || !input.jump ? vertical : -1;
}

/** The mounted trainer returns before the fighter sprint controller runs. */
function updateMountedSprint(w: World, f: Fighter, p: PokemonState, input: Intent): void {
  const direction = Math.abs(input.moveX) > 0.25 ? Math.sign(input.moveX) : 0;
  const previous = Math.abs(f.prev.moveX) > 0.25 ? Math.sign(f.prev.moveX) : 0;
  const ready = p.mounted && f.state === 'normal' && !input.block;
  f.sprintCooldown = Math.max(0, f.sprintCooldown - DT);
  if (ready && direction && direction !== previous) {
    if (direction === f.lastTapDir && w.time - f.lastTapTime < SPRINT_TAP_WINDOW && f.sprintCooldown === 0) {
      f.sprintDir = direction;
      f.sprintTime = 0;
      w.emit({ t: 'sprint', f: f.id });
    }
    f.lastTapDir = direction;
    f.lastTapTime = w.time;
  }
  if (f.sprintDir && (!ready || direction !== f.sprintDir)) {
    f.sprintDir = 0;
    f.sprintTime = 0;
    f.sprintCooldown = SPRINT_COOLDOWN;
  } else if (f.sprintDir) f.sprintTime += DT;
  if (!ready) f.lastTapDir = 0;
  f.prev.moveX = input.moveX;
}

function steerFlyingMount(f: Fighter, input: Intent): void {
  const horizontal = rideAxis(input.moveX);
  const vertical = rideVertical(input);
  const diagonal = Math.max(1, Math.hypot(horizontal, vertical));
  const thrustX = horizontal * RIDE_FLIGHT.horizontal * sprintMul(f) / diagonal;
  const thrustY = vertical * (vertical > 0 ? RIDE_FLIGHT.dive : RIDE_FLIGHT.climb) / diagonal;
  const step = RIDE_FLIGHT.acceleration * DT;
  f.vx += Math.max(-step, Math.min(step, thrustX - f.vx));
  f.vy += Math.max(-step, Math.min(step, thrustY - f.vy));
  if (Math.abs(f.vx) > 16) f.facing = f.vx > 0 ? 1 : -1;
}

function steerGroundMount(w: World, f: Fighter, input: Intent, jumpPressed: boolean): void {
  const horizontal = rideAxis(input.moveX);
  const target = horizontal * RIDE_RUN_SPEED * sprintMul(f);
  const acceleration = f.grounded ? horizontal ? GROUND_ACCEL : GROUND_DECEL : AIR_ACCEL;
  const step = acceleration * DT;
  f.vx += Math.max(-step, Math.min(step, target - f.vx));
  if (horizontal) f.facing = horizontal > 0 ? 1 : -1;
  if (!f.grounded) return;
  if (rideVertical(input) > 0 && onOneWayOnly(w.map, f)) {
    f.dropTimer = 0.2;
    f.vy = 65;
  } else if (jumpPressed) f.vy = -JUMP_VEL;
}

function syncRider(owner: Fighter, mount: Fighter): void {
  owner.x = mount.x;
  owner.y = mount.y - mount.h * 0.34;
  owner.facing = mount.facing;
}

function walkToward(w: World, f: Fighter, x: number, y: number, speed: number, gain = 10): void {
  const dx = x - f.x;
  f.vx = Math.max(-speed, Math.min(speed, dx * gain));
  if (f.grounded && y > f.y + 16 && Math.abs(dx) < 24 && onOneWayOnly(w.map, f)) {
    f.dropTimer = 0.2;
    f.vy = Math.max(f.vy, 65);
    return;
  }
  if (f.grounded && (y < f.y - 9 || Math.abs(dx) > 14 && w.map.solidAtPx(f.x + Math.sign(dx) * (f.w / 2 + 3), f.y - 5))) {
    f.vy = -270;
  }
}

function partnerGuard(f: Fighter, raised: boolean): void {
  if (raised && f.guard > 0 && f.state !== 'block') {
    f.state = 'block';
    f.parryT = 0.085;
  } else if (!raised && f.state === 'block') f.state = 'normal';
}

function trainerClimbing(owner: Fighter): boolean {
  return owner.state === 'climb' || owner.state === 'wallwalk' || owner.state === 'ledge'
    || owner.state === 'ledgeClimb' || owner.flying;
}

function canPerch(f: Fighter): boolean {
  return f.h < FIGHTER_H * 0.85 && f.w < FIGHTER_W * 1.7;
}

function perchOnTrainer(w: World, f: Fighter, owner: Fighter): void {
  const p = f.pokemon!;
  const fromX = f.x;
  const fromY = f.y;
  w.releaseGrab(f);
  changeMove(p, 'follow');
  p.perched = true;
  p.engaged = -1;
  p.goalX = fromX;
  p.goalY = fromY;
  f.state = 'normal';
  f.flying = false;
  f.grounded = false;
  f.vx = f.vy = 0;
  f.x = owner.x - owner.facing * (owner.w * 0.45 + f.w * 0.3);
  f.y = owner.y - owner.h * 0.48;
}

function follow(w: World, f: Fighter, owner: Fighter, guard: boolean): boolean {
  const x = owner.x + owner.facing * ((f.w + owner.w) / 2 + (guard ? 3 : 9));
  const delta = x - f.x;
  const p = f.pokemon!;
  const stage = pokemonStage(p.species, p.stage);
  const distance = Math.hypot(delta, owner.y - f.y);
  const climbing = trainerClimbing(owner);
  const highGap = owner.y < f.y - 24;
  const close = Math.abs(f.x - owner.x) < (f.w + owner.w) / 2 + 16 && Math.abs(f.y - owner.y) < FIGHTER_H;
  if (!stage.flies && (climbing || highGap) && canPerch(f) && close) {
    perchOnTrainer(w, f, owner);
    return false;
  }
  if (!stage.flies && climbing && !canPerch(f)) {
    beginRecall(w, owner, f);
    return false;
  }
  const wall = w.map.solidAtPx(f.x + Math.sign(delta) * (f.w / 2 + 3), f.y - f.h * 0.7);
  const obstructed = distance > 24 && (wall || climbing || highGap);
  const stalled = obstructed && p.followDistance >= 0 && distance >= p.followDistance - 0.2;
  p.stuckFor = !obstructed ? 0 : stalled ? (p.stuckFor ?? 0) + DT : Math.max(0, (p.stuckFor ?? 0) - DT * 0.35);
  p.followDistance = distance;
  if (p.stuckFor >= 1) {
    // An unreachable partner returns visibly through its ball instead of snapping across terrain.
    beginRecall(w, owner, f);
    return false;
  }
  f.facing = guard || Math.abs(delta) < 4 ? owner.facing : delta > 0 ? 1 : -1;
  f.flying = stage.flies && (!owner.grounded || owner.y - f.y < -12 || guard && Math.abs(delta) > 32);
  if (f.flying) flyToward(f, x, owner.y, guard ? 410 : 225);
  else walkToward(w, f, x, owner.y, guard ? 410 : 230, guard ? 16 : 10);
  const arrived = Math.abs(delta) < 8 && Math.abs(owner.y - f.y) < 14 && w.map.clearShot(f.x, f.y - f.h / 2, owner.x, owner.y - owner.h / 2);
  partnerGuard(f, guard && arrived);
  return arrived;
}

function engagedEnemy(w: World, id: number): Fighter | undefined {
  const enemy = w.fighters[id];
  return enemy?.alive && !enemy.gone && !enemy.trainer?.mounted ? enemy : undefined;
}

function approachEnemy(w: World, f: Fighter, enemy: Fighter, speed: number, gap: number): void {
  const dx = enemy.x - f.x;
  if (Math.abs(dx) > 1) f.facing = dx > 0 ? 1 : -1;
  const distance = (f.w + enemy.w) / 2 + gap;
  const x = enemy.x - f.facing * distance;
  if (f.flying) flyToward(f, x, enemy.y, speed);
  else walkToward(w, f, x, enemy.y, speed);
}

function contact(w: World, f: Fighter, p: PokemonState, ultimate: boolean): void {
  const target = engagedEnemy(w, p.target);
  if (!target) return;
  const punch = p.move === 'punch';
  const finisher = punch && f.combo === 2;
  const melee = pokemonMelee(p.species, p.stage, !punch || finisher);
  const close = Math.abs(target.x - f.x) <= (target.w + f.w) / 2 + (ultimate ? 9 : melee.reach) &&
    target.y >= f.y - f.h - 8 && target.y - target.h <= f.y + 8;
  if (!close && !p.holding) {
    if (!ultimate && !p.fired) p.shots = 0;
    return;
  }
  if (ultimate && p.age < timing.ultimateHit) {
    if (!p.holding && target.state !== 'block' && target.invuln <= 0 && target.grabbedBy < 0) {
      w.releaseGrab(target);
      f.grabTarget = target.id;
      target.grabbedBy = f.id;
      target.state = 'grabbed';
      target.stateTime = 0;
      p.holding = true;
    }
    return;
  }
  if (ultimate && p.fired) return;
  if (!ultimate) {
    if (!p.fired) {
      if (++p.shots * DT < melee.windup) return;
      p.age = 0;
      p.shots = 0;
    } else if (p.shots >= melee.hits || p.age + DT / 2 < p.shots * melee.interval) return;
    p.shots++;
  }
  p.fired = true;
  if (p.holding) {
    w.releaseGrab(f);
    p.holding = false;
  }
  const tier = pokemonStage(p.species, p.stage).damageTier;
  const finalHit = ultimate || p.shots === melee.hits;
  if (punch) f.comboTimer = 0.9;
  applyHit(w, target, {
    damage: ultimate ? POKEMON_DAMAGE.seismicToss : (punch ? POKEMON_DAMAGE.punch : POKEMON_DAMAGE.kick)[tier] * (finisher ? 1.3 : 1) / melee.hits,
    attacker: f.id, weapon: punch ? 'ash:punch' : 'ash:tackle', kind: p.move === 'kick' ? 'kick' : 'melee',
    kbX: f.facing * (ultimate ? 148 : !finalHit ? 18 : finisher ? 145 : punch ? 38 : melee.knockX), kbY: ultimate ? 125 : !finalHit ? -8 : finisher ? -105 : melee.knockY,
    stun: ultimate ? 0.35 : finisher ? 0.24 : melee.stun, knockdown: ultimate || finalHit && (finisher || !punch && p.stage > 0),
    x: f.x + f.facing * f.w / 2, y: f.y - f.h * 0.5,
  });
}

function movePokemon(w: World, f: Fighter, p: PokemonState, owner: Fighter, jumpPressed: boolean): void {
  const input = owner.prev;
  const guard = input.block;
  const stage = pokemonStage(p.species, p.stage);
  f.flying = stage.flies && (p.mounted || p.move === 'mount');
  const melee = p.move === 'punch' || p.move === 'kick';
  const readyToGuard = p.move === 'follow' || p.move === 'guard' || p.move === 'dash' || p.move === 'shot' || p.move === 'ultimate' || melee;
  if (!p.mounted && guard && readyToGuard && p.move !== 'guard') {
    if (p.holding) w.releaseGrab(f);
    p.holding = false;
    changeMove(p, 'guard');
    p.engaged = -1;
    p.recalling = true;
  }
  const braced = p.move === 'guard' && (guard || p.recalling || p.age < BLOCK_BRACE);
  if (!p.mounted && braced) {
    const returning = p.recalling;
    const arrived = follow(w, f, owner, true);
    if (p.move === 'guard') {
      p.recalling = !arrived;
      if (arrived && returning) p.age = 0;
    }
    return;
  }
  if (melee) {
    if (p.fired) {
      f.vx = engagedEnemy(w, p.target) ? f.vx * 0.7 : 0;
      if (p.mounted && f.flying) f.vy *= 0.7;
      return;
    }
    let enemy = engagedEnemy(w, p.target);
    if (!enemy) {
      enemy = visibleEnemy(w, owner, f, true);
      if (!enemy) {
        p.engaged = PARKED;
        changeMove(p, p.mounted ? 'carry' : 'follow');
        return;
      }
      p.target = p.engaged = enemy.id;
    }
    if (stage.flies && enemy.y < f.y - 12) f.flying = true;
    const contactGap = pokemonMelee(p.species, p.stage, p.move === 'kick' || f.combo === 2).reach;
    approachEnemy(w, f, enemy, p.move === 'kick' ? 340 : 285, Math.max(4, contactGap - 5));
    return;
  }
  if (p.move === 'dash' || seismicToss(p)) {
    if (p.holding) {
      f.flying = true;
      f.vx = f.facing * (p.age < 0.4 ? 55 : 105);
      f.vy = p.age < 0.38 ? -190 : 275;
    } else if (!p.fired) {
      const speed = p.move === 'dash' ? ORB_DASH_SPEED : 380;
      f.flying = !p.mounted || stage.flies;
      if (f.flying) flyToward(f, p.goalX, p.goalY, speed);
      else walkToward(w, f, p.goalX, p.goalY, speed);
    } else f.vx *= 0.82;
  } else if (p.mounted) {
    if (stage.flies) steerFlyingMount(f, input);
    else steerGroundMount(w, f, input, jumpPressed);
    if (guard && p.move === 'carry' && f.state !== 'block' && f.guard > 0) {
      f.state = 'block';
      f.parryT = 0.085;
    } else if (!guard && f.state === 'block') f.state = 'normal';
  } else if (p.move === 'mount') {
    if (stage.flies) flyToward(f, owner.x, owner.y + f.h * 0.35, 285);
    else walkToward(w, f, owner.x, owner.y, 220, 13);
    const canMount = owner.state === 'normal' || owner.state === 'block' || owner.state === 'crouch';
    const inReach = Math.abs(f.x - owner.x) < 9 && (stage.flies
      ? Math.abs(f.y - owner.y) < f.h * 0.5
      : f.grounded && owner.grounded && Math.abs(f.y - owner.y) < 7);
    if (canMount && inReach) {
      w.releaseGrab(owner);
      p.mounted = owner.trainer!.mounted = true;
      changeMove(p, 'carry');
      owner.state = 'normal';
      owner.stateTime = 0;
      owner.vx = owner.vy = 0;
      owner.flying = false;
      owner.grounded = false;
      f.vx *= 0.3;
      f.vy = stage.flies ? -RIDE_FLIGHT.takeoff : 0;
      f.facing = owner.facing;
    } else if (p.age > 1.35 || !guard) {
      changeMove(p, 'follow');
      owner.trainer!.blockHeld = 0;
    }
  } else if (p.move === 'follow' || p.move === 'guard') {
    if (p.move !== 'follow') changeMove(p, 'follow');
    partnerGuard(f, false);
    if (p.engaged === -1) {
      follow(w, f, owner, false);
    } else {
      const enemy = engagedEnemy(w, p.engaged);
      if (!enemy) {
        p.engaged = PARKED;
        f.vx = 0;
        return;
      }
      f.flying = stage.flies && enemy.y < f.y - 12;
      approachEnemy(w, f, enemy, 145, 9);
    }
  } else f.vx *= 0.77;
}

function seismicToss(p: PokemonState): boolean {
  return p.move === 'ultimate' && p.species === 'charmander' && p.stage === 2;
}

function collectPartnerOrb(w: World, f: Fighter): void {
  const orb = w.findItemNear(f, 2, f.id) ?? w.items.find(it => it.active && it.weaponId === POWER_ORB &&
    segmentAabb(f.px, f.py - f.h / 2, f.x, f.y - f.h / 2, it.x - (it.w + f.w) / 2,
      it.y - it.h - f.h / 2, it.x + (it.w + f.w) / 2, it.y + f.h / 2) >= 0);
  if (orb) w.pickUp(f, orb, true);
}

function moveDuration(f: Fighter, p: PokemonState): number {
  switch (p.move) {
    case 'release': return timing.release;
    case 'evolve': return pokemonEvolutionTime(p.species, p.stage, p.previousStage);
    case 'shot': return pokemonAttackDuration(pokemonAttack(p.species, p.stage, 'shot'));
    case 'ultimate': return seismicToss(p) ? timing.ultimate : pokemonAttackDuration(pokemonAttack(p.species, p.stage, 'ultimate'));
    case 'dash': return ORB_DASH_RANGE / ORB_DASH_SPEED + DT;
    case 'punch': case 'kick': {
      if (!p.fired) return Infinity;
      const melee = pokemonMelee(p.species, p.stage, p.move === 'kick' || f.combo === 2);
      return (melee.hits - 1) * melee.interval + melee.recovery;
    }
    default: return Infinity;
  }
}

export function stepPokemon(w: World, f: Fighter, p: PokemonState): void {
  const owner = w.fighters[f.master];
  if (!owner?.alive) {
    if (f.alive) knockOutPokemon(w, f);
    f.gone = true;
    return;
  }
  p.age += DT;
  f.comboTimer = Math.max(0, f.comboTimer - DT);
  if (!f.alive) {
    if (p.move === 'ko' && p.age >= timing.faint + timing.recall) {
      f.gone = true;
      if (owner.trainer?.active === f.id) owner.trainer.active = -1;
    }
    return;
  }
  if (p.move === 'recall') {
    if (p.age >= timing.recall) {
      f.alive = false;
      f.gone = true;
      owner.trainer!.active = -1;
    }
    return;
  }
  f.stateTime += DT;
  f.invuln = Math.max(0, f.invuln - DT);
  f.parryT = Math.max(0, f.parryT - DT);
  f.blockStun = Math.max(0, f.blockStun - DT);
  f.dropTimer = Math.max(0, f.dropTimer - DT);
  f.guardWait = Math.max(0, f.guardWait - DT);
  if (p.perched) {
    if (f.state === 'flinch' || f.state === 'knockdown' || f.state === 'grabbed') p.perched = false;
    else if (owner.grounded && !trainerClimbing(owner) && p.move !== 'evolve') {
      p.perched = false;
      changeMove(p, 'follow');
      f.vy = -65;
      f.vx = owner.facing * 120;
    } else {
      f.x = owner.x - owner.facing * (owner.w * 0.45 + f.w * 0.3);
      f.y = owner.y - owner.h * 0.48;
      f.facing = owner.facing;
      f.grounded = f.flying = false;
      f.vx = owner.vx;
      f.vy = owner.vy;
      if (p.move === 'evolve' && p.age >= pokemonEvolutionTime(p.species, p.stage, p.previousStage)) {
        p.previousStage = p.stage;
        changeMove(p, 'follow');
      }
      collectPartnerOrb(w, f);
      return;
    }
  }
  // The trainer's previous input already contains this tick's controls.
  updateMountedSprint(w, f, p, owner.prev);
  const jumpHeld = rideVertical(owner.prev) < 0;
  const jumpPressed = jumpHeld && !f.prev.jump;
  f.prev.jump = jumpHeld;
  if (f.state !== 'block' && f.guardWait === 0) f.guard = Math.min(BLOCK.max, f.guard + DT * BLOCK.regen);
  if (f.state === 'grabbed') {
    if (p.mounted) syncRider(owner, f);
    return;
  }
  if (f.state === 'flinch' || f.state === 'knockdown') {
    if (p.holding) w.releaseGrab(f);
    p.holding = false;
    changeMove(p, p.mounted ? 'carry' : 'follow');
    f.vx *= 0.95;
    f.flying = false;
    if (f.stateTime >= Math.max(0.2, f.flinchTime)) f.state = 'normal';
  } else movePokemon(w, f, p, owner, jumpPressed);
  if (!f.flying) f.vy = Math.min(MAX_FALL, f.vy + GRAVITY * w.gravityScale * DT);
  // A mounted descent crosses semisolids. The Pokémon still collides with full terrain.
  const descending = p.mounted && rideVertical(owner.prev) > 0;
  moveBody(w.map, f, DT, { ignoreOneWay: f.dropTimer > 0 || f.flying && (f.vy < 0 || descending) }, result);
  if (p.mounted && f.y < f.h + 2) {
    f.y = f.h + 2;
    f.vy = Math.max(0, f.vy);
  }
  if (outOfWorld(w, f) || w.map.hazardAtPx(f.x, f.y - 3) === 'water') {
    knockOutPokemon(w, f);
    return;
  }
  if (p.mounted) syncRider(owner, f);

  const seismic = seismicToss(p);
  if (p.holding) {
    const held = w.fighters[f.grabTarget];
    if (held?.grabbedBy === f.id) {
      held.x = f.x + f.facing * f.w * 0.42;
      held.y = f.y - f.h * 0.18;
      held.vx = held.vy = 0;
      held.grounded = false;
      held.flying = false;
    } else p.holding = false;
  }
  if (p.move === 'punch' || p.move === 'kick' || seismic) contact(w, f, p, seismic);
  if (p.move === 'shot' || p.move === 'ultimate' && !seismic) stepPokemonAttack(w, f, owner, p);
  if (p.age >= moveDuration(f, p)) {
    const queued = p.queued && p.move === 'punch' && selectedPartnerBall(owner) && !owner.prev.block;
    if (p.holding) w.releaseGrab(f);
    p.holding = false;
    if (p.move === 'release' && p.previousStage < p.stage) changeMove(p, 'evolve');
    else {
      if (p.move === 'evolve') p.previousStage = p.stage;
      changeMove(p, p.mounted ? 'carry' : 'follow');
      if (queued) command(w, owner, f, 'punch');
    }
  }
  collectPartnerOrb(w, f);
}
