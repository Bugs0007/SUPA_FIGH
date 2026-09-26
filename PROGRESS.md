# Progress

Status legend: [x] done · [~] partial · [ ] todo

## Current state
- **M1 Playable core: DONE** (committed). Next: **M2 Combat depth**.
- `npm run dev` → http://localhost:5173 · `npm test` (30 unit tests) · `npm run test:e2e` (3 Playwright tests, Edge)
- Useful URLs: `/?scene=match&bots=4` (skip title, 4 sparring dummies), `/?scene=art` (sprite inspector),
  `&speed=4`, `&seed=N`, `&humans=0`, `&timer=1` (setTimeout loop for hidden tabs/automation).

## Next steps (start of M2)
1. Expand `src/sim/data/weapons.ts` with every weapon (melee, sidearms, heavy, throwables, gadgets) and
   add ASCII sprites in `src/art/weaponArt.ts` for each id.
2. Melee weapons: use `MeleeHit.arcFrom/arcTo` for swing visuals; durability (chair) already wired (`wearMelee`).
3. New projectile kinds: rocket (explodes), flame (short-lived, ignites), flare (ignites), sniper (pierce + laser).
4. Add `sim/explosion.ts` (radial damage + knockback + tile/prop breaking), `sim/fire.ts` (burning status,
   fire spreading over wood tiles), `sim/prop.ts` (crates, barrels, gas canisters, dynamic physics bodies).
5. Throwables: hold attack to aim/cook, release to throw (arc preview), fuse timers.
6. Gadgets + powerups; inventory HUD shows all 5 slots with icons.
7. Juice pass: explosions (shockwave, debris, scorch decals), fire particles, bigger hit-stop on explosions.

## M1 — Playable core ✅
- [x] Docs (CLAUDE.md, GAME_DESIGN.md, DECISIONS.md, PROGRESS.md)
- [x] Vite + TS + Phaser scaffold, Vitest, Playwright (Edge channel on Windows)
- [x] Sim core: seeded rng, intent (+pack/unpack), tilemap + ASCII parser, custom AABB physics, world, match
- [x] Movement: run, variable jump, coyote/buffer, crouch + crawl, drop-through, ladders, ledge grab + climb,
      roll (i-frames), dive
- [x] Fists: 3-hit combo (jab, cross, haymaker knockdown), kick, flying kick, grab → throw / knee, struggle out
- [x] Pistol + shotgun (data-driven), hold-to-aim, auto vs release-to-fire, recoil, empty guns tossed
- [x] Bullets: swept raycast, tracers, ricochet off metal, shatter glass, pass thin wood, corpses block
- [x] Damage, falloff, knockback, flinch, knockdown, thrown bodies (wall splat, bodyslam, smash glass)
- [x] Death tumble ragdoll, weapons drop, kill credit (incl. environmental "last hit" credit)
- [x] Rounds: last team standing, 0.9 s confirm, banner, next round, first to 5, match reset; slow-mo final kill
- [x] Procedural art: pixel fonts (5x7, 3x5, outlined), modular fighters (25 poses, head sheet, arms at 32
      angles), weapons (ASCII), autotiled tileset (11 materials + back wall), fx atlas
- [x] Procedural SFX (sfxr-style synth, ~35 sounds, pitch-randomized, panned)
- [x] Rendering: interpolated puppets, squash/stretch, hit flash, smart shared camera, off-screen arrows,
      screen shake (trauma), hit-stop, muzzle flash, casings, dust, sparks, blood decals, damage numbers
- [x] HUD: scoreboard pips, kill feed, announcer, player panels, pause (Esc), debug F1/F2/F3
- [x] Keyboard input for 2 players (event.code; NumLock-proof; laptop fallback keys), bindings in localStorage
- [x] Title screen with per-player controls cards
- [x] Tests: 30 unit tests (physics, moveset on real map, weapons data, damage, match flow, determinism),
      3 Playwright tests (boot, match run + keyboard, title→match), production build OK

## M2 — Combat depth
- [ ] All weapons data-driven (melee, sidearms, heavy, throwables, gadgets, powerups)
- [ ] Throwables, props (crates, barrels, gas canisters, glass), explosions, fire spread
- [ ] Pickups, 5-slot inventory UI, juice pass

## M3 — Bots
- [ ] Nav graph (walk/jump/drop/ladder) + A*
- [ ] Utility AI, difficulties, personalities, teams, stuck recovery (replace `ai/Wanderer.ts`)
- [ ] Playwright bot-only match @4x, stuck detection; headless balance sim (<=25% kills per weapon)

## M4 — Match setup
- [ ] Lobby with 10 slots, teams, outfits, gamepads (hot-plug, rumble)
- [ ] Brawl + Deathmatch, HUD polish, controls cards per player, rebinding menu

## M5 — Maps
- [ ] 9 maps with gimmicks and hazards

## M6 — Spice
- [ ] Slow-mo polish, replay, ghosts, modifiers, supply drops, bounty, awards, fighter creator

## M7 — Modes, menus, settings, audio polish (music loops)
## M8 — Balance, performance, production build, deploy docs
