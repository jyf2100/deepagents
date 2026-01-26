# 左侧菜单设计方案

**日期**: 2025-01-26
**功能**: 将功能菜单整理到左侧，支持展开与折叠
**状态**: 设计完成，待实施

---

## 1. 整体布局

### 布局结构

界面将分为左右两栏：

```
┌─────────────────────────────────────────────────┐
│  ┌──────────┐  ┌─────────────────────────────┐  │
│  │          │  │                             │  │
│  │  左侧    │  │      右侧主内容区            │  │
│  │  侧边栏  │  │                             │  │
│  │          │  │  - 聊天消息区域              │  │
│  │  280px   │  │  - 输入框                   │  │
│  │          │  │                             │  │
│  └──────────┘  └─────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 尺寸规格

| 状态 | 宽度 | 说明 |
|------|------|------|
| 展开 | 280px | 显示完整菜单 |
| 折叠 | 60px | 仅显示图标 |
| 响应式断点 | < 800px | 小窗口默认折叠 |

### 折叠机制

- **触发方式**: 左上角汉堡菜单按钮（☰）
- **动画时长**: 0.2s (使用 `--transition-fast`)
- **动画曲线**: `cubic-bezier(0, 0, 0.2, 1)` (ease-out)
- **折叠状态**: 只显示图标，鼠标悬停显示 tooltip

---

## 2. 菜单分组与内容

### 分组结构

侧边栏包含三个可折叠的分组：

#### 📁 工作空间
- **工作空间列表**: 显示所有工作空间，当前工作空间高亮
- **历史记录**: 展开当前工作空间的最近对话列表
  - 每个对话显示标题和时间
  - 点击对话加载历史消息
  - 悬停显示删除按钮
- **操作按钮**: 创建新工作空间、工作空间设置

#### ⚡ 技能管理
- **技能列表**: 当前工作空间启用的技能
- **添加技能**: 打开添加技能对话框
- **技能配置**: 快捷入口到工作空间设置的技能配置

#### ⚙️ 系统设置
- **主题切换**: 浅色/深色主题切换按钮
- **通用设置**: 打开设置对话框
- **关于**: 版本信息

### 分组交互

- 每个分组标题右侧有箭头（▾ / ▸）
- 点击分组标题独立展开/折叠该分组
- 默认状态：所有分组全部展开
- 状态持久化到 `localStorage`

---

## 3. 组件结构与交互

### 组件层次

```
Sidebar (侧边栏容器)
├── Header (顶部栏)
│   ├── HamburgerButton (折叠按钮)
│   └── AppTitle (应用标题 "Cowork"，折叠时隐藏)
│
├── MenuGroup × 3 (可折叠分组)
│   ├── GroupHeader (分组标题 + 折叠箭头)
│   │   ├── Icon (分组图标)
│   │   ├── Title (分组名称)
│   │   └── Arrow (折叠指示器)
│   │
│   ├── GroupContent (分组内容，可折叠)
│   │   └── MenuItems (菜单项列表)
│   │       ├── MenuItem (单个菜单项)
│   │       │   ├── Icon (图标)
│   │       │   ├── Text (文字，折叠时隐藏)
│   │       │   └── Action (操作按钮)
│   │       └── ...
│   │
│   └── SubGroup (子分组，如历史记录)
│       ├── SubGroupHeader
│       └── SubGroupContent
│
└── Footer (底部，可选)
    └── VersionInfo (版本号)
```

### 交互细节

#### 1. 分组折叠/展开
- **触发**: 点击 GroupHeader
- **动画**: 箭头旋转 180°，Content 滑动展开/折叠
- **实现**: 使用 `max-height` + `overflow` + CSS transition

```css
.menu-group-content {
  max-height: 500px;  /* 展开状态 */
  overflow: hidden;
  transition: max-height 0.3s var(--ease-in-out),
              opacity 0.2s var(--ease-out);
}

.menu-group.collapsed .menu-group-content {
  max-height: 0;
  opacity: 0;
}
```

#### 2. 侧边栏折叠/展开
- **触发**: 点击 HamburgerButton
- **动画**: 宽度 280px ↔ 60px，菜单文字淡出/淡入
- **实现**: CSS width transition + 文字透明度

```css
.sidebar {
  width: 280px;
  transition: width 0.2s var(--ease-out);
}

.sidebar.collapsed {
  width: 60px;
}

.sidebar.collapsed .menu-item-text {
  opacity: 0;
  pointer-events: none;
}
```

#### 3. 历史记录显示
- **数量**: 默认显示最近 10 条对话
- **分页**: 超过 10 条显示"查看更多"按钮
- **格式**: 按现有方式显示（标题 + 时间 + 删除按钮）
- **加载**: 点击对话项触发 `loadConversation()`

```javascript
// 在工作空间分组下显示历史记录
renderConversationHistory(workspaceId) {
  const conversations = await window.deepagents.listConversations(workspaceId);
  // 渲染前 10 条
  const recent = conversations.data.slice(0, 10);
  // 渲染到 MenuGroup 内
}
```

#### 4. 状态管理
- **存储**: `localStorage`
- **键名**:
  - `sidebar.collapsed`: 侧边栏是否折叠
  - `sidebar.expandedGroups`: 展开的分组 ID 数组
- **恢复**: 页面加载时读取并恢复状态

```javascript
const sidebarState = {
  isCollapsed: localStorage.getItem('sidebar.collapsed') === 'true',
  expandedGroups: JSON.parse(
    localStorage.getItem('sidebar.expandedGroups') || '["workspace", "skills", "settings"]'
  )
};
```

---

## 4. 数据流与实现

### 数据流

```
用户启动应用
    ↓
Sidebar.init()
    ↓
loadState() → 恢复上次状态
    ↓
更新 UI（折叠状态、分组展开状态）
    ↓
┌─────────────────────────────────┐
│  并发加载各类数据                │
├─────────────────────────────────┤
│ listWorkspaces() → 工作空间列表  │
│ listConversations() → 历史记录   │
│ listSkills() → 技能列表          │
│ getTheme() → 当前主题            │
└─────────────────────────────────┘
    ↓
渲染到各个 MenuGroup
    ↓
用户交互（点击、切换等）
    ↓
调用对应的 IPC API
    ↓
更新 UI + 保存状态
```

### 核心类结构

#### Sidebar (主容器类)

```javascript
class Sidebar {
  constructor() {
    this.container = null;
    this.isCollapsed = false;
    this.groups = [];
  }

  init() {
    this._createContainer();
    this._loadState();
    this._render();
    this._bindEvents();
  }

  toggle() {
    this.isCollapsed = !this.isCollapsed;
    this._updateCollapseState();
    this._saveState();
  }

  _saveState() {
    localStorage.setItem('sidebar.collapsed', this.isCollapsed);
    // 保存分组状态
  }

  _loadState() {
    this.isCollapsed = localStorage.getItem('sidebar.collapsed') === 'true';
    // 加载分组状态
  }
}
```

#### MenuGroup (分组类)

```javascript
class MenuGroup {
  constructor(id, config) {
    this.id = id;              // 'workspace' | 'skills' | 'settings'
    this.title = config.title;
    this.icon = config.icon;
    this.isExpanded = true;     // 默认展开
    this.items = [];
  }

  expand() {
    this.isExpanded = true;
    this._updateContent();
    this._saveState();
  }

  collapse() {
    this.isExpanded = false;
    this._updateContent();
    this._saveState();
  }

  addItem(item) {
    this.items.push(item);
    this._render();
  }

  render() {
    // 返回 DOM 元素
  }
}
```

#### WorkspaceList (工作空间列表)

```javascript
class WorkspaceList extends MenuItem {
  async load() {
    const result = await window.deepagents.listWorkspaces();
    this.workspaces = result.data;
    this.render();
  }

  async selectWorkspace(workspaceId) {
    await window.deepagents.updateWorkspace(workspaceId, {});
    // 触发工作空间切换事件
    this.emit('workspace-changed', workspaceId);
  }
}
```

#### ConversationList (对话历史列表)

```javascript
class ConversationList extends MenuGroup {
  constructor(workspaceId) {
    super('conversations');
    this.workspaceId = workspaceId;
  }

  async load() {
    const result = await window.deepagents.listConversations(this.workspaceId);
    this.conversations = result.data;
    this.render();
  }

  async selectConversation(conversationId) {
    await window.deepagents.switchConversation(this.workspaceId, conversationId);
    // 触发对话切换事件
    this.emit('conversation-changed', conversationId);
  }

  async deleteConversation(conversationId) {
    await window.deepagents.deleteConversation(conversationId);
    this.load();  // 重新加载列表
  }
}
```

### 事件委托

使用事件委托处理所有菜单项点击，减少事件监听器数量：

```javascript
class Sidebar {
  _bindEvents() {
    // 在容器级别监听所有点击
    this.container.addEventListener('click', (e) => {
      // 查找最近的 .menu-item 或 .menu-group-header
      const menuItem = e.target.closest('.menu-item');
      const groupHeader = e.target.closest('.menu-group-header');
      const hamburger = e.target.closest('.hamburger-button');

      if (hamburger) {
        this.toggle();
      } else if (groupHeader) {
        const groupId = groupHeader.dataset.groupId;
        this.toggleGroup(groupId);
      } else if (menuItem) {
        const action = menuItem.dataset.action;
        const data = menuItem.dataset;
        this._handleMenuAction(action, data);
      }
    });
  }

  _handleMenuAction(action, data) {
    switch (action) {
      case 'select-workspace':
        this.workspaceList.selectWorkspace(data.workspaceId);
        break;
      case 'select-conversation':
        this.conversationList.selectConversation(data.conversationId);
        break;
      case 'delete-conversation':
        this.conversationList.deleteConversation(data.conversationId);
        break;
      // ... 其他操作
    }
  }
}
```

---

## 5. 样式与动画

### 视觉风格

遵循现有的 macOS Big Sur 设计语言：

```css
/* 侧边栏容器 */
.sidebar {
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
}

/* 分组标题 */
.menu-group-header {
  padding: 12px 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 1px solid var(--divider-color);
}

/* 菜单项 */
.menu-item {
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.15s var(--ease-out);
}

.menu-item:hover {
  background: var(--bg-tertiary);
}

.menu-item.active {
  border-left: 3px solid var(--accent-color);
  background: rgba(0, 122, 255, 0.08);
}

/* 图标 */
.menu-item-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

/* 文字 */
.menu-item-text {
  margin-left: 12px;
  opacity: 1;
  transition: opacity 0.15s var(--ease-out);
  white-space: nowrap;
  overflow: hidden;
}

.sidebar.collapsed .menu-item-text {
  opacity: 0;
  pointer-events: none;
}
```

### 动画效果

```css
/* 侧边栏折叠 */
.sidebar {
  transition: width 0.2s var(--ease-out);
}

/* 分组展开/折叠 */
.menu-group-content {
  transition: max-height 0.3s var(--ease-in-out),
              opacity 0.2s var(--ease-out);
}

/* 文字淡出淡入 */
.menu-item-text {
  transition: opacity 0.15s var(--ease-out);
}

/* 箭头旋转 */
.menu-group-arrow {
  transition: transform 0.2s var(--ease-out);
}

.menu-group.collapsed .menu-group-arrow {
  transform: rotate(-180deg);
}
```

### 折叠状态 Tooltip

```css
/* 折叠时显示 Tooltip */
.sidebar.collapsed .menu-item[data-tooltip]:hover::after {
  content: attr(data-tooltip);
  position: absolute;
  left: 100%;
  top: 50%;
  transform: translateY(-50%);
  margin-left: 8px;
  padding: 6px 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  font-size: 12px;
  white-space: nowrap;
  z-index: 1000;
  pointer-events: none;
}
```

---

## 6. 迁移策略

### 阶段化实施

#### 第一阶段：基础侧边栏（最小可用版本）
- [ ] 创建 `sidebar.js` 模块
- [ ] 实现 Sidebar、MenuGroup 基础类
- [ ] 添加汉堡菜单按钮
- [ ] 实现折叠/展开功能
- [ ] 迁移工作空间列表到左侧
- [ ] 迁移主题切换到左侧

#### 第二阶段：历史记录集成
- [ ] 在工作空间分组下添加历史记录子分组
- [ ] 实现对话列表渲染
- [ ] 实现对话切换功能
- [ ] 实现对话删除功能

#### 第三阶段：技能管理迁移
- [ ] 迁移技能列表到左侧
- [ ] 添加"添加技能"快捷入口
- [ ] 保留右侧技能详情面板（技能配置）

#### 第四阶段：完善与优化
- [ ] 添加状态持久化
- [ ] 实现键盘快捷键（Cmd+B 切换侧边栏）
- [ ] 添加动画优化
- [ ] 响应式适配

### 配置开关

添加 `useSidebarLayout` 配置项，允许切换新旧布局：

```javascript
// 在 getConfig() 中添加
const config = {
  useSidebarLayout: true,  // true = 左侧菜单, false = 现有布局
  // ... 其他配置
};
```

### 兼容性保证

1. **保留现有右侧面板** - 技能面板保留，作为技能详情视图
2. **保持所有 IPC 接口** - 不新增或修改现有 API
3. **保持 app.js 核心逻辑** - 现有函数保持不变
4. **事件驱动** - 侧边栏通过 DOM 事件与主应用通信

```javascript
// 侧边栏触发工作空间切换
sidebar.on('workspace-changed', (workspaceId) => {
  // 调用现有函数
  switchWorkspace(workspaceId);
});

// 侧边栏触发对话切换
sidebar.on('conversation-changed', (conversationId) => {
  // 调用现有函数
  loadConversation(conversationId);
});
```

---

## 7. 响应式设计

### 断点策略

```css
/* 小窗口：默认折叠 */
@media (max-width: 800px) {
  .sidebar {
    width: 60px;  /* 默认折叠 */
  }

  /* 点击图标时 overlay 展开 */
  .sidebar.overlay {
    width: 280px;
    position: fixed;
    z-index: 1000;
    box-shadow: var(--shadow-2xl);
  }
}

/* 大窗口：正常布局 */
@media (min-width: 801px) {
  .sidebar {
    width: 280px;  /* 默认展开 */
  }
}
```

### 触摸支持

```css
/* 移动端：增加点击区域 */
@media (hover: none) {
  .menu-item {
    padding: 16px;  /* 更大的点击区域 */
  }

  .menu-item:active {
    background: var(--bg-tertiary);
  }
}
```

---

## 8. API 映射

侧边栏模块与现有 API 的完整映射关系：

| 侧边栏功能 | 使用的 API | 调用时机 | 处理函数 |
|-----------|-----------|---------|---------|
| 工作空间列表 | `listWorkspaces()` | 初始化、工作空间变更 | `WorkspaceList.load()` |
| 切换工作空间 | `updateWorkspace()` | 用户点击工作空间 | `WorkspaceList.select()` |
| 历史记录列表 | `listConversations(workspaceId)` | 工作空间切换、对话变更 | `ConversationList.load()` |
| 切换对话 | `switchConversation()` | 用户点击对话项 | `ConversationList.select()` |
| 删除对话 | `deleteConversation()` | 用户点击删除 | `ConversationList.delete()` |
| 重命名对话 | `renameConversation()` | 用户编辑标题 | `ConversationList.rename()` |
| 创建新对话 | `createConversation()` | 用户点击"新对话" | `ConversationList.create()` |
| 技能列表 | `listSkills()` | 初始化、技能变更 | `SkillList.load()` |
| 添加技能 | `uploadSkill()` / `cloneSkillFromGithub()` | 用户操作 | 通过对话框 |
| 技能配置 | `setWorkspaceSkills()` | 保存设置 | 通过设置对话框 |
| 主题切换 | `setTheme()` | 用户切换主题 | `ThemeToggle.toggle()` |
| 打开设置 | `getConfig()` | 打开设置对话框 | `SettingsDialog.open()` |

**完整 API 文档**: 参见 `2025-01-26-sidebar-api-reference.md`

---

## 9. 文件结构

### 新增文件

```
desktop/src/renderer/
├── sidebar/
│   ├── sidebar.js           # 主容器类
│   ├── menu-group.js        # 分组类
│   ├── workspace-list.js    # 工作空间列表
│   ├── conversation-list.js # 对话历史列表
│   ├── skill-list.js        # 技能列表
│   └── theme-toggle.js      # 主题切换
└── sidebar.css              # 侧边栏样式（可选，内联到 index.html）
```

### 修改文件

```
desktop/src/renderer/
├── index.html               # 添加侧边栏容器和汉堡按钮
├── app.js                   # 集成侧边栏，保持现有函数
└── preload/index.js         # 保持不变
```

### 模块加载

在 `index.html` 中添加：

```html
<!-- 在 app.js 之前加载侧边栏模块 -->
<script src="sidebar/sidebar.js"></script>
<script src="sidebar/menu-group.js"></script>
<script src="sidebar/workspace-list.js"></script>
<script src="sidebar/conversation-list.js"></script>
<script src="sidebar/skill-list.js"></script>
<script src="sidebar/theme-toggle.js"></script>
<script src="app.js"></script>
```

---

## 10. 测试要点

### 功能测试

- [ ] 侧边栏折叠/展开功能
- [ ] 分组独立展开/折叠
- [ ] 工作空间切换
- [ ] 对话历史加载与切换
- [ ] 对话删除
- [ ] 技能列表显示
- [ ] 主题切换
- [ ] 状态持久化

### UI 测试

- [ ] 动画流畅性
- [ ] 文字淡出淡入
- [ ] 箭头旋转
- [ ] Tooltip 显示（折叠状态）
- [ ] 选中状态高亮

### 兼容性测试

- [ ] 现有功能不受影响
- [ ] 所有 API 调用正常
- [ ] 事件监听正常工作
- [ ] 配置开关可切换布局

### 响应式测试

- [ ] 小窗口默认折叠
- [ ] 触摸设备支持
- [ ] Overlay 展开模式

---

## 11. 实施顺序

### 推荐实施路径

1. **创建基础架构** (1-2天)
   - 创建 sidebar.js 模块结构
   - 实现 Sidebar 和 MenuGroup 类
   - 添加汉堡按钮和折叠功能

2. **迁移工作空间功能** (1-2天)
   - 实现工作空间列表
   - 实现工作空间切换
   - 测试功能完整性

3. **集成历史记录** (1-2天)
   - 在工作空间分组下添加历史记录
   - 实现对话切换和删除
   - 测试数据同步

4. **迁移技能管理** (1天)
   - 实现技能列表
   - 添加快捷入口
   - 保留右侧详情面板

5. **完善与优化** (1天)
   - 状态持久化
   - 动画优化
   - 响应式适配
   - 测试与调试

**总计**: 5-8 天

---

## 12. 后续优化

- [ ] 键盘快捷键支持（Cmd+B 切换侧边栏）
- [ ] 拖拽调整宽度
- [ ] 自定义主题色
- [ ] 分组拖拽排序
- [ ] 收藏功能
- [ ] 搜索功能

---

**设计版本**: 1.0
**更新日期**: 2025-01-26
**适用版本**: Cowork 0.4.0+
**相关文档**: `2025-01-26-sidebar-api-reference.md`
