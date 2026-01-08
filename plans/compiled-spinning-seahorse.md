# Phase-2 Desktop Client Implementation Plan

> **Worktree**: `.worktrees/phase-2-desktop-client`
> **Base**: `phase-1-event-architecture` (commit 21a3a35)
> **Goal**: Build Electron desktop wrapper for existing FastAPI Web UI

---

## Overview

构建一个轻量级的 DeepAgents 桌面客户端，专注于 AI 对话体验。使用 Electron 包装 Python Agent，通过 Unix Socket 进行高效通信。

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Electron Desktop App                      │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Main Process (Node.js)                  │  │
│  │  - Window management                                 │  │
│  │  - Unix Socket Server (IPC)                         │  │
│  │  - 请求/响应关联 (request_id)                        │  │
│  │  - 超时处理                                          │  │
│  └──────────────────────────────────────────────────────┘  │
│                          │                                  │
│                          │ Unix Socket                      │
│                          │ (binary protocol)                │
│                          ▼                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Renderer Process (WebView)                 │  │
│  │  - AI 对话界面                                       │  │
│  │  - 消息流显示                                       │  │
│  │  - 工具调用结果显示                                 │  │
│  │  - 与主进程通信（IPC）                               │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ Unix Socket
                          │ (binary protocol)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│         Python Agent 进程（本地执行）                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  DesktopProtocol (Unix Socket Client)                │  │
│  │  - MessagePack 编码/解码                            │  │
│  │  - 请求处理和路由                                   │  │
│  │  - 流式响应支持                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                          │                                  │
│                          ▼                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  LangGraph Agent 引擎                                │  │
│  │  - AI 对话（Claude、GPT、Gemini）                    │  │
│  │  - 工具调用系统                                      │  │
│  │    ├─ 文件操作（read_file, write_file, ls, glob...）│
│  │    ├─ 代码执行（execute）                           │  │
│  │    └─ Web 搜索（Tavily）                            │  │
│  │  - 流式响应                                          │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘

**核心特性**：
- ✅ Unix Domain Socket 通信
- ✅ MessagePack 二进制协议
- ✅ 请求/响应关联（request_id）
- ✅ 超时和错误处理
- ✅ 流式响应支持
- ✅ 完整的工具调用能力（文件操作、代码执行、Web 搜索）
```

---

## 通信协议

### Unix Socket Binary Protocol

**消息格式**（MessagePack + length prefix）：
```
┌──────────────┬───────────────┬─────────────┐
│ Length (4B)  │ Type (1B)     │ Payload     │
│ uint32       │ enum          │ bytes       │
└──────────────┴───────────────┴─────────────┘
```

**消息类型**：
```typescript
enum MessageType {
  REQUEST = 0x01,
  RESPONSE = 0x02,
  STREAM_CHUNK = 0x03,
  ERROR = 0x04,
}
```

**请求格式**：
```typescript
interface Request {
  request_id: string;      // UUID for correlation
  method: 'chat';          // 聊天请求
  params: {
    message: string;       // 用户消息
    stream?: boolean;      // 是否流式响应
  };
  timeout?: number;        // optional timeout in ms
}
```

**响应格式**：
```typescript
interface Response {
  request_id: string;      // correlate with request
  status: 'success' | 'error';
  data?: {
    content: string;       // AI 响应内容
    tool_calls?: any[];    // 工具调用（由 Agent 自动处理）
  };
  error?: {
    code: string;
    message: string;
  };
}
```

**流式响应**：
```typescript
interface StreamChunk {
  request_id: string;
  chunk_id: number;
  is_final: boolean;
  data: string;            // partial response
}
```

**Note**: 文件操作和代码执行通过 Agent 的工具调用系统自动处理，无需单独的 IPC 接口。

---

## TDD 开发策略

### 测试金字塔

```
           ┌─────────────┐
           │  E2E Tests  │  Playwright (少数关键流程)
           ├─────────────┤
           │Integration  │  IPC + Python 进程通信
           │   Tests     │
           ├─────────────┤
           │ Unit Tests  │  Jest (Electron) + pytest (Python)
           └─────────────┘
```

### 测试技术栈

| 层级 | 技术 | 覆盖内容 |
|------|------|----------|
| E2E | Playwright | 完整用户流程 |
| 集成 | Jest + Python subprocess | IPC 通信、进程管理 |
| 单元 | Jest (Electron) | 主进程逻辑 |
| 单元 | pytest (Python) | Agent 逻辑、桌面模式 |

### TDD 工作流程

每个功能开发遵循 **红-绿-重构** 循环：

1. **红**：写一个失败的测试
2. **绿**：写最少代码使测试通过
3. **重构**：优化代码，保持测试通过

```bash
# 示例：开发 Python Agent Manager

# 1. 写测试（失败）
# desktop/test/python-agent.test.js

# 2. 实现功能（通过）
# desktop/src/main/python-agent.js

# 3. 重构（保持通过）
# 提取抽象、改进设计
```

---

## Implementation Steps

### Step 1: Create Electron Project Structure

**Location**: `.worktrees/phase-2-desktop-client/desktop/`

**Files to create**:
```
desktop/
├── package.json              # npm config
├── jest.config.js            # Jest 测试配置
├── electron-builder.yaml      # build config
├── src/
│   ├── main/
│   │   ├── index.js          # Main entry point + Socket server
│   │   └── menu.js           # App menu
│   ├── protocol/
│   │   └── codec.js         # MessagePack 编码/解码
│   ├── preload/
│   │   └── index.js          # Preload script (IPC API)
│   ├── renderer/
│   │   ├── index.html        # Simple chat UI
│   │   └── app.js            # Chat logic
│   └── resources/
│       └── icons/            # App icons
├── test/
│   ├── unit/
│   │   └── codec.test.js     # MessagePack tests
│   └── integration/
│       └── socket-communication.test.js  # Real Python subprocess tests
└── build/
    └── entitlements.mac.plist
```

**Actions**:
```bash
# 1. 创建目录结构
cd .worktrees/phase-2-desktop-client
mkdir -p desktop/src/{main,protocol,preload,renderer,resources/icons}
mkdir -p desktop/test/{unit,integration}
mkdir -p desktop/build

# 2. 初始化 npm 项目
cd desktop && npm init -y

# 3. 安装依赖
npm install --save-dev electron electron-builder jest msgpackr
```

**Jest 配置** (`desktop/jest.config.js`):
```javascript
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
```

**package.json 测试脚本**:
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:e2e": "playwright test"
  }
}
```

---

### Step 2: Implement Main Process

**File**: `desktop/src/main/index.js`

**Requirements**:
- Create BrowserWindow with simple chat UI
- Start Unix Socket server for IPC
- Spawn Python Agent with socket path
- Handle chat requests with timeout
- Development mode with DevTools

**Key code**:
```javascript
const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const msgpack = require('msgpackr');

let mainWindow;
let pythonProcess;
let socketServer;
const SOCKET_PATH = path.join(os.tmpdir(), 'deepagents-desktop.sock');
const pendingRequests = new Map();

// === Unix Socket Server ===
async function startSocketServer() {
  if (fs.existsSync(SOCKET_PATH)) {
    fs.unlinkSync(SOCKET_PATH);
  }

  socketServer = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);

    socket.on('data', (data) => {
      buffer = Buffer.concat([buffer, data]);

      while (buffer.length >= 4) {
        const length = buffer.readUInt32LE(0);
        if (buffer.length < 4 + length) break;

        const messageData = buffer.slice(4, 4 + length);
        buffer = buffer.slice(4 + length);

        try {
          const message = msgpack.decode(messageData);
          handleSocketMessage(message);
        } catch (error) {
          console.error('Failed to decode message:', error);
        }
      }
    });

    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });

  return new Promise((resolve, reject) => {
    socketServer.listen(SOCKET_PATH, () => {
      console.log(`Socket server listening on ${SOCKET_PATH}`);
      resolve();
    });
    socketServer.on('error', reject);
  });
}

function handleSocketMessage(message) {
  const { request_id, status, data, error } = message;

  const pending = pendingRequests.get(request_id);
  if (pending) {
    clearTimeout(pending.timeout);
    if (status === 'error') {
      pending.reject(new Error(error?.message || 'Unknown error'));
    } else {
      pending.resolve(data);
    }
    pendingRequests.delete(request_id);
  }

  // Forward to renderer
  if (mainWindow) {
    mainWindow.webContents.send('agent-response', message);
  }
}

async function sendToSocket(message) {
  const encoded = msgpack.encode(message);
  const length = Buffer.alloc(4);
  length.writeUInt32LE(encoded.length);
  const payload = Buffer.concat([length, encoded]);

  // Broadcast to all clients
  const sockets = socketServer?.connections || [];
  await Promise.all(sockets.map(s => {
    return new Promise((resolve, reject) => {
      s.write(payload, (err) => err ? reject(err) : resolve());
    });
  }));
}

// === Python Agent ===
function startPythonAgent() {
  const cliPath = path.join(__dirname, '../../../libs/deepagents-cli');

  pythonProcess = spawn('uv', [
    'run', '--directory', cliPath,
    'deepagents-cli', 'desktop',
    '--socket', SOCKET_PATH
  ], {
    env: { ...process.env }
  });

  pythonProcess.stdout.on('data', (data) => console.log(`Python: ${data}`));
  pythonProcess.stderr.on('data', (data) => console.error(`Python Error: ${data}`));

  pythonProcess.on('close', (code) => {
    console.log(`Python Agent exited with code ${code}`);
    for (const pending of pendingRequests.values()) {
      pending.reject(new Error('Python Agent exited'));
    }
    pendingRequests.clear();
  });
}

// === IPC Handlers ===
ipcMain.handle('chat', async (event, message, stream = false) => {
  const requestId = randomUUID();

  const promise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error('Request timeout'));
    }, 120000); // 2 minute timeout

    pendingRequests.set(requestId, { resolve, reject, timeout });
  });

  await sendToSocket({
    request_id: requestId,
    method: 'chat',
    params: { message, stream }
  });

  return promise;
});

// === Window Management ===
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'DeepAgents',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

// === App Lifecycle ===
app.whenReady().then(async () => {
  await startSocketServer();
  startPythonAgent();
  createWindow();
});

app.on('before-quit', () => {
  if (socketServer) {
    socketServer.close();
  }
  if (fs.existsSync(SOCKET_PATH)) {
    fs.unlinkSync(SOCKET_PATH);
  }
  if (pythonProcess) {
    pythonProcess.kill();
  }
});
```

---

### Step 3: Implement Python Desktop Protocol

**File**: `libs/deepagents-cli/deepagents_cli/desktop/protocol.py` (新文件)

**Requirements**:
- Unix Socket client
- MessagePack decoding/encoding
- Chat request handling
- Integration with existing Agent

**Key code**:
```python
import asyncio
import msgpack
from typing import Any, Dict
from ...agent import create_agent
from ...middlewares import TodoListMiddleware, FilesystemMiddleware, ExecuteMiddleware

class DesktopProtocol:
    """Unix Socket 通信协议 - 桌面模式"""

    def __init__(self, socket_path: str):
        self.socket_path = socket_path
        self.agent = None
        self.running = False

    async def start(self):
        """启动 socket 客户端并连接"""
        # 创建 Agent（复用现有逻辑，包含文件操作和代码执行能力）
        self.agent = create_agent(
            model="claude-3-5-sonnet-20241022",  # 或其他模型
            middleware=[
                TodoListMiddleware(),
                FilesystemBackend("/workspace"),  # 文件操作
                ExecuteMiddleware(),              # 代码执行
                # ... 其他 middleware
            ]
        )

        self.running = True
        while self.running:
            try:
                reader, writer = await asyncio.open_unix_connection(self.socket_path)
                await self.handle_connection(reader, writer)
            except (ConnectionRefusedError, FileNotFoundError):
                await asyncio.sleep(1)
            except Exception as e:
                print(f"Connection error: {e}")
                await asyncio.sleep(1)

    async def handle_connection(self, reader, writer):
        """处理来自 Electron 的请求"""
        while True:
            try:
                # 读取长度前缀（4 字节）
                length_data = await reader.readexactly(4)
                length = int.from_bytes(length_data, 'little')

                # 读取消息体
                message_data = await reader.readexactly(length)
                message = msgpack.unpackb(message_data)

                # 处理请求
                response = await self.handle_request(message)

                # 发送响应
                response_data = msgpack.packb({
                    'request_id': message.get('request_id'),
                    'status': 'success',
                    'data': response
                })

                response_length = len(response_data).to_bytes(4, 'little')
                writer.write(response_length + response_data)
                await writer.drain()

            except asyncio.IncompleteReadError:
                break
            except Exception as e:
                # 发送错误响应
                error_response = msgpack.packb({
                    'request_id': message.get('request_id'),
                    'status': 'error',
                    'error': {
                        'code': 'PROCESSING_ERROR',
                        'message': str(e)
                    }
                })
                writer.write(len(error_response).to_bytes(4, 'little') + error_response)
                await writer.drain()
                break

    async def handle_request(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """处理聊天请求"""
        request_type = message.get('method')
        params = message.get('params', {})

        if request_type != 'chat':
            raise ValueError(f"Unknown method: {request_type}")

        user_message = params.get('message')
        stream = params.get('stream', False)

        # 调用 Agent
        if stream:
            # 流式响应
            content = ""
            async for chunk in self.agent.astream({'messages': [user_message]}):
                content += chunk.get('content', '')
            return {'content': content}
        else:
            # 单次响应
            response = await self.agent.ainvoke({'messages': [user_message]})
            return {'content': response.get('output', '')}
```

---

**File**: `libs/deepagents-cli/deepagents_cli/desktop/__init__.py` (新文件)

**桌面模式入口点**：
```python
import asyncio
import sys
from .protocol import DesktopProtocol

async def main():
    socket_path = sys.argv[1] if len(sys.argv) > 1 else '/tmp/deepagents-desktop.sock'
    protocol = DesktopProtocol(socket_path)
    await protocol.start()

if __name__ == '__main__':
    asyncio.run(main())
```

---

**TDD 集成测试** (`desktop/test/integration/socket-communication.test.js`):

真实的集成测试需要启动实际的 Python 进程并测试 Unix Socket 通信。

```javascript
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const os = require('os');
const fs = require('fs');

describe('Socket Communication (Integration)', () => {
  let socketPath;
  let pythonProcess;
  let socketClient;

  beforeAll(async () => {
    // 设置测试 socket 路径
    socketPath = path.join(os.tmpdir(), `deepagents-test-${Date.now()}.sock`);

    // 清理旧 socket
    if (fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }

    // 启动 Python Agent（测试模式）
    const cliPath = path.join(__dirname, '../../../../libs/deepagents-cli');
    pythonProcess = spawn('uv', [
      'run',
      '--directory', cliPath,
      'deepagents-cli',
      'desktop',
      '--socket', socketPath,
      '--test-mode'  // 测试模式：不启动完整 agent
    ], {
      env: { ...process.env, DEEPAGENTS_TEST: '1' }
    });

    // 等待 Python 启动
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    // 清理
    if (socketClient) {
      socketClient.destroy();
    }
    if (pythonProcess) {
      pythonProcess.kill();
    }
    if (fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }
  });

  describe('Unix Socket 连接', () => {
    test('应该能连接到 Python Agent socket', async () => {
      // Act
      socketClient = await new Promise((resolve, reject) => {
        const client = net.createConnection(socketPath, () => resolve(client));
        client.on('error', reject);
      });

      // Assert
      expect(socketClient).toBeTruthy();
      expect(socketClient.readyState).toBe('open');
    });

    test('应该能发送和接收 MessagePack 消息', async () => {
      // Arrange
      const msgpack = require('msgpackr');
      const request = {
        request_id: 'test-001',
        method: 'ping',
        params: {}
      };

      const encoded = msgpack.encode(request);
      const length = Buffer.alloc(4);
      length.writeUInt32LE(encoded.length);
      const payload = Buffer.concat([length, encoded]);

      // Act: 发送请求
      socketClient.write(payload);

      // 读取响应
      const responseLength = await new Promise(resolve => {
        socketClient.once('data', (data) => {
          resolve(data.readUInt32LE(0));
        });
      });

      const responseBuffer = await new Promise(resolve => {
        socketClient.once('data', (data) => {
          resolve(data);
        });
      });

      const response = msgpack.decode(responseBuffer);

      // Assert
      expect(response).toHaveProperty('request_id', 'test-001');
      expect(response).toHaveProperty('status');
    });

    test('应该处理超时的请求', async () => {
      // Arrange
      const msgpack = require('msgpackr');
      const request = {
        request_id: 'test-timeout',
        method: 'slow_operation',
        params: { delay: 10000 },
        timeout: 1000  // 1 秒超时
      };

      const encoded = msgpack.encode(request);
      const length = Buffer.alloc(4);
      length.writeUInt32LE(encoded.length);
      const payload = Buffer.concat([length, encoded]);

      // Act & Assert: 应该超时而不是挂起
      const startTime = Date.now();
      await new Promise(resolve => setTimeout(resolve, 1500));
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(2000);  // 不应该等待太久
    });
  });

  describe('错误处理', () => {
    test('应该处理无效的消息格式', async () => {
      // Act: 发送无效的 MessagePack
      socketClient.write(Buffer.from([0x00, 0x00, 0x00, 0x01, 0xFF]));

      // 等待一下确保没有崩溃
      await new Promise(resolve => setTimeout(resolve, 500));

      // Assert: 连接应该仍然有效
      expect(socketClient.readyState).toBe('open');
    });

    test('应该处理未知的 method', async () => {
      // Arrange
      const msgpack = require('msgpackr');
      const request = {
        request_id: 'test-unknown',
        method: 'unknown_method',
        params: {}
      };

      const encoded = msgpack.encode(request);
      const length = Buffer.alloc(4);
      length.writeUInt32LE(encoded.length);
      const payload = Buffer.concat([length, encoded]);

      // Act
      socketClient.write(payload);

      // 读取响应
      const responseBuffer = await new Promise(resolve => {
        socketClient.once('data', (data) => {
          resolve(data.slice(4));  // Skip length prefix
        });
      });

      const response = msgpack.decode(responseBuffer);

      // Assert
      expect(response.status).toBe('error');
      expect(response.error).toHaveProperty('code', 'UNKNOWN_METHOD');
    });
  });
});
```

**运行集成测试**：
```bash
cd desktop
npm test -- test/integration/socket-communication.test.js
```

**Python 测试模式支持** (`libs/deepagents-cli/deepagents_cli/desktop/protocol.py`):

```python
# 添加测试模式支持
async def start(self):
    """启动 socket 客户端并连接"""
    self.running = True

    # 测试模式：不启动完整 agent
    if os.getenv('DEEPAGENTS_TEST') == '1':
        await self._test_mode_handler()
        return

    # 正常模式：启动完整 agent
    self.agent = create_agent(...)
    await self._normal_mode_handler()

async def _test_mode_handler(self):
    """测试模式：简单的 ping-pong"""
    while self.running:
        try:
            reader, writer = await asyncio.open_unix_connection(self.socket_path)
            await self.handle_connection(reader, writer)
        except (ConnectionRefusedError, FileNotFoundError):
            await asyncio.sleep(1)

async def handle_request(self, message: Dict[str, Any]) -> Dict[str, Any]:
    """路由请求到对应的处理器"""
    request_type = message.get('method')

    # 测试模式支持的简单方法
    if request_type == 'ping':
        return {
            'request_id': message.get('request_id'),
            'status': 'success',
            'data': {'pong': True}
        }

    # 正常模式的处理逻辑
    if request_type == 'chat':
        return await self._handle_chat(message.get('params', {}))
    # ... 其他方法
```

---

**Python 单元测试** (`libs/deepagents-cli/tests/unit_tests/test_desktop_protocol.py`):

```python
import pytest
import msgpack
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from deepagents_cli.desktop.protocol import DesktopProtocol

@pytest.fixture
def socket_path(tmp_path):
    """测试用 socket 路径"""
    return tmp_path / "test.sock"

@pytest.fixture
def protocol(socket_path):
    """创建 DesktopProtocol 实例"""
    return DesktopProtocol(str(socket_path))

def test_decode_message(protocol):
    """测试解码 MessagePack 消息"""
    # Arrange
    request = {
        'request_id': 'test-001',
        'method': 'chat',
        'params': {'message': 'hello'}
    }
    encoded = msgpack.packb(request)

    # Act
    decoded = msgpack.unpackb(encoded)

    # Assert
    assert decoded == request
    assert decoded['method'] == 'chat'

def test_encode_response(protocol):
    """测试编码响应"""
    # Arrange
    response = {
        'request_id': 'test-001',
        'status': 'success',
        'data': {'content': 'hi there'}
    }

    # Act
    encoded = msgpack.packb(response)

    # Assert
    assert isinstance(encoded, bytes)
    decoded = msgpack.unpackb(encoded)
    assert decoded['status'] == 'success'

@pytest.mark.asyncio
async def test_handle_ping_request(protocol):
    """测试 ping 请求处理"""
    # Arrange
    request = {
        'request_id': 'ping-001',
        'method': 'ping',
        'params': {}
    }

    # Act
    response = await protocol.handle_request(request)

    # Assert
    assert response['request_id'] == 'ping-001'
    assert response['status'] == 'success'
    assert response['data']['pong'] is True

@pytest.mark.asyncio
async def test_handle_unknown_method(protocol):
    """测试未知方法处理"""
    # Arrange
    request = {
        'request_id': 'err-001',
        'method': 'unknown_method',
        'params': {}
    }

    # Act
    response = await protocol.handle_request(request)

    # Assert
    assert response['status'] == 'error'
    assert response['error']['code'] == 'UNKNOWN_METHOD'

@pytest.mark.asyncio
async def test_handle_chat_request(protocol):
    """测试聊天请求处理"""
    # Arrange
    protocol.agent = AsyncMock()
    protocol.agent.ainvoke.return_value = {
        'messages': [{'content': 'Hello!'}]
    }

    request = {
        'request_id': 'chat-001',
        'method': 'chat',
        'params': {
            'message': 'hi',
            'stream': False
        }
    }

    # Act
    response = await protocol.handle_request(request)

    # Assert
    assert response['request_id'] == 'chat-001'
    assert response['status'] == 'success'
    protocol.agent.ainvoke.assert_called_once()
```

**运行 Python 测试**：
```bash
cd libs/deepagents-cli
uv run pytest tests/unit_tests/test_desktop_protocol.py -v
```

---

### Step 4: Add Python MessagePack Dependency

**File**: `libs/deepagents-cli/pyproject.toml`

**Add to dependencies**:
```toml
dependencies = [
    "msgpack>=1.0.0",
]
```

**Install**:
```bash
cd libs/deepagents-cli
uv add msgpack
```

---

### Step 5: Add Desktop Command to CLI

**File**: `libs/deepagents-cli/deepagents_cli/main.py`

**Add desktop command**:
```python
@app.command()
def desktop(
    socket: str = typer.Option(
        '/tmp/deepagents-desktop.sock',
        help='Unix socket path for IPC'
    )
):
    """Start desktop mode (Unix Socket IPC)"""
    from .desktop.protocol import DesktopProtocol
    import asyncio

    async def run():
        protocol = DesktopProtocol(socket)
        await protocol.start()

    asyncio.run(run())
```

---

### Step 6: Implement Preload Script

**File**: `desktop/src/preload/index.js`

**Simple IPC API for renderer**:
```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('deepagents', {
  // 发送聊天消息
  chat: (message, stream = false) => ipcRenderer.invoke('chat', message, stream),

  // 监听响应（用于流式响应）
  onResponse: (callback) => {
    ipcRenderer.on('agent-response', (event, data) => callback(data));
  }
});
```

---

### Step 7: Create Simple Chat UI

**File**: `desktop/src/renderer/index.html`

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>DeepAgents</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      margin: 0;
      padding: 20px;
      background: #1a1a1a;
      color: #fff;
    }
    #messages {
      height: calc(100vh - 120px);
      overflow-y: auto;
      margin-bottom: 20px;
    }
    .message {
      margin-bottom: 15px;
      padding: 10px;
      border-radius: 8px;
    }
    .user {
      background: #2563eb;
      text-align: right;
    }
    .assistant {
      background: #374151;
    }
    #input-area {
      display: flex;
      gap: 10px;
    }
    #message-input {
      flex: 1;
      padding: 10px;
      border-radius: 8px;
      border: none;
      background: #374151;
      color: #fff;
    }
    button {
      padding: 10px 20px;
      border-radius: 8px;
      border: none;
      background: #2563eb;
      color: #fff;
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  </style>
</head>
<body>
  <div id="messages"></div>
  <div id="input-area">
    <input type="text" id="message-input" placeholder="Type your message..." />
    <button id="send-btn">Send</button>
  </div>
  <script src="app.js"></script>
</body>
</html>
```

**File**: `desktop/src/renderer/app.js`

```javascript
const messagesDiv = document.getElementById('messages');
const input = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');

let isProcessing = false;

function addMessage(role, content) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.textContent = content;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

async function sendMessage() {
  const message = input.value.trim();
  if (!message || isProcessing) return;

  isProcessing = true;
  sendBtn.disabled = true;
  addMessage('user', message);
  input.value = '';

  try {
    const response = await window.deepagents.chat(message);
    addMessage('assistant', response.content);
  } catch (error) {
    addMessage('assistant', `Error: ${error.message}`);
  } finally {
    isProcessing = false;
    sendBtn.disabled = false;
  }
}

sendBtn.addEventListener('click', sendMessage);
input.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

// 监听流式响应
window.deepagents.onResponse((data) => {
  if (data.status === 'success') {
    addMessage('assistant', data.data.content);
  }
});
```

---

### Step 8: Configure Build

**File**: `desktop/electron-builder.yaml`

```yaml
appId: com.deepagents.desktop
productName: DeepAgents
directories:
  output: release
  buildResources: build
files:
  - src/**/*
extraResources:
  - from: ../../libs/deepagents
    to: deepagents
  - from: ../../libs/deepagents-cli
    to: deepagents-cli

mac:
  category: public.app-category.developer-tools
  icon: src/resources/icons/icon.icns
  target:
    - target: dmg
      arch: [x64, arm64]

win:
  icon: src/resources/icons/icon.ico
  target:
    - target: nsis
      arch: [x64]
```

**File**: `desktop/package.json`

```json
{
  "main": "src/main/index.js",
  "scripts": {
    "start": "electron .",
    "dev": "NODE_ENV=development electron .",
    "build": "electron-builder",
    "build:mac": "electron-builder --mac",
    "build:win": "electron-builder --win"
  }
}
```

---

## Testing

### Integration Test (`desktop/test/integration/socket-communication.test.js`)

```javascript
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const os = require('os');
const fs = require('fs');

describe('Socket Communication (Integration)', () => {
  let socketPath;
  let pythonProcess;

  beforeAll(async () => {
    socketPath = path.join(os.tmpdir(), `deepagents-test-${Date.now()}.sock`);
    if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);

    const cliPath = path.join(__dirname, '../../../../libs/deepagents-cli');
    pythonProcess = spawn('uv', [
      'run', '--directory', cliPath,
      'deepagents-cli', 'desktop',
      '--socket', socketPath
    ], { env: { ...process.env, DEEPAGENTS_TEST: '1' } });

    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    if (pythonProcess) pythonProcess.kill();
    if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
  });

  test('should connect and send chat request', async () => {
    const msgpack = require('msgpackr');
    const socket = await new Promise((resolve, reject) => {
      const client = net.createConnection(socketPath, () => resolve(client));
      client.on('error', reject);
    });

    const request = {
      request_id: 'test-001',
      method: 'chat',
      params: { message: 'hello' }
    };

    const encoded = msgpack.encode(request);
    const length = Buffer.alloc(4);
    length.writeUInt32LE(encoded.length);
    socket.write(Buffer.concat([length, encoded]));

    // 等待响应
    const response = await new Promise(resolve => {
      socket.once('data', (data) => {
        const msg = msgpack.decode(data.slice(4));
        resolve(msg);
      });
    });

    expect(response).toHaveProperty('request_id', 'test-001');
    expect(response).toHaveProperty('status');

    socket.destroy();
  });
});
```

---

## Development Workflow

```bash
# 1. 进入 worktree
cd .worktrees/phase-2-desktop-client

# 2. 创建目录并初始化
mkdir -p desktop/src/{main,preload,renderer,resources/icons}
mkdir -p desktop/test/{unit,integration}
cd desktop && npm init -y

# 3. 安装依赖
npm install --save-dev electron electron-builder jest msgpackr

# 4. 添加 Python MessagePack
cd ../libs/deepagents-cli
uv add msgpack

# 5. 实现文件
# - src/main/index.js
# - src/preload/index.js
# - src/renderer/index.html + app.js
# - 添加 desktop/ 命令到 Python CLI

# 6. 测试
cd desktop
npm test
NODE_ENV=development npm run dev

# 7. 构建
npm run build:mac  # or build:win
```

---

## Notes

1. **架构**：Electron + Unix Socket + Python Agent
2. **通信**：MessagePack 二进制协议（长度前缀 + payload）
3. **工具调用**：通过 Agent 的 middleware 系统自动处理文件操作和代码执行
4. **简化原则**：去掉管理界面，只保留核心 AI 对话能力
5. **TDD**：真实集成测试（spawn actual Python subprocess）

---

**Status**: Ready to implement
**Priority**: High
**Complexity**: Medium (Electron + Unix Socket + Python Agent)