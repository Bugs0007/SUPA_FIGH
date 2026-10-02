// Chaos modifiers: with CHAOS on, every round flips one card. Effects are implemented where noted.

export interface ModifierDef {
  id: string;
  name: string;
  desc: string;
}

export const MODIFIERS: ModifierDef[] = [
  { id: 'lowGravity', name: 'LOW GRAVITY', desc: 'MOON BOOTS ON' }, // world.ts gravityScale
  { id: 'bigHeads', name: 'BIG HEADS', desc: 'EASIER TO HIT. PROBABLY.' }, // render only
  { id: 'glassJaw', name: 'GLASS JAW', desc: 'EVERYTHING HITS 3X HARDER' }, // combat.ts
  { id: 'noGuns', name: 'NO GUNS', desc: 'BRING A KNIFE' }, // world.ts weapon pool
  { id: 'explosive', name: 'EXPLOSIVE PROPS', desc: 'EVERY CRATE IS A BARREL' }, // world.ts props
  { id: 'turbo', name: 'TURBO', desc: 'EVERYONE IS FAST' }, // world.ts speedBoost
  { id: 'armory', name: 'ARMORY', desc: 'WEAPONS EVERYWHERE' }, // world.ts spawn rate
  { id: 'vampires', name: 'VAMPIRES', desc: 'DAMAGE HEALS YOU' }, // combat.ts
  { id: 'bouncy', name: 'BOUNCY BULLETS', desc: 'EVERY WALL RICOCHETS' }, // projectile.ts
  { id: 'firestorm', name: 'FIRESTORM', desc: 'IT IS RAINING FIRE' }, // world.ts step
];

export const MODIFIER_BY_ID: Record<string, ModifierDef> = Object.fromEntries(MODIFIERS.map((m) => [m.id, m]));
