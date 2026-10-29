import Phaser from 'phaser';
import { DIFFICULTIES, type Difficulty } from '../ai/botData';
import { lookToWire } from '../art/appearance';
import { hexToNum, P } from '../art/palette';
import { audio } from '../audio/AudioManager';
import { deviceId, isSecureContextish, rememberServer, serverUrl } from '../game/netStore';
import { isTouchDevice, VIEW_H, VIEW_W } from '../game/display';
import { profiles } from '../game/profiles';
import { keyboard } from '../input/keyboard';
import { menu } from '../input/menu';
import { NetClient } from '../net/client';
import { MAX_FIGHTERS, MODES, type BotSpec, type RoomConfig, type RoomInfo, type ServerMsg, type SlotClaim } from '../net/protocol';
import { RemoteSim } from '../net/remoteSim';
import { HERO_ORDER, HEROES } from '../sim/data/heroes';
import { getMap, MAP_LIST } from '../sim/map/maps';
import { MODE_NAMES } from '../sim/match';
import { hint, HintBar, panel, rowBar } from './kit';
import { netMatchData, NET_COLORS } from './netSetup';
import { bindZoom } from './ui';

export interface NetLobbyData {
  /** which menu button brought us here */
  role?: 'host' | 'join';
  /** coming back from a match: keep the open connection */
  client?: NetClient;
}

type Phase = 'connecting' | 'error' | 'rooms' | 'room';
type RowId = 'map' | 'mode' | 'length' | 'bots' | 'skill' | 'botHeroes' | 'ff' | 'weapons' | 'chaos' | 'powers' | 'p1' | 'f1' | 'p2' | 'f2' | 'ready' | 'start' | 'leave';

const SETTING_ROWS: RowId[] = ['map', 'mode', 'length', 'bots', 'skill', 'botHeroes', 'ff', 'weapons', 'chaos', 'powers'];
const ROW_LABELS: Record<RowId, string> = {
  map: 'MAP',
  mode: 'MODE',
  length: 'LENGTH',
  bots: 'BOTS',
  skill: 'BOT SKILL',
  botHeroes: 'BOT HEROES',
  ff: 'FRIENDLY FIRE',
  weapons: 'WEAPONS',
  chaos: 'CHAOS CARDS',
  powers: 'HERO POWERS',
  p1: 'PLAYER 1',
  f1: 'FIGHTER 1',
  p2: 'PLAYER 2',
  f2: 'FIGHTER 2',
  ready: 'READY',
  start: 'START MATCH',
  leave: 'LEAVE ROOM',
};
const DIFFS = Object.keys(DIFFICULTIES) as Difficulty[];
const TIMES = [60, 120, 180, 300];
const ROW_H = 14;
const PANEL_Y = 36;

const cycle = <T,>(list: readonly T[], cur: T, d: number): T => list[(list.indexOf(cur) + d + list.length) % list.length];
const clip = (s: string, n: number) => s.toUpperCase().slice(0, n);

/** The shown room error for a server error message (the server's wording is for logs). */
const ERRORS: Record<string, string> = {
  notHost: 'ONLY THE HOST CAN DO THAT',
  full: 'THE ROOM IS FULL',
  notReady: 'NOT EVERYONE IS READY',
  noPlayers: 'PICK A FIGHTER FIRST',
  state: 'A MATCH IS RUNNING',
  noRoom: 'NO SUCH ROOM',
  version: 'THE HOST RUNS A DIFFERENT VERSION',
};

/**
 * Host game / Join game. One scene, four screens: connecting, the "can't connect" checklist, the room list (join),
 * and the room lobby (fighters on the left; settings, this device's players and READY / START on the right).
 * Everything the room shows comes from the server's `room` message; every button just sends a message.
 */
export class NetLobbyScene extends Phaser.Scene {
  private client!: NetClient;
  private phase: Phase = 'connecting';
  private role: 'host' | 'join' = 'join';
  private row = 0;
  private rooms: RoomInfo[] = [];
  private code = '';
  private roomIdx = 0;
  private hero: [string, string] = ['', ''];
  private autoClaimed = false;
  private leaving = false;
  private flashText = '';
  private flashUntil = 0;
  private gfx!: Phaser.GameObjects.Graphics;
  private bar!: HintBar;
  private title!: Phaser.GameObjects.BitmapText;
  private sub!: Phaser.GameObjects.BitmapText;
  private status!: Phaser.GameObjects.BitmapText;
  private lines: Phaser.GameObjects.BitmapText[] = [];
  private labels: Phaser.GameObjects.BitmapText[] = [];
  private values: Phaser.GameObjects.BitmapText[] = [];
  private fighterTexts: Phaser.GameObjects.BitmapText[][] = [];
  private heads: Phaser.GameObjects.BitmapText[] = [];
  private offMsg: (() => void) | null = null;
  private offState: (() => void) | null = null;
  private listTimer: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super('netlobby');
  }

  create(data: NetLobbyData): void {
    bindZoom(this, VIEW_W, VIEW_H);
    this.cameras.main.setBackgroundColor(P.night);
    // the scene instance is reused: reset everything
    this.phase = 'connecting';
    this.role = data?.role ?? 'join';
    this.row = 0;
    this.rooms = [];
    this.code = '';
    this.roomIdx = 0;
    this.hero = [profiles[0].hero, profiles[1].hero];
    this.autoClaimed = false;
    this.leaving = false;
    this.flashText = '';
    this.lines = [];
    this.labels = [];
    this.values = [];
    this.fighterTexts = [];
    this.heads = [];
    this.listTimer = null;

    this.gfx = this.add.graphics();
    this.title = this.add.bitmapText(VIEW_W / 2, 8, 'pxo', '').setOrigin(0.5, 0).setScale(2).setTint(hexToNum(P.yellow));
    this.sub = this.add.bitmapText(VIEW_W / 2, 26, 'smo', '').setOrigin(0.5, 0).setTint(0x8d95b0);
    this.status = this.add.bitmapText(VIEW_W / 2, VIEW_H - 30, 'smo', '').setOrigin(0.5, 0).setTint(0xf8c840);
    for (let i = 0; i < 12; i++) this.lines.push(this.add.bitmapText(VIEW_W / 2, 70 + i * 14, 'smo', '').setOrigin(0.5, 0));
    for (let i = 0; i < 17; i++) {
      this.labels.push(this.add.bitmapText(326, PANEL_Y + 18 + i * ROW_H, 'sm', ''));
      this.values.push(this.add.bitmapText(626, PANEL_Y + 17 + i * ROW_H, 'smo', '').setOrigin(1, 0));
    }
    for (let i = 0; i < MAX_FIGHTERS; i++) {
      const y = PANEL_Y + 20 + i * 27;
      this.fighterTexts.push([
        this.add.bitmapText(26, y, 'smo', ''),
        this.add.bitmapText(26, y + 10, 'sm', '').setTint(0x8d95b0),
        this.add.bitmapText(302, y + 3, 'smo', '').setOrigin(1, 0),
      ]);
    }
    this.heads = [this.add.bitmapText(14, PANEL_Y + 3, 'smo', 'FIGHTERS'), this.add.bitmapText(326, PANEL_Y + 3, 'smo', 'SETTINGS')];
    this.bar = new HintBar(this);
    this.events.once('shutdown', () => {
      this.offMsg?.();
      this.offState?.();
      this.listTimer?.remove();
      this.bar.destroy();
    });

    if (data?.client) {
      this.client = data.client;
      this.attach();
      this.phase = this.client.room ? 'room' : 'rooms';
      if (this.phase === 'rooms') this.pollRooms();
    } else {
      void this.connect();
    }
  }

  // ------------------------------------------------------------ connection

  private async connect(): Promise<void> {
    this.phase = 'connecting';
    this.offMsg?.();
    this.offState?.();
    this.client?.close();
    const url = serverUrl();
    this.client = new NetClient(deviceId(), profiles[0].name, (u) => new WebSocket(u));
    this.attach();
    try {
      await this.client.connect(url);
    } catch {
      if (this.leaving) return;
      this.phase = 'error';
      return;
    }
    rememberServer(url);
    // a returning device is put straight back into its room by the server: give that message a moment to arrive
    this.time.delayedCall(350, () => {
      if (this.leaving || this.phase !== 'connecting') return;
      if (this.client.room) return void (this.phase = 'room');
      if (this.role === 'host') this.client.send({ t: 'create' });
      else {
        this.phase = 'rooms';
        this.pollRooms();
      }
    });
  }

  private attach(): void {
    this.offMsg = this.client.onMessage((m) => this.onMessage(m));
    this.offState = this.client.onState((s) => {
      if (s === 'closed' && !this.leaving) this.phase = 'error';
    });
  }

  private pollRooms(): void {
    this.client.send({ t: 'list' });
    this.listTimer?.remove();
    this.listTimer = this.time.addEvent({ delay: 2000, loop: true, callback: () => this.phase === 'rooms' && this.client.send({ t: 'list' }) });
  }

  private onMessage(m: ServerMsg): void {
    if (m.t === 'rooms') this.rooms = m.rooms;
    else if (m.t === 'room') {
      if (this.phase !== 'room') {
        this.phase = 'room';
        this.row = 0;
        this.listTimer?.remove();
      }
      if (!this.autoClaimed && !this.me()?.claims.some(Boolean)) {
        // a new arrival plays with the first profile of this device straight away; more players are opt-in
        this.client.send({ t: 'claim', local: 0, claim: this.claimFor(0) });
      }
      if (!this.autoClaimed && !isSecureContextish() && isTouchDevice()) {
        // no wake lock over plain http: say so once, before the screen dims in the middle of a match
        this.flash('TIP: SET YOUR SCREEN TIMEOUT TO NEVER (NO WAKE LOCK OVER HTTP)', true, 6000);
      }
      this.autoClaimed = true;
      this.clampRow();
    } else if (m.t === 'err') this.flash(ERRORS[m.code] ?? m.msg.toUpperCase());
    else if (m.t === 'start') {
      this.leaving = true; // the scene is going away: no "closed" screen
      this.scene.start('match', netMatchData(new RemoteSim(this.client, m)));
    }
  }

  private flash(text: string, quiet = false, ms = 3000): void {
    this.flashText = text;
    this.flashUntil = this.time.now + ms;
    if (!quiet) audio.play('uiBack');
  }

  // ------------------------------------------------------------ room helpers

  private me() {
    return this.client.room?.peers.find((p) => p.device === this.client.device);
  }

  private isHostSafe(): boolean {
    return !this.client.room || this.isHost;
  }

  private get isHost(): boolean {
    return this.client.room?.host === this.client.device;
  }

  private claimFor(n: 0 | 1): SlotClaim {
    const p = profiles[n];
    return { name: p.name, hero: this.hero[n], upJumps: true, look: lookToWire(p.look) };
  }

  /** Focusable rows: settings for the host, then this device's players, then READY / START and LEAVE. */
  private rows(): RowId[] {
    const players: RowId[] = isTouchDevice() ? ['p1', 'f1'] : ['p1', 'f1', 'p2', 'f2'];
    return [...(this.isHost ? SETTING_ROWS : []), ...players, this.isHost ? 'start' : 'ready', 'leave'];
  }

  private clampRow(): void {
    this.row = Math.min(this.row, this.rows().length - 1);
  }

  private claimed(n: 0 | 1): boolean {
    return !!this.me()?.claims[n];
  }

  private humans(): number {
    return (this.client.room?.peers ?? []).reduce((a, p) => a + (p.connected ? p.claims.filter(Boolean).length : 0), 0);
  }

  private setBots(cfg: RoomConfig, n: number, skill: Difficulty, heroes: boolean): void {
    const bots: BotSpec[] = Array.from({ length: n }, (_, i) => ({ hero: heroes ? HERO_ORDER[(i + 1) % HERO_ORDER.length] : '', difficulty: skill }));
    void cfg;
    this.client.send({ t: 'config', config: { bots } });
  }

  /** Left / right / enter on the focused row. */
  private change(row: RowId, d: number): void {
    const room = this.client.room;
    if (!room) return;
    const cfg = room.config;
    const send = (config: Partial<RoomConfig>) => this.client.send({ t: 'config', config });
    const skill = cfg.bots[0]?.difficulty ?? 'normal';
    const heroes = cfg.bots.some((b) => b.hero);
    switch (row) {
      case 'map':
        return send({ mapId: cycle(MAP_LIST.map((m) => m.id), cfg.mapId, d) });
      case 'mode':
        return send({ mode: cycle(MODES, cfg.mode, d) });
      case 'length':
        return cfg.mode === 'brawl' ? send({ roundsToWin: Math.max(1, Math.min(9, cfg.roundsToWin + d)) }) : send({ timeLimit: cycle(TIMES, TIMES.includes(cfg.timeLimit) ? cfg.timeLimit : 180, d) });
      case 'bots': {
        const max = Math.max(0, MAX_FIGHTERS - this.humans());
        return this.setBots(cfg, Math.max(0, Math.min(max, cfg.bots.length + d)), skill, heroes);
      }
      case 'skill':
        return this.setBots(cfg, cfg.bots.length, cycle(DIFFS, skill, d), heroes);
      case 'botHeroes':
        return this.setBots(cfg, cfg.bots.length, skill, !heroes);
      case 'ff':
        return send({ friendlyFire: !cfg.friendlyFire });
      case 'weapons':
        return send({ weaponSpawnRate: cycle([0, 1, 2], cfg.weaponSpawnRate, d) });
      case 'chaos':
        return send({ chaos: !cfg.chaos });
      case 'powers':
        return send({ heroPowers: !cfg.heroPowers });
      case 'p1':
      case 'p2': {
        const n = row === 'p1' ? 0 : 1;
        if (this.claimed(n)) this.client.send({ t: 'release', local: n });
        else this.client.send({ t: 'claim', local: n, claim: this.claimFor(n) });
        return;
      }
      case 'f1':
      case 'f2': {
        const n = row === 'f1' ? 0 : 1;
        this.hero[n] = cycle(HERO_ORDER as readonly string[], this.hero[n], d || 1) as string;
        if (this.claimed(n)) this.client.send({ t: 'claim', local: n, claim: this.claimFor(n) });
        return;
      }
      case 'ready':
        return this.client.send({ t: 'ready', ready: !this.me()?.ready });
      case 'start':
        return this.client.send({ t: 'start' });
      case 'leave':
        return this.leave();
    }
  }

  private leave(): void {
    this.leaving = true;
    this.client?.send({ t: 'leave' });
    this.client?.close();
    audio.play('uiBack');
    this.scene.start('title');
  }

  // ------------------------------------------------------------ input

  override update(): void {
    this.handleInput();
    this.render();
  }

  private handleInput(): void {
    if (this.phase === 'connecting') {
      if (menu.back()) this.leave();
      return;
    }
    if (this.phase === 'error') {
      if (menu.confirm()) void this.connect();
      else if (menu.back()) this.leave();
      return;
    }
    if (this.phase === 'rooms') return this.inputRooms();
    const rows = this.rows();
    if (menu.up()) {
      this.row = (this.row - 1 + rows.length) % rows.length;
      audio.play('uiMove');
    } else if (menu.down()) {
      this.row = (this.row + 1) % rows.length;
      audio.play('uiMove');
    }
    const id = rows[this.row];
    if (menu.left()) this.change(id, -1);
    else if (menu.right()) this.change(id, 1);
    else if (menu.confirm()) this.change(id, 1);
    else if (menu.back()) this.leave();
  }

  private inputRooms(): void {
    // typing a room code: letters and digits
    for (const k of ['KeyA', 'KeyB', 'KeyC', 'KeyD', 'KeyE', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'KeyM', 'KeyN', 'KeyP', 'KeyQ', 'KeyR', 'KeyS', 'KeyT', 'KeyU', 'KeyV', 'KeyW', 'KeyX', 'KeyY', 'KeyZ', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9']) {
      if (keyboard.justPressed(k) && this.code.length < 4) this.code += k.slice(-1);
    }
    if (keyboard.justPressed('Backspace') && this.code) {
      this.code = this.code.slice(0, -1);
      return;
    }
    if (this.code.length === 0) {
      if (menu.up()) this.roomIdx = Math.max(0, this.roomIdx - 1);
      if (menu.down()) this.roomIdx = Math.min(Math.max(0, this.rooms.length - 1), this.roomIdx + 1);
    }
    if (menu.confirm()) {
      const target = this.code.length === 4 ? this.code : this.rooms[this.roomIdx]?.code;
      if (target) this.client.send({ t: 'join', room: target });
      else this.flash('NO ROOMS YET - ASK THE HOST FOR THE CODE');
    } else if (menu.back()) this.leave();
  }

  // ------------------------------------------------------------ drawing

  private hide(texts: Phaser.GameObjects.BitmapText[]): void {
    for (const t of texts) t.setText('');
  }

  private render(): void {
    const g = this.gfx.clear();
    this.bar.update();
    this.hide(this.lines);
    this.lines.forEach((t, i) => t.setPosition(VIEW_W / 2, 70 + i * 14));
    this.hide(this.labels);
    this.hide(this.values);
    for (const row of this.fighterTexts) this.hide(row);
    for (const t of this.heads) t.setVisible(this.phase === 'room');
    this.heads[1].setText(this.isHostSafe() ? 'SETTINGS' : 'SETTINGS  (HOST CHANGES THESE)');
    const now = this.time.now;
    this.status.setText(now < this.flashUntil ? this.flashText : '');

    if (this.phase === 'connecting') {
      this.title.setText(this.role === 'host' ? 'HOST GAME' : 'JOIN GAME');
      this.sub.setText('');
      this.lines[3].setText('CONNECTING' + '.'.repeat(1 + (Math.floor(now / 300) % 3))).setTint(0xffffff);
      this.lines[4].setText(clip(serverUrl(), 40)).setTint(0x8d95b0);
      this.bar.set([hint.back('CANCEL')]);
    } else if (this.phase === 'error') this.renderError();
    else if (this.phase === 'rooms') this.renderRooms(g);
    else this.renderRoom(g);
  }

  private renderError(): void {
    this.title.setText("CAN'T CONNECT");
    this.sub.setText(clip(this.client.lastError || 'NO ANSWER FROM THE SERVER', 50));
    const lines = [
      ['TRIED  ' + serverUrl(), 0x8d95b0],
      ['', 0],
      ['1  THE HOST MUST BE RUNNING  NPM RUN HOST', 0xffffff],
      ['2  SAME WIFI AS THE HOST (NOT A GUEST NETWORK)', 0xffffff],
      ["3  ROUTER 'CLIENT ISOLATION' / 'AP ISOLATION' OFF", 0xffffff],
      ['4  HOST FIREWALL: ALLOW NODE ON THE GAME PORT', 0xffffff],
      ['5  OPEN THE ADDRESS THE HOST SHOWS, NOT LOCALHOST', 0xffffff],
      ['', 0],
      ['ENTER TO TRY AGAIN', 0xf8c840],
    ] as const;
    lines.forEach(([t, c], i) => this.lines[i + 1].setText(t.toUpperCase()).setTint(c));
    this.bar.set([hint.ok('RETRY'), hint.back('BACK')]);
  }

  private renderRooms(g: Phaser.GameObjects.Graphics): void {
    this.title.setText('JOIN GAME');
    this.sub.setText(this.code ? 'ROOM CODE ' + this.code + '_'.repeat(4 - this.code.length) : 'PICK A ROOM, OR TYPE ITS 4-LETTER CODE');
    panel(g, 120, 44, 400, 230, hexToNum(P.purple1));
    if (this.rooms.length === 0) this.lines[4].setText('NO ROOMS YET  -  THE HOST CREATES ONE').setTint(0x8d95b0);
    this.rooms.slice(0, 8).forEach((r, i) => {
      const y = 68 + i * 24;
      if (i === this.roomIdx && !this.code) rowBar(g, 126, y - 3, 388, 20, Math.floor(this.time.now / 330) % 2 === 0);
      const t = this.lines[i];
      t.setPosition(VIEW_W / 2, y).setText(`${r.code}   ${clip(r.hostName, 8).padEnd(8)}  ${r.players} PLAYERS  ${clip(MODE_NAMES[r.mode], 10)}  ${r.state === 'playing' ? 'PLAYING' : 'OPEN'}`).setTint(i === this.roomIdx && !this.code ? 0xffffff : 0x8d95b0);
    });
    this.bar.set([hint.move('SELECT', 'ud'), hint.ok('JOIN'), hint.back('BACK')]);
  }

  private value(row: RowId): string {
    const room = this.client.room!;
    const cfg = room.config;
    const on = (b: boolean) => (b ? 'ON' : 'OFF');
    switch (row) {
      case 'map':
        return clip(getMap(cfg.mapId).name, 16);
      case 'mode':
        return MODE_NAMES[cfg.mode];
      case 'length':
        return cfg.mode === 'brawl' ? `${cfg.roundsToWin} WINS` : cfg.mode === 'deathmatch' ? `${Math.floor(cfg.timeLimit / 60)}:${String(cfg.timeLimit % 60).padStart(2, '0')}` : 'AUTO';
      case 'bots':
        return String(cfg.bots.length);
      case 'skill':
        return (cfg.bots[0]?.difficulty ?? 'normal').toUpperCase();
      case 'botHeroes':
        return on(cfg.bots.some((b) => b.hero));
      case 'ff':
        return on(cfg.friendlyFire);
      case 'weapons':
        return ['NONE', 'NORMAL', 'LOTS'][cfg.weaponSpawnRate] ?? 'NORMAL';
      case 'chaos':
        return on(cfg.chaos);
      case 'powers':
        return on(cfg.heroPowers);
      case 'p1':
        return this.claimed(0) ? clip(profiles[0].name, 8) : 'OFF';
      case 'p2':
        return this.claimed(1) ? clip(profiles[1].name, 8) : 'OFF';
      case 'f1':
        return clip(HEROES[this.hero[0]]?.name ?? 'SCRAPPER', 10);
      case 'f2':
        return clip(HEROES[this.hero[1]]?.name ?? 'SCRAPPER', 10);
      case 'ready':
        return this.me()?.ready ? 'YES' : 'NO';
      default:
        return '';
    }
  }

  private renderRoom(g: Phaser.GameObjects.Graphics): void {
    const room = this.client.room;
    if (!room) return;
    this.title.setText('ROOM ' + room.code);
    const net = this.client.online ? `PING ${Math.max(0, Math.round(this.client.rtt))}` : 'CONNECTION LOST - RECONNECTING';
    const joinAt = this.client.urls[0] ? `   JOIN AT ${this.client.urls[0].replace(/^https?:[/][/]/, '')}` : '';
    this.sub.setText(`${net}   ${this.isHost ? 'YOU ARE THE HOST' : 'HOST ' + clip(room.peers.find((p) => p.device === room.host)?.name ?? '?', 8)}${joinAt}`);

    // fighters (left)
    panel(g, 8, PANEL_Y, 306, 292, hexToNum(P.purple1));
    const entries: { name: string; sub: string; status: string; color: number; mine: boolean; away: boolean }[] = [];
    for (const p of room.peers) {
      for (const c of p.claims) {
        if (!c) continue;
        entries.push({
          name: c.name,
          sub: `${clip(p.name, 8)}  ${clip(HEROES[c.hero]?.name ?? 'SCRAPPER', 8)}`,
          status: !p.connected ? 'AWAY' : p.device === room.host ? 'HOST' : p.ready ? 'READY' : '...',
          color: 0,
          mine: p.device === this.client.device,
          away: !p.connected,
        });
      }
    }
    room.config.bots.forEach((b, i) => entries.push({ name: 'BOT ' + (i + 1), sub: `${b.difficulty.toUpperCase()}  ${clip(HEROES[b.hero]?.name ?? 'SCRAPPER', 8)}`, status: 'BOT', color: 0, mine: false, away: false }));
    entries.slice(0, MAX_FIGHTERS).forEach((e, i) => {
      const y = PANEL_Y + 18 + i * 27;
      g.fillStyle(NET_COLORS[i], e.away ? 0.35 : 1).fillRect(14, y + 1, 7, 20);
      if (e.mine) g.lineStyle(1, 0xf8c840, 0.8).strokeRect(11.5, y - 1.5, 298, 25);
      const [name, info, status] = this.fighterTexts[i];
      name.setText(clip(e.name, 10)).setTint(e.away ? 0x6a708a : 0xffffff);
      info.setText(e.sub);
      status.setText(e.status).setTint(e.status === 'READY' ? 0x8af08a : e.status === 'HOST' ? 0xf8c840 : 0x8d95b0);
    });
    if (entries.length === 0) this.fighterTexts[0][0].setText('NO FIGHTERS YET').setTint(0x8d95b0);

    // settings + this device (right)
    panel(g, 318, PANEL_Y, 314, 292, hexToNum(P.purple1), this.isHost);
    const focus = this.rows();
    const shown: RowId[] = [...SETTING_ROWS, 'p1', 'f1', ...(isTouchDevice() ? [] : (['p2', 'f2'] as RowId[])), this.isHost ? 'start' : 'ready', 'leave'];
    shown.forEach((id, i) => {
      const y = PANEL_Y + 17 + i * ROW_H;
      const focused = focus[this.row] === id;
      if (focused) rowBar(g, 321, y - 2, 308, ROW_H - 1, Math.floor(this.time.now / 330) % 2 === 0);
      const editable = focus.includes(id);
      const isSetting = SETTING_ROWS.includes(id);
      this.labels[i].setPosition(328, y + 1).setText(ROW_LABELS[id]).setTint(focused ? 0xffffff : editable ? 0xc3c9dc : 0x5a6078);
      this.values[i].setPosition(624, y).setText(this.value(id)).setTint(focused ? 0xf8c840 : isSetting && !editable ? 0x5a6078 : 0xc3c9dc);
    });

    const ready = room.peers.filter((p) => p.connected && p.claims.some(Boolean)).length;
    const waiting = room.peers.filter((p) => p.connected && p.claims.some(Boolean) && p.device !== room.host && !p.ready).length;
    this.status.setTint(0xf8c840);
    if (this.time.now >= this.flashUntil) {
      this.status.setText(this.isHost ? (waiting ? `WAITING FOR ${waiting} PLAYER${waiting > 1 ? 'S' : ''} TO READY UP` : ready ? 'EVERYONE IS READY - START WHEN YOU LIKE' : 'PICK A FIGHTER') : this.me()?.ready ? 'WAITING FOR THE HOST TO START' : 'PRESS READY WHEN YOU ARE SET');
    }
    this.bar.set([hint.move('SELECT', 'ud'), hint.move('CHANGE', 'lr'), hint.ok(focus[this.row] === 'start' ? 'START' : 'TOGGLE'), hint.back('LEAVE')]);
  }
}
