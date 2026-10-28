# Brawlkai launch trailer

45 seconds, 1920×1080, 30 fps, stereo music and sound effects.
Actual footage is recorded from https://brawlkai.vercel.app/ through its trailer driver. The bomb takes use the supplied local game with a charge-display initialization fix; timing, damage and combat rules are unchanged.

The edit features all three anime heroes, signature attacks, transformations, Shadow Clones, Kamehameha, Gear Fifth's Bajrang Gun, Tailed Beast Bomb, Spirit Bomb, six-fighter arena action and weapons.

## Files

- `renders/brawlkai-trailer.mp4`: final video.
- `renders/brawlkai-trailer-share.mp4`: smaller 1080p sharing copy, about 23 MB.
- `renders/poster.png` and `renders/contact-sheet.jpg`: poster and shot overview.
- `index.html` + `compositions/frames/`: editable HyperFrames timeline and titles.
- `campaign.mjs`: shot timings, film-set directions and title copy.
- `assets/`: local footage, logo, fonts, music and GSAP runtime.
- `audio.ts`: 45-second arrangement of the supplied original chiptune and frame-aligned game effects, with automatic ducking beneath loud impacts.
- `work/*.json`: recorded sounds/events, making the timing reproducible and inspectable.
- `capture/`: actual deployed-page reference captures.

## Rebuild from the repository root

```powershell
node videos/brawlkai-launch/record.mjs
node node_modules/vite-node/vite-node.mjs videos/brawlkai-launch/audio.ts
node videos/brawlkai-launch/build.mjs
```

Then, from this folder:

```powershell
npx hyperframes check
npx hyperframes preview --background
npx hyperframes render --fps 30 --quality delivery --output renders/brawlkai-trailer.mp4
```

The footage and render caches are ignored by Git; they remain on disk for local editing. No commit or push was made. All music and game SFX come from the project's own synthesis code. `assets/logo.svg` uses the original game's procedural glyphs. The local display fonts are embedded for consistent rendering on this machine.
