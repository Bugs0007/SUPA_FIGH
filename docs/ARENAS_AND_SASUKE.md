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
| Ability 1 (default P1 **B**) | **Chidori**: blue lightning in every form, with synthesized electric bird chirps; two charges, each restored in 2.8 seconds. Hold to extend the dash up to 0.85 seconds. |
| Ability 2 (default P1 **H**) | **Fire Style: Fireball** in base / Sharingan / Curse Mark. **Amaterasu** from Mangekyo onward: black flames appear directly on a visible enemy within 240 pixels. Aim up, or down while airborne. 3.8-second cooldown. |
| Both ability buttons, transformed | **Chidori Sharp Spear → Onyx Chidori Spear → Susanoo Arrow → Indra's Arrow**. Aimable explosive projectiles, stronger and larger in each form. 9-second cooldown. |

Power orbs progress through **Sharingan → Curse Mark → Mangekyo Sharingan → Rinnegan / Perfect Susanoo**. The final form can fly by holding Up. The last two supers summon an armored spectral archer, with a horned mask, articulated hands, shoulder plates, layered chest armor and a drawn bow. The final version gains segmented feathered wings. Its released arrow starts at the avatar's bow.

Amaterasu chooses the nearest opponent in the aimed direction **at the end** of its 0.36-second eye-cast. Solid tiles block it, allies are excluded, and roll invulnerability can avoid it. Starting values: 240-pixel range (15 tiles), 8 initial damage before form multipliers, 3 seconds of black flames at 6 DPS. It creates no travelling projectile and does not spread by contact. The existing rolling / water burn rules still apply. All these numbers live in `HEROES.sasuke.second.amaterasu`.

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
- Detailed Susanoo / Kurama anatomy: `src/render/AvatarArt.ts`; transformed punches: `src/render/HeroComboArt.ts`.
- Chidori sound layers: `src/audio/sounds.ts`, `chidori` and `chidoriDash`.
- New arena routes and gimmicks: `src/sim/map/maps/expansion.ts`.
- Arena architecture / landmarks: `src/art/arenaArt.ts`; full previews: `src/art/mapPreview.ts`.

Local review links while Vite runs on port 5180:

- Menu: `http://127.0.0.1:5180/`
- Sasuke abilities and forms: `http://127.0.0.1:5180/?scene=art&page=moves&hero=sasuke`
- Sasuke in Waterfall Valley: `http://127.0.0.1:5180/?scene=match&map=valley&humans=1&bots=3&heroes=sasuke,naruto,luffy,goku`

Design references consulted: [official Sasuke / Susanoo imagery](https://naruto-official.com/en/news/01_1490), [Tsume's licensed Susanoo sculpture](https://www.tsume-art.com/en/shop/sasuke-uchiha-summon-of-susanoo-1135), and the [official Chidori entry](https://naruto-official.com/en/news/01_1715). The game art and sound remain authored in code; these references are not imported assets.
