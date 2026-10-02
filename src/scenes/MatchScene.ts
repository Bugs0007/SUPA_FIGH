import Phaser from 'phaser';
import { BotController } from '../ai/bot';
import { DIFFICULTIES, type Difficulty } from '../ai/botData';
import { PLAYER_PRESETS, randomAppearance, type Appearance } from '../art/appearance';
import { hexToNum, TEAM_COLORS } from '../art/palette';
import { audio } from '../audio/AudioManager';
import { settings } from '../game/settings';
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
import { Match, type MatchConfig, type MatchEvent } from '../sim/match';
import type { World } from '../sim/world';

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

/** Quick-match setup: keyboard players (?humans=0..2) + bots (?bots=N, ?diff=easy|normal|hard|expert). */
export function defaultSetup(params: URLSearchParams): MatchSceneData {
  const bots = Math.max(0, Math.min(8, Number(params.get('bots') ?? 0)));
  const diffParam = params.get('diff') ?? settings.botDifficulty;
  const difficulty: Difficulty = diffParam in DIFFICULTIES ? (diffParam as Difficulty) : 'normal';
  const seed = Number(params.get('seed') ?? Math.floor(Math.random() * 1e9));
  const humans = Math.max(0, Math.min(2, Number(params.get('humans') ?? 2)));
  const players: PlayerSetup[] = [];
  for (let i = 0; i < humans; i++) {
    players.push({
      spawn: { name: 'P' + (i + 1), team: 0, isBot: false, upJumps: true },
      look: PLAYER_PRESETS[i],
      color: PLAYER_COLORS[i],
      label: 'P' + (i + 1),
      input: 'kb' + i,
    });
  }
  let r = seed;
  const rand = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < bots; i++) {
    players.push({
      spawn: { name: 'BOT ' + (i + 1), team: 0, isBot: true, upJumps: false },
      look: randomAppearance(rand),
      color: hexToNum(TEAM_COLORS[0]),
      label: 'B' + (i + 1),
      input: 'bot',
      difficulty,
    });
  }
  return {
    players,
    config: {
      mapId: params.get('map') ?? 'test',
      mode: params.get('mode') === 'deathmatch' ? 'deathmatch' : 'brawl',
      timeLimit: Number(params.get('time') ?? 180) || 180,
      fighters: players.map((p) => p.spawn),
      roundsToWin: 5,
      friendlyFire: false,
      weaponSpawnRate: 1,
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

  constructor() {
    super('match');
  }

  create(data: MatchSceneData): void {
    const params = new URLSearchParams(location.search);
    const setup = data?.config ? data : defaultSetup(params);
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
      this.matchEvents.push(e);
      if (e.t === 'roundStart') audio.play('roundStart');
      else if (e.t === 'roundEnd' || e.t === 'matchEnd') audio.play('roundEnd');
      else if (e.t === 'finalKill') {
        audio.play('slowmo');
        this.camDir.addTrauma(0.3);
      }
    }
    this.match.events.length = 0;
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

  private handleDebugKeys(): void {
    if (keyboard.justPressed('Escape') || keyboard.justPressed('KeyP')) {
      this.paused = !this.paused;
      audio.play(this.paused ? 'uiBack' : 'uiOk');
    }
    if (this.paused && keyboard.justPressed('KeyQ')) {
      this.scene.start('title');
      return;
    }
    if (keyboard.justPressed('F1')) this.wr.debug = !this.wr.debug;
    if (keyboard.justPressed('F2')) this.speed = this.speed >= 4 ? 1 : this.speed * 2;
    if (keyboard.justPressed('F3')) {
      this.paused = true;
      this.frameStep = true;
    }
  }
}
