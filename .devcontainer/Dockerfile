# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/devcontainers/base:1-ubuntu-24.04

# The single most important line in this file is the openssh purge below.
#
# openssh-client is deliberately REMOVED. Without an ssh binary on PATH, git has
# no SSH transport available at all: it cannot fall back to
# ~/.ssh/id_ed25519 even if the key were somehow present, and even if
# GIT_SSH_COMMAND were unset. The lab containers get containment from scoped bot
# credentials; this repo gets it from having exactly one credential — the
# repo-scoped PAT mounted in by devcontainer.json — and no other transport by
# which to use any credential. That is a wall, not a speed bump.
#
# This has to be an explicit purge, not an omission. The devcontainers/base
# image ships openssh-client already, so simply not listing it in the apt
# install below leaves /usr/bin/ssh in place and the whole property silently
# does not hold. Verified by building and running the image: without this
# purge, `command -v ssh` returns /usr/bin/ssh. Do not "fix" a git problem by
# reinstalling openssh-client.

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    pkg-config \
    libssl-dev \
    cmake \
    ca-certificates \
    curl \
    git \
    ddgr \
    msmtp \
    msmtp-mta \
    && rm -rf /var/lib/apt/lists/*

# Strip every openssh component, not just the client, so nothing can be
# re-enabled by pulling in a package that happens to depend on one. rsync goes
# too — it is not a credential transport (its remote mode needs an ssh binary,
# which is what the purge removes), so this is hygiene rather than a fix, but a
# file arguing for a minimal attack surface should not leave unexplained
# binaries lying in it.
RUN apt-get purge -y 'openssh-*' rsync && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /usr/bin/ssh /usr/bin/scp /usr/bin/sftp /usr/bin/ssh-agent /usr/bin/ssh-add /usr/bin/rsync

# uv, copied from the official Astral distroless image (fast, no extra cruft).
# Required, not optional: the unsupervised spend cap is invoked as
# `uv run ~/tools/spend.py`, and spend.py is a standalone PEP 723 script. If uv
# is missing that command fails, and an agent told to check a cap against a
# broken command is worse off than one with no cap at all — the check appears
# to have happened. UV_PYTHON_DOWNLOADS=automatic lets uv fetch an interpreter
# rather than depending on a system python matching the >=3.10 requirement.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_PYTHON_DOWNLOADS=automatic

# Rust toolchains, installed as vscode into the same CARGO_HOME/RUSTUP_HOME
# that devcontainer.json's remoteEnv points at.
#
# Forward-looking: the intended unsupervised job for this repo is a
# "rewrite the renderer in Rust + wgpu" translation, which needs a native
# toolchain. Installing it now means that job is not blocked on a rebuilt
# image, and it is the only way this container can do the work it exists for.
RUN mkdir -p /home/vscode/.rustup /home/vscode/.cargo
RUN chown -R vscode:vscode /home/vscode/.rustup /home/vscode/.cargo
USER vscode
ENV RUSTUP_HOME=/home/vscode/.rustup \
    CARGO_HOME=/home/vscode/.cargo
RUN curl https://sh.rustup.rs -sSf | sh -s -- -y --default-toolchain stable --profile default
ENV PATH=/home/vscode/.cargo/bin:$PATH

# Node.js (NodeSource LTS) + pi coding agent, installed natively in the image
# (reproducible; no host mounts for the binary).
USER root
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g @earendil-works/pi-coding-agent

# pi agent config dir. devcontainer.json mounts the lab-bot agent's Pi auth
# file (~/.config/lab-bot/pi-auth.json) at ~/.pi/agent/auth.json — agent-scoped,
# not repo-scoped: it is the bot's own credential, shared across the sessions
# that use it, unlike the repo-scoped PAT above. The parent dir must exist and
# be writable by vscode so pi can store models-store.json and sessions too.
#
# The startup model is pinned here (defaultProvider + defaultModel) rather than
# left to Pi's "Automatic" default. Without it, every fresh container starts on
# whatever the catalog ordering suggests, and the model a session runs is an
# accident of startup rather than part of the environment definition — the same
# reason the toolchain versions above are pinned. This only sets the startup
# default: /model still changes it for a session, and Ctrl+S there overrides it.
# Note there is no env var for this; settings.json is the only knob.
RUN mkdir -p /home/vscode/.pi/agent \
    && printf '%s\n' \
         '{' \
         '  "defaultProvider": "openrouter",' \
         '  "defaultModel": "deepseek/deepseek-v4.1-flash-1017"' \
         '}' > /home/vscode/.pi/agent/settings.json \
    && chown -R vscode:vscode /home/vscode/.pi

# Create workspace mountpoint
RUN mkdir -p /workspace && chown vscode:vscode /workspace

USER vscode
WORKDIR /workspace

# msmtp (installed above, alongside msmtp-mta) plus the ~/.msmtprc mount is how
# an unsupervised run sends its summary email — see AGENTS.md, Unsupervised mode
# step 5. It is here deliberately: mail is the one path by which content leaves
# the container, so it is the pair (package + mount) that has to be reviewed
# together. If the summary email is ever dropped, remove both in the same change
# rather than leaving the binary without the config or the config without a
# reason.

CMD ["sleep", "infinity"]
