// What a device remembers about LAN play: a stable device id (so a reload or a WiFi blip puts it back in its room with
// its fighters) and where the server is. Falls back gracefully when storage is blocked.

import { settings } from './settings';
import { load, save } from './storage';

function randomId(): string {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

let memoryId = '';

/** Stable per device (and per browser profile). Two tabs of one browser share it: the newer one takes over. */
export function deviceId(): string {
  const stored = load<string>('deviceId', '');
  if (/^[0-9a-f]{24}$/.test(stored)) return stored;
  const id = memoryId || randomId();
  memoryId = id;
  save('deviceId', id);
  return id;
}

/**
 * Where the game server is. The page that is served by `npm run host` talks to the server it came from; `?server=`
 * (ws://host:port) overrides it for development, and the last address that worked is remembered.
 */
export function serverUrl(params: URLSearchParams = new URLSearchParams(location.search)): string {
  const forced = params.get('server');
  if (forced) return forced.startsWith('ws') ? forced : 'ws://' + forced;
  if (location.protocol === 'file:') return load<string>('serverUrl', 'ws://localhost:8080');
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
}

export function rememberServer(url: string): void {
  save('serverUrl', url);
}

/** Client-side prediction on? The setting, unless the page was opened with ?predict=0 / ?predict=1. */
export function predictionEnabled(params: URLSearchParams = new URLSearchParams(location.search)): boolean {
  const p = params.get('predict');
  return p === null ? settings.netPrediction : p !== '0';
}

/** Browsers only allow Gamepad / Wake Lock / fullscreen tricks in a secure context (https or localhost). */
export function isSecureContextish(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext === true;
}
