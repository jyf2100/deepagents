# HITL 架构设计文档

## 1. 长连接通信协议

### 当前模式 (单请求)
```
Electron                    Python
  |                          |
  |--- request ----------->|
  |                          |  (处理请求)
  |<- response ------------|
  |                          |
  X (连接关闭)               X
```

### 目标模式 (长连接)
```
Electron                    Python
  |                          |
  |--- connect ------------>|
  |<-- accept --------------|
  |                          |
  |--- chat request ------>|
  |                          |  (Agent 执行)
  |<- interrupt_request ---|  (遇到 interrupt)
  |                          |  (等待用户决定)
  |--- tool_approval ------>|  (approve/reject)
  |                          |  (恢复执行)
  |<-- response ------------|
  |                          |
  |--- keep-alive -------->|
  |<-- pong ----------------|  (保持连接)
  |                          |
```

## 2. IPC 消息格式

### interrupt_request (Python → Electron)
```json
{
  "type": "interrupt_request",
  "request_id": "uuid",
  "data": {
    "thread_id": "desktop",
    "tool_name": "write_file",
    "tool_input": {"path": "test.txt", "content": "..."},
    "message": "Agent 请求执行 write_file 操作"
  }
}
```

### tool_approval (Electron → Python)
```json
{
  "type": "tool_approval",
  "request_id": "uuid",
  "data": {
    "action": "approve",  // or "reject"
    "thread_id": "desktop"
  }
}
```

### chat_response (Python → Electron)
```json
{
  "type": "chat_response",
  "request_id": "uuid",
  "status": "success",
  "data": {
    "content": "Agent 的回复内容"
  }
}
```

## 3. 状态管理

### 会话状态结构
```python
class SessionState:
    request_id: str
    thread_id: str
    agent_state: dict  # Agent checkpoint
    pending_tool: ToolCall | None
    status: "idle" | "processing" | "waiting_approval"
```

### 状态转换
```
idle → processing (收到 chat 请求)
processing → waiting_approval (遇到 interrupt)
waiting_approval → processing (收到用户决定)
processing → idle (请求完成)
```

## 4. 前端 UI 设计

### 工具确认对话框
```
┌─────────────────────────────────┐
│  工具执行确认                    │
├─────────────────────────────────┤
│  Agent 即将执行以下操作:         │
│                                 │
│  工具: write_file               │
│  路径: ~/.bashrc                │
│                                 │
│  [取消]  [允许执行]              │
└─────────────────────────────────┘
```

### UI 状态
- **idle**: 正常状态，可以发送新消息
- **processing**: 显示"思考中..."
- **waiting_approval**: 显示确认对话框，阻止其他操作

## 5. 后端实现要点

### 长连接模式
```python
async def handle_connection(self, reader, writer):
    session = SessionState(writer=writer)

    # 保持连接，循环处理消息
    while self.running:
        try:
            # 读取消息（带超时）
            message = await asyncio.wait_for(
                self.read_message(reader),
                timeout=30.0
            )

            # 处理消息
            if message["type"] == "chat":
                await self._handle_chat(session, message)
            elif message["type"] == "tool_approval":
                await self._handle_approval(session, message)

        except asyncio.TimeoutError:
            # 发送心跳
            await self.send_heartbeat(session)
```

### Interrupt 处理
```python
async def _handle_chat(self, session, message):
    config = {"configurable": {"thread_id": session.thread_id}}

    try:
        # 异步流式执行，捕获 interrupt
        async for chunk in self.agent.astream(message, config):
            if self._is_interrupt(chunk):
                # 保存状态，发送确认请求
                session.agent_state = chunk
                session.pending_tool = self._get_tool_call(chunk)
                await self.send_interrupt_request(session)
                return  # 等待用户决定

            # 正常流式输出
            await self.send_chunk(session, chunk)

    except NodeInterrupt as interrupt:
        # LangGraph 中断异常
        session.agent_state = interrupt.state
        await self.send_interrupt_request(session)
```

### 恢复执行
```python
async def _handle_approval(self, session, message):
    action = message["data"]["action"]

    if action == "reject":
        # 拒绝：终止执行
        await self.send_rejection(session)
        return

    # 批准：恢复执行
    config = {
        "configurable": {
            "thread_id": session.thread_id
        }
    }

    # 从中断点继续
    async for chunk in self.agent.astream(
        session.agent_state,
        config
    ):
        await self.send_chunk(session, chunk)
```

## 6. 实现顺序

1. **Python 后端 - 长连接模式**
   - 修改 `handle_connection` 不关闭连接
   - 添加心跳机制
   - 实现消息循环

2. **Python 后端 - Interrupt 处理**
   - 检测 interrupt 状态
   - 发送 interrupt_request 消息
   - 实现状态保存/恢复

3. **Electron 主进程 - IPC 扩展**
   - 添加 interrupt_request 监听
   - 添加 tool_approval 发送
   - 添加会话状态管理

4. **Electron 渲染进程 - UI**
   - 实现工具确认对话框
   - 实现用户操作处理
   - 添加状态指示器

5. **集成测试**
   - 端到端测试完整流程
   - 边界情况测试
