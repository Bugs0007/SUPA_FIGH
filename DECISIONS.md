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
