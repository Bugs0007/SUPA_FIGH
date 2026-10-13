# Graphics refresh

The existing pixel-art style now has more depth, with no external image assets or changes to the gameplay simulation.

- All thirteen arena themes use painted sky gradients, atmospheric haze, richer clouds, shaded skyline architecture and textured foliage/terrain.
- Fighters, every hero form, weapons and decorations have directional highlights and cool shaded edges. Frame sizes and animation anchors are preserved.
- Platforms cast shadows into the scenery. Large solid surfaces have continuous roof lighting and shaded sides, rather than identical lighting on every tile.
- Fighters and props cast contact shadows on floors, platforms and moving surfaces. Shadows soften as characters jump, and geometry shadows rebuild after destruction.
- Fixtures and rooftop windows spill colored light. Hero powers and fire add light around the fighter; charge orbs and beams have layered luminous edges.
- Subtle drifting dust adds movement to the environments. Gravity fields have feathered edges.
- Main-menu fighter previews have illuminated pedestals; cards and HUD bars have beveled highlights and shadows.

## Local review

Run `npm run dev`, then try:

- `/?scene=match&map=rooftops&humans=0&bots=3&heroes=naruto,luffy,goku`
- `/?scene=match&map=leaf&humans=0&bots=3&heroes=naruto,luffy,goku`
- `/?scene=match&map=alien&humans=0&bots=3&heroes=naruto,luffy,goku`
- `/?scene=match&map=factory&bots=4`
- `/?scene=art&page=heroes` to inspect every hero form.

Lighting is baked into cached textures where possible. Runtime contact shadows use bounded ground queries, and power lights reuse images. No post-processing shaders or image downloads are required.
