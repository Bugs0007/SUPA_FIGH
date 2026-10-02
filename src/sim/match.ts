import { DT, MATCH_END_TIME, ROUND_END_CONFIRM, ROUND_END_TIME, SUDDEN_DEATH_DRAIN_AFTER } from './constants';
import { teamKey } from './combat';
import { weaponDef } from './data/weapons';
import type { FighterSpawn } from './fighter';
import type { Intent } from './intent';
import { getMap } from './map/maps';
import { World, type WorldSettings } from './world';

/** brawl = rounds, last team standing. deathmatch = one timed round with respawns, most kills wins. */
export type GameMode = 'brawl' | 'deathmatch';

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
}

export const MODE_NAMES: Record<GameMode, string> = { brawl: 'BRAWL', deathmatch: 'DEATHMATCH' };

export type MatchPhase = 'fight' | 'roundEnd' | 'matchEnd';

export type MatchEvent =
  | { t: 'roundStart'; round: number }
  | { t: 'roundEnd'; winnerTeam: number | null; winners: number[] }
  | { t: 'matchEnd'; winnerTeam: number; winners: number[] }
  | { t: 'finalKill'; x: number; y: number }
  | { t: 'multiKill'; f: number; count: number }
  | { t: 'suddenDeath'; level: number }
  | { t: 'overtime' };

export interface FighterStats {
  kills: number;
  deaths: number;
  suicides: number;
  damage: number;
  roundsWon: number;
}

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

  constructor(cfg: MatchConfig) {
    this.cfg = cfg;
    this.stats = cfg.fighters.map(() => ({ kills: 0, deaths: 0, suicides: 0, damage: 0, roundsWon: 0 }));
    this.startRound();
  }

  get teamCount(): number {
    return new Set(this.cfg.fighters.map((f, i) => teamKey({ id: i, team: f.team }))).size;
  }

  worldSettings(): WorldSettings {
    return { friendlyFire: this.cfg.friendlyFire, weaponSpawnRate: this.cfg.weaponSpawnRate, gravityScale: 1 };
  }

  startRound(): void {
    this.round++;
    this.world = new World(getMap(this.cfg.mapId), this.cfg.fighters, this.worldSettings(), this.cfg.seed + this.round * 7919);
    this.phase = 'fight';
    this.phaseTime = 0;
    this.decideTimer = -1;
    this.roundWinner = null;
    this.recentKills.length = 0;
    this.respawnAt.clear();
    this.overtime = false;
    this.events.push({ t: 'roundStart', round: this.round });
  }

  step(intents: readonly Intent[]): void {
    const w = this.world;
    const evStart = w.events.length;
    w.step(intents);
    this.phaseTime += DT;

    for (let i = evStart; i < w.events.length; i++) {
      const e = w.events[i];
      if (e.t === 'hit' && !e.corpse && e.attacker >= 0 && e.attacker !== e.victim) {
        this.stats[e.attacker].damage += e.damage;
      } else if (e.t === 'kill') {
        this.stats[e.victim].deaths++;
        if (e.killer >= 0 && e.killer !== e.victim) {
          this.stats[e.killer].kills++;
          this.recentKills.push({ killer: e.killer, tick: w.tick });
          const n = this.recentKills.filter((k) => k.killer === e.killer && w.tick - k.tick < 90).length;
          if (n >= 2) {
            this.events.push({ t: 'multiKill', f: e.killer, count: n });
            this.startSlowmo(0.9, e.x, e.y);
          }
        } else {
          this.stats[e.victim].suicides++;
        }
        if (this.cfg.mode === 'deathmatch') {
          this.scoreKill(e.killer, e.victim);
          this.respawnAt.set(e.victim, w.tick + Math.round((this.cfg.respawnDelay ?? 2.5) / DT));
          continue;
        }
        if (this.phase === 'fight' && this.teamCount > 1 && w.aliveTeams().size <= 1) {
          this.events.push({ t: 'finalKill', x: e.x, y: e.y });
          this.startSlowmo(1.5, e.x, e.y);
        }
      }
    }

    this.updateSlowmo();

    if (this.cfg.mode === 'deathmatch') {
      this.stepDeathmatch();
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

  /** Deathmatch seconds left (0 in other modes). */
  get timeLeft(): number {
    if (this.cfg.mode !== 'deathmatch' || this.phase !== 'fight') return 0;
    return Math.max(0, (this.cfg.timeLimit ?? 180) - this.phaseTime);
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

  private stepDeathmatch(): void {
    const w = this.world;
    if (this.phase === 'fight') {
      for (const [id, tick] of this.respawnAt) {
        if (w.tick >= tick) {
          this.respawnAt.delete(id);
          w.respawn(w.fighters[id]);
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

  membersOf(team: number): number[] {
    return this.cfg.fighters.map((f, i) => ({ f, i })).filter(({ f, i }) => teamKey({ id: i, team: f.team }) === team).map(({ i }) => i);
  }

  private endRound(): void {
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
    for (const s of this.stats) Object.assign(s, { kills: 0, deaths: 0, suicides: 0, damage: 0, roundsWon: 0 });
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
