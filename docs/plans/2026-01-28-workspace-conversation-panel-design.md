# 工作空间对话面板重构设计

**日期**: 2026-01-28
**目标**: 将工作空间选择器从左侧窄侧边栏移到左侧面板，实现工作空间与对话的统一视图

---

## 当前状态

**布局结构**:
- `#sidebar` (左侧窄侧边栏): 工作空间选择器 + 技能管理 + 主题设置 + 模型设置
- `#side-panel` (左侧面板): 历史对话列表 `#history-list`

**问题**:
- 工作空间选择器与对话列表分离在不同区域
- 切换工作空间后对话列表更新不直观
- 空间利用不充分

---

## 目标布局

**新的 #sidebar**:
```
#sidebar (左侧窄侧边栏):
├── ⚡ 技能管理
├── 🌓 主题设置
└── 🤖 模型设置
```

**新的 #side-panel**:
```
#side-panel (左侧面板):
├── 工作空间选择器区域
│   ├── 📁 当前工作空间按钮
│   ├── ⚙️ 设置按钮
│   ├── ➕ 创建按钮
│   └── 下拉菜单
└── 对话列表区域
    ├── 💬 对话1
    ├── 💬 对话2
    └── 💬 对话3
```

---

## 实现方案

**方案**: 扩展现有代码（最小改动）

### 文件修改清单

1. **`desktop/src/renderer/index.html`**
   - 从 `#sidebar` 移除工作空间选择器 HTML
   - 在 `#side-panel` 顶部添加工作空间选择器 HTML

2. **`desktop/src/renderer/sidebar/sidebar.js`**
   - 移除工作空间选择器相关代码

3. **`desktop/src/renderer/app.js`**
   - 添加工作空间选择器初始化和渲染逻辑
   - 扩展 `renderHistory()` 函数

4. **`desktop/src/renderer/sidebar.css` 或 `panel.css`**
   - 调整工作空间选择器样式适配新位置

---

## 详细实现

### HTML 结构修改

**从 #sidebar 移除**:
```html
<div class="sidebar-workspace-selector">
  <button id="sidebar-workspace-selector">...</button>
  <button id="sidebar-workspace-settings-btn">...</button>
  <button id="sidebar-create-workspace-btn">...</button>
  <div id="sidebar-workspace-menu">...</div>
</div>
```

**在 #side-panel 添加**:
```html
<div id="side-panel">
  <div class="panel-workspace-selector">
    <button id="workspace-selector-btn">📁 加载中...</button>
    <button id="workspace-settings-btn" title="工作空间设置">⚙️</button>
    <button id="create-workspace-btn" title="创建工作空间">➕</button>
    <div id="workspace-dropdown-menu" class="workspace-dropdown"></div>
  </div>

  <div id="history-view" class="panel-view active">
    <div id="history-list"></div>
  </div>
</div>
```

### JavaScript 修改

**sidebar.js 移除**:
- `workspaceIcons` 属性
- `_initWorkspaceSelector()`
- `_loadWorkspaces()`
- `_updateWorkspaceSelectorUI()`
- `_renderWorkspaceMenu()`
- `_toggleWorkspaceMenu()`
- `_closeWorkspaceMenu()`
- 相关事件绑定

**app.js 添加**:

```javascript
// 工作空间图标映射
const workspaceIcons = {
  'folder': '📁',
  'code': '💻',
  'book': '📚',
  'briefcase': '💼',
  'lightbulb': '💡'
};

// 初始化工作空间选择器
async function initWorkspaceSelector() {
  try {
    const result = await window.deepagents.listWorkspaces();
    workspaces = result.data?.workspaces || result.data || [];
    renderWorkspaceSelector();
  } catch (error) {
    console.error('[Workspace] Failed to load:', error);
  }
}

// 渲染工作空间选择器
function renderWorkspaceSelector() {
  const btn = document.getElementById('workspace-selector-btn');
  const currentWorkspace = workspaces.find(w => w.id === currentWorkspaceId);
  const icon = workspaceIcons[currentWorkspace?.icon] || '📁';
  btn.textContent = `${icon} ${currentWorkspace?.name || '未选择工作空间'}`;

  renderWorkspaceDropdown();
}

// 渲染下拉菜单
function renderWorkspaceDropdown() {
  const menu = document.getElementById('workspace-dropdown-menu');
  if (!menu) return;

  let html = '';
  workspaces.forEach(workspace => {
    const icon = workspaceIcons[workspace.icon] || '📁';
    const isActive = String(workspace.id) === String(currentWorkspaceId);
    html += `<div class="workspace-dropdown-item${isActive ? ' active' : ''}" data-workspace-id="${workspace.id}">`;
    html += `<span class="workspace-icon">${icon}</span>`;
    html += `<span class="workspace-name">${escapeHtml(workspace.name)}</span>`;
    html += '</div>';
  });

  // 分隔线和创建按钮
  html += '<div class="workspace-dropdown-divider"></div>';
  html += '<div class="workspace-dropdown-create" id="dropdown-create-workspace">';
  html += '<span>➕</span><span>创建工作空间</span>';
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

  const createBtn = menu.querySelector('#dropdown-create-workspace');
  if (createBtn) {
    createBtn.addEventListener('click', () => {
      toggleWorkspaceDropdown();
      showCreateWorkspaceDialog();
    });
  }
}

// 切换下拉菜单
function toggleWorkspaceDropdown() {
  const menu = document.getElementById('workspace-dropdown-menu');
  const btn = document.getElementById('workspace-selector-btn');
  if (!menu || !btn) return;

  const isShow = !menu.classList.contains('show');
  if (isShow) {
    const rect = btn.getBoundingClientRect();
    menu.style.top = (rect.bottom + 4) + 'px';
    menu.style.left = rect.left + 'px';
    menu.style.width = rect.width + 'px';
    menu.classList.add('show');
  } else {
    menu.classList.remove('show');
  }
}

// 扩展 renderHistory()
function renderHistory() {
  // 确保工作空间选择器是最新的
  renderWorkspaceSelector();

  console.log('[renderHistory] Start rendering. Conversations count:', conversations.length);
  historyList.innerHTML = '';

  // 对话区域标题
  const conversationHeader = document.createElement('div');
  conversationHeader.className = 'conversation-header';
  conversationHeader.innerHTML = '<span class="section-label">💬 对话列表</span>';
  historyList.appendChild(conversationHeader);

  // 渲染对话列表
  conversations.forEach(conv => {
    // ... 现有渲染逻辑保持不变
  });
}
```

**事件绑定** (在 `initializeApp()` 中添加):

```javascript
// 工作空间选择器按钮
document.getElementById('workspace-selector-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  toggleWorkspaceDropdown();
});

// 设置按钮
document.getElementById('workspace-settings-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  showWorkspaceSettings(currentWorkspaceId);
});

// 创建按钮
document.getElementById('create-workspace-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  showCreateWorkspaceDialog();
});

// 点击外部关闭菜单
document.addEventListener('click', (e) => {
  const menu = document.getElementById('workspace-dropdown-menu');
  const btn = document.getElementById('workspace-selector-btn');
  if (menu && !menu.contains(e.target) && !btn.contains(e.target)) {
    menu.classList.remove('show');
  }
});
```

### CSS 样式

**添加到 sidebar.css 或新建 panel.css**:

```css
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
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all var(--duration-standard) var(--ease-standard);
}

#workspace-selector-btn:hover {
  background: rgba(103, 126, 234, 0.12);
}

#workspace-settings-btn,
#create-workspace-btn {
  width: 36px;
  height: 36px;
  background: rgba(255, 255, 255, 0.6);
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
  background: rgba(103, 126, 234, 0.15);
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
  background: rgba(103, 126, 234, 0.1);
}

.workspace-dropdown-item.active {
  background: rgba(103, 126, 234, 0.15);
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
  background: rgba(0, 122, 255, 0.08);
}
```

---

## 工作空间切换流程

```
用户点击工作空间按钮
  ↓
显示下拉菜单 (toggleWorkspaceDropdown)
  ↓
用户选择工作空间
  ↓
调用 switchWorkspace(workspaceId)
  ↓
1. 调用后端 API: window.deepagents.updateWorkspace()
2. 更新状态: currentWorkspaceId, localStorage
3. 清空对话视图: messagesDiv.innerHTML = ''
4. 关闭技能面板
5. 加载对话: loadWorkspaceConversations(workspaceId)
6. 重新渲染: renderWorkspaceSelector() + renderHistory()
```

---

## 验证清单

### 功能验证
- [ ] `#sidebar` 中的工作空间选择器已移除
- [ ] `#side-panel` 顶部显示工作空间选择器
- [ ] 点击工作空间按钮弹出下拉菜单
- [ ] 下拉菜单显示所有工作空间
- [ ] 选择工作空间后正确切换
- [ ] 切换后下方显示该工作空间的对话列表
- [ ] 对话列表点击可切换对话
- [ ] 设置按钮和创建按钮正常工作

### 样式验证
- [ ] `#sidebar` 只显示：技能管理、主题设置、模型设置
- [ ] `#side-panel` 布局正确，工作空间选择器在顶部
- [ ] 下拉菜单位置和样式正确
- [ ] Glassmorphism 样式一致

### 交互验证
- [ ] 点击外部区域关闭下拉菜单
- [ ] 切换工作空间后技能面板自动关闭
- [ ] 对话列表选中状态正确更新

---

## 测试步骤

1. 启动应用，检查 `#sidebar` 和 `#side-panel` 布局
2. 点击工作空间选择器，验证下拉菜单显示
3. 切换到不同工作空间，验证对话列表更新
4. 点击对话项，验证对话内容加载
5. 测试设置和创建工作空间功能
