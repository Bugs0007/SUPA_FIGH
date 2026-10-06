# Decision log

Newest at the bottom. Each entry: what was decided and why.

### D1 — Keep the name "SCRAPYARD RIOT"
Short, original, tells you it's messy and violent-cartoony. Easy to render in a pixel font.

### D2 — Custom deterministic AABB physics instead of Phaser Arcade Physics (override of default)
The spec asks for simulation state separate from rendering (replays, killcams, netcode) and for
bot-vs-bot balance simulations. Arcade Physics bodies live on Phaser game objects inside a Scene,
which makes headless Node simulation and snapshotting awkward. Platformer physics against a tile
grid (one-way platforms, ladders, drop-through, ledges) is small enough to own: `src/sim/physics.ts`.
Result: the whole game simulation runs in Node (Vitest + balance sims at thousands of ticks/sec),
is deterministic with a seeded RNG, and is still stepped at a fixed 60 Hz exactly like the default.

### D3 — Canvas = 640k x 360k with integer k, camera zoom = k * z
The game world is designed at 640x360. Instead of CSS-scaling a 640x360 canvas (blurry or
non-integer), the canvas itself is 640*k by 360*k (k = largest integer that fits the window) and
the camera's base zoom is k. The smart camera zooms smoothly around that (z ~ 0.7–1.6), which is
unavoidable for a shared camera; `pixelArt` + `roundPixels` keep it crisp.

### D4 — Own keyboard handler using `event.code`, not Phaser's keyboard plugin
Phaser uses `keyCode`; with NumLock off, Numpad4 reports keyCode 37 (ArrowLeft), which would make
P2's attack key move P1... `event.code` is the physical key regardless of NumLock/layout. Also lets
us latch taps shorter than a frame so no input is ever dropped.

### D5 — Control scheme
- Separate Jump button AND "Up also jumps" (when not on a ladder and not aiming). Players expect
  W/Up to jump; the dedicated button makes precise aiming + jumping possible.
- **Hold attack to aim; automatics fire while held; semi-autos fire on release.** Press-to-fire
  wastes the first shot horizontally before you can adjust the angle; release-to-fire makes
  "hold, sweep, let go" feel great for pistols/snipers, and a quick tap is still an instant shot.
  Automatics spray immediately and you can sweep the spray while holding — the fun part of an SMG.
- Mid-air shooting is allowed (no planting in air) — jump-shots and shotgun-recoil jumps are fun.
- Avoid Ctrl/Alt in default binds: with two players on one keyboard, P2 holding Ctrl while P1
  presses W would close the browser tab.
- P2 has both numpad and laptop keys bound by default, so no setup is needed on either keyboard.
- Walking over a weapon auto-picks it up only if that inventory slot is empty (fast, no key needed);
  otherwise Interact swaps it. Empty guns are auto-tossed (they become a thrown object) so fighters
  keep scavenging.

### D6 — Fighter rendering = baked body frames + separate head + arms baked at 32 angles
Legs/torso poses are baked per appearance (crisp pixel art). The head is a separate sprite so
Big Heads is a 2x integer scale and hats/hair are drawn once. Arms are thin, so they are pre-drawn
at 32 angles x 2 lengths (crisp lines at any aim angle, no rotated-texture jaggies). Weapons are
rotated at runtime around their grip. The whole fighter container flips with `scaleX = facing`.

### D7 — Tiles are 16 px, maps are ASCII
A standing fighter is 22 px tall (~1.4 tiles), crouched 14 px, so a 1-tile gap is a crawl space
(used by Night Train tunnels). ASCII rows with a legend are readable, diffable and data-driven.

### D8 — Bullets are fast projectiles with a swept raycast per tick (not instant hitscan)
Visible tracers, travel time for snipers across big maps, bullets can be dodged by rolling, and
ricochet/pierce logic falls out of a DDA tile walk. Speeds stay < 2 tiles per tick anyway.
Bullets spawn at the shoulder (never inside a wall, point-blank shots always connect) while the tracer
is drawn from the muzzle.

### D9 — Interact is context-sensitive: pick up > grab > toss weapon
One button covers pick up / swap, grabbing an enemy, and throwing your weapon when there's nothing
else to do. Keeps the per-player key count at 9 so two people fit on one keyboard. While grabbing:
Attack/Interact throws (Up = high lob, Down = spike), Kick knees (3 knees = auto-throw). Victims mash
any button to struggle free.

### D10 — Knocked-down fighters have a 12 px hitbox
Getting knocked down is also a way to dodge bullets flying at chest height — it's what makes
knockdown combos feel fair and keeps shotgun fights dynamic. Crouching (14 px) dodges standing fire too.

### D11 — Rounds end 0.9 s after the last enemy dies
Gives trades and falling bodies a moment to resolve (so a double-KO becomes a DRAW instead of an
arbitrary winner) and lets the final-kill slow-mo breathe.

### D12 — Placeholder "wanderer" dummies in M1
Real bots are M3. A 60-line WandererController (same Controller/Intent contract) lets one person test
combat alone now (`?bots=N` or 0-8 on the title screen). It will be deleted when M3 lands.

### D13 — Playwright uses the installed Microsoft Edge on Windows
Avoids a ~150 MB Chromium download; CI/other OSes fall back to bundled Chromium (`PW_CHANNEL` overrides).
`?timer=1` switches Phaser to a setTimeout loop so automated/hidden tabs still simulate.

### D14 — Throwables: hold to aim + power ramp, release to throw; grenades cook from the pin
Same "hold attack, sweep with up/down, release" gesture as guns, so there's one aiming skill. Throw
power ramps from 55% to 100% over 0.45 s of holding, so a tap is a short lob and a held throw goes
far. Frag grenades start their fuse when the pin is pulled (attack pressed): cooking is a real
risk/reward choice, and getting knocked out of the throw (or dying) drops the live grenade at your
feet. Humans get a dotted arc preview (not bots — they'll compute it themselves).

### D15 — Mines and C4 are throwables, the medkit is a gadget, powerups are instant
The design doc listed prox mines / remote C4 under gadgets. As throwables they reuse the whole
aim/throw/live-item pipeline (and stack charges on pickup). C4 keeps its slot at 0 charges as a
detonator while any of your charges are live. Medkit sits in the gadget slot so you choose when to
heal; speed / strength / Bullet Time apply on touch and never take a slot.

### D16 — Bullet Time = the world slows to 40%, its owner gets two updates per tick
Instead of special-casing timers, the owner's fighter update simply runs twice per sim tick while the
match timeScale drops to 0.4. Their movement, aim, fire rate and cooldowns are all 2x relative to
everyone else, bullets stay at world speed, and the sim stays deterministic.

### D17 — Props are one-way-from-above platforms, pushed sideways, solid to every projectile
Full rigid-body stacking would be overkill. Bodies falling onto a prop land on its top (same feel as a
one-way platform, drop-through-able); walking into one pushes it at 70% of your speed (heavier
barrels resist). Every projectile stops on props — carried crates double as bullet shields, carried
barrels are a terrible idea. Interact lifts the prop next to you; any action button throws it.

### D18 — Fire: status on fighters, patches on the ground, burning tiles in a map
Burning fighters take 7 HP/s (credited to whoever lit them) and spread it by touch; rolling burns it
off 3.5x faster, water/medkit puts it out. Fire patches are tiny falling bodies with a lifetime.
Wooden walls/platforms ignite, spread to wooden neighbors and collapse after ~3 s — fire reshapes maps.
Flames, flares and rockets do NOT pass through wood/glass like bullets (they burn / explode on it).

### D19 — Explosions: linear falloff, 65% cover from bullet-stopping walls, always knock down
Blast damage = base * (0.2 + 0.8k) with k = 1 - dist/radius (dist measured from the body's edge),
knockback biased upward so bodies fly. Line of sight is checked against bullet-stopping tiles only
(glass and wood are blown through). Explosions ignore roll i-frames. Live explosives in range
sympathetically detonate after 0.08–0.2 s so chains ripple instead of popping in one frame.

### D20 — E2E tests don't assume wall-clock frame rates
Headless Chromium in CI/cloud containers renders with software GL at ~25 fps. Tests wait for sim
ticks with a generous timeout instead of asserting ticks-per-second. `PW_EXECUTABLE=/path/to/chrome`
points Playwright at a preinstalled browser when the bundled one doesn't match.

### D21 — Double jump, wall jump and sprint pulled forward from the anime spec (M9) into M3
The owner queued an anime expansion (docs/ANIME_EXPANSION.md) whose movement changes apply to every
fighter. Bots navigate with a graph built from movement capabilities, so the moves landed before the
nav graph instead of forcing a rebuild later. Wall jumps can't repeat off the same side until you land
or touch the other wall (no infinite climbing); one air jump, refreshed by landing and by wall jumps;
sprint = double-tap a direction (in the sim, from intent edges, so bots and replays get it for free).

### D22 — Nav graph edges come from simulating the real fighter, bots replay the same scripts
Hand-modelling jump arcs drifts from the real physics the moment a constant changes. Instead each
standable node runs ~25 scripted input sequences (running jump, late steer, short hop, double jumps,
walk-offs, drop-throughs) through `updateFighter` in a sandbox World; wherever the fighter lands
becomes an edge. Bots line up on the node center, stand still, and replay that exact script, so they
land where the graph says. ~150 ms per map, cached per map definition. Tiles that break later
(glass, burnt wood) aren't rebuilt into the graph: bots notice a failed edge, penalize it and re-plan.

### D23 — Bot perception is honest; bots are deterministic per seed
Bots see enemies only within a difficulty-based sight radius with tile line of sight (glass/wood are
see-through), hear anyone within 70 px or anyone who fired within 650 px, and remember last-known
positions for 5 s. Each bot has its own seeded Rng, so headless sims and replays are reproducible.

### D24 — Rounds have no time limit yet
In ~300 simulated bot rounds, 2 ended as two survivors who never met (120 s sim cap). A sudden-death
rule (shrinking arena / hazards / "hunted" reveal) belongs with the mode rules in M4/M7.

### D25 — Sudden death = reveal, then drain (Brawl)
Default 75 s into a round: bots learn everyone's position (humans already share one camera), then
15 s later everybody loses 2 HP/s. Drain kills credit the last attacker (env kill, "OUTLASTED!"). It's
configurable (off/45/75/120) in the lobby. Chosen over shrinking arenas because it works on any map.

### D26 — Deathmatch respawns reuse the Fighter object
`World.respawn` resets the fighter in place (Object.assign with a fresh fighter) so renderer views,
controllers and stats keep their references; the corpse simply disappears. Spawn = the spawn point
farthest from living enemies (with jitter), 1.5 s protection. Ties at the buzzer go to overtime:
next kill wins.

### D27 — Lobby navigation: left/right pick a column on slot rows, change values on setting rows
With 10 slots × 4 fields, giving every field its own row would be 40 rows. Slot rows use a column
cursor (Enter cycles the value, Shift+Enter cycles back); setting rows change with left/right like
every other menu. Gamepads join by pressing START (taking the first empty or bot slot).

### D28 — Gamepad movement isn't rebindable, buttons are
Left stick + d-pad always move/aim (that's what every pad player expects); only buttons rebind.
Pad slots follow connection order; an unplugged pad leaves its fighter idle instead of crashing.

### D29 — Map gimmicks are a handful of generic primitives, not per-map code
Movers, hazards, gravity zones, supply drops, conveyor tiles and anchored props cover all nine design-doc
gimmicks (elevators/girders/hooks/minecarts are movers; crushers/lasers/train tunnels are hazards; the
lab's low-grav switch is a toggling gravity zone; helicopter drops are supply drops; chandeliers are
anchored props). New maps (including the M9 anime maps: rocking ship, low-gravity planet) mostly need data.

### D30 — Bots navigate static geometry only
The nav graph is built in a sandbox without movers, hazards, drops or toggling gravity. Every map is
designed to be fully connected without movers (tests enforce spawn-to-spawn and weapon reachability);
movers are shortcuts/hazards for humans. Bots pay extra path cost through hazard footprints and flee
active or telegraphed hazards. Revisit in M8 if bots should ride elevators deliberately.

### D31 — Backgrounds render in their own scene underneath the match
The match camera zooms smoothly and shakes; parallax layers shouldn't. BackgroundScene has its own integer-
zoom camera, reads the match camera's view center for parallax, and the match camera is transparent.

### D32 — Maps are generated by scripts/mapgen.py, then committed as ASCII data
A tiny Python grid builder (rects, platforms, ladders, markers that nudge themselves onto free floor)
keeps 70–96 column maps consistent and editable. The output is still the plain ASCII MapDef format, so
hand edits work too (but regenerate after editing the builder).

### D33 — Replays re-simulate instead of snapshotting
Recording a round costs 1 + 3×fighters numbers per tick (intents + sudden-death level). The replay builds a
fresh World with the round's seed/settings and re-steps the log — a unit test asserts the replayed world
equals the original one field by field. Fast-forward runs in 1500-tick chunks per frame so long rounds
don't hitch. Brawl only (Deathmatch respawns are Match-driven and rounds don't end on a kill).

### D34 — Ghosts are Brawl-only and push, never damage
Ghosts keep dead players busy (pillar: no dead time) without deciding rounds: BOO shoves things around and
can shake a chandelier loose (which can kill — credited to nobody/last hitter), but ghosts deal no direct
damage and are invisible to bot targeting.

### D35 — One chaos card per round, deterministic from seed + round
Cards never repeat back to back. Fixed modifiers (`?mods=`/config) stack with the round's card. Effects
live next to the systems they change (gravity in World, damage in combat, bounces in projectiles).

### D36 — Bounty = sole match leader
Brawl leader = most round wins (kills break ties), Deathmatch leader = kills − suicides; nobody wears the
crown while tied. The bounty is captured at the start of each tick so the kill that takes the lead from
the bounty still counts as claiming it.

### D37 — Modes share one "respawn mode" flow in Match
Everything except Brawl is one long round with a respawn queue; mode rules hook into `modeKill` (scoring) and
`stepDeathmatch` (per-tick rules + win checks). Kill events are processed by `processWorldEvents(from)` so
tests can kill fighters directly. Team rules are normalized in the Match constructor per mode.

### D38 — KotH hill placement is automatic
The hill is the spawn/weapon point closest to the map center (vertically weighted), 5 tiles wide. No map data
needed, so every current and future map supports KotH; maps can add explicit hills later if needed.

### D39 — Co-op uses fixed fighter slots for waves
The World's fighter list is fixed, so bot slots start "gone" and are respawned per wave (count = wave + 1,
capped by slots; HP and weapons scale; every 5th wave one bot becomes a boss). Revives refund the life a
queued respawn would have cost.

### D40 — Music is sequenced live, not rendered
A 25 ms lookahead scheduler plays oscillator notes from data patterns (tempo, chord roots, 16-step patterns).
Tiny, tweakable as data, and switches tracks instantly (title → match → intense on sudden death/overtime/boss).

### D41 — Balance by survey, not by feel
`npm run balance` runs bot matches on every map and prints kills per weapon and round lengths. Target: no weapon
above ~25% of kills, rounds 20–60 s. The fists were dominant because bots spawned unarmed and kept brawling, so the
fix went into the data (combo damage 5/5/10, 80% of weapon spawns filled at round start, 5–9 s respawns) rather
than into bot logic.

### D42 — Phaser in its own chunk, version baked in, errors shown on screen
The engine is ~80% of the bundle and changes rarely, so `manualChunks` keeps it cacheable across game updates.
`__APP_VERSION__` (vite `define`, from package.json) is shown on the title and in the crash overlay, so bug
reports name a build. Uncaught errors show a small overlay instead of failing silently.

## M9 — Anime Universe expansion

### D43 — Any fighter can grab any hero power-up
Hero, map and power-up are independent (spec). The matching hero gets the full transformation (combo,
kick, special, 18–20 s); anyone else gets `GENERIC_BOOST` (+12% speed, +20% melee damage, +15% knockback,
12 s, aura in the power's color, no special). Pickups stay contested and denying one is a real play.

### D44 — The ABILITY button fires the special; guns are never replaced
The game has no built-in ranged attack, so "replaces the ranged attack" became "the special lives on the
ABILITY intent bit": chakra bomb, rubber bullet (stretch), ki blast (tap = small, hold = charge up to 3x).
Transformed combos replace only the bare-fist combo; held melee weapons keep their own combos but get the
damage/knockback/reach multipliers; picked-up guns work exactly as normal while powered. Expiry restores
everything (and so does death).

### D45 — Shadow clones are sim effect entities (superseded by D63: clones are now real fighters)
`World.clones` hold position/facing/timer; each strikes once in a short window and vanishes. They never
think, never take damage and are not fighters (the fighter list stays fixed for replays/bots). Deterministic,
so instant replays show them.

### D46 — Heroes are the modular fighter with new parts, not new sprites
Hair (`ninja`, `saiyan`), hats (`strawhat`, `headband`), faces (`whiskers`, `foxeyes`, `scar`), tops
(`tracksuit`, `openvest`, `gi`) and shorts were added to the same baker, so heroes have exactly the same pixel
density, poses and arm system as every fighter (spec §1). The powered look is just a second Appearance
(yellow hair, red eyes, flushed skin). External PNG sheets are optional per hero (`art/externalSheets.ts`,
validated, low-res only) and fall back to procedural art when missing.

### D47 — Power-ups are rare, one at a time
After 12–20 s, then every 26–38 s, one power-up drops at the map's `P` spot (fallback: weapon spawns) if
none is lying around. The themed map's own power is 3x likelier. On by default in the lobby and quick
match, off in Gun Game and in every unit test unless enabled (keeps old seeds deterministic).

### D48 — Map gimmicks for the anime maps stay fair
Ship waves shove loose props/items but only nudge grounded fighters (35% of the push, standing still) —
never a cheap ring-out. The ship "rocks" visually (background bob) instead of tilting the camera, so pixels
stay crisp and controls stay honest. Cannons fire on Interact with a 5 s cooldown and credit the gunner.
Alien gravity fields are static (no toggle) so the nav graph knows the bigger jumps. Leaf trunks are dirt
(not burnable wood) so fire can't delete wall-jump surfaces the nav graph relies on. The forest stream was
left out: water tiles are deadly and a shallow-water tile wasn't worth a new tile kind yet.

### D49 — Names in data (IP)
Hero names, power names, pickup names and palettes live only in `sim/data/heroes.ts`, `data/weapons.ts` and
`art/heroArt.ts`. Before any public release they can be renamed/re-skinned into original archetypes without
code changes. No anime artwork, music or sounds are used; everything is procedural or original.

## M10 — Overhaul (crash fix, controls, base abilities, menu, camera, animation, map detail)

### D50 — Up is the jump button; drop-through is a double tap of Down
Players expect W / ArrowUp to jump, and the old "Up also jumps" only did the ground jump (double/wall jumps
needed the separate key), which felt broken. For keyboard players (`upJumps`) the sim now derives the jump
button from Up, except while Up means something else: climbing, aiming (Up sweeps the angle), grabbing (lob),
ledge hang, charging a special, flying. Up used for something else stays *latched* until released, so letting
go of a gun's trigger while holding Up never fires a jump. Pads don't get it (stick-up jumping fights aiming).
Down + Jump used to drop through platforms; now crouch + jump just jumps, and dropping is a double tap of Down
(first press must be a tap of at most 0.25 s, the second within 0.3 s of releasing it) so long crouches and
dodges never drop you. Works on one-way tiles, props and movers, from normal/crouch/roll. Bot nav scripts drop
the same way. Settings → UP / W JUMPS turns the Up-jump off.

### D51 — Every hero has a base ability on ABILITY (Goku's Levitation was replaced by Instant Transmission in D62)
Heroes used to be plain fighters until a rare power-up appeared. Now ABILITY always does something:
Goku = Levitation (8-direction flight, no gravity in any state while flying, a 4.5 s ki meter that refills on
the ground, take off with ABILITY or with a jump when out of air jumps; hits, grabs, ladders and ledges end it;
unlimited while Super Saiyan), Naruto = Rasengan (0.14 s orb wind-up, 0.2 s gravity-free dash, the first
fighter touched is blasted, stops at walls), Luffy = Gum-Gum Pistol (stretch punch at 0 / up / down angles that
hits everything along the arm; a fist that touches a wall while extending anchors and yanks him there = Gum-Gum
Rocket, with a fresh air jump). While fully transformed ABILITY fires the power's special instead (the generic
boost from another hero's pickup keeps the base ability). Separate cooldown (`baseCd`) from the special. Data in
`HEROES[...].base`. Bots use Rasengan / Pistol in their range band (never on invulnerable targets); Goku bots
don't fly (flight isn't in the nav graph). Balance survey: base abilities stay well under 3% of kills.

### D52 — The camera treats human players as a hard constraint
The old camera framed every fighter equally with a 0.55 zoom floor, but maps are 70–96 columns wide, so
players at opposite ends fell off screen. Now humans must fit (zoom can go down to 0.3); bots and ghosts are
included while the zoom stays at 0.62 or closer, otherwise the view leans toward them as far as possible
without losing a human; after smoothing, a hard correction snaps zoom/position if a human would leave the safe
area. Margins are in screen pixels and reserve room for the score bar and player panels; zooming out reacts
faster than zooming in. When the camera is clamped at a map's bottom edge, HUD panels fade while a fighter is
behind them.

### D53 — Player profiles drive the main menu and the lobby's keyboard slots
Name, hero and look per keyboard player live in `game/profiles.ts` (localStorage). The title cards edit them;
the lobby loads its KEYBOARD 1/2 slots from them and the creator writes back, so the two screens never
disagree. Names (8 characters from the pixel fonts' charset, typed via `keyboard.typed` so every keyboard
layout works) become fighter labels everywhere. The URL `?heroes=` still overrides (tests, links). Quick-match
map / players / bots / skill are settings (`quickMap` may be `random`, resolved from the match seed).

### D54 — Map detail is a visual-only decoration layer, placed deterministically
Indoor maps were flat colored walls. Each theme now has its own back-wall material with 3 detail variants
chosen per cell by hash, plus ~60 procedural props (`art/decorArt.ts`) placed by `render/Decor.ts`: wall,
floor, ceiling, building-face and outdoor rules against the tile grid, spacing, per-prop caps, kept clear of
spawn markers and walkable surfaces, seeded by map id (same layout on every load and in replays). Props are
muted and sit behind fighters; lamps add flickering additive light pools; a few animate (2 frames). The sim
never sees them, so nav graphs, tests and balance are unaffected.

### D55 — Maps must not kill a player standing still at spawn
The factory spawned fighters on conveyors feeding crushers (dead in about 5 s) and the mine spawned two on the
minecarts' start positions (dead in 1.2 s). Spawns moved in `scripts/mapgen.py`; movers got an optional
first-departure `delay` (the carts wait 5–6.5 s). `maps.test.ts` now checks that every spawn on every map is
safe for 8 s.

### D56 — Phaser reuses Scene instances: reset per-run state in create()
The "Cannot read properties of null (reading 'chars')" crash: HudScene and LobbyScene kept arrays of
BitmapTexts as class fields; on the second run (restart, quit and play again, re-entering the lobby) they still
held the previous run's destroyed texts, and setText() on a destroyed BitmapText reads its nulled font data.
Every scene now resets its arrays and flags at the top of create() (MatchScene also resets pause/replay state,
so a restart from the pause menu no longer starts paused). `tests/e2e/reentry.spec.ts` covers restarts and
re-entries.

### D57 — Animation pass on the existing rig
More body poses instead of a new rig: a 6-frame run with contact / down / up hip bob, knee drive and heel kick;
distinct jump / apex / fall; hover, skid, landing squash, punch anticipation, cross and haymaker frames; idle
weight shift. The view eases arm swings between locomotion poses (attacks and aiming stay snappy), leans into
runs, sprints and flight, squeezes on turn-arounds, and gives every fighter its own breathing phase. External
sprite sheets (docs/ASSETS.md) are unaffected.

## M11 — One power orb, form ladders, three moves per hero

### D58 — One pickup (the power orb); every orb is the next form
The three per-hero pickups (scroll / straw token / core) and their single transformation became one **power orb**.
A hero that eats an orb goes up one form level (Naruto: one-tail, four-tail, six-tail black, gold Kurama mode; Luffy:
Gear 2/3/4/5; Goku: SSJ/SSJ2/SSJ3/Blue) and the 24 s timer refills, so levelling takes a streak of orbs; when the
timer ends the hero is back to base. Everyone else gets a 12 s generic boost. Orbs are rarer than weapons but
frequent enough to climb: first at 9-15 s, then every 13-19 s, at most two on the ground. Bots value orbs (more
for heroes). Fighter fields: `power` ('' | 'hero' | 'boost'), `powerLevel`. Form stats (speed / damage / knockback /
reach) are data in `HEROES[id].forms`; looks are one Appearance override + one FormFx (aura, tails, extras) per form
in `art/heroArt.ts` (tails and auras are drawn by `render/HeroFx.ts`).

### D59 — Heroes: ability 1 on ABILITY, ability 2 on KICK, super on both
The kick key is ability 2 for heroes (Kamehameha charge, rushing shadow clones, gatling), and every fighter's fists
combo is now punch, punch, punch, **kick** (the kick key still kicks for scrapyard fighters). While transformed a
single press waits `SUPER_WINDOW` (0.1 s) for the other button; both within that = the super, which has its own
cooldown (8 s), a name per form and scales with the form (bomb size, fist size, beam width and damage). Moves can
start from standing, crouching or the recovery of a combo hit.

### D60 — Holding Attack with a gun or throwable latches Up
Pressing Up while aiming used to jump when Attack went down in the same tick or for melee-style aims. Up is now
latched (never a jump) whenever Attack is held with a gun or throwable, until Up is released.

## M12 — Form health, universal transformation animation, final-form flight

### D61 — Forms are health bars, not timers
Heroes' transformations no longer expire. Each form level adds a layer of `FORM_HP` (30) form health stacked on
top of the normal bar (`Fighter.formHp`, up to level x 30; a new orb adds one fresh layer on top of what is left).
`applyHit` sends damage into the form health first and only the overflow reaches `hp`; at zero the transformation
ends (back to base). Falls, water and sudden-death drain bypass it (`FORM_BYPASS`). The generic boost from an orb
for non-heroes keeps its 12 s timer. The HUD panel and the overhead bars draw one thin bar per layer above the HP
bar (name tags move up with the layers). One universal transformation animation (`HeroFx.startTransform`): 0.35 s
of flicker + converging energy + a contracting ground ring, then a burst of two shockwave rings, a pillar of light,
sparks and a coloured screen flash; it scales with the form level and is the same for every hero.
Also in this change: the keyboard jump key is gone (Up is the jump; the UP / W JUMPS setting was removed),
hold-Up flight for the final forms of Naruto and Luffy (`HeroForm.flies`, `stHoldFly`: climbs while Up is held, falls
on release or when the form ends), Naruto's fox stance (forms 1-3 use four new low body frames and move on all
fours), form 1's tail is made of translucent crimson aura (`FormFx.ghostTails`) and Kurama mode has no tails.

## M13 — Hero upgrades

### D62 — Goku: Instant Transmission replaces Levitation; flight belongs to the final forms
Dedicated flight (meter, take-off, landing) is gone from Goku's base ability; `HeroForm.flies` is set on Super Saiyan
Blue like the final forms of Naruto and Luffy, so all three heroes fly the same way (hold Up past the top of a jump,
fall on release). Goku's ability 1 is now `BlinkStats` (data/heroes.ts): teleport up to `range` along the held
direction (8-way, facing by default), `blinkDestination` (hero.ts) locks onto the nearest enemy in that line within
range + assist and lands on their far side, otherwise the farthest spot that fits and has a clear line (never inside
a wall); a small arrival strike (`blinkStrike`, kill credit 'blink'), 0.18 s of invulnerability, 2.2 s cooldown. A
fizzle (no room) costs nothing. Bots use it as a gap-closer in a 56-130 px band.

### D63 — Shadow clones are real fighters in reserved slots (replaces D45)
The World appends `maxClones(hero)` fighter slots after the players for every fighter whose hero makes clones
(`Fighter.master` = the owner's id, `FighterSpawn.master`); slots start out of the world (`gone`, not alive) and
`World.spawnClone` steps one out beside its master. Everything that already handles fighters (hits, projectiles,
explosions, hazards, replays) works unchanged. What was adapted: clone slots get the master's team key (`teamKey`
is shared, so no friendly damage and rounds/teams are unaffected); `applyHit` credits a clone's hits and kills to its
master; a dead clone `dismissClone`s (poof, no corpse, no kill event, no score, never respawns) and all clones vanish
when their master dies; clones can't pick up items or orbs and `startSecond` / the super ignore them (they only
have the Rasengan, so they can't make more clones). `Match` walks `roster()` (the first `cfg.fighters.length` fighters)
for modes/scores; `RoundRecording.count` records intents for the clone slots so replays stay exact. MatchScene and
the bot sim give every slot a `BotController({ clone: true })` (follow the master when no enemy is known, never loot or
heal, Rasengan only) and the master's look (no name tag). Counts per form come from `cloneSpec` (base 2, +1 per form
level up to the form before the last, the final form 2 full-health copies = Naruto's CURRENT hp/maxHp); other forms'
clones have `hpFrac` (20 %) of his max health. The ability 2 cooldown is set at summon time but does not tick while
`Fighter.cloneCount > 0`; pressing ability 2 with clones out recalls them (`recallClones`). Why real fighters: the
alternative (an AI/damage model for effect entities) would have duplicated the whole hit pipeline.

### D64 — Hold-to-extend: Rasengan and Gum-Gum Pistol
Both moves read the ability button every tick of the move (`stSpecial` passes the intent on). Rasengan: a tap dashes
`dash.time` (0.3 s); holding keeps the gravity-free dash going up to `dash.maxTime` (1.6 s) until `rasenganHit`
connects, the body is blocked by a wall, or the button is released; then a recovery with 3x ground braking (a
released dash stops instead of sliding for ages). `Fighter.recoverAt` marks when the dash ended. Pistol: the arm extends
at `extendSpeed` px/s while held (a tap still reaches `range`) up to `maxRange`; punching a fighter/prop retracts it.
Bots hold the button just long enough to reach the target (`useBase`).

### D65 — Luffy's grapple
`grabProbe` marches along the arm and reports the first grab: solid tiles become a wall / ceiling (arm came up under
it) / floor, one-way platforms count only for steep arms, ladders always (except the cell you stand in). While the
button is still held at contact: wall / floor / platform / ladder -> `stRocket` pulls the body to `gripTarget` at
`rocketSpeed` (a platform target is a few px above its top so he lands on it, a ladder arrival starts the climb),
a ceiling -> `stSwing`, a pendulum with a rope you can pump (left/right) and reel (Up/Down), no stretching beyond
`ropeLen`, released by letting go or Jump (momentum kept, air jump refreshed, 4 s max). Released before contact the arm just
retracts. Damage is halved (4.5): it is a traversal move. Render: the roped arm is drawn behind the body when swinging.

### D66 — Naruto walks on walls
`HeroDefinition.wallWalk` enables the `wallwalk` state: holding toward a wall + Up (also when Up is the jump key: the
state latches Up) sticks him to it with gravity off; Up/Down move along it at run speed (sprint = double-tap toward the
wall first), releasing the direction drops him, Jump kicks off (a wall jump), the top of the wall hops him over the edge,
using an ability lets go first. The sprite is turned 90 degrees with its feet on the wall. His sprint pose with the arms
trailing behind is data too (`sprintArmsBack`: base form + the final form; forms 1-3 keep the four-legged fox run).

