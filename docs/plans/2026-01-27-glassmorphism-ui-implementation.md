# Glassmorphism UI 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标:** 将 Cowork 桌面应用从 macOS Big Sur 风格升级为现代 Glassmorphism 毛玻璃风格

**架构:**
- 使用 CSS 变量系统统一样式源，便于主题维护
- 保持现有 HTML 结构不变，仅更新 CSS
- 添加背景光晕动画增强视觉层次
- 优化动画过渡效果提升交互体验

**技术栈:** Electron, CSS3, HTML5

---

### Task 1: 创建 CSS 变量系统文件

**Files:**
- Create: `desktop/src/renderer/glassmorphism.css`

**Step 1: 创建 CSS 变量定义文件**

在 `desktop/src/renderer/glassmorphism.css` 中定义：

```css
/* === Glassmorphism CSS 变量系统 === */

:root {
  /* === 毛玻璃背景 === */
  --glass-bg: rgba(255, 255, 255, 0.7);
  --glass-bg-strong: rgba(255, 255, 255, 0.85);
  --glass-bg-light: rgba(255, 255, 255, 0.5);
  --glass-border: rgba(255, 255, 255, 0.5);

  /* === 渐变色 === */
  --gradient-primary: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  --gradient-accent: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  --gradient-hero: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);

  /* === 模糊度 === */
  --blur-sm: blur(10px);
  --blur-md: blur(20px);
  --blur-lg: blur(30px);

  /* === 阴影层级 === */
  --shadow-sm: 0 4px 12px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 8px 24px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 20px 40px rgba(0, 0, 0, 0.12);
  --shadow-xl: 0 30px 60px rgba(0, 0, 0, 0.2);
  --shadow-glass: 0 8px 32px rgba(31, 38, 135, 0.15);

  /* === 文字色 === */
  --text-primary: #1a202c;
  --text-secondary: #718096;
  --text-tertiary: #a0aec0;

  /* === 圆角 === */
  --radius-sm: 10px;
  --radius-md: 14px;
  --radius-lg: 20px;
  --radius-full: 9999px;

  /* === 过渡 === */
  --ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);

  /* === 动画时长 === */
  --duration-fast: 150ms;
  --duration-standard: 300ms;
  --duration-slow: 500ms;
}
```

**Step 2: 保存文件**

```bash
# 验证文件已创建
ls -la desktop/src/renderer/glassmorphism.css
```

预期输出：文件存在

**Step 3: 提交**

```bash
git add desktop/src/renderer/glassmorphism.css
git commit -m "feat: add CSS variables for glassmorphism design system

- Define glass background colors and blur levels
- Add gradient color schemes (primary, accent, hero)
- Shadow system with 4 levels
- Text colors, border radius, transitions

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: 在 HTML 中引入新的 CSS 文件

**Files:**
- Modify: `desktop/src/renderer/index.html:1532`

**Step 1: 在 </style> 标签后引入新 CSS**

在 `index.html` 的 `</style>` 后、`</head>` 前添加：

```html
  </style>
  <link rel="stylesheet" href="glassmorphism.css">
  <link rel="stylesheet" href="sidebar.css">
</head>
```

**Step 2: 验证修改**

```bash
# 检查引入语句是否存在
grep "glassmorphism.css" desktop/src/renderer/index.html
```

预期输出：显示引入语句

**Step 3: 提交**

```bash
git add desktop/src/renderer/index.html
git commit -m "chore: import glassmorphism CSS variables

- Add link to glassmorphism.css before sidebar.css
- Ensures variables are loaded before component styles

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: 更新 index.html 内联 CSS 变量

**Files:**
- Modify: `desktop/src/renderer/index.html:8-60` (CSS 变量部分)

**Step 1: 用新变量替换现有 CSS 变量**

将 `:root` 中的变量更新为：

```css
:root {
  /* === 背景色 - Glassmorphism 风格 === */
  --bg-primary: #f0f4f8;
  --bg-secondary: rgba(255, 255, 255, 0.7);
  --bg-tertiary: rgba(255, 255, 255, 0.5);
  --bg-elevated: rgba(255, 255, 255, 0.85);

  /* === 文字色 === */
  --text-primary: #1a202c;
  --text-secondary: #718096;
  --text-tertiary: #a0aec0;
  --text-inverse: #ffffff;

  /* === 边框和分隔线 === */
  --border-color: rgba(255, 255, 255, 0.3);
  --divider-color: rgba(255, 255, 255, 0.2);
  --shadow-color: rgba(0, 0, 0, 0.08);

  /* === 强调色 - 渐变紫 === */
  --accent-color: #667eea;
  --accent-hover: #764ba2;
  --accent-gradient: linear-gradient(135deg, #667eea, #764ba2);

  /* === 危险/删除色 === */
  --danger-color: #f5576c;
  --danger-hover: #f093fb;

  /* === macOS 风格圆角 === */
  --radius-sm: 10px;
  --radius-md: 14px;
  --radius-lg: 20px;
  --radius-2xl: 24px;
  --radius-full: 9999px;

  /* === 毛玻璃阴影 === */
  --shadow-sm: 0 4px 12px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 8px 24px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 20px 40px rgba(0, 0, 0, 0.12);
  --shadow-xl: 0 30px 60px rgba(0, 0, 0, 0.2);

  /* === 缓动函数 === */
  --ease-out: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --bounce: cubic-bezier(0.34, 1.56, 0.64, 1);

  /* === 过渡动画 === */
  --transition-fast: 0.15s var(--ease-out);
  --transition-standard: 0.3s var(--ease-in-out);
  --transition-slow: 0.5s var(--ease-in-out);
}
```

**Step 2: 验证修改**

```bash
# 检查 CSS 变量是否正确
grep -A5 ":root" desktop/src/renderer/index.html | head -20
```

预期输出：显示更新后的 CSS 变量

**Step 3: 提交**

```bash
git add desktop/src/renderer/index.html
git commit -m "refactor(css): update root variables for glassmorphism style

- Replace solid backgrounds with glass transparency
- Update colors to purple gradient theme
- Add glass-specific shadow system
- Modernize easing functions and transitions

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: 添加背景光晕动画效果

**Files:**
- Modify: `desktop/src/renderer/index.html` (在 `</style>` 前添加)

**Step 1: 在 body 样式中添加背景光晕**

在 `body` 样式的 `overflow: hidden;` 后添加：

```css
  /* === 背景光晕动画 === */
  position: relative;
}

/* 动态背景光晕层 */
body::before {
  content: '';
  position: fixed;
  top: -30%;
  left: -30%;
  width: 160%;
  height: 160%;
  background:
    radial-gradient(circle at 30% 30%, rgba(102, 126, 234, 0.12) 0%, transparent 45%),
    radial-gradient(circle at 70% 20%, rgba(240, 147, 251, 0.1) 0%, transparent 40%),
    radial-gradient(circle at 20% 80%, rgba(118, 75, 162, 0.08) 0%, transparent 40%);
  animation: float 25s ease-in-out infinite;
  pointer-events: none;
  z-index: 0;
}

@keyframes float {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  25% { transform: translate(20px, -15px) rotate(3deg); }
  50% { transform: translate(-10px, 10px) rotate(-2deg); }
  75% { transform: translate(15px, 5px) rotate(1deg); }
}
```

**Step 2: 确保 main-content 有相对定位**

检查 `#container` 样式，确保有 `position: relative;` 和 `z-index: 1;`

**Step 3: 提交**

```bash
git add desktop/src/renderer/index.html
git commit -m "feat: add animated background glow effect

- Add three radial gradient orbs with purple/pink colors
- 25-second floating animation for ambient movement
- Fixed positioning to stay behind content
- Pointer events disabled for interaction

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: 更新侧边栏毛玻璃样式

**Files:**
- Modify: `desktop/src/renderer/sidebar.css:4-25` (侧边栏容器样式)

**Step 1: 更新 .sidebar 类**

将 `.sidebar` 样式更新为：

```css
.sidebar {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  width: 280px;
  background: var(--glass-bg);
  backdrop-filter: var(--blur-md);
  border-right: 1px solid var(--glass-border);
  display: flex;
  flex-direction: column;
  transition: width 0.3s var(--ease-out), transform 0.3s var(--ease-out);
  z-index: 100;
}
```

**Step 2: 更新折叠状态样式**

```css
.sidebar.collapsed {
  width: 70px;
}
```

**Step 3: 提交**

```bash
git add desktop/src/renderer/sidebar.css
git commit -m "feat: apply glassmorphism to sidebar

- Add backdrop-filter blur effect
- Semi-transparent glass background
- Smooth width transition
- Enhanced glass border styling

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: 更新侧边栏菜单项样式

**Files:**
- Modify: `desktop/src/renderer/sidebar.css:177-250` (menu-item 样式)

**Step 1: 更新菜单项基础样式**

```css
/* === 菜单项 === */

.menu-item {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  cursor: pointer;
  user-select: none;
  transition: all 0.3s var(--ease-standard);
  position: relative;
  border-radius: var(--radius-sm);
  margin-bottom: 6px;
}

/* 一级菜单项 */
.menu-item-top-level {
  padding: 14px 16px;
}
```

**Step 2: 更新悬停效果**

```css
.menu-item:hover {
  background: rgba(102, 126, 234, 0.1);
  transform: translateX(4px);
}

/* 选中状态 */
.menu-item.active {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.15), rgba(118, 75, 162, 0.15));
  border-left: 3px solid #667eea;
  box-shadow: var(--shadow-sm);
}
```

**Step 3: 提交**

```bash
git add desktop/src/renderer/sidebar.css
git commit -m "style: modernize menu item interactions

- Add subtle gradient background on hover
- Slide-in animation (translateX)
- Active state with gradient background and border
- Improved visual feedback

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: 更新侧边栏标题样式

**Files:**
- Modify: `desktop/src/renderer/sidebar.css:24-75` (sidebar-header)

**Step 1: 更新标题文字样式**

```css
.sidebar-title {
  margin-left: 12px;
  font-size: 18px;
  font-weight: 700;
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  opacity: 1;
  transition: opacity 0.15s var(--ease-out);
  white-space: nowrap;
  overflow: hidden;
}
```

**Step 2: 提交**

```bash
git add desktop/src/renderer/sidebar.css
git commit -m "style: apply gradient text to sidebar title

- Purple gradient text effect
- Updated font weight to 700
- Semi-transparent gradient clip effect

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: 更新按钮样式（工作空间选择器按钮）

**Files:**
- Modify: `desktop/src/renderer/sidebar.css:463-493` (按钮样式)

**Step 1: 更新按钮基础样式**

```css
#sidebar-workspace-selector,
#sidebar-workspace-settings-btn,
#sidebar-create-workspace-btn {
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
  transition: all 0.3s var(--ease-standard);
  cursor: pointer;
}

#sidebar-workspace-selector,
#sidebar-workspace-settings-btn {
  flex: 1;
}

#sidebar-workspace-selector:hover,
#sidebar-workspace-settings-btn:hover,
#sidebar-create-workspace-btn:hover {
  background: rgba(103, 126, 234, 0.15);
  border-color: rgba(102, 126, 234, 0.3);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}
```

**Step 2: 提交**

```bash
git add desktop/src/renderer/sidebar.css
git commit -m "style: update sidebar buttons with glassmorphism

- Semi-transparent glass background
- Purple hover effect with elevation
- Smooth translateY animation
- Enhanced shadow on hover

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: 更新主内容区样式

**Files:**
- Modify: `desktop/src/renderer/index.html:524-540` (#side-panel 样式)

**Step 1: 更新 #side-panel 背景**

```css
/* 左侧面板 - Glassmorphism 风格 */
#side-panel {
  width: 260px;
  height: 100%;
  background: rgba(255, 255, 255, 0.4);
  backdrop-filter: var(--blur-sm);
  border-right: 1px solid var(--glass-border);
  display: flex;
  flex-direction: column;
  transition: width 0.3s var(--ease-out);
}
```

**Step 2: 提交**

```bash
git add desktop/src/renderer/index.html
git commit -m "style: apply glass effect to side panel

- Light glass background with reduced blur
- Maintains border for separation
- Consistent with sidebar styling

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: 更新聊天面板样式

**Files:**
- Modify: `desktop/src/renderer/index.html:524-560` (#chat-panel 样式)

**Step 1: 更新 #chat-panel 样式**

```css
/* 右侧聊天区域 */
#chat-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.3);
  backdrop-filter: blur(5px);
  padding: 0; /* 移除 padding，让顶部栏贴边 */
}
```

**Step 2: 提交**

```bash
git add desktop/src/renderer/index.html
git commit -m "style: add subtle glass effect to chat panel

- Very light glass background for depth
- Minimal blur for readability
- Maintains visual hierarchy

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 11: 更新消息气泡样式

**Files:**
- Modify: `desktop/src/renderer/index.html:547-588` (.message 样式)

**Step 1: 更新用户消息气泡**

```css
.user {
  background: var(--accent-gradient);
  color: white;
  margin-left: auto;
  border-radius: 20px 20px 6px 20px;
  box-shadow: var(--shadow-glass);
}
```

**Step 2: 更新 AI 消息气泡**

```css
.assistant {
  background: var(--glass-bg-strong);
  backdrop-filter: var(--blur-sm);
  color: var(--text-primary);
  border-radius: 20px 20px 20px 6px;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--glass-border);
}
```

**Step 3: 提交**

```bash
git add desktop/src/renderer/index.html
git commit -m "style: redesign message bubbles with glassmorphism

- User messages: purple gradient with glass shadow
- AI messages: glass effect with subtle border
- Rounded corners for modern look
- Enhanced depth through shadows

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 12: 更新输入框和发送按钮样式

**Files:**
- Modify: `desktop/src/renderer/index.html:684-697` (#input-area 样式)
- Modify: `desktop/src/renderer/index.html:691-693` (.message-input 样式)
- Modify: `desktop/src/renderer/index.html:779-797` (#send-btn 样式)

**Step 1: 更新输入区域背景**

```css
#input-area {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(5px);
  border-top: 1px solid var(--glass-border);
}
```

**Step 2: 更新输入框样式**

```css
#message-input {
  flex: 1;
  padding: 14px 18px;
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-border);
  background: rgba(255, 255, 255, 0.7);
  color: var(--text-primary);
  font-size: 15px;
  transition: all 0.3s var(--ease-standard);
}

#message-input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.12);
  background: rgba(255, 255, 255, 0.9);
}
```

**Step 3: 更新发送按钮样式**

```css
#send-btn {
  background: var(--accent-gradient);
  border: none;
  color: white;
  font-weight: 600;
  box-shadow: var(--shadow-glass);
  transition: all 0.3s var(--ease-standard);
}

#send-btn:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

#send-btn:active {
  transform: scale(0.96);
}
```

**Step 4: 提交**

```bash
git add desktop/src/renderer/index.html
git commit -m "style: glassmorphism input area and send button

- Input: glass background with blur
- Focus state: purple border with glow
- Send button: gradient with elevation hover
- Press effect: scale animation

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 13: 更新对话框样式

**Files:**
- Modify: `desktop/src/renderer/index.html` (各种 dialog 样式)

**Step 1: 查找并更新对话框背景样式**

将所有对话框的 `background: var(--bg-tertiary)` 替换为：

```css
background: rgba(255, 255, 255, 0.85);
backdrop-filter: blur(20px);
border: 1px solid var(--glass-border);
box-shadow: var(--shadow-xl);
```

**Step 2: 验证所有对话框样式更新**

```bash
# 检查所有 dialog 是否已更新
grep -n "dialog.*style.*background" desktop/src/renderer/index.html
```

**Step 3: 提交**

```bash
git add desktop/src/renderer/index.html
git commit -m "style: apply glassmorphism to all dialogs

- Semi-transparent backgrounds with blur
- Glass border styling
- Enhanced shadow for depth
- Consistent across all modals

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 14: 添加性能优化和移动端降级

**Files:**
- Modify: `desktop/src/renderer/glassmorphism.css` (添加媒体查询)

**Step 1: 添加移动端降级样式**

在 `glassmorphism.css` 末尾添加：

```css
/* === 性能优化和降级 === */

/* 移动端简化效果 */
@media (max-width: 800px) {
  :root {
    --blur-md: blur(10px);
    --blur-lg: blur(15px);
  }

  /* 禁用背景动画在低性能设备 */
  @media (prefers-reduced-motion: reduce) {
    body::before {
      animation: none;
    }
  }
}

/* GPU 加速 */
.glass-effect {
  will-change: transform;
  transform: translateZ(0);
}
```

**Step 2: 提交**

```bash
git add desktop/src/renderer/glassmorphism.css
git commit -m "perf: add performance optimizations and fallbacks

- Mobile: reduced blur for performance
- Reduced motion: disable background animation
- GPU acceleration hints for animations
- Maintains accessibility

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 15: 构建并测试应用

**Files:**
- Build: desktop/src (执行构建脚本)

**Step 1: 进入 desktop 目录执行构建**

```bash
cd desktop && ./build.sh
```

预期输出：构建成功，生成 DMG 文件

**Step 2: 运行应用验证视觉效果**

```bash
open release/mac-arm64/Cowork.app
```

**Step 3: 手动测试检查项**
- [ ] 背景光晕动画流畅
- [ ] 侧边栏毛玻璃效果
- [ ] 菜单项悬停动画
- [ ] 消息气泡渐变效果
- [ ] 输入框焦点光晕
- [ ] 按钮悬停和点击效果
- [ ] 对话框毛玻璃背景

**Step 4: 提交**

```bash
git add desktop/src/renderer/glassmorphism.css desktop/src/renderer/index.html desktop/src/renderer/sidebar.css
git commit -m "chore: finalize glassmorphism UI implementation

- All components updated with glass effect
- Performance optimizations in place
- Visual testing complete
- Ready for production

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 完成后

所有任务完成后，使用 `superpowers:finishing-a-development-branch` 清理工作树并合并到主分支。
