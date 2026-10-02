// Instant replays by deterministic re-simulation: a round is fully described by its World inputs
// (map, fighter specs, settings, seed) plus every tick's intents and the Match-driven world state
// (sudden death level). Re-stepping a fresh World with the same log reproduces it exactly.

import type { FighterSpawn } from './fighter';
import { emptyIntent, type Intent } from './intent';
import type { MapDef } from './map/mapData';
import { World, type WorldSettings } from './world';

/** per tick: [suddenDeath, (moveX, moveY, buttons) × fighters] */
const PER_FIGHTER = 3;

export class RoundRecording {
  readonly def: MapDef;
  readonly specs: FighterSpawn[];
  readonly settings: WorldSettings;
  readonly seed: number;
  ticks = 0;
  /** world tick of the round-ending kill (-1 = none) and where it happened */
  finalKillTick = -1;
  finalKillX = 0;
  finalKillY = 0;
  private data: number[] = [];

  constructor(def: MapDef, specs: FighterSpawn[], settings: WorldSettings, seed: number) {
    this.def = def;
    this.specs = specs;
    this.settings = { ...settings, modifiers: settings.modifiers ? [...settings.modifiers] : undefined };
    this.seed = seed;
  }

  get stride(): number {
    return 1 + this.specs.length * PER_FIGHTER;
  }

  record(intents: readonly Intent[], suddenDeath: number): void {
    this.data.push(suddenDeath);
    for (let i = 0; i < this.specs.length; i++) {
      const it = intents[i];
      if (!it) {
        this.data.push(0, 0, 0);
        continue;
      }
      const b =
        (it.jump ? 1 : 0) |
        (it.attack ? 2 : 0) |
        (it.kick ? 4 : 0) |
        (it.interact ? 8 : 0) |
        (it.cycle ? 16 : 0) |
        (it.gadget ? 32 : 0) |
        (it.ability ? 64 : 0);
      this.data.push(it.moveX, it.moveY, b);
    }
    this.ticks++;
  }

  /** Read tick t into intents; returns the sudden death level. */
  read(t: number, out: Intent[]): number {
    const base = t * this.stride;
    for (let i = 0; i < this.specs.length; i++) {
      const o = out[i];
      const k = base + 1 + i * PER_FIGHTER;
      o.moveX = this.data[k];
      o.moveY = this.data[k + 1];
      const b = this.data[k + 2];
      o.jump = (b & 1) !== 0;
      o.attack = (b & 2) !== 0;
      o.kick = (b & 4) !== 0;
      o.interact = (b & 8) !== 0;
      o.cycle = (b & 16) !== 0;
      o.gadget = (b & 32) !== 0;
      o.ability = (b & 64) !== 0;
    }
    return this.data[base];
  }
}

/** Plays a recording back on a fresh World. */
export class ReplayPlayer {
  readonly world: World;
  /** next tick index to play */
  t = 0;
  private intents: Intent[];

  constructor(readonly rec: RoundRecording) {
    this.world = new World(rec.def, rec.specs, rec.settings, rec.seed);
    this.intents = rec.specs.map(() => emptyIntent());
  }

  get done(): boolean {
    return this.t >= this.rec.ticks;
  }

  step(): void {
    if (this.done) return;
    this.world.suddenDeath = this.rec.read(this.t, this.intents);
    this.world.step(this.intents);
    this.t++;
  }

  /** Fast-forward silently (events discarded). Returns true when reached. */
  skipTo(tick: number, budget = 1e9): boolean {
    let n = 0;
    while (this.t < tick && !this.done && n < budget) {
      this.step();
      this.world.events.length = 0;
      n++;
    }
    return this.t >= tick || this.done;
  }
}
