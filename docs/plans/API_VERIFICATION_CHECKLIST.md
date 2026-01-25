# 前端菜单修改前 API 核对清单

**目的**: 确保所有前端调用的后端 API 都已实现和测试

**原则**:
1. 先核对 API，后写代码
2. 没有的 API 必须先实现后端
3. 参数必须严格匹配
4. 返回值格式必须明确

---

## ✅ API 核对步骤

### 步骤 1: 列出所有需要的 API

在修改前端之前，先列出所有需要调用的后端 API：

```
- listWorkspaces()
- createWorkspace(config)
- updateWorkspace(id, updates)
- deleteWorkspace(id)
- switchWorkspace(id)  ← 如果需要，必须先实现后端
- listConversations(workspaceId)
- createConversation(workspaceId, title)
- deleteConversation(id)
- switchConversation(workspaceId, conversationId)
- ...
```

### 步骤 2: 检查 preload.js

确认 API 已在 `desktop/src/preload/index.js` 中暴露：

```javascript
contextBridge.exposeInMainWorld('deepagents', {
  listWorkspaces: () => ipcRenderer.invoke('listWorkspaces'),
  // ... 其他 API
});
```

**检查项**:
- [ ] API 名称拼写正确
- [ ] 参数列表正确
- [ ] 返回值明确

### 步骤 3: 检查 main/index.js

确认 IPC 处理器已注册：

```javascript
ipcMain.handle('listWorkspaces', async (event, ...params) => {
  // ... 实现
});
```

**检查项**:
- [ ] 处理器名称与前端调用一致
- [ ] 参数数量和类型正确
- [ ] 错误处理完善
- [ ] 返回值格式符合前端期望

### 步骤 4: 检查 Python 后端

确认 Python 协议中有对应的方法：

```python
async def _handle_list_workspaces(self, request_id: str, params: dict) -> dict:
    # ... 实现
```

**检查项**:
- [ ] 方法名称符合命名规范（snake_case）
- [ ] 参数从 `params` 字典中正确提取
- [ ] 返回值包含 `data` 或 `error` 字段
- [ ] 已在 METHOD_MAP 中注册

### 步骤 5: 参数映射验证

创建参数映射表：

| 前端参数 | IPC 参数 | Python params | Python 使用 | 状态 |
|---------|---------|--------------|------------|-----|
| `workspaceId` | `workspaceId` | `params['workspace_id']` | `workspace_id` | ⚠️ 需要核对 |

**常见问题**:
- ❌ 前端: `workspaceId` → Python: `workspace_id` (需要转换)
- ❌ 前端: `conversationId` → Python: `conversation_id` (需要转换)

### 步骤 6: 返回值格式验证

确认所有 API 的返回值格式一致：

```javascript
// 成功
{
  data: { ... },
  error: null
}

// 失败
{
  data: null,
  error: {
    code: 'ERROR_CODE',
    message: 'Error message'
  }
}
```

---

## 🚫 常见错误示例

### 错误 1: 调用不存在的 API

```javascript
// ❌ 错误
await window.deepagents.switchWorkspace(workspaceId);
// preload.js 中没有这个 API！

// ✅ 正确
// 方案 A: 实现后端 API
// 方案 B: 使用前端状态管理（如果适用）
currentWorkspaceId = workspaceId;
```

### 错误 2: 参数不匹配

```javascript
// ❌ 错误
await window.deepagents.updateWorkspace(updates);
// 后端需要 (workspaceId, updates)

// ✅ 正确
await window.deepagents.updateWorkspace(workspaceId, updates);
```

### 错误 3: 调用不存在的函数

```javascript
// ❌ 错误
conversations.forEach(conv => {
  const item = createConversationItem(conv);  // 函数不存在！
  historyList.appendChild(item);
});

// ✅ 正确
conversations.forEach(conv => {
  const item = document.createElement('div');
  // ... 创建 DOM 的完整逻辑
  historyList.appendChild(item);
});
```

---

## 📋 API 实施前检查清单

### 准备阶段

- [ ] 列出所有需要的前端功能
- [ ] 为每个功能确定需要调用哪些 API
- [ ] 创建 API 映射表（前端 → IPC → Python）

### 验证阶段

- [ ] 检查 preload.js - 所有 API 都已暴露
- [ ] 检查 main/index.js - 所有 IPC 处理器都已注册
- [ ] 检查 Python 后端 - 所有方法都已实现
- [ ] 验证参数格式 - 前端 ↔ IPC ↔ Python 一致
- [ ] 验证返回值格式 - 统一的错误处理

### 测试阶段

- [ ] 编写 API 测试用例
- [ ] 手动测试每个 API
- [ ] 检查控制台是否有错误
- [ ] 验证边界情况（null 参数、空数组等）

### 文档阶段

- [ ] 更新 API 文档
- [ ] 记录参数格式
- [ ] 记录返回值格式
- [ ] 添加使用示例

---

## 🎯 实施建议

### 建议 1: 先实现后端，再实现前端

```
1. 实现 Python 方法
2. 注册 IPC 处理器
3. 在 preload.js 中暴露
4. 编写测试用例
5. 前端调用
```

### 建议 2: 使用 TypeScript 接口定义

```typescript
interface DeepAgentsAPI {
  listWorkspaces(): Promise<Workspace[]>;
  createWorkspace(config: WorkspaceConfig): Promise<Workspace>;
  updateWorkspace(id: string, updates: Partial<Workspace>): Promise<Workspace>;
  // ...
}
```

### 建议 3: 创建 API 汇总文档

在修改代码前，创建一个 API 汇总表，包含：
- API 名称
- 前端调用方式
- 参数列表
- 返回值格式
- 实现状态（✅ 已实现 / ⚠️ 需要实现 / ❌ 无法实现）

---

## 📝 下次实施前的准备

### 必需文档

1. **API 映射表** - 前端 ↔ 后端对应关系
2. **参数格式规范** - 命名规范、类型定义
3. **错误处理规范** - 统一的错误码和错误信息
4. **测试计划** - 每个 API 的测试用例

### 必需工具

1. **API 测试工具** - 能够直接调用 IPC 的测试脚本
2. **日志检查** - 确保所有 API 调用都有日志
3. **错误追踪** - 快速定位 API 调用失败的原因

---

**创建日期**: 2026-01-25
**目的**: 防止再次出现前端调用不存在的后端 API
**状态**: 待实施
