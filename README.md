# PixelWorld

A 2D-feeling 3D game/world engine that renders through a real 3D pipeline
(WebGPU/WGSL) but looks and feels like a top-down or isometric pixel-art
adventure game. The camera snaps to 8 views with Fez-style quick transitions,
and every texture is pre-authored per view — the engine samples, it never warps.

**This README is for you. `AGENTS.md` is for the agent.** They overlap only
where the agent needs the same rules you do.

## Current state

A learning implementation: a two-stage renderer (`www/demo.js`) — one textured unit
quad at a diagonal view (phi=45), rendered into a 160×120 internal buffer and
presented at 4× integer scale with nearest-neighbour filtering. Camera
parameters are hardcoded in a single `cameraView` object. No render loop, no
input, no view switching.

`roadmap.md` is the plan; `notes/open-questions.md` holds the unresolved
design tensions. The design rationale is distilled in the wiki at
`~/wiki/kb/` (fundamentals) and `~/wiki/projects/pixel-world/` (implementation).

## Running it

No build step — it is a static site. WebGPU needs a secure context, and
every route below qualifies, so there is nothing to configure.

**On the desktop** (the usual path). A single nginx instance runs in a
docker container and does the routing for the tailnet: some projects it
proxies to services that expose themselves on a localhost port, and the
static ones — including this project — it serves straight from a mounted
directory. `www/` is that mount point. The result is one stable URL per
project:

```
https://desktop.taildd9c37.ts.net/pixelworld/
```

This is reachable from the Chromebook, so edits get validated in a real
browser without running a server or forwarding a port. Both ends need
Tailscale.

**On a fresh clone** (any machine). No nginx, no tailnet — serve `www/`
directly. Serve *that* directory and not the repo root, so `.git` and
everything else stay unexposed over HTTP:

```bash
cd ~/projects/pixel-world
python3 -m http.server 8000 --directory www
# then open http://localhost:8000
```

Requires a browser with WebGPU enabled (Chrome/Edge 113+, or Safari 18+).

## Layout

`www/` is the document root — it is what gets served, and nothing outside
it is exposed over HTTP.

| Path | What |
|---|---|
| `www/index.html` | page shell, canvas |
| `www/demo.js` | the renderer: device setup, pipeline, camera, two-stage present |
| `www/shader.wgsl` | vertex + fragment shaders |
| `www/color-squares.png` | the texture the demo samples |
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

## Working inside the devcontainer

**Open this repo in a devcontainer** (VS Code "Reopen in Container", or
`devcontainer up`) and run agent sessions there. Agent sessions should happen
inside the container, not on the host.

The container is the security boundary, and it is worth knowing what it does:

| Not present in the container | Why it matters |
|---|---|
| `~/.ssh/id_ed25519` | your personal key — reaches **every** repo you own, including the wiki |
| `ssh`, `scp`, `sftp`, `ssh-agent`, `rsync` | with no ssh binary, git has **no SSH transport at all** and cannot fall back to the key |
| the `jefscad` PAT, the lab bot credential | one credential only: the pixel-world PAT, mounted read-only |
| `~/.aws`, `~/.azure`, host tool dir | — |
| write access to `~/tools/llm-instructions/` | the agent cannot edit the rules it is working under |

Plus `--cap-drop=ALL` and `--security-opt=no-new-privileges`.

The practical result: **the worst realistic outcome of a bad unattended run is
junk commits and branches inside pixel-world.** Nothing outside this repository
is reachable from inside the container.

The one thing to understand before changing anything: the `.devcontainer/`
mount list is short *on purpose*. Every mount is a hole in the boundary. The
reasoning is written out in comments in `.devcontainer/devcontainer.json` and
`.devcontainer/Dockerfile` — read them before adding one.

## Agent credentials

Agent sessions push as **`jefwagner` using a fine-grained PAT scoped to this
repository only** — never your SSH key, which the container does not have. See
`tools/llm-instructions/pat-setup.md` for the full procedure; the token lives at
`~/.config/jef/pixel-world-pat` (mode 600, outside the repo) and is bind-mounted
in read-only. `jefscad` gets its own token.

If a token is ever exposed, revoke it in GitHub settings and create a
replacement — the agent cannot regenerate one.

## Verifying containment

These were run against the built image and all pass. Re-run them after changing
the devcontainer:

```bash
devcontainer build --workspace-folder .
docker run --rm -u vscode -e HOME=/home/vscode \
  -v "$PWD:/workspace" \
  -v ~/.config/jef/pixel-world-pat:/home/vscode/.config/jef/pixel-world-pat:ro \
  -v ~/tools/spend.py:/home/vscode/tools/spend.py:ro \
  -v ~/tools/llm-instructions:/home/vscode/tools/llm-instructions:ro \
  -e GIT_ASKPASS=/workspace/git-askpass.sh -e GIT_TERMINAL_PROMPT=0 \
  -e GIT_SSH_COMMAND=/bin/false \
  $(docker images --format '{{.Repository}}:{{.Tag}}' | grep '^vsc-pixel-world' | head -1) \
  bash -lc 'echo "ssh: $(command -v ssh || echo ABSENT)"
            echo "key: $(test -e ~/.ssh && echo PRESENT || echo ABSENT)"
            echo "pat: $(ls ~/.config/jef/)"
            echo "ro:  $(touch ~/tools/llm-instructions/CANARY 2>/dev/null && echo WRITABLE || echo read-only)"'
```

Expected: `ssh: ABSENT`, `key: ABSENT`, `pat: pixel-world-pat`, `ro: read-only`.

And separately, on the host, that the token is scoped as intended — this check
is independent of any git remote, which is what makes it trustworthy:

```bash
T=$(cat ~/.config/jef/pixel-world-pat)
for r in pixel-world wiki; do
  printf "%-12s " "$r"
  curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $T" \
    https://api.github.com/repos/jefwagner/$r
done
# expect: pixel-world 200, wiki 404
```

> Do **not** test this with `cd ~/wiki && git push --dry-run`. That measures
> whatever credentials the wiki's own remote is configured with — which is your
> SSH key, not the token — so it tests nothing about the token. This is exactly
> the trap that made an early version of this check report a false failure.
