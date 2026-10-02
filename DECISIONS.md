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
