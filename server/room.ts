// A room: the host, the devices in it, the lobby settings and (once started) the running Session. Transport
// agnostic (a `Conn` is anything that can send a string) and clock driven (`advance(ms)`), so tests can run a whole
// match without sockets or waiting.

import { DT } from '../src/sim/constants';
import type { FighterSpawn } from '../src/sim/fighter';
import type { MatchConfig } from '../src/sim/match';
import {
  DEFAULT_ROOM_CONFIG,
  MAX_FIGHTERS,
  MAX_LOCAL,
  type ClientMsg,
  type ErrorCode,
  type PeerInfo,
  type RoomConfig,
  type RoomInfo,
  type ServerMsg,
  type SlotClaim,
} from '../src/net/protocol';
import { Session, type SessionSlot } from './session';

export interface Conn {
  send(raw: string): void;
  close(): void;
}

interface Peer {
  device: string;
  name: string;
  conn: Conn | null;
  ready: boolean;
  claims: (SlotClaim | null)[];
  /** room clock (ms) when the connection dropped */
  droppedAt: number;
}

export interface RoomOptions {
  /** sim speed multiplier (tests and soak runs); 1 = real time */
  speed?: number;
  /** fixed match seed (tests); default random */
  seed?: number;
}

const DT_MS = DT * 1000;
/** a device that vanishes from a lobby keeps its place this long (a phone's WiFi blip) */
const LOBBY_GRACE_MS = 30_000;

export class Room {
  config: RoomConfig = { ...DEFAULT_ROOM_CONFIG, bots: [], modifiers: [] };
  state: 'lobby' | 'playing' = 'lobby';
  session: Session | null = null;
  hostDevice: string;
  /** room clock in ms, advanced by `advance` */
  now = 0;
  private peers = new Map<string, Peer>();
  private acc = 0;
  /** ms the room has had nobody connected */
  emptyFor = 0;

  constructor(
    readonly code: string,
    host: { device: string; name: string },
    private opts: RoomOptions = {},
  ) {
    this.hostDevice = host.device;
    this.peers.set(host.device, this.newPeer(host.device, host.name, null));
  }

  private newPeer(device: string, name: string, conn: Conn | null): Peer {
    return { device, name, conn, ready: false, claims: Array<SlotClaim | null>(MAX_LOCAL).fill(null), droppedAt: 0 };
  }

  // ------------------------------------------------------------ membership

  has(device: string): boolean {
    return this.peers.has(device);
  }

  get connectedCount(): number {
    let n = 0;
    for (const p of this.peers.values()) if (p.conn) n++;
    return n;
  }

  info(): RoomInfo {
    return {
      code: this.code,
      hostName: this.peers.get(this.hostDevice)?.name ?? '?',
      state: this.state,
      players: this.connectedCount,
      mapId: this.config.mapId,
      mode: this.config.mode,
    };
  }

  /** A device connects (or reconnects: it gets its place and fighters back). */
  attach(device: string, name: string, conn: Conn): void {
    let p = this.peers.get(device);
    if (!p) {
      p = this.newPeer(device, name, conn);
      this.peers.set(device, p);
    } else {
      p.conn?.close();
      p.conn = conn;
      p.name = name;
    }
    this.emptyFor = 0;
    this.session?.setConnected(device, true);
    this.sendRoom();
    if (this.session) this.sendStart(p);
  }

  /** A device's connection closed. Its place is kept for a while; a bot plays its fighters meanwhile. */
  detach(device: string, conn: Conn): void {
    const p = this.peers.get(device);
    if (!p || p.conn !== conn) return;
    p.conn = null;
    p.droppedAt = this.now;
    p.ready = false;
    this.session?.setConnected(device, false);
    this.sendRoom();
  }

  /** The device leaves for good. */
  remove(device: string): void {
    this.peers.delete(device);
    this.session?.setConnected(device, false);
    if (this.hostDevice === device) this.pickHost();
    this.sendRoom();
  }

  private pickHost(): void {
    const next = [...this.peers.values()].find((p) => p.conn) ?? [...this.peers.values()][0];
    if (next) this.hostDevice = next.device;
  }

  // ------------------------------------------------------------ messages

  handle(device: string, msg: ClientMsg): void {
    const p = this.peers.get(device);
    if (!p) return;
    switch (msg.t) {
      case 'in':
        this.session?.input(device, msg.slot, msg.seq, msg.v, msg.e);
        return;
      case 'ping':
        this.send(p, { t: 'pong', n: msg.n });
        return;
      case 'claim':
        if (this.state !== 'lobby') return this.err(p, 'state', 'a match is running');
        if (this.claimedCount() - (p.claims[msg.local] ? 1 : 0) + 1 > MAX_FIGHTERS) return this.err(p, 'full', 'the room is full');
        p.claims[msg.local] = msg.claim;
        p.ready = false;
        break;
      case 'release':
        if (this.state !== 'lobby') return this.err(p, 'state', 'a match is running');
        p.claims[msg.local] = null;
        break;
      case 'ready':
        if (this.state !== 'lobby') return;
        p.ready = msg.ready;
        break;
      case 'config':
        if (device !== this.hostDevice) return this.err(p, 'notHost', 'only the host changes settings');
        if (this.state !== 'lobby') return this.err(p, 'state', 'a match is running');
        this.config = { ...this.config, ...msg.config };
        this.fitBots();
        for (const q of this.peers.values()) q.ready = false;
        break;
      case 'start':
        if (device !== this.hostDevice) return this.err(p, 'notHost', 'only the host starts the match');
        return this.start(p);
      default:
        return;
    }
    this.sendRoom();
  }

  private claimedCount(): number {
    let n = 0;
    for (const p of this.peers.values()) if (p.conn) for (const c of p.claims) if (c) n++;
    return n;
  }

  /** bots fill what the humans leave of the MAX_FIGHTERS slots */
  private fitBots(): void {
    const room = Math.max(0, MAX_FIGHTERS - this.claimedCount());
    if (this.config.bots.length > room) this.config.bots = this.config.bots.slice(0, room);
  }

  // ------------------------------------------------------------ match

  private start(host: Peer): void {
    if (this.state !== 'lobby') return this.err(host, 'state', 'a match is already running');
    const players = [...this.peers.values()].filter((p) => p.conn && p.claims.some(Boolean));
    if (players.length === 0) return this.err(host, 'noPlayers', 'nobody has picked a fighter');
    if (players.some((p) => p.device !== this.hostDevice && !p.ready)) return this.err(host, 'notReady', 'not everyone is ready');
    this.fitBots();

    const fighters: FighterSpawn[] = [];
    const slots: SessionSlot[] = [];
    const looks: SlotClaim['look'][] = [];
    for (const p of players) {
      for (const c of p.claims) {
        if (!c) continue;
        fighters.push({ name: c.name, team: 0, isBot: false, upJumps: c.upJumps, hero: c.hero || undefined });
        slots.push({ owner: p.device });
        looks.push(c.look);
      }
    }
    this.config.bots.forEach((b, i) => {
      fighters.push({ name: 'BOT ' + (i + 1), team: 0, isBot: true, upJumps: false, hero: b.hero || undefined });
      slots.push({ owner: null, bot: b });
      looks.push({});
    });
    const c = this.config;
    const cfg: MatchConfig = {
      mapId: c.mapId,
      mode: c.mode,
      fighters,
      roundsToWin: c.roundsToWin,
      friendlyFire: c.friendlyFire,
      weaponSpawnRate: c.weaponSpawnRate,
      seed: this.opts.seed ?? Math.floor(Math.random() * 1e9),
      timeLimit: c.timeLimit,
      chaos: c.chaos,
      modifiers: c.modifiers.length ? [...c.modifiers] : undefined,
      heroPowers: c.heroPowers,
    };
    this.looks = looks;
    this.session = new Session(cfg, slots);
    this.state = 'playing';
    this.acc = 0;
    for (const p of this.peers.values()) p.ready = false;
    for (const p of players) this.sendStart(p);
    this.sendRoom();
  }

  private looks: SlotClaim['look'][] = [];

  private sendStart(p: Peer): void {
    const s = this.session;
    if (!s) return;
    this.send(p, { t: 'start', cfg: s.cfg, looks: this.looks, mine: s.fightersOf(p.device), wid: s.wid });
  }

  /** Back to the lobby after the awards screen. */
  private endMatch(): void {
    this.session = null;
    this.state = 'lobby';
    this.broadcast({ t: 'end' });
    for (const p of [...this.peers.values()]) if (!p.conn) this.peers.delete(p.device);
    if (!this.peers.has(this.hostDevice)) this.pickHost();
    this.sendRoom();
  }

  // ------------------------------------------------------------ clock

  /** Advance real time by `ms`: step the match and send snapshots as they come due. */
  advance(ms: number): void {
    this.now += ms;
    this.emptyFor = this.connectedCount === 0 ? this.emptyFor + ms : 0;
    const s = this.session;
    if (s) {
      const speed = this.opts.speed ?? 1;
      this.acc += ms * speed * s.match.timeScale;
      const maxSteps = Math.max(8, Math.ceil(speed * 4));
      let n = 0;
      while (this.acc >= DT_MS && n < maxSteps) {
        s.step();
        this.acc -= DT_MS;
        n++;
        if (s.snapshotDue) this.broadcast(s.snapshot());
        if (s.over) {
          this.endMatch();
          return;
        }
      }
      if (n >= maxSteps) this.acc = 0; // fell behind: drop the backlog instead of spiralling
    } else {
      // lobby: forget devices that stayed away too long
      let changed = false;
      for (const p of [...this.peers.values()]) {
        if (!p.conn && this.now - p.droppedAt > LOBBY_GRACE_MS) {
          this.peers.delete(p.device);
          changed = true;
        }
      }
      if (changed) {
        if (!this.peers.has(this.hostDevice)) this.pickHost();
        this.sendRoom();
      }
    }
  }

  // ------------------------------------------------------------ output

  private peerInfo(p: Peer): PeerInfo {
    return { device: p.device, name: p.name, ready: p.ready, connected: !!p.conn, claims: p.claims.slice() };
  }

  sendRoom(): void {
    this.broadcast({
      t: 'room',
      code: this.code,
      host: this.hostDevice,
      state: this.state,
      config: this.config,
      peers: [...this.peers.values()].map((p) => this.peerInfo(p)),
    });
  }

  private broadcast(msg: ServerMsg): void {
    const raw = JSON.stringify(msg);
    for (const p of this.peers.values()) p.conn?.send(raw);
  }

  private send(p: Peer, msg: ServerMsg): void {
    p.conn?.send(JSON.stringify(msg));
  }

  private err(p: Peer, code: ErrorCode, msg: string): void {
    this.send(p, { t: 'err', code, msg });
  }
}
