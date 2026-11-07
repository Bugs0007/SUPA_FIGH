import { moveLook } from '../art/heroMoves';
import { DT, TILE } from '../sim/constants';
import { bombWindup, HEROES, JET_BAZOOKA } from '../sim/data/heroes';
import { rosterSpecial } from '../sim/data/rosterSpecials';
import { SLOT } from '../sim/data/weapons';
import { emptyIntent, type Intent } from '../sim/intent';
import { getMap } from '../sim/map/maps';
import { DEFAULT_WORLD_SETTINGS, World } from '../sim/world';

export const DEMO_MODES = ['base', 'second', 'super', 'combo', 'special', 'guard'] as const;
export type DemoMode = (typeof DEMO_MODES)[number];
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
  return hero ? DEMO_MODES : SCRAPPER_MODES;
}

export function minDemoForm(hero: string, mode: DemoMode): number {
  return mode === 'super' || mode === 'special' && (hero === 'naruto' || hero === 'goku') ? 1 : 0;
}

export function demoMoveName(hero: string, mode: DemoMode, level: number): string {
  const h = HEROES[hero];
  switch (mode) {
    case 'base': return hero === 'naruto' || hero === 'sasuke' ? moveLook(hero, level).name : h.base.name;
    case 'second': return hero === 'sasuke' && level >= (h.second.amaterasu?.minLevel ?? Infinity) ? 'AMATERASU' : h.second.name;
    case 'super': return h.super.names[level - 1] ?? 'POWER ORB REQUIRED';
    case 'combo': return h?.comboName ?? 'FIST COMBO';
    case 'guard': return 'HOLD BLOCK';
    case 'special': return rosterSpecial(hero)?.name ?? LEGACY_SPECIAL_NAMES[hero];
  }
}

export function describeDemoMove(hero: string, mode: DemoMode, level: number): string {
  const h = HEROES[hero];
  switch (mode) {
    case 'base': return h.base.blink ? h.base.desc + ' FOLLOW UP WITH A STRIKE.' : h.base.desc;
    case 'second': return demoMoveName(hero, mode, level) === 'AMATERASU'
      ? 'BURN VISIBLE RIVALS IN FRONT OF YOU WITH BLACK FLAMES.'
      : hero === 'naruto' ? h.second.desc + ' THE CLONES RUSH THE RIVAL.' : h.second.desc;
    case 'super': return h.super.bomb?.centered ? 'INSTANT CLOSE-RANGE SUPER. ' + h.super.desc : h.super.desc;
    case 'combo': return hero ? 'CHAIN FOUR STRIKES TO END WITH A KNOCKDOWN.' : 'PRESS ATTACK AGAIN TO CHAIN THE NEXT STRIKE.';
    case 'guard': return h?.forms[level - 1]?.reflects
      ? "HOLD BLOCK TO SEND THE RIVAL'S SHOT BACK."
      : 'HOLD BLOCK AS THE RIVAL STRIKES. HEAVY ATTACKS CAN STILL DEAL CHIP DAMAGE.';
    case 'special': return 'ATTACK + ABILITY. ' + (rosterSpecial(hero)?.description ?? LEGACY_SPECIAL_DETAILS[hero]);
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

  constructor(readonly hero: string, readonly mode: DemoMode, level: number) {
    const h = HEROES[hero];
    this.level = Math.max(minDemoForm(hero, mode), Math.min(h?.forms.length ?? 0, level));
    this.reflecting = mode === 'guard' && !!h?.forms[this.level - 1]?.reflects;
    this.world = new World(DEMO_MAP, [
      { name: h?.name ?? 'SCRAPPER', team: 1, hero, startForm: this.level, isBot: false, upJumps: false },
      { name: 'SPARRING RIVAL', team: 2, hero: mode === 'special' && hero === 'asta' ? 'vegeta' : '', isBot: false, upJumps: false },
    ], { ...DEFAULT_WORLD_SETTINGS, weaponSpawnRate: 0, noPickups: true }, 49);
    const gap = spacing(hero, mode, this.level);
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
    this.duration = Math.ceil(Math.max(2.55 + windup, specialDuration + 1) / DT);
    const avatar = hero === 'sasuke' && this.level >= 3 || hero === 'naruto' && this.level === 4;
    this.cameraZoom = mode === 'super' && avatar ? 0.88 : mode === 'super' && hero === 'goku' ? 1.28 : 1.86;
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
