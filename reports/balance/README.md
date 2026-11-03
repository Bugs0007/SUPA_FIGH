# Same-form balance studies

The full survey runs 1,000 actual Brawl rounds for each of 55 combinations: six duels, four three-player groups and the four-player group, at each starting form from 0 (base) through 4. That is 55,000 rounds per complete matrix.

Every combination covers all 18 maps with hard/expert bots and fall death on/off: 72 settings. Complete seeded trial blocks cycle each character through every starting slot and bot personality; the underlying seat order changes between trials. The final partial block keeps total slot counts balanced to within one round. Form health can break normally. New weapon and power-orb spawns are disabled; map props, hazards and their drops remain. Sudden death begins at 75 seconds; unresolved rounds are capped at 180 seconds and reported as draws, never manufactured wins.

Win shares are conditional on a decisive finish. Draws and timeouts are shown separately. Approximate 95% confidence intervals cluster by seeded slot-swap block because swapped rounds are related. Equal-share targets are 50% for duels, 33.3% for triples and 25% for four-way fights. The report screens for deviations greater than five percentage points and retains every outlier. A passing screen is evidence about these bots and settings, not a guarantee about every human playstyle or every individual map.

## Run

```powershell
npm run balance:forms
```

That builds the headless runner and starts the default 55,000-round survey. Output is checkpointed inside the ignored screenshots folder. To build without starting a survey and then use explicit settings:

```powershell
npm run balance:forms:build
node tests/e2e/screenshots/balance/runner.mjs --rounds 1000 --seed 1900001 --workers 8 --out tests/e2e/screenshots/balance/recheck.json
```

The runner accepts `--duels` or `--form 0` for smaller investigations. `--resume` resumes completed combinations only when the bundle SHA-256, seed and round count match the checkpoint. Do not rebuild the bundle before resuming it. Exploratory scouting results are not a completed matrix.

```powershell
npx vite-node scripts/formBalanceReport.ts tests/e2e/screenshots/balance/recheck.json reports/balance/recheck.md
```

The report contains all combinations, including bad matchups; it does not hide them behind a roster-wide average. The JSON also retains per-map/difficulty/fall-rule results, damage, move starts, kill sources, mean-placement point totals and seed-block outcomes for further analysis.

## Controlled tuning and final confirmation

Small scouting runs compare changes with common seeds. `--tuning path.json` accepts temporary hero-data overrides, or a structured `{ "heroes": { ... }, "ai": { ... } }` patch. Overrides are recorded in the output and passed unchanged to workers. They never modify the game files. Use them for experiments, not as a substitute for implementing the selected settings.

After selecting the game defaults, build once and run a complete matrix with fresh seeds and no overrides. Publish that complete matrix alone; do not pool samples from different gameplay variants. The runner records a SHA-256 of its bundled simulation. All 55 completed combinations are required before calling the final validation complete.

The scenario schedule interleaves map, difficulty and fall rules early, then covers every setting once per 72 trial blocks. Seeded slot swaps are correlated observations, which is why confidence intervals use blocks rather than pretending every swapped round is independent. A thousand rounds reduces sampling noise; it does not guarantee a normalized distribution or equal player skill.
