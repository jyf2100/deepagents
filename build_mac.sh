#!/bin/bash
set -e

echo "=== Starting Mac Build Process ==="

# Define paths
ROOT_DIR=$(pwd)
CLI_DIR="$ROOT_DIR/libs/deepagents-cli"
DESKTOP_DIR="$ROOT_DIR/desktop"
VENV_DIR="$CLI_DIR/.venv"

# Use local pyinstaller config dir to avoid permission issues with system cache
export PYINSTALLER_CONFIG_DIR="$CLI_DIR/.pyinstaller_config"
mkdir -p "$PYINSTALLER_CONFIG_DIR"

# 1. Install PyInstaller if missing
echo "--- Installing PyInstaller ---"
cd "$CLI_DIR"
uv pip install pyinstaller

# 2. Clean Cache (Python)
echo "--- Cleaning Python Cache ---"
cd "$ROOT_DIR"
find . -type d -name "__pycache__" -exec rm -rf {} +
find . -name "*.pyc" -delete

# 3. Reinstall Package (Non-editable)
echo "--- Reinstalling deepagents-cli (Non-editable) ---"
cd "$CLI_DIR"
VIRTUAL_ENV="$VENV_DIR" uv pip install .

# 4. Build Python Agent
echo "--- Building Python Agent with PyInstaller ---"
rm -rf build dist
# Removed --clean to avoid touching protected system paths
"$VENV_DIR/bin/pyinstaller" deepagents-desktop-agent.spec -y

# 5. Copy Artifacts
echo "--- Copying Agent to Desktop Resources ---"
rm -rf "$DESKTOP_DIR/src/resources/deepagents-desktop-agent"
mkdir -p "$DESKTOP_DIR/src/resources"
cp -R "$CLI_DIR/dist/deepagents-desktop-agent" "$DESKTOP_DIR/src/resources/"

# 6. Build Electron App
echo "--- Building Electron App ---"
cd "$DESKTOP_DIR"
npm install
npm run build:mac

echo "=== Build Complete ==="
echo "App should be in $DESKTOP_DIR/release/mac-arm64/Cowork.app"
