import { moveLook } from '../art/heroMoves';
import { DT, TILE } from '../sim/constants';
import { bombWindup, DRAGON_FIST, gokuFormComboName, HEROES, JET_BAZOOKA, SASUKE_DRAGON_FIRE_LEVEL, secondMoveName } from '../sim/data/heroes';
import { rosterSpecial } from '../sim/data/rosterSpecials';
import { pokemonStage, POKEMON_TIMING, type PokemonSpecies } from '../sim/data/pokemon';
import { SLOT } from '../sim/data/weapons';
import { emptyIntent, type Intent } from '../sim/intent';
import { getMap } from '../sim/map/maps';
import { DEFAULT_WORLD_SETTINGS, World } from '../sim/world';

export const DEMO_MODES = ['base', 'second', 'super', 'combo', 'special', 'guard'] as const;
export type DemoMode = (typeof DEMO_MODES)[number] | 'mount';
const PARTNER_MODES = [...DEMO_MODES, 'mount'] as const;
const SCRAPPER_MODES = ['combo', 'special', 'guard'] as const;
const LEGACY_SPECIAL_NAMES: Record<string, string> = {
  naruto: 'CLONE SLINGSHOT', luffy: 'JET BAZOOKA', goku: 'VANISH STRIKE', sasuke: 'KIRIN',
};
const LEGACY_SPECIAL_DETAILS: Record<string, string> = {
  naruto: 'CALL A CLONE TO SLING NARUTO INTO THE TARGET. ATTACK + KICK ALSO WORKS.',
  luffy: 'GRAB A NEARBY RIVAL AND LAUNCH THEM WITH A KICK.',
  goku: 'TELEPORT BEHIND THE RIVAL FOR A STRIKE.',
  sasuke: 'CALL KIRIN DOWN ON THE TARGET.',
};
export const DEMO_MAP = getMap('dojo');
// Ground-level lane below the training platforms.
export const DEMO_FLOOR = (DEMO_MAP.rows.length - 3) * TILE;
const START = 12;

export function demoModes(hero: string): readonly DemoMode[] {
  return hero === 'ash' ? PARTNER_MODES : hero ? DEMO_MODES : SCRAPPER_MODES;
}

export function mountDemoAvailable(pokemon: PokemonSpecies): boolean {
  return pokemonStage(pokemon, pokemonStage(pokemon, 0).maxStage).rideable;
}

export function minDemoForm(hero: string, mode: DemoMode, pokemon: PokemonSpecies = 'charmander'): number {
  if (mode === 'mount' && mountDemoAvailable(pokemon)) {
    let level = 0;
    while (!pokemonStage(pokemon, level).rideable) level++;
    return level;
  }
  if (hero === 'ash') return 0;
  return mode === 'super' || mode === 'special' && (hero === 'naruto' || hero === 'goku') ? 1 : 0;
}

export function demoMoveName(hero: string, mode: DemoMode, level: number, pokemon: PokemonSpecies = 'charmander'): string {
  if (mode === 'mount') return 'RIDE ' + pokemonStage(pokemon, level).name;
  if (hero === 'ash') {
    const stage = pokemonStage(pokemon, level);
    return { base: stage.shot, second: stage.dash, super: stage.ultimate, combo: 'PARTNER STRIKE',
      special: 'PARTNER ASSIST', guard: 'PARTNER GUARD' }[mode];
  }
  const h = HEROES[hero];
  switch (mode) {
    case 'base': return hero === 'naruto' || hero === 'sasuke' ? moveLook(hero, level).name : h.base.name;
    case 'second': return secondMoveName(hero, level);
    case 'super': return h.super.names[level - 1] ?? 'POWER ORB REQUIRED';
    case 'combo': return h?.comboName ?? 'FIST COMBO';
    case 'guard': return 'HOLD BLOCK';
    case 'special': return hero === 'goku' ? gokuFormComboName(level) : rosterSpecial(hero)?.name ?? LEGACY_SPECIAL_NAMES[hero];
  }
}

export function describeDemoMove(hero: string, mode: DemoMode, level: number, pokemon: PokemonSpecies = 'charmander'): string {
  if (mode === 'mount') return pokemonStage(pokemon, level).flies
    ? 'HOLD BLOCK TO RIDE. STEER WITH MOVEMENT. DOUBLE-TAP LEFT OR RIGHT TO SPRINT. GADGET DISMOUNTS.'
    : 'HOLD BLOCK TO CLIMB ON. MOVE AND JUMP WHILE RIDING. PRESS DOWN TO DROP THROUGH. USE GADGET TO DISMOUNT.';
  if (hero === 'ash') {
    const name = pokemonStage(pokemon, level).name;
    return {
      base: 'ABILITY. ' + name + ' TARGETS THE NEAREST RIVAL IN ASH\'S LINE OF SIGHT.',
      second: 'KICK. SEND ' + name + ' IN FOR A HEAVY STRIKE. UP + KICK TARGETS A POWER ORB.',
      super: 'ABILITY + KICK. ORDER ' + name + ' TO USE ITS STRONGEST MOVE.',
      combo: 'SELECT THE POKE BALL AND TAP ATTACK TO SEND OUT ' + name + ' OR ORDER A STRIKE. HOLD ATTACK TO RECALL.',
      special: 'ATTACK + ABILITY. ASH SIGNALS ' + name + ' TO FIRE AT THE RIVAL.',
      guard: 'BLOCK CALLS YOUR PARTNER BACK TO GUARD IN FRONT. KEEP HOLDING TO RIDE A LARGE PARTNER.',
    }[mode];
  }
  const h = HEROES[hero];
  switch (mode) {
    case 'base': return h.base.blink ? h.base.desc + ' FOLLOW UP WITH A STRIKE.' : h.base.desc;
    case 'second':
      if (demoMoveName(hero, mode, level) === 'AMATERASU') return 'BURN VISIBLE RIVALS IN FRONT OF YOU WITH BLACK FLAMES.';
      if (hero === 'sasuke' && level === SASUKE_DRAGON_FIRE_LEVEL) return 'AIM AND BREATHE A DRAGON HEAD OF FIRE. IT BURSTS AND IGNITES ON IMPACT.';
      return hero === 'naruto' ? h.second.desc + ' THE CLONES RUSH THE RIVAL.' : h.second.desc;
    case 'super': return h.super.bomb?.centered ? 'INSTANT CLOSE-RANGE SUPER. ' + h.super.desc : h.super.desc;
    case 'combo': return hero ? 'CHAIN FOUR STRIKES TO END WITH A KNOCKDOWN.' : 'PRESS ATTACK AGAIN TO CHAIN THE NEXT STRIKE.';
    case 'guard': return h?.forms[level - 1]?.reflects
      ? "HOLD BLOCK TO SEND THE RIVAL'S SHOT BACK."
      : 'HOLD BLOCK AS THE RIVAL STRIKES. HEAVY ATTACKS CAN STILL DEAL CHIP DAMAGE.';
    case 'special': return 'ATTACK + ABILITY. ' + (hero === 'goku' && level === DRAGON_FIST.level
      ? 'RUSH FORWARD WITH A GOLDEN DRAGON BEHIND YOUR FIST.'
      : rosterSpecial(hero)?.description ?? LEGACY_SPECIAL_DETAILS[hero]);
  }
}

function spacing(hero: string, mode: DemoMode, level: number): number {
  const h = HEROES[hero];
  switch (mode) {
    case 'base': return h.base.blink ? h.base.blink.range * 0.65 : h.base.dash ? Math.min(75, h.base.dash.speed * h.base.dash.time * 0.7 + 12) : 55;
    case 'second': return h.second.gatling ? 18 : h.second.beam ? Math.min(104, h.second.beam.range * 0.58) : 110;
    case 'super':
      if (h.super.bomb?.centered) return (h.super.bomb.radius + h.super.bomb.radiusPerLevel * (level - 1)) * 0.57;
      if (h.super.fist) return 26;
      // The Susanoo bow releases ahead of Sasuke. Leave space to see the arrow fly.
      return hero === 'sasuke' && level >= 3 ? 240 : 145;
    case 'special': return rosterSpecial(hero)?.demoGap ?? (hero === 'luffy' ? JET_BAZOOKA.closeRange * 0.6 : hero === 'naruto' ? 94 : 117);
    case 'guard': return h?.forms[level - 1]?.reflects ? 96 : 13;
    default: return 13;
  }
}

/** One repeatable input script against a regular fighter in an isolated match world. */
export class HeroDemo {
  readonly world: World;
  private readonly intents: Intent[];
  private readonly duration: number;
  readonly level: number;
  readonly cameraZoom: number;
  readonly reflecting: boolean;

  constructor(readonly hero: string, readonly mode: DemoMode, level: number, readonly pokemon: PokemonSpecies = 'charmander') {
    if (mode === 'mount' && (hero !== 'ash' || !mountDemoAvailable(pokemon))) this.mode = mode = 'base';
    const h = HEROES[hero];
    const cap = hero === 'ash' ? pokemonStage(pokemon, 0).maxStage : h?.forms.length ?? 0;
    this.level = Math.max(minDemoForm(hero, mode, pokemon), Math.min(cap, level));
    this.reflecting = mode === 'guard' && !!h?.forms[this.level - 1]?.reflects;
    this.world = new World(DEMO_MAP, [
      { name: h?.name ?? 'SCRAPPER', team: 1, hero, startForm: this.level, pokemon, isBot: false, upJumps: false },
      { name: 'SPARRING RIVAL', team: 2, hero: mode === 'special' && hero === 'asta' ? 'vegeta' : '', isBot: false, upJumps: false },
    ], { ...DEFAULT_WORLD_SETTINGS, weaponSpawnRate: 0, noPickups: true }, 49);
    const gap = hero === 'ash' ? mode === 'guard' ? 46 : mode === 'special' ? 37 : 76 : spacing(hero, mode, this.level);
    for (const [id, fighter] of this.world.fighters.slice(0, 2).entries()) {
      fighter.x = fighter.px = 544 + (id === 1 ? gap : 0);
      fighter.y = fighter.py = DEMO_FLOOR;
      fighter.facing = id === 0 ? 1 : -1;
      fighter.invuln = 0;
    }
    if (this.reflecting || mode === 'special' && hero === 'yami') {
      const rival = this.world.fighters[1];
      rival.inv[SLOT.SIDEARM] = { id: 'pistol', ammo: 6, dur: 1 };
      rival.active = SLOT.SIDEARM;
    }
    this.intents = this.world.fighters.map(emptyIntent);
    const windup = mode === 'super' ? h.super.bomb ? bombWindup(h.super.bomb) : h.super.beam?.minCharge ?? 0 : 0;
    const specialDuration = mode === 'special' ? rosterSpecial(hero)?.duration ?? 0 : 0;
    const mountDuration = pokemonStage(pokemon, this.level).flies ? 5.6 : 3.7;
    this.duration = Math.ceil(Math.max(mode === 'mount' ? mountDuration : 2.55 + windup, specialDuration + 1) / DT);
    const avatar = hero === 'sasuke' && this.level >= 3 || hero === 'naruto' && this.level === 4;
    this.cameraZoom = mode === 'mount' ? 1.6 : mode === 'super' && avatar ? 0.88
      : hero === 'sasuke' && mode === 'special' ? 1.26 - Math.max(0, this.level - 1) * 0.19
      : hero === 'goku' && (mode === 'super' || mode === 'special' && this.level === DRAGON_FIST.level) ? 1.28 : 1.86;
  }

  get done(): boolean {
    return this.world.tick >= this.duration;
  }

  step(): void {
    const w = this.world;
    const tick = w.tick - START;
    const [fighter, rival] = w.fighters;
    const [actor, target] = this.intents;
    const h = HEROES[this.hero];
    actor.moveX = 0;
    actor.attack = actor.ability = actor.kick = actor.block = target.attack = target.kick = false;
    if (this.hero === 'ash') {
      const ready = Math.ceil(POKEMON_TIMING.release / DT) + 9;
      actor.gadget = false;
      actor.ability = tick === ready && (this.mode === 'base' || this.mode === 'super' || this.mode === 'special');
      actor.kick = tick === ready && (this.mode === 'second' || this.mode === 'super');
      actor.attack = tick === 0 || this.mode === 'special' && tick === ready
        || this.mode === 'combo' && tick >= ready && tick < ready + 50 && tick % 5 === 0;
      if (this.mode === 'mount') {
        const trainer = fighter.trainer!;
        const age = w.fighters[trainer.slot].pokemon?.age ?? 0;
        actor.block = tick >= ready && !trainer.mounted;
        const flies = pokemonStage(this.pokemon, this.level).flies;
        if (flies && trainer.mounted) {
          // Take off, hover, cruise, brake, then double-tap into a sustained flight sprint.
          const cruise = age >= 0.72 && age < 1.22;
          const firstTap = age >= 1.43 && age < 1.48;
          const sprint = age >= 1.55 && age < 1.95;
          actor.moveX = cruise || firstTap || sprint ? 1 : 0;
          actor.moveY = age < 0.32 ? -0.65 : age >= 2.2 && age < 2.85 ? 0.65 : 0;
        } else {
          actor.moveX = trainer.mounted ? age < 0.7 ? 0.65 : age < 1.3 ? -0.65 : 0 : 0;
          actor.moveY = trainer.mounted && flies ? age < 0.42 ? -0.65 : age > 1.05 && age < 1.5 ? 0.65 : 0 : 0;
        }
        actor.jump = trainer.mounted && !flies && age >= 0.28 && age < 0.48;
      }
      if (this.mode === 'guard') {
        actor.attack ||= tick === ready;
        const partner = w.fighters[fighter.trainer!.slot];
        const gap = partner.x - rival.x;
        target.moveX = tick >= ready + 25 && tick < ready + 40 && Math.abs(gap) > 12 ? Math.sign(gap) : 0;
        actor.block = tick === ready + 37;
        target.attack = tick === ready + 49;
      }
      w.step(this.intents);
      return;
    }
    // Start the rival's Ki windup in pre-roll so the shot reaches Asta's anti-magic sweep.
    if (this.mode === 'special' && this.hero === 'asta') target.kick = tick === 2 - START;
    if (tick >= 0) {
      switch (this.mode) {
        case 'base':
          actor.ability = tick < 36;
          // A movement ability shows its tactical payoff with a real follow-up jab.
          if (h.base.blink && tick >= 14 && tick < 38 && tick % 4 === 2) actor.attack = true;
          break;
        case 'second':
          actor.kick = tick < (h.second.beam ? Math.ceil(h.second.beam.maxCharge / DT) : 9);
          break;
        case 'super':
          actor.ability = actor.kick = tick === 0;
          break;
        case 'special':
          actor.attack = actor.ability = tick === 0;
          if (this.hero === 'yami') target.attack = tick >= 12 && tick < 19;
          break;
        case 'combo':
          actor.attack = tick < 64 && tick % 5 === 0;
          if (fighter.state === 'normal' && Math.abs(rival.x - fighter.x) > 15 && tick < 58) actor.moveX = Math.sign(rival.x - fighter.x);
          break;
        case 'guard':
          actor.block = true;
          target.attack = this.reflecting ? tick >= 4 && tick < 54 && (tick - 4) % 26 < 9 : tick < 47 && tick % 9 === 4;
          break;
      }
    }

    if (this.mode === 'second' && h.second.kind === 'clones') {
      for (const clone of w.fighters.slice(2)) {
        const input = this.intents[clone.id];
        const dx = rival.x - clone.x;
        const ready = clone.alive && clone.invuln <= 0;
        input.moveX = ready ? Math.sign(dx) : 0;
        input.ability = ready && Math.abs(dx) < 100 && tick < 90;
      }
    }
    w.step(this.intents);
  }
}
