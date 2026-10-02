// Tile kinds. Stored as bytes in TileMap.tiles. Plain numeric constants (no const enum, so
// isolatedModules/esbuild are happy).

export const TK = {
  EMPTY: 0,
  CONCRETE: 1,
  METAL: 2,
  BRICK: 3,
  WOOD: 4, // thin wooden wall: blocks bodies, bullets pass through
  GLASS: 5, // blocks bodies, shatters when shot or when a body is thrown through it
  PLAT_WOOD: 6, // one-way platform
  PLAT_METAL: 7, // one-way platform (grating)
  LADDER: 8,
  DIRT: 9,
  WATER: 10, // deadly hazard (M5)
  STEEL: 11, // dark steel, ricochets
  CONV_L: 12, // conveyor belt moving left
  CONV_R: 13, // conveyor belt moving right
} as const;

export type TileKind = (typeof TK)[keyof typeof TK];

export type Material = 'none' | 'concrete' | 'metal' | 'brick' | 'wood' | 'glass' | 'dirt' | 'water';

export interface TileDef {
  kind: number;
  name: string;
  char: string;
  /** blocks bodies from all sides */
  solid: boolean;
  /** blocks bodies only from above, can drop through */
  oneWay: boolean;
  ladder: boolean;
  /** bullets continue through it (with damage loss) */
  bulletPass: boolean;
  /** bullet damage multiplier when passing */
  passMul: number;
  /** breaks when shot / hit hard */
  breakable: boolean;
  /** bullets may ricochet off it */
  ricochet: boolean;
  hazard: 'none' | 'water';
  material: Material;
  /** conveyor direction (-1/1) for bodies standing on it, 0 = none */
  conveyor: number;
}

function def(p: Partial<TileDef> & Pick<TileDef, 'kind' | 'name' | 'char'>): TileDef {
  return {
    solid: false,
    oneWay: false,
    ladder: false,
    bulletPass: true,
    passMul: 1,
    breakable: false,
    ricochet: false,
    hazard: 'none',
    material: 'none',
    conveyor: 0,
    ...p,
  };
}

export const TILE_DEFS: TileDef[] = [];
const add = (d: TileDef) => (TILE_DEFS[d.kind] = d);

add(def({ kind: TK.EMPTY, name: 'empty', char: '.' }));
add(def({ kind: TK.CONCRETE, name: 'concrete', char: '#', solid: true, bulletPass: false, material: 'concrete' }));
add(def({ kind: TK.METAL, name: 'metal', char: 'M', solid: true, bulletPass: false, ricochet: true, material: 'metal' }));
add(def({ kind: TK.BRICK, name: 'brick', char: 'B', solid: true, bulletPass: false, material: 'brick' }));
add(def({ kind: TK.WOOD, name: 'wood', char: 'W', solid: true, bulletPass: true, passMul: 0.75, material: 'wood' }));
add(
  def({
    kind: TK.GLASS,
    name: 'glass',
    char: 'G',
    solid: true,
    bulletPass: true,
    passMul: 0.85,
    breakable: true,
    material: 'glass',
  }),
);
add(def({ kind: TK.PLAT_WOOD, name: 'plat_wood', char: '-', oneWay: true, material: 'wood' }));
add(def({ kind: TK.PLAT_METAL, name: 'plat_metal', char: '=', oneWay: true, material: 'metal' }));
add(def({ kind: TK.LADDER, name: 'ladder', char: 'H', ladder: true }));
add(def({ kind: TK.DIRT, name: 'dirt', char: 'D', solid: true, bulletPass: false, material: 'dirt' }));
add(def({ kind: TK.WATER, name: 'water', char: '~', hazard: 'water', material: 'water' }));
add(def({ kind: TK.STEEL, name: 'steel', char: 'X', solid: true, bulletPass: false, ricochet: true, material: 'metal' }));

add(def({ kind: TK.CONV_L, name: 'conv_l', char: '<', solid: true, bulletPass: false, ricochet: true, material: 'metal', conveyor: -1 }));
add(def({ kind: TK.CONV_R, name: 'conv_r', char: '>', solid: true, bulletPass: false, ricochet: true, material: 'metal', conveyor: 1 }));

export const CHAR_TO_KIND: Record<string, number> = {};
for (const d of TILE_DEFS) if (d) CHAR_TO_KIND[d.char] = d.kind;

export function tileDef(kind: number): TileDef {
  return TILE_DEFS[kind] ?? TILE_DEFS[0];
}
