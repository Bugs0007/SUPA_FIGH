// The browser side of the connection (D74): one WebSocket to the game server, the hello handshake with this
// device's id, automatic reconnects with the same id (so the server hands back the room and the fighters), and a
// ping for the latency readout. The socket is injected so tests can use Node's `ws`; no Phaser, no DOM.

import { MAX_FRAME_BYTES, PROTOCOL_VERSION, type ClientMsg, type ServerMsg } from './protocol';

/** The subset of the standard WebSocket this uses (browsers' and the `ws` package both fit). */
export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: 'open' | 'close' | 'error', fn: () => void): void;
  addEventListener(type: 'message', fn: (ev: { data: unknown }) => void): void;
}
export type SocketFactory = (url: string) => SocketLike;

export type NetState = 'idle' | 'connecting' | 'online' | 'reconnecting' | 'closed';

const OPEN = 1;
/** reconnect delays (ms): quick at first, then every 4 s, give up after RECONNECT_GIVE_UP_MS */
const BACKOFF = [250, 500, 1000, 2000, 4000];
const RECONNECT_GIVE_UP_MS = 60_000;
const CONNECT_TIMEOUT_MS = 6000;
const PING_EVERY_MS = 1000;

export class NetClient {
  state: NetState = 'idle';
  /** last room description from the server (lobby screens render it) */
  room: Extract<ServerMsg, { t: 'room' }> | null = null;
  /** round trip time to the server in ms (smoothed), -1 until the first pong */
  rtt = -1;
  /** why the last connection attempt failed, for the "can't connect" screen */
  lastError = '';
  /** the server's own list of addresses to join at (empty when it doesn't know) */
  urls: string[] = [];
  private socket: SocketLike | null = null;
  private url = '';
  private wantOpen = false;
  private attempts = 0;
  private downSince = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pingSentAt = new Map<number, number>();
  private pingN = 0;
  private handlers = new Set<(m: ServerMsg) => void>();
  private stateHandlers = new Set<(s: NetState) => void>();

  constructor(
    readonly device: string,
    public name: string,
    private factory: SocketFactory,
    private now: () => number = () => Date.now(),
  ) {}

  /** Connect (or reconnect to another server). Resolves when the server has said welcome, rejects on failure. */
  connect(url: string): Promise<void> {
    this.close();
    this.url = url;
    this.wantOpen = true;
    this.attempts = 0;
    this.lastError = '';
    return new Promise((resolve, reject) => {
      const off = this.onState((s) => {
        if (s === 'online') {
          off();
          resolve();
        } else if (s === 'closed') {
          off();
          reject(new Error(this.lastError || 'could not connect'));
        }
      });
      this.open(false);
    });
  }

  private setState(s: NetState): void {
    if (this.state === s) return;
    this.state = s;
    for (const h of [...this.stateHandlers]) h(s);
  }

  private open(isRetry: boolean): void {
    this.setState(isRetry ? 'reconnecting' : 'connecting');
    let sock: SocketLike;
    try {
      sock = this.factory(this.url);
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : 'bad address';
      return this.failed();
    }
    this.socket = sock;
    let welcomed = false;
    const timeout = setTimeout(() => {
      if (!welcomed && this.socket === sock) {
        this.lastError = 'the server did not answer';
        sock.close();
      }
    }, CONNECT_TIMEOUT_MS);
    this.timers.push(timeout);
    sock.addEventListener('open', () => {
      this.sendRaw({ t: 'hello', v: PROTOCOL_VERSION, device: this.device, name: this.name });
    });
    sock.addEventListener('message', (ev) => {
      if (typeof ev.data !== 'string') return;
      let msg: ServerMsg;
      try {
        msg = JSON.parse(ev.data) as ServerMsg;
      } catch {
        return;
      }
      if (msg.t === 'welcome') {
        welcomed = true;
        this.urls = msg.urls ?? [];
        clearTimeout(timeout);
        this.attempts = 0;
        this.setState('online');
        this.startPing();
      } else if (msg.t === 'room') this.room = msg;
      else if (msg.t === 'pong') this.onPong(msg.n);
      else if (msg.t === 'err' && msg.code === 'version') {
        this.lastError = msg.msg;
        this.wantOpen = false; // retrying cannot fix a version mismatch
      }
      for (const h of [...this.handlers]) h(msg);
    });
    const onDown = () => {
      if (this.socket !== sock) return;
      clearTimeout(timeout);
      this.socket = null;
      this.stopPing();
      if (!welcomed && !this.lastError) this.lastError = isRetry ? 'still offline' : 'could not reach the server';
      this.failed();
    };
    sock.addEventListener('close', onDown);
    sock.addEventListener('error', () => {
      if (!welcomed && !this.lastError) this.lastError = 'could not reach the server';
    });
  }

  private failed(): void {
    if (!this.wantOpen) return this.setState('closed');
    if (this.downSince === 0) this.downSince = this.now();
    const first = this.state === 'connecting';
    // the first attempt of a fresh connect() fails fast (the "can't connect" screen explains why); after we have
    // been online once, keep trying quietly for a minute
    if (first || this.now() - this.downSince > RECONNECT_GIVE_UP_MS) {
      this.wantOpen = false;
      return this.setState('closed');
    }
    this.setState('reconnecting');
    const delay = BACKOFF[Math.min(this.attempts++, BACKOFF.length - 1)];
    this.timers.push(setTimeout(() => this.wantOpen && this.open(true), delay));
  }

  private startPing(): void {
    this.downSince = 0;
    this.stopPing();
    const ping = () => {
      const n = this.pingN++;
      this.pingSentAt.set(n, this.now());
      this.sendRaw({ t: 'ping', n });
      if (this.pingSentAt.size > 8) this.pingSentAt.delete(this.pingSentAt.keys().next().value as number);
    };
    ping(); // prediction needs the round trip time right away
    this.pingTimer = setInterval(ping, PING_EVERY_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private onPong(n: number): void {
    const sent = this.pingSentAt.get(n);
    if (sent === undefined) return;
    this.pingSentAt.delete(n);
    const rtt = this.now() - sent;
    this.rtt = this.rtt < 0 ? rtt : this.rtt * 0.7 + rtt * 0.3;
  }

  private sendRaw(msg: ClientMsg): void {
    if (this.socket && this.socket.readyState === OPEN) this.socket.send(JSON.stringify(msg));
  }

  /** Send a message. Dropped silently while offline (controls are level state; the next frame carries it). */
  send(msg: ClientMsg): void {
    const raw = JSON.stringify(msg);
    if (raw.length > MAX_FRAME_BYTES) return;
    if (this.socket && this.socket.readyState === OPEN) this.socket.send(raw);
  }

  get online(): boolean {
    return this.state === 'online';
  }

  onMessage(fn: (m: ServerMsg) => void): () => void {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }

  onState(fn: (s: NetState) => void): () => void {
    this.stateHandlers.add(fn);
    return () => this.stateHandlers.delete(fn);
  }

  /** Disconnect for good (no reconnect). */
  close(): void {
    this.wantOpen = false;
    for (const t of this.timers.splice(0)) clearTimeout(t);
    this.stopPing();
    const s = this.socket;
    this.socket = null;
    s?.close();
    this.room = null;
    this.downSince = 0;
    if (this.state !== 'idle') this.setState('closed');
  }
}
