# DeepAgents Desktop 构建脚本

## 脚本说明

### 1. `build.sh` - 完整构建脚本
**用途**: 从头开始完整构建整个应用
**场景**: 首次构建、依赖有变化、需要确保使用最新代码

**执行步骤**:
1. 清理缓存和构建文件
2. 重新安装 deepagents-cli (非 editable 模式)
3. PyInstaller 打包 Python agent
4. 复制 agent 到 desktop 目录
5. 构建 Electron 应用
6. 安装并启动应用

**使用方法**:
```bash
cd /Users/roc/deepagents/desktop
./build.sh

# 如需使用代理
HTTP_PROXY=http://127.0.0.1:7890 HTTPS_PROXY=http://127.0.0.1:7890 ./build.sh
```

**预计耗时**: 3-5 分钟

---

### 2. `rebuild-agent.sh` - 快速重新打包 Python Agent
**用途**: 仅重新打包 Python 后端代码
**场景**: 修改了 Python 代码（workspace.py, protocol.py 等）后使用

**执行步骤**:
1. 清理旧的打包
2. PyInstaller 打包
3. 复制到 desktop 目录

**使用方法**:
```bash
cd /Users/roc/deepagents/desktop
./rebuild-agent.sh

# 然后执行
./rebuild-electron.sh
```

**预计耗时**: 1-2 分钟

---

### 3. `rebuild-electron.sh` - 仅重新构建 Electron
**用途**: 仅重新构建前端 Electron 应用
**场景**: 仅修改了前端代码（index.html, app.js, preload.js 等）后使用

**执行步骤**:
1. 构建 Electron 应用
2. 安装并启动应用

**使用方法**:
```bash
cd /Users/roc/deepagents/desktop
./rebuild-electron.sh
```

**预计耗时**: 30-60 秒

---

## 构建产物

构建完成后，产物位于 `release/` 目录：

```
release/
├── Cowork-0.0.1.dmg              # x64 版本 DMG
├── Cowork-0.0.1-arm64.dmg        # ARM64 版本 DMG (Apple Silicon)
└── mac-arm64/                    # ARM64 应用目录
    └── Cowork.app
```

---

## 快速参考

| 修改内容 | 使用的脚本 |
|----------|-----------|
| Python 后端代码 | `./rebuild-agent.sh` + `./rebuild-electron.sh` |
| 前端代码 | `./rebuild-electron.sh` |
| 依赖/配置 | `./build.sh` |
| 不确定 | `./build.sh` (完整构建) |

---

## 注意事项

1. **Editable 安装问题**: 不要使用 `uv pip install -e .`，PyInstaller 无法正确收集 editable 模式的代码
2. **代理设置**: 如果网络较慢，使用 `HTTP_PROXY` 和 `HTTPS_PROXY` 环境变量
3. **清理**: 如果遇到奇怪的错误，可以先手动清理：
   ```bash
   cd /Users/roc/deepagents
   find . -type d -name "__pycache__" -exec rm -rf {} +
   rm -rf build dist
   ```
