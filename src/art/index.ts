import type Phaser from 'phaser';
import type { Appearance } from './appearance';
import { bakeFighter, type FighterTextures } from './fighterArt';
import { buildFonts } from './font';
import { bakeFx } from './fxArt';
import { bakeTiles } from './tileArt';
import { bakeWeapons, weaponFrame, type WeaponFrame } from './weaponArt';

/**
 * Asset-loader abstraction. Everything visual goes through this interface, so the procedural
 * generator can be swapped for real sprite sheets later (implement ArtProvider, keep the same
 * frame layouts / metadata documented in fighterArt.ts, weaponArt.ts and tileArt.ts).
 */
export interface ArtProvider {
  /** fonts, weapons, fx atlas — call once at boot */
  bakeShared(scene: Phaser.Scene): void;
  tileset(scene: Phaser.Scene, theme: string): string;
  fighter(scene: Phaser.Scene, look: Appearance): FighterTextures;
  weapon(id: string): WeaponFrame | undefined;
}

export const ProceduralArt: ArtProvider = {
  bakeShared(scene) {
    buildFonts(scene);
    bakeWeapons(scene);
    bakeFx(scene);
  },
  tileset: bakeTiles,
  fighter: bakeFighter,
  weapon: weaponFrame,
};

export const Art: ArtProvider = ProceduralArt;
