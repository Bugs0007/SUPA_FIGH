// Events the simulation emits each tick. The renderer/audio/HUD drain them for juice and UI.
// The sim itself never plays sounds or spawns visuals.

export type HitKind = 'bullet' | 'melee' | 'kick' | 'throw' | 'bodyslam' | 'fall' | 'splat' | 'water' | 'explosion' | 'fire' | 'drain';

export type SimEvent =
  | { t: 'shot'; f: number; weapon: string; x: number; y: number; angle: number }
  | {
      t: 'hit';
      victim: number;
      attacker: number;
      damage: number;
      x: number;
      y: number;
      dirX: number;
      dirY: number;
      kind: HitKind;
      weapon: string;
      corpse: boolean;
    }
  | {
      t: 'kill';
      victim: number;
      killer: number;
      weapon: string;
      cause: HitKind;
      /** killer got credit via "last hit" (knocked off, thrown into something...) */
      env: boolean;
      x: number;
      y: number;
    }
  | { t: 'impact'; x: number; y: number; nx: number; ny: number; material: string }
  | { t: 'ricochet'; x: number; y: number }
  | { t: 'splinter'; x: number; y: number }
  | { t: 'tileBreak'; tx: number; ty: number; kind: number }
  | { t: 'jump'; f: number; x: number; y: number; air?: boolean; wall?: number }
  | { t: 'sprint'; f: number }
  | { t: 'land'; f: number; x: number; y: number; speed: number }
  | { t: 'swing'; f: number; weapon: string; step: number }
  | { t: 'kick'; f: number; air: boolean }
  | { t: 'roll'; f: number }
  | { t: 'dive'; f: number }
  | { t: 'ledge'; f: number }
  | { t: 'pickup'; f: number; weapon: string; x: number; y: number }
  | { t: 'toss'; f: number; weapon: string }
  | { t: 'weaponBreak'; f: number; weapon: string; x: number; y: number }
  | { t: 'empty'; f: number }
  | { t: 'cycle'; f: number; weapon: string }
  | { t: 'grab'; f: number; victim: number }
  | { t: 'throw'; f: number; victim: number }
  | { t: 'escape'; f: number }
  | { t: 'bonk'; x: number; y: number }
  | { t: 'splat'; f: number; x: number; y: number; speed: number }
  | { t: 'itemLand'; x: number; y: number; speed: number }
  | { t: 'weaponSpawn'; x: number; y: number; weapon: string }
  | { t: 'corpseLand'; x: number; y: number; speed: number }
  | { t: 'explosion'; x: number; y: number; radius: number; weapon: string; shake: number }
  | { t: 'ignite'; f: number }
  | { t: 'extinguish'; f: number }
  | { t: 'tileIgnite'; tx: number; ty: number }
  | { t: 'propHit'; x: number; y: number; type: string }
  | { t: 'propBreak'; x: number; y: number; type: string }
  | { t: 'pin'; f: number; weapon: string }
  | { t: 'throwOut'; f: number; weapon: string }
  | { t: 'stick'; x: number; y: number }
  | { t: 'mineArm'; x: number; y: number }
  | { t: 'mineTrigger'; x: number; y: number }
  | { t: 'burst'; x: number; y: number; weapon: string }
  | { t: 'powerup'; f: number; kind: string; x: number; y: number }
  | { t: 'heal'; f: number; amount: number }
  | { t: 'spinUp'; f: number }
  | { t: 'respawn'; f: number; x: number; y: number };
