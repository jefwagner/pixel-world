# PixelWorld — Roadmap

Two tracks: the **POC** (a static GitHub Pages page proving the pixel-perfect
claim and looking good) and the **MVP** (the world-builder, staged on top of
the POC's runtime). Each POC phase is independently shippable.

## POC — static GitHub Pages

Goal: a self-contained Three.js (or raw WebGL) page, no backend, that proves
pixel-perfect terrain is real in all 8 views and looks good. The POC matures
into the runtime artifact of the MVP.

### Phase 0 — Parameter search (no rendering) ✅ done
Write the enumerator (`param_search.py`, Diophantine search over Pythagorean
triples + diagonal integers). Output: one chosen parameter set (L, H, θ₀, θ₄₅,
p, q, r, sx₄₅, sy₄₅, per-view ortho frustums). This is the "source of truth"
every later phase consumes.

**Result:** recommended (5,12,13) with L=H=13 — 13³ cube blocks, θ≈22.6°,
0.21° angle mismatch, 0.15% sy / 2.09% sx stretch. Alternatives documented in
`pixel-math.md`. Ship the parameter table on the demo page so it's
self-documenting.

### Phase 1 — Cardinal-only scene
Three.js orthographic camera at the 4 cardinal presets. A flat ground plane
with a procedurally generated checker/grid texture (drawn pre-foreshortened to
`L × L·sinθ₀`) and a couple of wall quads. `magFilter = NearestFilter`,
`generateMipmaps = false`.

**Success criterion:** screenshot at integer DPR, zoom in — texels map 1:1 with
no blur. Procedural grid textures make misalignment jump out immediately; this
is the visual proof harness. If it's blurry or seamed, the parameter set or
the nearest-neighbor setup is wrong — fix before proceeding.

### Phase 2 — Diagonal views, pre-distorted textures  (the real proof)
Add the 4 diagonal presets with their own ortho frustums (non-uniform: sx₄₅,
sy₄₅) and θ₄₅. Add a **second** set of ground (diamond) and wall
(parallelogram) textures — also procedural, so the diamond edges and slant
seams are exactly computable.

This is the riskiest phase; success here is the real proof of concept. Watch
for:
- Diamond ground tiles seaming at edges (classic iso authoring problem —
  procedural makes it tractable to debug).
- Wall corners where two parallelograms meet (depth-buffer handles occlusion,
  but pre-sheared textures at corners can show artifacts; may need a corner-cap
  texture or 3D corner geometry).
- Sub-pixel drift at diamond edges from affine UV interpolation — if present,
  add a texel-grid snapping fragment shader (snaps `gl_FragCoord` to the texel
  grid). Don't build it speculatively; add only if Phase 2 looks soft.

### Phase 3 — 8-direction switching
Key/click to cycle directions; tween camera position + ortho frustum over
~150ms (easing). During tween the view is intentionally non-pixel-perfect —
confirm it reads as motion, not breakage. This validates the "transition hides
the mismatch" assumption.

Two transition flavors (the charm lever):
- Within-cardinal (N→E): continuous-orbit feel, smooth yaw.
- Cardinal↔diagonal (N→NE): "mode change" feel, tiny ease-out hold at
  destination, leaning into the tilt change.

If a 0.2° tilt jump looks bad (it shouldn't, but sanity-check), revisit the
parameter search for a closer match (accepting bigger textures).

### Phase 4 — Billboarded character + polish
Add a sprite character with 8-direction billboards sized to match world scale
(texel→screen 1:1 at the active ortho scale; 8-direction pick by relative yaw
to the active camera preset). Add a minimal UI: direction buttons, parameter
readout, "show pixel grid" debug toggle, drag-and-drop a PNG to swap a texture
(proves the import/convention path with zero backend — see `art-tooling.md`
§6).

Write up the math on the page itself (it's a nice public artifact): the two
impossibility results, the parameter table, the chosen set, and a link to
`param_search.py`.

**Deploy:** `git push` to a `gh-pages` branch or `/docs` folder with a static
`index.html` + bundled JS. No server; Three.js from a CDN or vendored.

## MVP — the world-builder (staged on top of the POC runtime)

The POC's runtime becomes the `renderer` package; the MVP adds the builder.
Phases roughly:

### MVP 1 — Voxel world + character controller
Generalize the POC's hardcoded scene into a `WorldBundleLoader` (reads
`world.json` + atlases + `meta.json`). Implement the voxel-grid data model
(sparse block placements), AABB-vs-voxel collision, and a walkable character
with 8-direction billboard sprites. This is "walk around a blocky world in 8
views" — the first thing that feels like a product.

### MVP 2 — Atlas convention + import
Implement `ATLAS_SPEC.md` and an `AtlasImporter` that validates a PNG against
the convention. Add drag-drop import to the builder. Ship a sample world with
a handful of fully-skinned block types (grass, stone, water, sand, wood wall)
in both view-styles so the convention is demonstrated, not just documented.

### MVP 3 — Hot-reload + preview panes (the editor-is-the-product phase)
File mtime polling → texture re-upload → live scene update. The three preview
modes (isolated 1:1, in-context 8-view, tiling check) and guide overlays. This
is where the world-builder becomes usable for real art iteration; until this
lands, the two-art-style burden is too painful.

### MVP 4 — Block placement UI
Click/drag to place and remove blocks; a block-type palette; object/character
placement. Save back to `world.json` (the bundle is the save format). This is
"build a world" end-to-end.

### MVP 5 — Export + deploy
`BundleExporter` writes a clean `world/` folder. One-click "publish to GitHub
Pages" — since the runtime is a pure static consumer, publishing is just
copying the runtime + the world folder into a static site and pushing. No
backend ever.

### Post-MVP (not scoped here)
Props (arbitrary low-poly meshes on top of the voxel grid), multi-tile blocks
(2×2 trees, 3×3 buildings), animation (walk cycles), lighting (global tint per
view → eventually dynamic), palette-swap tint system, larger worlds / chunked
loading.

## Risk-driven spikes (do early, out-of-band)

- **Texel-grid snap shader** (during Phase 2): confirm whether plain
  nearest-neighbor is enough or whether the snap shader is mandatory. Don't
  build it speculatively.
- **Z-fighting at diagonal seams** (during Phase 2): wall–ground and
  wall–wall in diagonal view with pre-sheared textures. May need a small depth
  bias or corner geometry.
- **Minification strategy** (before Phase 4): nearest filter aliases badly
  when the canvas is smaller than the world. Decide between fixed integer DPR
  + CSS-scale, or accepting nearest-aliasing as aesthetic.
- **Diamond-ground tiling** (during Phase 2): verify procedural diamond
  textures seam cleanly when repeated. This is the classic iso authoring pain
  point; if it's hard even procedurally, hand-authored art will be harder, and
  the art-tooling preview modes become more critical.
