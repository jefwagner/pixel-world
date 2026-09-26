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
- `README.md` — human-facing: how to run it, git workflow, agent credentials, containment
- `git-askpass.sh` — supplies the repo-scoped PAT to git (see Containment)
- `.devcontainer/` — the containment boundary; read its Dockerfile comment
  before changing any mount
- `notes/` — working scratch: brainstorms, plans, drafts. Volatile; freely
  edited during work. Ingested into `~/wiki/` only via the ingestion procedure
  when settled — see `~/wiki/AGENTS.md`.

## Modes of work

Mode switches are explicit — say "pair", "tdd", or "unsupervised" to change modes.
The default, when no mode is stated, is **pair**.

Three nested loops, each with a different unit of approval:

| Mode           | Unit of work              | Writes need approval? |
|----------------|---------------------------|-----------------------|
| `pair`         | single command/change     | yes, per command      |
| `tdd`          | task / commit-sized item  | no                    |
| `unsupervised` | feature / whole goal      | no                    |

The nesting widens the unit of work that may be done unattended: a single command
in pair, a task in tdd, a whole feature or goal in unsupervised. Stepping up is
jef's call, not mine — if a task needs many writes, say so and suggest `tdd`
rather than quietly widening the loop.

This is a passion project, so the wiki *is* updated with committed work. Work
happens inside the devcontainer, where the containment below is enforced by the
environment rather than by good intentions — see **Containment**.

### Pair mode (default)

Pair-programming at the keyboard. Short back-and-forth, one or two ideas per
interaction — no long essays presenting a pile of options. Every idea and change
gets discussed as we go: a sentence or two saying what I'm about to do and why,
then act. No autopilot — no multi-file refactors or multi-step plans executed
without checking in between steps.

Freely, without asking:

- read files, search the repo (`rg`, `find`, `grep`), read `notes/`, `roadmap.md`
  and the wiki
- non-destructive inspection: `ls`, `cat`, `head`, `tail`, `wc`, `git status`,
  `git log`, `git diff`, and the project's read-only checks — serve the directory
  on a scratch port and look at the console

Ask for explicit approval, per command, before:

- writing, editing, creating, moving, or deleting any file — including `notes/`,
  `todo.md`, `backlog.md`, and anything outside this repo
- `git commit`, `push`, `checkout`, `reset`, `clean`, or `stash`
- anything touching `~/wiki/`, including local writes; see the Wiki section
- installing packages, editing config outside the repo, sending mail

Approval is per command, not blanket — "yes, go ahead" for one command does not
authorize the next. One approval covers one file: a multi-hunk edit within a
single file is one atomic change, but two files is two approvals. Never commit
unless asked in that same turn, even if every individual write was approved.

Full rules: read `~/tools/llm-instructions/pair.md`.

### TDD mode (interactive)

Structured mode for larger chunks of work. Two sub-modes:

- **Plan** — read `~/tools/llm-instructions/planning.md` first. Produces 1–4
  one-commit-sized items in `todo.md` and triages `backlog.md`.
- **Implement** — read `~/tools/llm-instructions/implementation.md` first. TDD
  loop with hard STOP gates requiring user approval at the task level.

Writes, edits, and commits are **not** gated per command here — the task-level
STOP gates are the approval unit. Commits remain one-item-per-commit, and I still
state intent before each task, but I don't ask before every `edit`.

### Unsupervised mode

For well-scoped work that jef approves up front and then leaves to run
independently — e.g. an overnight job, or a large translation effort like
"rewrite this in Rust + wgpu".

1. **Goal stage (conversational)**: work with jef to draft `goal.md` at the repo
   root. It must contain: the goal, constraints, a definition of done, and a
   **spend cap in dollars** agreed during the conversation. Write `goal.md` as
   a complete prompt — an agent with no other context should be able to do the
   work from it alone.
2. **Approval gate**: do not start work until jef explicitly approves `goal.md`.
   Revise and re-submit until approved.
3. **Isolate**: create a worktree before doing anything else —
   `git worktree add ../pixel-world-loop -b agent/<date> dev`, and work in
   `../pixel-world-loop`. Never work unattended in the main checkout. This is
   not optional: it is what keeps `~/projects/pixel-world` itself untouched.
4. **Independent work**: once approved, proceed without further check-ins. Track
   spend against the cap with:
   `uv run ~/tools/spend.py --cap <cap from goal.md>`
   (the script prints session spend and exits non-zero once the cap is exceeded).
   Check periodically as you work. It reports rather than interrupts, so treating
   a non-zero exit as a stop signal *is* the enforcement.
5. **Stop and report**: stop when the goal is met, the cap is exceeded, or the
   work is blocked. Push the branch, and write a summary — what was done, what
   was learned, current state, next steps, final spend from
   `uv run ~/tools/spend.py` — as a file in the branch. **Not an email:** no
   `msmtp` in this image, by design. Note in the summary what would have gone
   to `~/wiki/` had the session been supervised.

Never merge the branch, never push to `dev` or `main`, never mark a PR ready.
Leave the branch and stop.

## Containment

**Work inside the devcontainer.** Open this repo in a devcontainer (VS Code
"Reopen in Container", or `devcontainer up`) and do agent sessions there. The
containment below is enforced by the container, not by this file — running a
session on the host puts an agent on your personal SSH key and defeats all of
it. If a session is somehow running outside the container, say so before doing
anything else.

### What the container enforces

Verified by building the image and running these checks inside it. They are
properties of the environment, not promises about behaviour.

- **The personal SSH key is not present**, and no `ssh`, `scp`, `sftp`,
  `ssh-agent`, or `rsync` binary exists. Git has no SSH transport at all, so it
  cannot fall back to `~/.ssh/id_ed25519` — not even if the key were somehow
  mounted, and not even if `GIT_SSH_COMMAND` were unset.
- **One credential exists**: the repo-scoped PAT, mounted read-only. The
  `jefscad` PAT and the lab bot credential are not mounted and not reachable.
- **No `~/.aws`, `~/.azure`, `~/.config/lab-bot`, or host tool directory.**
- **`~/tools/llm-instructions/` and `~/tools/spend.py` are mounted read-only**,
  so the rules this session is operating under cannot be edited mid-session.
- `--cap-drop=ALL` and `--security-opt=no-new-privileges:true`.

Together these mean the worst realistic outcome of a bad unattended run is
**junk commits and branches inside pixel-world**. Nothing outside this
repository is reachable.

### Credentials

Agent sessions push as `jefwagner` with a fine-grained PAT scoped to this repo
only. Setup and the full permission list are in
`~/tools/llm-instructions/pat-setup.md`; the token lives at
`~/.config/jef/pixel-world-pat` (mode 600, outside the repo), mounted into the
container at the same relative path.

`git-askpass.sh` (tracked, at the repo root) reads it at call time.
`devcontainer.json` sets `GIT_ASKPASS`, `GIT_TERMINAL_PROMPT=0`, and
`GIT_SSH_COMMAND=/bin/false`. If a git command prompts interactively, something
is misconfigured — stop and say so rather than working around it.

Before the first push, the remote must be HTTPS, or git will keep using a
transport that does not exist here and the push will simply fail:

```bash
git remote set-url origin https://github.com/jefwagner/pixel-world.git
```

### Branches

- `dev` is active, `main` is release, `abandoned` is the retired Bevy
  prototype. **Never touch `abandoned`.**
- `dev` and `main` reject force-pushes and require a pull request. That binds
  jef too — nothing lands on `dev` without a PR, from either of us.
- All agent work goes on `agent/<short-desc>` branches. Never commit to `dev`.
- Prefer a worktree for anything unattended (see Unsupervised mode, step 3).

### Residual risk — the honest remainder

The container bounds the *filesystem* and the *credentials*. It does not bound:

- **Spend.** `spend.py` reports and exits non-zero; nothing interrupts. The cap
  is enforced by treating that exit code as a stop signal.
- **Repo damage.** `reset --hard`, `rm`, and a force-push to a non-protected
  branch are all still possible *within* this repo. That is why worktrees and
  branch discipline exist.
- **The agent's judgement.** A container cannot tell a good idea from a
  plausible wrong one. Keep `goal.md` narrow and its definition of done
  checkable.

## Git

- Remote is the private repo `jefwagner/pixel-world`; pushes use the agent PAT
  (see Containment), not the personal SSH key.
- Commit identity is from the user. Commit style: short summary line + longer
  body.
- Git-flow: `dev` active, `main` holds releases. Solo dev — the only branches
  beyond that are the `agent/*` work branches above.
- History note: the original Bevy/WASM prototype lives on `abandoned`; it is
  also why `dev` had lost its `.gitignore` (restored alongside these changes).

## Wiki

This is a passion project and has an LLM-managed wiki at
`~/wiki/projects/pixel-world/`, updated with committed changes. `~/wiki/kb/`
holds the distilled fundamentals. Before ending a session that produced commits,
check whether the wiki needs updating — full instructions in `~/wiki/AGENTS.md`.
The wiki is a *reference*, not a write target from implementation tasks: wiki
updates happen as their own step (wiki-sync mode), not as side-effects.

**`~/wiki/` is a separate repository on the personal account** — the one place
where an agent mistake does real damage. So: never write to it while
unsupervised (see `~/tools/llm-instructions/wiki-sync.md`), and never commit or
push it from an implementation task in any mode.
