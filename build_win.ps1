$ErrorActionPreference = "Stop"

Write-Host "=== Starting Windows Build Process ==="

# Define paths
$ROOT_DIR = Get-Location
$CLI_DIR = Join-Path $ROOT_DIR "libs\deepagents-cli"
$DESKTOP_DIR = Join-Path $ROOT_DIR "desktop"
$VENV_DIR = Join-Path $CLI_DIR ".venv"

# Use local pyinstaller config dir
$env:PYINSTALLER_CONFIG_DIR = Join-Path $CLI_DIR ".pyinstaller_config"
if (-not (Test-Path $env:PYINSTALLER_CONFIG_DIR)) {
    New-Item -ItemType Directory -Force -Path $env:PYINSTALLER_CONFIG_DIR | Out-Null
}

# 1. Install PyInstaller if missing
Write-Host "--- Installing PyInstaller ---"
Set-Location $CLI_DIR
uv pip install pyinstaller

# 2. Clean Cache (Python)
Write-Host "--- Cleaning Python Cache ---"
Set-Location $ROOT_DIR
Get-ChildItem -Path . -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path . -Recurse -File -Filter "*.pyc" | Remove-Item -Force -ErrorAction SilentlyContinue

# 3. Reinstall Package (Non-editable)
Write-Host "--- Reinstalling deepagents-cli (Non-editable) ---"
Set-Location $CLI_DIR
$env:VIRTUAL_ENV = $VENV_DIR
uv pip install .

# 4. Build Python Agent
Write-Host "--- Building Python Agent with PyInstaller ---"
if (Test-Path "build") { Remove-Item -Recurse -Force "build" }
if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }

# Run PyInstaller using the venv's executable
$PYINSTALLER_EXE = Join-Path $VENV_DIR "Scripts\pyinstaller.exe"
if (-not (Test-Path $PYINSTALLER_EXE)) {
    # Fallback if Scripts folder is lowercase or different
    $PYINSTALLER_EXE = Join-Path $VENV_DIR "bin\pyinstaller.exe"
}

& $PYINSTALLER_EXE deepagents-desktop-agent.spec -y

# 5. Copy Artifacts
Write-Host "--- Copying Agent to Desktop Resources ---"
$AGENT_DEST = Join-Path $DESKTOP_DIR "src\resources\deepagents-desktop-agent"
if (Test-Path $AGENT_DEST) { Remove-Item -Recurse -Force $AGENT_DEST }
New-Item -ItemType Directory -Force -Path (Join-Path $DESKTOP_DIR "src\resources") | Out-Null

$AGENT_SRC = Join-Path $CLI_DIR "dist\deepagents-desktop-agent"
Copy-Item -Recurse -Force $AGENT_SRC $AGENT_DEST

# 6. Build Electron App
Write-Host "--- Building Electron App ---"
Set-Location $DESKTOP_DIR
npm install
npm run build:win

Write-Host "=== Build Complete ==="
Write-Host "App should be in $DESKTOP_DIR\release\win-unpacked\Cowork.exe" (or similar)
