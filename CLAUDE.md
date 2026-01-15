# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# RULES

1、所有事情,先做plan再执行!PLAN FIRST!PLAN FIRST!PLAN FIRST!PLAN FIRST!PLAN FIRST!
2、所有事情执行要有证据！！不能靠猜测！！！

## 项目概述

DeepAgents 是一个基于 LangGraph 构建的通用 AI Agent 框架，实现了长周期任务处理所需的核心能力：

- **规划能力**：通过 TodoListMiddleware 实现任务规划和进度追踪
- **文件系统访问**：通过可插拔的 backend 架构提供文件操作能力
- **子代理委派**：通过 SubAgentMiddleware 实现任务隔离和上下文隔离
- **人机协作**：支持 Human-in-the-loop 工作流，可配置需要人工批准的工具

## 代码库结构

```
deepagents/
├── libs/
│   ├── deepagents/          # 核心库
│   │   ├── deepagents/
│   │   │   ├── graph.py      # create_deep_agent 主入口
│   │   │   ├── middleware/   # 中间件实现
│   │   │   └── backends/     # 文件系统后端实现
│   │   └── tests/
│   └── deepagents-cli/      # CLI 应用
│       ├── deepagents_cli/
│       │   ├── main.py       # CLI 入口
│       │   ├── agent.py      # Agent 实现
│       │   ├── skills/       # Skills 系统
│       │   ├── integrations/ # 沙箱集成（Daytona/Modal/Runloop）
│       │   └── ...
│       └── tests/
└── pyproject.toml            # 根项目配置
```

## 常用命令

### 核心库 (libs/deepagents)

```bash
# 安装依赖
cd libs/deepagents
uv sync

# 运行测试
uv run pytest

# 运行单个测试文件
uv run pytest tests/integration_tests/test_deepagents.py

# 代码检查
uv run ruff check
uv run ruff format

# 类型检查
uv run mypy
```

### CLI (libs/deepagents-cli)

```bash
# 安装依赖
cd libs/deepagents-cli
uv sync

# 运行测试
uv run pytest

# 运行单元测试
uv run pytest tests/unit_tests/

# 运行集成测试
uv run pytest tests/integration_tests/

# 代码检查
uv run ruff check
uv run ruff format
```

## 核心架构

### 1. Agent 创建流程 (libs/deepagents/deepagents/graph.py)

`create_deep_agent()` 是主入口函数，按以下顺序组装中间件：

1. **TodoListMiddleware** - 任务规划和管理
2. **FilesystemMiddleware** - 文件操作（ls, read_file, write_file, edit_file, glob, grep）
3. **SubAgentMiddleware** - 子代理委派
4. **SummarizationMiddleware** - 上下文自动摘要（超过 170k tokens 时触发）
5. **AnthropicPromptCachingMiddleware** - Anthropic 提示词缓存
6. **PatchToolCallsMiddleware** - 修复中断后的工具调用
7. **HumanInTheLoopMiddleware** - 人机协作（可选，需要 `interrupt_on` 配置）

### 2. Backend 系统 (libs/deepagents/deepagents/backends/)

Backend 控制文件操作的存储方式：

- **StateBackend**（默认）：文件存储在 Agent 的临时状态中
- **FilesystemBackend**：真实的磁盘操作，需要指定 root_dir
- **StoreBackend**：使用 LangGraph Store 持久化存储
- **CompositeBackend**：根据路径路由到不同后端（用于实现长时记忆）

Backend 通过工厂函数传递，支持动态创建：

```python
backend=lambda runtime: StateBackend(runtime)
```

### 3. 中间件系统

所有中间件继承自 `AgentMiddleware`，可以：

- 注入工具（通过 `tools` 属性）
- 修改提示词（通过 `rewrite_prompt` 方法）
- 钩子到 Agent 生命周期

子代理的默认中间件配置在 `SubAgentMiddleware.default_middleware` 中。

### 4. CLI 架构 (libs/deepagents-cli/deepagents_cli/)

- **main.py**：CLI 入口，处理命令行参数
- **agent.py**：Agent 实现，集成 skills 系统
- **skills/**：Skills 加载和执行系统
- **integrations/**：沙箱集成（Daytona、Modal、Runloop）

CLI 使用 skills 系统扩展功能，skills 定义在 `~/.deepagents/skills/` 目录。

## 测试配置

- **pytest.ini**：无单独配置文件，配置在 pyproject.toml 的 `[tool.pytest.ini_options]` 中
- **asyncio_mode**：设置为 "auto"，自动处理异步测试
- **timeout**：CLI 测试默认 10 秒超时

集成测试可能需要 API 密钥，单元测试使用 mock 避免外部依赖。

## 开发注意事项

1. **Backend 实现**：如需支持 `execute` 工具（运行 shell 命令），Backend 必须实现 `SandboxBackendProtocol`
2. **中间件顺序**：中间件按列表顺序执行，某些中间件依赖其他中间件的功能
3. **上下文管理**：SummarizationMiddleware 会在上下文过大时自动摘要，保持最近 6 条消息
4. **子代理隔离**：子代理有独立的上下文窗口，不会继承主代理的历史消息
5. **系统提示词**：自定义 `system_prompt` 会追加到默认提示词之后，而非替换

## 桌面应用开发 (desktop/)

### 常见错误与解决方法

#### 错误 1：npm 构建时找不到 package.json

**错误信息**：

```
npm error code ENOENT
npm error syscall open
npm error path /Users/roc/deepagents/package.json
```

**根因**：Bash 工具每次调用都是独立的 shell 会话，`cd` 命令不会保持到下一个调用。

**正确方法**：使用 `sh -c` 在一个子 shell 中完成目录切换和命令执行：

```bash
# ❌ 错误：cd 命令不会保持
cd /Users/roc/deepagents/desktop && npm run build

# ✓ 正确：使用 sh -c 确保在正确目录执行
/bin/sh -c 'cd /Users/roc/deepagents/desktop && npm run build'
```

#### 错误 2：PyInstaller 使用旧代码

**症状**：修改代码后重新打包，但应用仍然使用旧代码。

**根因**：

1. PyInstaller 使用 `.venv` 中已安装的包，不是源代码
2. 如果包是 editable 模式安装的，PyInstaller 无法正确收集代码

**正确流程**：

```bash
# 1. 清除缓存
cd /Users/roc/deepagents
find . -type d -name "__pycache__" -exec rm -rf {} +
find . -name "*.pyc" -delete

# 2. 以非 editable 模式重新安装包
cd /Users/roc/deepagents/libs/deepagents-cli
VIRTUAL_ENV=/Users/roc/deepagents/libs/deepagents-cli/.venv \
  /Users/roc/.local/bin/uv pip install .

# 3. 重新打包
rm -rf build dist
/Users/roc/deepagents/libs/deepagents-cli/.venv/bin/pyinstaller \
  /Users/roc/deepagents/libs/deepagents-cli/deepagents-desktop-agent.spec --clean -y

# 4. 复制到 desktop 目录
rm -rf /Users/roc/deepagents/desktop/src/resources/deepagents-desktop-agent
cp -R /Users/roc/deepagents/dist/deepagents-desktop-agent \
  /Users/roc/deepagents/desktop/src/resources/

# 5. 构建 Electron 应用
/bin/sh -c 'cd /Users/roc/deepagents/desktop && npm run build'

# 6. 安装并启动
/bin/sh -c 'rm -rf /Applications/DeepAgents.app && \
  cp -R /Users/roc/deepagents/desktop/release/mac-arm64/DeepAgents.app /Applications/ && \
  open /Applications/DeepAgents.app'
```

#### 错误 3：认证错误 "Could not resolve authentication method"

**症状**：

```
Error: "Could not resolve authentication method. Expected either api_key or auth_token to be set"
```

**根因**：桌面应用硬编码了默认模型（如 `claude-sonnet-4-5-20250929`），但用户配置的是其他提供商（如 OpenAI）。

**解决方法**：在 `protocol.py` 中调用 `create_model()` 根据配置的 API key 自动选择模型：

```python
# ❌ 错误：硬编码默认模型
model=settings.model_name or "claude-sonnet-4-5-20250929"

# ✓ 正确：根据配置自动选择
from deepagents_cli.config import create_model
model = create_model()
```

#### 错误 4：工作目录显示应用安装目录

**症状**：执行 `pwd` 命令返回 `/Applications/DeepAgents.app/Contents/Resources/deepagents-desktop-agent`

**根因**：`ShellMiddleware` 使用 `Path.cwd()` 而不是工作空间的 `workspace_root`

**修复**：确保 `agent.py` 中的 `ShellMiddleware` 初始化使用正确的参数：

```python
# ❌ 错误
ShellMiddleware(
    workspace_root=str(Path.cwd()),
    env=shell_env,
)

# ✓ 正确
ShellMiddleware(
    workspace_root=str(workspace_root if workspace_root else Path.cwd()),
    env=shell_env,
)
```

### 环境变量配置

桌面应用从 `~/.deepagents/.env` 读取配置，支持以下变量：

```bash
# OpenAI 配置
openai_api_key=sk-xxx
openai_model=gpt-4o
openai_base_url=https://api.openai.com/v1

# Anthropic 配置（如果使用 Claude）
anthropic_api_key=sk-ant-xxx
anthropic_model=claude-sonnet-4-5-20250929

# Google 配置（如果使用 Gemini）
google_api_key=xxx
google_model=gemini-2-pro-preview

# 代理配置
http_proxy=http://127.0.0.1:7890
https_proxy=http://127.0.0.1:7890

# Tavily API（用于网络搜索技能）
tavily_api_key=tvly-xxx
```

**注意**：环境变量名称支持小写格式（如 `openai_api_key`），会自动映射到标准格式（如 `OPENAI_API_KEY`）。
