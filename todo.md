# TODO — current / next-session actionable items

Session-scoped: 1–4 one-commit-sized items, rewritten at each planning
session (see `AGENTS.md` → Modes of work). Cleared at the end of a work
chunk.

Branch: `jef/loop-refactor` (off `dev` @ `222069b`). `jef/` prefix because
this is a supervised session; `agent/` prefix is for unsupervised runs.

Implements **roadmap.md Step 1** (refactor + render loop), plus the
`node --test` harness that will serve Steps 2–6.

**Verification strategy.** The renderer is split into two halves, and they
get tested differently — there is no test runner for WGSL, and no way to
reach a GPU from Node:

- **Pure math** (matrices, and later `snapCamera`/`VIEWS`) → `node --test`,
  no npm, `node:test` is stdlib. Fast, permanent, catches float-exactness
  regressions.
- **GPU output** → the `mapAsync` snapshot from Task 1, diffed PNG to PNG.
  Slow and manual, but a real assertion.

Tasks are ordered readback-first so that Task 2's "renders the identical
frame" claim is a *falsifiable* pixel diff rather than an eyeball judgement.
Without the baseline that claim is unfalsifiable, which is why Task 1 goes
first even though the refactor is the more obvious-looking work.

## Items

- [x] **1. `snapshotBuffer()` — pixel-exact readback of the internal buffer**
  **Baseline (2026-09-27, must be reproduced exactly by Task 2):**
  ```
  [snapshot] nonBlack=100/19200 rowWidths=4,8,12,16,20,16,12,8,4 hash=c8f95a5d
  ```
  `PNG export deferred — the console fingerprint is what Task 2 diffs.

- [ ] **2. Refactor `main()` into named init functions + render loop**
  Extract `initGPU()`, `createAssets()`, `createSceneResources()`,
  `createPresentResources()`, `renderFrame()`. Promote `cameraView` to
  mutable state. Add the `requestAnimationFrame` loop (re-encode per frame;
  resource *creation* stays in init). Fix the two stale comments: the
  vertex layout says "4 floats" but vertices are 5 (`x,y,z` + `uv`), and
  `index.html` still says "WebGL".
  Includes the small structural move that makes Task 3 possible: extract
  the pure math into an importable module so Node can reach it.
  **Verify:** internal-buffer dump is pixel-identical to Task 1's.

- [ ] **3. `node --test` suite for the extracted math**
  Tests for `ftz`, `matMul`, `crossVec3`, `createTranslation`,
  `createViewRotation`, `createOrthoScale`, `createCamera` — encoding
  *claims*, not restatements of the implementation. Free case from the
  roadmap: the current hardcoded center `[0.5, 0, 0.6]` is off-constraint
  (0.6 wu = 8.4 px), which is a test waiting to be written.
  **Resolved wrinkle:** `.mjs` was kept and the server taught about it, rather
  than renaming to `.js` and adding a `package.json`. nginx needed
  `types { application/javascript mjs; }` in its `http` block — without it
  `.mjs` fell through to `default_type` (`application/octet-stream`) and the
  browser refused the module script under strict MIME checking. Python's
  `http.server` already maps `.mjs` → `text/javascript`. Still no npm project.

## Deliberately not in these items

- `snapCamera` / the `VIEWS` table — that is roadmap Step 2, a separate item.
- Fixing the off-constraint `0.6` center — a *test* pins it down in Task 3;
  changing it is Step 2's work.
- Anything requiring a package manager.

## Housekeeping spotted along the way

- `snapshotPixels.test.mjs` sits inside `www/`, so it is served over HTTP
  even though only `node --test` ever loads it. Harmless, but the tests
  arguably belong outside the document root.
- The `mjs` MIME entry lives in the host's `nginx.conf`, not in this repo, so
  it is invisible to a fresh clone. Only affects nginx deployments —
  `python3 -m http.server` is fine. Worth a line in `README.md` → Running it.
- The tailnet URL failed with 403 once because a `www/` inode change left
  the tailscale-router container pointing at a stale mount; restarting that
  container fixed it. Worth remembering before assuming a code fault.
