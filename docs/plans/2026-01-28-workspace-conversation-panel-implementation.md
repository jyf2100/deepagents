# 工作空间对话面板重构实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标:** 将工作空间选择器从左侧窄侧边栏 (#sidebar) 移到左侧面板 (#side-panel)，实现工作空间与对话的统一视图

**架构:** 扩展现有代码架构，移动工作空间选择器 HTML，将相关逻辑从 sidebar.js 迁移到 app.js，保持现有功能不变

**技术栈:** Electron, Vanilla JavaScript, CSS Variables, Glassmorphism UI

---

## Task 1: 从 index.html 移除 #sidebar 中的工作空间选择器

**Files:**
- Modify: `desktop/src/renderer/index.html:1570-1579`

**Step 1: 备份当前文件**

```bash
cp desktop/src/renderer/index.html desktop/src/renderer/index.html.backup
```

**Step 2: 删除工作空间选择器 HTML**

在 `index.html` 中找到并删除以下代码块（约第 1570-1579 行）：

```html
<!-- 工作空间选择器 -->
<div class="sidebar-workspace-selector">
  <button id="sidebar-workspace-selector">📁 加载中...</button>
  <button id="sidebar-workspace-settings-btn">⚙️</button>
  <button id="sidebar-create-workspace-btn" title="新建工作空间">➕</button>
  <!-- 工作空间下拉菜单 -->
  <div id="sidebar-workspace-menu" class="sidebar-workspace-menu">
    <!-- 工作空间列表将动态插入这里 -->
  </div>
</div>
```

**Step 3: 验证 HTML 语法**

```bash
# 检查是否有未闭合的标签
grep -n '<div' desktop/src/renderer/index.html | head -20
grep -n '</div>' desktop/src/renderer/index.html | head -20
```

**Step 4: 提交**

```bash
git add desktop/src/renderer/index.html
git commit -m "refactor: remove workspace selector from sidebar HTML"
```

---

## Task 2: 在 #side-panel 顶部添加工作空间选择器

**Files:**
- Modify: `desktop/src/renderer/index.html:1612`

**Step 1: 找到 #side-panel 位置**

在 `index.html` 中找到 `<div id="side-panel">`（约第 1612 行）

**Step 2: 在 #side-panel 开标签后添加工作空间选择器 HTML**

```html
<div id="side-panel">
  <!-- 工作空间选择器区域 -->
  <div class="panel-workspace-selector">
    <button id="workspace-selector-btn">📁 加载中...</button>
    <button id="workspace-settings-btn" title="工作空间设置">⚙️</button>
    <button id="create-workspace-btn" title="创建工作空间">➕</button>
    <!-- 工作空间下拉菜单 -->
    <div id="workspace-dropdown-menu" class="workspace-dropdown">
      <!-- 工作空间列表将动态插入这里 -->
    </div>
  </div>

  <!-- 面板内容区域 -->
  <div id="panel-content" style="flex: 1; padding: 0 12px 12px 12px; display: flex; flex-direction: column;">
```

**Step 3: 验证 HTML 结构**

```bash
# 检查 #side-panel 内部结构
grep -A 5 '<div id="side-panel">' desktop/src/renderer/index.html
```

**Step 4: 提交**

```bash
git add desktop/src/renderer/index.html
git commit -m "feat: add workspace selector to side-panel"
```

---

## Task 3: 从 sidebar.js 移除工作空间选择器相关代码

**Files:**
- Modify: `desktop/src/renderer/sidebar/sidebar.js`

**Step 1: 移除 workspaceIcons 属性**

删除第 22-28 行：
```javascript
this.workspaceIcons = {
  'folder': '📁',
  'code': '💻',
  'book': '📚',
  'briefcase': '💼',
  'lightbulb': '💡'
};
```

**Step 2: 移除 _initWorkspaceSelector() 方法**

删除第 558-567 行的方法定义和调用（第 48 行的调用也要删除）

**Step 3: 移除 _loadWorkspaces() 方法**

删除第 571-581 行

**Step 4: 移除 _updateWorkspaceSelectorUI() 方法**

删除第 585-629 行

**Step 5: 移除 _renderWorkspaceMenu() 方法**

删除第 633-678 行

**Step 6: 移除 _toggleWorkspaceMenu() 方法**

删除第 682-700 行

**Step 7: 移除 _closeWorkspaceMenu() 方法**

删除第 704-710 行

**Step 8: 移除工作空间相关事件绑定**

在 `_bindEvents()` 方法中删除第 79-96 行的事件绑定代码

**Step 9: 移除 _switchWorkspace() 方法中的工作空间选择器更新**

删除第 724 行的 `this._updateWorkspaceSelectorUI();`

**Step 10: 移除 workspaces 数组**

删除第 21 行的 `this.workspaces = [];`

**Step 11: 验证代码语法**

```bash
node -c desktop/src/renderer/sidebar/sidebar.js
```

**Step 12: 提交**

```bash
git add desktop/src/renderer/sidebar/sidebar.js
git commit -m "refactor: remove workspace selector logic from sidebar.js"
```

---

## Task 4: 在 app.js 添加工作空间图标映射和初始化函数

**Files:**
- Modify: `desktop/src/renderer/app.js`

**Step 1: 在文件顶部添加工作空间图标常量**

在 `currentWorkspaceId` 变量声明后（约第 2484 行后）添加：

```javascript
// 工作空间图标映射
const workspaceIcons = {
  'folder': '📁',
  'code': '💻',
  'book': '📚',
  'briefcase': '💼',
  'lightbulb': '💡'
};
```

**Step 2: 添加 initWorkspaceSelector 函数**

在 `loadWorkspaces()` 函数后（约第 2687 行后）添加：

```javascript
// 初始化工作空间选择器
async function initWorkspaceSelector() {
  try {
    console.log('[Workspace] Initializing workspace selector...');
    const result = await window.deepagents.listWorkspaces();
    workspaces = result.data?.workspaces || result.data || [];

    // 如果没有当前工作空间，尝试从 localStorage 获取
    if (!currentWorkspaceId) {
      const savedId = localStorage.getItem('deepagents-current-workspace');
      if (savedId) {
        currentWorkspaceId = savedId;
      }
    }

    // 优先选择 default 工作空间
    if (!currentWorkspaceId && workspaces.length > 0) {
      const defaultWorkspace = workspaces.find(w => w.id === 'default' || w.name === '默认工作空间');
      if (defaultWorkspace) {
        currentWorkspaceId = defaultWorkspace.id;
        localStorage.setItem('deepagents-current-workspace', currentWorkspaceId);
      }
    }

    renderWorkspaceSelector();
    console.log('[Workspace] Workspace selector initialized');
  } catch (error) {
    console.error('[Workspace] Failed to init workspace selector:', error);
  }
}
```

**Step 3: 验证代码语法**

```bash
node -c desktop/src/renderer/app.js
```

**Step 4: 提交**

```bash
git add desktop/src/renderer/app.js
git commit -m "feat: add workspace selector initialization to app.js"
```

---

## Task 5: 在 app.js 添加 renderWorkspaceSelector 函数

**Files:**
- Modify: `desktop/src/renderer/app.js`

**Step 1: 添加 renderWorkspaceSelector 函数**

在 `initWorkspaceSelector()` 函数后添加：

```javascript
// 渲染工作空间选择器
function renderWorkspaceSelector() {
  const btn = document.getElementById('workspace-selector-btn');
  if (!btn) return;

  const currentWorkspace = workspaces.find(w => String(w.id) === String(currentWorkspaceId));
  const icon = workspaceIcons[currentWorkspace?.icon] || '📁';
  btn.textContent = `${icon} ${currentWorkspace?.name || '未选择工作空间'}`;

  renderWorkspaceDropdown();
}
```

**Step 2: 验证代码语法**

```bash
node -c desktop/src/renderer/app.js
```

**Step 3: 提交**

```bash
git add desktop/src/renderer/app.js
git commit -m "feat: add renderWorkspaceSelector function"
```

---

## Task 6: 在 app.js 添加 renderWorkspaceDropdown 函数

**Files:**
- Modify: `desktop/src/renderer/app.js`

**Step 1: 添加 renderWorkspaceDropdown 函数**

在 `renderWorkspaceSelector()` 函数后添加：

```javascript
// 渲染工作空间下拉菜单
function renderWorkspaceDropdown() {
  const menu = document.getElementById('workspace-dropdown-menu');
  if (!menu) return;

  let html = '';

  // 显示所有工作空间
  workspaces.forEach(workspace => {
    const icon = workspaceIcons[workspace.icon] || '📁';
    const isActive = String(workspace.id) === String(currentWorkspaceId);
    html += '<div class="workspace-dropdown-item' + (isActive ? ' active' : '') + '" data-workspace-id="' + workspace.id + '">';
    html += '<span class="workspace-icon">' + icon + '</span>';
    html += '<span class="workspace-name">' + escapeHtml(workspace.name) + '</span>';
    html += '</div>';
  });

  // 分隔线
  html += '<div class="workspace-dropdown-divider"></div>';

  // 创建工作空间按钮
  html += '<div class="workspace-dropdown-create" id="dropdown-create-workspace">';
  html += '<span>➕</span>';
  html += '<span>创建工作空间</span>';
  html += '</div>';

  menu.innerHTML = html;

  // 绑定点击事件
  menu.querySelectorAll('.workspace-dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
      const workspaceId = item.getAttribute('data-workspace-id');
      switchWorkspace(workspaceId);
      toggleWorkspaceDropdown();
    });
  });

  // 创建工作空间按钮
  const createBtn = menu.querySelector('#dropdown-create-workspace');
  if (createBtn) {
    createBtn.addEventListener('click', () => {
      toggleWorkspaceDropdown();
      if (typeof showCreateWorkspaceDialog === 'function') {
        showCreateWorkspaceDialog();
      }
    });
  }
}
```

**Step 2: 验证代码语法**

```bash
node -c desktop/src/renderer/app.js
```

**Step 3: 提交**

```bash
git add desktop/src/renderer/app.js
git commit -m "feat: add renderWorkspaceDropdown function"
```

---

## Task 7: 在 app.js 添加 toggleWorkspaceDropdown 函数

**Files:**
- Modify: `desktop/src/renderer/app.js`

**Step 1: 添加 toggleWorkspaceDropdown 函数**

在 `renderWorkspaceDropdown()` 函数后添加：

```javascript
// 切换工作空间下拉菜单显示/隐藏
function toggleWorkspaceDropdown() {
  const menu = document.getElementById('workspace-dropdown-menu');
  const btn = document.getElementById('workspace-selector-btn');
  if (!menu || !btn) return;

  const isShow = !menu.classList.contains('show');

  if (isShow) {
    // 计算菜单位置：在按钮正下方
    const rect = btn.getBoundingClientRect();
    menu.style.top = (rect.bottom + 4) + 'px';
    menu.style.left = rect.left + 'px';
    menu.style.width = rect.width + 'px';
    menu.classList.add('show');
  } else {
    menu.classList.remove('show');
  }
}
```

**Step 2: 验证代码语法**

```bash
node -c desktop/src/renderer/app.js
```

**Step 3: 提交**

```bash
git add desktop/src/renderer/app.js
git commit -m "feat: add toggleWorkspaceDropdown function"
```

---

## Task 8: 在 app.js 添加工作空间选择器事件绑定

**Files:**
- Modify: `desktop/src/renderer/app.js`

**Step 1: 在 initializeApp() 中添加事件绑定**

在 `initializeApp()` 函数的初始化部分（约第 1754 行后）添加：

```javascript
  // 初始化工作空间选择器
  await initWorkspaceSelector();

  // 工作空间选择器事件绑定
  const workspaceSelectorBtn = document.getElementById('workspace-selector-btn');
  if (workspaceSelectorBtn) {
    workspaceSelectorBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleWorkspaceDropdown();
    });
  }

  const workspaceSettingsBtn = document.getElementById('workspace-settings-btn');
  if (workspaceSettingsBtn) {
    workspaceSettingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof showWorkspaceSettings === 'function') {
        showWorkspaceSettings(currentWorkspaceId);
      }
    });
  }

  const createWorkspaceBtn = document.getElementById('create-workspace-btn');
  if (createWorkspaceBtn) {
    createWorkspaceBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof showCreateWorkspaceDialog === 'function') {
        showCreateWorkspaceDialog();
      }
    });
  }

  // 点击其他地方关闭工作空间菜单
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('workspace-dropdown-menu');
    const btn = document.getElementById('workspace-selector-btn');
    if (menu && !menu.contains(e.target) && !btn.contains(e.target)) {
      menu.classList.remove('show');
    }
  });
```

**Step 2: 验证代码语法**

```bash
node -c desktop/src/renderer/app.js
```

**Step 3: 提交**

```bash
git add desktop/src/renderer/app.js
git commit -m "feat: add workspace selector event bindings"
```

---

## Task 9: 修改 renderHistory 函数添加工作空间选择器更新

**Files:**
- Modify: `desktop/src/renderer/app.js`

**Step 1: 修改 renderHistory() 函数**

在 `renderHistory()` 函数开头添加工作空间选择器更新：

```javascript
function renderHistory() {
  // 确保工作空间选择器是最新的
  renderWorkspaceSelector();

  console.log('[renderHistory] Start rendering. Conversations count:', conversations.length);
  historyList.innerHTML = '';
  // ... 其余代码保持不变
```

**Step 2: 验证代码语法**

```bash
node -c desktop/src/renderer/app.js
```

**Step 3: 提交**

```bash
git add desktop/src/renderer/app.js
git commit -m "refactor: update renderHistory to refresh workspace selector"
```

---

## Task 10: 添加工作空间选择器 CSS 样式

**Files:**
- Create: `desktop/src/renderer/panel.css`
- Modify: `desktop/src/renderer/index.html`

**Step 1: 创建 panel.css 文件**

创建 `desktop/src/renderer/panel.css`：

```css
/* === 工作空间选择器面板样式 === */

/* 工作空间选择器容器 */
.panel-workspace-selector {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px;
  border-bottom: 1px solid var(--glass-border);
  background: var(--glass-bg);
  position: relative;
}

/* 工作空间选择器按钮 */
#workspace-selector-btn {
  flex: 1;
  background: var(--white-20);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all var(--duration-standard) var(--ease-standard);
  color: var(--text-primary);
}

#workspace-selector-btn:hover {
  background: var(--brand-blue-subtle);
  transform: translateY(-1px);
}

#workspace-settings-btn,
#create-workspace-btn {
  width: 36px;
  height: 36px;
  background: var(--white-20);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-standard) var(--ease-standard);
}

#workspace-settings-btn:hover,
#create-workspace-btn:hover {
  background: var(--brand-blue-subtle);
  transform: scale(1.05);
}

/* 下拉菜单 */
.workspace-dropdown {
  position: fixed;
  display: none;
  z-index: 1000;
  background: var(--glass-bg-strong);
  backdrop-filter: var(--blur-md);
  -webkit-backdrop-filter: var(--blur-md);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-3);
  overflow: hidden;
  max-height: 400px;
  overflow-y: auto;
}

.workspace-dropdown.show {
  display: block;
  animation: fadeIn var(--duration-fast) var(--ease-standard);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.workspace-dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-standard);
}

.workspace-dropdown-item:hover {
  background: var(--brand-blue-subtler);
}

.workspace-dropdown-item.active {
  background: var(--brand-blue-subtle);
  font-weight: 600;
}

.workspace-dropdown-divider {
  height: 1px;
  background: var(--glass-border);
  margin: 4px 0;
}

.workspace-dropdown-create {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  cursor: pointer;
  color: var(--brand-blue);
  transition: background var(--duration-fast) var(--ease-standard);
}

.workspace-dropdown-create:hover {
  background: var(--brand-blue-subtler);
}

/* 滚动条样式 */
.workspace-dropdown::-webkit-scrollbar {
  width: 6px;
}

.workspace-dropdown::-webkit-scrollbar-thumb {
  background: var(--brand-blue-subtle);
  border-radius: 3px;
}
```

**Step 2: 在 index.html 中引入 panel.css**

在 `<head>` 部分添加（约第 1556 行后）：

```html
  <link rel="stylesheet" href="panel.css">
```

**Step 3: 验证 CSS 语法**

```bash
# 检查是否有语法错误（简单验证）
grep -n '@' desktop/src/renderer/panel.css
```

**Step 4: 提交**

```bash
git add desktop/src/renderer/panel.css desktop/src/renderer/index.html
git commit -m "feat: add workspace selector panel styles"
```

---

## Task 11: 构建和测试

**Files:**
- Build: `desktop/`

**Step 1: 重新构建应用**

```bash
cd desktop
npm run build
```

预期输出：构建成功，生成 `release/Cowork-0.3.8.dmg`

**Step 2: 打开应用测试**

```bash
open release/Cowork-0.3.8-arm64.dmg
```

**Step 3: 功能验证清单**

- [ ] `#sidebar` 只显示：技能管理、主题设置、模型设置
- [ ] `#side-panel` 顶部显示工作空间选择器
- [ ] 点击工作空间按钮弹出下拉菜单
- [ ] 下拉菜单显示所有工作空间
- [ ] 选择工作空间后正确切换
- [ ] 切换后下方显示该工作空间的对话列表
- [ ] 对话列表点击可切换对话
- [ ] 设置按钮和创建按钮正常工作
- [ ] 点击外部区域关闭下拉菜单
- [ ] 切换工作空间后技能面板自动关闭

**Step 4: 如果测试通过，打标签**

```bash
git tag -a v0.3.9 -m "Workspace conversation panel refactor"
git push origin feature/glassmorphism-ui --tags
```

**Step 5: 提交完成**

```bash
git add docs/plans/2026-01-28-workspace-conversation-panel-implementation.md
git commit -m "docs: add workspace conversation panel implementation plan"
```

---

## 总结

本实施计划包含 11 个任务，通过以下步骤完成工作空间对话面板的重构：

1. HTML 结构调整：从 #sidebar 移除，添加到 #side-panel
2. JavaScript 逻辑迁移：从 sidebar.js 迁移到 app.js
3. CSS 样式添加：创建 panel.css
4. 事件绑定：确保所有交互正常工作
5. 构建测试：验证功能完整性

每个任务都有明确的文件路径、代码内容和验证步骤，确保实施过程可控且可追溯。
