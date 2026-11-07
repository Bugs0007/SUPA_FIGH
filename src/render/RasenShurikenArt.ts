import type Phaser from 'phaser';

type Graphics = Phaser.GameObjects.Graphics;
const WIND = 0x397fc7;
const ICE = 0x92e5ff;
const WHITE = 0xeafcff;

interface Flight {
  dx: number;
  dy: number;
  traveled: number;
}

function pixel(g: Graphics, x: number, y: number, width = 1): void {
  g.fillRect(Math.round(x - (width - 1) / 2), Math.round(y - (width - 1) / 2), width, width);
}

function disc(g: Graphics, x: number, y: number, radius: number): void {
  for (let row = -radius; row <= radius; row++) {
    const half = Math.floor(Math.sqrt(radius * radius - row * row));
    g.fillRect(Math.round(x) - half, Math.round(y) + row, half * 2 + 1, 1);
  }
}

/** Four curved wind blades surround a compact spinning core. In flight the plane tilts into the shot. */
export function drawRasenShuriken(g: Graphics, x: number, y: number, r: number, time: number, flight?: Flight): void {
  const dx = flight?.dx ?? 1;
  const dy = flight?.dy ?? 0;
  const tilt = flight ? 0.68 : 0.92;
  const stamp = (ahead: number, across: number, width = 1) =>
    pixel(g, x + dx * ahead - dy * across, y + dy * ahead + dx * across, width);
  if (flight) {
    const tail = Math.min(flight.traveled, r * 9);
    for (const side of [-1, 1]) {
      for (let d = 2; d < tail; d += 2) {
        const across = side * (r * 0.62 + 1.7 * Math.sin(d * 0.18 + time * 34)) * (1 - d / tail);
        g.fillStyle(side > 0 ? ICE : WIND, 0.56 * (1 - d / tail));
        stamp(-d, across, d < r * 2 ? 2 : 1);
      }
    }
  }

  const steps = Math.ceil(r * 2.5);
  for (const [tint, thickness] of [[WIND, 2], [WHITE, 0]] as const) {
    g.fillStyle(tint);
    for (let blade = 0; blade < 4; blade++) {
      const start = time * 20 + blade * Math.PI / 2;
      for (let i = 0; i <= steps; i++) {
        const p = i / steps;
        const a = start - 0.88 * p * p;
        const d = r * (0.8 + 1.64 * p);
        const width = 1 + thickness + Math.round(r * 0.52 * Math.sin(Math.PI * p));
        stamp(Math.cos(a) * d, Math.sin(a) * d * tilt, width);
      }
    }
  }
  g.fillStyle(WIND);
  disc(g, x, y, Math.round(r + 0.6));
  g.fillStyle(ICE);
  disc(g, x, y, Math.max(1, Math.round(r * 0.8)));
  g.fillStyle(WHITE);
  for (let i = 0; i < 13; i++) {
    const a = i * 0.54 - time * 27, d = r * (0.12 + i * 0.053);
    stamp(Math.cos(a) * d, Math.sin(a) * d * tilt);
  }
}

export const RASEN_WIND_BURST_TIME = 0.48;

/** The blades open into short arcs inside the actual blast radius, leaving the rival visible. */
export function drawRasenWindBurst(g: Graphics, x: number, y: number, radius: number, age: number): void {
  const t = Math.min(1, age / RASEN_WIND_BURST_TIME);
  const expansion = 1 - (1 - Math.min(1, t * 2.6)) ** 3;
  const fade = (1 - t) ** 1.6;
  for (let band = 0; band < 3; band++) {
    const distance = radius * (0.12 + 0.88 * expansion) * (1 - band * 0.2);
    g.fillStyle(band === 0 ? WHITE : ICE, fade * (band === 0 ? 0.94 : 0.62));
    for (let arc = 0; arc < 4; arc++) {
      const from = t * (band % 2 ? -5 : 6) + arc * Math.PI / 2 + band * 0.73;
      const samples = Math.ceil(distance * 0.63);
      for (let i = 0; i <= samples; i++) {
        const p = i / samples, a = from + p * 0.66;
        const d = distance * (0.84 + 0.16 * p);
        pixel(g, x + Math.cos(a) * d, y + Math.sin(a) * d, p < 0.65 && band === 0 ? 2 : 1);
      }
    }
  }
}
