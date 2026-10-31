# Wiki proposal — verification strategy for a renderer whose GPU half cannot be unit-tested

**Date:** 2026-09-27
**Source project:** `~/projects/pixel-world`, branch `jef/loop-refactor`
**Commits:** `d40dc7d`, `4039fb4`, `efa61d3`
**Promoted by:** *(human)*

---

## Summary of what this proposes

Roadmap Step 1 of the learning implementation is complete, and it produced one
idea generalisable well beyond pixel-world: **a renderer splits cleanly into a
half you can unit-test and a half you cannot, and the untestable half can be
given a real test — a pixel-exact fingerprint — instead of an eyeball.**

Four changes:

| # | Target | Change |
|---|---|---|
| 1 | `notes/pixelworld-verification-harness-2026-09-27.md` | **new** — source note (provenance for #4) |
| 2 | `projects/pixel-world/Pixel-World-Verification.md` | **new** — project page for the implementation specifics |
| 3 | `projects/pixel-world/Pixel-World.md` | status note updated |
| 4 | `kb/Testing-GPU-Output.md` + `kb/index.md` | **new** kb page, *optional* — see [Decision needed](#decision-needed) |

`kb/Projects-Summary.md` was checked and needs **no** change — see
[Checked and not changed](#checked-and-not-changed).

---

## 1. New source note: `notes/pixelworld-verification-harness-2026-09-27.md`

Required by the ingestion procedure: a `kb/` page needs a source note to
distil from, and this material currently exists only as repo commits, which
are not in the wiki's provenance chain. The note should be a distillation of
the *reasoning*, not a session log. Outline for the human to write or for me
to draft on request:

- The problem: WGSL has no test runner, and Node cannot create a `GPUDevice`,
  so roughly half a small WebGPU renderer is unreachable from a test suite.
- The split: pure functions (projection constants, matrix builders, pixel
  helpers) go in GPU-free modules; the GPU half is verified by readback.
- Three seams that carry the real bugs: 256-byte row alignment, BGRA/RGBA
  channel order, and aggregate invariants that cannot see shape.
- The float32 testing lessons, which cost more time than the refactor did.
- The `.mjs` vs `package.json` decision and why the repo stayed npm-free.

---

## 2. New project page: `projects/pixel-world/Pixel-World-Verification.md`

Full text proposed:

```markdown
# Pixel World — Verification Strategy

> **Status (2026-09-27): active.** Describes how the JavaScript/WebGPU
> learning implementation is checked. Applies to the learning
> implementation; the Rust engine build-out resumes later and will need its
> own approach.

The renderer has a natural seam, and the two sides are verified differently
because the tooling does not permit otherwise. There is no test runner for
WGSL, and Node cannot create a `GPUDevice`.

| Half | Module | Verified by |
|---|---|---|
| Projection constants, matrix builders | `www/projection.mjs` | `node --test` |
| Pixel helpers for readback | `www/snapshotPixels.mjs` | `node --test` |
| Device, pipelines, passes, loop | `www/demo.js` | snapshot fingerprint |

The rule that keeps the split honest: a module reachable by the test runner
contains no WebGPU calls at all. Not "few" — none. `import { createCamera }
from './projection.mjs'` in Node and the separation has already broken, and
the failure is silent.

## The GPU half: readback and fingerprint

`www/demo.js` copies the 160×120 internal buffer to a `MAP_READ` buffer via
`copyTextureToBuffer` + `mapAsync`, strips the row padding, and reduces it to
a three-field fingerprint:

```js
window.snapshot();  // -> {nonBlack, total, rowWidths, hash}
// [snapshot] nonBlack=100/19200 rowWidths=4,8,12,16,20,16,12,8,4 hash=c8f95a5d
```

Refactors are verified by asserting the hash is unchanged:

```js
(await snapshot()).hash === 'c8f95a5d'   // -> true
```

Three fields because they fail differently:

- **`nonBlack`** — covered-pixel count. Catches a black buffer, a failed
  pipeline, the wrong texture. Cheap and readable, but coarse.
- **`rowWidths`** — per-row coverage as `"4,8,12,..."`. Catches shape
  changes the count cannot see. This is not hypothetical: the current
  off-constraint camera centre rasterizes 9 rows and the on-grid centre
  rasterizes 10, and **both cover exactly 100 pixels**. A count-only
  comparison would have reported "unchanged" through a visible change.
- **`hash`** — FNV-1a over the pixel bytes. Catches everything, including a
  one-texel shift.

## Three seams that carry the bugs

- **256-byte row alignment.** `copyTextureToBuffer` requires `bytesPerRow` to
  be a multiple of 256, so 160px RGBA pads 640 → 768. Reading `width * 4`
  bytes per row without stripping the padding shears the image diagonally —
  a baffling failure to diagnose from the output.
- **Channel order.** The internal texture uses
  `navigator.gpu.getPreferredCanvasFormat()`, which is `bgra8unorm` on most
  platforms. An un-swizzled dump has red and blue swapped.
- **Aggregate invariants.** A single number over a region is blind to shape
  changes that preserve area. Cheap checks should be paired with a stricter
  one rather than trusted alone.

## float32 test discipline

These matrices are `Float32Array`, and the tolerance rules are not the ones a
float64-minded instinct suggests:

- Tolerances must be sized for float32 (~1e-6). The float32 image of `0.6`
  differs from `0.6` by 2.4e-8, so a 1e-12 tolerance fails on *correct*
  arithmetic.
- `matMul` legitimately produces negative zeros, which `assert/strict` treats
  as distinct from `+0`.
- Golden values need shortest round-trip literals. `toFixed(17)` gives 17
  decimal places, which is fewer significant digits than needed at
  magnitudes like `0.003`, and silently loses precision.
- A 3-component point fed to a 4-component dot product yields `NaN`.

## Tooling, and staying out of npm

`node:test` is standard library. No `package.json`, no `node_modules`, no
install step, and the project stays a static site. The one wrinkle: ES modules
in Node need either `"type": "module"` or an `.mjs` extension. `.mjs` was
chosen, and the consequence is that **the server must send `.mjs` as
JavaScript** — nginx needs `types { application/javascript mjs; }`, without
which `.mjs` falls through to `default_type` and the browser refuses the
module under strict MIME checking. The bad response is cached, so it needs a
hard reload to clear. Python's `http.server` already maps it correctly.

The decision is recorded because the alternative (rename to `.js`, add a
two-line `package.json`) is the one that would erode the project's
deliberate no-npm posture over time, and the costs of each are not symmetric
in what they cost *later*.

## Known gap: createOrthoScale ignores its arguments

`createOrthoScale(sWidth, sHeight)` returns `2/VW` and `2/VH` regardless of
its arguments, so `CameraView.stretchWidth` and `stretchHeight` currently have
no effect anywhere in the pipeline.

This is live, not cosmetic: the parameter table in
[Pixel-Math](../../kb/Pixel-Math.md) calls for `s_x` 1.010 and `s_y` 1.003 on
diagonal views, so the planned `VIEWS` table will pass values that do nothing.
It is pinned by a characterisation test that names the replacement assertion.
The fix belongs with the view table, where those values first matter.
```

---

## 3. `projects/pixel-world/Pixel-World.md` — replace the status block

**Before:**

```
> **Status (2026-09-06)** — the project was **restarted from scratch** (July 2026). The
> original Bevy/WASM prototype is retired on the `abandoned` branch of the repo; active
> work is a **JavaScript + raw-WebGPU learning implementation** in the repo (see its
> `roadmap.md`) proving the renderer fundamentals. The Rust engine build-out described
> in [[Pixel-World-Tech-Stack]] and [[Pixel-World-WGPU-Implementation]] is deferred
> until those fundamentals are proven. The founding math is now distilled into the
> human-readable fundamentals: [Pixel-Math](../../kb/Pixel-Math.md),
> [Pixel-Perfect-Rendering](../../kb/Pixel-Perfect-Rendering.md),
> [Camera-Snapping-and-Scrolling](../../kb/Camera-Snapping-and-Scrolling.md),
> [View-Transitions](../../kb/View-Transitions.md).
```

**After:** as above, with the first sentence extended —

```
> **Status (2026-09-27)** — the project was **restarted from scratch** (July 2026). The
> original Bevy/WASM prototype is retired on the `abandoned` branch of the repo; active
> work is a **JavaScript + raw-WebGPU learning implementation** in the repo (see its
> `roadmap.md`) proving the renderer fundamentals. **Step 1 of that roadmap is
> complete** (named init functions, per-frame render loop, and a pixel-exact readback
> harness that fingerprints the internal buffer so refactors can be verified by diff
> rather than by eye — see [[Pixel-World-Verification]]). The Rust engine build-out
> described in [[Pixel-World-Tech-Stack]] and [[Pixel-World-WGPU-Implementation]] is
> deferred until those fundamentals are proven. The founding math is now distilled
> into the human-readable fundamentals: [Pixel-Math](../../kb/Pixel-Math.md),
> [Pixel-Perfect-Rendering](../../kb/Pixel-Perfect-Rendering.md),
> [Camera-Snapping-and-Scrolling](../../kb/Camera-Snapping-and-Scrolling.md),
> [View-Transitions](../../kb/View-Transitions.md).
```

**Also add to `## Related Pages`:**

```markdown
- [[Pixel-World-Verification]] — how the learning implementation is tested; the two-halves split
```

---

## 4. Optional `kb/` page: `kb/Testing-GPU-Output.md`

**This one is a judgement call, and per `AGENTS.md` a new `kb/` page needs
human review before it is considered done.** It is listed separately because
it is the only part of this proposal that touches the slow-evolving tier.

The idea generalises past pixel-world: any project that produces GPU output
faces the same split, and the answer — *read the output back, reduce it to a
fingerprint, diff the fingerprint* — is reusable. It also has a property worth
distilling on its own: **a cheap aggregate check should always be paired with a
stricter one, because aggregates are blind to shape.** The 9-rows-vs-10-rows
case is a clean illustration and generalises well past rendering.

Proposed page shape, to `kb/Testing-GPU-Output.md`:

- One idea: how to get a real test on output that cannot be unit-tested.
- The two-halves split and the rule that the testable half contains no GPU
  calls at all.
- Readback and fingerprinting; `rowWidths`-style shape checks alongside
  counts; why a single aggregate is unsafe.
- Provenance footer pointing at `notes/pixelworld-verification-harness-2026-09-27.md`.
- A project-context link near the top:
  `../projects/pixel-world/Pixel-World-Verification.md`.

**Required follow-through if adopted:**

- Add to `kb/index.md` under `## Workflow`:

  ```markdown
  - [Testing-GPU-Output.md](Testing-GPU-Output.md) — verifying output that cannot be unit-tested
  ```

- Add a matching line to `kb/Projects-Summary.md`'s pixel-world entry linking
  the new page, since the summary lists that project's concepts.
- Cross-link from [Pixel-Perfect-Rendering.md](Pixel-Perfect-Rendering.md),
  which is the natural neighbour — its texel-exactness claims are exactly
  what the fingerprinting discipline makes checkable. *Worth reading that
  page before finalising the link text.*

---

## Checked and not changed

- **`kb/Projects-Summary.md`** — the pixel-world entry reads "WebGPU learning
  implementation in progress", which is still accurate. Only needs a change
  if #4 is adopted (see above).
- **`projects/pixel-world/Pixel-World-MVP-Roadmap.md`** and
  **`Pixel-World-WGPU-Implementation.md`** — both carry
  `Status (2026-09-06)` notes describing the Rust engine as deferred, which
  is still true. Learning-implementation sequencing lives in the repo's own
  `roadmap.md` and deliberately is not mirrored here; duplicating it would
  give the wiki two places to go stale. A one-line cross-link from
  `Pixel-World-WGPU-Implementation.md` to `[[Pixel-World-Verification]]` is
  suggested, not required.
- **`kb/Pixel-Perfect-Rendering.md`**, `kb/Pixel-Math.md`,
  `kb/Camera-Snapping-and-Scrolling.md`, `kb/View-Transitions.md` — the
  rendering math did not change in this batch, so these need no edits. They
  are cited from the new project page for context.

---

## Decision needed

1. **Is the `kb/` page (#4) worth it?** My inclination is yes, but it is the
   part that touches the slow tier, and it will need review beyond
   mechanical promotion. Skipping it costs the project wiki nothing.
2. **Should the source note (#1) be written by hand or drafted by me?** The
   ingestion procedure expects it before the `kb/` page, so #4 depends on
   #1. I can draft it on request.
3. **`stretchWidth`/`stretchHeight`** — recorded on the project page as a
   known gap. Confirm that is better than fixing it in the repo first; the
   fix is a Step 2 matter and this wiki change should not wait on it.

---

## Not proposed, deliberately

- No claim that the fingerprint approach is *the* way to test renderers.
  It is one that works for a deterministic, pixel-exact target, which this
  project has and most do not.
- No `kb/` page about float32 tolerances. Real, but too small to be a page;
  it lives on the project page.
- Nothing about the containment scaffolding or serving topology. Those are
  repo-level, not wiki-level.
