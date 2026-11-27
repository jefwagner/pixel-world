# PixelWorld

## The basic idea

A 2D-feeling 3D game/world engine that renders through a real 3D pipeline but
looks and feels like a top-down or isometric pixel-art adventure game (old
Zeldas, CrossCode) with the "every pixel placed with intention" aesthetic. The
distinguishing feature: the camera can rotate through **8 snapped views** — 4
cardinal (N/E/S/W) and 4 diagonal (NE/SE/SW/NW) — with Fez-style quick
transitions between them.

Two classes of rendered objects:

1. **Objects / characters** — 8-direction sprites rendered on camera-facing
   billboards, mapped 1:1 (texel → screen pixel). A solved problem; the open
   question is lighting (see below).
2. **Buildings / terrain** — low-poly meshes with textures. **This is the hard
   part**, because we want pixel-perfect repeating tile textures that hold up
   across all 8 views.

## Motivation

Pixel-art tile worlds have a specific, irreplaceable look — crisp, intentional,
grid-coherent. 3D engines that try to fake it (orthographic + pixel-art
textures on arbitrary geometry) always lose the grid: texels land between
pixels, patterns seam badly, the eye reads "blurry." PixelWorld's bet is that
you can keep the pixel-perfect grid in 3D *if* you (a) snap the camera to a
finite set of views, (b) author terrain art pre-distorted per view-style, and
(c) accept a small, bounded orthographic stretch in diagonal views. The reward
is a world that has 3D depth, collision, and rotation but never loses the
hand-placed-pixel feel.

## The world-builder framing (MVP, not the POC)

PixelWorld is a **world-building engine**, not a game engine per se. The first
real release (MVP) is about *building and exploring* a world:

- Create objects by feeding in 8-direction sprites + defining hitboxes.
- Build a world by laying out blocks, Lego/Minecraft-style.
- Place objects/characters, walk around, explore.

No scripting, quests, inventory, combat, or save/load beyond the world bundle
itself. All the interesting work moves to **authoring UX**, which is where
world-builders live or die (the lesson from Tiled, LDtk, Ogmo: the editor *is*
the product).

This bifurcates the architecture into two artifacts (see `architecture.md`):

- **The runtime/viewer** — static, shareable, no backend. Pure consumer of a
  world bundle (JSON + atlas PNGs). This is what the POC matures into, and a
  perfect GitHub Pages citizen.
- **The builder/editor** — local, needs filesystem access (hot-reload, import,
  export). Produces bundles. This is where the MVP work lives, on top of the
  same rendering code.

**Architectural principle:** the no-backend constraint applies to the
*shareable artifact*, not the engine. Authoring is local; only the published
world is static. The runtime is a pure consumer of a static world bundle.

## Key results (see `pixel-math.md` for derivations + real numbers)

1. **Pixel-perfect is achievable in all 8 views.** It is not a fantasy; the
   constraints are exactly characterizable and solvable.
2. **Diagonal views require non-uniform orthographic projection** (a small
   per-axis stretch). This is *unavoidable* and *fundamental*: a 45°-yawed
   square's long diagonal is L√2 pixels — irrational — so it can never land on
   an integer pixel grid under uniform unit-scale ortho. The required stretch is
   ~0.35/L (≈1% at L=13, <0.1% at L=65). This is the original idea's "allow
   some ortho stretch," now understood as *necessary*, not just convenient.
3. **The two view-styles cannot share identical tilt angles** (a secondary
   impossibility): tan(θ₀) is rational, tan(θ₄₅) is irrational, so θ₀=θ₄₅ has
   no exact solution. But the mismatch can be driven below 0.001° at modest
   sizes — practically zero. We accept a *small* mismatch and let the
   transition hide the rest.
4. **Terrain needs two art sets per block type** — one pre-distorted for
   cardinal views (axis-aligned rectangles), one for diagonal views (diamonds
   for ground, parallelograms for walls). Pre-distortion *is* the art; it
   cannot be auto-generated from a single square texture without reintroducing
   the blur the engine exists to avoid.

## Design decision: relax the angle-match requirement

We explicitly **do not** require θ₀ and θ₄₅ to match within a few percent.
Pushback on the original "few percent" instinct:

- It's not needed for the feel. Views are snapped; transitions are quick
  (~150ms) Fez-style tweens. Players don't compare tilt angles across a 45°
  yaw swing.
- Chasing <1% mismatch forces large textures, fighting the chunky aesthetic we
  actually want.

Instead: treat angle mismatch as a **soft** objective with a generous budget
(say ≤2°), and spend the budget on small textures and clean stretch numbers.
The transition is part of the charm — moving *between* camera views rather than
orbiting along a single arc. We can even lean into two transition flavors:
cardinal↔diagonal reads as a "mode change," within-cardinal N→E reads as a
continuous orbit.

## Design decision: voxel/block terrain for the MVP

The "Lego/Minecraft-style block layout" instinct is right and we should commit
to it for the MVP: **terrain is a voxel grid**, not arbitrary low-poly meshes.

- Axis-aligned unit cubes map perfectly onto the pixel-perfect constraint —
  each face is a tile; the two art styles apply per-face with no geometry edge
  cases.
- World data model is trivial: a 3D array (or sparse set) of block IDs.
  Collision is voxel-grid + character AABB — no per-mesh collider authoring.
- The art set is **bounded and enumerable**: N block types × 2 view styles × a
  few face variants. A finite, spec-able art budget — which is what makes the
  "support artists" question tractable. Arbitrary meshes have unbounded art
  surfaces.
- It matches the mental model (laying out blocks, placing characters) and gives
  a coherent aesthetic: blocky pixel-art world you can rotate through 8 views
  (CrossCode-adjacent, diorama-adjacent).

Arbitrary meshes can come later as a Phase 2 "prop" system on top of the voxel
grid.

## Recommended parameter set (from `param_search.py`)

The honest answer is "it's a Pareto frontier; pick by aesthetic." Highlights
from the search:

| triple | L | H | θ₀ | θ₄₅ | mismatch | sx stretch | sy stretch | notes |
|---|---|---|---|---|---|---|---|---|
| (3,4,5) | 5 | 5 | 36.87° | 35.26° | 1.61° | 1.0% | 2.0% | maximally chunky; mismatch hidden by transition |
| (5,12,13) | 13 | 13 | 22.62° | 22.42° | 0.21° | 2.1% | 0.15% | **cube blocks 13³; sweet spot** |
| (8,15,17) | 17 | 85 | 28.07° | 28.05° | 0.03° | 0.17% | 2.7% | nicer 3/4 feel; tall walls |
| (7,24,25) | 25 | 100 | 16.26° | 16.26° | 0.004° | 1.0% | 1.0% | near-perfect; shallow tilt |

**PoC recommendation:** (5,12,13) with L=H=13 — 13³ cube blocks, ~22.6° tilt
(gentle 3/4), sub-degree angle match, 0.15% vertical stretch, 2.1% horizontal
stretch. Clean 1:1:1 voxel art, essentially pixel-perfect in all 8 views.

## Open questions / known risks

- **Lighting** (deferred but consequential): with pre-baked per-view textures,
  lighting is baked into the art — fine for static, painful for dynamic
  time-of-day. A global ambient/tint per view is cheap; per-texel dynamic
  lighting on billboards is awkward. Defer, but note it constrains how "alive"
  the world can feel without re-baking.
- **Z-fighting / draw order** at wall–ground and wall–wall seams in diagonal
  view, especially with pre-sheared textures. Worth an early spike.
- **Texel-grid snapping in the fragment shader**: affine UV interpolation on a
  quad can drift sub-pixel at diamond edges. May need a shader that snaps
  `gl_FragCoord` to the texel grid rather than relying on UV interp. If
  diagonal ground looks slightly soft at edges, that's the fix.
- **Minification / mipmaps**: nearest filter aliases badly on minification.
  Probably render the canvas at fixed integer DPR and CSS-scale, or accept
  nearest-aliasing as part of the aesthetic.
- **Diamond ground tile seaming** at edges (classic iso authoring problem);
  procedural textures in the PoC make this tractable to debug.
- **Wall corners** in diagonal view where two parallelograms meet — may need a
  corner-cap texture or 3D corner geometry.

## Files

- `architecture.md` — runtime vs builder, voxel data model, 8-view camera, two
  terrain art styles, atlas convention, hot-reload + preview.
- `pixel-math.md` — full integrality analysis, the two impossibility results,
  the parameter search procedure, real numbers, the recommended set.
- `art-tooling.md` — art workflow, atlas-by-convention, preview modes,
  guide-overlay vs auto-warp rationale, palette swaps, open questions.
- `roadmap.md` — phased POC (static GH Pages) and MVP staging on top.
- `param_search.py` — the enumerator; reproduces all numbers in `pixel-math.md`.
