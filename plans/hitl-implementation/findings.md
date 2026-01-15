# 研究发现: HITL 实现调研

## LangGraph Interrupt 机制

### 核心概念
LangGraph 的 interrupt 机制允许 Agent 在执行过程中暂停，等待外部输入后继续执行。

### interrupt_on 参数
```python
interrupt_on = {
    "tool_name": {...}  # 在特定工具调用前中断
}
```

### 执行流程
1. Agent 执行到 interrupt 点
2. 抛出 `NodeInterrupt` 异常或返回特殊状态
3. 等待外部通过 `ainvoke()` 传入新的配置继续执行
4. 恢复执行

## 当前架构限制

### 单请求模式
```python
async def handle_connection(reader, writer):
    # 读取请求
    message = await read_message(reader)
    # 处理请求
    response = await handle_request(message)
    # 发送响应
    await send_response(writer, response)
    # 关闭连接
    writer.close()
```

**问题**: 连接关闭后，Agent 状态丢失，无法恢复执行。

### 所需的改动
1. **长连接模式**: 保持连接不关闭
2. **状态管理**: 跟踪每个会话的 Agent 状态
3. **双向通信**: 支持服务器主动推送消息

## Python 后端相关代码

### Agent 创建 (agent.py:454-461)
```python
if auto_approve:
    interrupt_on = {}  # 无中断
else:
    interrupt_on = _add_interrupt_on()  # 添加中断点
```

### 桌面模式当前配置 (desktop/protocol.py:65-74)
```python
self.agent, self.composite_backend = create_cli_agent(
    auto_approve=True,  # 临时设置为 True
    ...
)
```

## Electron IPC 相关代码

### 当前 IPC Handler (main/index.js:168-187)
```javascript
ipcMain.handle('chat', async (event, message, stream = false) => {
    const requestId = randomUUID();
    const promise = new Promise((resolve, reject) => {
        pendingRequests.set(requestId, { resolve, reject, timeout });
    });
    await sendToSocket({
        request_id: requestId,
        method: 'chat',
        params: { message, stream }
    });
    return promise;
});
```

### 响应处理 (main/index.js:71-89)
```javascript
function handleSocketMessage(message) {
    const pending = pendingRequests.get(request_id);
    if (pending) {
        pending.resolve(data);  // 一次性返回
    }
    // 转发到渲染进程
    mainWindow.webContents.send('agent-response', message);
}
```

## 需要新增的 IPC 消息类型

1. **interrupt_request** - Python → Electron: 请求用户确认
2. **tool_approval** - Electron → Python: 用户决定 (approve/reject)
3. **interrupt_timeout** - Python → Electron: 确认超时

## 参考实现

### CLI 模式的 HITL (execution.py:593-596)
```python
if decision.get("type") == "auto_approve_all":
    session_state.auto_approve = True
```

CLI 使用交互式输入获取用户决定，桌面模式需要使用 UI 对话框。
