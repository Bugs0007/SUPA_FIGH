# M9 (queued) — Anime Universe Expansion: pixel heroes, hero power-ups, themed maps

Requested by the owner during M2. **Implement after M1–M8**, or pull individual pieces earlier when they
fit naturally (see "Pull-forward candidates" at the bottom). This is an EXPANSION, never a replacement:
all original weapons, maps, modes, bots, default controls and save data must keep working.

> IP note: Naruto, Luffy and Goku are trademarked characters. Fine for a private/fan build. Before any
> public deploy, keep hero names, palettes and pickup names in data (HeroDefinition) so they can be
> renamed/re-skinned into original archetypes without code changes. Never import anime artwork, music
> or sound effects — everything stays procedural or hand-authored originals.

## 1. Art direction (most important)
- Anime fighters must look like the EXISTING F1/F2 fighters reskinned: ~20–30 logical px tall, chunky
  pixels, tiny faces, blocky limbs, limited palette, hard edges. No anti-aliasing, gradients, fingers,
  clothing folds, or "fighting game quality" sprites. No 64/96/128 px sprites, no different pixel density.
- "What if F1 was Naruto?", not "Naruto from a fighting game dropped into this game".
- Recognizable by silhouette + color + one iconic accessory:
  - **NARUTO** — yellow spiky hair mass, tiny dark/blue headband, orange+black jacket, orange pants,
    dark boots, tiny eyes, simplified whiskers.
  - **LUFFY** — straw hat as the dominant silhouette (must read at tiny scale), black hair, red vest,
    blue shorts, sandals, skin-tone arms.
  - **GOKU** — big black spiky hair, orange gi, blue undershirt/belt/boots.
- Same hitbox as every fighter; sprite may vary by a few px but collision stays physics-controlled.
- Nearest-neighbor, integer scaling only.
- The owner's generated reference sheet is too detailed — use it for design language only, never trace it.

## 2. Fighter / map / power-up independence
Hero, map and power-up are independent: Goku on the pirate ship, Luffy in the ninja forest, Naruto vs
8 normal fighters on the alien planet. Hero powers are rare world PICKUPS (existing pickup architecture),
not built-in ultimates.

## 3. Movement expansion (all fighters, bots must use them)
- **Double jump**: one air jump; landing restores; walking off a ledge does not eat the ground jump
  (coyote time stays); interacts sensibly with wall jump; no infinite jumps.
- **Wall jump**: airborne + touching a valid wall + jump → push away + up; refreshes air jump; no infinite
  climbing of the same wall (e.g. must alternate walls or a per-wall cooldown); chains allowed with limits.
- **Sprint**: double-tap a direction → faster run with short ramp + short cooldown; works with roll/dive;
  timing tunable in movement data (`sim/constants.ts`). Bots can sprint.

## 4. Control customization (overlaps M4 rebinding menu)
Per-player bindings for: left, right, (up), jump, crouch/down, attack, kick, grab/interact, switch weapon,
use gadget, **ability** (new generic `ACTION_ABILITY` intent bit). Duplicate/conflict detection + warnings,
restore defaults, localStorage per player, keyboard and gamepad share one action abstraction, menus stay
navigable, bindings shown in the lobby. Abilities are never hardcoded to physical keys.

## 5. Hero power framework (generic — no per-character combat systems)
Data types: `HeroDefinition` (base look/stats/palette, power-up id) → `PowerUpDefinition` (pickup sprite,
duration 15–25 s, rarity) → `TransformationState` (active power, timer, energy/cooldown) →
`AbilityDefinition` (modified melee combo, modified ranged attack, stat multipliers) → `AbilityEffect` /
`AbilityProjectile` / `AbilityVFX`. Heroes = data + small specialized effects.
- A power-up only transforms the matching hero? → open question, decide + log in DECISIONS.md
  (suggestion: any fighter can grab it; the matching hero gets the full transformation, others get a
  generic boost — keeps pickups contested).
- Expiry restores normal attacks, normal ranged weapon and removes all modifiers + aura.
- HUD: ability name, remaining time, energy/cooldown.
- Normal weapons/inventory keep working while powered; the power only replaces the ranged attack where
  stated.

### NARUTO — KURAMA MODE (pickup: sealed chakra scroll)
Compact crimson aura of chunky orbiting pixel particles, tiny eye change, + move speed, + melee damage,
+ knockback, chakra hit effects. Combo hit 3: short-lived shadow-clone *effect entities* flash in beside
him, perform a matching strike, impact, vanish — never independent fighters/AI. Ranged replaced by a
BIJU-BOMB-style projectile: large dark-red core + red/orange outer pixels, strong knockback, explosive
impact, shake, hit-stop, sound; cooldown/energy cost (no spam).

### LUFFY — GEAR 2 (pickup: straw-hat themed power token)
Pink/white steam pixel particles, + speed, faster melee, slightly longer reach, + knockback, punch trails.
Stretch attacks: sprite stays normal size; attack spawns a temporary elongated arm (or leg for kick)
hitbox + stretched-arm pixel effect, impact, snap back. Combo: extended punch ×2 + stronger finisher.
Ranged replaced by a long-range punch special with a short cooldown (feels like Luffy, not a gun).

### GOKU — SUPER SAIYAN (pickup: glowing energy sphere/core)
Hair black → bright yellow, compact yellow aura, small energy particles, + speed, + melee damage,
+ knockback, attack trails. Stronger 1st hit, faster 2nd, energy 3rd, stronger kick, impact bursts;
heavy hits → hit-stop + shake + yellow/white sparks. Ranged replaced by a KI BLAST: tap = small,
hold = charge to larger (charging optional).

## 6. Maps (data-driven like the others; each needs 10 spawns, weapon + power-up spawns, ladders,
platforms, hazards, breakable props, interactions, bot nav, camera bounds). Original pixel art at the
existing scale — chunky clusters, limited palette, deliberate dithering, no painted/hi-res backgrounds,
never a copied anime background.
- **HIDDEN LEAF FOREST** — rooftops + tree branches (top), village structures, wooden bridges, ladders,
  hanging ropes (middle), forest floor, rocks, grass, shallow stream (bottom). Background: giant trees,
  distant rooftops, mountains, blue sky, clouds. Greens, browns, orange roofs. Gimmick: vertical mobility —
  giant trunks as wall-jump surfaces, branch hopping, drop-through wood. Props: explosive scroll crates,
  barrels, breakable training posts, hanging lanterns, bushes. Rare CHAKRA SCROLL spawn in a contested spot.
- **GRAND LINE SHIP** — original ship design. Mast, sails, rigging, cannons (top), main deck, cargo,
  doors, ladders (middle), cargo hold, barrels, narrow corridors, explosive supplies (bottom). Climbable
  ropes, swinging platforms. Gimmick: gentle ship rocking (never frustrating); occasional wave impacts →
  slight shake, props slide, loose barrels roll. Interactive cannon players can fire. Rare STRAW HAT item.
- **ALIEN ENERGY PLANET** — original alien world: purple/blue sky, odd moons, floating rocks, glowing
  cyan vegetation, orange/red soil, cliffs, caves, crystals, energy fissures. Gimmick: LOW-GRAVITY ZONES
  (higher jumps, longer air time, stronger wall jumps) with a clear visual boundary vs normal gravity.
  Rare SUPER SAIYAN ENERGY CORE.

## 7. Pickups, VFX, audio
- Pickup sprites readable at 16–24 px, unique color, bob/rotate, tiny particles: chakra scroll, straw-hat
  token, energy sphere. Original designs.
- Reusable pooled pixel VFX: aura particles, energy trails, impact flashes, clone flash, ki projectile,
  chakra projectile, steam burst, transformation flash. Performant with 10 fighters.
- New procedural sounds: chakra pickup, clone attack, chakra blast; Gear 2 activation, extended punch,
  special; transformation, ki blast, heavy energy hit.

## 8. Character select
Extend the fighter creator/lobby: Scrapyard Fighter, Naruto, Luffy, Goku — tiny animated preview, name,
base stats, special ability. Same UI style as the rest of the game (no anime-style select screen).

## 9. Bots
Understand double jump, wall jump, sprint (nav graph edges), hero power-ups as high-value pickups,
projectile replacement and cooldowns. Kurama Naruto prefers mid range, Gear 2 Luffy close/mid,
SSJ Goku uses ki blasts when advantageous. No wallhacks — existing perception/navigation only.

## 10. Asset pipeline
Keep the procedural ArtProvider; add support for external low-res PNG sprite sheets (nearest-neighbor,
transparent, fixed frame size, integer scale, no AA, same logical pixel scale). Each external sheet
documents frame size, animation rows, frame counts, origin, hitbox offset in its asset definition.
Animations needed per hero: idle, walk, run, jump, double jump, wall jump, punch 1/2/3, kick, grab, throw,
hurt, knockdown, death, weapon pickup, weapon firing, + powered idle. (Procedural generation via the
existing modular fighter baker with per-hero hair/hat parts is the preferred first attempt — it
guarantees the same pixel density.)

## 11. Tests
Vitest: double jump state, wall jump state, sprint detection, key rebinding, binding conflicts, power-up
duration/expiry, ability cooldown, Naruto clone lifecycle, Naruto projectile replacement, Luffy temporary
reach extension, Goku ki charge/release, power-up pickup spawning.
Playwright per hero: start match → select hero → pick up power → aura visible → melee combo (+clone
effect for Naruto) → special ranged → normal weapon returns after expiry. All three maps load and play.
No console errors, no stuck bots, 60 FPS target, no blurry/filtered textures, no frame misalignment.

## 12. Docs
Update CLAUDE.md, GAME_DESIGN.md, DECISIONS.md (every ambiguous call), PROGRESS.md: anime architecture,
power-up framework, movement changes, asset format, map format, balance decisions. Final summary lists
new characters, movement, power-up system, maps, tests, and exactly what to play-test manually.

## Pull-forward candidates (can land before M9)
- Double jump / wall jump / sprint → good fit with M3 (nav graph needs to know them) or M5 (maps).
- Ability intent bit + full rebinding UI → M4 (rebinding menu is already planned there).
- External sprite-sheet support in ArtProvider → whenever art work happens.
