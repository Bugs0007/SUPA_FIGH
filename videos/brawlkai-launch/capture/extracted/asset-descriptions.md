# Captured and supplied assets

The deployed game is a canvas application. HyperFrames capture succeeded (HTTP 200) and generated two screenshots, but it cannot inventory sprites within a WebGL canvas. This inventory supplements the capture with verified browser evidence and the user-provided source.

- `screenshots/full-page.png`: actual deployed Brawlkai quick-match screen, gold pixel logo, navy panels, player controls and up-to-ten-fighter tagline.
- `live-game/open_0190.png`: deployed Naruto Kurama, Luffy Gear Fifth and Goku Blue on the alien arena, recorded through the game's actual deterministic trailer hook.
- Gameplay clips in `../../assets/`: recorded directly from the deployed build. The hook, Spirit Bomb and Tailed Beast Bomb takes use the supplied local game after correcting the charge-display initialization; combat timing and damage are unchanged. Film-set directions live in campaign.mjs.
- Music and sound effects: existing original synthesis code in the supplied `scripts/trailer/music.ts` and `src/audio/sounds.ts`. The new edit gets a 45-second arrangement and frame-aligned effects.

Brand: a bright, chaotic pixel-art anime party brawler, with large attacks and a dark purple/navy arcade presentation.
