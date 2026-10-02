# Deploying

`npm run build` produces a fully static site in `dist/`:
- `index.html`
- `assets/index-*.js` (the game)
- `assets/phaser-*.js` (the engine chunk, which is cached across game updates)

There is no server, no asset files and nothing to configure.

`vite.config.ts` uses `base: './'`, so every URL in the build is relative. The same `dist/` therefore works at
a domain root, under a sub-path (GitHub Pages project sites) or inside an itch.io iframe. The version shown on
the title screen and in the crash overlay comes from `package.json`, so bump it before you release.

## itch.io
1. Run `npm run build`.
2. Zip the contents of `dist/`, so that `index.html` sits at the root of the zip (not inside a `dist/` folder).
   One way to do this: `cd dist && zip -r ../scrapyard-riot.zip .`
3. On itch.io, create a new project with Kind = **HTML** and upload the zip.
4. Tick "This file will be played in the browser".
5. Set the viewport to 1280 × 720 (or 960 × 540) and enable **Fullscreen button**.
6. Leave "Mobile friendly" off. The game needs a keyboard or gamepad.

## GitHub Pages
Add a workflow, for example `.github/workflows/pages.yml`:
```yaml
on: { push: { branches: [main] } }
permissions: { contents: read, pages: write, id-token: write }
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: github-pages
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci && npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
      - uses: actions/deploy-pages@v4
```
Then set Settings → Pages → Source to "GitHub Actions".

## Netlify / Cloudflare Pages / Vercel
Use these settings:
- Build command: `npm run build`
- Publish directory: `dist`
- Node version: 20 or newer

No redirects are needed, because the game is a single page with no client routes.

## Checklist before a release
- `npm run typecheck && npm test && npm run test:e2e`
- `npm run preview`, then play a match with sound. Audio only starts after the first key press or click,
  because that's the browser autoplay rule.
- Bump `version` in `package.json`.
