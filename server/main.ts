// `npm run server`: the game server on its own (M5's `npm run host` adds the built game, the LAN URL and a QR code).
// This is also what runs on an always-on host for online play (docs/ONLINE.md): it opens the public BRAWL ARENA
// room, which anyone can join from the game's PLAY ONLINE button. Environment:
//   PORT=8080  HOST=0.0.0.0  SPEED=1
//   PUBLIC_ARENA=0        no public arena (a plain LAN-style server)
//   ARENA_COUNTDOWN=15    seconds from the first player arriving to the match starting
//   ARENA_FILL=6          bots fill every match up to this many fighters
//   ARENA_MAX=8           most humans in the arena at once
//   ARENA_ROUNDS=3        Brawl rounds per match
import { startServer } from './server';
import { DEFAULT_ARENA } from './room';

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '0.0.0.0';
const speed = Number(process.env.SPEED ?? 1);
const num = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && process.env[name] !== undefined && process.env[name] !== '' ? n : fallback;
};
const arena =
  process.env.PUBLIC_ARENA === '0'
    ? undefined
    : {
        countdown: Math.max(3, num('ARENA_COUNTDOWN', DEFAULT_ARENA.countdown)),
        fill: Math.min(10, Math.max(2, num('ARENA_FILL', DEFAULT_ARENA.fill))),
        maxHumans: Math.min(10, Math.max(1, num('ARENA_MAX', DEFAULT_ARENA.maxHumans))),
        rounds: Math.min(10, Math.max(1, num('ARENA_ROUNDS', DEFAULT_ARENA.rounds))),
      };

const server = await startServer({ port, host, speed, arena }).catch((e: NodeJS.ErrnoException) => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${port} is already in use (set PORT=...)` : e.message);
  process.exit(1);
});
console.log(`BRAWLKAI server listening on ${host}:${server.port}${arena ? ' (public BRAWL ARENA open)' : ''}`);
process.on('SIGINT', () => void server.close().then(() => process.exit(0)));
process.on('SIGTERM', () => void server.close().then(() => process.exit(0)));
