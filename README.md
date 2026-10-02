# Scrapyard Riot

A chaotic pixel-art party brawler for the browser. You can have up to 10 fighters: up to 4 local humans on
keyboards or gamepads, and the rest are bots. Fight on platform maps with guns, melee weapons, explosives,
gadgets and physics props. Rounds are short and restarts are instant, so there's never any waiting around.

All art, sound and music are generated procedurally when the game starts. There are no asset files.

## Playing

Open the game, then pick an option from the title menu:
- **Quick Match** jumps straight in against bots. On the title screen, 0–8 sets the bot count and Tab sets the difficulty.
- **Match Setup** opens the lobby. There you set the players, teams, map, mode, rounds and chaos cards.
- **Controls** lets you rebind every action for both keyboard layouts and up to 4 gamepads.
- **Settings** covers volumes, screen shake, gore, damage numbers, replays and fullscreen.

On a gamepad, press START in the lobby to join.

### Default controls
| Action | P1 | P2 (numpad) | P2 (laptop) | Gamepad |
|---|---|---|---|---|
| Move / aim | W A S D | Arrows | Arrows | Left stick / D-pad |
| Jump | G / Space | Num5 | K | A |
| Attack (hold = aim) | F | Num4 | L | X / RT |
| Kick | H | Num6 | J | B |
| Interact (pick up / grab / throw) | T | Num8 | O | Y |
| Cycle weapon | R | Num7 | I | RB |
| Use gadget | V | Num9 | U | LB |
| Ability | B | Num1 | P | LT |

Pause with Esc, P or Start.

**Guns:** hold Attack to aim (Up and Down sweep the angle), or tap it for a hip shot.

**Movement:**
- Run, then press Down to roll.
- Jump again in the air to double jump.
- Jump off walls to wall jump.
- Double-tap a direction to sprint.
- Press Down + Jump to drop through a platform.

**Interact:** grab an enemy, then press Attack to throw them.

### Anime heroes
In the fighter creator (lobby → HERO / LOOK) you can pick **Naruto**, **Luffy** or **Goku**. Each has a rare
power-up somewhere on the map (chakra scroll, straw hat token, energy core) that transforms them. Press
**Ability** for their special (chakra bomb, rubber bullet, ki blast; hold it to charge Goku's blast). Anyone
can grab any power-up for a smaller boost. Three maps fit them: Hidden Leaf Forest, Grand Line Ship, and
Alien Energy Planet. Quick match: `?heroes=naruto,luffy,goku`.

### Modes
- **Brawl:** rounds, last fighter standing. The dead come back as ghosts who can shove things around.
- **Deathmatch:** timed, with respawns.
- **King of the Hill:** hold the hill alone to score.
- **Juggernaut:** one 400 HP minigunner. Kill them to take over.
- **Gun Game:** climb a 12-weapon ladder. The final kill has to be made with a knife.
- **Co-op Survival:** humans against waves of bots, with shared lives and revives. There's a boss every 5 waves.

## Development
```
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (pure simulation, Node)
npm run test:e2e   # Playwright browser tests (PW_EXECUTABLE=/path/to/chrome to use an installed browser)
npm run build      # typecheck + production build into dist/
npm run sim -- 8 8 factory normal 1   # headless bot matches: kills per weapon, round lengths
npm run balance -- 2 normal 1        # bot survey across every map
```
The stack is Phaser 3, TypeScript and Vite. The game simulation (`src/sim`) is deterministic, runs at a fixed
60 Hz and never imports Phaser, so it also runs headless for tests, bot balance sims and instant replays.

To get started with the code:
- `CLAUDE.md` describes the architecture and conventions.
- `PROGRESS.md` tracks the milestones.
- `DECISIONS.md` explains the reasoning behind design choices.
- `docs/DEPLOY.md` covers hosting.

Useful URL parameters:
- `?scene=match&map=mine&bots=6&diff=hard&mode=koth&chaos=1`
- `?scene=lobby`
- `?scene=art&page=weapons` (or `&page=heroes`)
- `&speed=4`
- `&seed=N`
