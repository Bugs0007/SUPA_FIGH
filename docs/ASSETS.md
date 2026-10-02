# External hero sprite sheets (optional)

Every hero is drawn procedurally by default (`art/heroArt.ts` on top of the modular fighter baker in
`art/fighterArt.ts`). That is the reference for size and pixel density. You can replace a hero's look with
a hand-drawn PNG sheet. If the file is missing, the game silently falls back to the procedural look.

## Rules
- Same logical pixel scale as the procedural fighters: the character is ~20–30 px tall and the frames are
  16–48 px. Integer scaling happens on the canvas, so never upscale the art itself (`scale: 1`).
- Transparent background, no anti-aliasing, gradients or soft shadows, and a 1 px dark outline like the
  rest of the game.
- Fixed frame size, with one animation per row, read left to right. The feet sit on the origin pixel
  (bottom center) in every frame.
- Collision always comes from physics (a 10x24 box). `hitbox` only documents where that box sits.

## Register a sheet
Put the PNG under `public/sprites/` and add an entry to `EXTERNAL_SHEETS` in `src/art/externalSheets.ts`:

```ts
EXTERNAL_SHEETS.naruto = {
  key: 'sheet_naruto',
  url: 'sprites/naruto.png',      // relative: works with base './' on any host
  frameW: 32, frameH: 32, columns: 8,
  originX: 16, originY: 31,        // feet center
  scale: 1,
  hitbox: { x: 11, y: 7, w: 10, h: 24 },
  anims: {
    idle: { row: 0, frames: 2, fps: 2 },   walk: { row: 1, frames: 6, fps: 10 },
    run: { row: 2, frames: 6, fps: 14 },   jump: { row: 3, frames: 2, fps: 6 },
    doubleJump: { row: 4, frames: 4, fps: 14 }, wallJump: { row: 5, frames: 2, fps: 8 },
    punch1: { row: 6, frames: 3, fps: 20, loop: false }, punch2: { row: 7, frames: 3, fps: 20, loop: false },
    punch3: { row: 8, frames: 4, fps: 16, loop: false }, kick: { row: 9, frames: 3, fps: 14, loop: false },
    grab: { row: 10, frames: 2, fps: 8 },  throw: { row: 11, frames: 3, fps: 12, loop: false },
    hurt: { row: 12, frames: 2, fps: 10 }, knockdown: { row: 13, frames: 3, fps: 8, loop: false },
    death: { row: 14, frames: 4, fps: 8, loop: false }, pickup: { row: 15, frames: 2, fps: 10, loop: false },
    fire: { row: 16, frames: 2, fps: 12 }, poweredIdle: { row: 17, frames: 4, fps: 8 },
  },
  powered: { idle: { row: 18, frames: 2, fps: 2 } }, // optional overrides while transformed
};
```

`validateSheet(def, imageW, imageH)` lists every problem: missing animations, hi-res frames, rows outside
the image, and bad fps. The test `tests/unit/sheets.test.ts` shows how to use it. `animFor(fighter)` maps
fighter states to these animations.

## Required animations
idle, walk, run, jump, doubleJump, wallJump, punch1, punch2, punch3, kick, grab, throw, hurt, knockdown,
death, pickup, fire (gun or special), poweredIdle.

Auras, clones, stretched arms and energy orbs are drawn by `render/HeroFx.ts` on top of the sheet, so the
sheet only needs the character itself.
