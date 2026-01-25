# 左侧栏收缩展开功能设计文档

> **创建日期**: 2026-01-25
> **功能**: 左侧栏收缩展开
> **设计风格**: 温暖自然 UI

## 概述

为 DeepAgents 桌面应用的左侧栏添加收缩/展开功能，允许用户通过点击按钮来折叠侧边栏，从而获得更大的内容显示区域。收缩状态下保留图标导航，悬停时显示工具提示。

## 设计目标

- **节省空间**: 收缩后宽度从 260px 减少到 64px
- **保持功能**: 收缩状态下仍可通过图标访问主要功能
- **状态持久化**: 记住用户的折叠偏好
- **流畅体验**: 平滑的动画过渡，符合温暖自然 UI 风格
- **无障碍设计**: 清晰的视觉反馈和工具提示

---

## 第一部分：按钮位置和收缩状态

### 折叠按钮

**位置**: 左侧栏（`#side-panel`）右上角
- 距离顶部: 12px
- 距离右边缘: 12px
- z-index: 10（确保在其他元素之上）

**样式设计**:
```css
.collapse-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md); /* 12px */
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s var(--ease-in-out);
  z-index: 10;
}

.collapse-btn:hover {
  background: var(--accent-color);
  color: var(--text-inverse);
  transform: scale(1.05);
}

.collapse-btn:active {
  transform: scale(0.95);
}

/* 收缩状态下按钮居中 */
#side-panel.collapsed .collapse-btn {
  right: 16px; /* (64 - 32) / 2 */
}
```

**图标状态**:
- 展开状态: `←` (箭头向左，提示"收缩侧边栏")
- 收缩状态: `→` (箭头向右，提示"展开侧边栏")

### 收缩状态宽度

**宽度变化**:
- 展开状态: `260px` (显示完整文字和图标)
- 收缩状态: `64px` (只显示图标)

**过渡动画**:
```css
#side-panel {
  width: 260px;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

#side-panel.collapsed {
  width: 64px;
}
```

---

## 第二部分：收缩状态下的内容显示

### 内容隐藏策略

**收缩状态（64px）下**:
- ✅ **图标保留并居中**: 所有导航图标保留，垂直居中对齐
- ❌ **文字标签隐藏**: 会话列表标题、日期等文字消失
- 📏 **头像/图标缩小**: 圆形头像从 32px 缩小到 24px

**HTML 结构**:
```html
<div class="nav-item">
  <div class="nav-icon">📁</div>
  <div class="nav-label">会话列表</div>
</div>
```

**CSS 控制**:
```css
#side-panel.collapsed .nav-label {
  display: none;
}

#side-panel.collapsed .nav-icon {
  margin: 0 auto;
  width: 100%;
  text-align: center;
  padding: 12px 0;
}

#side-panel.collapsed .avatar {
  width: 24px;
  height: 24px;
}
```

### 工具提示（Tooltip）

**收缩状态下**，鼠标悬停在图标上时显示悬浮提示。

**自定义 Tooltip 样式**（匹配温暖自然 UI）:
```css
.icon-tooltip {
  position: absolute;
  left: 100%;
  top: 50%;
  transform: translateY(-50%);
  margin-left: 8px;
  padding: 6px 12px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  font-size: 14px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
  z-index: 100;
}

.nav-icon:hover .icon-tooltip {
  opacity: 1;
}
```

---

## 第三部分：状态持久化和交互逻辑

### 状态存储

**配置键名**: `sidePanelCollapsed` (布尔值)
**默认值**: `false` (展开状态)
**存储方式**: 通过 `window.deepagents.getConfig/setConfig`

### JavaScript 实现

```javascript
/**
 * 初始化侧边栏状态
 */
async function initSidePanel() {
  const config = await window.deepagents.getConfig();

  if (config.sidePanelCollapsed) {
    document.getElementById('side-panel').classList.add('collapsed');
    updateCollapseButton(true);
  }
}

/**
 * 切换侧边栏收缩/展开状态
 */
async function toggleSidePanel() {
  const sidePanel = document.getElementById('side-panel');
  const isCollapsed = sidePanel.classList.toggle('collapsed');

  // 更新按钮图标
  updateCollapseButton(isCollapsed);

  // 保存状态到配置
  await window.deepagents.setConfig({ sidePanelCollapsed: isCollapsed });
}

/**
 * 更新折叠按钮的图标和提示文本
 */
function updateCollapseButton(isCollapsed) {
  const btn = document.getElementById('collapse-btn');
  btn.innerHTML = isCollapsed ? '→' : '←';
  btn.title = isCollapsed ? '展开侧边栏' : '收缩侧边栏';
}
```

### 边缘情况处理

#### 1. 技能标签激活时

当用户切换到"技能"标签时，左侧栏会全屏展开（`width: 100%`）。

**处理方案**:
- 折叠按钮仍然可见
- 点击折叠按钮时：
  - 方案 A: 先退出技能全屏模式，然后执行收缩
  - 方案 B: 技能全屏模式下禁用折叠按钮（灰显）

**推荐**: 方案 A（更直观）

```javascript
function toggleSidePanel() {
  const sidePanel = document.getElementById('side-panel');

  // 如果在技能全屏模式，先退出
  if (sidePanel.classList.contains('skills-active')) {
    sidePanel.classList.remove('skills-active');
  }

  // 然后执行收缩/展开
  const isCollapsed = sidePanel.classList.toggle('collapsed');
  updateCollapseButton(isCollapsed);
  await window.deepagents.setConfig({ sidePanelCollapsed: isCollapsed });
}
```

#### 2. 响应式布局

**小屏幕自动收缩**:
```css
@media (max-width: 768px) {
  #side-panel {
    width: 64px !important;
  }

  .collapse-btn {
    display: none; /* 小屏幕不允许手动展开 */
  }
}
```

#### 3. 动画中断防抖

```javascript
let isAnimating = false;

async function toggleSidePanel() {
  if (isAnimating) return;

  isAnimating = true;
  // ... 执行切换逻辑

  setTimeout(() => {
    isAnimating = false;
  }, 300); // 等于动画持续时间
}
```

---

## 第四部分：事件监听、性能优化和测试

### 事件监听器设置

**在 `app.js` 的初始化阶段添加**:

```javascript
document.addEventListener('DOMContentLoaded', async () => {
  // 1. 创建折叠按钮
  const collapseBtn = document.createElement('button');
  collapseBtn.id = 'collapse-btn';
  collapseBtn.className = 'collapse-btn';
  collapseBtn.innerHTML = '←';
  collapseBtn.title = '收缩侧边栏';
  collapseBtn.addEventListener('click', toggleSidePanel);

  // 2. 插入到侧边栏
  const sidePanel = document.getElementById('side-panel');
  sidePanel.style.position = 'relative'; // 确保按钮绝对定位生效
  sidePanel.insertBefore(collapseBtn, sidePanel.firstChild);

  // 3. 初始化状态
  await initSidePanel();
});
```

### 性能优化

#### 1. CSS 容器隔离

```css
#side-panel {
  contain: layout; /* 防止子元素重排影响其他区域 */
}
```

#### 2. GPU 加速（可选）

如果动画卡顿，可以使用 `transform` 替代 `width`:

```css
#side-panel {
  width: 260px;
  transform: translateX(0);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

#side-panel.collapsed {
  width: 64px;
  /* 或者使用负边距 */
  /* margin-left: -196px; */
}
```

**推荐**: 继续使用 `width` 动画，现代浏览器性能足够。

### 测试清单

#### 功能测试

- [ ] 点击折叠按钮，侧边栏平滑收缩到 64px
- [ ] 点击展开按钮，侧边栏平滑展开到 260px
- [ ] 刷新页面，状态保持（收缩状态在刷新后仍收缩）
- [ ] 收缩状态下，图标居中显示，文字隐藏
- [ ] 收缩状态下，悬停图标显示 tooltip
- [ ] 按钮图标正确切换（← / →）
- [ ] 按钮悬停效果正常（背景色变为强调色）

#### 边缘情况测试

- [ ] 技能标签激活时，侧边栏全屏显示
- [ ] 技能全屏模式下点击折叠按钮，先退出全屏再收缩
- [ ] 快速点击折叠按钮，动画不冲突（防抖生效）
- [ ] 小屏幕（<768px）自动收缩，折叠按钮隐藏

#### 视觉测试

- [ ] 动画流畅，无闪烁或卡顿
- [ ] 收缩/展开过程中内容不溢出
- [ ] 按钮位置在展开和收缩状态下都合理
- [ ] 整体风格符合温暖自然 UI（圆角、阴影、颜色）

#### 配置持久化测试

- [ ] 配置文件中 `sidePanelCollapsed` 正确保存
- [ ] 配置文件读取正确，初始状态应用正确
- [ ] 多次切换后配置值始终正确

---

## 实施文件清单

### 需要修改的文件

1. **`desktop/src/renderer/index.html`**
   - 添加折叠按钮 CSS 样式
   - 添加收缩状态 CSS（`.collapsed` 类）
   - 添加 tooltip 样式

2. **`desktop/src/renderer/app.js`**
   - 添加 `initSidePanel()` 函数
   - 添加 `toggleSidePanel()` 函数
   - 添加 `updateCollapseButton()` 函数
   - 在初始化时创建折叠按钮并绑定事件

### 不需要修改的文件

- `desktop/src/renderer/theme.js` - 主题系统无需改动
- `desktop/src/renderer/animation.js` - 动画控制器无需改动

---

## 设计决策记录

### 为什么选择 64px 作为收缩宽度？

**理由**:
- 足够显示 32-40px 的图标加上 padding
- 保持足够大的点击区域（符合 Fitts's Law）
- 常见的侧边栏收缩宽度（VS Code、Slack 等应用）

### 为什么不使用拖动调整宽度？

**理由**:
- 收缩/展开是二态操作，更简单直观
- 固定宽度（260px / 64px）更容易预测和布局
- 减少实现复杂度和维护成本
- 未来可以作为增强功能添加

### 为什么使用 `width` 动画而非 `transform`？

**理由**:
- `width` 更直观，布局自动适应
- 现代浏览器对 `width` 动画优化良好
- 避免使用负边距或绝对定位带来的布局问题
- 如果性能有问题，可以后续优化为 `transform`

---

## 未来增强功能（可选）

- [ ] 拖动边缘自由调整宽度
- [ ] 记住用户自定义的宽度
- [ ] 收缩状态下显示 mini 版本的应用 logo
- [ ] 键盘快捷键（如 Cmd/Ctrl + B）切换侧边栏
- [ ] 动画速度设置（在主题设置中）
- [ ] 双击标题栏快速切换

---

**设计完成时间**: 2026-01-25
**设计风格**: 温暖自然 UI
**准备实施**: ✅ 是
