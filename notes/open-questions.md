# Open Questions

The preceding chapters establish a coherent rendering pipeline for pixel-perfect 3D tiles across multiple views. But coherence doesn't mean completeness. Here are questions that remain open — tensions between the techniques described here and the broader goals of a game engine.

## Lighting

The rendering pipeline described in Chapter 2 is a standard 3D pipeline with one modification (the UV-to-texel transform in step 6a). This means it inherits all the capabilities of a 3D pipeline, including dynamic lighting. Lights could cast shadows, change color with time of day, or react to player movement.

But the textures in this system are hand-authored pixel art. Every texel is intentionally placed, and lighting is typically baked into the sprite — a sunlit wall is painted with bright colors on the top edge and darker colors at the bottom. Dynamic lighting on top of that can fight the artist's intent.

This tension doesn't have a clean answer. Options include:

- **No dynamic lighting** — all lighting is baked into the pre-distorted textures. The 3D pipeline handles only the projection and texture sampling. This is faithful to pixel art tradition but gives up one of the main advantages of a 3D pipeline.
- **Dynamic lighting on a separate layer** — render the baked textures first, then apply a lighting pass that interacts with them (e.g., multiply blends for shadows, additive for glows). This preserves the hand-authored feel while allowing some environmental lighting.
- **Lighting-aware authoring tools** — the artist paints ambient-lit textures, and the engine adds a directional light pass. The authoring tool previews how the light will interact so the artist can compensate.
- **Lighting only for objects/characters** — terrain uses baked lighting (pre-distorted tiles with painted light), while characters get dynamic lighting from the 3D pipeline. This matches the two-class distinction from the introduction.

Which approach works best depends on the specific game and art style. The pipeline described in these chapters is compatible with any of them — the extra UV transform doesn't affect lighting calculations.

## Character sprite interpolation during view transitions

Chapter 4 describes texture crossfades for terrain tiles during Fez-style transitions. Characters and objects (the first rendering class) would need similar treatment during transitions, but their sprites are billboards, not pre-distorted tiles. A character sprite viewed from the north looks different from one viewed from the northeast — the artist paints each direction separately.

During a 45° rotation, the character would need to crossfade between two direction-specific sprites while the billboard itself rotates. The timing of this crossfade relative to the terrain blend is an open question. Should the character snap to the new view halfway through, or blend smoothly across the whole transition? The answer is aesthetic, not mathematical.

## Buffer size flexibility

The 320×240 buffer was chosen for a tile size of 14×7 / 20×10. A different game might use different tile dimensions (the table in Chapter 1 shows many viable options), which would imply a different buffer size. The pipeline is generic — the buffer size, tile dimensions, and transform formulas are parameters — but the specific integer scaling pathways change.

For an engine that supports multiple world manifests, the buffer size should be read from the manifest rather than hardcoded. This is an implementation detail rather than a design question, but it affects the authoring pipeline.