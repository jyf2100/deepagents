# feat: 为 deepagents-cli 实现 Web IDE (简化版)

## 概述

为 deepagents-cli 构建一个极简的 Web 界面，使用户能够通过浏览器与 AI 编程助手交互。

**设计哲学**: 先让它工作，再让它正确，最后让它优化。

## 问题陈述 / 动机

### 当前限制

1. **仅限终端访问**：deepagents-cli 目前只能在终端中使用
2. **无远程访问**：必须 SSH 到服务器或本地运行

### 期望价值

1. **更好的可视化**：Monaco Editor 提供代码编辑体验
2. **远程访问**：通过浏览器从任何地方访问
3. **增强的文件管理**：图形化文件浏览器和差异对比

### 不做什么 (YAGNI)

- ❌ 实时协作 (用户可以屏幕共享)
- ❌ 终端模拟器 (agent 通过工具执行命令即可)
- ❌ 复杂认证系统 (MVP 不需要)
- ❌ 多数据库 (文件系统就够用)
- ❌ Kubernetes (单容器部署)

## 解决方案

极简三层架构：

```
┌─────────────────────────────────────┐
│       前端 (React + Vite)           │
│  Monaco Editor + Chat Panel         │
└─────────────────────────────────────┘
           ↕ WebSocket
┌─────────────────────────────────────┐
│      后端 (FastAPI)                 │
│  WebSocket + 3 REST endpoints       │
└─────────────────────────────────────┘
           ↕
┌─────────────────────────────────────┐
│      deepagents 核心库              │
│  (reuse existing code)              │
└─────────────────────────────────────┘
```

## 技术栈 (最小化)

### 前端
- React 18 + Vite
- Monaco Editor (@monaco-editor/react)
- 状态管理: React Context (足够用了)
- UI: Tailwind CSS (轻量级，不需要组件库)

### 后端
- FastAPI
- WebSocket
- LangGraph (使用现有 InMemorySaver)
- 文件系统: 本地磁盘

### 存储
- Agent 状态: LangGraph InMemorySaver (简单)
- 配置: 环境变量
- 文件: 本地文件系统

### 部署
- 单个 Docker 容器
- docker-compose 一键启动

**移除的复杂度** (相比原计划):
- ❌ Celery + Redis
- ❌ PostgreSQL
- ❌ S3/MinIO
- ❌ JWT 认证
- ❌ shadcn/ui
- ❌ xterm.js
- ❌ Yjs 协作
- ❌ Kubernetes

## 实现阶段

### Phase 0: 架构重构 (2 周) ⚠️ 必须首先完成

**目标**: 分离 CLI 代码和 Web 共享逻辑

#### 为什么需要 Phase 0

当前代码存在问题：
- `execution.py` 直接调用 `ui.py` 的 Rich 渲染函数
- 没有抽象层来支持不同的 UI 后端
- 工具批准逻辑与终端输入紧密耦合

#### 任务

- [ ] 创建 `deepagents_cli/core/executor.py`
  - 提取 CLI 不可知的执行逻辑
  - 定义 `ExecutionEvent` 数据结构
  - 实现 `execute_agent()` 函数，接受事件处理器回调

- [ ] 创建 `deepagents_cli/core/handlers.py`
  - 定义 `ExecutionHandler` 协议
  - `CLIEventHandler` - 调用 Rich 渲染 (现有逻辑)
  - `WebSocketEventHandler` - 发送 JSON 到 WebSocket

- [ ] 重构 `execution.py`
  - 使用新的 `execute_agent()` 函数
  - 保持 CLI 功能完全不变

- [ ] 重构 `ui.py`
  - 将渲染函数改为返回结构化数据
  - CLI handler 将数据转换为 Rich 组件

- [ ] 添加异步包装器
  - `AsyncBackendWrapper` - 将同步 BackendProtocol 转为异步
  - 使用 `run_in_executor()` 避免阻塞事件循环

#### 新的代码结构

```
deepagents_cli/
├── core/
│   ├── executor.py       # CLI 不可知的执行逻辑
│   ├── handlers.py       # 事件处理器协议
│   └── async_backend.py  # 异步后端包装器
├── ui/
│   ├── cli.py            # CLI 特定渲染 (Rich)
│   └── websocket.py      # WebSocket 特定渲染 (JSON)
├── execution.py          # 使用 core.executor
└── web/
    ├── app.py            # FastAPI 应用
    └── frontend/         # React 应用
```

#### 成功标准
- CLI 完全照常工作 (没有功能退化)
- 有清晰的事件处理器接口供 Web 使用
- 所有测试通过

---

### Phase 1A: 单用户概念验证 (2 周)

**目标**: 验证 WebSocket + LangGraph 集成是否可行

#### 后端 (Week 1)

```python
# deepagents_cli/web/app.py
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"])

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    handler = WebSocketEventHandler(websocket)
    agent = create_cli_agent()  # 复用现有函数

    try:
        while True:
            data = await websocket.receive_json()
            await execute_agent(agent, data["message"], handler)
    except WebSocketDisconnect:
        pass
```

- [ ] 创建 FastAPI 项目
- [ ] 实现 WebSocket 端点
- [ ] 实现 `WebSocketEventHandler`
- [ ] 连接 `core.executor.execute_agent()`
- [ ] 流式 agent 输出到 WebSocket

#### 前端 (Week 2)

```tsx
// App.tsx
function App() {
  const [messages, setMessages] = useState([]);
  const ws = useMemo(() => new WebSocket('ws://localhost:8000/ws'), []);

  useEffect(() => {
    ws.onmessage = (e) => setMessages(prev => [...prev, JSON.parse(e.data)]);
  }, [ws]);

  return (
    <div>
      <Chat messages={messages} />
      <Input onSend={(msg) => ws.send(JSON.stringify({message: msg}))} />
    </div>
  );
}
```

- [ ] 创建 React + Vite 项目
- [ ] 实现基本聊天界面
- [ ] WebSocket 客户端
- [ ] 消息流式显示
- [ ] Markdown 渲染 (react-markdown)

#### 成功标准
- 可以通过浏览器与 agent 对话
- 消息实时流式显示
- 一个用户使用时完全正常

---

### Phase 1B: 多用户基础 (2 周)

**目标**: 支持多个用户同时使用

#### 会话管理

- [ ] 实现内存会话存储
  ```python
  active_sessions: Dict[str, AgentSession] = {}
  ```

- [ ] 为每个连接创建独立的 agent 实例
- [ ] 支持 WebSocket 重连后恢复会话
- [ ] 会话超时清理 (30 分钟无活动)

#### 简单认证

- [ ] API Key 认证 (从环境变量读取)
- [ ] WebSocket 连接时验证 API Key
- [ ] 拒绝无效密钥的连接

```python
API_KEYS = os.getenv("DEEPAGENTS_API_KEYS", "").split(",")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, api_key: str):
    if api_key not in API_KEYS:
        await websocket.close(code=1008, reason="Invalid API key")
        return
```

#### LangGraph 持久化

- [ ] 配置 Postgres checkpointer (可选，用于跨重启持久化)
- [ ] 或者保持 InMemorySaver (简单，重启后丢失状态)

#### 成功标准
- 多个用户可以同时使用
- 会话互不干扰
- 重连后可以继续之前的会话

---

### Phase 2: 核心功能 (3 周)

**目标**: 实现主要 IDE 功能

#### Week 1: 文件浏览器

- [ ] 实现文件树组件
- [ ] 递归目录扫描
- [ ] 文件/文件夹操作 (创建、删除、重命名)
- [ ] 文件搜索 (简单字符串匹配)

#### Week 2: Monaco 编辑器

- [ ] 集成 Monaco Editor
- [ ] 打开文件到编辑器
- [ ] 保存文件 (调用 API)
- [ ] 语法高亮
- [ ] 多标签页支持

#### Week 3: 工具可视化

- [ ] 工具调用开始/结束事件
- [ ] 文件操作预览 (diff)
  - 使用 `react-diff-viewer` 或简单 before/after
- [ ] HITL 批准 UI
  - Modal 对话框
  - 显示工具、参数、预览
  - 批准/拒绝/编辑按钮

#### 后端 API

```python
# 新增 REST 端点
@app.get("/api/files")
async def list_files(path: str = "/"):
    return await async_backend.list_files(path)

@app.get("/api/files/read")
async def read_file(path: str):
    return await async_backend.read_file(path)

@app.post("/api/files/write")
async def write_file(path: str, content: str):
    return await async_backend.write_file(path, content)
```

#### 成功标准
- 完整的文件浏览和编辑体验
- AI 对话流畅工作
- 工具调用可视化清晰

---

### Phase 3: 生产就绪 (2 周)

**目标**: 部署和文档

#### Week 1: 部署

- [ ] Dockerfile
  ```dockerfile
  FROM python:3.12-slim
  WORKDIR /app
  COPY requirements.txt .
  RUN pip install -r requirements.txt
  COPY . .
  RUN cd web/frontend && npm run build
  CMD ["uvicorn", "deepagents_cli.web.app:app", "--host", "0.0.0.0"]
  ```

- [ ] docker-compose.yml
  ```yaml
  services:
    deepagents-web:
      build: .
      ports: ["8000:8000"]
      environment:
        - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
        - DEEPAGENTS_API_KEYS=${DEEPAGENTS_API_KEYS}
      volumes: ["./data:/app/data"]
  ```

- [ ] 环境变量文档
- [ ] 部署说明

#### Week 2: 测试和文档

- [ ] 基本测试
  - WebSocket 连接测试
  - Agent 执行测试
  - API 端点测试

- [ ] 用户文档
  - 安装指南
  - 使用说明
  - 常见问题

- [ ] 开发者文档
  - 架构说明
  - 本地开发指南

#### 成功标准
- 一条命令即可启动 (`docker-compose up`)
- 有完整的使用文档
- 基本测试通过

---

## 验收标准 (简化版)

### MVP 功能需求

- [ ] 通过浏览器与 deepagents 对话
- [ ] 消息实时流式显示
- [ ] 文件浏览器 (浏览、创建、删除文件)
- [ ] Monaco 编辑器 (查看、编辑文件)
- [ ] 工具调用可视化
- [ ] 文件操作 diff 预览
- [ ] HITL 批准界面

### 非功能需求

- [ ] 响应时间: AI 响应在 200ms 内开始显示
- [ ] 并发: 支持 10+ 同时在线用户 (不是 100)
- [ ] 部署: 单容器，docker-compose 启动
- [ ] 兼容: Chrome, Firefox, Safari, Edge 最新版本

---

## 关键架构决策

### ADR-001: 先做架构重构

**决定**: Phase 0 必须首先完成，重构现有 CLI 代码

**理由**:
- 当前代码与 CLI UI 紧密耦合
- 没有抽象层无法支持 Web UI
- 现在重构比后面打补丁更省时间

**后果**:
- 增加 2 周前期投入
- 但后续开发更顺畅
- CLI 和 Web 共享核心逻辑

### ADR-002: 单用户优先

**决定**: Phase 1A 先做单用户，Phase 1B 再加多用户

**理由**:
- 验证核心可行性最重要
- 避免过度设计会话管理
- 单用户可以暴露真正的问题

**后果**:
- Phase 1A 代码需要重构
- 但重构成本不高
- 更快得到反馈

### ADR-003: 不做协作功能

**决定**: 移除 Phase 3 的实时协作

**理由**:
- 协作是"想要"不是"需要"
- 增加巨大复杂度 (Yjs, CRDT)
- 用户可以屏幕共享

**后果**:
- 更简单的架构
- 更快的交付
- 如果用户真的需要，再加

### ADR-004: 使用最简单的存储

**决定**: 使用 InMemorySaver + 文件系统，不引入数据库

**理由**:
- MVP 不需要跨重启持久化
- Postgres 增加运维成本
- 文件系统足够了

**后果**:
- 重启后丢失会话历史
- 但这是可接受的权衡
- 后续需要可以加 Postgres

---

## 风险和缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|-----|------|------|---------|
| WebSocket 重连复杂 | 中 | 中 | Phase 1A 先不处理，Phase 1B 实现 |
| Agent 内存占用 | 中 | 中 | 监控内存，会话超时清理 |
| 文件并发冲突 | 低 | 低 | 后端加文件锁，最后写入胜 |
| 浏览器兼容性 | 低 | 低 | 使用现代浏览器，放弃 IE |

---

## 实现前需要回答的问题

1. **会话持久化**: 用户刷新页面，agent 继续运行还是暂停？
   - 答案: 暂停，重连后恢复

2. **文件操作冲突**: 用户在 Monaco 编辑时 agent 写入同一文件？
   - 答案: 后端加锁，显示冲突提示

3. **认证**: 谁是用户？
   - 答案: MVP 单用户或 API Key 认证

4. **部署**: 单服务器还是分布式？
   - 答案: 单服务器，docker-compose

---

## 参考资源

### 内部参考

- **Agent 创建**: `libs/deepagents-cli/deepagents_cli/agent.py:326`
- **执行逻辑**: `libs/deepagents-cli/deepagents_cli/execution.py:181`
- **UI 渲染**: `libs/deepagents-cli/deepagents_cli/ui.py:1`

### 外部参考

- [Building Real-Time Applications with FastAPI and WebSockets](https://python.plainenglish.io/building-real-time-applications-with-fastapi-and-websockets-in-2025-and-beyond-b613461dc4a3)
- [Claude Code on the Web](https://www.cursor-ide.com/blog/claude-code-on-the-web)
- [Monaco Editor React](https://github.com/suren-atoyan/monaco-react)

---

## 总结

**简化后的计划**:
- **总工期**: 11 周 (Phase 0: 2周 + Phase 1A: 2周 + Phase 1B: 2周 + Phase 2: 3周 + Phase 3: 2周)
- **技术栈**: React + FastAPI + Monaco + WebSocket
- **部署**: 单容器 Docker
- **复杂度**: 中 (相比原计划的"高")

**移除的功能** (相比原计划):
- ❌ 实时协作 (Yjs)
- ❌ 终端模拟器 (xterm.js)
- ❌ 复杂认证 (JWT)
- ❌ 多数据库 (PostgreSQL, Redis)
- ❌ 对象存储 (S3)
- ❌ 任务队列 (Celery)
- ❌ 容器编排 (Kubernetes)

**核心哲学**: 先让它工作，再让它正确，最后让它优化。

---

**计划创建日期**: 2026-01-05
**上次修改**: 2026-01-05 (简化版)
**预计总工期**: 11 周
**优先级**: 高
**复杂度**: 中
