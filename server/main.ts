// `npm run server`: the game server on its own (M5's `npm run host` adds the built game, the LAN URL and a QR code).
import { startServer } from './server';

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '0.0.0.0';
const speed = Number(process.env.SPEED ?? 1);

const server = await startServer({ port, host, speed }).catch((e: NodeJS.ErrnoException) => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${port} is already in use (set PORT=...)` : e.message);
  process.exit(1);
});
console.log(`BRAWLKAI server listening on ${host}:${server.port}`);
process.on('SIGINT', () => void server.close().then(() => process.exit(0)));
