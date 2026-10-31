# TODO — Step 2: the camera contract (snap + crop window)

Session-scoped: 1–4 items, one commit each (see `AGENTS.md` → Modes of work).
Cleared at the end of the work chunk.

**Branch:** `jef/step2-camera-contract` (off `dev` @ `a19cb39`). **Mode:** tdd.

**Session goal.** Roadmap Step 2: implement the 8-view camera contract end to
end — the `VIEWS` table, `snapCamera`, the snap→crop decomposition, and a
crop-aware present pass — while keeping the single tile. Tiling seams and
instancing are Step 4; input and camera follow are Step 6.

## Ground rules

- Pure math (`VIEWS`, stretch, `snapCamera`) lives in `www/projection.mjs` and
  is tested with `node --test`; no npm.
- GPU output is verified with `(await snapshot()).hash` against a baseline
  recorded in this file.
- Items 1 and 2 must leave the rendered image unchanged: the existing baseline
  (`c8f95a5d`, full 160×120 buffer) must still reproduce. Item 3 legitimately
  changes it (buffer size); record the new baseline there rather than treating
  the mismatch as a regression. Item 4 changes it again by switching to the
  real diagonal camera parameters.
- The renderer keeps one textured quad throughout. No grid, no instancing.

## Items

- [x] **1. Name the camera angles correctly and add the 8-view `VIEWS` table**

  Fix the swapped angle naming, add the per-view parameter table from Ch1, and
  make `createOrthoScale` actually honour `stretchWidth`/`stretchHeight`.

  - Rename `theta`/`phi` to `azimuth`/`elevation` everywhere (`CameraView`,
    `createViewRotation`, `createCamera`, tests). The current formula has
    `dir.y = -sin(theta)`, so `theta` is the elevation and `phi` the azimuth —
    the existing comments and roadmap have them backwards.
  - Export `VIEWS`: 8 entries keyed by azimuth 0, 45, …, 315. Cardinal views
    (`kind: 'cardinal'`) use elevation 30°, `s_x = s_y = 1`; diagonal views
    (`kind: 'diagonal'`) use elevation 30.25°, `s_x ≈ 1.01015`, `s_y ≈ 1.00255`.
    Prefer the exact derived constants (`s_x = 5√2/7`, `s_y` from the Ch1
    formula, elevation from its `asin`) so the ground-plane map is exactly
    integer; leave the rounded table values in comments.
  - `createOrthoScale` currently accepts both stretch arguments and uses
    neither. Multiply the x and y scale terms by `s_x` and `s_y`.
  - Delete the characterisation test that pins the ignored arguments.

  **Acceptance:** all `node --test` suites pass; `VIEWS` has 8 entries with the
  right kinds; a cardinal view projects world steps to `(0, 14)` / `(-7, 0)`
  buffer px and a diagonal view to `(±10, ±5)`; the browser hash is still
  `c8f95a5d` (the running camera still uses stretch 1).

  **Verified:** 48 tests pass; an uncached browser reload renders identically
  (user-confirmed); the golden camera matrix is bit-identical to before.

- [ ] **2. `snapCamera(view, target)` — the constraint grid and the crop offset**

  Add a pure function returning `{ renderPos, cropOffset }`, and pin the snap
  contract with tests.

  - Work in buffer-pixel coordinates with the convention the renderer already
    uses: pixel centres at half-integers, pixel edges at integers.
  - Snap the camera centre `c` so `M·c` has the view's parity: cardinal
    `(integer, integer)`; diagonal `(integer, half-integer)`. The half-integer
    y is what puts the diamond's horizontal diagonal on a pixel centre and its
    vertical diagonal on a pixel edge, giving the clean 9-row
    `4,8,12,16,20,16,12,8,4` tiling. An integer y gives the 10-row
    `2,6,10,14,18,18,14,10,6,2` shape, which shows seam slivers when tiled.
  - `cropOffset = M·(target − c)`, sub-pixel (each component ≤ 0.5 px).
  - Keep the constraint in world units but document the pixel derivation in a
    comment — the 14× factor is the classic bug.
  - The map is `M = [[14·s_x·right.x, 14·s_x·right.z],
    [−14·s_y·up.x, −14·s_y·up.z]]`; invert it to recover the world offset.
  - Rename the existing "off-grid/on-grid" projection tests: under this
    contract the 9-row centre is the tiling target, not the off-grid case.

  **Acceptance:** for all 8 views, `M·renderPos` is integer x and, for
  diagonal views, half-integer y (cardinal both integer) within float32
  tolerance; `|cropOffset| ≤ 0.5 px`; snapping is idempotent
  (`snapCamera(view, renderPos)` returns the same `renderPos`, zero crop); two
  targets inside one grid cell share `renderPos` but differ in `cropOffset`; a
  diagonal snapped camera rasterises the 9-row `4,8,12,16,20,16,12,8,4`
  diamond and a cardinal one the 7-row 14×7 rectangle; the browser hash is
  still `c8f95a5d` (nothing is wired up yet).

- [ ] **3. Enlarge the internal buffer and make the present pass crop-aware**

  Render into a 160×150 buffer while presenting a 160×120 window, so the crop
  can slide without re-rasterising the scene.

  - Split the buffer dimensions from the visible dimensions in
    `projection.mjs`: `BUFFER_WIDTH`/`BUFFER_HEIGHT` (160×150) for the scene
    pass, `SCREEN_WIDTH`/`SCREEN_HEIGHT` (160×120) for the visible window and
    the 4× canvas. The camera matrix uses the buffer extent.
  - Add a crop window to the present pass — a uniform with the window origin
    (and size, if not compile-time), applied to the `uv` before sampling. Keep
    nearest filtering and the single full-screen triangle.
  - Default the window to the vertical centre (y = 15) so the visible image is
    the same frame as before, just cropped from a taller buffer.
  - Add debug keys to nudge the crop origin by whole buffer pixels and by
    fractions of one, so the quantisation behaviour can be observed.
  - Record the new full-buffer snapshot baseline here.

  **Acceptance:** the canvas is still 640×480 at 4×; the centred 160×120 window
  shows the same image as the old 160×120 buffer; moving the crop by whole
  pixels shifts the image in 4-screen-pixel steps; fractional offsets produce
  the per-column crawl under nearest sampling; `(await snapshot())` reports the
  new 160×150 dimensions and the recorded hash.

- [ ] **4. Cycle the 8 views and wire the snap→crop decomposition**

  Make `V` step through `VIEWS`, drive the camera from `snapCamera`, and feed
  the resulting crop offset to the present pass.

  - Keep a continuous `state.viewTarget`; each frame compute
    `{ renderPos, cropOffset } = snapCamera(VIEWS[state.viewIndex], viewTarget)`,
    set `cameraView.center = renderPos`, and upload `cropOffset`.
  - `V` advances the azimuth by 45°, re-snaps, and leaves the view target fixed.
  - Optionally log the current view + crop offset to the console for
    verification.
  - Record the per-view snapshot fingerprints (or at least `rowWidths`) in this
    file.

  **Acceptance:** all 8 azimuths render; diagonal views show the
  `4,8,12,16,20,16,12,8,4` diamond and cardinal views the 14×7 rectangle;
  the tile rasterisation is identical at every snapped position; a target
  nudged within a grid cell changes only the crop, not the tile pattern.

## Findings / decisions

- **Angle labels were swapped.** `createViewRotation` computes
  `dir.y = -sin(theta)`, so `theta` is elevation and `phi` azimuth. Step 2's
  table is azimuth-indexed; item 1 fixes the names before they multiply.
- **Exact stretch beats the rounded table.** With `s_x = 5√2/7` and the Ch1
  `s_y`, the diagonal ground-plane map is `[[−10, 10], [−5, −5]]` px/wu exactly.
  The rounded table values leave ~0.000025 px/wu of drift.
- **The snap parity is view-dependent.** Cardinal: `M·c ∈ Z²`. Diagonal:
  `M·c ∈ Z × (Z+½)`. The half-pixel y offset is what selects the 9-row
  `4,8,...,4` diamond that tiles cleanly; an integer y gives the 10-row
  `2,6,...,2` shape that leaves seam slivers. In the old test language,
  `[0.5, 0, 0.5]` is the 10-row case and `[0.5, 0, 0.6]` was already the
  9-row case — the labels were backwards relative to the tiling goal.
- **The ground-plane map is integral.** With the exact stretch, `M` maps
  integer world steps to integer buffer pixels. That is what makes either
  parity reachable; the snap chooses which one by shifting `c` by half a
  buffer pixel in the relevant axis.
- **The buffer margin is for the window, not the snap.** `cropOffset` is
  sub-pixel, so the 15 px margin is headroom for crop nudging and later view
  transitions, not a requirement of the snap itself.

## Deliberately not in these items

- Tiling seams, instancing, a tile grid — roadmap Step 4.
- Input, character movement, camera follow — roadmap Step 6.
- Fez-style view transitions — roadmap Step 7.
- Texture selection / the UV-to-texel transform — roadmap Step 3.
- Previous-chunk housekeeping (test files inside `www/`, the host nginx `.mjs`
  MIME entry, the tailnet 403 after a `www/` inode change) — parking in
  `backlog.md`.
