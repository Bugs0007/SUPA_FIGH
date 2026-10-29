// The socket layer: an HTTP server with a WebSocket endpoint, a drift-free real-time loop driving the Hub, and
// a heartbeat that drops dead connections. (M5 adds static file serving for the built game next to it.)

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import { MAX_FRAME_BYTES } from '../src/net/protocol';
import { Hub } from './hub';
import type { RoomOptions } from './room';

export interface ServerOptions extends RoomOptions {
  /** 0 = pick a free port */
  port?: number;
  /** bind address; 0.0.0.0 makes it reachable from the LAN */
  host?: string;
  /** handles plain HTTP requests (the built game); default answers /health only */
  http?: (req: IncomingMessage, res: ServerResponse) => void;
}

export interface RunningServer {
  port: number;
  hub: Hub;
  http: Server;
  close(): Promise<void>;
}

/** how often the loop wakes up; the sim still steps in exact 1/60 s units, this only bounds the added latency */
const LOOP_MS = 4;
/** a gap longer than this (laptop slept, debugger) is not simulated */
const MAX_FRAME_MS = 250;
const PING_EVERY_MS = 10_000;
const DEAD_AFTER_MS = 25_000;

export function startServer(opts: ServerOptions = {}): Promise<RunningServer> {
  const hub = new Hub(opts);
  const http = createServer((req, res) => {
    if (opts.http) return opts.http(req, res);
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    } else {
      res.writeHead(404).end();
    }
  });
  const wss = new WebSocketServer({ server: http, maxPayload: MAX_FRAME_BYTES, perMessageDeflate: false });
  wss.on('error', () => {}); // listen errors (port in use) reach the caller through the returned promise
  const alive = new WeakMap<WebSocket, number>();

  wss.on('connection', (ws) => {
    alive.set(ws, Date.now());
    const conn = {
      send: (raw: string) => {
        if (ws.readyState === ws.OPEN) ws.send(raw);
      },
      close: () => ws.close(),
    };
    const link = hub.open(conn);
    ws.on('message', (data, isBinary) => {
      alive.set(ws, Date.now());
      if (!isBinary) link.message(data.toString());
    });
    ws.on('pong', () => alive.set(ws, Date.now()));
    ws.on('close', () => link.close());
    ws.on('error', () => ws.terminate());
  });

  // real-time loop: measure the elapsed time instead of trusting the timer
  let last = performance.now();
  const loop = setInterval(() => {
    const now = performance.now();
    const dt = Math.min(MAX_FRAME_MS, now - last);
    last = now;
    hub.advance(dt);
  }, LOOP_MS);

  const heartbeat = setInterval(() => {
    const now = Date.now();
    for (const ws of wss.clients) {
      if (now - (alive.get(ws) ?? now) > DEAD_AFTER_MS) ws.terminate();
      else ws.ping();
    }
  }, PING_EVERY_MS);

  return new Promise((resolve, reject) => {
    http.once('error', reject);
    http.listen(opts.port ?? 0, opts.host ?? '0.0.0.0', () => {
      const port = (http.address() as AddressInfo).port;
      resolve({
        port,
        hub,
        http,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(loop);
            clearInterval(heartbeat);
            for (const ws of wss.clients) ws.terminate();
            wss.close(() => http.close(() => done()));
          }),
      });
    });
  });
}
