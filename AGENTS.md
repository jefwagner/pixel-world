# AGENTS.md — PixelWorld

## Project summary

PixelWorld is a 2D-feeling 3D game/world engine that renders through a real 3D
pipeline (WebGPU/WGSL) but looks and feels like a top-down or isometric
pixel-art adventure game (old Zeldas, CrossCode). Its distinguishing feature:
the camera snaps to 8 views (4 cardinal + 4 diagonal) with Fez-style quick
transitions, and every texture is pre-authored per view — the engine samples,
it never warps.

The founding math and design rationale were worked out in a companion explainer
blog (now distilled into the knowledge base, `~/wiki/kb/`); the rendering
concepts live in the wiki fundamentals and the implementation specifics in
`~/wiki/projects/pixel-world/`.

Current state: a WebGPU learning implementation — a two-stage renderer
(internal buffer + integer-scale nearest-neighbor blit) rendering pixel-art
tiles at a diagonal view, built up through the roadmap (see `roadmap.md`).

## System layout

- `demo.js`, `shader.wgsl`, `index.html` — the WebGPU renderer implementation
- `roadmap.md` — the learning-session roadmap (steps, current state)
- `notes/` — working scratch: brainstorms, plans, drafts. Volatile; freely
  edited during work. Ingested into `~/wiki/` only via the ingestion procedure
  when settled — see `~/wiki/AGENTS.md`.

## Modes of work

Mode switches are explicit — say "plan" or "implement" to change modes.

- **Planning mode**: read `~/tools/llm-instructions/planning.md` before
  starting. Produces 1–4 one-commit-sized items in `todo.md` and triages
  `backlog.md`.
- **Implementation mode**: read `~/tools/llm-instructions/implementation.md`
  before starting. TDD loop with hard STOP gates requiring user approval.

## Git

- Git-flow layout: `dev` is the active branch, `main` holds releases. Solo
  dev — no feature branches.
- Commit identity is personal; two-level commit messages (short summary line +
  explanatory body).
- History note: the original Bevy/WASM prototype lives on the `abandoned`
  branch of this repo.

## Wiki

This is a passion project: it has an LLM-managed wiki at
`~/wiki/projects/pixel-world/`, updated with committed changes. Before ending a
session that produced commits, check whether the wiki needs updating — full
instructions in `~/wiki/AGENTS.md`.
