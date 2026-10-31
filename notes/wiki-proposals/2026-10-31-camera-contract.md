# Wiki proposal — the eight-view camera contract (Step 2)

**Date:** 2026-10-31
**Source project:** `~/projects/pixel-world`, branch `jef/step2-camera-contract`
**Commits:** `1c47321`, `10d8e61`, `0f53d3b`, `f642ed7`
**Promoted by:** *(human)*

---

## Summary of what this proposes

Roadmap Step 2 of the JavaScript/WebGPU learning implementation is complete.
It produced the concrete camera contract the rest of the renderer consumes:

- the eight `VIEWS` parameters, using the exact Ch1 constants;
- the pixel-parity rule that selects the 9-row diamond for clean tiling;
- `snapCamera` / `placeCamera` and the snap→crop decomposition;
- the 180×150 scene buffer with a 160×120 crop window;
- per-view browser fingerprints.

Two changes:

| # | Target | Change |
|---|---|---|
| 1 | `projects/pixel-world/Pixel-World-Camera-Contract.md` | **new** — implementation page |
| 2 | `projects/pixel-world/Pixel-World.md` | status block + Related Pages update |

`kb/Projects-Summary.md` was checked and needs **no** change: the existing
one-line summary (“WebGPU learning implementation in progress”) remains true.

**Dependency:** this proposal assumes the 2026-09-27 verification proposal
(`notes/wiki-proposals/2026-09-27-verifying-untestable-renderer-output.md`) has
been promoted first, because change 2 builds on its `Pixel-World.md` status
block and `[[Pixel-World-Verification]]` link. If it has not been promoted,
promote both together or drop the Verification link and apply the Step 1/2
wording to the current status block.

---

## 1. New page: `projects/pixel-world/Pixel-World-Camera-Contract.md`

Full text:

````markdown
# Pixel World — Camera Contract (learning implementation)

> **Status (2026-10-31):** roadmap Step 2 of the JavaScript/WebGPU learning
> implementation. Code: `www/projection.mjs` and `www/demo.js` in the
> pixel-world repo. Fundamentals: [Pixel-Math](../../kb/Pixel-Math.md),
> [Pixel-Perfect-Rendering](../../kb/Pixel-Perfect-Rendering.md),
> [Camera-Snapping-and-Scrolling](../../kb/Camera-Snapping-and-Scrolling.md).
> Testing: [[Pixel-World-Verification]] (2026-09-27 proposal).

## The eight views

`VIEWS` is indexed by azimuth in 45° steps. Cardinal views use the 2:1
rectangle camera; diagonal views use the stretched diamond camera.

| index | azimuth | kind | elevation | s_x | s_y |
|---:|---:|---|---:|---:|---:|
| 0 | 0 | cardinal | 30 | 1 | 1 |
| 1 | 45 | diagonal | 30.2512432987 | 1.0101525446 | 1.0025477748 |
| 2 | 90 | cardinal | 30 | 1 | 1 |
| 3 | 135 | diagonal | 30.2512432987 | 1.0101525446 | 1.0025477748 |
| 4 | 180 | cardinal | 30 | 1 | 1 |
| 5 | 225 | diagonal | 30.2512432987 | 1.0101525446 | 1.0025477748 |
| 6 | 270 | cardinal | 30 | 1 | 1 |
| 7 | 315 | diagonal | 30.2512432987 | 1.0101525446 | 1.0025477748 |

The values are the exact derived constants, not the rounded Ch1 table
(30.25°, 1.01015, 1.00255). With the exact values, the ground-plane projection
maps integer world steps to integer buffer pixels; the rounded values leave
about 0.000025 px/wu of drift.

The camera basis is y-up, ground-plane xz. `createViewRotation(azimuth,
elevation)` builds right/up/dir; `createCamera` composes
`scale · view · translation` and flushes sub-1e-15 residues to zero. The
multiply order and the flush are load-bearing for texel-exactness.

## Pixel convention and the 9-row target

Buffer coordinates use pixel centres at half-integers and pixel edges at
integers, with y increasing downward.

Let `M` be the ground-plane map from world (x,z) to buffer pixels:

```text
M = [[ 14·s_x·right.x,  14·s_x·right.z ],
     [ -14·s_y·up.x,   -14·s_y·up.z  ]]
```

Because `M` maps integer world steps to integers, the camera centre `c` can be
snapped by parity:

| view | constraint on `M·c` |
|---|---|
| cardinal | integer x, integer y |
| diagonal | integer x, **half-integer y** |

The diagonal half-integer y is the important one. It puts the diamond's
horizontal diagonal through pixel centres and its vertical diagonal on a pixel
edge. The rasterised diamond then has **9 rows**:

```text
4, 8, 12, 16, 20, 16, 12, 8, 4
```

That is the shape that tiles cleanly. An integer y puts the horizontal
diagonal on a pixel edge and gives the **10-row** shape:

```text
2, 6, 10, 14, 18, 18, 14, 10, 6, 2
```

The 10-row shape leaves single-pixel slivers at seams when tiled. The old test
language had this backwards: `[0.5, 0, 0.6]` is already on the diagonal
half-integer parity (9 rows); `[0.5, 0, 0.5]` is the 10-row case.

## Snapping and placing

`snapCamera(view, target)`:

1. `raw = M · target_xz`.
2. Snap to the view parity: `round(raw.x)` and, for diagonal,
   `floor(raw.y) + 0.5`; for cardinal, `round(raw.y)`.
3. `renderPos = target + M⁻¹·(snapped − raw)`, with `renderPos.y = 0`.
4. `cropOffset = raw − snapped` (each component ≤ 0.5 px).

`placeCamera(view, target)` composes the two consumers:

```text
cameraView = { center: renderPos, azimuth, elevation, s_x, s_y }
windowRect  = createWindowRect(CROP_ORIGIN_X + cropOffset.x,
                               CROP_ORIGIN_Y + cropOffset.y)
```

Keeping this composition pure and unit-tested pins the crop-origin sign; a
sign flip moves the visible window the wrong way and is caught by a test, not
by the renderer.

## Buffer and crop

- Scene buffer: **180×150**.
- Visible window: **160×120**, centred at origin `(10, 15)`.
- Present: single full-screen triangle, nearest sampling, 4× integer scale to
  640×480.
- Present uniform: normalised `[originU, originV, sizeU, sizeV]`; the fragment
  shader samples at `rect.xy + uv * rect.zw`.

The camera projection uses the buffer extent, keeping 14 px/wu. The visible
window is what the player sees; the margin gives the crop room to slide
without re-rasterising the scene.

Under nearest sampling, whole-buffer-pixel crop shifts move the image by
4 screen px at 4×; fractional offsets produce per-column quantisation crawl
rather than smooth motion. The intended scrolling behaviour is therefore to
move the window in whole buffer pixels and accumulate the fractional remainder.
That wiring belongs to the character-follow step, not this one.

`window.snapshot()` fingerprints the full buffer; `snapshot({ window: true })`
fingerprints the visible crop. The full buffer hash includes the margin, so it
changes when the buffer size changes even if the visible image does not.

## Verification

The pure halves run under `node --test` (65 tests): matrices and stretch, the
`VIEWS` table, the integer ground grid, snap parity and remainders, idempotence,
same-cell targets, `placeCamera` composition, and the window rect. The golden
camera matrix is frozen bit-exactly.

Browser fingerprints from a hard reload (startup is index 1, azimuth 45):

| index | azimuth | kind | buffer | window |
|---:|---:|---|---|---|
| 0 | 0 | cardinal | `815fc16d` | `645d792d` |
| 1 | 45 | diagonal | `b873fdbd` | `c8f95a5d` |
| 2 | 90 | cardinal | `ac20e62d` | `a4770a4d` |
| 3 | 135 | diagonal | `89a0cfad` | `f5993ecd` |
| 4 | 180 | cardinal | `f6803f1d` | `7b42f55d` |
| 5 | 225 | diagonal | `05dd6f9d` | `6132463d` |
| 6 | 270 | cardinal | `7186211d` | `6123a9fd` |
| 7 | 315 | diagonal | `ff88590d` | `231522ad` |

All four diagonals rasterise the 9-row pattern (`nonBlack=100`); all four
cardinals the 14×7 rectangle (`nonBlack=98`). `V` cycles the views; arrow keys
nudge the continuous world target.

## Limits

Still single-quad: no input/character follow, no UV-to-texel transform, no
instancing, no view transitions. Roadmap Step 3 (authored per-view textures and
1-to-1 sampling) is next.

## Related Pages

- [[Pixel-World]] — project overview and status
- [[Pixel-World-Verification]] — the readback/fingerprint harness
- [[Pixel-World-Tech-Stack]] — the deferred Rust engine build-out
````

---

## 2. `projects/pixel-world/Pixel-World.md` — status and Related Pages

Assumes the 2026-09-27 proposal has been promoted. Replace its status block
with:

```markdown
> **Status (2026-10-31)** — the project was **restarted from scratch** (July 2026). The
> original Bevy/WASM prototype is retired on the `abandoned` branch of the repo; active
> work is a **JavaScript + raw-WebGPU learning implementation** in the repo (see its
> `roadmap.md`) proving the renderer fundamentals. **Steps 1 and 2 of that roadmap are
> complete**: named init functions, a per-frame render loop, and a pixel-exact readback
> harness ([[Pixel-World-Verification]]); and the eight-view camera contract — `VIEWS`,
> snap→crop, a 180×150 scene buffer with a 160×120 visible window, and view cycling
> ([[Pixel-World-Camera-Contract]]). The Rust engine build-out described in
> [[Pixel-World-Tech-Stack]] and [[Pixel-World-WGPU-Implementation]] is deferred until
> those fundamentals are proven. The founding math is now distilled into the
> human-readable fundamentals: [Pixel-Math](../../kb/Pixel-Math.md),
> [Pixel-Perfect-Rendering](../../kb/Pixel-Perfect-Rendering.md),
> [Camera-Snapping-and-Scrolling](../../kb/Camera-Snapping-and-Scrolling.md),
> [View-Transitions](../../kb/View-Transitions.md).
```

Add to `## Related Pages`:

```markdown
- [[Pixel-World-Camera-Contract]] — eight-view parameters, snap→crop, and the buffer/window contract
```

If the Verification proposal was *not* promoted, drop its link from both the
status block and Related Pages; the rest stands on its own.

---

## Checked and not changed

- `kb/Projects-Summary.md` — the pixel-world entry remains accurate
  (“WebGPU learning implementation in progress”); no summary update needed.
- `kb/Camera-Snapping-and-Scrolling.md` — **not changed here.** Its phrasing
  that a “sub-pixel crop offset slides the viewing window smoothly” is in
  tension with nearest-sampling quantisation. The implementation has measured
  the crawl, but the right wording depends on how character-follow actually
  feels in Step 6. Revisit then rather than encoding a half-finished judgment
  into the fundamentals now.
- `projects/pixel-world/Pixel-World-WGPU-Implementation.md` — future Rust
  reference, not the learning implementation; no change.

---

## Not proposed, deliberately

- No new `kb/` page. The camera contract is implementation detail and the
  underlying ideas already live in `kb/Camera-Snapping-and-Scrolling.md` and
  `kb/Pixel-Math.md`.
- No changelog page in the wiki; git history is the log.
