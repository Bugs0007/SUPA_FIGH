import Phaser from 'phaser';
import { BotController } from '../ai/bot';
import { DIFFICULTIES, type Difficulty } from '../ai/botData';
import { PLAYER_PRESETS, randomAppearance, type Appearance } from '../art/appearance';
import { heroLook } from '../art/heroArt';
import { HEROES } from '../sim/data/heroes';
import { hexToNum, TEAM_COLORS } from '../art/palette';
import { audio } from '../audio/AudioManager';
import { music } from '../audio/music';
import { settings } from '../game/settings';
import { profiles } from '../game/profiles';
import { MAP_LIST } from '../sim/map/maps';
import { keyboardBinds } from '../input/bindings';
import { KeyboardController, type Controller } from '../input/controllers';
import { GamepadController } from '../input/gamepad';
import { keyboard } from '../input/keyboard';
import { CameraDirector } from '../render/CameraDirector';
import { Juice, type UiEvent } from '../render/Juice';
import { WorldRenderer, type FighterLook } from '../render/WorldRenderer';
import { DT } from '../sim/constants';
import type { FighterSpawn } from '../sim/fighter';
import type { Intent } from '../sim/intent';
import { COOP, Match, type MatchConfig, type MatchEvent } from '../sim/match';
import type { World } from '../sim/world';
import { ReplayPlayer, type RoundRecording } from '../sim/replay';
import { padMenu } from '../input/gamepad';

export interface PlayerSetup {
  spawn: FighterSpawn;
  look: Appearance;
  color: number;
  label: string;
  /** 'kb0' | 'kb1' | 'bot' */
  input: string;
  difficulty?: Difficulty;
}

/** Inputs a human plays with (gets an HUD panel): keyboard layouts and gamepads. */
export function isHumanInput(input: string): boolean {
  return input.startsWith('kb') || input.startsWith('pad');
}

export interface MatchSceneData {
  config: MatchConfig;
  players: PlayerSetup[];
}

const PLAYER_COLORS = [0xea4a4a, 0x4a8af0, 0x5ac85a, 0xf8c840];

/** 'random' (title screen choice) -> a map picked from the seed; unknown ids fall back to the test arena. */
function quickMapId(id: string, seed: number): string {
  if (id === 'random') return MAP_LIST[Math.abs(seed) % MAP_LIST.length].id;
  return id;
}

/**
 * Quick-match setup: keyboard players (?humans=0..2) + bots (?bots=N, ?diff=easy|normal|hard|expert).
 * ?heroes=naruto,luffy,goku assigns heroes in player order (humans first, '-' = scrapyard fighter);
 * hero power-ups spawn unless ?powers=0.
 */
export function defaultSetup(params: URLSearchParams): MatchSceneData {
  const bots = Math.max(0, Math.min(8, Number(params.get('bots') ?? 0)));
  const diffParam = params.get('diff') ?? settings.botDifficulty;
  const difficulty: Difficulty = diffParam in DIFFICULTIES ? (diffParam as Difficulty) : 'normal';
  const seed = Number(params.get('seed') ?? Math.floor(Math.random() * 1e9));
  const humans = Math.max(0, Math.min(2, Number(params.get('humans') ?? settings.quickPlayers)));
  const players: PlayerSetup[] = [];
  // ?heroes= wins (tests, links); otherwise the title screen's fighter cards (profiles) decide
  const heroes = params.has('heroes')
    ? (params.get('heroes') ?? '').split(',').map((h) => (h in HEROES ? h : ''))
    : profiles.map((p) => p.hero);
  for (let i = 0; i < humans; i++) {
    const name = profiles[i]?.name ?? 'P' + (i + 1);
    players.push({
      spawn: { name, team: 0, isBot: false, upJumps: settings.upJump, hero: heroes[i] || undefined },
      look: heroLook(heroes[i] ?? '', profiles[i]?.look ?? PLAYER_PRESETS[i]),
      color: PLAYER_COLORS[i],
      label: name,
      input: 'kb' + i,
    });
  }
  let r = seed;
  const rand = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < bots; i++) {
    players.push({
      spawn: { name: 'BOT ' + (i + 1), team: 0, isBot: true, upJumps: false, hero: heroes[humans + i] },
      look: heroLook(heroes[humans + i] ?? '', randomAppearance(rand)),
      color: hexToNum(TEAM_COLORS[0]),
      label: 'B' + (i + 1),
      input: 'bot',
      difficulty,
    });
  }
  return {
    players,
    config: {
      mapId: quickMapId(params.get('map') ?? settings.quickMap, seed),
      mode: (['deathmatch', 'koth', 'juggernaut', 'gungame', 'coop'] as const).find((m) => m === params.get('mode')) ?? 'brawl',
      timeLimit: Number(params.get('time') ?? 180) || 180,
      chaos: params.get('chaos') === '1',
      modifiers: params.get('mods')?.split(',').filter(Boolean),
      fighters: players.map((p) => p.spawn),
      roundsToWin: 5,
      friendlyFire: false,
      weaponSpawnRate: 1,
      heroPowers: params.get('powers') !== '0',
      seed,
    },
  };
}

export class MatchScene extends Phaser.Scene {
  match!: Match;
  wr!: WorldRenderer;
  camDir!: CameraDirector;
  juice!: Juice;
  players: PlayerSetup[] = [];
  controllers: Controller[] = [];
  looks: FighterLook[] = [];
  /** events for the HUD */
  ui: UiEvent[] = [];
  matchEvents: MatchEvent[] = [];
  paused = false;
  /** sim speed multiplier (debug F2 / ?speed=) */
  speed = 1;
  private acc = 0;
  private hitstop = 0;
  private renderedWorld: World | null = null;
  private intents: Intent[] = [];
  private frameStep = false;
  private elapsed = 0;
  /** instant replay in progress (match paused underneath) */
  replay: {
    rec: RoundRecording;
    player: ReplayPlayer;
    start: number;
    end: number;
    ready: boolean;
    acc: number;
    age: number;
  } | null = null;
  private setupData!: MatchSceneData;
  /** match events held back while a replay plays (banners after the replay) */
  private heldEvents: MatchEvent[] = [];

  constructor() {
    super('match');
  }

  create(data: MatchSceneData): void {
    const params = new URLSearchParams(location.search);
    const setup = data?.config ? data : defaultSetup(params);
    this.setupData = setup;
    // the scene instance is reused by restart/start: reset all per-match state
    this.paused = false;
    this.replay = null;
    this.heldEvents = [];
    this.ui = [];
    this.matchEvents = [];
    this.acc = 0;
    this.hitstop = 0;
    this.frameStep = false;
    this.elapsed = 0;
    this.renderedWorld = null;
    audio.timePitch = 1;
    this.speed = Number(params.get('speed') ?? 1) || 1;
    this.players = setup.players;
    this.looks = setup.players.map((p) => ({ look: p.look, color: p.color, label: p.label }));
    this.match = new Match(setup.config);
    this.controllers = setup.players.map((p, i) => {
      if (p.input === 'kb0' || p.input === 'kb1') return new KeyboardController(keyboard, keyboardBinds[p.input === 'kb0' ? 0 : 1], p.label);
      if (p.input.startsWith('pad')) return new GamepadController(Number(p.input.slice(3)));
      return new BotController(() => this.match.world, i, { difficulty: p.difficulty, seed: setup.config.seed });
    });
    this.intents = this.controllers.map((c) => c.poll());

    const k = (this.registry.get('scale') as number) ?? 1;
    this.camDir = new CameraDirector(this.cameras.main, k);
    this.cameras.main.setRoundPixels(true);
    this.camDir.shakeScale = settings.screenShake;
    this.buildRenderer();

    this.game.events.on('rescale', this.onRescale, this);
    this.events.once('shutdown', () => {
      this.game.events.off('rescale', this.onRescale, this);
      this.wr?.destroy();
      this.scene.stop('hud');
      this.scene.stop('bg');
    });
    this.scene.launch('bg', { theme: this.match.world.def.theme });
    this.scene.sendToBack('bg');
    this.scene.launch('hud');
    audio.play('roundStart');
    music.play('match');
  }

  private onRescale(k: number): void {
    this.camDir.baseZoom = k;
  }

  private buildRenderer(): void {
    this.wr?.destroy();
    this.renderedWorld = this.match.world;
    this.wr = new WorldRenderer(this, this.match.world, this.looks);
    this.juice = new Juice(this.wr, this.camDir);
    this.acc = 0;
  }

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.1);
    this.elapsed += dt;
    this.handleDebugKeys();
    if (this.replay) {
      this.updateReplay(dt);
      return;
    }

    if (!this.paused || this.frameStep) {
      if (this.hitstop > 0) {
        this.hitstop -= dt;
      } else {
        this.acc += dt * this.match.timeScale * this.speed;
        if (this.frameStep) this.acc = DT;
        let steps = 0;
        const maxSteps = Math.max(8, Math.ceil(this.speed * 3));
        while (this.acc >= DT && steps < maxSteps) {
          for (let i = 0; i < this.controllers.length; i++) this.intents[i] = this.controllers[i].poll();
          this.match.step(this.intents);
          this.acc -= DT;
          steps++;
          this.drainEvents();
          if (this.replay) break; // the round ended on a kill: play it back first
          if (this.match.world !== this.renderedWorld) {
            this.buildRenderer();
            break;
          }
        }
        if (steps >= maxSteps) this.acc = 0;
      }
      this.frameStep = false;
    }

    audio.timePitch = 0.6 + 0.4 * this.match.timeScale;
    const alpha = Math.min(1, this.acc / DT);
    const visDt = this.paused ? 0 : dt * Math.max(0.25, this.match.timeScale);
    this.wr.bounty = this.match.bounty;
    this.wr.hill = this.match.hill;
    this.wr.hillColor = this.match.hillTeam === null ? 0xffffff : (this.players[this.match.membersOf(this.match.hillTeam)[0]]?.color ?? 0x5ac85a);
    this.wr.revive = this.match.reviveProgress.map((p) => p / COOP.reviveTime);
    this.wr.sync(alpha, visDt, this.elapsed);
    this.camDir.update(dt, this.match.world, this.match.cinematic);
  }

  private drainEvents(): void {
    const w = this.match.world;
    for (const e of w.events) {
      this.juice.handle(e, w);
      this.feedback(e, w);
    }
    w.events.length = 0;
    if (this.juice.hitstop > 0) {
      this.hitstop = Math.max(this.hitstop, this.juice.hitstop);
      this.juice.hitstop = 0;
    }
    if (this.juice.ui.length) {
      this.ui.push(...this.juice.ui);
      this.juice.ui.length = 0;
    }
    for (const e of this.match.events) {
      if ((e.t === 'roundEnd' || e.t === 'matchEnd') && this.startReplay()) {
        this.heldEvents.push(e);
        continue;
      }
      if (this.replay) {
        this.heldEvents.push(e);
        continue;
      }
      this.matchEvents.push(e);
      if (e.t === 'roundStart') {
        audio.play('roundStart');
        music.play('match');
      } else if ((e.t === 'suddenDeath' && e.level === 1) || e.t === 'overtime' || (e.t === 'wave' && e.boss)) music.play('intense');
      else if (e.t === 'roundEnd' || e.t === 'matchEnd') audio.play('roundEnd');
      else if (e.t === 'finalKill') {
        audio.play('slowmo');
        this.camDir.addTrauma(0.3);
      }
    }
    this.match.events.length = 0;
  }

  // ------------------------------------------------------------ instant replay

  private startReplay(): boolean {
    const rec = this.match.lastRecording;
    if (!settings.replays || !rec || rec.finalKillTick <= 0 || this.speed > 1) return false;
    const killIdx = rec.finalKillTick - 1;
    this.replay = {
      rec,
      player: new ReplayPlayer(rec),
      start: Math.max(0, killIdx - 150),
      end: Math.min(rec.ticks, killIdx + 80),
      ready: false,
      acc: 0,
      age: 0,
    };
    return true;
  }

  private updateReplay(dt: number): void {
    const r = this.replay!;
    if (!r.ready) {
      // fast-forward in chunks so long rounds don't hitch
      if (!r.player.skipTo(r.start, 1500)) return;
      r.ready = true;
      this.wr.destroy();
      this.renderedWorld = r.player.world;
      this.wr = new WorldRenderer(this, r.player.world, this.looks);
      this.juice = new Juice(this.wr, this.camDir);
      this.acc = 0;
      audio.play('uiOk', { pitch: 0.6 });
    }
    r.age += dt;
    const skip = r.age > 0.4 && (keyboard.anyJustPressed() || padMenu.justPressed(0) || padMenu.justPressed(2) || padMenu.justPressed(9));
    const w = r.player.world;
    const nearKill = r.player.t >= r.rec.finalKillTick - 1 - 40;
    const scale = nearKill ? 0.25 : 0.55;
    r.acc += dt * scale;
    while (r.acc >= DT && !r.player.done && r.player.t < r.end) {
      r.player.step();
      r.acc -= DT;
      for (const e of w.events) this.juice.handle(e, w);
      w.events.length = 0;
      this.juice.ui.length = 0;
      this.juice.hitstop = 0;
    }
    audio.timePitch = 0.6 + 0.4 * scale;
    this.wr.sync(Math.min(1, r.acc / DT), dt * scale, this.elapsed);
    const focus = nearKill ? { x: r.rec.finalKillX, y: r.rec.finalKillY, ticks: 30 } : null;
    this.camDir.update(dt, w, focus);
    if (skip || r.player.done || r.player.t >= r.end) this.endReplay();
  }

  private endReplay(): void {
    this.replay = null;
    audio.timePitch = 1;
    this.buildRenderer();
    this.matchEvents.push(...this.heldEvents);
    for (const e of this.heldEvents) if (e.t === 'roundEnd' || e.t === 'matchEnd') audio.play('roundEnd');
    this.heldEvents.length = 0;
  }

  /** Gamepad rumble for the fighters that pads control. */
  private feedback(e: World['events'][number], w: World): void {
    if (e.t === 'hit' && !e.corpse) {
      this.controllers[e.victim]?.rumble?.(Math.min(1, 0.25 + e.damage / 40), 110);
      if (e.attacker >= 0 && e.attacker !== e.victim) this.controllers[e.attacker]?.rumble?.(0.15, 50);
    } else if (e.t === 'explosion') {
      w.fighters.forEach((f, i) => {
        const d = Math.hypot(f.x - e.x, f.y - e.y);
        if (f.alive && d < e.radius * 3) this.controllers[i]?.rumble?.(Math.min(1, 1.2 - d / (e.radius * 3)), 260);
      });
    } else if (e.t === 'shot') {
      this.controllers[e.f]?.rumble?.(0.12, 40);
    }
  }

  /** a settings/controls overlay is open on top of the paused match */
  get overlayOpen(): boolean {
    return this.scene.isActive('settings') || this.scene.isActive('controls');
  }

  /** Pause menu actions (driven by the HUD). */
  pauseAction(a: 'resume' | 'restart' | 'settings' | 'controls' | 'quit'): void {
    if (a === 'resume') {
      this.paused = false;
      audio.play('uiOk');
    } else if (a === 'restart') {
      this.scene.restart(this.setupData);
    } else if (a === 'quit') {
      this.scene.start('title');
    } else {
      this.scene.launch(a, a === 'settings' ? { overlay: true } : { from: 'overlay' });
      this.scene.bringToTop(a);
    }
  }

  private handleDebugKeys(): void {
    if (this.overlayOpen) return;
    // P pauses too, unless a player has it bound (P2's laptop layout uses P for the hero ability)
    const pKey = keyboard.justPressed('KeyP') && !keyboard.gameKeys.has('KeyP');
    if (keyboard.justPressed('Escape') || pKey || padMenu.justPressed(9)) {
      this.paused = !this.paused;
      audio.play(this.paused ? 'uiBack' : 'uiOk');
    }
    if (keyboard.justPressed('F1')) this.wr.debug = !this.wr.debug;
    if (keyboard.justPressed('F2')) this.speed = this.speed >= 4 ? 1 : this.speed * 2;
    if (keyboard.justPressed('F3')) {
      this.paused = true;
      this.frameStep = true;
    }
  }
}
