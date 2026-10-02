# SCRAPYARD RIOT — design summary

**Pitch:** a chaotic, cinematic, funny pixel-art party brawler. Up to 10 fighters (4 local humans +
bots) scrap it out on platform maps with guns, melee weapons, explosives, gadgets and physics props.
Short rounds (1–3 min), instant restarts, zero dead time. Every round should produce a
"did you see that?!" moment.

## Pillars
1. **Readable chaos** — tiny sprites with dark outlines, big hit feedback, clear kill credit.
2. **Everything is a weapon** — props, chandeliers, barrels, the map itself, the throw of a friend.
3. **No dead time** — instant respawn of rounds, ghosts for the dead, skippable everything.
4. **Fair bots** — bots press the same virtual buttons (Intent) as humans.

## Core loop
Spawn with fists → scavenge weapons (limited ammo, empty guns get tossed) → fight → last
fighter/team standing wins the round → slow-mo final kill + instant replay → next round.

## Controls (defaults, all rebindable)
| Action | P1 | P2 (numpad) | P2 (laptop fallback) | Gamepad |
|---|---|---|---|---|
| Move / aim | W A S D | Arrows | Arrows | Left stick / D-pad |
| Jump | G / Space (or W) | Num5 (or Up) | K (or Up) | A |
| Attack (hold = aim) | F | Num4 | L | X / RT |
| Kick | H | Num6 | J | B |
| Interact (pick up / grab / throw) | T | Num8 | O | Y |
| Cycle weapon | R | Num7 | I | RB |
| Use gadget (medkit) | V | Num9 | U | LB |
| Ability (hero special) | B | Num1 | P | LT |

- **Guns:** hold Attack to aim (Up/Down sweeps the angle). Automatic weapons fire while held;
  semi-automatic weapons fire when you let go. Tap = instant hip shot.
- **Melee:** Attack = 3-hit combo (jab, cross, haymaker). Kick = knockback. Air kick = flying kick.
- **Movement:** Down while running = roll (i-frames). Down in the air while moving = dive.
  Jump again in the air = double jump. Jump while touching a wall in the air = wall jump (not twice off
  the same wall before landing); holding into a wall while falling = wall slide. Double-tap a direction = sprint.
  Down + Jump = drop through a platform. Up at a ladder = climb. Walk into a ledge while falling = grab.
- **Interact:** pick up / swap a weapon, grab an enemy (then Attack to throw them), pick up props.

## Fighter
100 HP, bar over head. Status: burning (DoT, roll to extinguish), stun. Inventory slots:
melee, sidearm, heavy, throwable, gadget. Walking over a weapon with an empty slot auto-picks it
up. Death = tumbling ragdoll, all weapons drop.

## Weapons (stats in `src/sim/data/weapons.ts`)
Melee: knife, bat, pipe, machete, katana, sledgehammer, chair (breaks). Sidearms: pistol, revolver,
flare gun. Heavy: SMG, shotgun, assault rifle, sniper (laser), rocket launcher, flamethrower,
minigun (slows you). Throwables: frag, molotov, sticky bomb, smoke. Gadgets: grapple, jetpack,
riot shield, prox mine, remote C4, teleport pads. Powerups: medkit, speed, strength, Bullet Time.
Bullets have tracers, ricochet off metal, pass through glass (breaking it) and thin wood.

## Modes
Brawl (rounds, last standing), Deathmatch (timed, respawns), King of the Hill, Juggernaut,
Gun Game, Co-op Survival (waves, boss every 5, shared lives, revives).

## Spice
Cinematic slow-mo + hit-stop, instant replay of the round-ending kill, ghost mode (poltergeist
every 8 s), chaos modifier card flips, parachute supply drops, bounty crown, environmental kill
announcer ("CHANDELIER'D"), funny post-match awards, fighter creator, smart shared camera with
off-screen arrows.

## Maps (each has a gimmick)
Test Arena · Neon Rooftops (heli supply drops) · Night Train (moving roofs + tunnels) · Factory
(conveyors, crusher, crane hook) · Construction Site (swinging girders, collapsing scaffold) ·
Casino (chandeliers, elevator) · Harbor Docks (containers, deadly water) · Office Tower
(shatterable windows, server-room fire) · Secret Lab (laser grids, low-grav switch) · Abandoned
Mine (minecarts, TNT).

## Anime heroes (M9 expansion)
Pick **Naruto**, **Luffy** or **Goku** instead of a scrapyard fighter (creator HERO row / lobby). They are
the same tiny pixel fighters (same hitbox, same moves, stats within ~5%) until they find their **power-up**,
a rare pickup that can appear on any map (one at a time; the anime maps favor their own):

| Hero | Power-up | Transformation | ABILITY special |
|---|---|---|---|
| Naruto | Chakra scroll | Kurama Mode: crimson aura, faster, harder hits; combo hit 3 brings two shadow clones | Chakra bomb: big explosive orb |
| Luffy | Straw hat token | Gear Second: steam, pink skin, quick stretchy punches and kicks with extra reach | Rubber bullet: the arm stretches across the room |
| Goku | Energy core | Super Saiyan: yellow hair, heavy hits with hit-stop, stronger kick | Ki blast: tap = small, hold = charged big blast |

Anyone can grab any power-up: the matching hero transforms fully (18–20 s); everyone else gets a short
generic boost. Weapons keep working while powered. Maps: **Hidden Leaf Forest** (giant trees, village,
canopy), **Grand Line Ship** (decks, hold, mast, cannons, waves), **Alien Energy Planet** (low-gravity
fields, floating rocks, energy fissures).

