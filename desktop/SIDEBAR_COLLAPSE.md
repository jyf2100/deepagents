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

## 技术实现

### CSS 样式
- 折叠按钮: `.collapse-btn`
- 收缩状态: `#side-panel.collapsed`
- 工具提示: `.icon-tooltip`
- 响应式: `@media (max-width: 768px)`

### JavaScript API
- `initSidePanel()`: 初始化侧边栏状态
- `toggleSidePanel()`: 切换收缩/展开
- `updateCollapseButton(isCollapsed)`: 更新按钮图标
- `setupTooltips()`: 设置工具提示

## 特性

- ✅ 流畅的 0.3s 动画过渡
- ✅ 状态持久化保存
- ✅ 工具提示支持
- ✅ 响应式布局（<768px 自动收缩）
- ✅ 边缘情况处理（技能全屏模式）
- ✅ 跨主题支持（浅色/深色）

## 快捷键

暂无快捷键支持，计划未来版本添加。

## 已知问题

无

## 更新日志

### 2026-01-25
- ✅ 初始实现
- ✅ 添加折叠按钮和样式
- ✅ 实现 260px ↔ 64px 切换
- ✅ 状态持久化保存
- ✅ 工具提示支持
- ✅ 边缘情况处理
- ✅ 响应式布局支持
