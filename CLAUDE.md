# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
