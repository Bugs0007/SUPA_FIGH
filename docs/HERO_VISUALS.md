# Hero designs and transformed abilities

The heroes keep the game's small pixel-art scale, with signature costume details and distinct silhouettes. Naruto's clone mechanics and Goku's teleport hit remain unchanged. Luffy's super now grows exponentially with each Gear, and Goku's super is a Spirit Bomb.

## Designs

- **Naruto:** black-and-orange Shippuden jacket, forehead protector, blue eyes, cheek whiskers, full trousers and ninja sandals. The four-tail form has a crimson beast face; the six-tail form adds pale skeletal markings. The golden Kurama cloak has a magatama collar, abdomen seal and split coat hem.
- **Luffy:** straw hat with red band, open red vest, chest scar, blue cuffed shorts, sash and sandals. Gear Fourth has a broader bare torso and black/red Haki forearms. Gear Fifth removes the hat from his white hair and uses red eyes, curled brows, a grin and a purple sash.
- **Goku:** orange gi, blue undershirt, tied sash, chest insignia, wristbands and boot accents. SSJ2 has a sharper crown; SSJ3 has a mane reaching down his back and no eyebrow; Blue has cyan hair and eyes.

## Ability choreography

| Hero | Base | Form 1 | Form 2 | Form 3 | Form 4 |
| --- | --- | --- | --- | --- | --- |
| Naruto Rasengan | Original solo Rasengan; no visual clone assistants | Two brief clone assistants and one curved chakra tail shape the sphere | Four crimson chakra tails shape a red sphere | Six dark tails with skeletal highlights shape the sphere | Two golden chakra arms cup a golden Rasengan |
| Luffy stretching moves | Tapered rubber arms and clenched fists | Pink Jet punches with directional speed strokes | Large Elephant fists with knuckles and curled thumbs | Black/red Haki fists and coated forearms | A continuous cartoon S-curve; the super uses a massive Haki fist |
| Goku Kamehameha | Blue charge and white-core beam | Golden beam sparks | Electrical arcs over the beam | Denser golden electrical arcs | Cyan lightning and blue beam light |

Naruto's first-form super now has spinning Rasenshuriken blades; later forms retain dark Bijudama cores, and Kurama adds golden supporting arms. Feral forms charge at the muzzle. Clone summoning and Instant Transmission use the current form's look and colors; teleport afterimages retain the look at departure. Fired chakra projectiles retain their launch form when the owner loses power.

Rasengan's first-powered-form assistants are pooled visual echoes, not extra simulation fighters: they cannot deal damage, block movement or change the roster. There are no assistants in the base form. The separately summoned Shadow Clones remain real fighters and spawn immediately when the cast triggers; the smoke animation does not delay their appearance.

Orbiting aura particles, circling flight particles, orbiting charge sparks and the Gear Fifth cloud-ball orbit have been removed. Rising steam, straight-moving sparks, chakra tails and brief impact/shockwave effects remain.

Luffy's Pistol, grapple and supers share one continuous, shaded arm path and an angular clenched-hand silhouette. The arm tapers from the shoulder to the wrist instead of becoming a thick rectangular tube. Gatling staggers extension and retraction on the actual attack clock, with translucent returning punches. Body poses anticipate, drive forward and settle during recovery. The transformation costumes, grapple behavior, hitboxes, damage, cooldowns and exponential super reach/size are unchanged.

Kurama's chakra arms are solid gold with dark contours, pale highlights, palms and fingers. They render above the fighter and below the chakra orb. Powered Rasengan retains fading arms during its existing hit recovery; the original solo base-form Rasengan keeps its previous recovery behavior. Kurama's bomb has supporting arms during charge and a brief forward push after launch. These effects read real match state; the visual renderer never changes fighters. The bomb charge-state initialization fix also remains required so charge art is visible in live play.

## Revised supers

- **Luffy:** fist radii by Gear are **5, 10, 20, 40 px**; maximum stretch ranges are **150, 240, 384, 614 px**. The animation, hit radius, reach and bot attack choice all use the same resolved values. Grapple and Gatling mechanics are unchanged.
- **Goku:** **Spirit Bomb (Genki-dama)** replaces the super beam. It gathers overhead for **0.95 s**, is pushed forward, then launches as a blue-white explosive ball. Form radii are **18, 24, 30, 36 px**, with a **520 px** travel range and increasing blast radius. It keeps the super cooldown and cancels if Goku loses his transformation during the charge. The ordinary Kamehameha and teleport hit retain their existing mechanics.

These are game adaptations of the existing move set. In particular, the one-tail tail-and-clone combination follows the requested choreography; the four- and six-tail Rasengan variants preserve the game's shared Rasengan ability rather than replacing it with a different combat move.

## Animated local review

Open `/?scene=art&page=moves&hero=naruto` (or `luffy`, `goku`). Five cards compare the base and all four forms. **1/2/3** select base, second and super abilities; **N/L/G** switch heroes; **0** restarts the preview. The preview uses the match renderer, with attack reach compressed to fit its cards. Super cards zoom out as needed to keep the growing fists and Spirit Bombs visible; Luffy's actual range and fist radius are printed below each Gear. `/?scene=art&page=heroes` shows the costume lineup.

Design references: [Naruto's official character retrospective](https://naruto-official.com/en/news/01_1611), [official Gear Fourth design announcement](https://one-piece.com/news/o20160114_3203/index.html), [Bandai Namco's Luffy form and technique showcase](https://opbr-en.bn-ent.net/character/detail/0001.html), [official SSJ3 Goku reference](https://en.dragon-ball-official.com/news/01_4396.html), and [official explanation of Genki-dama / Spirit Bomb](https://en.dragon-ball-official.com/news/01_362.html).
