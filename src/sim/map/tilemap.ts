import { TILE } from '../constants';
import type { ParsedMap } from './mapData';
import { TK, tileDef, type TileDef } from './tiles';

export interface TileChange {
  tx: number;
  ty: number;
  kind: number;
}

/** Runtime tile grid with collision queries and a DDA ray walk. */
export class TileMap {
  readonly w: number;
  readonly h: number;
  readonly tiles: Uint8Array;
  readonly back: Uint8Array;
  /** tile edits since the renderer last drained them */
  changes: TileChange[] = [];

  constructor(src: ParsedMap) {
    this.w = src.w;
    this.h = src.h;
    this.tiles = new Uint8Array(src.tiles);
    this.back = src.back;
  }

  get pxW(): number {
    return this.w * TILE;
  }

  get pxH(): number {
    return this.h * TILE;
  }

  /** Out of bounds is empty (maps can be open at the sides/bottom; the kill plane handles it). */
  get(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return TK.EMPTY;
    return this.tiles[ty * this.w + tx];
  }

  def(tx: number, ty: number): TileDef {
    return tileDef(this.get(tx, ty));
  }

  set(tx: number, ty: number, kind: number): void {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return;
    const i = ty * this.w + tx;
    if (this.tiles[i] === kind) return;
    this.tiles[i] = kind;
    this.changes.push({ tx, ty, kind });
  }

  isSolid(tx: number, ty: number): boolean {
    return tileDef(this.get(tx, ty)).solid;
  }

  /** One-way platform, or the top rung of a ladder (you can stand on ladder tops). */
  isOneWay(tx: number, ty: number): boolean {
    const k = this.get(tx, ty);
    if (tileDef(k).oneWay) return true;
    if (k === TK.LADDER) {
      const above = this.get(tx, ty - 1);
      return above !== TK.LADDER && !tileDef(above).solid;
    }
    return false;
  }

  isLadder(tx: number, ty: number): boolean {
    return this.get(tx, ty) === TK.LADDER;
  }

  solidAtPx(x: number, y: number): boolean {
    return this.isSolid(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  ladderAtPx(x: number, y: number): boolean {
    return this.isLadder(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  hazardAtPx(x: number, y: number): TileDef['hazard'] {
    return tileDef(this.get(Math.floor(x / TILE), Math.floor(y / TILE))).hazard;
  }

  /** True if any solid tile overlaps the rect [l, t, r, b) (r/b exclusive). */
  rectSolid(l: number, t: number, r: number, b: number): boolean {
    const x0 = Math.floor(l / TILE);
    const x1 = Math.floor((r - 0.001) / TILE);
    const y0 = Math.floor(t / TILE);
    const y1 = Math.floor((b - 0.001) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.isSolid(tx, ty)) return true;
    return false;
  }

  /**
   * Walk every cell a segment passes through, in order (Amanatides & Woo).
   * cb receives the cell, the segment parameter t (0..1) where the ray ENTERS the cell and the
   * entry face normal. Return true from cb to stop. The starting cell is visited with t = 0.
   */
  traverse(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    cb: (tx: number, ty: number, t: number, nx: number, ny: number) => boolean,
  ): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    let tx = Math.floor(x0 / TILE);
    let ty = Math.floor(y0 / TILE);
    const endX = Math.floor(x1 / TILE);
    const endY = Math.floor(y1 / TILE);
    const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    const tDeltaX = stepX !== 0 ? Math.abs(TILE / dx) : Infinity;
    const tDeltaY = stepY !== 0 ? Math.abs(TILE / dy) : Infinity;
    let tMaxX =
      stepX > 0 ? ((tx + 1) * TILE - x0) / dx : stepX < 0 ? (tx * TILE - x0) / dx : Infinity;
    let tMaxY =
      stepY > 0 ? ((ty + 1) * TILE - y0) / dy : stepY < 0 ? (ty * TILE - y0) / dy : Infinity;

    if (cb(tx, ty, 0, 0, 0)) return;
    let guard = 0;
    while ((tx !== endX || ty !== endY) && guard++ < 512) {
      let t: number;
      let nx = 0;
      let ny = 0;
      if (tMaxX < tMaxY) {
        t = tMaxX;
        tMaxX += tDeltaX;
        tx += stepX;
        nx = -stepX;
      } else {
        t = tMaxY;
        tMaxY += tDeltaY;
        ty += stepY;
        ny = -stepY;
      }
      if (t > 1) return;
      if (cb(tx, ty, t, nx, ny)) return;
    }
  }

  /** First solid tile hit along a segment, or null. */
  raycastSolid(x0: number, y0: number, x1: number, y1: number): { x: number; y: number; t: number; nx: number; ny: number } | null {
    let hit: { x: number; y: number; t: number; nx: number; ny: number } | null = null;
    this.traverse(x0, y0, x1, y1, (tx, ty, t, nx, ny) => {
      if (this.isSolid(tx, ty)) {
        hit = { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, t, nx, ny };
        return true;
      }
      return false;
    });
    return hit;
  }

  /** Line of sight that ignores bullet-passable tiles (glass, wood). Used by AI later. */
  clearShot(x0: number, y0: number, x1: number, y1: number): boolean {
    let clear = true;
    this.traverse(x0, y0, x1, y1, (tx, ty) => {
      const d = this.def(tx, ty);
      if (d.solid && !d.bulletPass) {
        clear = false;
        return true;
      }
      return false;
    });
    return clear;
  }
}
