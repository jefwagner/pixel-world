# Changelog

## 2026-11-01 — Roadmap Step 3: authored tile sampling

- Adopted the flower generator output: 16 variants × 8 compass views, with
  cardinal 14×7 cells and diagonal 20×9 cells, plus manifest loading and
  validation in `www/tiles.mjs`.
- Corrected the diagonal geometry: 20×10 is the theoretical outline; the
  authored cell is 9 rows, and the transform is `(10(u+v), 4.5+5(u−v))`.
- Added the per-view dihedral UV orientation (`viewUvOrientation` /
  `orientedCellTransform`) so the camera's rotating UVs sample the pre-rotated
  cells unrotated. The rendered cell is pixel-identical to the authored cell.
- Bound both spritesheets and a scene-params uniform; the shader selects the
  current view's authored cell. Retired `color-squares.png`. `T` cycles the 16
  variants.
- Added `verifyTile()` / `verifyAllTiles()` plus RGB crop/bounds/hash helpers.
  All 16 tiles × 8 views verify: bbox 20×9 or 14×7, rendered == authored.
- 109 node tests pass; startup baseline `e1330b15` full / `a42a9c15` window.

## 2026-10-31 — Roadmap Step 2: the camera contract

- Added the eight-view `VIEWS` table with the exact Ch1 parameters, fixed the
  swapped `theta`/`phi` naming (now `elevation`/`azimuth`), and made
  `createOrthoScale` honour the `s_x`/`s_y` stretch terms.
- Derived the snap parity: cardinal `M·c` is integer on both axes; diagonal
  `M·c` is integer x / half-integer y. The half-pixel y offset selects the
  9-row `4,8,12,16,20,16,12,8,4` diamond that tiles cleanly; the 10-row
  `2,6,...,2` shape is the wrong tiling target.
- Added `snapCamera(view, target)` and `placeCamera(view, target)`, with node
  tests for parity, crop remainders, idempotence, same-cell targets, and
  per-view rasterisation.
- Enlarged the internal buffer to 180×150 with a centred 160×120 visible
  window, and made the present pass crop-aware via a window uniform. Added
  crop debug keys and `snapshot({ window: true })`.
- Wired `V` view cycling and a continuous world-space view target. Recorded
  per-view browser fingerprints; startup remains index 1 (azimuth 45) with
  full-buffer `b873fdbd` and window `c8f95a5d`.
- Verified with 65 `node --test` cases and a hard-reload browser pass over all
  eight views (diagonals 9 rows, cardinals 14×7).
