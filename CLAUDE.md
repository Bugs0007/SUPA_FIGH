# SCRAPYARD RIOT — developer guide

2D pixel-art side-view arena brawler for the browser (up to 10 fighters: 4 local humans + bots).
Phaser 3 + TypeScript + Vite. All art and audio are generated procedurally at startup.

**Resuming work? Read `PROGRESS.md` first** (milestone checklist + "next steps"), then skim
`DECISIONS.md` for the reasoning behind non-obvious choices.

## Commands
```
npm run dev        # Vite dev server (http://localhost:5173)
npm run build      # typecheck + production build into dist/
npm run preview    # serve dist/
npm test           # Vitest unit tests (pure sim logic, runs in Node)
npm run test:e2e   # Playwright browser tests (uses installed Edge on Windows, else bundled Chromium)
npm run typecheck  # tsc --noEmit
npm run sim -- 8 8 test normal 1   # headless bots-only balance report (matches bots map difficulty seed)
```

## Architecture (the one rule: the simulation never imports Phaser)
```
src/sim/      Pure TypeScript game simulation. Deterministic, fixed 60 Hz step, seeded RNG.
              Runs in the browser AND headless in Node (unit tests, bot balance sims).
  world.ts        World = one round: tilemap, fighters, projectiles, items. world.step(intents)
  match.ts        Match = rounds, scores, round phases, mode rules. Owns the current World.
  fighter.ts      Fighter state machine driven ONLY by an Intent each tick.
  physics.ts      Custom AABB-vs-tile physics (one-way platforms, ladders, drop-through).
  combat.ts       Damage/knockback math (pure functions, unit tested).
  projectile.ts   Bullets: swept raycast vs tiles + fighters, ricochet/pierce rules.
  explosion.ts    Radial blasts: damage/knockback falloff, wall cover, chain reactions, tile breaking.
  fire.ts         Burning status, fire patches, burning/spreading wooden tiles.
  prop.ts         Crates / barrels / gas canisters: dynamic bodies (standable, pushable, carryable).
  item.ts         Weapons lying around + live throwables (fuses, sticky C4, mines, molotov impact).
  gimmicks.ts     Map gimmicks from MapDef.gimmicks: movers, hazards, gravity zones, supply drops, conveyors.
  replay.ts       RoundRecording (intents per tick) + ReplayPlayer (deterministic re-simulation).
  awards.ts       Post-match awards from match stats. data/modifiers.ts = chaos cards.
  data/weapons.ts ALL weapon stats live here (guns, melee, throwables, gadgets, powerups, FIRE/CARRY
                  tunables). Balance by editing this file only. Prop stats: data/props.ts.
  map/            Tile types, ASCII map parser, runtime TileMap, map definitions (maps/*.ts).
  events.ts       SimEvent union. The sim pushes events (shot, hit, kill, land...) that the
                  renderer/audio drain for juice. The sim never plays sounds or draws.
src/input/    Keyboard (event.code based) + Gamepad API (gamepad.ts) -> Intent. Bindings (bindings.ts, with
              conflict detection) saved in localStorage. menu.ts = unified menu nav for keys + pads.
src/ai/       Bots (pure TS, no Phaser — run headless too). Same Controller/Intent contract as humans.
  nav.ts          Nav graph: standable cells + ladders; jump/fall/drop edges found by simulating the
                  real fighter code in a sandbox (MANEUVERS input scripts that bots replay). A*, Dijkstra.
  bot.ts          BotController: perception (line of sight, memory, no wallhacks), utility goals
                  (fight/loot/heal/flee/roam), aiming, throw solver, melee, dodging, stuck recovery.
  botData.ts      Difficulty / personality / per-weapon AI value tables. Tune bots here.
  botsim.ts       Headless bots-only match runner (balance report + tests).
src/art/      Procedural pixel-art generators that bake Phaser textures at boot.
              ArtProvider (art/index.ts) is the asset-loader abstraction: swap in real sprite
              sheets later by implementing the same interface.
src/audio/    sfxr-style WebAudio synth + sound definitions + AudioManager (pitch randomized).
src/render/   Phaser-side views: FighterView, WorldRenderer, Fx (pooled particles), CameraDirector.
              Reads sim state each frame (interpolated with prevX/prevY) — never mutates it.
src/scenes/   Boot (bake assets) -> Title -> [Lobby | Controls] -> Match (+ Hud overlay above,
              Background parallax scene below).
              lobby.ts = Phaser-free lobby model (slots/rules -> MatchSceneData), unit tested.
src/game/     Display config (640x360 native, integer scale factor), settings/profile storage.
```

### Frame loop (MatchScene.update)
poll each controller -> Intent per fighter, step `match` in fixed 1/60 s ticks via an accumulator
(scaled by `match.timeScale` for slow-mo), drain `world.events` into Fx/Audio/Hud, then
`renderer.sync(world, alpha)` with interpolation.

## Conventions
- Units: pixels, seconds, radians. Screen coords (y down). Angles: 0 = facing direction, +down.
- Entity position: `x` = horizontal center, `y` = FEET (bottom of AABB). AABB = [x-w/2, y-h, x+w/2, y].
- Tile size 16 px. Native view 640x360; canvas = 640k x 360k (k = integer); camera zoom = k * z.
- `src/sim/**` must not import from phaser, `src/render`, `src/art`, `src/audio`, or touch `window`.
  No `Math.random()` in sim — use `world.rng`. Keep sim entities plain data (snapshot-able).
- Tunables: weapons in `sim/data/weapons.ts`, movement in `sim/constants.ts`, maps in `sim/map/maps/`.
- Fighters are driven only through `Intent` (sim/intent.ts). Never poke fighter state from input code.
- Visual-only randomness (particles) may use Math.random.
- Keep files focused; prefer data tables over branching code for per-weapon/per-map behavior.

## Adding things
- Weapon: add an entry to `WEAPONS` in `sim/data/weapons.ts` + a pixel sprite in `art/weaponArt.ts`
  (ASCII pixel map keyed by the same id). Unit test `tests/unit/weapons.test.ts` validates data.
  Throwables/gadgets/powerups are the same table (`throw` / `gadget` / `powerup` blocks instead of `gun`/`melee`).
  Check the sprite at `/?scene=art&page=weapons` (magenta dot = grip).
- Map: add a builder function to `scripts/mapgen.py` (or hand-write `sim/map/maps/<name>.ts`): ASCII rows +
  legend (see mapData.ts), 10 `S` spawns, `w` weapon spawns, props `c b g t l`, optional `gimmicks`, and a
  theme (`art/tileArt.ts` THEMES + `art/backgroundArt.ts`). Register it in `sim/map/maps/index.ts`.
  `tests/unit/maps.test.ts` checks spawns, bot connectivity and a stuck-free bot match automatically.
- Sound: add an sfxr param set in `audio/sounds.ts`, trigger from an event handler in MatchScene.

## Testing
- `tests/unit/*.test.ts` — Vitest, Node. Pure sim logic only (no Phaser).
- `tests/e2e/*.spec.ts` — Playwright (`PW_EXECUTABLE=/path/to/chrome` to use a preinstalled browser;
  in cloud containers: `/opt/pw-browsers/chromium`). Screenshots go to `tests/e2e/screenshots/` (ignored).
  The game exposes `window.__GAME__` (`match()`, `scene()`, `game`).
  URL params: `?scene=match` skip title, `?scene=art` sprite inspector (`&page=weapons`), `?bots=N`, `?diff=easy|normal|hard|expert`, `?mode=deathmatch&time=120`, `?scene=lobby|controls`,
  `?humans=0..2`, `?speed=4`, `?seed=123`, `?map=test`, `?timer=1` (setTimeout game loop — needed
  when the tab is hidden, e.g. the Claude browser pane, where requestAnimationFrame is paused).
- Debug keys in match: F1 hitboxes/debug overlay, F2 cycle sim speed (1x/2x/4x), F3 frame step, Esc pause.
- Synthetic `KeyboardEvent`s dispatched on `window` with a `code` drive the real input path (handy in tests).
- `src/sim` modules import each other in a cycle (fighter → item → explosion → prop → explosion...). That's
  fine because they only call each other at runtime; never use another sim module's exports at load time.

## Gotchas
- Don't name Scene members `renderer` or `time` (they shadow Phaser.Scene properties).
- Use Write/Edit (or sed) for file edits — PowerShell `Set-Content` adds a UTF-8 BOM.
- `keyboard.endFrame()` runs on Phaser POST_STEP (main.ts) so every scene sees `justPressed` edges.
