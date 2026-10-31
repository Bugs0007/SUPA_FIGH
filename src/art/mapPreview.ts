import type Phaser from 'phaser';
import { Art } from './index';
import { bakeBackground, BACKGROUNDS } from './backgroundArt';
import { bakeArenaScenery } from './arenaArt';
import { bakeDecor } from './decorArt';
import { placeDecor } from '../render/Decor';
import { getMap } from '../sim/map/maps';
import { parseMap } from '../sim/map/mapData';
import { TileMap } from '../sim/map/tilemap';
import { TK } from '../sim/map/tiles';
import { BACK_ROW, backMask, backVariant, tileMask } from './tileArt';
/** A full arena painting using the live game's actual tiles, scenery, decor and prop sprites. */
export function bakeMapPreview(scene: Phaser.Scene, id: string): string {
  const key = 'map-preview-' + id;
  if (scene.textures.exists(key))
    return key;
  const def = getMap(id), map = new TileMap(parseMap(def));
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 320;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = BACKGROUNDS[def.theme]?.sky ?? '#111727';
  ctx.fillRect(0, 0, 640, 320);
  const bg = bakeBackground(scene, def.theme);
  for (const name of [bg.far, bg.near])
    if (name)
      ctx.drawImage(scene.textures.get(name).getSourceImage() as HTMLCanvasElement, 0, 0, 640, 320);
  const s = Math.min(624 / map.pxW, 304 / map.pxH), ox = (640 - map.pxW * s) / 2, oy = (320 - map.pxH * s) / 2;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(s, s);
  const tiles = scene.textures.get(Art.tileset(scene, def.theme)).getSourceImage() as HTMLCanvasElement;
  const tile = (frame: number, x: number, y: number) => ctx.drawImage(tiles, (frame % 16) * 16, Math.floor(frame / 16) * 16, 16, 16, x * 16, y * 16, 16, 16);
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++)
      if (map.back[y * map.w + x])
        tile((BACK_ROW + backVariant(x, y)) * 16 + backMask(map, x, y), x, y);
  ctx.drawImage(scene.textures.get(bakeArenaScenery(scene, def)).getSourceImage() as HTMLCanvasElement, 0, 0);
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++)
      if (map.get(x, y) !== TK.EMPTY)
        tile(map.get(x, y) * 16 + tileMask(map, x, y), x, y);
  const decor = bakeDecor(scene, def.theme);
  if (decor)
    for (const p of placeDecor(map, def)) {
      const f = scene.textures.getFrame(decor.key, decor.frame(p.def.id, 0));
      ctx.drawImage(f.source.image as HTMLCanvasElement, f.cutX, f.cutY, f.cutWidth, f.cutHeight, p.x, p.y, p.def.w, p.def.h);
    }
  for (const prop of parseMap(def).props) {
    const f = Art.weapon('prop_' + prop.type);
    if (!f)
      continue;
    const frame = scene.textures.getFrame(f.key, f.frame);
    ctx.drawImage(frame.source.image as HTMLCanvasElement, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, prop.x - f.w / 2, prop.y - f.h, f.w, f.h);
  }
  for (const g of def.gimmicks ?? []) {
    if (g.type === 'mover') {
      ctx.fillStyle = '#273746';
      ctx.fillRect(g.x * 16, g.y * 16, g.w * 16, g.h ?? 6);
      ctx.fillStyle = '#d3b970';
      ctx.fillRect(g.x * 16, g.y * 16, g.w * 16, 2);
    }
    else if (g.type === 'hazard') {
      ctx.fillStyle = '#e7ac62';
      ctx.fillRect(g.x * 16, g.y * 16, g.w * 16, 2);
    }
  }
  ctx.restore();
  scene.textures.addCanvas(key, canvas);
  return key;
}
