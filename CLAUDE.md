# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# RULES

1、回复问题前先说：好的，老大
2、所有事情,先做plan再执行!PLAN FIRST!PLAN FIRST!PLAN FIRST!PLAN FIRST!PLAN FIRST!
3、所有事情执行要有证据！！不能靠猜测！！！

---

## 项目概述

DeepAgents 是基于 LangGraph 的通用 AI Agent 框架，核心能力：
- **规划能力**：TodoListMiddleware 任务规划和进度追踪
- **文件系统访问**：可插拔 backend 架构
- **子代理委派**：SubAgentMiddleware 任务隔离
- **人机协作**：Human-in-the-loop 工作流

## 代码库结构

```
deepagents/
├── libs/
│   ├── deepagents/          # 核心库
│   │   └── deepagents/
│   │       ├── graph.py      # create_deep_agent 主入口
│   │       ├── middleware/   # 中间件实现
│   │       └── backends/     # 文件系统后端
│   └── deepagents-cli/      # CLI 应用
│       └── deepagents_cli/
│           ├── main.py       # CLI 入口
│           ├── agent.py      # Agent 实现
│           └── skills/       # Skills 系统
└── desktop/                  # 桌面应用（Cowork）
    └── USER_GUIDE.md         # 桌面应用操作手册
```

## 常用命令

### 核心库 (libs/deepagents)

```bash
cd libs/deepagents
uv sync                    # 安装依赖
uv run pytest             # 运行测试
uv run ruff check          # 代码检查
```

### CLI (libs/deepagents-cli)

```bash
cd libs/deepagents-cli
uv sync
uv run pytest tests/unit_tests/     # 单元测试
uv run pytest tests/integration_tests/  # 集成测试
uv run ruff check
```

## 核心架构

### Agent 创建流程

`create_deep_agent()` 按顺序组装中间件：

1. **TodoListMiddleware** - 任务规划和管理
2. **FilesystemMiddleware** - 文件操作（ls, read_file, write_file, edit_file, glob, grep）
3. **SubAgentMiddleware** - 子代理委派
4. **SummarizationMiddleware** - 上下文自动摘要（超过 170k tokens）
5. **AnthropicPromptCachingMiddleware** - 提示词缓存
6. **PatchToolCallsMiddleware** - 修复中断后的工具调用
7. **HumanInTheLoopMiddleware** - 人机协作（可选）

### Backend 系统

Backend 控制文件操作的存储方式：

| Backend | 说明 |
|---------|------|
| StateBackend | 存储在 Agent 临时状态中（默认） |
| FilesystemBackend | 真实磁盘操作，需指定 root_dir |
| StoreBackend | 使用 LangGraph Store 持久化 |
| CompositeBackend | 根据路径路由到不同后端 |

### 中间件系统

所有中间件继承自 `AgentMiddleware`：
- **注入工具**：通过 `tools` 属性
- **修改提示词**：通过 `rewrite_prompt` 方法
- **生命周期钩子**：钩子到 Agent 生命周期

## 测试配置

- **asyncio_mode**：auto（自动处理异步测试）
- **timeout**：CLI 测试默认 10 秒超时
- 集成测试可能需要 API 密钥，单元测试使用 mock

## 开发注意事项

1. **Backend 实现**：支持 `execute` 工具需实现 `SandboxBackendProtocol`
2. **中间件顺序**：按列表顺序执行，存在依赖关系
3. **上下文管理**：SummarizationMiddleware 保持最近 6 条消息
4. **子代理隔离**：子代理有独立上下文窗口
5. **系统提示词**：自定义 `system_prompt` 追加而非替换

---

## 桌面应用开发 (desktop/)

### 重要文档

**桌面应用操作手册**：`/Users/roc/deepagents/desktop/USER_GUIDE.md`

处理桌面应用相关问题前，**必须先阅读** USER_GUIDE.md，特别是：
- 常见问题（Q&A）
- 版本历史（已知问题和修复）
- 构建脚本使用说明

### 快速构建

```bash
cd desktop

# 完整构建（3-5 分钟）
./build.sh

# 仅重新打包 Python 后端（1-2 分钟）
./rebuild-agent.sh && ./rebuild-electron.sh

# 仅重新构建前端（30-60 秒）
./rebuild-electron.sh
```

### 常见错误

#### 1. npm 构建找不到 package.json

```bash
# ❌ 错误
cd /Users/roc/deepagents/desktop && npm run build

# ✓ 正确
/bin/sh -c 'cd /Users/roc/deepagents/desktop && npm run build'
```

**根因**：Bash 工具每次调用是独立 shell 会话

#### 2. PyInstaller 使用旧代码

```bash
# 1. 清除缓存
cd /Users/roc/deepagents
find . -type d -name "__pycache__" -exec rm -rf {} +

# 2. 非 editable 模式重装
cd /Users/roc/deepagents/libs/deepagents-cli
VIRTUAL_ENV=/Users/roc/deepagents/libs/deepagents-cli/.venv \
  /Users/roc/.local/bin/uv pip install .

# 3. 重新打包
rm -rf build dist
.venv/bin/pyinstaller deepagents-desktop-agent.spec --clean -y

# 4. 复制并构建
rm -rf /Users/roc/deepagents/desktop/src/resources/deepagents-desktop-agent
cp -R /Users/roc/deepagents/dist/deepagents-desktop-agent \
  /Users/roc/deepagents/desktop/src/resources/
/bin/sh -c 'cd /Users/roc/deepagents/desktop && npm run build'
```

#### 3. 认证错误

```python
# ❌ 错误：硬编码模型
model=settings.model_name or "claude-sonnet-4-5-20250929"

# ✓ 正确：根据配置自动选择
from deepagents_cli.config import create_model
model = create_model()
```

#### 4. 工作目录显示应用安装目录

```python
# ❌ 错误
ShellMiddleware(workspace_root=str(Path.cwd()))

# ✓ 正确
ShellMiddleware(workspace_root=str(workspace_root if workspace_root else Path.cwd()))
```

### 环境变量配置

桌面应用从 `~/.deepagents/.env` 读取配置：

```bash
# AI 服务商（至少配置一个）
openai_api_key=sk-xxx
openai_model=gpt-4o
anthropic_api_key=sk-ant-xxx
anthropic_model=claude-sonnet-4-5-20250929
google_api_key=xxx
google_model=gemini-2-pro-preview

# 其他配置
tavily_api_key=tvly-xxx           # 网络搜索
http_proxy=http://127.0.0.1:7890   # 代理
skillslm_url=https://skillslm.com # 技能市场
theme=auto                        # 主题
```

### 文件结构

```
desktop/
├── src/
│   ├── main/index.js          # Electron 主进程
│   ├── preload/index.js       # 预加载脚本
│   └── renderer/
│       ├── index.html         # 前端 HTML
│       └── app.js             # 前端逻辑
├── src/resources/deepagents-desktop-agent/  # Python Agent
├── build.sh                   # 完整构建脚本
├── rebuild-agent.sh           # 重新打包 Python
├── rebuild-electron.sh        # 重新构建 Electron
└── USER_GUIDE.md              # 操作手册（必读）
```
