#!/bin/bash
# .devcontainer/setup-python.sh
# Post-creation setup: Python venv + packages + Jupyter kernel

set -euo pipefail

cd /workspace

echo "→ Setting up Python environment with uv..."

# Initialize a project (idempotent — won't clobber existing pyproject.toml)
if [ ! -f pyproject.toml ]; then
    uv init --bare --python 3.12
    echo "  ✓ pyproject.toml created"
else
    echo "  · pyproject.toml exists, skipping init"
fi

# Install all required packages
echo "→ Installing packages: ipykernel jupyter numpy marimo matplotlib plotly scipy click"
uv add --frozen \
    ipykernel \
    jupyter \
    numpy \
    marimo \
    matplotlib \
    plotly \
    scipy \
    click 2>/dev/null || uv add \
    ipykernel \
    jupyter \
    numpy \
    marimo \
    matplotlib \
    plotly \
    scipy \
    click

echo "  ✓ Packages installed"

# Register a Jupyter kernel pointing to this venv
uv run python -m ipykernel install \
    --user \
    --name "rust-py-dev" \
    --display-name "Python 3.12 (rust-py-dev)"

echo "  ✓ Jupyter kernel registered"

# Verify key tools
echo ""
echo "=== Verification ==="
rustc --version || true
cargo --version || true
clippy-driver --version 2>/dev/null || cargo clippy --version 2>/dev/null || true
uv run python --version
uv --version

echo ""
echo "✅ Devcontainer setup complete"
