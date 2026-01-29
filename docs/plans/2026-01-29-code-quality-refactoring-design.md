# 代码质量重构设计文档

> **创建日期**: 2026-01-29
> **状态**: 设计阶段
> **优先级**: 高

---

## 目标

将 Cowork 桌面应用从单体 JavaScript 代码重构为模块化、可维护、类型安全的现代代码库。

---

## 当前问题分析

### 1. 单文件巨石问题
- `app.js` 文件大小：**3412 行**
- 函数数量：**210+ 个**
- 违反单一职责原则，难以维护

### 2. 全局污染严重
- 大量 `window.xxx` 全局函数（40+ 处）
- 全局变量缺乏命名空间
- 容易产生命名冲突

### 3. DOM 操作分散
- 直接 DOM 访问：**197 处**
- 缺乏统一的状态管理
- UI 逻辑与业务逻辑耦合

### 4. 类型安全缺失
- 纯 JavaScript，无类型检查
- 维护难度随代码增长指数上升
- 重构风险高，缺少 IDE 支持

---

## 重构架构设计

### 模块结构

```
desktop/src/renderer/
├── core/                      # 核心基础设施
│   ├── App.js                 # 主应用类
│   ├── EventBus.js            # 事件总线
│   └── StateManager.js        # 状态管理
│
├── modules/                   # 业务模块
│   ├── conversation/          # 对话模块
│   │   ├── ConversationManager.js
│   │   ├── MessageRenderer.js
│   │   └── TodoListFormatter.js
│   ├── skill/                 # 技能模块
│   │   ├── SkillManager.js
│   │   └── SkillUploader.js
│   ├── workspace/             # 工作空间模块
│   │   └── WorkspaceManager.js
│   └── ui/                    # UI 组件
│       ├── DialogManager.js
│       ├── ThemeManager.js
│       └── InputManager.js
│
├── utils/                     # 工具函数
│   ├── dom.js                 # DOM 操作
│   ├── format.js              # 格式化工具
│   ├── storage.js             # 本地存储
│   ├── errors.js              # 错误处理
│   └── logger.js              # 日志系统
│
├── types/                     # TypeScript 类型定义
│   ├── index.ts               # 核心类型
│   └── api.ts                 # API 接口类型
│
└── app.js                     # 入口文件
```

---

## 核心模块设计

### 1. 状态管理 (StateManager)

集中式状态管理，替代分散的变量和 DOM 状态。

```javascript
class StateManager {
  constructor() {
    this.state = {
      currentWorkspaceId: null,
      currentConversationId: null,
      conversations: [],
      skills: [],
      workspaces: [],
      isProcessing: false,
      sidebarCollapsed: false,
      theme: 'auto',
      workspaceSkillFilter: 'enabled'
    };
    this.listeners = new Map();
  }

  get(path) { /* ... */ }
  set(path, value) { /* ... */ }
  subscribe(path, callback) { /* ... */ }
}
```

### 2. 事件总线 (EventBus)

组件间解耦通信。

```javascript
class EventBus {
  constructor() {
    this.events = new Map();
  }

  emit(eventName, data) { /* ... */ }
  on(eventName, callback) { /* ... */ }
  off(eventName, callback) { /* ... */ }
}
```

### 3. 对话管理器 (ConversationManager)

```javascript
class ConversationManager {
  constructor(stateManager, eventBus) {
    this.state = stateManager;
    this.events = eventBus;
    this.api = window.deepagents;
  }

  async createConversation(workspaceId, title) { /* ... */ }
  async switchConversation(workspaceId, conversationId) { /* ... */ }
  async deleteConversation(conversationId) { /* ... */ }
  async getHistory(workspaceId, conversationId) { /* ... */ }
}
```

---

## TypeScript 类型系统

### 核心类型 (types/index.ts)

```typescript
export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

export interface Conversation {
  id: string;
  workspace_id: string;
  title: string;
  created_at: number;
  updated_at: number;
}

export interface Workspace {
  id: string;
  name: string;
  root_dir: string;
  system_prompt: string;
}

export interface Skill {
  name: string;
  source: 'user' | 'project';
  description?: string;
}

export interface AppState {
  currentWorkspaceId: string | null;
  currentConversationId: string | null;
  conversations: Conversation[];
  skills: Skill[];
  workspaces: Workspace[];
  isProcessing: boolean;
  theme: 'light' | 'dark' | 'auto';
}
```

### API 类型 (types/api.ts)

```typescript
export interface DeepAgentsAPI {
  listSkills(): Promise<APIResponse<SkillsResponse>>;
  deleteSkill(name: string, source: string): Promise<APIResponse<void>>;
  createConversation(workspaceId: string, title: string): Promise<APIResponse<ConversationResponse>>;
  switchConversation(workspaceId: string, conversationId: string): Promise<APIResponse<void>>;
  getConversationHistory(workspaceId: string, conversationId: string): Promise<APIResponse<MessagesResponse>>;
  deleteConversation(conversationId: string): Promise<APIResponse<void>>;
}

export interface APIResponse<T> {
  status: 'success' | 'error';
  data?: T;
  error?: string;
}
```

---

## 工具函数模块

### DOM 工具 (utils/dom.js)

```javascript
export const dom = {
  $(selector, parent = document) {
    return parent.querySelector(selector);
  },

  $$(selector, parent = document) {
    return parent.querySelectorAll(selector);
  },

  createElement(tag, className = '', innerHTML = '') {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (innerHTML) el.innerHTML = innerHTML;
    return el;
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};
```

### 存储工具 (utils/storage.js)

```javascript
export const storage = {
  get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
      console.error(`[Storage] Failed to get ${key}:`, e);
      return defaultValue;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error(`[Storage] Failed to set ${key}:`, e);
    }
  },

  remove(key) {
    localStorage.removeItem(key);
  }
};
```

### 格式化工具 (utils/format.js)

```javascript
export function formatMessageContent(content) {
  let formatted = escapeHtml(content);
  formatted = formatToolCalls(formatted);
  formatted = formatTodoList(formatted);
  formatted = formatFilePaths(formatted);
  return formatted;
}

export function formatTodoList(text) { /* ... */ }
export function formatJsonWithHighlight(jsonStr) { /* ... */ }
export function formatFilePaths(text) { /* ... */ }
```

---

## 渐进式迁移计划

### 阶段 1：基础设施搭建（不影响现有功能）

- [ ] 创建 types/ 目录，添加核心类型定义
- [ ] 创建 utils/ 工具模块（DOM、Storage、Format）
- [ ] 创建 core/ 核心模块（EventBus、StateManager）
- [ ] 配置 TypeScript 编译环境

### 阶段 2：新模块开发

- [ ] modules/conversation/ - 对话管理模块
- [ ] modules/skill/ - 技能管理模块
- [ ] modules/workspace/ - 工作空间模块
- [ ] modules/ui/ - UI 组件模块

### 阶段 3：逐步替换旧代码

- [ ] 在 app.js 中引入新模块，并行运行
- [ ] 逐个功能点切换到新模块
- [ ] 验证功能正确性
- [ ] 删除对应的旧代码

### 阶段 4：清理与优化

- [ ] 移除所有 window.xxx 全局函数
- [ ] 统一代码风格和命名规范
- [ ] 添加单元测试
- [ ] 性能优化

---

## TypeScript 配置

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "lib": ["ES2020", "DOM"],
    "outDir": "./dist/renderer",
    "rootDir": "./src/renderer",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "allowJs": true,
    "checkJs": false
  },
  "include": ["src/renderer/**/*"],
  "exclude": ["node_modules"]
}
```

### package.json 更新

```json
{
  "scripts": {
    "build": "npm run build:js && npm run build:ts",
    "build:ts": "tsc",
    "type-check": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.10.0"
  }
}
```

---

## 代码质量改进

### 1. 统一代码风格

- 使用 ES6 模块导入导出，替代全局函数
- 统一使用 const/let，避免 var
- 函数命名采用动词开头：`loadSkills`, `createConversation`

### 2. 消除魔法数字

```javascript
// constants/ui.ts
export const UI_LIMITS = {
  CONVERSATION_TITLE_MAX_LENGTH: 30,
  MESSAGE_PREVIEW_LENGTH: 100,
  SIDEBAR_COLLAPSE_WIDTH: 800
} as const;
```

### 3. 统一错误处理

```javascript
// utils/errors.ts
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  context: string
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    console.error(`[${context}] Error:`, error);
    eventBus.emit('error', { context, error });
    return null;
  }
}
```

### 4. 日志系统标准化

```javascript
// utils/logger.ts
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export class Logger {
  constructor(private context: string, level = LogLevel.INFO) {
    this.level = process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : level;
  }

  debug(...args: any[]) {
    if (this.level <= LogLevel.DEBUG) {
      console.log(`[${this.context}]`, ...args);
    }
  }

  info(...args: any[]) {
    if (this.level <= LogLevel.INFO) {
      console.info(`[${this.context}]`, ...args);
    }
  }

  error(...args: any[]) {
    if (this.level <= LogLevel.ERROR) {
      console.error(`[${this.context}]`, ...args);
    }
  }
}
```

---

## 单元测试

### 测试框架：Vitest

```javascript
// tests/utils/format.test.ts
import { describe, it, expect } from 'vitest';
import { formatMessageContent } from '../utils/format';

describe('formatMessageContent', () => {
  it('should escape HTML', () => {
    const input = '<script>alert("xss")</script>';
    const output = formatMessageContent(input);
    expect(output).not.toContain('<script>');
  });
});

// tests/core/StateManager.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { StateManager } from '../core/StateManager';

describe('StateManager', () => {
  let stateManager: StateManager;

  beforeEach(() => {
    stateManager = new StateManager();
  });

  it('should notify subscribers on change', () => {
    const callback = vi.fn();
    stateManager.subscribe('currentConversationId', callback);

    stateManager.set('currentConversationId', '456');
    expect(callback).toHaveBeenCalledWith('456');
  });
});
```

---

## 代码质量指标

| 指标 | 当前 | 目标 |
|------|------|------|
| 单文件最大行数 | 3412 | < 500 |
| 圈复杂度 | N/A | < 10 |
| 代码重复率 | N/A | < 5% |
| 测试覆盖率 | 0% | 核心 > 80%, UI > 50% |
| 全局函数数量 | 40+ | 0 |

---

## 风险控制

### 1. 零停机迁移
- 新旧代码并行运行
- 逐步切换流量
- 功能开关快速回滚

### 2. 功能开关示例
```javascript
const USE_NEW_CONVERSATION_MANAGER = true;

if (USE_NEW_CONVERSATION_MANAGER) {
  conversationManager.createConversation(...);
} else {
  // 旧代码
}
```

### 3. 增量验证
- 每个功能点迁移后立即测试
- 不积累风险
- 发现问题及时回滚

---

## 预期收益

### 1. 可维护性提升
- 模块化后，新功能开发更容易定位代码
- 降低代码理解成本
- 便于多人协作

### 2. 类型安全
- 编译期发现大部分错误
- IDE 智能提示更准确
- 重构更有保障

### 3. 测试覆盖
- 单元测试保证代码质量
- 回归测试防止问题复发
- 持续集成支持

### 4. 开发效率
- 减少调试时间
- 更快的代码导航
- 更好的代码复用
