# Progress

Status legend: [x] done · [~] partial · [ ] todo

## Current state
- **M1–M13 DONE** (core, combat depth, bots, match setup, maps, spice, modes/menus/audio, balance + production
  build, anime universe expansion, M10 overhaul: crash fix, controls, hero base abilities, main menu, camera,
  animation, map detail). Manual play-test lists under M9 and M10.
- `npm run dev` → http://localhost:5173 · `npm test` (312 unit tests) · `npm run test:e2e` (47 Playwright tests;
  in containers `PW_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e`) · `npm run sim -- 8 8 <map> normal 1`
- Main menu: player cards (NAME: Enter to type; FIGHTER: Scrapper/Goku/Naruto/Luffy), quick-match panel (MAP incl.
  RANDOM, PLAYERS 1/2, BOTS, BOT SKILL), buttons Quick Match / Match Setup / Controls / Settings (L, C shortcuts;
  0–8 bots; Tab difficulty). In a match: Esc/Start = pause menu (P too unless a player has it bound).
- Controls: W / Up = jump (full: double/wall jumps, variable height), double-tap Down = drop through platforms,
  hero ability = B (P1) / Num1 or P (P2).
- URLs: `/?scene=match&map=mine&bots=6&diff=hard&mode=brawl|deathmatch|koth|juggernaut|gungame|coop&chaos=1&mods=bigHeads`,
  `/?scene=lobby|controls|creator|settings`, `/?scene=art(&page=weapons|heroes)`, `&heroes=naruto,luffy,goku`, `&powers=0`,
  `&speed=4`, `&seed=N`, `&humans=0..2`, `&timer=1`. Without `heroes`/`map`/`humans`, quick matches use the title
  screen's profiles and settings.

## Next steps
1. Play-test the M13 list at the bottom on real hardware (two people on one keyboard + pads): clone counts / health
   (`clones` in `sim/data/heroes.ts`), Rasengan hold length (`dash.maxTime`), grapple reach and swing feel
   (`stretch` block of Luffy's base ability), blink range / cooldown, wall-walk speed; plus camera zoom limits
   (`render/CameraDirector.ts`) and decor density (`render/Decor.ts`).
2. Bots: Goku bots never fly and Luffy bots only use the arm as a ranged punch (no grapple / swing routes); Naruto bots
   don't wall-walk. Clone bots follow their master and fight with the Rasengan.
3. Decorations for the outdoor themes that have none yet (docks, construction) and per-map hand-placed hero props.
4. More fighters on the character select (the hero framework + modular baker make new heroes mostly data + art).
5. Older ideas: real low-res sprite sheets per hero via `art/externalSheets.ts` (docs/ASSETS.md); bots ride movers.

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

## M7 — Modes, menus, settings, audio ✅
- [x] Modes (`sim/match.ts`): King of the Hill (auto hill near the map center, hold alone to score, bots go
      for it), Juggernaut (400 HP minigunner, kill to take over, knockback/knockdown resistant), Gun Game
      (12-weapon ladder, melee kills demote, final knife kill wins, weapons handed out, no pickups), Co-op
      Survival (humans vs bot waves, boss every 5 waves, shared lives, revive by holding interact, 15 waves)
- [x] Per-fighter max HP + knockback resistance; mode team rules (FFA for Juggernaut/Gun Game, humans vs bots)
- [x] HUD per mode (clock/target, ladder levels, wave/lives, hill holder), callouts, hill zone + revive bars
- [x] Lobby cycles all 6 modes with per-mode validation; `?mode=` for quick matches
- [x] Pause menu (resume / restart / settings / controls / quit) with overlays; Settings scene (volumes, shake,
      gore, damage numbers, replays, fullscreen); title main menu navigable by keyboard and pads
- [x] Procedural chiptune music (`audio/music.ts`): title, match and intense (sudden death / overtime / boss) loops
- [x] Tests: mode rules (KotH, Juggernaut, Gun Game, Co-op waves/lives/revive), bots finish every timed mode;
      e2e every mode boots, pause menu + settings overlay

## M8 — Balance, performance, production build, deploy docs ✅
- [x] Balance survey `npm run balance` (bots on every map): fists dropped from 31.5% to 18.5% of kills at normal
      (5/5/10 combo; more weapons on the floor at round start, faster weapon respawns); hard bots: top weapon
      rifle 17.3%, 0 timeouts, ~23–25 s average rounds
- [x] Performance check: sim tick ~0.16 ms and renderer sync ~0.8 ms for 10 fighters (CPU headroom is large;
      software-GL containers are GPU bound)
- [x] Production build: Phaser in its own cached chunk (game chunk 285 KB / 91 KB gzip), meta description + theme
      colour, version string (title screen, from package.json), on-screen crash overlay
- [x] README (players + dev) and `docs/DEPLOY.md` (itch.io, GitHub Pages, Netlify/Cloudflare/Vercel)

## M9 — Anime Universe expansion ✅ (spec: `docs/ANIME_EXPANSION.md`)
- [x] Movement (pulled into M3): double jump, wall jump + slide, double-tap sprint; bots use all of them
- [x] ABILITY action: intent bit, keyboard + pad bindings, rebindable with conflict warnings (M4)
- [x] Hero power framework (`sim/hero.ts`, data in `sim/data/heroes.ts`): HeroDefinition, PowerUpDefinition,
      AbilityDefinition (stat multipliers, combo/kick overrides, special), transformation state on the
      Fighter (power, timer, special cooldown, ki charge), expiry/death restore everything (D43–D45)
- [x] Naruto — Kurama Mode (chakra scroll): crimson aura, red eyes, +speed/damage/knockback, combo hit 3
      brings 2 shadow clones (effect entities), CHAKRA BOMB special (big orb, explosive, 5 s cooldown)
- [x] Luffy — Gear Second (straw hat token): pink skin + steam, faster stretchy combo (visible rubber arms),
      stretch kick, RUBBER BULLET special (arm stretches 120 px and snaps back, stops at walls)
- [x] Goku — Super Saiyan (energy core): hair turns yellow, sparks, strong/fast/energy combo, heavy kick with
      hit-stop + shake, KI BLAST special (tap = small, hold to charge up to 3x with an explosion)
- [x] Heroes at the existing pixel scale (new parts in the modular baker, D46); `/?scene=art&page=heroes`
- [x] Pickups: original sprites, bobbing + glow + sparkles, rare spawner (`P` map spots, map bias, D47)
- [x] VFX (`render/HeroFx.ts`): chunky orbiting auras, steam/flame/spark motes, charge glow, stretched limbs,
      clones, chakra/ki orbs; transformation flash + announcer; 11 new procedural sounds
- [x] HUD: power name, time bar, ABILITY READY / cooldown above the player panel
- [x] Hero select: creator HERO row (animated preview alternating normal/powered, stats, power, special),
      lobby shows the hero, HERO POWER-UPS toggle; `?heroes=` / `?powers=0` for quick matches
- [x] Maps: Hidden Leaf Forest (giant trunks to wall-jump, village, rope ladders, lanterns, swing platform),
      Grand Line Ship (hold/decks/mast, waves, two cannons fired with Interact, swing platforms, sea),
      Alien Energy Planet (two low-gravity fields, floating rocks, crystal caves, energy fissures);
      themed parallax backgrounds (ship horizon rocks gently)
- [x] Bots: value power-ups (own hero +45), fire specials when the shot is good (range band, straight line,
      line of sight), charge ki blasts at long range; nav handles low gravity
- [x] External PNG sprite-sheet support (`art/externalSheets.ts`, `docs/ASSETS.md`): validated format,
      Boot preload, state → animation mapping, procedural fallback
- [x] Tests: hero data, transformation/expiry, generic boost, pickup, death, each special, clone lifecycle,
      Gear 2 reach, ki charge, power spawner, determinism; waves/cannon/fissure; sheets; lobby heroes; bots
      use specials and fetch powers; every map incl. the 3 new ones (nav, power spots, bot matches);
      e2e per hero (power-up → powered look → combo → special → expiry → pistol) and creator hero pick

### Manual play-test checklist (M9)
- Each hero: walk over its power-up → transformation flash/announcer, aura, powered look; combo feels
  stronger; ABILITY special hits; HUD timer/cooldown; power runs out cleanly (no leftover aura/arm).
- Grab another hero's power-up → smaller generic boost, no special.
- Goku: tap vs hold ABILITY (charge glow grows, big blast explodes). Luffy: rubber bullet against walls.
- Naruto: third hit of the combo → two clones appear beside him and vanish.
- Maps: wall-jump up the forest trunks; fire a ship cannon (Interact at the breech); waves slide barrels;
  alien low-gravity fields + fissure eruptions; power-up spots are reachable and contested.
- Rebind ABILITY in Controls (keyboard + pad) and check it in a match. 2 keyboards + pads at once.
- 10 fighters with several powered heroes: frame rate on a real GPU.

## M10 — Overhaul ✅ (2026-10)
- [x] Crash fix: "Cannot read properties of null (reading 'chars')" on the 2nd match / lobby re-entry (scenes kept
      destroyed BitmapTexts across runs, D56); restart from the pause menu no longer starts paused
- [x] Controls (D50): W / Up is a full jump for keyboard players (latched while Up climbs/aims/grabs/flies);
      double-tap Down drops through platforms (one-way tiles, props, movers); crouch + jump = jump; bots drop
      with the same double tap; Settings → UP / W JUMPS toggle; P only pauses when nobody has it bound
- [x] Hero base abilities (D51): Goku Levitation (8-dir flight, ki meter, ABILITY or a 3rd jump to take off,
      unlimited as Super Saiyan), Naruto Rasengan (orb + gravity-free dash strike), Luffy Gum-Gum Pistol
      (angled stretch punch, Gum-Gum Rocket off walls); FX, sounds, HUD status, bots use Rasengan / Pistol
- [x] Main menu (D53): per-player NAME (typed) and FIGHTER (animated preview of the signature move), MAP incl.
      RANDOM with live backdrop + minimap, PLAYERS 1/2, BOTS, BOT SKILL; profiles shared with the lobby;
      names everywhere (tags, HUD panels, score bar, kill feed); quick match refuses < 2 fighters
- [x] HUD panels redesigned for names (name + ability status / ki meter, full-width HP, weapon, slots) and fade
      when a fighter is behind them
- [x] Camera (D52): human players always on screen (zoom floor 0.3, hard post-smoothing correction, HUD-aware
      screen-space margins); bots framed when comfortable
- [x] Animation (D57): new poses (apex, hover, skid, land, windup, cross, haymaker, idle shift), reworked run
      cycle, eased arm swings, lean, turn squeeze, landing crouch, per-fighter breathing; overhead bars no
      longer cover heads
- [x] Map detail (D54): themed back-wall materials with variants; ~60 procedural decorations across 11 themes
      with light pools and small animations; rooftop buildings get lit windows, AC units, antennas
- [x] Fair spawns (D55): factory spawns off the conveyors, mine spawns off the cart starts + cart start delay;
      new test: idle at any spawn is safe for 8 s
- [x] Tests: +39 unit (controls, base abilities, bot abilities, spawn safety) and +12 e2e (re-entry, camera on
      the widest maps, title menu flow, abilities through the real keyboard); balance survey with heroes: base
      abilities < 3% of kills

### Manual play-test checklist (M10)
- Two players on one keyboard: W and Up jump, double jump, wall jump; S S / Down Down drop through platforms;
  holding S to crouch never drops; aiming a gun with W never jumps.
- Goku: B takes off, WASD/arrows fly in all directions, meter drains and refills, S to the floor lands, a punch
  knocks him down; Super Saiyan flight never runs out.
- Naruto: Rasengan on the ground and mid-air (crosses gaps); Luffy: pistol straight, up (hold W) and down
  (in the air), rocket off a wall.
- Main menu: rename both players, pick fighters + map, Quick Match uses them; Match Setup shows the same
  fighters for KEYBOARD 1/2; the creator's changes show up back on the title.
- Camera: run to opposite ends of Night Train / Docks — both players stay on screen.
- Restart a match 3x from the pause menu, quit to title and play again: no crash.

## M11 — Orb transformations, hero moves ✅
- [x] One power orb pickup replaces the three hero items; every orb = next form (4 forms per hero), D58
- [x] New hero designs: per-form looks (eye colour, new hair styles, wrist bands), Naruto tails (1/4/6/9), per-form
      auras (fire, lightning, steam, clouds); creator and art page cycle through all forms
- [x] Combo is punch, punch, punch, kick; kick key = ability 2 (Kamehameha / shadow clone rush / gatling) (D59)
- [x] Super move on both ability keys while transformed (Tailed Beast Bomb / giant fist / Super Kamehameha)
- [x] Holding aim + Up never jumps (D60); HUD chips A / K / S with cooldowns; bots use all three moves
- [x] Tests: 272 unit (hero rewrite, aim + Up) and 45 e2e (per-hero orb ladder, ability 2, super)

## M12 — Form health, transformation animation, flight ✅
- [x] Form health layers replace the form timer (D61); HUD panel + overhead bars show the stack
- [x] One universal transformation animation for all heroes
- [x] Keyboard jump key removed (Up jumps); setting removed
- [x] Final forms of Naruto and Luffy fly while Up is held
- [x] Naruto: fox stance in forms 1-3, aura-made tail in form 1, no tails in Kurama mode

## M13 — Hero upgrades ✅
- [x] **Goku**: Levitation removed; his ability 1 is **Instant Transmission** (teleport, lock-on, arrival strike, i-frames);
      flight is now the final form's (Super Saiyan Blue holds Up to fly), like Naruto's and Luffy's final forms (D62)
- [x] **Naruto** (priority): **Shadow Clones are real fighters** (2 base, +1 per form to 5, final form 2 full-health copies),
      Rasengan-only bots that follow him, recall on ability 2, cooldown only after all are gone (D63); **Rasengan holds**
      until it hits / a wall / release (D64); **wall walking** (D66); anime **arms-back sprint** in base + final form
- [x] **Luffy**: Gum-Gum Pistol is a grapple (platforms, ladders, walls pull you in; ceilings swing you), hold extends the
      arm up to 340 px until it hits something, damage halved to 4.5 (D65)
- [x] Replays record intents for the clone slots (`RoundRecording.count`); bots and the bot sim create clone brains
- [x] Tests: 312 unit (new `heroUpgrades.test.ts`, rewritten ability tests), e2e abilities spec is now tick-based (the
      wall-clock version failed on a clean main under software rendering) + wall walk and grapple e2e

### Manual play-test checklist (M13)
- Naruto: call clones in each form (2/3/4/5, final = 2 copies at your current health), let enemies kill them, recall with
  ability 2 again, check the K chip only refills once all are gone; hold Rasengan at a far enemy; double-tap + hold toward
  a wall then Up to run up it; sprint in base and Kurama form (arms trailing back).
- Luffy: hold Up + ability under a platform / next to a ladder / at a wall (pulled there); under a ceiling (swing, pump,
  reel, release); hold at an enemy far away (4.5 damage, arm retracts when it connects).
- Goku: Instant Transmission toward an enemy, into a wall, up; in Super Saiyan Blue jump then hold Up to fly.

