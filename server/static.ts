// Serves the production build (dist/) next to the WebSocket, with no framework: correct MIME types, gzip for text
// (the Phaser chunk is ~1.4 MB), long caching for hashed assets, and no way out of the directory.

import { existsSync, readFileSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.webmanifest', '.txt']);

interface Cached {
  mtime: number;
  raw: Buffer;
  gz: Buffer | null;
}

export function staticHandler(root: string): (req: IncomingMessage, res: ServerResponse) => void {
  const base = resolve(root);
  const cache = new Map<string, Cached>();

  return (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' }).end();
      return;
    }
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }
    let path: string;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(base, path));
    // never serve anything outside the build directory (../ tricks, absolute paths, null bytes)
    if (path.includes('\0') || (file !== base && !file.startsWith(base + sep)) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    const ext = extname(file).toLowerCase();
    const mtime = statSync(file).mtimeMs;
    let entry = cache.get(file);
    if (!entry || entry.mtime !== mtime) {
      const raw = readFileSync(file);
      entry = { mtime, raw, gz: COMPRESSIBLE.has(ext) && raw.length > 1024 ? gzipSync(raw, { level: 6 }) : null };
      cache.set(file, entry);
    }
    const gzip = !!entry.gz && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
    const body = gzip ? entry.gz! : entry.raw;
    const headers: Record<string, string | number> = {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'content-length': body.length,
      // vite names built assets with a content hash: cache them for good, but always revalidate the page itself
      'cache-control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      vary: 'accept-encoding',
    };
    if (gzip) headers['content-encoding'] = 'gzip';
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  };
}
