# Roadmap — PixelWorld WebGPU Demo

**Date: 2026-08-02**
_Rev 1 (same day): the snap→crop decomposition moved from former 6b into Step 2;
the former 6b is absorbed into Step 6 (wiring only)._

Learning sessions toward: an orthographic renderer that displays the pixel-art tiles
described in the knowledge-base fundamentals (`~/wiki/kb/`: Pixel-Math,
Pixel-Perfect-Rendering, Camera-Snapping-and-Scrolling, View-Transitions).

## Current state

Two-stage renderer (`www/demo.js`): one textured unit quad rendered into a
180×150 scene buffer, cropped to a 160×120 visible window and presented at 4×
integer scale (nearest). The camera steps through the eight `VIEWS` with `V`,
snapping each frame to the Ch3 constraint grid; `placeCamera()` returns the
snapped camera and the sub-pixel crop window. The scene pass selects the
current view's authored cell, applies the dihedral UV orientation, and samples
the pre-distorted flower spritesheets 1:1; `T` cycles the 16 variants. No
input/character movement, view transitions, or instancing yet. Step 3 (1:1
sampling) is complete; Step 4 is next.

A pixel-exact readback of the internal buffer (`window.snapshot()`) exists as
the verification tool for every step below; `snapshot({ window: true })`
fingerprints the visible crop, and `verifyTile()` compares the rendered cell
with the authored manifest cell. Recorded baselines are in `todo.md`; each step
must reproduce the current one before it changes anything.

## How to read this roadmap

Each step lists: **goal / concepts touched / concrete work / verify / size verdict.**
"Too little" means it can be merged with a neighbor; "too much" means it should be
split before starting.

The first six steps form one batch; step 7 is a later batch (bigger, needs all of 1–6).

---

## Step 1 — Refactor: init functions + render loop (+ pixel-inspect tool)

**Goal.** Split the monolithic `async main()` into named setup functions called in
sequence, and add a per-frame render loop. Everything after this depends on both.

**Concepts touched.** Init-once vs. per-frame separation; `requestAnimationFrame`;
readback via `mapAsync` (if the inspect tool is included).

**Concrete work.**
- Extract logical chunks into functions, e.g. `initGPU()`, `createAssets()`
  (image + shader), `createSceneResources()` (buffers, texture, bind group, pipeline),
  `createPresentResources()`, and a `renderFrame()` that encodes + submits one frame.
- Promote `cameraView` from a const to mutable state (a plain object the scene pass
  reads each frame). This is groundwork for every later step.
- Add the loop: `requestAnimationFrame` calling `renderFrame()`, which re-encodes
  buffers each frame. (Re-encoding per frame is fine; only GPU resource *creation*
  stays in init.)
- Fix stale comments while in there: the vertex layout comment says "4 floats" but
  vertices are `x,y,z + uv` (5 floats). **Both done** — see `todo.md`.
- **Optional half:** a `snapshotBuffer()` utility — copy the internal 160×120 texture
  to a `MAP_READ` buffer, `mapAsync`, and dump it as a PNG (or log it). This becomes
  your verification tool for *every* later step (snapping patterns, seam slivers,
  texel-exact checks). WebGPU readback is a small API chunk in itself (`mapAsync`,
  buffer size/alignment rules) — worth learning early. If it feels heavy, drop it;
  it is not on the critical path.

**Verify.** Demo still renders the identical frame (diff before/after with a captured
screenshot); with the inspect tool, dump the internal buffer and confirm it is
pixel-identical to pre-refactor.

**Size verdict: right-sized**, ~1 evening. The readback half is optional but pays off
downstream; without it, do the refactor + loop only (~20 min) and add a tiny
"dump internal buffer to console as ASCII art" instead (5 lines, no mapAsync).

---

## Step 2 — The camera contract: snapping + the crop window (Ch3, whole)

**Goal.** Implement the Ch3 contract end to end: 8 discrete views with their
parameters, camera position snapped to the constraint grid, and the decomposition
`view_center → renderPos (scene pass) → cropOffset (present pass)`. These are not
two features — the snap function and the crop offset are the same computation, split
between two consumers. Keeping them together is the point of this step.

**Concepts touched.** Ch1's parameter table (elevation, s_x, s_y per view); Ch3's
half-integer constraint; render-larger-than-viewport; decoupling "where tiles are
rasterized" from "what the player sees."

**Concrete work.**
- Build a `VIEWS` table: azimuth 0–315° in 45° steps →
  `{azimuth, elevation, s_x, s_y, kind}` (kind: cardinal/diagonal). Values from
  Ch1: elevation 30 vs 30.25, s_x 1 vs 1.01015, s_y 1 vs 1.00255.
- `snapCamera(view, target)` returns `{renderPos, cropOffset}`: `renderPos` is the
  camera center on the constraint grid (integer x / half-integer y diagonal; integer
  both axes cardinal), and `cropOffset` is the projected difference
  target − renderPos in buffer pixels. Careful with units: the constraint is
  expressed in *pixels* (half-integer pixel y = multiples of 1/28 world units at
  14 px/wu). The current hardcoded center `[0.5, 0, 0.6]` is already on the
  diagonal half-integer parity (the 9-row case); `[0.5, 0, 0.5]` is the 10-row
  parity. Both are useful test cases.
- Enlarge the internal buffer so there is room to crop in both axes:
  160×120 → 180×150 (10 px left/right and 15 px top/bottom margins). The scene
  pass renders the full buffer; the *visible window* stays 160×120, preserving
  the clean 4× scale to 640×480.
- Crop-aware present pass: sample the 160×120 window at `cropOffset` inside the
  180×150 buffer (window rect as a uniform; nearest filter; integer scale as
  before).
- Cycle views with a key (e.g., "V"): next azimuth, re-snap, update camera state.
  Debug keys to nudge the view target / crop offset.
- **Scope discipline:** keep the single tile. Tiling-seam observation (the odd/even
  sliver question) needs a grid — defer to Step 4.

**Verify.**
1. At every diagonal azimuth the snapped camera rasterises the 9-row
   `4,8,12,16,20,16,12,8,4` diamond; cardinal views rasterise the 14×7
   rectangle (inspect tool from Step 1). The 10-row parity and off-parity
   positions are visibly different.
2. The decoupling demo: nudge the crop offset. Under nearest sampling, fractional
   offsets do *not* shift the image smoothly — they produce per-column quantization
   crawl (distortion). The image only shifts when the offset crosses a whole buffer
   pixel (4 screen px at 4×). That behavior is the discovery: the crop moves in
   whole buffer pixels; the fractional remainder is accumulated bookkeeping. Tiles
   never re-rasterize — only the window slides.

**Size verdict: the biggest step — ~1.5–2 evenings.** The snapping math is small;
the margin buffer + crop-aware present pass is the real addition (that's the price
of keeping the decomposition together, and it's worth it — this is Ch3 as one idea).
If it drags, there's a clean midpoint: finish `snapCamera` + the snapped scene pass,
stub the present crop (window = full buffer, offset 0), and finish the present pass
next evening.

---

## Step 3 — 1-to-1 sampling: azimuth-selected textures + UV transforms

**Goal.** Implement Ch2's step 6a with the pre-authored flower spritesheets:
select the atlas cell for the current view and apply the UV-to-texel transform so
screen texels map 1:1 to authored texels — cardinal `(14u, 7v)`, diagonal
`(10(u+v), 4.5 + 5(u−v))`.

**Concepts touched.** Pre-distorted textures; atlas cell selection; why the
square-UV sample is wrong; the 20×9 rasterised diamond versus the 20×10
theoretical outline; texel-centre sampling; binding multiple textures and
selecting by uniform.

**Concrete work.**
- Adopt the generator output in `www/assets/flowers/`: `flowers.cardinal.png`
  (56×112: 4 views × 16 tile rows, 14×7 cells), `flowers.diagonal.png`
  (80×144: 4 views × 16 tile rows, 20×9 cells), and `flowers.json` (16 tile
  names × 8 compass views). The format spec lives in
  `notes/flowers-output-format.md`.
- Add a pure `www/tiles.mjs`: manifest validation, azimuth→compass view mapping,
  cell lookup, cell-rect normalisation, and the affine UV→cell transforms.
  Cardinal: `(14u, 7v)`. Diagonal: `(10(u+v), 4.5 + 5(u−v))` — a 20×9 cell,
  not the 20×10 theoretical outline; the 4.5 offset centres the rasterised
  9-row `4,8,12,16,20,16,12,8,4` profile.
- Compose the view's dihedral square-UV orientation before the cell transform.
  The camera's UVs rotate with the view, while the cells are pre-rotated; the
  orientation map keeps the authored cell unrotated on screen.
- Load both sheets as textures and add a params uniform (affine transform, cell
  size, normalised atlas rect) to the scene bind group; add the second texture
  binding. Keep one quad and one tile (`flower_01`).
- Fragment shader selects the sheet by view kind, maps square UV through the
  affine transform, then into the atlas cell; nearest/clamp sampling.
- `V` cycling now selects the compass cell for the current azimuth.
- `color-squares.png` is retired.

**Verify.** The rendered cell at every view is pixel-identical to the authored
cell: cardinal 14×7, diagonal 20×9 with the 9-row profile. Add a browser
cell-level comparison (rendered RGB hash vs authored cell hash) so the claim is
falsifiable, then record the new baselines.

**Size verdict: right-sized, maybe 1–1.5 evenings.** The asset plumbing adds a
manifest loader and a params uniform; the shader math is still small. The fiddly
bit is the 20×9 diagonal offset, not the cardinal transform.

---

## Step 4 — Instanced quads → a tile grid

**Goal.** Replace the single explicit quad with one shared unit-quad vertex buffer +
a per-instance buffer (tile position, and later tile kind), rendered with
`drawIndexedInstanced`. Build a small grid of tiles.

**Concepts touched.** WebGPU instancing (`stepMode: 'instance'`, second vertex buffer
in the pipeline layout); separating geometry (shared) from per-object data (instances);
draw call count independent of tile count.

**Concrete work.**
- Split the vertex data: one unit-quad VBO (positions + uv), one instance buffer
  (per tile: `x, z` world position; stride 8 bytes or 16 for alignment — watch
  `arrayStride` alignment rules).
- Pipeline: add the instance buffer to `vertex.buffers` with `stepMode: 'instance'`.
- Vertex shader: `clip_position = cameraMatrix * (instancePos + localPos)`.
- Generate a small grid (4×4 or 8×8) of tiles in JS. Keep it static — no tile-map
  editing yet.
- **Now the deferred payoff:** with a grid in diagonal view, observe the tiling
  seams at snapped vs. unsnapped camera offsets (Ch3's sliver question, even vs odd
  heights — our q=5 is the even case; the blog's odd/even gifs are the reference).

**Verify.** All tiles render with identical pixel patterns; seams are clean at
snapped offsets; stepping the camera off-grid reproduces the slivers shown in
`tiled_blocks_even.gif` / `tiled_blocks_odd.gif`.

**Size verdict: right-sized, medium.** The pipeline layout change is the one sharp
edge (instance stepMode + stride alignment). Everything else is mechanical.

---

## Step 5 — Camera-facing billboards with transparent sprites

**Goal.** Render the second object class (characters/objects from the blog intro):
a camera-facing quad with a sprite texture that has real transparent pixels, drawn
over the tile grid.

**Concepts touched.** Alpha blending in WebGPU (blend state on the pipeline; the
straight-vs-premultiplied-alpha decision — a classic pitfall); draw order vs. depth
(no depth buffer yet, so transparent objects must be drawn after opaque ones);
billboard orientation (rotate the quad to face the camera's azimuth — trivial under
orthographic).

**Concrete work.**
- A second render pipeline (or pass) with blend state. Pick an alpha convention now:
  straight alpha with `SRC_ALPHA/ONE_MINUS_SRC_ALPHA` is the least surprising for
  sprite art; premultiplied avoids edge halos but changes how you author textures.
- RGBA sprite texture: draw a simple character-ish sprite (blob with a shadow?)
  procedurally into a canvas, with transparent background, exported via
  `createImageBitmap`. Or hand-make a small PNG with alpha.
- Billboard orientation: quad whose local rotation follows the camera azimuth
  (compute the facing direction on the CPU per frame, or rotate in the vertex
  shader from the view uniform).
- Draw the sprite pass after the tile pass. Single sprite first — sorting is a
  deferred problem.

**Verify.** Sprite appears correctly oriented over the grid in all 8 views; the
transparent pixels are clean (no black halos at sprite edges — if you see them,
check the alpha convention and the texture's `premultipliedAlpha` treatment).

**Size verdict: right-sized.** New pipeline + blend state + RGBA texture is a
bounded chunk. Do NOT add sprite sorting or 8-direction sprite crossfades here —
those belong to Step 7 territory.

---

## Step 6 — Input, character movement, snapped camera follow

**Goal.** Keyboard input moves a character; the camera follows while honoring the
snap constraints. (This is the POC milestone from the parent AGENTS.md: "a character
that moves around an environment with a following camera that can rotate through all
8 views.")

**Concepts touched.** Input handling; the decoupling of "where the character is"
(world space, continuous) from "where the camera is" (snapped grid); per-view
movement direction mapping.

**Concrete work.**
- Keyboard state (arrow keys / WASD), a character position updated per frame.
- Camera follow: `view_center = character position`; Step 2's `snapCamera` gives
  `renderPos` (scene pass — unchanged) and `cropOffset` (present pass — moves as the
  character moves). The character may sit off-grid inside the snapped viewport —
  that is expected and is exactly what the blog's fixed-camera aesthetic wants.
- The former 6b is absorbed here with nothing new to learn: the snap→crop math and
  the crop-aware present pass already exist from Step 2; this step only *wires* the
  crop offset to gameplay. Expect the visible world to step in whole buffer pixels
  (4 screen px at 4×) — see the Step 2 discovery note.
- Character sprite from Step 5 follows the position; optionally swap to the
  nearest-azimuth sprite as the view rotates.

**Verify.** Character moves, camera follows on the snapped grid, view cycling (from
Step 2) keeps everything pixel-clean at every azimuth; the world slides by whole
buffer pixels while tile rasterization never changes.

**Size verdict: right-sized, ~1 evening.** Only new work is input handling and
feeding `view_center`; the crop plumbing comes free from Step 2.

---

## Step 7 (later batch) — Fez-style view transitions (Ch4)

**Goal.** The capstone: rotate between views with the full Ch4 treatment — camera
parameters (theta, s_x, s_y) interpolate with smoothstep easing while the fragment
shader crossfades between the cardinal and diagonal textures at the same interpolated
UV. 90° rotations chain as two 45° transitions; view target stays fixed during the
tween.

**Prereqs.** Steps 1–6 (mutable camera state, azimuth-uniform plumbing, both
textures bound, view cycling).

**Size verdict: medium-large; split if needed.** First get a single 45°
cardinal↔diagonal tween correct (camera lerp + crossfade). Then handle view
chaining and the fixed-target rule. Possibly two evenings.

---

## Ordering notes / dependencies

```
1 (refactor + loop) → 2 (snap + crop window) → 3 (1:1 sampling) → 4 (instancing)
   → 5 (billboards) → 6 (input + crop wiring) → 7 (transitions)
```
- Steps 2 and 3 are independent of each other in principle (snapping is geometry,
  sampling is texturing) — they're ordered this way because 3 makes 2's verification
  prettier (diamond content lines up), and both feed 4.
- Step 2 carries the full Ch3 contract (snap + crop window); Step 6 only wires the
  crop offset to the character position (former 6b — absorbed, nothing new to
  learn).
- 7 is the only step that needs *everything*; the rest can be paused after any step.

## Open decisions (flag before starting the step)

- **Step 1:** include the readback/inspect tool, or skip it?
- **Step 2:** constraint grid in world units vs. pixels — keep a comment in the
  snap function stating which, to avoid the classic 14×-factor bug.
- **Step 2 / 6:** what "smooth" means under nearest sampling. Fractional crop
  offsets quantize into per-column crawl — the crop must move in whole buffer
  pixels (4 screen px at 4×); the fractional remainder is accumulated bookkeeping.
  The decoupling (rasterization fixed, window slides) is the real prize. True
  1-screen-pixel smoothness at integer scale is a tension with crispness; the blog's
  Ch3 framing glosses it, so expect to discover the edges in Step 2. Also: the
  buffer-size choice sets the scroll step (160×120 → 4 screen px at 4×; a 320×240
  buffer → 2 screen px at 2× to 640×480) — a knob to revisit later.
- **Step 3:** texture selection by *kind* (cardinal/diagonal, 2 bindings) — enough
  for symmetric tiles. Asymmetric tiles (8 textures) or atlas-based selection is a
  later problem (blog's future "Tile Maps and Texture Atlases" chapter).
- **Step 5:** straight vs. premultiplied alpha — decide deliberately, before the
  first transparent pixel renders.

## Deferred / out of scope for now

- Depth buffer (painter's-algorithm drawing order suffices for a flat tile world;
  revisit when walls exist)
- Tile maps / texture atlases / world manifests (blog future chapter)
- 8-direction sprite sets with crossfade for characters (blog open-questions)
- Lighting (blog open-questions)
- Buffer size as a parameter (blog open-questions — 160×120 vs. 320×240 is a
  constant today)
