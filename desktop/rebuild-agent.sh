#!/bin/bash
# 快速重新打包 Python agent（不重新安装依赖）
# 使用场景：修改了 Python 代码后的快速重新打包

set -e

PROJECT_ROOT="/Users/roc/deepagents"
CLI_DIR="$PROJECT_ROOT/libs/deepagents-cli"
DESKTOP_DIR="$PROJECT_ROOT/desktop"
VENV_PATH="$CLI_DIR/.venv"

echo "========================================="
echo "  快速重新打包 Python Agent"
echo "========================================="
echo ""

# 清理之前的打包
echo "[1/3] 清理旧的打包..."
cd "$PROJECT_ROOT"
rm -rf build dist
echo "✓ 清理完成"
echo ""

# PyInstaller 打包
echo "[2/3] PyInstaller 打包..."
"$VENV_PATH/bin/pyinstaller" "$CLI_DIR/cowork-agent.spec" --clean -y
echo "✓ 打包完成"
echo ""

# 复制到 desktop 目录
echo "[3/3] 复制到 desktop 目录..."
rm -rf "$DESKTOP_DIR/src/resources/cowork-agent"
cp -R "$PROJECT_ROOT/dist/cowork-agent" "$DESKTOP_DIR/src/resources/"
echo "✓ 复制完成"
echo ""

echo "========================================="
echo "  Agent 重新打包完成！"
echo "========================================="
echo ""
echo "下一步："
echo "  运行 ./rebuild-electron.sh 重新构建 Electron 应用"
