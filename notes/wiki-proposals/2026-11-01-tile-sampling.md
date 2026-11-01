# Wiki proposal — authored tile sampling (Step 3)

**Date:** 2026-11-01
**Source project:** `~/projects/pixel-world`, branch `jef/step3-tile-sampling`
**Commits:** `bf42d2b`, `84b1694`, `e1ec45f`, `bcd5b8d`
**Promoted by:** *(human)*

---

## Summary of what this proposes

Roadmap Step 3 of the JavaScript/WebGPU learning implementation is complete.
The renderer now samples the generator's pre-authored flower cells 1:1: the
current view selects a manifest cell, the camera's rotating UVs are mapped
through the inverse view orientation, and the fragment shader samples the
pre-distorted cell. The rendered cell is pixel-identical to the authored cell
for all 16 tiles × 8 views.

Two changes:

| # | Target | Change |
|---|---|---|
| 1 | `projects/pixel-world/Pixel-World-Tile-Sampling.md` | **new** — implementation page |
| 2 | `projects/pixel-world/Pixel-World.md` | status block + Related Pages |

`kb/Projects-Summary.md` was checked and needs no change; the one-line summary
(“WebGPU learning implementation in progress”) remains true.

**Dependency:** this proposal assumes the 2026-09-27 verification proposal and
the 2026-10-31 camera-contract proposal have been promoted first, because
change 2 builds on their status block and links. If they have not, promote all
three together (or apply the Step 1–3 wording to the current status block and
drop the missing links).

---

## 1. New page: `projects/pixel-world/Pixel-World-Tile-Sampling.md`

Full text:

````markdown
# Pixel World — Tile Sampling (learning implementation)

> **Status (2026-11-01):** roadmap Step 3 of the JavaScript/WebGPU learning
> implementation. Code: `www/tiles.mjs`, `www/demo.js`, `www/shader.wgsl`;
> assets: `www/assets/flowers/`. Fundamentals:
> [Pixel-Math](../../kb/Pixel-Math.md),
> [Pixel-Perfect-Rendering](../../kb/Pixel-Perfect-Rendering.md). Verification:
> [[Pixel-World-Verification]].

## Authored assets

The generator output is 16 flower variants, each with all 8 compass views,
packed into two spritesheets:

| sheet | size | layout |
|---|---|---|
| `flowers.cardinal.png` | 56×112 | 4 views × 16 rows, 14×7 cells |
| `flowers.diagonal.png` | 80×144 | 4 views × 16 rows, 20×9 cells |

`flowers.json` maps every `(tile, view)` to a sheet rectangle with
`x`, `y`, `width`, `height`. Sheets are RGBA; unused pixels are transparent.
The generator's output contract is kept in the project repo at
`notes/flowers-output-format.md`.

## The diagonal cell is 20×9, not 20×10

The 20×10 figure is the theoretical diamond outline. It is centred at
`(10, 4.5)` and spans `y ∈ [−0.5, 9.5]`. The authored/rasterised cell covers the
9 rows whose pixel centres fall inside that outline:

```text
4, 8, 12, 16, 20, 16, 12, 8, 4
```

Its corners are transparent. The square-UV to cell transform is therefore:

```text
cardinal: (14u, 7v)
diagonal: (10(u+v), 4.5 + 5(u−v))
```

The `+4.5` offset is load-bearing; using `5(u−v+1)` samples half a texel wrong.

## Per-view UV orientation

The camera's square UVs rotate with the view, while the manifest cells are
pre-rotated. Before applying the cell transform, the renderer applies the
inverse dihedral orientation:

| view | UV map |
|---|---|
| N | `(1−u, v)` |
| E | `(v, u)` |
| S | `(u, 1−v)` |
| W | `(1−v, 1−u)` |
| NE | `(v, 1−u)` |
| SE | `(u, v)` |
| SW | `(1−v, u)` |
| NW | `(1−u, 1−v)` |

This is **not** a visible texture rotation. It undoes the camera's UV
orientation so the authored cell appears exactly as painted. Without it, the
NE/SW sampling lattice hits the stair-stepped diamond edge and clips the shape;
with it, the rendered bbox matches the authored cell for every tile.

## Runtime

- Both sheets are uploaded as textures. The scene bind group has camera uniform
  (0), sampler (1), cardinal texture (2), diagonal texture (3), and a scene
  params uniform (4).
- The params uniform carries the composed affine transform, cell offset/size,
  normalised atlas rect, and a diagonal flag.
- The fragment shader maps square UV → cell texel coordinates → atlas UV and
  selects the sheet by the flag. Nearest/clamp sampling.
- `V` cycles the 8 views; `T` cycles the 16 flower variants. The quad and tile
  grid are unchanged — instancing is Step 4.

## Verification

109 pure tests run under `node --test`: manifest validation, view mapping, cell
lookup, the base and oriented transforms, `sceneParams` packing, window maths,
snapshot helpers, and the camera projection. The full renderer is checked in the
browser:

- `window.verifyTile()` snapshots the full buffer, finds the rendered cell bbox,
  hashes its RGB, extracts the authored manifest cell through Canvas2D, and
  requires matching dimensions and hashes.
- `window.verifyAllTiles()` runs that check for every variant at the current
  view.

All 16 tiles × 8 views verify: bbox 20×9 for diagonals, 14×7 for cardinals, and
`renderedHash === authoredHash` throughout. The full 128-combination sweep was
exercised. Per-tile hashes at the NE view:

| tile | NE hash |
|---|---|
| flower_01 | `20b5d441` |
| flower_02 | `fad49a54` |
| flower_03 | `ef008698` |
| flower_04 | `53806415` |
| flower_05 | `9017e6b8` |
| flower_06 | `6e6c4597` |
| flower_07 | `dfa0f225` |
| flower_08 | `1f60936b` |
| flower_09 | `18fbb6f0` |
| flower_10 | `125fdf1c` |
| flower_11 | `ac2f35d7` |
| flower_12 | `ff192615` |
| flower_13 | `528b528d` |
| flower_14 | `60e84514` |
| flower_15 | `1bf2c241` |
| flower_16 | `8cde59a5` |

Startup snapshot (index 1, azimuth 45): full buffer `e1330b15`, visible window
`a42a9c15`.

## Limits

One quad only. No tile grid/instancing (Step 4), no input/character follow
(Step 6), no view transitions (Step 7). Wall/parallelogram views and diagonal
atlas packing are later asset work. `color-squares.png` is retired.

## Related Pages

- [[Pixel-World]] — project overview and status
- [[Pixel-World-Camera-Contract]] — the eight-view camera and crop contract
- [[Pixel-World-Verification]] — the readback/fingerprint harness
- [[Pixel-World-Tech-Stack]] — the deferred Rust engine build-out
````

---

## 2. `projects/pixel-world/Pixel-World.md` — status and Related Pages

Assumes the 2026-09-27 and 2026-10-31 proposals have been promoted. Replace the
status block with:

```markdown
> **Status (2026-11-01)** — the project was **restarted from scratch** (July 2026). The
> original Bevy/WASM prototype is retired on the `abandoned` branch of the repo; active
> work is a **JavaScript + raw-WebGPU learning implementation** in the repo (see its
> `roadmap.md`) proving the renderer fundamentals. **Steps 1–3 of that roadmap are
> complete**: the init/loop/readback harness ([[Pixel-World-Verification]]); the
> eight-view camera contract and snap→crop window ([[Pixel-World-Camera-Contract]]);
> and 1:1 sampling of the pre-authored flower cells, including the per-view UV
> orientation and cell-level verification ([[Pixel-World-Tile-Sampling]]). The Rust
> engine build-out described in [[Pixel-World-Tech-Stack]] and
> [[Pixel-World-WGPU-Implementation]] is deferred until those fundamentals are proven.
> The founding math is now distilled into the human-readable fundamentals:
> [Pixel-Math](../../kb/Pixel-Math.md),
> [Pixel-Perfect-Rendering](../../kb/Pixel-Perfect-Rendering.md),
> [Camera-Snapping-and-Scrolling](../../kb/Camera-Snapping-and-Scrolling.md),
> [View-Transitions](../../kb/View-Transitions.md).
```

Add to `## Related Pages`:

```markdown
- [[Pixel-World-Tile-Sampling]] — authored flower cells, per-view UV orientation, and cell-level verification
```

---

## Checked and not changed

- `kb/Projects-Summary.md` — the pixel-world summary remains accurate; no change.
- `kb/Pixel-Perfect-Rendering.md` / `kb/Pixel-Math.md` — they describe the
  20×10 diagonal as the authored canvas. The implementation distinguishes the
  20×10 theoretical outline from the 20×9 rasterised cell. That nuance is
  recorded in the new project page; a `kb/` clarification should wait until the
  authoring format is stable (parked in the project backlog).
- `projects/pixel-world/Pixel-World-WGPU-Implementation.md` — future Rust
  reference; no change.
- `projects/pixel-world/Pixel-World-Camera-Contract.md` — Step 3 consumes its
  camera/crop contract without changing it.

---

## Not proposed, deliberately

- No new `kb/` page. The sampling details are implementation-specific; the
  fundamentals already cover pre-distorted textures and the two-stage pipeline.
- No change to `notes/flowers-output-format.md` (project repo): the generator
  contract and consumer orientation note are already committed there.
- No changelog page in the wiki; git history is the log.
