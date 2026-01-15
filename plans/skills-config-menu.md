# 技能配置菜单功能 - 任务计划

## 目标
在 DeepAgents Desktop 应用中添加技能配置菜单，允许用户管理自己的技能。

## 当前状态
- Phase-2 Desktop Client 已完成基本聊天功能
- 左侧历史面板已实现
- Skills 系统已存在于 Python 后端

## 实现阶段

### Phase 1: 需求分析与设计 [COMPLETE]
**目标**: 理解现有系统并设计 UI

**任务**:
- [x] 分析 `libs/deepagents-cli/deepagents_cli/skills/` 目录结构
- [x] 了解技能加载机制 (`load.py`)
- [x] 理解技能数据格式 (SkillMetadata)
- [x] 设计技能配置 UI 布局
- [x] 定义技能状态存储格式

**设计决策**:

**UI 布局**:
- 左侧面板添加标签页切换（历史/技能）
- 侧边栏宽度: 280px
- 技能列表项包含：名称、来源标签、描述、开关

**数据流**:
```
Renderer (UI) → Preload IPC → Main Process → Python DesktopProtocol
```

**配置存储**:
- 前端: localStorage (`deepagents-skill-config`)
- 格式: `{"enabled_skills": ["skill1", "skill2"]}`

**分阶段实现**:
1. Phase 4: 前端 UI（先用模拟数据）
2. Phase 2: 后端 list_skills API
3. Phase 3: 前端 IPC 扩展
4. Phase 5: 连接真实数据

### Phase 2: 后端 API 扩展 [COMPLETE]
**目标**: 在 Python 协议中添加技能管理方法

**任务**:
- [x] 添加 `list_skills` 方法到 desktop/protocol.py
- [x] 添加 handle_request 路由
- [x] 更新 main process IPC handler 调用 Python
- [ ] get_skill_config/set_skill_config（暂不需要，配置在前端存储）

**实现文件**:
- `libs/deepagents-cli/deepagents_cli/desktop/protocol.py` - `_handle_list_skills()` 方法
- `desktop/src/main/index.js` - listSkills IPC handler 调用 Python

### Phase 3: 前端 IPC 扩展 [COMPLETE]
**目标**: 在 preload 中添加技能相关的 IPC API

**任务**:
- [x] 添加 `listSkills` 方法到 preload/index.js（在 Phase 4 完成）
- [x] 暴露给 renderer 进程

### Phase 4: 前端 UI 实现 [COMPLETE]
**目标**: 创建技能配置界面（先用模拟数据）

**任务**:
- [x] 更新 HTML 添加标签页切换
- [x] 添加技能面板 CSS 样式
- [x] 实现 JavaScript 逻辑
- [x] 添加 preload listSkills API
- [x] 添加 main process listSkills handler（模拟数据）

**实现文件**:
- `desktop/src/renderer/index.html` - 标签页 + 技能面板样式
- `desktop/src/renderer/app.js` - 技能列表渲染和开关逻辑
- `desktop/src/preload/index.js` - listSkills IPC API
- `desktop/src/main/index.js` - listSkills handler（返回模拟数据）

### Phase 5: 集成与测试 [COMPLETE]
**目标**: 连接前后端并测试

**任务**:
- [x] 测试技能列表加载（从 Python 后端）
- [x] 测试技能开关功能
- [x] 测试配置持久化（localStorage）
- [x] 构建并验证

**测试结果**:
- 构建成功
- Python API (`_handle_list_skills`) 已实现
- IPC 通信已连接
- 应用已启动

### Phase 6: 路径解析修复 [COMPLETE]
**目标**: 修复打包应用中项目根目录查找问题

**问题分析**:
- 打包后应用的工作目录在 app bundle 内部
- `.../DeepAgents.app/Contents/Resources/deepagents-cli`
- 向上 3 层搜索无法到达项目根目录

**解决方案**:
- 增加搜索层级从 3 → 10
- 简化搜索逻辑，直接逐级向上查找 `.deepagents` 目录

**实现文件**:
- `libs/deepagents-cli/deepagents_cli/desktop/protocol.py` - `_handle_list_skills()` 方法（第 191-210 行）

## 错误记录
| 错误 | 尝试 | 解决方案 | 状态 |
|------|------|----------|------|
| 技能显示"加载中" | 1 | 发现数据结构错误：`result.skills` → `result.data.skills` | ✅ 已修复 |
| 没有添加技能按钮 | 1 | 在技能面板顶部添加"+ 添加技能"按钮 | ✅ 已修复 |
| 看不到技能 | 1-2 | 路径解析问题：`Path.cwd()` 在打包应用中指向 app bundle 内部 | ✅ 已修复 |
| 看不到技能 | 3 | 增加搜索层级从 3 → 10，找到项目根目录的 `.deepagents` | ✅ 已修复 |

## 完成标准
- [x] 用户可以查看所有可用技能（从 Python 后端加载）
- [x] 用户可以启用/禁用技能（UI 开关 + localStorage）
- [x] 技能配置持久化保存（localStorage）
- [x] 技能状态在重启后保持

## 实现总结

### 已完成功能
1. ✅ 左侧面板标签页切换（历史/技能）
2. ✅ 技能列表显示（名称、描述、来源标签）
3. ✅ 技能启用/禁用开关
4. ✅ 配置持久化（localStorage）
5. ✅ Python 后端 API（`_handle_list_skills`）
6. ✅ IPC 通信链路（Renderer → Preload → Main → Python）

### 数据流
```
用户点击"技能"标签
  → loadSkills() 调用
  → window.deepagents.listSkills()
  → ipcRenderer.invoke('listSkills')
  → Python DesktopProtocol._handle_list_skills()
  → list_skills() 从 ~/.deepagents/skills 和 .deepagents/skills 加载
  → 返回技能列表
  → renderSkills() 渲染 UI
```

### 技能存储位置
- 用户技能: `~/.deepagents/skills/`
- 项目技能: `/Users/roc/deepagents/.deepagents/skills/`
