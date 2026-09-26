# PixelWorld

A 2D-feeling 3D game/world engine that renders through a real 3D pipeline
(WebGPU/WGSL) but looks and feels like a top-down or isometric pixel-art
adventure game. The camera snaps to 8 views with Fez-style quick transitions,
and every texture is pre-authored per view — the engine samples, it never warps.

**This README is for you. `AGENTS.md` is for the agent.** They overlap only
where the agent needs the same rules you do.

## Current state

A learning implementation: a two-stage renderer (`demo.js`) — one textured unit
quad at a diagonal view (phi=45), rendered into a 160×120 internal buffer and
presented at 4× integer scale with nearest-neighbour filtering. Camera
parameters are hardcoded in a single `cameraView` object. No render loop, no
input, no view switching.

`roadmap.md` is the plan; `notes/open-questions.md` holds the unresolved
design tensions. The design rationale is distilled in the wiki at
`~/wiki/kb/` (fundamentals) and `~/wiki/projects/pixel-world/` (implementation).

## Running it

No build step — it is a static site. WebGPU needs a secure context, and
`localhost` counts as one, so a plain file server is enough:

```bash
cd ~/projects/pixel-world
python3 -m http.server 8000
# then open http://localhost:8000
```

Requires a browser with WebGPU enabled (Chrome/Edge 113+, or Safari 18+).

## Layout

| Path | What |
|---|---|
| `index.html` | page shell, canvas |
| `demo.js` | the renderer: device setup, pipeline, camera, two-stage present |
| `shader.wgsl` | vertex + fragment shaders |
| `roadmap.md` | learning-session roadmap and current state |
| `todo.md` | session-scoped actionable items (1–4, one commit each) |
| `backlog.md` | persistent idea parking lot |
| `notes/` | working scratch; only distilled into `~/wiki/` when settled |
| `git-askpass.sh` | supplies the agent's scoped PAT to git (see below) |

## Git workflow

**`dev` is the active branch. `main` is the release branch. `abandoned` holds
the old Bevy/WASM prototype — leave it alone.**

`dev` and `main` are protected: force-pushes are rejected, and changes must
land via pull request. That applies to you as much as to the agent — you cannot
push directly to `dev` any more. The loop is:

```
git checkout dev && git pull
git checkout -b agent/<short-desc>
   ... work ...
git push -u origin agent/<short-desc>
# open a PR, review, merge
```

### Worktrees for anything unattended

For an unsupervised run, give it its own worktree rather than a branch in this
checkout. The agent then cannot touch your working tree at all — no
`reset --hard`, no `checkout .`, no collisions with anything you are editing
while it runs:

```bash
git worktree add ../pixel-world-loop -b agent/<date>-<desc> dev
cd ../pixel-world-loop        # agent works here; ~/projects/pixel-world untouched
# ... afterwards, either merge it, or:
git worktree remove ../pixel-world-loop
git branch -D agent/<date>-<desc>
```

This is the single most valuable safety property here. It makes an entire class
of damage structurally impossible rather than merely discouraged.

## Agent credentials

Agent sessions authenticate as **`jefwagner` using a fine-grained PAT scoped to
this repository only** — not your SSH key. The point is that the token *cannot
reach any other repository you own*, most importantly `~/wiki`, which is a
separate repo holding the distilled knowledge. See
`tools/llm-instructions/pat-setup.md` for the full procedure.

**One repo, one token.** `jefscad` gets its own. If a token is ever exposed,
revoke it in GitHub settings and create a replacement — the agent cannot
regenerate one.

## Verifying containment

Worth running once after setup, and any time you doubt it. These should all
behave as described:

```bash
# 1. the token cannot push to the wiki  ← the whole point
cd ~/wiki && git push --dry-run            # expect: auth failure

# 2. nor to an unrelated repo
cd ~/tools/jellyfin && git push --dry-run  # expect: auth failure

# 3. force-push to a protected branch is rejected by the server
cd ~/projects/pixel-world
git push --force-with-lease origin agent/selftest:dev   # expect: rejected

# 4. a normal push to a fresh branch works
git checkout -b agent/selftest
git commit --allow-empty -m "selftest"
git push -u origin agent/selftest        # expect: succeeds
git push origin --delete agent/selftest
```

If 1 or 2 **succeed**, the token is scoped wrongly and none of the rest holds.
