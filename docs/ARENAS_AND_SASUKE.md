# Arena and Sasuke update

All changes are local. No generated artwork or downloaded anime assets are required.

## Arenas and menus

All 13 existing arenas have an additional scenery layer, theme lighting, and material trims. The new layer follows the map's dimensions and platform positions. It does not change collision or the old layouts.

Three new maps bring the collection to 16:

| Arena | Routes and mechanics |
| --- | --- |
| Waterfall Valley (`valley`) | Broad shrine bridges, lower terraces, three ladder routes, and a lift that travels up and across the central falls. |
| Sky Citadel (`citadel`) | Separated floating ledges, an elevator, a swinging platform, and a visibly marked central low-gravity region. |
| Neon Crossing (`neon`) | Additional rooftop shortcuts, inward conveyors, a travelling girder, supply drops, and a central laser with a one-second warning. |

Each supports ten fighter spawns. Map navigation, pickups, safe spawns, and bot matches are covered by the existing map tests.

The main menu gives the arena a large preview and puts the two fighter cards alongside it. Click either half of the preview to browse backward or forward. Keyboard and gamepad navigation retain their existing focus order. Match Setup also uses a textured preview. These renders share the live game's background, tiles, scenery, decor, and prop sprites; the entire map is fitted into view. They show the arena's starting state, rather than a live match.

## Sasuke

Select Sasuke after Goku on the main menu or in the fighter creator. Online fighter selection and bot rosters use the same hero registry.

| Action | Move |
| --- | --- |
| Ability 1 (default P1 **B**) | **Chidori**: blue lightning in every form, with synthesized electric bird chirps; two charges, each restored in 2.8 seconds. Hold to extend the dash up to 0.85 seconds. The victim is **stunned for 2 seconds** (held in place, not knocked down) and the shock **arcs to the nearest other enemies around them**, who are stunned too: 1 extra enemy within 40 px in the base form, +1 enemy and +14 px for every form up to 5 enemies within 96 px. They take half the damage. |
| Ability 2 (default P1 **H**) | **Fire Style: Fireball** in base / Sharingan / Curse Mark: a big fireball (radius 9 px in the base form, 11.4 and 13.8 in the next two) that burns whoever it hits, sets everyone in its blast alight, scatters burning patches and lights wooden tiles and crates. **Amaterasu** from Mangekyo onward: black flames appear directly on up to **3 visible enemies** (4 in the top form) within 240 pixels (290 in the top form). Aim up, or down while airborne. 3.8-second cooldown. |
| Both ability buttons, transformed | **Chidori Sharp Spear → Onyx Chidori Spear → Susanoo Arrow → Indra's Arrow**. Explosive projectiles, stronger and larger in each form. 9-second cooldown. They **lock onto the enemy you are facing** when the move starts (see below); hold Up / Down to aim by hand instead. |

Power orbs progress through **Sharingan → Curse Mark → Mangekyo Sharingan → Rinnegan / Perfect Susanoo**. The final form can fly by holding Up. The last two supers summon an armored spectral archer, with a horned mask, articulated hands, shoulder plates, layered chest armor and a drawn bow. The final version gains segmented feathered wings. Its released arrow starts at the avatar's bow.

Amaterasu chooses the nearest opponents in the aimed direction **at the end** of its 0.36-second eye-cast: as many as the form allows (3, then 4), within its range (240 px, then 290). Solid tiles block it, allies are excluded, and roll invulnerability can avoid it. Each victim takes 8 initial damage before form multipliers and 3 seconds of black flames at 6 DPS, and black fire patches are left on the ground under them: they ignite wooden tiles beside them, burn crates and set anyone who steps in alight. It creates no travelling projectile and does not spread by contact. The existing rolling / water burn rules still apply. All these numbers live in `HEROES.sasuke.second.amaterasu`.

**Ultimate lock-on** (Sasuke, Goku and Naruto): when an ultimate starts it locks onto the nearest enemy in front of the fighter (within the ultimate's range, inside a cone of about 55 degrees around the facing direction, in clear view; allies and your own clones are never chosen). A red-and-white bracket marks the chosen enemy during the wind-up, and the shot is aimed from the bow / mouth / hand at where that enemy will be when it arrives (leading their movement), so it no longer flies over or under them. Holding Up or Down when the ultimate starts still aims by hand; with nobody to lock onto it flies straight.

## Ultimate protection and transformed combos

Every hero is invulnerable from ultimate activation through its charge, release and recovery animation. Damage, knockback, burning, grabs and environmental deaths cannot interrupt the move. Protection is derived from the active state rather than a timer, so it ends immediately when the animation finishes. Projectile travel does not prolong protection. Ordinary abilities, including Kamehameha, retain their existing vulnerability.

Naruto's final ultimate summons a golden nine-tailed Kurama avatar with a side-facing fox head, whisker markings, teeth, paws and a mouth-charged Bijudama. The actual projectile launches from the painted mouth. The full avatar appears only for the ultimate.

Combo choreography follows the existing four-hit timeline and hitboxes:

- Luffy's reach grows in every gear (extra reach 4 / 8 / 12 / 16 pixels), with inflated fists, Haki and elastic curves.
- Sasuke's last two forms punch with articulated Susanoo arms, with extra reach of 14 / 22 pixels.
- Naruto's early cloaks get chakra claws; Kurama Mode uses gold chakra fists with 18 extra pixels of reach.
- Goku's forms use ki-coated punches, staggered fist afterimages and electrical streaks, with extra reach 3 / 5 / 8 / 12 pixels. These echoes do not apply extra hits.

Press **4** in the move gallery (or add `&move=combo`) to compare all five forms using the live match renderer.

Sasuke has an open grey collar, purple rope sash, dark trousers, arm guards, Kusanagi scabbard, swept black hair, and form-specific eyes / curse markings. His hitbox remains the standard fighter hitbox. Chidori shares the tested dash state machine, while its visuals and kill credit are distinct from Rasengan. Naruto's clone mechanics and Goku's teleport remain unchanged.

## Adjusting the design

- All Sasuke combat numbers, names and form multipliers: `src/sim/data/heroes.ts`, under `HEROES.sasuke`.
- Costume and form palettes: `src/art/heroArt.ts`, under `HERO_ART.sasuke`.
- Lightning, fireball and Susanoo choreography: `src/render/SasukeAbilityArt.ts`.
- Susanoo, Kurama and the spectral / chakra arms are pixel-art sprites built with `src/art/pixelRaster.ts` (a 1-pixel-grid rasterizer: flat tones, outline, plate rims) in `src/art/avatarSprites.ts`; `src/render/AvatarArt.ts` paints them and `src/render/HeroComboArt.ts` throws the transformed punches with them. Preview them big with `npx vite-node scripts/spriteSheet.ts out.png susanoo|kurama|arms`.
- Chidori's stun, spread and the fireball / Amaterasu numbers: `HEROES.sasuke.base.dash` (`stun`, `spread`) and `HEROES.sasuke.second` (`fireball`, `amaterasu`).
- Chidori sound layers: `src/audio/sounds.ts`, `chidori` and `chidoriDash`.
- New arena routes and gimmicks: `src/sim/map/maps/expansion.ts`.
- Arena architecture / landmarks: `src/art/arenaArt.ts`; full previews: `src/art/mapPreview.ts`.

Local review links while Vite runs on port 5180:

- Menu: `http://127.0.0.1:5180/`
- Sasuke abilities and forms: `http://127.0.0.1:5180/?scene=art&page=moves&hero=sasuke`
- Sasuke in Waterfall Valley: `http://127.0.0.1:5180/?scene=match&map=valley&humans=1&bots=3&heroes=sasuke,naruto,luffy,goku`

Design references consulted: [official Sasuke / Susanoo imagery](https://naruto-official.com/en/news/01_1490), [Tsume's licensed Susanoo sculpture](https://www.tsume-art.com/en/shop/sasuke-uchiha-summon-of-susanoo-1135), and the [official Chidori entry](https://naruto-official.com/en/news/01_1715). The game art and sound remain authored in code; these references are not imported assets.
