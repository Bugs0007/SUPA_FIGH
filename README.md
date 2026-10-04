# Scrapyard Riot

A chaotic pixel-art party brawler for the browser. You can have up to 10 fighters: up to 4 local humans on
keyboards or gamepads, and the rest are bots. Fight on platform maps with guns, melee weapons, explosives,
gadgets and physics props. Rounds are short and restarts are instant, so there's never any waiting around.

All art, sound and music are generated procedurally when the game starts. There are no asset files.

## Playing

Open the game. The main menu has a card for each keyboard player and a quick-match panel:
- **Name:** press Enter on NAME and type (up to 8 characters). Names show above heads, in the HUD and in the kill feed.
- **Fighter:** pick SCRAPPER (customize the look in Match Setup) or an anime hero: **Goku**, **Naruto** or **Luffy**.
  The card shows an animated preview of the fighter's signature move.
- **Map** (or RANDOM), **Players** (1 or 2 on the keyboard), **Bots** (0–8) and **Bot skill**. The selected map's
  backdrop and minimap show up right in the menu.
- **Quick Match** starts with those settings (0–8 and Tab still work as shortcuts).
- **Match Setup** opens the lobby. There you set the players, teams, map, mode, rounds and chaos cards.
- **Controls** lets you rebind every action for both keyboard layouts and up to 4 gamepads.
- **Settings** covers volumes, screen shake, gore, damage numbers, replays, fullscreen and UP / W JUMPS.

On a gamepad, press START in the lobby to join.

### Default controls
| Action | P1 | P2 (numpad) | P2 (laptop) | Gamepad |
|---|---|---|---|---|
| Move / aim | W A S D | Arrows | Arrows | Left stick / D-pad |
| Jump | **W** / G / Space | **Up** / Num5 | **Up** / K | A |
| Drop through a platform | **S S** (double tap) | **Down Down** | **Down Down** | Down Down |
| Attack (hold = aim) | F | Num4 | L | X / RT |
| Kick | H | Num6 | J | B |
| Interact (pick up / grab / throw) | T | Num8 | O | Y |
| Cycle weapon | R | Num7 | I | RB |
| Use gadget | V | Num9 | U | LB |
| Hero ability | B | Num1 | P | LT |

Pause with Esc or Start (P too, if nobody has it bound).

**W / Up is a full jump button:** ground jump, double jump, wall jump, and a short tap is a short hop. Up still
climbs ladders, climbs ledges and sweeps your aim while you hold Attack (it never jumps then). You can turn
this off in Settings (then only the Jump key jumps).

**Guns:** hold Attack to aim (Up and Down sweep the angle), or tap it for a hip shot.

**Movement:**
- Run, then press Down to roll.
- Jump again in the air to double jump.
- Jump off walls to wall jump.
- Double-tap a direction to sprint.
- Double-tap Down to drop through a platform (a long crouch never drops you).

**Interact:** grab an enemy, then press Attack to throw them.

### Anime heroes
Pick **Goku**, **Naruto** or **Luffy** on the main menu (or in the lobby's fighter creator). Every hero has a
signature move on the **Ability** button from the start:

| Hero | Base ability | Rare power-up | Transformation + powered ability |
|---|---|---|---|
| Goku | **Levitation:** take off with Ability (or jump again when you're out of air jumps) and fly freely in all 4 directions; a ki meter drains while flying and refills on the ground; getting hit knocks you out of the sky | Energy core | Super Saiyan: heavy hits, unlimited flight, Ability = ki blast (tap = small, hold = charged) |
| Naruto | **Rasengan:** a spinning orb forms in his palm, then a gravity-free dash; the first fighter touched is blasted away (works in the air, crosses gaps) | Chakra scroll | Kurama Mode: shadow-clone combo, Ability = chakra bomb |
| Luffy | **Gum-Gum Pistol:** a stretch punch (hold Up/Down to angle it); if the fist hits a wall, he rockets to it (Gum-Gum Rocket) | Straw hat token | Gear Second: stretchy combo, Ability = rubber bullet |

Anyone can grab any power-up for a smaller boost. Three maps fit them: Hidden Leaf Forest, Grand Line Ship, and
Alien Energy Planet. Quick match link: `?heroes=naruto,luffy,goku`.

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
