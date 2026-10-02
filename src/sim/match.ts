import { DT, MATCH_END_TIME, ROUND_END_CONFIRM, ROUND_END_TIME, SUDDEN_DEATH_DRAIN_AFTER } from './constants';
import { teamKey } from './combat';
import { MODIFIERS } from './data/modifiers';
import { freshAmmo, SLOT, weaponDef } from './data/weapons';
import type { FighterSpawn } from './fighter';
import type { Intent } from './intent';
import { getMap } from './map/maps';
import { World, type WorldSettings } from './world';
import { RoundRecording } from './replay';

/**
 * brawl = rounds, last team standing. All others are one long round with respawns:
 * deathmatch (most kills), koth (hold the hill), juggernaut (kill / be the juggernaut),
 * gungame (weapon ladder, final knife kill wins), coop (humans vs bot waves, shared lives).
 */
export type GameMode = 'brawl' | 'deathmatch' | 'koth' | 'juggernaut' | 'gungame' | 'coop';

export interface MatchConfig {
  mapId: string;
  mode: GameMode;
  fighters: FighterSpawn[];
  roundsToWin: number;
  friendlyFire: boolean;
  weaponSpawnRate: number;
  seed: number;
  /** deathmatch length (s), default 180 */
  timeLimit?: number;
  /** brawl: seconds into a round before sudden death (0 = never), default 75 */
  suddenDeath?: number;
  /** deathmatch respawn delay (s), default 2.5 */
  respawnDelay?: number;
  /** flip a random chaos modifier card every round */
  chaos?: boolean;
  /** KotH points to win / Juggernaut points to win (defaults KOTH_TARGET / JUGGERNAUT.target) */
  target?: number;
  /** modifiers that are always on (data/modifiers.ts ids) */
  modifiers?: string[];
}

export const MODE_NAMES: Record<GameMode, string> = {
  brawl: 'BRAWL',
  deathmatch: 'DEATHMATCH',
  koth: 'KING OF THE HILL',
  juggernaut: 'JUGGERNAUT',
  gungame: 'GUN GAME',
  coop: 'CO-OP SURVIVAL',
};

/** Gun Game weapon ladder; a kill with the last one wins. */
export const GUN_LADDER = ['pistol', 'uzi', 'revolver', 'shotgun', 'smg', 'rifle', 'flaregun', 'sniper', 'minigun', 'bazooka', 'grenade', 'knife'];
export const KOTH_TARGET = 60;
export const JUGGERNAUT = { hp: 400, knockMul: 0.35, target: 10 };
export const COOP = { lives: 3, livesPerHuman: 1, respawn: 4, reviveTime: 1.5, reviveRange: 18, waveBreak: 4, victoryWave: 15, bossEvery: 5 };

export type MatchPhase = 'fight' | 'roundEnd' | 'matchEnd';

export type MatchEvent =
  | { t: 'roundStart'; round: number }
  | { t: 'roundEnd'; winnerTeam: number | null; winners: number[] }
  | { t: 'matchEnd'; winnerTeam: number; winners: number[] }
  | { t: 'finalKill'; x: number; y: number }
  | { t: 'multiKill'; f: number; count: number }
  | { t: 'suddenDeath'; level: number }
  | { t: 'bounty'; f: number; by: number }
  | { t: 'modifier'; id: string }
  | { t: 'juggernaut'; f: number }
  | { t: 'gunLevel'; f: number; level: number; weapon: string; up: boolean }
  | { t: 'wave'; wave: number; boss: boolean }
  | { t: 'waveCleared'; wave: number }
  | { t: 'revive'; f: number; by: number }
  | { t: 'hill'; team: number | null }
  | { t: 'overtime' };

export interface FighterStats {
  kills: number;
  deaths: number;
  suicides: number;
  damage: number;
  roundsWon: number;
  explosiveKills: number;
  fireKills: number;
  meleeKills: number;
  /** kills credited via the environment (knocked into something / off something) or by map hazards/props */
  envKills: number;
  bounties: number;
}

const freshStats = (): FighterStats => ({
  kills: 0,
  deaths: 0,
  suicides: 0,
  damage: 0,
  roundsWon: 0,
  explosiveKills: 0,
  fireKills: 0,
  meleeKills: 0,
  envKills: 0,
  bounties: 0,
});

const PROP_WEAPONS = new Set(['barrel', 'gas', 'tnt', 'chandelier', 'crate']);

/** A match = a series of rounds on one map. Owns the current World. Pure sim, runs headless. */
export class Match {
  readonly cfg: MatchConfig;
  world!: World;
  round = 0;
  phase: MatchPhase = 'fight';
  phaseTime = 0;
  /** round wins per team key */
  scores = new Map<number, number>();
  roundWinner: number | null = null;
  matchWinner: number | null = null;
  stats: FighterStats[];
  events: MatchEvent[] = [];
  /** 1 = normal; < 1 during cinematic slow-mo. The frame loop scales the accumulator by it. */
  timeScale = 1;
  /** camera focus during slow-mo */
  cinematic: { x: number; y: number; ticks: number } | null = null;
  private cineScale = 1;
  private slowmoTicks = 0;
  private slowmoLen = 1;
  private decideTimer = -1;
  private recentKills: { killer: number; tick: number }[] = [];
  /** deathmatch: fighter id -> tick to respawn at */
  private respawnAt = new Map<number, number>();
  /** deathmatch tie at the buzzer: next kill wins */
  overtime = false;
  // ---- mode state
  /** KotH hill (px) and which team holds it (null = nobody / contested) */
  hill: { x: number; y: number; w: number; h: number } | null = null;
  hillTeam: number | null = null;
  private hillTime = new Map<number, number>();
  juggernaut = -1;
  /** Gun Game ladder level per fighter */
  gunLevel: number[] = [];
  /** Co-op */
  wave = 0;
  lives = 0;
  private waveBreak = 0;
  private waveBots = new Set<number>();
  reviveProgress: number[] = [];

  constructor(cfg: MatchConfig) {
    // mode team rules: juggernaut/gun game are every-fighter-for-themselves, co-op is humans vs bots
    const teams =
      cfg.mode === 'juggernaut' || cfg.mode === 'gungame'
        ? cfg.fighters.map((f) => ({ ...f, team: 0 }))
        : cfg.mode === 'coop'
          ? cfg.fighters.map((f) => ({ ...f, team: f.isBot ? 2 : 1 }))
          : cfg.fighters;
    this.cfg = { ...cfg, fighters: teams };
    this.stats = this.cfg.fighters.map(freshStats);
    this.startRound();
  }

  get teamCount(): number {
    return new Set(this.cfg.fighters.map((f, i) => teamKey({ id: i, team: f.team }))).size;
  }

  /** intent log of the current round (Brawl) for instant replays */
  recording: RoundRecording | null = null;
  /** recording of the round that just ended (kept until the next one ends) */
  lastRecording: RoundRecording | null = null;

  /** Modifiers active this round: fixed ones + this round's chaos card. */
  roundModifiers: string[] = [];

  worldSettings(): WorldSettings {
    return {
      friendlyFire: this.cfg.friendlyFire,
      weaponSpawnRate: this.cfg.mode === 'gungame' ? 0 : this.cfg.weaponSpawnRate,
      gravityScale: 1,
      modifiers: this.roundModifiers,
      ghosts: this.cfg.mode === 'brawl',
      noPickups: this.cfg.mode === 'gungame',
    };
  }

  private pickModifiers(): void {
    const mods = [...(this.cfg.modifiers ?? [])];
    if (this.cfg.chaos) {
      // deterministic per seed + round; never the same card twice in a row
      const prev = this.roundModifiers.find((m) => !mods.includes(m));
      const pool = MODIFIERS.filter((m) => m.id !== prev && !mods.includes(m.id));
      const h = Math.abs(Math.imul(this.cfg.seed ^ 0x5bd1e995, this.round * 2654435761) >>> 0);
      mods.push(pool[h % pool.length].id);
    }
    this.roundModifiers = mods;
  }

  startRound(): void {
    this.round++;
    this.pickModifiers();
    const def = getMap(this.cfg.mapId);
    const settings = this.worldSettings();
    const seed = this.cfg.seed + this.round * 7919;
    this.world = new World(def, this.cfg.fighters, settings, seed);
    this.recording = this.cfg.mode === 'brawl' ? new RoundRecording(def, this.cfg.fighters, settings, seed) : null;
    this.phase = 'fight';
    this.phaseTime = 0;
    this.decideTimer = -1;
    this.roundWinner = null;
    this.recentKills.length = 0;
    this.respawnAt.clear();
    this.overtime = false;
    this.initMode();
    this.events.push({ t: 'roundStart', round: this.round });
    if (this.cfg.chaos) this.events.push({ t: 'modifier', id: this.roundModifiers[this.roundModifiers.length - 1] });
  }

  step(intents: readonly Intent[]): void {
    const w = this.world;
    const evStart = w.events.length;
    const bounty = this.bounty; // who wore the crown when this tick started
    // keeps recording through the round-end phase so replays include the tumbling aftermath
    if (this.recording) this.recording.record(intents, w.suddenDeath);
    w.step(intents);
    this.phaseTime += DT;

    this.processWorldEvents(evStart, bounty);

    this.updateSlowmo();

    if (this.cfg.mode !== 'brawl') {
      this.stepDeathmatch(intents);
      return;
    }

    if (this.phase === 'fight') {
      const sd = this.cfg.suddenDeath ?? 75;
      if (sd > 0) {
        const level = this.phaseTime >= sd + SUDDEN_DEATH_DRAIN_AFTER ? 2 : this.phaseTime >= sd ? 1 : 0;
        if (level > w.suddenDeath) {
          w.suddenDeath = level;
          this.events.push({ t: 'suddenDeath', level });
        }
      }
      if (this.teamCount > 1 && w.aliveTeams().size <= 1) {
        if (this.decideTimer < 0) this.decideTimer = ROUND_END_CONFIRM;
        this.decideTimer -= DT;
        if (this.decideTimer <= 0) this.endRound();
      }
    } else if (this.phase === 'roundEnd') {
      if (this.phaseTime >= ROUND_END_TIME) {
        if (this.matchWinner !== null) {
          this.phase = 'matchEnd';
          this.phaseTime = 0;
          this.events.push({ t: 'matchEnd', winnerTeam: this.matchWinner, winners: this.membersOf(this.matchWinner) });
        } else {
          this.startRound();
        }
      }
    } else if (this.phase === 'matchEnd') {
      if (this.phaseTime >= MATCH_END_TIME) this.resetMatch();
    }
  }

  /**
   * The bounty: the single fighter leading the match (round wins in Brawl, kills in Deathmatch).
   * -1 while nobody leads alone. Killing them is announced (and worth +1 in Deathmatch).
   */
  get bounty(): number {
    if (this.cfg.mode === 'juggernaut') return this.juggernaut;
    if (this.cfg.mode === 'coop') return -1;
    const key = (s: FighterStats) => (this.cfg.mode === 'deathmatch' ? s.kills - s.suicides : s.roundsWon * 100 + s.kills);
    let best = -1;
    let bestV = 0;
    let tie = false;
    this.stats.forEach((s, i) => {
      const v = key(s);
      if (v > bestV) {
        bestV = v;
        best = i;
        tie = false;
      } else if (v === bestV && v > 0) tie = true;
    });
    return tie ? -1 : best;
  }

  /**
   * Scores/stats/mode rules for world events from index `from` on. step() calls it for the events of the
   * tick it just simulated (exposed for tests that kill fighters directly).
   */
  processWorldEvents(from: number, bounty = this.bounty): void {
    const w = this.world;
    for (let i = from; i < w.events.length; i++) {
      const e = w.events[i];
      if (e.t === 'hit' && !e.corpse && e.attacker >= 0 && e.attacker !== e.victim) {
        this.stats[e.attacker].damage += e.damage;
      } else if (e.t === 'kill') {
        this.stats[e.victim].deaths++;
        if (e.killer >= 0 && e.killer !== e.victim) {
          const ks = this.stats[e.killer];
          ks.kills++;
          if (e.cause === 'explosion') ks.explosiveKills++;
          else if (e.cause === 'fire') ks.fireKills++;
          else if ((e.cause === 'melee' || e.cause === 'kick') && !e.env) ks.meleeKills++;
          if (e.env || PROP_WEAPONS.has(e.weapon) || e.cause === 'hazard') ks.envKills++;
          if (e.victim === bounty) {
            ks.bounties++;
            this.events.push({ t: 'bounty', f: e.victim, by: e.killer });
            if (this.cfg.mode === 'deathmatch') {
              const kt = teamKey({ id: e.killer, team: this.cfg.fighters[e.killer].team });
              this.scores.set(kt, (this.scores.get(kt) ?? 0) + 1); // bounty bonus point
            }
          }
          this.recentKills.push({ killer: e.killer, tick: w.tick });
          const n = this.recentKills.filter((k) => k.killer === e.killer && w.tick - k.tick < 90).length;
          if (n >= 2) {
            this.events.push({ t: 'multiKill', f: e.killer, count: n });
            this.startSlowmo(0.9, e.x, e.y);
          }
        } else {
          this.stats[e.victim].suicides++;
        }
        if (this.cfg.mode !== 'brawl') {
          this.modeKill(e.killer, e.victim, e.weapon, e.cause);
          continue;
        }
        if (this.phase === 'fight' && this.teamCount > 1 && w.aliveTeams().size <= 1) {
          this.events.push({ t: 'finalKill', x: e.x, y: e.y });
          if (this.recording) {
            this.recording.finalKillTick = w.tick;
            this.recording.finalKillX = e.x;
            this.recording.finalKillY = e.y;
          }
          this.startSlowmo(1.5, e.x, e.y);
        }
      }
    }

  }

  /** Seconds left in timed modes (0 in Brawl / Co-op). */
  get timeLeft(): number {
    if (this.cfg.mode === 'brawl' || this.cfg.mode === 'coop' || this.phase !== 'fight') return 0;
    return Math.max(0, (this.cfg.timeLimit ?? 180) - this.phaseTime);
  }

  get timed(): boolean {
    return this.cfg.mode !== 'brawl' && this.cfg.mode !== 'coop';
  }

  private teamOf(i: number): number {
    return teamKey({ id: i, team: this.cfg.fighters[i].team });
  }

  private addScore(team: number, n: number): void {
    this.scores.set(team, (this.scores.get(team) ?? 0) + n);
  }

  private queueRespawn(i: number, delay = this.cfg.respawnDelay ?? 2.5): void {
    this.respawnAt.set(i, this.world.tick + Math.round(delay / DT));
  }

  // ------------------------------------------------------------ mode rules

  private initMode(): void {
    const w = this.world;
    const mode = this.cfg.mode;
    this.hill = null;
    this.hillTeam = null;
    this.hillTime.clear();
    this.juggernaut = -1;
    w.objective = null;
    if (mode === 'koth') {
      // the spawn/weapon point closest to the map center, 5 tiles wide
      const pts = [...w.parsed.weaponSpawns, ...w.parsed.spawns];
      const cx = w.map.pxW / 2;
      const cy = w.map.pxH / 2;
      let best = pts[0];
      for (const p of pts) if (Math.hypot(p.x - cx, (p.y - cy) * 1.5) < Math.hypot(best.x - cx, (best.y - cy) * 1.5)) best = p;
      this.hill = { x: best.x - 40, y: best.y - 48, w: 80, h: 48 };
      w.objective = this.hill;
    } else if (mode === 'juggernaut') {
      const pick = Math.abs(Math.imul(this.cfg.seed, 2654435761) >>> 0) % w.fighters.length;
      this.makeJuggernaut(pick);
    } else if (mode === 'gungame') {
      this.gunLevel = w.fighters.map(() => 0);
      for (const f of w.fighters) this.armGunGame(f.id);
    } else if (mode === 'coop') {
      this.wave = 0;
      this.waveBreak = 2;
      this.waveBots.clear();
      const humans = this.cfg.fighters.filter((f) => !f.isBot).length;
      this.lives = COOP.lives + COOP.livesPerHuman * humans;
      this.reviveProgress = w.fighters.map(() => 0);
      // bots wait off-stage for their wave
      for (const f of w.fighters) {
        if (!this.cfg.fighters[f.id].isBot) continue;
        f.alive = false;
        f.gone = true;
        f.hp = 0;
        f.state = 'dead';
      }
    }
  }

  private makeJuggernaut(i: number): void {
    const f = this.world.fighters[i];
    this.juggernaut = i;
    f.maxHp = JUGGERNAUT.hp;
    f.hp = JUGGERNAUT.hp;
    f.knockMul = JUGGERNAUT.knockMul;
    f.inv[SLOT.HEAVY] = { id: 'minigun', ammo: 400, dur: 1 };
    f.active = SLOT.HEAVY;
    this.events.push({ t: 'juggernaut', f: i });
  }

  private armGunGame(i: number): void {
    const f = this.world.fighters[i];
    if (!f.alive) return;
    const id = GUN_LADDER[Math.min(this.gunLevel[i] ?? 0, GUN_LADDER.length - 1)];
    const def = weaponDef(id);
    f.inv.fill(null);
    f.inv[def.slot] = { id, ammo: freshAmmo(def) || 1, dur: def.melee?.durability ?? 1 };
    f.active = def.slot;
  }

  private modeKill(killer: number, victim: number, weapon: string, cause: string): void {
    const mode = this.cfg.mode;
    const credited = killer >= 0 && killer !== victim;
    if (mode === 'deathmatch') {
      this.scoreKill(killer, victim);
      this.queueRespawn(victim);
    } else if (mode === 'koth') {
      this.queueRespawn(victim, 3);
    } else if (mode === 'juggernaut') {
      if (victim === this.juggernaut) {
        this.juggernaut = -1;
        if (credited) {
          this.addScore(this.teamOf(killer), 1);
          this.makeJuggernaut(killer);
        }
      } else if (credited && killer === this.juggernaut) {
        this.addScore(this.teamOf(killer), 1);
      }
      this.queueRespawn(victim);
    } else if (mode === 'gungame') {
      if (credited) {
        const top = this.gunLevel[killer] >= GUN_LADDER.length - 1;
        if (top) {
          this.gunLevel[killer] = GUN_LADDER.length;
          this.scores.set(this.teamOf(killer), GUN_LADDER.length);
          this.finishTimed(this.teamOf(killer));
          return;
        }
        this.gunLevel[killer]++;
        this.scores.set(this.teamOf(killer), this.gunLevel[killer]);
        this.armGunGame(killer);
        this.events.push({ t: 'gunLevel', f: killer, level: this.gunLevel[killer], weapon: GUN_LADDER[this.gunLevel[killer]], up: true });
        // humiliation: a melee kill knocks the victim down a level
        if ((cause === 'melee' || cause === 'kick' || weapon === 'knife') && this.gunLevel[victim] > 0) {
          this.gunLevel[victim]--;
          this.scores.set(this.teamOf(victim), this.gunLevel[victim]);
          this.events.push({ t: 'gunLevel', f: victim, level: this.gunLevel[victim], weapon: GUN_LADDER[this.gunLevel[victim]], up: false });
        }
      }
      this.queueRespawn(victim);
    } else if (mode === 'coop') {
      if (!this.cfg.fighters[victim].isBot) {
        if (this.lives > 0) {
          this.lives--;
          this.queueRespawn(victim, COOP.respawn);
        }
      } else if (credited) {
        this.addScore(this.teamOf(killer), 1);
      }
    }
  }

  private finishTimed(winner: number): void {
    this.matchWinner = winner;
    this.phase = 'matchEnd';
    this.phaseTime = 0;
    this.events.push({ t: 'matchEnd', winnerTeam: winner, winners: this.membersOf(winner) });
  }

  private scoreKill(killer: number, victim: number): void {
    const vTeam = teamKey({ id: victim, team: this.cfg.fighters[victim].team });
    if (killer >= 0 && killer !== victim) {
      const kTeam = teamKey({ id: killer, team: this.cfg.fighters[killer].team });
      if (kTeam !== vTeam) this.scores.set(kTeam, (this.scores.get(kTeam) ?? 0) + 1);
    } else {
      this.scores.set(vTeam, (this.scores.get(vTeam) ?? 0) - 1);
    }
  }

  private leaders(): number[] {
    const teams = new Set(this.cfg.fighters.map((f, i) => teamKey({ id: i, team: f.team })));
    let best = -Infinity;
    let out: number[] = [];
    for (const t of teams) {
      const s = this.scores.get(t) ?? 0;
      if (s > best) {
        best = s;
        out = [t];
      } else if (s === best) out.push(t);
    }
    return out;
  }

  private stepDeathmatch(intents: readonly Intent[]): void {
    const w = this.world;
    if (this.phase === 'fight') {
      for (const [id, tick] of this.respawnAt) {
        if (w.tick >= tick) {
          this.respawnAt.delete(id);
          w.respawn(w.fighters[id]);
          if (this.cfg.mode === 'gungame') this.armGunGame(id);
        }
      }
      if (this.cfg.mode === 'koth') this.stepHill();
      if (this.cfg.mode === 'gungame') {
        // the mode hands out weapons: re-arm anyone whose gun ran dry or got tossed
        for (const f of w.fighters) {
          if (!f.alive) continue;
          const id = GUN_LADDER[Math.min(this.gunLevel[f.id], GUN_LADDER.length - 1)];
          const it = f.inv[weaponDef(id).slot];
          if (!it || it.id !== id || (weaponDef(id).gun && it.ammo <= 0) || (weaponDef(id).throw && it.ammo <= 0)) this.armGunGame(f.id);
        }
      }
      if (this.cfg.mode === 'juggernaut' && this.juggernaut < 0) {
        // juggernaut died to the environment: pass it on to a random living fighter
        const alive = w.fighters.filter((f) => f.alive);
        if (alive.length) this.makeJuggernaut(alive[w.tick % alive.length].id);
      }
      if (this.cfg.mode === 'coop') {
        this.stepCoop(intents);
        return;
      }
      const target = this.cfg.mode === 'koth' ? this.cfg.target ?? KOTH_TARGET : this.cfg.mode === 'juggernaut' ? this.cfg.target ?? JUGGERNAUT.target : Infinity;
      for (const [team, s] of this.scores) {
        if (s >= target) {
          this.finishTimed(team);
          return;
        }
      }
      if (this.timeLeft <= 0) {
        const lead = this.leaders();
        if (lead.length === 1) {
          this.matchWinner = lead[0];
          this.phase = 'matchEnd';
          this.phaseTime = 0;
          this.events.push({ t: 'matchEnd', winnerTeam: lead[0], winners: this.membersOf(lead[0]) });
        } else if (!this.overtime) {
          this.overtime = true;
          this.events.push({ t: 'overtime' });
        }
      }
    } else if (this.phase === 'matchEnd' && this.phaseTime >= MATCH_END_TIME) {
      this.resetMatch();
    }
  }

  private stepHill(): void {
    const h = this.hill!;
    const inside = new Set<number>();
    for (const f of this.world.fighters) {
      if (!f.alive) continue;
      const cy = f.y - f.h / 2;
      if (f.x >= h.x && f.x <= h.x + h.w && cy >= h.y && cy <= h.y + h.h) inside.add(this.teamOf(f.id));
    }
    const holder = inside.size === 1 ? [...inside][0] : null;
    if (holder !== this.hillTeam) {
      this.hillTeam = holder;
      this.events.push({ t: 'hill', team: holder });
    }
    if (holder !== null) {
      const t = (this.hillTime.get(holder) ?? 0) + DT;
      this.hillTime.set(holder, t);
      this.scores.set(holder, Math.floor(t));
    }
  }

  private stepCoop(intents: readonly Intent[]): void {
    const w = this.world;
    const humans = w.fighters.filter((f) => !this.cfg.fighters[f.id].isBot);
    // revives: hold interact over a downed teammate's body
    for (const d of humans) {
      if (d.alive || d.gone) continue;
      const helper = humans.find((h) => h.alive && Math.abs(h.x - d.x) < COOP.reviveRange && Math.abs(h.y - d.y) < 20 && intents[h.id]?.interact);
      if (!d.alive && helper) {
        this.reviveProgress[d.id] += DT;
        if (this.reviveProgress[d.id] >= COOP.reviveTime) {
          this.reviveProgress[d.id] = 0;
          const x = d.x;
          const y = d.y;
          if (this.respawnAt.delete(d.id)) this.lives++; // the queued respawn would have cost a life: refund it
          w.respawn(d);
          d.x = d.px = x;
          d.y = d.py = y;
          d.hp = 50;
          this.events.push({ t: 'revive', f: d.id, by: helper.id });
        }
      } else if (!d.alive) this.reviveProgress[d.id] = Math.max(0, this.reviveProgress[d.id] - DT);
    }
    // waves
    const waveAlive = [...this.waveBots].some((i) => w.fighters[i].alive);
    if (this.wave > 0 && !waveAlive && this.waveBots.size > 0) {
      this.events.push({ t: 'waveCleared', wave: this.wave });
      this.waveBots.clear();
      this.waveBreak = COOP.waveBreak;
      if (this.wave >= COOP.victoryWave) {
        this.finishTimed(this.teamOf(humans[0].id));
        return;
      }
      // a medkit for the survivors
      const p = w.parsed.weaponSpawns[w.tick % Math.max(1, w.parsed.weaponSpawns.length)];
      if (p) w.spawnWeapon('medkit', p.x, p.y - 4);
    }
    if (this.waveBots.size === 0) {
      this.waveBreak -= DT;
      if (this.waveBreak <= 0) this.startWave();
    }
    // defeat: nobody standing and no lives (or respawns) left
    if (humans.every((f) => !f.alive) && this.respawnAt.size === 0) {
      const botTeam = this.teamOf(w.fighters.find((f) => this.cfg.fighters[f.id].isBot)?.id ?? 0);
      this.finishTimed(botTeam);
    }
  }

  private startWave(): void {
    const w = this.world;
    this.wave++;
    const bots = w.fighters.filter((f) => this.cfg.fighters[f.id].isBot);
    const n = Math.min(bots.length, 1 + this.wave);
    const boss = this.wave % COOP.bossEvery === 0;
    for (let k = 0; k < n; k++) {
      const f = bots[k];
      w.respawn(f);
      f.maxHp = f.hp = 100 + this.wave * 8;
      const pool = ['pistol', 'uzi', 'shotgun', 'smg', 'rifle', 'revolver', 'minigun', 'bazooka'];
      if (this.wave >= 2 && k % 2 === 0) {
        const id = pool[Math.min(pool.length - 1, Math.floor((this.wave + k) / 2))];
        const def = weaponDef(id);
        f.inv[def.slot] = { id, ammo: freshAmmo(def), dur: 1 };
        f.active = def.slot;
      }
      if (boss && k === 0) {
        f.maxHp = f.hp = 250 + this.wave * 40;
        f.knockMul = 0.35;
        f.inv[SLOT.HEAVY] = { id: this.wave >= 10 ? 'bazooka' : 'minigun', ammo: 400, dur: 1 };
        f.active = SLOT.HEAVY;
      }
      this.waveBots.add(f.id);
    }
    this.events.push({ t: 'wave', wave: this.wave, boss });
  }

  membersOf(team: number): number[] {
    return this.cfg.fighters.map((f, i) => ({ f, i })).filter(({ f, i }) => teamKey({ id: i, team: f.team }) === team).map(({ i }) => i);
  }

  private endRound(): void {
    this.lastRecording = this.recording;
    const alive = [...this.world.aliveTeams()];
    const winner = alive.length === 1 ? alive[0] : null;
    this.roundWinner = winner;
    if (winner !== null) {
      const s = (this.scores.get(winner) ?? 0) + 1;
      this.scores.set(winner, s);
      for (const i of this.membersOf(winner)) this.stats[i].roundsWon++;
      if (s >= this.cfg.roundsToWin) this.matchWinner = winner;
    }
    this.phase = 'roundEnd';
    this.phaseTime = 0;
    this.events.push({ t: 'roundEnd', winnerTeam: winner, winners: winner === null ? [] : this.membersOf(winner) });
  }

  private resetMatch(): void {
    this.scores.clear();
    this.cineScale = 1;
    this.matchWinner = null;
    this.round = 0;
    for (const s of this.stats) Object.assign(s, freshStats());
    this.startRound();
  }

  /** seconds are REAL seconds at 20% speed */
  private startSlowmo(realSeconds: number, x: number, y: number): void {
    const scale = 0.2;
    const ticks = Math.round(realSeconds * 60 * scale);
    if (ticks <= this.slowmoTicks) return;
    this.slowmoTicks = ticks;
    this.slowmoLen = ticks;
    this.cinematic = { x, y, ticks };
  }

  private updateSlowmo(): void {
    if (this.slowmoTicks > 0) {
      this.slowmoTicks--;
      const p = this.slowmoTicks / this.slowmoLen; // 1 -> 0
      // hold at 20%, ease back to 100% over the last 30%
      this.cineScale = p > 0.3 ? 0.2 : 0.2 + (1 - p / 0.3) * 0.8;
      if (this.cinematic) this.cinematic.ticks = this.slowmoTicks;
      if (this.slowmoTicks === 0) {
        this.cineScale = 1;
        this.cinematic = null;
      }
    }
    const bt = this.world.bulletTime > 0 ? (weaponDef('bullettime').powerup?.mult ?? 0.4) : 1;
    this.timeScale = Math.min(this.cineScale, bt);
  }
}
