# Changelog

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
