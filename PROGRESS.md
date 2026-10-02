# Progress

Status legend: [x] done · [~] partial · [ ] todo

## Current state
- **M1 Playable core: DONE.** **M2 Combat depth: DONE** (see checklist for the few deferred items).
  Next: **M3 Bots**.
- `npm run dev` → http://localhost:5173 · `npm test` (56 unit tests) · `npm run test:e2e` (6 Playwright tests;
  in containers use `PW_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e`)
- Useful URLs: `/?scene=match&bots=4` (skip title, 4 sparring dummies), `/?scene=art` (fighter sprites),
  `/?scene=art&page=weapons` (every weapon/prop sprite with grip markers), `&speed=4`, `&seed=N`, `&humans=0`,
  `&timer=1` (setTimeout loop for hidden tabs/automation).

## Next steps (start of M3)
1. Delete `ai/Wanderer.ts`; add `src/ai/` nav graph built from map geometry (walk/jump/drop/ladder edges) + A*.
2. Utility AI producing `Intent`: pick up weapons (value table per weapon id), fight at the right range per
   weapon (melee rush, sniper keep distance), throw grenades using `throwVelocity()` for arcs, dodge (roll)
   incoming bullets/rockets, avoid fire patches / burning tiles / armed mines, stop-drop-and-roll when burning,
   use medkits below ~40 HP, shoot barrels near enemies, carry crates as shields.
3. Difficulty (reaction time, aim error, decision rate) + personalities; stuck detection and recovery.
4. Headless balance sim in Node: bots-only matches, report kills per weapon (target <= 25% each).
5. Deferred from M2 (pick up when convenient): grappling hook, riot shield, teleport pads, smoke grenade
   (mostly matters once bots have line-of-sight), throwing props through glass windows.

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

## M2 — Combat depth ✅
- [x] Weapons (all data in `sim/data/weapons.ts`, sprites in `art/weaponArt.ts`):
      melee knife, machete, katana, bat, pipe, chair (4 hits), sledgehammer · sidearms pistol, magnum, uzi,
      flare gun · heavy shotgun, SMG, assault rifle, sniper (pierce + laser sight), minigun (spin-up, slows you),
      flamethrower, bazooka · throwables grenade (cookable), molotov, sticky remote C4, proximity mine ·
      gadgets medkit, jetpack · powerups speed, strength, Bullet Time
- [x] Projectile kinds: rockets explode, flames (rise, slow down, ignite, stop on wood), flares (arc, ignite)
- [x] `sim/explosion.ts`: falloff + wall cover, knockdown, chain reactions, glass/wood destruction, fire scatter
- [x] `sim/fire.ts`: burning status (DoT, touch spread, roll/water/medkit extinguish), fire patches,
      burning wooden tiles that spread and collapse
- [x] `sim/prop.ts` + `sim/data/props.ts`: crates (loot drops), explosive barrels, gas canisters that rocket
      off when punctured; standable, pushable, shootable, kickable, liftable + throwable (Interact)
- [x] Throwables: hold to aim with power ramp + arc preview, cooking, fumbles drop live grenades, C4 detonator
- [x] Bullet Time (world 40%, owner double-updates), speed/strength boosts with HUD timers
- [x] HUD: 5-slot inventory with icons + charge counts, ammo/fuel readout, burning HP flash, bullet-time tint
- [x] Juice: explosions (flash, shockwave ring, fireballs, smoke, debris, scorch decals, hit-stop), flames,
      jet exhaust, rocket smoke trails, flare glow, mine/C4 blink, fuse sparks, heal/powerup motes; ~25 new sounds
- [x] Test Arena has crates/barrels/gas cans on every floor
- [x] Tests: 26 new unit tests (explosions, throwables, special guns, fire spread, props, carrying, gadgets,
      determinism); e2e arsenal tour fires every weapon through the real keyboard path
- [ ] Deferred: grappling hook, riot shield, teleport pads, smoke grenade

## M3 — Bots
- [ ] Nav graph (walk/jump/drop/ladder) + A*
- [ ] Utility AI, difficulties, personalities, teams, stuck recovery (replace `ai/Wanderer.ts`)
- [ ] Playwright bot-only match @4x, stuck detection; headless balance sim (<=25% kills per weapon)

## M4 — Match setup
- [ ] Lobby with 10 slots, teams, outfits, gamepads (hot-plug, rumble)
- [ ] Brawl + Deathmatch, HUD polish, controls cards per player, rebinding menu

## M9 — Anime Universe Expansion (QUEUED — full spec in `docs/ANIME_EXPANSION.md`)
- [x] Pulled forward into M3: double jump, wall jump (+ wall slide), double-tap sprint
- [ ] Ability intent + full rebinding (fold into M4's rebinding menu)
- [ ] Hero power framework (HeroDefinition / PowerUpDefinition / TransformationState / Ability*)
- [ ] Heroes at the existing tiny pixel scale: Naruto (Kurama Mode), Luffy (Gear 2), Goku (Super Saiyan)
- [ ] Maps: Hidden Leaf Forest, Grand Line Ship, Alien Energy Planet; hero pickups; VFX; audio; select UI
- [ ] External PNG sprite-sheet support in ArtProvider; bots understand powers; tests per spec

## M5 — Maps
- [ ] 9 maps with gimmicks and hazards

## M6 — Spice
- [ ] Slow-mo polish, replay, ghosts, modifiers, supply drops, bounty, awards, fighter creator

## M7 — Modes, menus, settings, audio polish (music loops)
## M8 — Balance, performance, production build, deploy docs
