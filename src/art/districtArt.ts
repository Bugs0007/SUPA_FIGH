import { PixelCanvas } from './canvas';
import { shade } from './palette';
import type { MapDef } from '../sim/map/mapData';
import { TILE } from '../sim/constants';

/** Landmarks live on the scenery layer so silhouette and collision stay separate. */
export function paintDistrict(
  pc: PixelCanvas, id: string, district: NonNullable<MapDef['district']>, columns: number,
  [accent, warm, dark]: [string, string, string],
): void {
  const start = district.column * TILE;
  const width = columns * TILE - start;
  const floor = district.floor * TILE;
  const x = (fraction: number) => Math.round(start + width * fraction);
  const face = shade(dark, .22), edge = shade(dark, .38);
  const lit = shade(accent, -.27), amber = shade(warm, -.3);
  const glow = (px: number, y: number, color = accent) => {
    pc.rect(px - 4, y, 8, 2, color);
    pc.bloom(px, y + 3, 36, 24, color, .15);
  };
  const brace = (px: number, y: number, w: number, h: number) => {
    pc.line(px, y, px + w, y + h, face, 3);
    pc.line(px + w, y, px, y + h, face, 3);
    pc.rect(px - 2, y, 4, h, edge);
    pc.rect(px + w - 2, y, 4, h, edge);
  };
  const frame = (px: number, y: number, w: number, h: number) => {
    pc.rect(px, y, w, h, dark);
    pc.rect(px + 2, y + 2, w - 4, h - 4, face);
    pc.rect(px + 2, y + 2, w - 4, 1, edge);
  };
  const crystal = (px: number, base: number, h: number, color: string) => {
    pc.line(px, base, px - 9, base - h, dark, 11);
    pc.line(px + 2, base - 2, px - 7, base - h + 3, color, 5);
    pc.line(px, base - 4, px - 8, base - h + 1, edge);
    pc.bloom(px, base - h + 12, 45, 47, color, .14);
  };

  switch (id) {
    case 'rooftops':
      {
        const px = x(.66), top = floor - 206;
        brace(px - 36, top + 42, 72, floor - top - 42);
        pc.rect(px - 47, top, 94, 48, dark);
        pc.rect(px - 40, top - 7, 80, 7, face);
        pc.rect(px - 33, top - 10, 66, 3, edge);
        for (let i = 8; i < 90; i += 8) pc.rect(px - 47 + i, top + 4, 1, 41, edge);
        pc.rect(px - 49, top + 39, 98, 4, edge);
        pc.line(px + 29, top + 45, px + 29, floor, face, 5);
        frame(x(.22) - 31, floor - 30, 62, 24);
        for (let i = -22; i <= 20; i += 7) pc.rect(x(.22) + i, floor - 23, 3, 12, edge);
        glow(px + 2, top + 20, warm);
      }
      break;
    case 'train':
      for (let i = 0; i < 7; i++) {
        const px = x(.08 + i * .12);
        frame(px, floor - 90, 40, 30);
        pc.rect(px + 4, floor - 84, 32, 14, i % 2 ? lit : amber);
        pc.line(px + 10, floor - 73, px + 17, floor - 84, edge, 2);
        pc.rect(px + 6, floor - 41, 29, 12, face);
      }
      pc.rect(x(.05), floor - 55, width * .88, 2, amber);
      pc.rect(x(.05), floor - 20, width * .88, 3, face);
      for (const t of [.16, .25, .69, .78]) {
        pc.circle(x(t), floor + 13, 12, dark);
        pc.circle(x(t), floor + 13, 4, edge);
      }
      break;
    case 'factory':
      {
        const px = x(.59), y = floor - 202;
        frame(px - 66, y - 26, 132, 40);
        for (const side of [-1, 1]) {
          pc.circle(px + side * 40, y - 5, 13, dark);
          pc.circle(px + side * 40, y - 5, 7, edge);
          pc.line(px + side * 40, y + 9, px + side * 18, y + 60, amber, 4);
        }
        frame(px - 36, y + 57, 72, 42);
        for (let i = -27; i < 28; i += 10) pc.line(px + i, y + 85, px + i + 8, y + 75, amber, 2);
        brace(px - 57, y + 100, 114, 62);
        glow(px, y + 65, warm);
      }
      break;
    case 'construction':
      {
        const px = x(.72), top = floor - 338;
        for (let i = 0; i < 7; i++) brace(px - 14, top + i * 46, 28, 46);
        pc.rect(px - 163, top, 208, 5, edge);
        pc.rect(px - 160, top + 14, 204, 3, face);
        for (let i = 0; i < 9; i++) pc.line(px - 160 + i * 22, top, px - 141 + i * 22, top + 14, face, 2);
        pc.line(px - 113, top + 6, px - 113, top + 104, face);
        pc.line(px - 113, top + 104, px - 105, top + 112, amber, 3);
        glow(px - 113, top + 5, warm);
      }
      break;
    case 'casino':
      {
        const px = x(.56), y = floor - 190;
        frame(px - 62, y, 124, 112);
        pc.circle(px, y + 50, 42, amber);
        pc.circle(px, y + 50, 38, dark);
        for (let i = 0; i < 16; i++) {
          const angle = i * Math.PI / 8;
          pc.line(px + Math.cos(angle) * 13, y + 50 + Math.sin(angle) * 13, px + Math.cos(angle) * 36, y + 50 + Math.sin(angle) * 36, i % 2 ? lit : face, 2);
        }
        pc.circle(px, y + 50, 7, amber);
        glow(px, y + 96);
        for (const t of [.2, .86]) {
          const side = x(t);
          frame(side - 24, floor - 68, 48, 45);
          pc.rect(side - 18, floor - 57, 36, 9, amber);
          pc.rect(side - 15, floor - 41, 30, 4, face);
        }
      }
      break;
    case 'docks':
      for (const t of [.2, .55, .82]) {
        const px = x(t), y = floor - (t === .55 ? 132 : 81);
        frame(px - 49, y, 98, 46);
        for (let i = 0; i < 13; i++) pc.rect(px - 42 + i * 7, y + 6, 2, 34, i % 4 ? dark : edge);
        pc.rect(px - 45, y + 3, 90, 2, amber);
        pc.rect(px - 34, y + 15, 18, 8, face);
        pc.rect(px - 32, y + 17, 13, 2, lit);
        brace(px - 42, y + 46, 84, floor - y - 46);
      }
      break;
    case 'office':
    case 'neon':
      for (const t of [.23, .52, .79]) {
        const px = x(t), y = floor - (t === .52 ? 281 : 218);
        frame(px - 46, y, 92, 192);
        for (let i = 0; i < 5; i++) for (let j = 0; j < 6; j++) {
          pc.rect(px - 39 + i * 16, y + 13 + j * 25, 11, 17, (i + 2 * j) % 3 ? edge : lit);
        }
        pc.rect(px - 33, y + 33, 67, 12, dark);
        for (let i = 0; i < 4; i++) glow(px - 23 + i * 15, y + 38, id === 'neon' ? warm : accent);
      }
      break;
    case 'lab':
      for (const t of [.19, .41, .66, .85]) {
        const px = x(t), y = floor - 146;
        frame(px - 20, y, 40, 99);
        pc.rect(px - 13, y + 8, 26, 76, shade(accent, -.55));
        pc.rect(px - 12, y + 14, 3, 64, lit);
        pc.circle(px + 4, y + 49, 7, dark);
        pc.circle(px + 5, y + 46, 2, amber);
        pc.rect(px - 25, y + 1, 50, 4, edge);
        pc.rect(px - 25, y + 84, 50, 5, edge);
        glow(px, y + 91);
      }
      break;
    case 'alien':
    case 'mine':
      for (const t of [.11, .3, .56, .82]) {
        const px = x(t), y = floor - 14 - 100 * (t % .3);
        crystal(px - 26, y, 46, amber);
        crystal(px, y, 78, lit);
        crystal(px + 20, y + 5, 55, edge);
      }
      break;
    case 'leaf': {
      const px = x(.58), y = floor - 115;
      pc.rect(px - 63, y - 16, 126, 9, dark);
      pc.line(px - 69, y - 14, px + 69, y - 14, amber, 3);
      pc.rect(px - 51, y + 15, 102, 6, face);
      for (const post of [px - 39, px + 39]) {
        pc.rect(post - 5, y - 12, 10, 123, dark);
        pc.rect(post - 4, y - 8, 2, 115, amber);
        pc.rect(post - 9, floor - 10, 18, 10, edge);
      }
      for (const lantern of [x(.25), x(.8)]) {
        pc.line(lantern, y - 65, lantern, y - 14, dark, 2);
        frame(lantern - 8, y - 14, 16, 22);
        glow(lantern, y - 5, warm);
      }
      break;
    }
    case 'ship':
      for (const t of [.32, .73]) {
        const px = x(t), top = floor - 160;
        pc.rect(px - 4, top, 8, 183, dark);
        pc.line(px - 43, top + 25, px + 43, top + 25, edge, 4);
        for (const end of [px - 43, px + 43]) pc.line(end, top + 25, px, floor + 21, face);
        pc.rect(px + 4, top + 3, 30, 12, amber);
        pc.rect(px + 6, top + 6, 21, 3, face);
        glow(px, top + 64);
      }
      break;
    case 'citadel':
      for (const t of [.25, .54, .81]) {
        const px = x(t), y = floor - 154;
        pc.rect(px - 42, y, 84, 7, edge);
        pc.rect(px - 35, y + 7, 70, 13, face);
        for (let i = 0; i < 6; i++) {
          const branch = px - 34 + i * 13, len = 19 + i % 3 * 11;
          pc.line(branch, y + 14, branch - 3, y + len, amber, 2);
          pc.circle(branch - 2, y + len - 6, 3, lit);
        }
        pc.rect(px - 10, y - 45, 20, 43, dark);
        pc.circle(px, y - 50, 18, face);
        pc.circle(px - 3, y - 54, 11, amber);
      }
      break;
    case 'dojo':
    case 'museum':
      for (const t of [.18, .48, .78]) {
        const px = x(t), y = floor - 201;
        frame(px - 50, y, 100, 140);
        if (id === 'dojo') {
          for (let col = -40; col <= 40; col += 20) pc.rect(px + col, y + 6, 1, 129, edge);
          for (let row = 11; row < 133; row += 14) pc.rect(px - 47, y + row, 94, 1, edge);
          pc.rect(px - 12, y - 20, 24, 68, shade(warm, -.46));
          pc.circle(px, y + 1, 6, amber);
          pc.rect(px - 9, y + 43, 18, 2, amber);
        } else {
          pc.rect(px - 18, y + 102, 36, 20, edge);
          pc.rect(px - 9, y + 62, 18, 40, lit);
          pc.circle(px, y + 50, 12, edge);
          pc.line(px - 9, y + 77, px - 21, y + 92, edge, 6);
          pc.line(px + 8, y + 76, px + 19, y + 61, edge, 6);
          glow(px, y + 14);
        }
      }
      break;
  }

  // A threshold follows the actual doorway, so the balcony and floor exits read at match zoom.
  for (const opening of district.openings) {
    const left = opening.x * TILE - 6;
    const top = opening.y * TILE;
    const w = opening.w * TILE + 12;
    const h = opening.h * TILE;
    pc.rect(left, top, w, 5, dark);
    pc.rect(left + 1, top + 4, w - 2, 2, edge);
    pc.rect(left, top + 5, 3, h - 5, face);
    pc.rect(left + w - 3, top + 5, 3, h - 5, face);
    glow(left + w / 2, top + 7, warm);
  }
}
