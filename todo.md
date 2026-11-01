# TODO — Step 3: 1-to-1 sampling of the authored flower views

Session-scoped: 1–4 items, one commit each (see `AGENTS.md` → Modes of work).
Cleared at the end of the work chunk; the next planning session rewrites it.

**Branch:** `jef/step3-tile-sampling` (off `dev` @ `35187f1`). **Mode:** tdd.

**Session goal.** Roadmap Step 3: replace the single `color-squares.png` sample
with the pre-authored flower spritesheets. The current view selects the right
compass cell, and the fragment shader applies the UV-to-texel transform so a
rendered screen texel is the authored texel. Keep one quad; the grid and
instancing are Step 4.

## Ground rules

- Pure tile/manifest/transform helpers live in `www/tiles.mjs` and are tested
  with `node --test`; no npm.
- GPU output is verified with `window.snapshot()` and, in item 3, a rendered-cell
  versus authored-cell RGB comparison.
- Item 1 leaves the rendered frame unchanged. Item 2 legitimately changes it;
  record the new baselines there rather than treating the mismatch as a
  regression.
- One quad, one tile at a time. Tile variants (16 flowers) are cycled in item 4;
  no grid, no instancing.
- Runtime assets live under `www/assets/flowers/`. The generator/spec note moves
  out of the document root to `notes/flowers-output-format.md`.

## Items

- [x] **1. Adopt the flower spritesheets and add a pure tile/view module**

  Move the temporary assets into the repo and make the manifest, view mapping,
  and UV→cell maths testable before any GPU work.

  - Move `flowers.cardinal.png`, `flowers.diagonal.png`, and `flowers.json` to
    `www/assets/flowers/`; move `output-format.md` to
    `notes/flowers-output-format.md`.
  - Add `www/tiles.mjs` with:
    - `COMPASS_VIEWS` and `viewNameForAzimuth(azimuth)` — 0→N, 45→NE, …, 315→NW;
    - `validateManifest(manifest)` and `sheetFor(manifest, name)`;
    - `viewCell(manifest, tileName, azimuth)` → `{ sheet, rect }`;
    - `cellTransform(kind)` → affine UV→cell (`m00/m01/m10/m11`, offset, cell size);
    - `normaliseRect(rect, sheetWidth, sheetHeight)` → `[u0, v0, u1, v1]`.
  - The transforms: cardinal `(14u, 7v)` on a 14×7 cell; diagonal
    `(10(u+v), 4.5 + 5(u−v))` on a 20×9 cell. The 4.5 offset is load-bearing:
    the 20×10 figure is the theoretical outline, the authored/rasterised cell is
    9 rows (`4,8,12,16,20,16,12,8,4`).
  - Update the README asset/layout notes and the roadmap Step 3 wording.

  **Acceptance:** all `node --test` suites pass; the manifest validates 16 tiles
  × 8 views with every rect in bounds; the azimuth mapping covers all eight
  views; cardinal corners map to `(0,0)/(14,0)/(14,7)/(0,7)`; diagonal corners
  map to the theoretical 20×10 tips and the centre maps to `(10,4.5)`; the
  current rendered frame is unchanged (still `color-squares.png`).

  **Verified:** 87 tests pass; the real flower manifest validates with
  `width`/`height` fields; no renderer files changed.

- [x] **2. Bind both sheets and sample the authored view cell**

  Load the two spritesheets, select the current view's manifest cell, and apply
  the transform in the scene shader.

  - `createAssets` loads `flowers.json` plus both PNGs; create one texture per
    sheet.
  - Scene bind group: camera uniform (0), sampler (1), cardinal texture (2),
    diagonal texture (3), scene-params uniform (4).
  - Scene params: affine transform, cell offset/size, and the normalised atlas
    rect. Compute them per frame from `viewCell(...)` and
    `orientedCellTransform(...)` for `flower_01` and the current `viewIndex`.
    The view orientation (`viewUvOrientation`) is the inverse of the camera's
    UV rotation; the authored cell is sampled unrotated.
  - Fragment shader selects the sheet by kind, maps square UV → cell → atlas UV,
    and samples nearest/clamp.
  - `V` now selects the compass cell for the current azimuth. Retire
    `color-squares.png` from the pipeline and the README layout.

  **Acceptance:** all 8 views render without WGSL errors; the rendered cell is
  1:1 with the authored cell (cardinal 14×7, diagonal 20×9 with the 9-row
  pattern); no square-UV smearing and no visible rotation; `V` selects the
  expected compass cell; new full-buffer and window baselines are recorded here.

  **CPU pre-check:** with the dihedral orientation map, the shader simulation
  matches the authored cell RGB for all 16 tiles × 8 views (0 mismatches), and
  every diagonal still rasterises the 9-row profile.

  **Verified (browser, hard reload, new sheets):** all 8 views render, no WGSL
  errors; diagonals `4,8,12,16,20,16,12,8,4`, cardinals `14×7`. Startup (index
  1, azimuth 45, target z=0.600): buffer `e1330b15`, window `a42a9c15`. A later
  per-view sweep was taken after an arrow nudge to z=0.590, so those hashes are
  not canonical; item 3 records fingerprints systematically.

- [ ] **3. Make the 1:1 claim falsifiable**

  Add a rendered-cell versus authored-cell comparison so "1:1" is a hash check,
  not an eyeball judgement.

  - Add pure helpers to `www/snapshotPixels.mjs`: `cropRgba`, `rgbBounds` (the
    non-black bbox), and `hashRgb` (ignore alpha, because the authored cell has
    transparent corners and the scene clears to black).
  - Add `window.verifyTile()`: snapshot the full buffer, find the rendered
    bbox, crop, hash RGB; extract the authored cell from the spritesheet via
    Canvas2D, hash RGB; log/return the comparison.
  - Unit-test the pure helpers, including a cell with transparent corners and a
    crop at the buffer edge.

  **Acceptance:** `verifyTile()` returns true at all 8 views for `flower_01`;
  the reported bbox is 14×7 for cardinals and 20×9 for diagonals; the per-view
  fingerprints are recorded.

- [ ] **4. Cycle the 16 flower variants and confirm orientation**

  Exercise the whole manifest with one quad, and settle the azimuth→compass
  convention.

  - Add `state.tileIndex`/`tileName`; `T` cycles `flower_01`…`flower_16` and logs
    the name.
  - Verify every variant at the diagonal view and spot-check both cardinal and
    diagonal orientations; adjust the compass mapping if the sheet's rotation
    direction is reversed.
  - Document the mapping in `www/tiles.mjs` and the README.
  - Update the roadmap current state to Step 3 complete.

  **Acceptance:** all 16 flowers render; `verifyTile()` passes for each at the
  diagonal view; `V` still cycles views; no grid or instancing is introduced.

## Findings / decisions

- **The generator's diagonal cell is 20×9, not 20×10.** The theoretical outline
  is 20×10, centred at y = 4.5; the rasterised cell has 9 rows with widths
  `4,8,12,16,20,16,12,8,4` and transparent corners. The shader transform must
  include the `+4.5` y offset (or the `−0.5` crop offset) or it samples half a
  texel wrong.
- **Assets:** 16 flower variants; cardinal sheet 56×112 (4 views × 16 rows,
  14×7 cells); diagonal sheet 80×144 (4 views × 16 rows, 20×9 cells); manifest
  maps all 8 compass views per tile.
- **Compass mapping:** start with azimuth 0→N, 45→NE, … 315→NW, matching the
  manifest's N/E/S/W and NE/SE/SW/NW order. Verify the rotation direction in
  item 4; the flower art makes the check visual rather than mathematical.
- **Per-view UV orientation is not a texture rotation.** The camera's UVs
  rotate with the view, so the pre-rotated cells need the inverse dihedral map
  before the cell transform: N flipU, E transpose, S flipV, W anti-transpose,
  NE 90° CW, SE identity, SW 90° CCW, NW 180°. With that map the rendered cell
  is pixel-identical to the authored cell; the texture is never rotated at
  sample time. Verified against all 16 tiles × 8 views.
- **The old `color-squares.png` is retired** once the flower sheets are wired.
- **Backlog:** the existing entries (tests inside `www/`, nginx `.mjs` MIME,
  tailnet stale mount, kb crop wording) are unrelated to Step 3 and stay parked.

## Deliberately not in these items

- A tile grid or instancing — roadmap Step 4.
- Wall/parallelogram views, diagonal packing, atlas optimisation — later asset
  work.
- Input, character follow, view transitions — Steps 6–7.
- Moving the test files out of `www/` — backlog.
