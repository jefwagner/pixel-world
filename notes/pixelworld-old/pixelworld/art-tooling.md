# PixelWorld — Art Tooling

The core tension: **pixel-perfect requires pre-distorted art** (foreshortened
rectangles for cardinal views, diamonds/parallelograms for diagonal views), but
artists don't naturally draw pre-distorted — and you cannot cleanly
auto-generate it.

**Why auto-generation fails:** affine-warping a square top-down tile into a
diamond with nearest-neighbor produces exactly the sampling artifacts the whole
engine exists to avoid. The pre-distortion *is* the art; it has to be
hand-authored. Any tooling must respect this:

> **Foundational principle: help the artist draw in the target shape; don't try
> to transform source art into it.**

Given that, the directions below are ordered by how much I'd weight them for
the MVP.

## 1. Atlas-by-convention, not magic

Define a strict, documented atlas layout (see `architecture.md`):

- Per object: 8 labeled cells (directions).
- Per block type: labeled cells for each face × each view-style (cardinal rect
  / diagonal diamond-parallelogram).

The engine reads by convention. Artists stay in their tool — Aseprite,
Pixelorama, Photoshop — drawing into a known grid. No proprietary editor
lock-in. This is how the pixel-art ecosystem actually works (RPG Maker, LDtk
tilesets); the lesson is that a clear convention beats a clever importer.

The convention spec (`ATLAS_SPEC.md`) is a first-class deliverable: grid
diagrams, cell sizes (e.g. cardinal ground = 13×5 cells for the (5,12,13)
params; diagonal ground = 18×7 diamond cells), labeling, and worked examples.

## 2. Hot-reload is the make-or-break UX

Artist saves in Aseprite → builder re-reads the file → live scene updates.

This is what makes the two-art-style burden bearable: iterate one tile, see it
seam against its neighbors in all 8 views, fix, save, see it again. Without
hot-reload the round-trip kills iteration. Locally this is just file mtime
polling + texture re-upload to GPU. (This is also why the builder must be
local, not the static viewer.)

Target: sub-second round-trip from save to on-screen update. Polling interval
~250ms is fine; instant on a focus-gain event.

## 3. A dedicated preview pane, three modes

- **Isolated 1:1** — the atlas cell at exact texel scale with the engine's
  texel grid overlaid, to verify per-texel alignment. Catches off-by-one cell
  sizing and misaligned diamond centers.
- **In-context 8-view** — the tile placed in a real scene, all 8 views, to
  check seaming against neighbors and depth interactions. Catches
  wall-corner artifacts and diamond-ground seaming.
- **Tiling check** — the texture repeated 3×3, to verify it loops cleanly.
  Critical for ground tiles and the classic iso authoring pain point; one
  toggle saves artists hours.

These three modes are the bulk of the builder's value beyond "a file picker."
They turn the two-art-style cost from "draw blind, pray it seams" into "draw,
see, fix."

## 4. Guide overlays, not auto-warp

In the isolated view, overlay the target shape on top of the artist's canvas:

- Diamond grid for diagonal ground (showing the exact diamond bounds and edge
  slopes p/2 : q/2).
- Parallelogram bounds for diagonal walls (slanted side + vertical side r).
- Foreshortened-rect bounds for cardinal ground/walls (L × L·sinθ₀, L × H·cosθ₀).

The artist draws into the guide. This is light-touch help that respects that
the craft is hand-placement. It does not modify the artist's pixels; it just
shows where the target shape sits on the grid.

## 5. Ghost-template bridging (optional, try-and-see)

Given a finished cardinal rectangle, render a **faint, warped ghost** of it
into the diagonal diamond/parallelogram cell — *not* as a usable asset (it'll
be ugly, that's the point), but as a drawing reference so the diagonal art can
match the cardinal art's composition. Artist draws over the ghost.

This bridges the two styles without pretending the transform is lossless. Flag
as "try it, maybe drop it" — it might be more distracting than helpful. If
artists report it pulls their eye toward the ghost's artifacts, remove it.

## 6. Drag-and-drop import as the POC's proof

For the static POC you can't do FS watching, but you *can* support dragging a
PNG onto the page and seeing it applied in 8 views. That proves the
import/convention path with zero backend, and doubles as a minimal "artist
preview" for the POC phase. Cheap and high-value — include it in Phase 4 of the
POC roadmap.

## 7. Palette-swap / tint variants to bound the art

A small hand-authored base palette per block type (grass, stone, water, sand)
plus a tint system gives lots of visual variety from little art. Standard
pixel-art technique; fits the "intentional pixels" ethos if palette swaps are
also hand-tuned (not just hue-rotated). Keeps the art set bounded, which
matters because the 2-view-style multiplier is real.

Tints can be applied in-shader (multiply the sampled texel by a per-instance
tint color), so the world bundle just stores a tint per placed block — no
extra textures.

## 8. Document the per-block art budget explicitly

Because the 2-view-style requirement doubles art, the spec should state plainly
what a fully-skinned block type costs. Concretely, for the (5,12,13) params:

- Cardinal: ground face = 13×5 cell; wall face = 13×12 cell (H·cosθ₀ = 13·12/13).
- Diagonal: ground = 18×7 diamond; wall = parallelogram (slant (9, 3.5) →
  integers (18,7) with r chosen).
- Per block type: ~2 ground variants (cardinal + diagonal) + ~4 wall faces ×
  2 styles + maybe corner caps. Say **~12 cells** for a fully-skinned block
  type, fewer for simple ones.

Making this concrete lets artists scope their work and lets the engine
prioritize which blocks get full treatment vs. which reuse a generic texture.

## Open questions

- **Same-file vs split-file atlases** for the two view-styles: lean same-file
  with clear cell labeling (hot-reload convenience, one place per block type).
  Revisit if artists strongly prefer specializing in one style.
- **Corner caps in diagonal view** where two parallelogram walls meet: needed?
  Or does 3D corner geometry (a small bevel cube) hide the seam? Spike in
  POC Phase 2.
- **How much does the texel-grid snap shader matter?** If plain nearest-neighbor
  looks soft at diamond edges in Phase 2, the snap shader is mandatory; if it
  looks fine, skip it. Don't build it speculatively.
- **Animation support** for billboard sprites (walk cycles per direction): out
  of POC scope, but the atlas convention should leave room for it (cells laid
  out as frames × directions) so it's not a rewrite later.
- **Multi-tile blocks** (a 2×2 tree, a 3×3 building): how does the voxel grid
  + atlas convention represent "this block occupies multiple cells and has a
  multi-cell art layout"? Probably a block type with a footprint + a multi-cell
  atlas; defer to post-MVP.
