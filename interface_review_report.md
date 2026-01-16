# 前后端接口参数匹配审阅报告

**审阅日期**: 2026-01-16  
**审阅范围**: 前后端 IPC 通信接口  
**计划文件**: /Users/roc/.claude/plans/sunny-sprouting-cray.md

---

## 审阅摘要

| 状态 | 数量 |
|------|------|
| ✅ 正常工作 | 10/15 |
| ❌ 参数不匹配 | 4/15 |
| ⚠️ 参数不完整 | 1/15 |

---

## 发现的问题

### 🔴 严重问题：参数名不匹配导致功能失效

#### 1. cloneSkillFromGithub 接口
```
main.js 发送:   { github_url, location, use_proxy }
protocol.py 接收: params.get('githubUrl'), params.get('useProxy')
```
**影响**: GitHub 克隆功能完全失效

#### 2. scanGithubForSkills 接口
```
main.js 发送:   { github_url, use_proxy }
protocol.py 接收: params.get('githubUrl'), params.get('useProxy')
```
**影响**: GitHub 扫描功能完全失效

#### 3. importSelectedSkills 接口
```
main.js 发送:   { temp_dir, selected_skills, location }
protocol.py 接收: params.get('tempDir'), params.get('selectedSkills')
```
**影响**: 技能导入功能完全失效

#### 4. deleteSkill 接口
```
main.js 发送:   { skill_name, location }
protocol.py 接收: params.get('skillName')
```
**影响**: 技能删除功能完全失效

---

### ⚠️ 次要问题：参数传递不完整

#### 5. switchConversation 接口
```
main.js 发送:   { conversation_id }
protocol.py 接收: params.get('workspace_id'), params.get('conversation_id')
```
**影响**: 可能导致工作空间上下文丢失

---

## 正常工作的接口

1. ✅ chat
2. ✅ createWorkspace
3. ✅ uploadSkill
4. ✅ deleteWorkspace
5. ✅ updateWorkspace
6. ✅ setWorkspaceSkills
7. ✅ createConversation
8. ✅ listConversations
9. ✅ deleteConversation
10. ✅ renameConversation

---

## 根本原因分析

**命名风格不一致**：
- `main.js` (Electron 主进程) 使用 `snake_case`（Python 风格）
- `protocol.py` (Python 后端) 部分使用 `camelCase`（JavaScript 风格）

**影响范围**：技能管理模块的 4 个核心功能完全失效

---

## 建议修复方案

**方案 1**: 修改 `protocol.py`，统一使用 `snake_case`
- 优点：与 Python 代码风格一致
- 缺点：需要修改后端代码

**方案 2**: 修改 `main.js`，统一使用 `camelCase`
- 优点：与 JavaScript 代码风格一致
- 缺点：需要修改前端代码

**推荐方案 1**：因为后端 Python 代码应该保持 Python 风格的命名约定。
