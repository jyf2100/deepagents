# 左侧栏收缩展开功能实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标：** 为 DeepAgents 桌面应用的左侧栏添加收缩/展开功能，允许用户通过点击按钮在 260px 和 64px 宽度之间切换，状态持久化保存。

**架构：** 在现有的温暖自然 UI 系统基础上，添加 CSS 类（`.collapsed`）控制宽度变化，通过 JavaScript 管理状态切换和配置持久化，使用现有的 `window.deepagents` API 存储用户偏好。

**技术栈：** HTML5, CSS3 (Custom Properties), JavaScript (ES6+), Electron IPC (window.deepagents API)

---

## Phase 1: CSS 样式系统

### Task 1: 添加折叠按钮基础样式

**Files:**
- Modify: `desktop/src/renderer/index.html` (在 `<style>` 标签内，约 line 1400+)

**Step 1: 添加折叠按钮 CSS**

在 `</style>` 标签前添加以下 CSS：

```css
/* === 温暖自然 - 侧边栏折叠按钮 === */
.collapse-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s var(--ease-in-out);
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.collapse-btn:hover {
  background: var(--accent-color);
  color: var(--text-inverse);
  transform: scale(1.05);
  box-shadow: var(--shadow-md);
}

.collapse-btn:active {
  transform: scale(0.95);
}

/* 收缩状态下按钮居中 */
#side-panel.collapsed .collapse-btn {
  right: 16px; /* (64 - 32) / 2 = 16px 居中 */
}
```

**Step 2: 验证语法**

检查: 确保所有 CSS 属性值正确，变量名与现有系统一致

**Step 3: 提交**

```bash
git add desktop/src/renderer/index.html
git commit -m "style(sidebar): add collapse button styles"
```

---

### Task 2: 添加侧边栏收缩状态样式

**Files:**
- Modify: `desktop/src/renderer/index.html` (修改 `#side-panel` 样式，约 line 173)

**Step 1: 更新 #side-panel 基础样式**

找到 `#side-panel` 定义（约 line 173），修改为：

```css
/* 左侧面板 - 温暖自然风格 */
#side-panel {
  width: 260px;
  height: 100%;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  position: relative; /* 确保折叠按钮绝对定位生效 */
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  contain: layout; /* 性能优化：防止子元素重排影响其他区域 */
}
```

**Step 2: 添加收缩状态类**

在 `#side-panel` 样式后添加：

```css
/* 侧边栏收缩状态 */
#side-panel.collapsed {
  width: 64px;
}

/* 收缩状态下隐藏文字标签 */
#side-panel.collapsed .nav-label,
#side-panel.collapsed .conversation-title,
#side-panel.collapsed .conversation-date {
  display: none;
}

/* 收缩状态下图标居中 */
#side-panel.collapsed .nav-icon,
#side-panel.collapsed .conversation-icon {
  margin: 0 auto;
  width: 100%;
  text-align: center;
  padding: 12px 0;
}
```

**Step 3: 提交**

```bash
git add desktop/src/renderer/index.html
git commit -m "style(sidebar): add collapsed state styles"
```

---

### Task 3: 添加工具提示样式

**Files:**
- Modify: `desktop/src/renderer/index.html` (在 `<style>` 标签内)

**Step 1: 添加 tooltip CSS**

在 `</style>` 标签前添加：

```css
/* === 温暖自然 - 工具提示 === */
.icon-tooltip {
  position: fixed;
  left: 72px; /* 64px (侧边栏宽度) + 8px (margin) */
  padding: 6px 12px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  font-size: 14px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s var(--ease-in-out);
  z-index: 1000;
}

.icon-tooltip.visible {
  opacity: 1;
}

/* 仅在收缩状态下显示 tooltip */
#side-panel:not(.collapsed) .icon-tooltip {
  display: none;
}
```

**Step 2: 提交**

```bash
git add desktop/src/renderer/index.html
git commit -m "style(sidebar): add tooltip styles for collapsed state"
```

---

### Task 4: 添加响应式布局支持

**Files:**
- Modify: `desktop/src/renderer/index.html` (在 `<style>` 标签内)

**Step 1: 添加媒体查询**

在 `</style>` 标签前添加：

```css
/* === 响应式布局 === */
@media (max-width: 768px) {
  #side-panel {
    width: 64px !important;
  }

  /* 小屏幕下隐藏折叠按钮 */
  .collapse-btn {
    display: none;
  }

  /* 小屏幕下始终隐藏文字 */
  .nav-label,
  .conversation-title,
  .conversation-date {
    display: none !important;
  }
}
```

**Step 2: 提交**

```bash
git add desktop/src/renderer/index.html
git commit -m "style(sidebar): add responsive layout for mobile"
```

---

## Phase 2: JavaScript 功能实现

### Task 5: 创建状态管理函数

**Files:**
- Modify: `desktop/src/renderer/app.js` (在文件末尾或合适位置)

**Step 1: 添加初始化函数**

```javascript
/**
 * 初始化侧边栏状态
 * 从配置中读取用户的折叠偏好并应用
 */
async function initSidePanel() {
  try {
    const config = await window.deepagents.getConfig();

    if (config.sidePanelCollapsed) {
      const sidePanel = document.getElementById('side-panel');
      sidePanel.classList.add('collapsed');
      updateCollapseButton(true);
    }

    console.log('[SidePanel] Initialized with state:', config.sidePanelCollapsed ? 'collapsed' : 'expanded');
  } catch (error) {
    console.error('[SidePanel] Failed to initialize:', error);
    // 出错时默认展开
  }
}
```

**Step 2: 提交**

```bash
git add desktop/src/renderer/app.js
git commit -m "feat(sidebar): add state initialization function"
```

---

### Task 6: 创建切换功能函数

**Files:**
- Modify: `desktop/src/renderer/app.js`

**Step 1: 添加切换函数**

```javascript
/**
 * 切换侧边栏收缩/展开状态
 * 处理技能全屏模式的边缘情况，并保存状态到配置
 */
async function toggleSidePanel() {
  const sidePanel = document.getElementById('side-panel');

  // 边缘情况：如果在技能全屏模式，先退出
  if (sidePanel.classList.contains('skills-active')) {
    sidePanel.classList.remove('skills-active');
  }

  // 切换收缩状态
  const isCollapsed = sidePanel.classList.toggle('collapsed');

  // 更新按钮图标
  updateCollapseButton(isCollapsed);

  // 保存状态到配置
  try {
    await window.deepagents.setConfig({ sidePanelCollapsed: isCollapsed });
    console.log('[SidePanel] Toggled to:', isCollapsed ? 'collapsed' : 'expanded');
  } catch (error) {
    console.error('[SidePanel] Failed to save config:', error);
  }
}
```

**Step 2: 提交**

```bash
git add desktop/src/renderer/app.js
git commit -m "feat(sidebar): add toggle function with state persistence"
```

---

### Task 7: 创建按钮更新函数

**Files:**
- Modify: `desktop/src/renderer/app.js`

**Step 1: 添加按钮更新函数**

```javascript
/**
 * 更新折叠按钮的图标和提示文本
 * @param {boolean} isCollapsed - 是否处于收缩状态
 */
function updateCollapseButton(isCollapsed) {
  const btn = document.getElementById('collapse-btn');

  if (!btn) {
    console.warn('[SidePanel] Collapse button not found');
    return;
  }

  // 更新图标和提示文本
  btn.innerHTML = isCollapsed ? '→' : '←';
  btn.title = isCollapsed ? '展开侧边栏' : '收缩侧边栏';

  console.log('[SidePanel] Button updated:', isCollapsed ? 'collapsed' : 'expanded');
}
```

**Step 2: 提交**

```bash
git add desktop/src/renderer/app.js
git commit -m "feat(sidebar): add button update function"
```

---

### Task 8: 添加工具提示功能

**Files:**
- Modify: `desktop/src/renderer/app.js`

**Step 1: 添加 tooltip 创建和显示函数**

```javascript
/**
 * 为导航项添加工具提示
 * 在收缩状态下悬停时显示功能说明
 */
function setupTooltips() {
  const navItems = document.querySelectorAll('.nav-item, .conversation-item');

  navItems.forEach(item => {
    const label = item.querySelector('.nav-label, .conversation-title');
    if (!label) return;

    const text = label.textContent.trim();

    // 鼠标悬停时显示 tooltip
    item.addEventListener('mouseenter', () => {
      const sidePanel = document.getElementById('side-panel');
      if (!sidePanel.classList.contains('collapsed')) return;

      showTooltip(item, text);
    });

    // 鼠标移开时隐藏 tooltip
    item.addEventListener('mouseleave', () => {
      hideTooltip();
    });
  });
}

/**
 * 显示工具提示
 * @param {HTMLElement} target - 目标元素
 * @param {string} text - 提示文本
 */
function showTooltip(target, text) {
  // 移除旧的 tooltip
  hideTooltip();

  // 创建新的 tooltip
  const tooltip = document.createElement('div');
  tooltip.className = 'icon-tooltip';
  tooltip.id = 'sidebar-tooltip';
  tooltip.textContent = text;

  // 计算位置（目标元素顶部）
  const rect = target.getBoundingClientRect();
  tooltip.style.top = `${rect.top + rect.height / 2 - 12}px`;

  document.body.appendChild(tooltip);

  // 触发重排以应用过渡动画
  requestAnimationFrame(() => {
    tooltip.classList.add('visible');
  });
}

/**
 * 隐藏工具提示
 */
function hideTooltip() {
  const tooltip = document.getElementById('sidebar-tooltip');
  if (tooltip) {
    tooltip.classList.remove('visible');
    // 等待动画结束后移除
    setTimeout(() => {
      tooltip.remove();
    }, 200);
  }
}
```

**Step 2: 提交**

```bash
git add desktop/src/renderer/app.js
git commit -m "feat(sidebar): add tooltip functionality for collapsed state"
```

---

## Phase 3: DOM 操作和事件绑定

### Task 9: 创建折叠按钮并插入 DOM

**Files:**
- Modify: `desktop/src/renderer/app.js` (在 DOMContentLoaded 事件中)

**Step 1: 添加按钮创建代码**

找到 `document.addEventListener('DOMContentLoaded', ...)` 或类似的初始化代码，在其中添加：

```javascript
// 创建折叠按钮
const collapseBtn = document.createElement('button');
collapseBtn.id = 'collapse-btn';
collapseBtn.className = 'collapse-btn';
collapseBtn.innerHTML = '←';
collapseBtn.title = '收缩侧边栏';
collapseBtn.setAttribute('aria-label', '切换侧边栏');
collapseBtn.addEventListener('click', toggleSidePanel);

// 插入到侧边栏
const sidePanel = document.getElementById('side-panel');
if (sidePanel) {
  // 确保侧边栏有相对定位
  sidePanel.style.position = 'relative';
  sidePanel.insertBefore(collapseBtn, sidePanel.firstChild);
} else {
  console.error('[SidePanel] Side panel element not found');
}
```

**Step 2: 提交**

```bash
git add desktop/src/renderer/app.js
git commit -m "feat(sidebar): create and inject collapse button into DOM"
```

---

### Task 10: 初始化侧边栏状态

**Files:**
- Modify: `desktop/src/renderer/app.js` (在 DOMContentLoaded 事件中)

**Step 1: 添加初始化调用**

在创建折叠按钮后添加：

```javascript
// 初始化侧边栏状态
await initSidePanel();

// 设置工具提示
setupTooltips();
```

**Step 2: 提交**

```bash
git add desktop/src/renderer/app.js
git commit -m "feat(sidebar): initialize side panel state on load"
```

---

## Phase 4: 测试和验证

### Task 11: 手动功能测试

**Step 1: 启动应用**

```bash
cd desktop
npm start
```

**Step 2: 测试折叠功能**

- [ ] 点击折叠按钮（←），侧边栏从 260px 收缩到 64px
- [ ] 按钮图标变为 →
- [ ] 文字标签消失，图标居中
- [ ] 动画流畅（0.3s）

**Step 3: 测试展开功能**

- [ ] 点击展开按钮（→），侧边栏从 64px 展开到 260px
- [ ] 按钮图标变为 ←
- [ ] 文字标签重新显示
- [ ] 动画流畅

**Step 4: 测试状态持久化**

- [ ] 收缩侧边栏
- [ ] 关闭应用
- [ ] 重新启动应用
- [ ] 侧边栏保持收缩状态

**Step 5: 测试 tooltip**

- [ ] 收缩侧边栏
- [ ] 鼠标悬停在图标上
- [ ] 显示工具提示（如"会话列表"）
- [ ] 移开鼠标，tooltip 消失

**Step 6: 测试边缘情况**

- [ ] 切换到技能标签（侧边栏全屏）
- [ ] 点击折叠按钮
- [ ] 侧边栏先退出全屏，然后收缩

**Step 7: 记录测试结果**

如果有问题，记录到文档

---

### Task 12: 性能和视觉验证

**Step 1: 性能检查**

- [ ] 打开开发者工具（DevTools）
- [ ] 切换侧边栏状态，观察 Performance 面板
- [ ] 确认无长时间运行的脚本（>50ms）
- [ ] 确认动画帧率保持 60fps

**Step 2: 视觉检查**

- [ ] 收缩/展开过程无内容溢出
- [ ] 按钮位置始终合理（右上角或居中）
- [ ] 颜色、圆角、阴影符合温暖自然 UI
- [ ] 过渡动画平滑，无闪烁

**Step 3: 跨主题验证**

- [ ] 切换到浅色主题，测试折叠/展开
- [ ] 切换到深色主题，测试折叠/展开
- [ ] 切换不同强调色，测试折叠/展开
- [ ] 所有主题下视觉效果一致

**Step 4: 响应式验证**

- [ ] 调整窗口宽度到 <768px
- [ ] 侧边栏自动收缩到 64px
- [ ] 折叠按钮隐藏
- [ ] 恢复窗口宽度，侧边栏展开

---

### Task 13: 配置系统验证

**Step 1: 检查配置文件**

配置文件位置（根据操作系统）：
- Windows: `%APPDATA%\deepagents\config.json`
- macOS: `~/Library/Application Support/deepagents/config.json`
- Linux: `~/.config/deepagents/config.json`

**Step 2: 验证配置保存**

- [ ] 收缩侧边栏
- [ ] 打开配置文件
- [ ] 确认 `"sidePanelCollapsed": true` 存在

**Step 3: 验证配置读取**

- [ ] 修改配置文件，设置 `"sidePanelCollapsed": true`
- [ ] 重启应用
- [ ] 确认侧边栏初始状态为收缩

**Step 4: 验证配置更新**

- [ ] 多次切换侧边栏状态
- [ ] 每次检查配置文件
- [ ] 确认值正确更新（true/false）

---

## Phase 5: 代码清理和文档

### Task 14: 添加代码注释和文档

**Files:**
- Modify: `desktop/src/renderer/app.js`
- Create: `desktop/SIDEBAR_COLLAPSE.md`

**Step 1: 完善 JavaScript 注释**

确保所有函数都有完整的 JSDoc 注释：

```javascript
/**
 * 侧边栏折叠功能模块
 *
 * 提供侧边栏收缩/展开功能，包括：
 * - 状态持久化（通过 window.deepagents API）
 * - 流畅的动画过渡（0.3s cubic-bezier）
 * - 工具提示支持（收缩状态下悬停显示）
 * - 边缘情况处理（技能全屏模式）
 *
 * @module SidePanelCollapse
 */
```

**Step 2: 创建用户文档**

创建 `desktop/SIDEBAR_COLLAPSE.md`:

```markdown
# 侧边栏折叠功能

## 功能说明

左侧栏可以通过点击右上角的折叠按钮（←）在展开（260px）和收缩（64px）状态之间切换。

## 使用方法

1. **折叠侧边栏**: 点击左上角的 ← 按钮
2. **展开侧边栏**: 点击左上角的 → 按钮
3. **查看功能提示**: 收缩状态下，鼠标悬停在图标上显示功能名称

## 状态保存

您的折叠偏好会自动保存，下次打开应用时保持该状态。

## 配置

配置项: `sidePanelCollapsed` (布尔值)
- `false`: 展开状态（默认）
- `true`: 收缩状态

配置文件位置:
- Windows: `%APPDATA%\deepagents\config.json`
- macOS: `~/Library/Application Support/deepagents/config.json`
- Linux: `~/.config/deepagents/config.json`
```

**Step 3: 提交**

```bash
git add desktop/src/renderer/app.js desktop/SIDEBAR_COLLAPSE.md
git commit -m "docs(sidebar): add code comments and user documentation"
```

---

### Task 15: 最终代码审查

**Step 1: 代码质量检查**

- [ ] 无 console.log 调试语句（保留重要的错误日志）
- [ ] 无注释掉的代码
- [ ] 无 TODO 或 FIXME（或已创建 issue）
- [ ] 所有函数都有清晰的注释
- [ ] 变量命名语义化

**Step 2: 安全性检查**

- [ ] 无用户输入的 XSS 风险
- [ ] 配置读写有 try-catch 保护
- [ ] DOM 操作前检查元素存在性

**Step 3: 兼容性检查**

- [ ] 使用现有 API（window.deepagents）
- [ ] 不引入新的依赖
- [ ] CSS 变量使用现有命名规范
- [ ] 不破坏现有功能

**Step 4: 提交最终版本**

如果发现小问题，修复后提交：

```bash
git add desktop/src/renderer/app.js desktop/src/renderer/index.html
git commit -m "refactor(sidebar): final code cleanup and improvements"
```

---

## Phase 6: 打包和部署

### Task 16: 构建和测试

**Step 1: 构建应用**

```bash
cd desktop
npm run build
```

**Step 2: 测试打包版本**

- [ ] 运行 `release/Cowork Setup 0.0.2.exe`
- [ ] 完整测试所有功能
- [ ] 确认打包版本功能正常

**Step 3: 性能测试**

- [ ] 使用打包版本测试动画性能
- [ ] 确认无内存泄漏
- [ ] 确认启动速度正常

**Step 4: 提交构建说明**

如果有构建相关问题，记录到文档

---

### Task 17: 合并准备

**Step 1: 检查分支状态**

```bash
git status
git log --oneline -10
```

**Step 2: 确保无未提交更改**

- [ ] Working tree clean
- [ ] 所有任务已完成
- [ ] 测试全部通过

**Step 3: 创建最终总结提交**

```bash
git commit --allow-empty -m "chore(sidebar): complete side panel collapse feature

- ✅ 添加折叠按钮和样式
- ✅ 实现 260px ↔ 64px 切换
- ✅ 状态持久化保存
- ✅ 工具提示支持
- ✅ 边缘情况处理
- ✅ 响应式布局支持
- ✅ 完整测试和文档

所有 17 个任务完成，准备合并到主分支。"
```

**Step 4: 推送到远程**

```bash
git push origin feature/side-panel-collapse
```

---

## 总结

**实施任务数**: 17 个任务
**预计时间**: 1-2 小时
**修改文件**:
- `desktop/src/renderer/index.html` (CSS 样式)
- `desktop/src/renderer/app.js` (JavaScript 逻辑)
- `desktop/SIDEBAR_COLLAPSE.md` (用户文档，新建)

**关键功能**:
- ✅ 点击按钮切换 260px ↔ 64px
- ✅ 配置持久化（sidePanelCollapsed）
- ✅ 工具提示（收缩状态）
- ✅ 流畅动画（0.3s cubic-bezier）
- ✅ 响应式支持（<768px 自动收缩）

**测试清单**:
- [ ] 折叠/展开功能正常
- [ ] 状态持久化工作
- [ ] Tooltip 显示正确
- [ ] 技能全屏模式边缘情况处理
- [ ] 响应式布局正确
- [ ] 所有主题下视觉一致
- [ ] 性能良好（60fps）

**完成标准**:
- 所有 17 个任务完成
- 所有测试通过
- 代码审查通过
- 文档完善
- 准备合并

---

**创建日期**: 2026-01-25
**设计风格**: 温暖自然 UI
**实施方法**: Subagent-Driven Development
