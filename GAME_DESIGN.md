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
| Jump (Up is the jump button) | W | Up | Up | A |
| Drop through | S S (double tap) | Down Down | Down Down | Down Down |
| Attack (hold = aim) | F | Num4 | L | X / RT |
| Kick | H | Num6 | J | B |
| Interact (pick up / grab / throw) | T | Num8 | O | Y |
| Cycle weapon | R | Num7 | I | RB |
| Use gadget (medkit) | V | Num9 | U | LB |
| Hero ability | B | Num1 | P | LT |

- **Guns:** hold Attack to aim (Up/Down sweeps the angle). Automatic weapons fire while held;
  semi-automatic weapons fire when you let go. Tap = instant hip shot.
- **Melee:** Attack = 3-hit combo (jab, cross, haymaker). Kick = knockback. Air kick = flying kick.
- **Movement:** Down while running = roll (i-frames). Down in the air while moving = dive.
  Jump again in the air = double jump. Jump while touching a wall in the air = wall jump (not twice off
  the same wall before landing); holding into a wall while falling = wall slide. Double-tap a direction = sprint.
  Double-tap Down = drop through a platform. Up at a ladder = climb. Walk into a ledge while falling = grab.
  Keyboard: Up is a full jump button unless it means something else (ladder, aim, ledge, flying).
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

## Anime heroes (M9, reworked in M11)
Pick **Naruto**, **Luffy** or **Goku** instead of a scrapyard fighter. They are the same tiny pixel fighters (same
hitbox, stats within ~5%) with a combo of punch, punch, punch, kick, **ability 1** (ABILITY key), **ability 2** (the kick
key) and, once transformed, a **super** (both keys, within 0.1 s of each other).

| Hero | Ability 1 | Ability 2 | Super (per form) | Forms |
|---|---|---|---|---|
| Goku | Levitation | Kamehameha (charge) | Super / Dragon Fist / God Kamehameha | SSJ, SSJ2, SSJ3, SSBlue |
| Naruto | Rasengan | Shadow clone rush | Rasenshuriken / Tailed Beast Bomb / Kurama Bijudama | crimson aura tail, 4 tails, 6 tails (black), Kurama (gold, no tails); fox stance in forms 1-3 |
| Luffy | Gum-Gum Pistol (+ rocket) | Gum-Gum Gatling | Jet Pistol / Elephant / King Kong / Bajrang Gun | Gear 2, 3, 4, 5 |

The only pickup is the **power orb** (rare, a couple at a time): each orb eaten raises a hero one form and adds a layer
of form health (30 HP) above the normal health bar. Forms have no timer: damage drains the form layers first and the form
ends when they are gone (D61). Final forms of Naruto and Luffy fly while Up is held. Scrapyard fighters get a 12 s boost.

