# Progress

Status legend: [x] done · [~] partial · [ ] todo

## Current state
- **M1–M6 DONE** (core, combat depth, bots, match setup, maps, spice). Next: **M7 Modes, menus, settings, audio**.
- Queued expansion: **M9 Anime Universe** — full spec in `docs/ANIME_EXPANSION.md`.
- `npm run dev` → http://localhost:5173 · `npm test` (151 unit tests) · `npm run test:e2e` (21 Playwright tests;
  in containers `PW_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e`) · `npm run sim -- 8 8 <map> normal 1`
- Title: Enter = quick match, L = lobby (maps, modes, teams, chaos cards, fighter creator via LOOK), C = controls.
- URLs: `/?scene=match&map=mine&bots=6&diff=hard&mode=deathmatch&chaos=1&mods=bigHeads,lowGravity`,
  `/?scene=lobby|controls|creator`, `/?scene=art(&page=weapons)`, `&speed=4`, `&seed=N`, `&humans=0`, `&timer=1`.

## Next steps (start of M7)
1. Modes: King of the Hill (zone on each map: add `hills` points to MapDef or pick a central node), Juggernaut
   (one big armored fighter vs everyone), Gun Game (weapon ladder per kill), Co-op Survival (waves of bots
   vs humans, boss every 5 waves, shared lives, revives). `GameMode` in match.ts + mode rules + HUD + lobby.
2. Menus: pause menu (resume / restart / settings / quit) instead of the text overlay; settings screen
   (volumes, screen shake, gore, damage numbers, replays, fullscreen) using `settings.ts`.
3. Audio polish: procedural music loops (title, match, sudden death) with the sfxr synth or a tiny tracker;
   volume categories already exist in AudioManager.
4. Update the title screen into a real main menu (Quick Match / Match Setup / Controls / Settings).

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

## M3 — Bots ✅
- [x] Movement pulled forward from M9: double jump, wall jump + wall slide, double-tap sprint (D21)
- [x] Nav graph from map geometry: standable cells + ladders; walk/climb edges; jump/fall/drop/double-jump
      edges discovered by simulating the real fighter (D22); A* + Dijkstra; cached per map (~150 ms)
- [x] BotController (`src/ai/bot.ts`): honest perception + memory (D23), utility goals fight/loot/heal/flee/roam,
      weapon choice by distance band, gun aiming with lead/gravity comp + difficulty error, semi vs auto
      trigger discipline, throw solver (same arc as the preview), C4 detonation near targets, melee combos,
      kicks, grabs/throws, struggle mashing, crouch/jump dodges, stop-drop-and-roll, medkit use,
      danger avoidance (live grenades, burning props, fire patches), weapon swap via cycle
- [x] Difficulties easy/normal/hard/expert + 5 personalities (data in `src/ai/botData.ts`)
- [x] Stuck detection: progress tracking → jump → penalize edge + re-plan → roam; prop-occupied nodes
      cost extra; loot targets abandoned after 8 s; standing on props/ledge edges handled
- [x] Headless sim `npm run sim` (kills per weapon, round length, worst stuck time); bots in MatchScene and
      title screen (count + difficulty saved), Wanderer dummies removed
- [x] Tests: nav graph (spawn connectivity, edge kinds, build time), bots (matches finish with kills and no
      stuck bots at easy/expert, unarmed bot fetches a gun, hunts a target on another floor, throw solver,
      determinism); Playwright 8-bot match at 4x through 2 rounds with a stuck check
- [ ] Known: rare 2-survivor standoffs (no round timer yet, D24)

## M4 — Match setup ✅
- [x] Lobby (`scenes/LobbyScene.ts`, model in `scenes/lobby.ts`): 10 slots (keyboard 1/2, gamepad 1–4, bot, empty),
      teams (solo/red/blue/green/gold), bot skill, shuffle looks, map, mode, rounds/time, sudden death, friendly
      fire, weapon spawns; validation; persisted; pads press START to join
- [x] Gamepads (`input/gamepad.ts`): raw Gamepad API, stick + d-pad, rebindable buttons per pad, hot-plug
      (unplugged pad = idle fighter), rumble on hits/shots/explosions
- [x] Controls screen (`scenes/ControlsScene.ts`): per keyboard layout (2 keys per action) and per pad, capture,
      clear, conflict warnings across players, refuses Ctrl/Alt/Meta, restore defaults, saved immediately
- [x] New actions folded in from M9: USE GADGET (quick medkit) and ABILITY (intent bit reserved for hero powers)
- [x] Modes: Brawl (+ sudden death: reveal, then HP drain) and Deathmatch (timed, respawns, kill score, overtime)
- [x] HUD: deathmatch clock/scores, sudden death/overtime callouts, panels for up to 4 humans
- [x] Tests: modes, lobby model, bindings/conflicts, intent packing; e2e lobby→deathmatch and rebinding flows

## M9 — Anime Universe Expansion (QUEUED — full spec in `docs/ANIME_EXPANSION.md`)
- [x] Pulled forward into M3: double jump, wall jump (+ wall slide), double-tap sprint
- [ ] Ability intent + full rebinding (fold into M4's rebinding menu)
- [ ] Hero power framework (HeroDefinition / PowerUpDefinition / TransformationState / Ability*)
- [ ] Heroes at the existing tiny pixel scale: Naruto (Kurama Mode), Luffy (Gear 2), Goku (Super Saiyan)
- [ ] Maps: Hidden Leaf Forest, Grand Line Ship, Alien Energy Planet; hero pickups; VFX; audio; select UI
- [ ] External PNG sprite-sheet support in ArtProvider; bots understand powers; tests per spec

## M5 — Maps ✅
- [x] Gimmick framework (`sim/gimmicks.ts`, data in `MapDef.gimmicks`): movers (path or pendulum; carry riders;
      carts hit), timed telegraphed hazards (crushers, laser grids, sweeping train tunnels you duck under),
      gravity zones (+ toggle), supply drops (parachute crates with a loot pool); conveyor tiles; TNT crates;
      chandeliers that fall when shot (crush credited to the shooter)
- [x] 9 themed maps (+ Test Arena): Neon Rooftops (heli supply drops, deadly gaps), Night Train (tunnels:
      duck!), Factory (conveyors into crushers, crane hook), Construction Site (swinging girders, burnable
      scaffold, pit), Casino (chandeliers, elevator), Harbor Docks (deadly water, crane), Office Tower
      (glass walls, elevator, flammable server room), Secret Lab (laser doors, low-grav chamber),
      Abandoned Mine (minecarts, TNT, lake)
- [x] Procedural parallax backgrounds per theme (`art/backgroundArt.ts`, `scenes/BackgroundScene.ts`) +
      themed back walls; gimmick rendering (cables, girders, hooks, carts, crushers, lasers, tunnels,
      gravity fields, animated conveyors, parachutes, helicopter)
- [x] Lobby map minimap + blurb; kill feed names environmental deaths (GOT CRUSHED, GOT RUN OVER...)
- [x] Bots avoid hazard footprints and flee telegraphed hazards; nav graph ignores dynamic gimmicks
- [x] Tests: every map — 10 spawns, nav connectivity between all spawns, reachable weapon spawns, a bot match
      with kills and no stuck bots; gimmick unit tests; e2e: every map runs in the browser with bots
- [ ] Known: bots don't ride movers on purpose (maps stay connected without them)

## M6 — Spice ✅
- [x] Instant replay of the round-ending kill (`sim/replay.ts`): rounds are recorded as intents + sudden-death
      level and re-simulated deterministically (test proves the replay equals the original world); 2.5 s
      lead-in, slows to 25% at the kill, camera closes in, letterbox + skip; toggle in settings
- [x] Ghost mode (Brawl): the dead rise after 1.2 s, fly through everything, BOO every 8 s (shoves fighters,
      props, items, shakes chandeliers loose); bots haunt too; HUD shows the BOO charge
- [x] Chaos cards (`sim/data/modifiers.ts`): low gravity, big heads, glass jaw, no guns, explosive props,
      turbo, armory, vampires, bouncy bullets, firestorm — one per round (deterministic), lobby toggle,
      `?mods=` for fixed modifiers; card-flip HUD + "CHAOS:" label
- [x] Bounty crown on the match leader; killing them is announced (+1 point in Deathmatch)
- [x] Post-match awards (`sim/awards.ts`): MVP, demolition expert, pyromaniac, bare knuckles, landscaper,
      damage dealer, butterfingers, survivor, pacifist, punching bag — one per fighter
- [x] Environmental kill announcer (CHANDELIER'D!, FLATTENED!, ROADKILL!, KABOOM!...)
- [x] Fighter creator (`scenes/CreatorScene.ts`) from the lobby LOOK column; saved with the lobby
- [x] Slow-mo + parachute supply drops + smart camera + off-screen arrows were already in (M1/M5)
- [x] Tests: awards, bounty, modifiers, ghosts, replay determinism; e2e replay, chaos, creator

## M7 — Modes, menus, settings, audio polish (music loops)
## M8 — Balance, performance, production build, deploy docs
