#!/bin/bash
# 仅重新构建 Electron 应用（不重新打包 Python agent）
# 使用场景：仅修改了前端代码后的快速重新构建

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$SCRIPT_DIR"

echo "========================================="
echo "  重新构建 Electron 应用"
echo "========================================="
echo ""

# 构建 Electron
echo "[1/2] 构建 Electron 应用..."
cd "$DESKTOP_DIR"
/bin/sh -c 'npm run build'
echo "✓ 构建完成"
echo ""

# 安装并启动
echo "[2/2] 安装并启动应用..."
/bin/sh -c 'rm -rf /Applications/Cowork.app && \
  cp -R "$DESKTOP_DIR"/release/mac-arm64/cowork.app /Applications/Cowork.app && \
  open /Applications/Cowork.app'
echo "✓ 应用已启动"
echo ""

echo "========================================="
echo "  Electron 重新构建完成！"
echo "========================================="
