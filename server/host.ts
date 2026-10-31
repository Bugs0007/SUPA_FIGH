// `npm run host`: build the game, serve it and the game server on one port bound to the LAN, and print where
// friends should point their browsers (with a QR code). Options after `--`:
//   --port 8080   --no-build   --https [--cert certs/host.pem --key certs/host-key.pem]
//   --latency 80 --jitter 30 --loss 5   (simulate a bad network: ms, ms, percent)   --speed 1

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';
import { lanAddresses } from './lan';
import { startServer } from './server';
import { staticHandler } from './static';

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : 'true') : fallback;
}
const flag = (name: string) => process.argv.includes('--' + name);

async function main(): Promise<void> {
  const port = Number(arg('port', process.env.PORT ?? '8080'));
  const https = flag('https');
  const dist = resolve('dist');

  let tls: { key: Buffer; cert: Buffer } | undefined;
  if (https) {
    const certPath = resolve(arg('cert', 'certs/host.pem')!);
    const keyPath = resolve(arg('key', 'certs/host-key.pem')!);
    if (!existsSync(certPath) || !existsSync(keyPath)) {
      console.error(
        [
          `HTTPS needs a certificate your devices trust. No files at:`,
          `  ${certPath}`,
          `  ${keyPath}`,
          ``,
          `Make them with mkcert (https://github.com/FiloSottile/mkcert):`,
          `  mkcert -install`,
          `  mkdir certs`,
          `  mkcert -cert-file certs/host.pem -key-file certs/host-key.pem localhost 127.0.0.1 ${lanAddresses().join(' ') || '<your LAN IP>'}`,
          `Phones must also trust mkcert's root CA (see the README, "HTTPS mode").`,
        ].join('\n'),
      );
      process.exit(1);
    }
    tls = { key: readFileSync(keyPath), cert: readFileSync(certPath) };
  }

  if (!flag('no-build')) {
    console.log('Building the game (vite build)...');
    await build({ logLevel: 'warn' });
  }
  if (!existsSync(resolve(dist, 'index.html'))) {
    console.error('No dist/index.html: run without --no-build first.');
    process.exit(1);
  }

  const scheme = https ? 'https' : 'http';
  const addrs = lanAddresses();
  const urls = addrs.map((ip) => `${scheme}://${ip}:${port}`);
  const latency = Number(arg('latency', '0'));
  const jitter = Number(arg('jitter', '0'));
  const loss = Number(arg('loss', '0')) / 100;

  const server = await startServer({
    port,
    host: '0.0.0.0',
    speed: Number(arg('speed', '1')),
    http: staticHandler(dist),
    tls,
    urls,
    netSim: latency || jitter || loss ? { latencyMs: latency, jitterMs: jitter, loss } : undefined,
  }).catch((e: NodeJS.ErrnoException) => {
    console.error(e.code === 'EADDRINUSE' ? `Port ${port} is already in use. Pick another with --port.` : e.message);
    process.exit(1);
  });

  console.log('');
  console.log('BRAWLKAI is up. Friends on the same WiFi open:');
  if (urls.length === 0) console.log('  (no LAN address found: are you connected to a network?)');
  for (const u of urls) console.log('  ' + u);
  console.log(`  ${scheme}://localhost:${server.port}   (this computer)`);
  if (urls[0]) {
    try {
      const qr = (await import('qrcode-terminal')).default;
      console.log('');
      qr.generate(urls[0], { small: true }, (code: string) => console.log(code));
    } catch {
      /* the QR code is a nicety */
    }
  }
  if (latency || jitter || loss) console.log(`Network simulation: ${latency} ms +${jitter} ms jitter, ${Math.round(loss * 100)}% loss`);
  console.log('');
  console.log("Nobody can join? Check: same WiFi (not a guest network), the router's client/AP isolation is off,");
  console.log(`and the firewall allows Node on port ${port} (Windows: allow it on Private networks).`);
  if (!https) console.log('Over plain http, gamepads and screen wake-lock may be unavailable on other devices: see --https in the README.');
  process.on('SIGINT', () => void server.close().then(() => process.exit(0)));
}

void main();
