#!/bin/bash
# DeepAgents Desktop 桌面应用构建脚本
# 功能：清理环境 -> 重新安装依赖 -> 打包 Python agent -> 构建 Electron 应用

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PROJECT_ROOT="/Users/roc/deepagents"
CLI_DIR="$PROJECT_ROOT/libs/deepagents-cli"
DESKTOP_DIR="$PROJECT_ROOT/desktop"
VENV_PATH="$CLI_DIR/.venv"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  DeepAgents Desktop 构建脚本${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 步骤 1: 清理缓存和构建文件
echo -e "${YELLOW}[1/6] 清理缓存和构建文件...${NC}"
cd "$PROJECT_ROOT"
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find . -name "*.pyc" -delete 2>/dev/null || true
rm -rf build dist
echo -e "${GREEN}✓ 清理完成${NC}"
echo ""

# 步骤 2: 重新安装 deepagents-cli
echo -e "${YELLOW}[2/6] 重新安装 deepagents-cli (非 editable 模式)...${NC}"
cd "$CLI_DIR"
if [ -n "$HTTP_PROXY" ]; then
    echo "使用代理: $HTTP_PROXY"
    HTTP_PROXY=$HTTP_PROXY HTTPS_PROXY=$HTTPS_PROXY /Users/roc/.local/bin/uv pip install . --reinstall
else
    /Users/roc/.local/bin/uv pip install . --reinstall
fi
echo -e "${GREEN}✓ 安装完成${NC}"
echo ""

# 步骤 3: PyInstaller 打包
echo -e "${YELLOW}[3/6] PyInstaller 打包 Python agent...${NC}"
cd "$PROJECT_ROOT"
rm -rf build dist
"$VENV_PATH/bin/pyinstaller" "$CLI_DIR/deepagents-desktop-agent.spec" --clean -y
echo -e "${GREEN}✓ 打包完成: dist/deepagents-desktop-agent${NC}"
echo ""

# 步骤 4: 复制到 desktop 目录
echo -e "${YELLOW}[4/6] 复制 agent 到 desktop 目录...${NC}"
rm -rf "$DESKTOP_DIR/src/resources/deepagents-desktop-agent"
cp -R "$PROJECT_ROOT/dist/deepagents-desktop-agent" "$DESKTOP_DIR/src/resources/"
echo -e "${GREEN}✓ 复制完成${NC}"
echo ""

# 步骤 5: 构建 Electron 应用
echo -e "${YELLOW}[5/6] 构建 Electron 应用...${NC}"
cd "$DESKTOP_DIR"
/bin/sh -c 'npm install && npm run build'
echo -e "${GREEN}✓ Electron 构建完成${NC}"
echo ""

# 步骤 6: 安装并启动应用
echo -e "${YELLOW}[6/6] 安装并启动应用...${NC}"
/bin/sh -c 'rm -rf /Applications/DeepAgents.app && \
  cp -R /Users/roc/deepagents/desktop/release/mac-arm64/Cowork.app /Applications/DeepAgents.app && \
  open /Applications/DeepAgents.app'
echo -e "${GREEN}✓ 应用已启动${NC}"
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  构建完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "应用位置: /Applications/DeepAgents.app"
echo "DMG 文件:"
echo "  - ARM64: $DESKTOP_DIR/release/Cowork-0.0.1-arm64.dmg"
echo "  - x64:   $DESKTOP_DIR/release/Cowork-0.0.1.dmg"
echo ""
echo -e "${YELLOW}提示: 如需使用代理，运行:${NC}"
echo "  HTTP_PROXY=http://127.0.0.1:7890 HTTPS_PROXY=http://127.0.0.1:7890 ./build.sh"
