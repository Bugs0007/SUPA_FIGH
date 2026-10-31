// Routes connections to rooms. Transport agnostic like Room: the socket layer hands it a `Conn` and strings.

import { parseClientMsg, PROTOCOL_VERSION, type ClientMsg, type ErrorCode, type ServerMsg } from '../src/net/protocol';
import { Room, type Conn, type RoomOptions } from './room';

export interface HubOptions extends RoomOptions {
  /** addresses to show players for joining (the host script prints them too) */
  urls?: string[];
}

/** room codes avoid look-alike letters (no O/0, I/1) because people read them out loud */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** an empty room is dropped after this long (ms) */
const EMPTY_ROOM_MS = 60_000;
/** per-connection message budget: a laptop with two players sends ~120 control frames a second */
const BUCKET_SIZE = 400;
const BUCKET_REFILL_PER_MS = 0.3;

interface Session {
  conn: Conn;
  device: string | null;
  name: string;
  room: Room | null;
  bucket: number;
  bucketAt: number;
}

export class Hub {
  readonly rooms = new Map<string, Room>();
  private byDevice = new Map<string, Session>();
  /** hub clock in ms: the sum of the `advance` calls, so tests are deterministic and real runs match wall time */
  private time = 0;

  constructor(private opts: HubOptions = {}) {}

  /** A new connection. Feed `message` every frame and call `close` when it ends. */
  open(conn: Conn): { message(raw: string): void; close(): void } {
    const s: Session = { conn, device: null, name: 'PLAYER', room: null, bucket: BUCKET_SIZE, bucketAt: this.time };
    return {
      message: (raw) => this.onMessage(s, raw),
      close: () => this.onClose(s),
    };
  }

  /** Advance every room by `ms` of real time and drop rooms nobody came back to. */
  advance(ms: number): void {
    this.time += ms;
    for (const [code, room] of this.rooms) {
      room.advance(ms);
      if (room.emptyFor > EMPTY_ROOM_MS) this.rooms.delete(code);
    }
  }

  private onMessage(s: Session, raw: string): void {
    const now = this.time;
    s.bucket = Math.min(BUCKET_SIZE, s.bucket + (now - s.bucketAt) * BUCKET_REFILL_PER_MS);
    s.bucketAt = now;
    if (s.bucket < 1) return; // flooding: drop
    s.bucket--;

    const msg = parseClientMsg(raw);
    if (!msg) return this.err(s, 'badMessage', 'malformed message');
    if (msg.t === 'hello') return this.hello(s, msg);
    if (!s.device) return this.err(s, 'badMessage', 'say hello first');
    switch (msg.t) {
      case 'list':
        return this.send(s, { t: 'rooms', rooms: [...this.rooms.values()].map((r) => r.info()) });
      case 'create':
        return this.create(s);
      case 'join':
        return this.join(s, msg.room);
      case 'leave':
        return this.leave(s);
      default:
        if (!s.room) return this.err(s, 'noRoom', 'join a room first');
        s.room.handle(s.device, msg);
    }
  }

  private hello(s: Session, msg: Extract<ClientMsg, { t: 'hello' }>): void {
    if (msg.v !== PROTOCOL_VERSION) {
      this.err(s, 'version', `server speaks protocol ${PROTOCOL_VERSION}, you sent ${msg.v}`);
      return s.conn.close();
    }
    // the same device on a new connection takes over (a phone that woke up, a reloaded tab)
    const old = this.byDevice.get(msg.device);
    if (old && old !== s) {
      old.conn.close();
      this.byDevice.delete(msg.device);
    }
    s.device = msg.device;
    s.name = msg.name;
    this.byDevice.set(msg.device, s);
    this.send(s, { t: 'welcome', v: PROTOCOL_VERSION, device: msg.device, urls: this.opts.urls });
    // a returning device goes straight back to its room (and its fighters)
    const room = old?.room ?? [...this.rooms.values()].find((r) => r.has(msg.device)) ?? null;
    if (room) {
      s.room = room;
      room.attach(msg.device, msg.name, s.conn);
    }
  }

  private create(s: Session): void {
    if (s.room) this.leave(s);
    let code = '';
    do {
      code = Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
    } while (this.rooms.has(code));
    const room = new Room(code, { device: s.device!, name: s.name }, this.opts);
    this.rooms.set(code, room);
    s.room = room;
    room.attach(s.device!, s.name, s.conn);
  }

  private join(s: Session, code: string): void {
    const room = this.rooms.get(code);
    if (!room) return this.err(s, 'noRoom', `no room ${code}`);
    if (s.room && s.room !== room) this.leave(s);
    s.room = room;
    room.attach(s.device!, s.name, s.conn);
  }

  private leave(s: Session): void {
    s.room?.remove(s.device!);
    s.room = null;
  }

  private onClose(s: Session): void {
    if (s.device && this.byDevice.get(s.device) === s) this.byDevice.delete(s.device);
    s.room?.detach(s.device!, s.conn);
  }

  private send(s: Session, msg: ServerMsg): void {
    s.conn.send(JSON.stringify(msg));
  }

  private err(s: Session, code: ErrorCode, msg: string): void {
    this.send(s, { t: 'err', code, msg });
  }
}
