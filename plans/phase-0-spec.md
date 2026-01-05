# Phase 0: 架构重构 - 详细技术规格

**目的**: 在不破坏现有 CLI 功能的前提下，提取 CLI 不可知的执行逻辑，为 Web UI 做准备。

**预计工期**: 3-4 周（包含测试和验证）

**成功标准**:
- CLI 完全照常工作（无功能退化）
- 有清晰的事件处理器接口供 Web 使用
- 所有测试通过（包括回归测试）

---

## 1. 当前代码问题分析

### 1.1 执行文件分析 (`execution.py`)

**关键函数**: `execute_task()` (第 181-699 行，共 518 行)

**问题**:
- 直接导入 Rich UI 函数（第 28-35 行）
- 直接调用 `console.print()` 分散在多处
- `TokenTracker` 直接输出到控制台
- HITL 批准逻辑与终端 I/O 紧密耦合

**依赖的 UI 函数**:
```python
from deepagents_cli.ui import (
    TokenTracker,           # 第 186, 422-428, 697-698 行
    format_tool_display,
    format_tool_message_content,
    render_diff_block,      # 第 454-539 行
    render_file_operation,  # 第 440-453 行
    render_todo_list,       # 第 236-247 行
    console,                # 全局 console 对象
)
```

### 1.2 HITL 批准函数分析 (`prompt_for_tool_approval`)

**位置**: 第 40-178 行

**问题**:
- 使用 `termios.tcgetattr()` 原始终端模式（第 83 行）
- 直接写入 `sys.stdout` 带 ANSI 码（第 88-153 行）
- 使用 `sys.stdin.read(1)` 逐键输入（第 128 行）
- 完全无法在 Web 环境中使用

### 1.3 Token 追踪器分析 (`ui.py` 中的 `TokenTracker`)

**位置**: `ui.py` 第 173-234 行

**问题**:
- 直接调用 `console.print()` 显示 token 使用
- 状态与控制台输出绑定

---

## 2. 解决方案：事件驱动架构

### 2.1 核心设计原则

1. **事件是数据的唯一来源**: 所有执行状态变化都通过事件传递
2. **处理器是可插拔的**: CLI 和 Web 使用不同的处理器实现
3. **向后兼容**: 重构后的代码必须保持 CLI 功能完全不变
4. **渐进式迁移**: 先提取事件定义，再重构执行逻辑

### 2.2 事件架构

```python
# deepagents_cli/core/events.py (新文件)

from dataclasses import dataclass, field
from typing import Literal, Any, Optional
from enum import Enum

class EventType(Enum):
    """执行事件类型"""
    # Agent 状态
    THINKING_START = "thinking_start"
    THINKING_STOP = "thinking_stop"
    AGENT_MESSAGE = "agent_message"

    # 工具执行
    TOOL_START = "tool_start"
    TOOL_COMPLETE = "tool_complete"
    TOOL_ERROR = "tool_error"

    # 文件操作
    FILE_READ = "file_read"
    FILE_WRITE = "file_write"
    FILE_EDIT = "file_edit"
    FILE_DIFF = "file_diff"

    # 任务管理
    TODO_UPDATE = "todo_update"

    # HITL (Human-in-the-loop)
    HITL_PROMPT = "hitl_prompt"
    HITL_DECISION = "hitl_decision"

    # 系统事件
    ERROR = "error"
    TOKEN_USAGE = "token_usage"
    SESSION_END = "session_end"

@dataclass
class ExecutionEvent:
    """执行事件"""
    type: EventType
    data: dict[str, Any]
    timestamp: float = field(default_factory=lambda: __import__('time').time())

    def to_dict(self) -> dict:
        """转换为字典（用于 WebSocket）"""
        return {
            "type": self.type.value,
            "data": self.data,
            "timestamp": self.timestamp
        }

# ============================================================================
# 具体事件类型定义（带类型提示）
# ============================================================================

@dataclass
class ThinkingStartEvent(ExecutionEvent):
    """Agent 开始思考"""
    data: dict[str, Any] = field(default_factory=dict)

@dataclass
class ThinkingStopEvent(ExecutionEvent):
    """Agent 停止思考"""
    data: dict[str, Any] = field(default_factory=dict)

@dataclass
class AgentMessageEvent(ExecutionEvent):
    """Agent 文本消息"""
    data: dict[str, Any] = field(default_factory=lambda: {
        "content": "",      # str: 消息内容
        "done": False,      # bool: 是否完成
    })

@dataclass
class ToolStartEvent(ExecutionEvent):
    """工具执行开始"""
    data: dict[str, Any] = field(default_factory=lambda: {
        "name": "",         # str: 工具名称
        "id": "",           # str: 工具调用 ID
        "args": {},         # dict: 工具参数
    })

@dataclass
class ToolCompleteEvent(ExecutionEvent):
    """工具执行完成"""
    data: dict[str, Any] = field(default_factory=lambda: {
        "name": "",         # str: 工具名称
        "id": "",           # str: 工具调用 ID
        "result": "",       # str: 执行结果
        "duration": 0.0,    # float: 执行时长（秒）
    })

@dataclass
class FileDiffEvent(ExecutionEvent):
    """文件差异"""
    data: dict[str, Any] = field(default_factory=lambda: {
        "path": "",         # str: 文件路径
        "diff": [],         # list[dict]: 差异块
        "operation": "",    # str: 操作类型 (read/write/edit)
    })

@dataclass
class TodoUpdateEvent(ExecutionEvent):
    """任务列表更新"""
    data: dict[str, Any] = field(default_factory=lambda: {
        "todos": [],        # list[dict]: 任务列表
        "status": "",       # str: 状态 (pending/in_progress/completed)
    })

@dataclass
class HITLPromptEvent(ExecutionEvent):
    """请求人工批准"""
    data: dict[str, Any] = field(default_factory=lambda: {
        "tool_name": "",    # str: 工具名称
        "tool_args": {},    # dict: 工具参数
        "preview": "",      # str: 操作预览（diff、文件内容等）
        "can_edit": True,   # bool: 是否允许编辑参数
        "timeout": 60,      # int: 超时时间（秒）
    })

@dataclass
class HITLDecisionEvent(ExecutionEvent):
    """人工批准决策"""
    data: dict[str, Any] = field(default_factory=lambda: {
        "decision": "",     # str: 决策 (approve/reject/edit)
        "edited_args": {},  # dict: 编辑后的参数（如果决策是 edit）
    })

@dataclass
class TokenUsageEvent(ExecutionEvent):
    """Token 使用统计"""
    data: dict[str, Any] = field(default_factory=lambda: {
        "input_tokens": 0,      # int: 输入 token 数
        "output_tokens": 0,     # int: 输出 token 数
        "total_tokens": 0,      # int: 总 token 数
        "model": "",            # str: 模型名称
    })

@dataclass
class ErrorEvent(ExecutionEvent):
    """错误事件"""
    data: dict[str, Any] = field(default_factory=lambda: {
        "message": "",      # str: 错误消息
        "type": "",         # str: 错误类型
        "traceback": "",    # str: 堆栈跟踪（可选）
    })
```

### 2.3 处理器协议

```python
# deepagents_cli/core/handlers.py (新文件)

from abc import ABC, abstractmethod
from typing import AsyncIterator, Optional
from dataclasses import dataclass

from deepagents_cli.core.events import (
    ExecutionEvent,
    HITLPromptEvent,
    HITLDecisionEvent,
)

@dataclass
class Decision:
    """HITL 决策"""
    action: Literal["approve", "reject", "edit"]
    edited_args: Optional[dict] = None

class ExecutionHandler(ABC):
    """执行处理器协议（抽象基类）"""

    @abstractmethod
    async def on_event(self, event: ExecutionEvent) -> None:
        """处理执行事件

        Args:
            event: 执行事件
        """
        pass

    @abstractmethod
    async def on_hitl_prompt(self, prompt: HITLPromptEvent) -> HITLDecisionEvent:
        """请求人工批准

        Args:
            prompt: HITL 提示事件

        Returns:
            HITL 决策事件
        """
        pass

    @abstractmethod
    async def on_start(self) -> None:
        """执行开始时调用"""
        pass

    @abstractmethod
    async def on_complete(self) -> None:
        """执行完成时调用"""
        pass

    @abstractmethod
    async def on_error(self, error: Exception) -> None:
        """发生错误时调用

        Args:
            error: 异常对象
        """
        pass
```

### 2.4 CLI 处理器实现

```python
# deepagents_cli/handlers/cli.py (新文件)

from rich.console import Console
from rich.panel import Panel
from rich.syntax import Syntax

from deepagents_cli.core.handlers import ExecutionHandler, Decision
from deepagents_cli.core.events import (
    ExecutionEvent,
    HITLPromptEvent,
    HITLDecisionEvent,
    EventType,
)
from deepagents_cli.ui import (
    format_tool_display,
    format_tool_message_content,
    render_diff_block,
    render_file_operation,
    render_todo_list,
)
from deepagents_cli.execution import prompt_for_tool_approval

class CLIEventHandler(ExecutionHandler):
    """CLI 事件处理器（保持现有 Rich 输出）"""

    def __init__(self, console: Console):
        self.console = console
        self._status = None
        self._token_tracker = None

    async def on_start(self) -> None:
        """执行开始"""
        from deepagents_cli.ui import TokenTracker
        self._token_tracker = TokenTracker(self.console)

    async def on_complete(self) -> None:
        """执行完成"""
        if self._token_tracker:
            self._token_tracker.finalize()

    async def on_error(self, error: Exception) -> None:
        """错误处理"""
        self.console.print(f"[red]Error: {error}[/red]")

    async def on_event(self, event: ExecutionEvent) -> None:
        """处理事件 - 将事件转换为 Rich 输出"""
        etype = event.type

        if etype == EventType.THINKING_START:
            from rich.status import Status
            self._status = Status("Thinking...", console=self.console)
            self._status.start()

        elif etype == EventType.THINKING_STOP:
            if self._status:
                self._status.stop()
                self._status = None

        elif etype == EventType.AGENT_MESSAGE:
            content = event.data.get("content", "")
            done = event.data.get("done", False)
            if done:
                self.console.print(content)

        elif etype == EventType.TOOL_START:
            name = event.data.get("name", "")
            args = event.data.get("args", {})
            display_str = format_tool_display(name, args)
            self.console.print(f"  [dim]→[/dim] {display_str}")

        elif etype == EventType.TOOL_COMPLETE:
            name = event.data.get("name", "")
            result = event.data.get("result", "")
            if result:
                content = format_tool_message_content(name, result)
                self.console.print(content)

        elif etype == EventType.FILE_DIFF:
            path = event.data.get("path", "")
            diff = event.data.get("diff", [])
            operation = event.data.get("operation", "")
            # 调用现有的 render_diff_block 函数
            for block in render_diff_block(path, operation, diff):
                self.console.print(block)

        elif etype == EventType.TODO_UPDATE:
            todos = event.data.get("todos", [])
            # 调用现有的 render_todo_list 函数
            for line in render_todo_list(todos):
                self.console.print(line)

        elif etype == EventType.TOKEN_USAGE:
            if self._token_tracker:
                self._token_tracker.add_usage(
                    event.data.get("model", ""),
                    event.data.get("input_tokens", 0),
                    event.data.get("output_tokens", 0),
                )

        # 忽略其他事件类型（或添加处理）

    async def on_hitl_prompt(self, prompt: HITLPromptEvent) -> HITLDecisionEvent:
        """请求 HITL 批准 - 使用现有的 prompt_for_tool_approval 函数"""
        tool_name = prompt.data.get("tool_name", "")
        tool_args = prompt.data.get("tool_args", {})
        preview = prompt.data.get("preview", "")

        # 调用现有的函数（需要稍微调整以返回 Decision）
        decision = await prompt_for_tool_approval(
            tool_name=tool_name,
            tool_args=tool_args,
            preview_str=preview,
            console=self.console,
        )

        return HITLDecisionEvent(
            type=EventType.HITL_DECISION,
            data={
                "decision": decision.action,
                "edited_args": decision.edited_args,
            }
        )
```

### 2.5 WebSocket 处理器实现

```python
# deepagents_cli/handlers/websocket.py (新文件)

from fastapi import WebSocket

from deepagents_cli.core.handlers import ExecutionHandler, Decision
from deepagents_cli.core.events import (
    ExecutionEvent,
    HITLPromptEvent,
    HITLDecisionEvent,
    EventType,
)

class WebSocketEventHandler(ExecutionHandler):
    """WebSocket 事件处理器（用于 Web UI）"""

    def __init__(self, websocket: WebSocket):
        self.websocket = websocket
        self._pending_decision = None

    async def on_start(self) -> None:
        """WebSocket 连接开始"""
        await self.websocket.send_json({
            "type": "session_start",
            "data": {}
        })

    async def on_complete(self) -> None:
        """会话完成"""
        await self.websocket.send_json({
            "type": "session_end",
            "data": {}
        })

    async def on_error(self, error: Exception) -> None:
        """发送错误到 WebSocket"""
        await self.websocket.send_json({
            "type": "error",
            "data": {
                "message": str(error),
                "type": type(error).__name__
            }
        })

    async def on_event(self, event: ExecutionEvent) -> None:
        """发送事件到 WebSocket"""
        await self.websocket.send_json(event.to_dict())

    async def on_hitl_prompt(self, prompt: HITLPromptEvent) -> HITLDecisionEvent:
        """等待从 WebSocket 接收批准决策"""
        # 发送批准请求
        await self.websocket.send_json(prompt.to_dict())

        # 等待响应（带超时）
        timeout = prompt.data.get("timeout", 60)
        try:
            response = await self.websocket.receive_json(timeout=timeout)

            decision = response.get("decision")
            edited_args = response.get("edited_args")

            if decision not in ("approve", "reject", "edit"):
                raise ValueError(f"Invalid decision: {decision}")

            return HITLDecisionEvent(
                type=EventType.HITL_DECISION,
                data={
                    "decision": decision,
                    "edited_args": edited_args,
                }
            )
        except Exception as e:
            # 超时或错误，默认拒绝
            return HITLDecisionEvent(
                type=EventType.HITL_DECISION,
                data={"decision": "reject", "edited_args": None}
            )
```

### 2.6 异步后端包装器

```python
# deepagents_cli/core/async_backend.py (新文件)

import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from deepagents.backends.protocol import BackendProtocol

class AsyncBackendWrapper:
    """将同步 BackendProtocol 包装为异步接口

    这解决了在 FastAPI async 端点中调用同步文件操作的问题。
    """

    def __init__(self, backend: BackendProtocol, executor: Optional[ThreadPoolExecutor] = None):
        self._backend = backend
        self._executor = executor or ThreadPoolExecutor(max_workers=4)

    async def aread(self, path: str, offset: int = 0, limit: Optional[int] = None) -> str:
        """异步读取文件"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            self._executor,
            lambda: self._backend.read(path, offset, limit)
        )

    async def awrite(self, path: str, content: str) -> None:
        """异步写入文件"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            self._executor,
            lambda: self._backend.write(path, content)
        )

    async def aedit_file(self, path: str, old_str: str, new_str: str) -> None:
        """异步编辑文件"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            self._executor,
            lambda: self._backend.edit_file(path, old_str, new_str)
        )

    async def als(self, path: str) -> list:
        """异步列出目录"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            self._executor,
            lambda: self._backend.ls(path)
        )

    async def aglob(self, pattern: str, path: str = "/") -> list[str]:
        """异步 glob 搜索"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            self._executor,
            lambda: self._backend.glob(pattern, path)
        )

    async def agrep(self, pattern: str, path: str = "/") -> list[str]:
        """异步 grep 搜索"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            self._executor,
            lambda: self._backend.grep(pattern, path)
        )
```

---

## 3. 重构后的执行函数

```python
# deepagents_cli/execution.py (重构)

# 注意：这是一个简化的示例，实际重构需要保留所有现有逻辑

async def execute_task_with_handler(
    agent,
    user_input: str,
    handler: ExecutionHandler,
    backend: BackendProtocol,
    session_state: dict,
    auto_approve: bool = False,
    file_op_tracker: Optional[FileOpTracker] = None,
) -> None:
    """使用事件处理器执行任务（CLI 不可知）

    Args:
        agent: Agent 实例
        user_input: 用户输入
        handler: 事件处理器（CLI 或 WebSocket）
        backend: 文件系统后端
        session_state: 会话状态
        auto_approve: 是否自动批准工具
        file_op_tracker: 文件操作跟踪器（可选）
    """

    # 通知执行开始
    await handler.on_start()

    try:
        # 发送用户消息事件
        await handler.on_event(AgentMessageEvent(
            type=EventType.AGENT_MESSAGE,
            data={"content": user_input, "done": True}
        ))

        # 开始思考状态
        await handler.on_event(ThinkingStartEvent())

        # 流式执行 agent
        async for event in agent.astream(
            {"messages": [HumanMessage(content=user_input)]},
            config={"configurable": {"thread_id": session_state.get("thread_id")}}
        ):
            etype = event.get("event")

            # 处理工具调用
            if "tool_calls" in event.get("messages", [{}])[0]:
                await handler.on_event(ThinkingStopEvent())

                tool_calls = event["messages"][0]["tool_calls"]
                for tool_call in tool_calls:
                    tool_name = tool_call["name"]
                    tool_args = tool_call["args"]
                    tool_id = tool_call["id"]

                    # 发送工具开始事件
                    await handler.on_event(ToolStartEvent(
                        type=EventType.TOOL_START,
                        data={"name": tool_name, "id": tool_id, "args": tool_args}
                    ))

                    # 检查是否需要批准
                    should_approve = True
                    if not auto_approve:
                        # 构建预览
                        preview = _build_tool_preview(tool_name, tool_args, backend)

                        # 请求批准
                        decision_event = await handler.on_hitl_prompt(HITLPromptEvent(
                            type=EventType.HITL_PROMPT,
                            data={
                                "tool_name": tool_name,
                                "tool_args": tool_args,
                                "preview": preview,
                                "can_edit": True,
                                "timeout": 60,
                            }
                        ))

                        decision = decision_event.data.get("decision")
                        if decision == "reject":
                            should_approve = False
                        elif decision == "edit":
                            tool_args = decision_event.data.get("edited_args", tool_args)

                    if should_approve:
                        # 执行工具
                        result = await _execute_tool(tool_name, tool_args, backend)

                        # 发送工具完成事件
                        await handler.on_event(ToolCompleteEvent(
                            type=EventType.TOOL_COMPLETE,
                            data={
                                "name": tool_name,
                                "id": tool_id,
                                "result": result,
                            }
                        ))

                await handler.on_event(ThinkingStartEvent())

            # 处理 agent 消息
            elif etype == "chat":
                message = event.get("messages", [{}])[0]
                if hasattr(message, 'content'):
                    await handler.on_event(ThinkingStopEvent())
                    await handler.on_event(AgentMessageEvent(
                        type=EventType.AGENT_MESSAGE,
                        data={"content": str(message.content), "done": False}
                    ))

        # 最终停止思考
        await handler.on_event(ThinkingStopEvent())

    except Exception as e:
        await handler.on_error(e)
        raise
    finally:
        await handler.on_complete()
```

---

## 4. 迁移策略

### 4.1 阶段 1: 创建新文件（不修改现有代码）

**Week 1**

- [ ] 创建 `deepagents_cli/core/events.py`
- [ ] 创建 `deepagents_cli/core/handlers.py`（协议定义）
- [ ] 创建 `deepagents_cli/core/async_backend.py`
- [ ] 创建 `deepagents_cli/handlers/cli.py`
- [ ] 创建 `deepagents_cli/handlers/websocket.py`

**验证**: 所有新文件可以通过类型检查

### 4.2 阶段 2: 添加单元测试

**Week 1-2**

```python
# tests/unit_tests/test_event_system.py

import pytest
from deepagents_cli.core.events import *
from deepagents_cli.handlers.cli import CLIEventHandler
from deepagents_cli.handlers.websocket import WebSocketEventHandler

class MockWebSocket:
    async def send_json(self, data):
        self.messages.append(data)
        self.messages = []

    async def receive_json(self, timeout=None):
        return {"decision": "approve"}

@pytest.mark.asyncio
async def test_cli_handler_thinking_events():
    """测试 CLI 处理器处理思考事件"""
    from rich.console import Console
    console = Console()
    handler = CLIEventHandler(console)

    # 应该不抛出异常
    await handler.on_event(ThinkingStartEvent())
    await handler.on_event(ThinkingStopEvent())

@pytest.mark.asyncio
async def test_websocket_handler_sends_events():
    """测试 WebSocket 处理器发送事件"""
    ws = MockWebSocket()
    handler = WebSocketEventHandler(ws)

    await handler.on_event(ToolStartEvent(
        type=EventType.TOOL_START,
        data={"name": "test", "id": "1", "args": {}}
    ))

    assert len(ws.messages) == 1
    assert ws.messages[0]["type"] == "tool_start"

@pytest.mark.asyncio
async def test_async_backend_wrapper():
    """测试异步后端包装器"""
    from deepagents.backends.state import StateBackend
    from deepagents_cli.core.async_backend import AsyncBackendWrapper

    backend = StateBackend(runtime=None)
    async_backend = AsyncBackendWrapper(backend)

    # 应该不阻塞
    content = await async_backend.aread("/test.txt")
    # ... 验证结果
```

- [ ] 事件系统单元测试
- [ ] CLI 处理器单元测试
- [ ] WebSocket 处理器单元测试
- [ ] 异步后端包装器单元测试

### 4.3 阶段 3: 重构 execute_task 函数

**Week 2**

- [ ] 在 `execution.py` 中添加新的 `execute_task_with_handler()` 函数
- [ ] 保持现有 `execute_task()` 函数不变
- [ ] 添加集成测试验证新函数工作正常

### 4.4 阶段 4: 更新 CLI 调用

**Week 2-3**

- [ ] 修改 `simple_cli()` 调用新函数
- [ ] 运行完整 CLI 测试套件
- [ ] 手动测试所有 CLI 功能

**验证**: 所有 CLI 功能照常工作

### 4.5 阶段 5: 添加 Web 处理器测试

**Week 3**

- [ ] 添加 WebSocket 集成测试
- [ ] 测试 HITL 流程
- [ ] 测试错误处理

---

## 5. 测试策略

### 5.1 单元测试

每个新模块都需要单元测试：

```bash
# 运行单元测试
cd libs/deepagents-cli
uv run pytest tests/unit_tests/test_event_system.py -v
uv run pytest tests/unit_tests/test_handlers.py -v
uv run pytest tests/unit_tests/test_async_backend.py -v
```

### 5.2 集成测试

```python
# tests/integration_tests/test_cli_with_event_handler.py

import pytest
from deepagents_cli.execution import execute_task_with_handler
from deepagents_cli.handlers.cli import CLIEventHandler
from deepagents_cli.agent import create_cli_agent

@pytest.mark.asyncio
async def test_cli_execution_with_handler():
    """测试使用事件处理器的 CLI 执行"""
    agent = create_cli_agent()
    handler = CLIEventHandler(console=Console())

    # 应该成功执行
    await execute_task_with_handler(
        agent=agent,
        user_input="List files in current directory",
        handler=handler,
        backend=StateBackend(runtime=None),
        session_state={},
    )

    # 验证事件被正确发送
```

### 5.3 回归测试

**关键**: 确保重构后 CLI 功能完全不变

```bash
# 运行所有 CLI 测试
cd libs/deepagents-cli
uv run pytest tests/unit_tests/ -v
uv run pytest tests/integration_tests/ -v

# 手动测试清单
- [ ] 基本对话功能
- [ ] 工具调用（ls, read_file, write_file, edit_file）
- [ ] HITL 批准流程
- [ ] 文件操作预览（diff）
- [ ] Todo 列表显示
- [ ] Token 追踪
- [ ] 错误处理
```

---

## 6. 错误处理策略

### 6.1 WebSocket 断开处理

```python
# deepagents_cli/handlers/websocket.py

class WebSocketDisconnectError(Exception):
    """WebSocket 断开错误"""
    pass

class WebSocketEventHandler(ExecutionHandler):
    async def _send_with_disconnect_check(self):
        """发送消息并检查连接状态"""
        try:
            await self.websocket.send_json(data)
        except WebSocketDisconnect:
            raise WebSocketDisconnectError("Client disconnected")
```

### 6.2 HITL 超时处理

- 默认 60 秒超时
- 超时后自动拒绝
- 可配置超时时间

### 6.3 Agent 崩溃处理

```python
try:
    async for event in agent.astream(...):
        # 处理事件
except Exception as e:
    await handler.on_error(e)
    # 记录错误日志
    logger.error(f"Agent execution failed: {e}", exc_info=True)
    # 发送错误事件到客户端
    await handler.on_event(ErrorEvent(
        type=EventType.ERROR,
        data={
            "message": str(e),
            "type": type(e).__name__,
            "traceback": traceback.format_exc() if DEBUG else None
        }
    ))
```

---

## 7. 会话生命周期设计

### 7.1 会话状态

```python
@dataclass
class AgentSession:
    """Agent 会话"""
    session_id: str
    thread_id: str
    agent: CompiledStateGraph
    backend: BackendProtocol
    handler: ExecutionHandler
    created_at: float
    last_activity: float

    def is_expired(self, timeout: float = 1800) -> bool:
        """检查会话是否过期（默认 30 分钟）"""
        return (time.time() - self.last_activity) > timeout
```

### 7.2 会话管理器

```python
# deepagents_cli/web/session_manager.py

class SessionManager:
    """会话管理器"""

    def __init__(self):
        self._sessions: dict[str, AgentSession] = {}
        self._lock = asyncio.Lock()

    async def get_or_create_session(
        self,
        session_id: str,
        handler_factory: Callable[[], ExecutionHandler]
    ) -> AgentSession:
        """获取或创建会话"""
        async with self._lock:
            if session_id not in self._sessions:
                session = await self._create_session(session_id, handler_factory)
                self._sessions[session_id] = session
            else:
                # 更新活动时间
                self._sessions[session_id].last_activity = time.time()

            return self._sessions[session_id]

    async def cleanup_expired_sessions(self, timeout: float = 1800):
        """清理过期会话"""
        async with self._lock:
            expired = [
                sid for sid, session in self._sessions.items()
                if session.is_expired(timeout)
            ]
            for sid in expired:
                del self._sessions[sid]
```

---

## 8. 实现检查清单

### Week 1: 基础设施

- [ ] 创建 `deepagents_cli/core/events.py`
  - [ ] 定义 `EventType` 枚举
  - [ ] 定义 `ExecutionEvent` 基类
  - [ ] 定义所有具体事件类型
  - [ ] 添加单元测试

- [ ] 创建 `deepagents_cli/core/handlers.py`
  - [ ] 定义 `ExecutionHandler` 协议
  - [ ] 定义 `Decision` 数据类
  - [ ] 添加单元测试

- [ ] 创建 `deepagents_cli/core/async_backend.py`
  - [ ] 实现 `AsyncBackendWrapper`
  - [ ] 添加所有异步方法
  - [ ] 添加单元测试

- [ ] 创建 `deepagents_cli/handlers/cli.py`
  - [ ] 实现 `CLIEventHandler`
  - [ ] 集成现有 Rich 渲染函数
  - [ ] 添加单元测试

### Week 2: 处理器实现

- [ ] 创建 `deepagents_cli/handlers/websocket.py`
  - [ ] 实现 `WebSocketEventHandler`
  - [ ] 实现 HITL 等待逻辑
  - [ ] 添加单元测试

- [ ] 重构 `deepagents_cli/execution.py`
  - [ ] 添加 `execute_task_with_handler()` 函数
  - [ ] 保持现有 `execute_task()` 不变
  - [ ] 添加集成测试

- [ ] 创建 `deepagents_cli/web/session_manager.py`
  - [ ] 实现 `AgentSession`
  - [ ] 实现 `SessionManager`
  - [ ] 添加单元测试

### Week 3: 集成和验证

- [ ] 更新 `simple_cli()` 使用新函数
  - [ ] 保持所有 CLI 功能不变
  - [ ] 添加回归测试

- [ ] 运行完整测试套件
  - [ ] 单元测试
  - [ ] 集成测试
  - [ ] 手动测试清单

- [ ] 文档更新
  - [ ] 更新 CLAUDE.md
  - [ ] 添加事件系统文档
  - [ ] 添加处理器开发指南

### Week 4: Web 准备

- [ ] 创建 Web 端点示例
  - [ ] WebSocket 端点
  - [ ] 使用 `WebSocketEventHandler`
  - [ ] 添加集成测试

- [ ] 性能测试
  - [ ] 内存使用分析
  - [ ] 并发会话测试

---

## 9. 风险和缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|-----|------|------|---------|
| 重构破坏 CLI 功能 | 高 | 中 | 保留原始函数，增量迁移，完整回归测试 |
| 事件架构设计不完整 | 高 | 中 | 详细规格，原型验证，迭代完善 |
| 异步包装器性能问题 | 中 | 低 | 性能测试，使用线程池优化 |
| WebSocket 状态管理复杂 | 中 | 高 | 详细设计，超时处理，错误恢复 |
| HITL 流程变化影响用户 | 中 | 低 | 保持 CLI 体验不变，充分测试 |

---

## 10. 成功标准

### 代码质量

- [ ] 所有新代码通过类型检查 (`mypy`)
- [ ] 所有新代码通过 lint 检查 (`ruff`)
- [ ] 测试覆盖率 > 80%

### 功能验证

- [ ] CLI 所有功能照常工作
- [ ] WebSocket 处理器可以发送/接收事件
- [ ] HITL 流程在两种处理器中都正常工作
- [ ] 异步后端包装器不阻塞事件循环

### 性能

- [ ] 内存使用不显著增加
- [ ] 响应时间不明显变慢
- [ ] 支持至少 10 个并发会话

---

**规格版本**: 1.0
**创建日期**: 2026-01-05
**作者**: Claude Code (with reviewer feedback)
**状态**: 待评审
