# 前后端交互 API 接口清单

> **确保新版本左侧菜单设计完全兼容现有 IPC 通信接口**

---

## IPC 通信架构

**通信方式**: Electron IPC (invoke/handle 模式)
**实现位置**:
- 主进程: `/Users/roc/deepagents/desktop/src/main/index.js`
- 预加载脚本: `/Users/roc/deepagents/desktop/src/preload/index.js`
- 前端调用: `window.deepagents.<apiName>()`

**通用响应格式**:
```javascript
{
  status: 'success' | 'error',
  data: any,      // 成功时返回的数据
  error: string   // 错误时返回的错误信息
}
```

---

## 1. 聊天消息

### `chat(message, stream, workspaceId, conversationId, requestId)`

**功能**: 发送聊天消息给 Agent

**输入参数**:
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| message | string | 是 | - | 用户消息内容 |
| stream | boolean | 否 | false | 是否流式响应 |
| workspaceId | string \| null | 否 | null | 工作空间 ID |
| conversationId | string \| null | 否 | null | 对话 ID |
| requestId | string \| null | 否 | null | 客户端请求 ID |

**返回值**: Promise\<AgentResponse\>

**流式响应**: 通过 `window.deepagents.onChunk(callback)` 监听

**相关事件**:
- `agent-response` - 响应完成事件
- `chat-chunk` - 流式数据块事件

---

## 2. 技能管理

### `listSkills()`

**功能**: 获取技能列表

**输入参数**: 无

**返回值**: Promise\<{ status, data: Skill[] }\>

```typescript
type Skill = {
  name: string;
  description?: string;
  location: 'user' | 'project' | 'builtin';
}
```

---

### `uploadSkill(skillName, files, location)`

**功能**: 上传技能文件

**输入参数**:
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| skillName | string | 是 | - | 技能名称 |
| files | string[] | 是 | - | 文件路径数组 |
| location | string | 否 | 'project' | 安装位置 |

**返回值**: Promise\<{ status, data }\>

---

### `cloneSkillFromGithub(githubUrl, location, useProxy)`

**功能**: 从 GitHub 克隆技能

**输入参数**:
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| githubUrl | string | 是 | - | GitHub 仓库 URL |
| location | string | 否 | 'project' | 安装位置 |
| useProxy | boolean | 否 | false | 是否使用代理 |

**返回值**: Promise\<{ status, data }\>

---

### `scanGithubForSkills(githubUrl, useProxy)`

**功能**: 扫描 GitHub 仓库中的技能

**输入参数**:
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| githubUrl | string | 是 | - | GitHub 仓库 URL |
| useProxy | boolean | 否 | false | 是否使用代理 |

**返回值**: Promise\<{ status, data: SkillInfo[] }\>

---

### `importSelectedSkills(tempDir, selectedSkills, location)`

**功能**: 导入选定的技能

**输入参数**:
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| tempDir | string | 是 | - | 临时目录路径 |
| selectedSkills | string[] | 是 | - | 选中的技能列表 |
| location | string | 否 | 'project' | 安装位置 |

**返回值**: Promise\<{ status, data }\>

---

### `deleteSkill(skillName, location)`

**功能**: 删除技能

**输入参数**:
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| skillName | string | 是 | - | 技能名称 |
| location | string | 否 | 'auto' | 技能位置 |

**返回值**: Promise\<{ status, data }\>

---

## 3. HITL 工具批准

### `sendToolApproval(requestId, action)`

**功能**: 发送工具批准决定

**输入参数**:
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| requestId | string | 是 | - | 工具请求 ID |
| action | 'approve' | 'reject' | 是 | - | 批准或拒绝 |

**返回值**: Promise\<{ status }\>

---

## 4. 配置管理

### `getConfig()`

**功能**: 获取应用配置

**输入参数**: 无

**返回值**: Promise\<{ status, data: Config }\>

```typescript
type Config = {
  model_name?: string;
  api_key?: string;
  base_url?: string;
  // ... 其他配置
}
```

---

### `setConfig(config)`

**功能**: 设置应用配置

**输入参数**: `config: Config`

**返回值**: Promise\<{ status }\>

---

### `reloadConfig()`

**功能**: 重新加载配置

**输入参数**: 无

**返回值**: Promise\<{ status }\>

---

### `checkConfigStatus()`

**功能**: 检查配置状态

**输入参数**: 无

**返回值**: Promise\<{ status, data: ConfigStatus }\>

```typescript
type ConfigStatus = {
  hasApiKey: boolean;
  hasModel: boolean;
  // ... 其他状态
}
```

---

## 5. 工作空间管理

### `listWorkspaces()`

**功能**: 列出所有工作空间

**输入参数**: 无

**返回值**: Promise\<{ status, data: Workspace[] }\>

```typescript
type Workspace = {
  id: string;
  name: string;
  category: string;
  icon: string;
  enabled_skills: string[];
  system_prompt?: string;
  root_dir?: string;
}
```

---

### `createWorkspace(config)`

**功能**: 创建新工作空间

**输入参数**:
```typescript
type CreateWorkspaceConfig = {
  id?: string;
  name: string;
  category?: string;
  enabled_skills?: string[];
  icon?: string;
}
```

**返回值**: Promise\<{ status, data: Workspace }\>

---

### `deleteWorkspace(workspaceId)`

**功能**: 删除工作空间

**输入参数**:
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| workspaceId | string | 是 | - | 工作空间 ID |

**返回值**: Promise\<{ status }\>

---

### `updateWorkspace(workspaceId, updates)`

**功能**: 更新工作空间配置

**输入参数**:
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| workspaceId | string | 是 | - | 工作空间 ID |
| updates | Partial\<Workspace\> | 是 | - | 要更新的字段 |

**返回值**: Promise\<{ status, data: Workspace }\>

---

### `setWorkspaceSkills(workspaceId, enabledSkills)`

**功能**: 设置工作空间启用的技能

**输入参数**:
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| workspaceId | string | 是 | - | 工作空间 ID |
| enabledSkills | string[] | 是 | - | 启用的技能列表 |

**返回值**: Promise\<{ status }\>

---

## 6. 提示词模板管理

### `listPromptTemplates()`

**功能**: 列出提示词模板

**输入参数**: 无

**返回值**: Promise\<{ status, data: PromptTemplate[] }\>

```typescript
type PromptTemplate = {
  id: string;
  name: string;
  category: string;
  content: string;
}
```

---

### `generateWorkspacePrompt(name, category, description)`

**功能**: AI 生成工作空间提示词

**输入参数**:
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| name | string | 是 | - | 工作空间名称 |
| category | string | 是 | - | 工作空间分类 |
| description | string | 是 | - | 工作空间描述 |

**返回值**: Promise\<{ status, data: { prompt: string } }\>

---

## 7. 主题管理

### `getTheme()`

**功能**: 获取当前主题

**输入参数**: 无

**返回值**: Promise\<{ status, data: { theme: 'light' | 'dark' | 'auto' } }\>

---

### `setTheme(theme)`

**功能**: 设置主题

**输入参数**:
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| theme | 'light' \| 'dark' \| 'auto' | 是 | - | 主题模式 |

**返回值**: Promise\<{ status }\>

**事件**: `theme-changed` - 主题变更事件

---

### `setAccentColor(colorName)`

**功能**: 设置强调色

**输入参数**:
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| colorName | string | 是 | - | 颜色名称 |

**返回值**: Promise\<{ status }\>

**事件**: `accent-color-changed` - 强调色变更事件

---

### `onThemeChanged(callback)`
### `onAccentColorChanged(callback)`

**功能**: 监听主题/强调色变更事件

**输入参数**: `callback: (data) => void`

---

## 8. 对话管理

### `createConversation(workspaceId, title)`

**功能**: 创建新对话

**输入参数**:
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| workspaceId | string | 是 | - | 工作空间 ID |
| title | string \| null | 否 | null | 对话标题 |

**返回值**: Promise\<{ status, data: { conversation_id: string } }\>

---

### `listConversations(workspaceId)`

**功能**: 列出工作空间的对话

**输入参数**:
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| workspaceId | string | 是 | - | 工作空间 ID |

**返回值**: Promise\<{ status, data: Conversation[] }\>

```typescript
type Conversation = {
  id: string;
  workspace_id: string;
  title: string;
  created_at: string;  // ISO 8601 时间戳
  updated_at: string;  // ISO 8601 时间戳
  message_count?: number;
}
```

---

### `deleteConversation(conversationId)`

**功能**: 删除对话

**输入参数**:
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| conversationId | string | 是 | - | 对话 ID |

**返回值**: Promise\<{ status }\>

---

### `switchConversation(workspaceId, conversationId)`

**功能**: 切换对话

**输入参数**:
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| workspaceId | string | 是 | - | 工作空间 ID |
| conversationId | string | 是 | - | 对话 ID |

**返回值**: Promise\<{ status, data: { messages: Message[] } }\>

---

### `renameConversation(conversationId, title)`

**功能**: 重命名对话

**输入参数**:
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| conversationId | string | 是 | - | 对话 ID |
| title | string | 是 | - | 新标题 |

**返回值**: Promise\<{ status }\>

---

### `getConversationHistory(workspaceId, conversationId)`

**功能**: 获取对话历史消息

**输入参数**:
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| workspaceId | string | 是 | - | 工作空间 ID |
| conversationId | string | 是 | - | 对话 ID |

**返回值**: Promise\<{ status, data: { messages: Message[] } }\>

```typescript
type Message = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  metadata?: any;
}
```

---

## 9. 文件选择

### `selectDirectory()`

**功能**: 打开目录选择对话框

**输入参数**: 无

**返回值**: Promise\<{ status, data: { path: string } \| null }\>

---

## 10. 事件监听

### `onResponse(callback)`

**功能**: 监听 Agent 响应完成事件

**事件名**: `agent-response`

**回调数据**: `AgentResponse`

---

### `onChunk(callback)`

**功能**: 监听流式响应数据块

**事件名**: `chat-chunk`

**回调数据**: `{ chunk: string, done: boolean }`

---

## 兼容性保证

### 新版本左侧菜单必须遵守的规则

1. **API 调用不变**: 所有现有 API 调用保持不变
2. **数据结构不变**: 输入输出数据结构完全兼容
3. **事件监听不变**: 现有事件监听机制保持不变
4. **错误处理不变**: 错误响应格式保持一致
5. **调用时机不变**: API 调用时机和顺序不影响后端逻辑

### 新增功能（不破坏兼容性）

- 新增 `sidebar.js` 模块处理侧边栏逻辑
- 侧边栏状态存储在 `localStorage`（不影响后端）
- 通过现有 API 获取数据，不新增 IPC 通道
- 侧边栏与主应用通过 DOM 事件通信

---

## 侧边栏模块与现有 API 的映射

| 侧边栏功能 | 使用的 API | 调用时机 |
|-----------|-----------|---------|
| 工作空间列表 | `listWorkspaces()` | 初始化、工作空间变更 |
| 切换工作空间 | `updateWorkspace()` | 用户点击工作空间 |
| 历史记录列表 | `listConversations(workspaceId)` | 工作空间切换、对话创建/删除 |
| 切换对话 | `switchConversation()` | 用户点击对话项 |
| 删除对话 | `deleteConversation()` | 用户点击删除按钮 |
| 重命名对话 | `renameConversation()` | 用户编辑对话标题 |
| 创建新对话 | `createConversation()` | 用户点击"新对话" |
| 技能列表 | `listSkills()` | 初始化、技能变更 |
| 添加技能 | `uploadSkill()` / `cloneSkillFromGithub()` | 用户操作 |
| 技能配置 | `setWorkspaceSkills()` | 保存设置 |
| 主题切换 | `setTheme()` | 用户切换主题 |
| 打开设置 | `getConfig()` | 打开设置对话框 |

---

**文档版本**: 1.0
**更新日期**: 2025-01-26
**适用版本**: Cowork 0.3.8+
