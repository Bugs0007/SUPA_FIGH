# Brawlkai trailer pipeline

Everything that makes `/trailer/*` lives here and in `src/trailer/`. Nothing in it touches the simulation.

## What it is
- **`?trailer=1`**: a free-running, real-time bots-only match with a clean screen (no HUD, no name tags, no
  health bars, no blood) and a camera that frames the action. Power orbs on. Options:
  `heroes=naruto,luffy,goku` `map=alien` `seed=1` `diff=expert` `powers=0`.
- **`?trailer=1&shot=<id>`**: one *scripted shot* from `src/trailer/shots.ts`, frozen until the recorder drives it.
  A shot is data: map, seed, hero bots, start positions, form levels, intent patches on a tick schedule (the bots'
  own intents are overridden to press a hero's ability / kick / both at an exact tick), a scripted camera
  (track fighters, fit zoom, push-ins, hard cuts), slow-mo windows and pixel-font captions. One natural
  (un-scripted) bot fight is used in the cut too (`finale`, found with `scout.ts`).
- Recording is **deterministic and frame-exact**: `window.__TRAILER__` (`src/trailer/driver.ts`) stops Phaser's loop
  and produces each video frame with one `game.step()` of exactly 1/60 s. Same shot in, same pixels out.

## Build everything
```
npm run dev -- --port 5199        # the build starts one itself if nothing is listening
npm run trailer                   # = node scripts/trailer/build.mjs  (needs ffmpeg on PATH or FFMPEG=...)
```
Output in `trailer/`: `trailer.mp4`, `trailer.webm`, `poster.jpg`, `trailer_master.mp4`. Intermediates (lossless
shot clips, audio logs, soundtrack WAV) go to `trailer/work/` (git-ignored).

Options: `--scale 2` (default; renders the game at 3840x2160 and downsamples to 1920x1080, which smooths the
fractional camera zooms), `--only rasengan,kame` (re-record just those shots, then re-mux),
`--skip-record` (re-encode from the existing clips), `--work <dir>`.

## Authoring a shot
1. Add an entry to `SHOTS` in `src/trailer/shots.ts` (copy a similar one) and add its id to `TIMELINE`.
2. `sh scripts/trailer/preview.sh <id> [every=8] [cols=4]` renders preview frames at 1x and prints the path of a
   contact sheet (`MAXF=<n>` limits the frames, `TAILN` the event lines). The recorder prints the key sim events
   (`rasengan`, `hit`, `super`, `beam`, `transform`, `KILL`...) with the video frame they landed on.
3. `node scripts/trailer/sync.mjs <workDir>` shows where each shot's impacts fall on the 150 BPM grid
   (24 frames per beat). Tune press ticks / `start` / slow-mo until impacts sit on beats.
4. `npx vite-node scripts/trailer/maps.ts <mapId>` prints a map with tile rulers and standable floor runs.
   Watch out for map hazards (the alien map has fissures at x=416-448 and 768-800 px).
5. `npx vite-node scripts/trailer/scout.ts <map> 3,3,3 1 40` searches seeds for exciting natural bot fights.

Timing notes: patches are keyed by **sim tick** (since the match started, warm-up included), camera / slow-mo /
overlays by **video frame**. Slow-mo makes a tick last several frames, so put a slow window's `at` right at the
impact (`ease: 2`) or the hit slides later.

## Soundtrack
No third-party audio. `music.ts` is a 150 BPM A-minor chiptune written as code (pulse lead + echo, pulse arpeggio,
triangle/pulse bass, saw pad, noise drums, risers, crash hits) rendered to samples. `audio.ts` mixes it with the
game's own procedural sound effects (`src/audio/sounds.ts`, replayed from the per-shot audio logs so every hit,
beam and transform sound lines up with the picture) plus a few stingers. Bars map to frames as
`(bar - 1) * 96`; the structure is: bars 1-2 title, 3-4 base abilities, 5-6 transformations, 7-9 second abilities,
10-14 super moves, 15-17 end card.
