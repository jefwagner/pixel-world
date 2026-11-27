# PixelWorld — Architecture

## The two-artifact split

PixelWorld is not one program; it's two artifacts sharing rendering code:

1. **The runtime / viewer** — a static, shareable, no-backend consumer of a
   *world bundle* (JSON + atlas PNGs). It renders a world, lets you walk around
   and snap through 8 views. This is what the POC matures into, and it's a
   perfect GitHub Pages citizen: a world is just a folder you deploy.
2. **The builder / editor** — a local tool with filesystem access (hot-reload,
   import, export). Produces bundles. This is where the MVP work lives.

**Architectural principle:** the no-backend constraint applies to the
*shareable artifact*, not the engine. Authoring is local; only the published
world is static. The runtime is a pure consumer of a static world bundle —
it never reads the filesystem, only fetches bundled assets.

Both artifacts import the same `renderer` package (camera, 8-view system,
billboard sprites, voxel terrain). The builder adds: import, hot-reload,
preview panes, export. The runtime adds: input, character controller,
collision, world-bundle loader.

```
                +-------------------+
                |  renderer (core) |   <- shared: camera, 8 views, sprites,
                |  Three.js / WebGL |      voxel terrain, pixel-perfect shaders
                +---------+---------+
                          |
            +-------------+-------------+
            |                           |
   +--------+--------+         +--------+--------+
   |  runtime/viewer |         | builder/editor  |
   |  (static, GH    |         | (local, FS,     |
   |   Pages, no     |         |  hot-reload,    |
   |   backend)      |         |  import/export) |
   +--------+--------+         +--------+--------+
            |                           |
   loads world bundle            produces world bundle
   (JSON + atlas PNGs)           (JSON + atlas PNGs)
```

## World data model: voxel grid

Terrain is a **voxel grid** for the MVP — a 3D array (or sparse set) of block
IDs. Not arbitrary low-poly meshes (those come as a Phase 2 "prop" system).

- Axis-aligned unit cubes map perfectly onto the pixel-perfect constraint:
  each face is a tile, the two art styles (cardinal rect / diagonal
  diamond-parallelogram) apply per-face with no geometry edge cases.
- Collision is voxel-grid + character AABB — no per-mesh collider authoring.
- The art set is **bounded and enumerable**: N block types × 2 view styles × a
  few face variants. A finite, spec-able art budget — which is what makes art
  tooling tractable. Arbitrary meshes have unbounded art surfaces.
- Matches the Lego/Minecraft-style block-layout mental model and gives a
  coherent aesthetic.

A block ID resolves to a block *type*, which carries: a set of face textures
(per view-style), physical properties (solid/solid-top/one-way), and metadata
(name, palette variants). The voxel grid is the spatial index; block types are
the palette.

### World bundle format (sketch)

```
world/
  world.json           # grid dimensions, voxel data (sparse: blockId -> [x,y,z]...),
                       #   object/character placements, palette tints, spawn point
  atlases/
    blocks_cardinal.png  # all cardinal-style block face textures in one atlas
    blocks_diagonal.png  # all diagonal-style block face textures in one atlas
    objects.png          # 8-direction sprites for all objects/characters
  meta.json            # atlas cell layout, block-type registry, params (L,H,theta...)
```

The runtime loads `meta.json` first (it carries the chosen parameter set and
atlas layout), then the atlases, then the voxel grid + placements. Everything
needed to render is in the folder — no server, no API.

## 8-view camera system

Eight camera presets, computed once from the parameter set (`pixel-math.md`):

- **4 cardinal** (N/E/S/W): yaw ∈ {0°,90°,180°,270°}, tilt θ₀, uniform unit
  ortho (sx₀=sy₀=1).
- **4 diagonal** (NE/SE/SW/NW): yaw ∈ {45°,135°,225°,315°}, tilt θ₄₅,
  non-uniform ortho (sx₄₅, sy₄₅).

Each preset is a full camera config (position offset, look-at, ortho frustum,
yaw, tilt). The renderer snaps to a preset on demand; transitions tween
camera position + ortho frustum over ~150ms with easing.

**Transition design (the charm lever):**
- Within-cardinal (N→E): continuous-orbit feel — smooth yaw swing.
- Cardinal↔diagonal (N→NE): "mode change" feel — maybe a tiny ease-out hold at
  the destination, leaning into the fact that the tilt changes meaningfully.

During a transition the view is intentionally non-pixel-perfect; this is where
the angle mismatch and stretch differences live, hidden by motion.

## Two terrain art styles (the structural cost)

Terrain needs **two art sets per block type** — this is unavoidable given the
pixel-perfect requirement (see `pixel-math.md`):

- **Cardinal style:** axis-aligned rectangles.
  - Ground tile: `L` wide × `L·sinθ₀` tall (pre-foreshortened).
  - Wall face: `L` wide × `H·cosθ₀` tall.
- **Diagonal style:** diamonds (ground) and parallelograms (walls), pre-sheared.
  - Ground tile: diamond `p` wide × `q` tall (p,q even).
  - Wall face: parallelogram with slanted side `(p/2, q/2)` and vertical side
    `(0, r)`.

These are **different art** per tile type per surface kind — you cannot sample
one square texture into both. (An affine-warp shader on a single square
texture would reintroduce exactly the interpolation blur the engine exists to
avoid; the pre-distortion *is* the art.)

A corollary: the look intentionally shifts between a top-down feel (cardinal)
and an isometric feel (diagonal). This is a feature, not a bug — Fez leans
into exactly this — but the art direction has to hold up in two related styles.

For objects/characters, by contrast, there's only **one** art style (camera-
facing billboards) but **8 directions** of sprite per object — the "8-direction
sprites" the original writeup already planned.

## Atlas-by-convention

A strict, documented atlas layout read by convention (no magic, no
proprietary editor):

- **Objects:** per object, 8 labeled cells (directions N, NE, E, SE, S, SW, W,
  NW). The engine reads by cell index.
- **Blocks:** per block type, labeled cells for each face × each view-style.
  - Cardinal atlas: one cell per (block type, face variant).
  - Diagonal atlas: one cell per (block type, face variant) — diamonds for
    ground faces, parallelograms for wall faces.

The convention spec is a **first-class deliverable**: a markdown doc
(`ATLAS_SPEC.md` in the repo) with diagrams showing the exact grid, cell
sizes, and labeling. Artists stay in their tool (Aseprite, Pixelorama,
Photoshop) and draw into a known grid — no editor lock-in. This is how the
pixel-art ecosystem actually works (RPG Maker, LDtk tilesets).

**Open question:** whether diagonal ground and diagonal walls share the *same*
atlas (one file per block type, both styles in it) or are split (one atlas for
cardinal-style, one for diagonal-style). Lean **same-file with clear cell
labeling** — more convenient for hot-reload, keeps a block's art in one place.
Revisit if artists strongly prefer specializing.

## Rendering pipeline notes

- `magFilter = NearestFilter`, `generateMipmaps = false` on all terrain/object
  textures. (Minification: see risks in `index.md` — probably render at fixed
  integer DPR and CSS-scale.)
- **Texel-grid snapping shader:** affine UV interpolation on a quad can drift
  sub-pixel at diamond edges. May need a fragment shader that snaps
  `gl_FragCoord` to the texel grid rather than relying on UV interp. First
  implementation can try plain nearest-neighbor; if diagonal ground looks soft
  at edges, add the snap shader.
- **Depth buffer** handles occlusion between voxel faces and billboards. Watch
  z-fighting at wall–ground and wall–wall seams in diagonal view (see risks).
- **Billboard sprites** are camera-facing quads sized to map texel→screen 1:1
  at the chosen ortho scale; the 8-direction pick is by relative yaw to the
  active camera preset.

## Lighting (deferred)

With pre-baked per-view textures, lighting is baked into the art — fine for
static, painful for dynamic time-of-day. Cheapest first step: a global
ambient/tint per view (warm tint for "evening" presets, etc.). Per-texel
dynamic lighting on billboards is awkward and probably out of MVP scope. Defer
to a later phase, but note it constrains how "alive" the world can feel
without re-baking.

## Component inventory (target)

Core renderer:
- `Camera8View` — the 8 presets + transition tween.
- `VoxelTerrain` — grid → face quads → two atlases (cardinal/diagonal) by
  active view-style.
- `BillboardSprite` — 8-direction pick + 1:1 sizing.
- `PixelSnapMaterial` / shader — nearest + optional texel-grid snap.

Runtime:
- `WorldBundleLoader` — reads `world.json` + atlases + `meta.json`.
- `CharacterController` — AABB vs voxel-grid collision, 8-direction sprite pick.
- `Input` — keyboard/touch.

Builder:
- `AtlasImporter` — drag-drop / file-watch PNG, validate against convention.
- `HotReloader` — mtime poll → re-upload textures, live scene update.
- `PreviewPane` — three modes (isolated 1:1, in-context 8-view, tiling check).
- `GuideOverlay` — target-shape guides drawn over the artist's canvas.
- `BundleExporter` — write `world/` folder.
