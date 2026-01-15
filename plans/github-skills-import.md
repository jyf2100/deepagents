# Task Plan: 从 GitHub 获取技能并存储到 .deepagents/skills/

## 目标
添加功能，支持从 GitHub 仓库获取 skills 目录下的技能，存储到 `.deepagents/skills/` 目录下。

## 当前阶段
**Phase 2: 设计 - complete**

## 阶段划分

### Phase 1: 问题诊断与需求分析
- [x] 理解用户需求
- [x] 探索现有技能管理系统
- [x] 分析 GitHub 集成方案
- [x] 确定文件存储结构
- **状态:** complete

### Phase 2: 设计
- [x] 设计 Git Clone 流程
- [x] 设计技能下载和存储逻辑
- [x] 设计 UI 界面（输入 GitHub URL）
- [x] 设计代理支持
- [x] 定义错误处理机制
- **状态:** complete

### Phase 3: 实现
- [ ] 实现 Python 后端 Git Clone 逻辑
- [ ] 实现 IPC 通信层
- [ ] 实现前端 UI 组件
- [ ] 实现代理配置
- **状态:** pending

### Phase 4: 测试
- [ ] 测试 GitHub 仓库克隆
- [ ] 测试技能扫描和复制
- [ ] 测试代理功能
- [ ] 测试错误处理
- **状态:** pending

---

## 用户需求确认

### 功能需求
1. **获取方式**：使用 `git clone` 命令克隆仓库
2. **目录识别**：自动扫描仓库，找到包含 `SKILL.md` 的目录作为技能
3. **仓库类型**：仅支持公开仓库（无需认证）
4. **代理支持**：`git clone` 需要支持系统代理

### 技术决策
| 决策 | 理由 |
|------|------|
| 使用 git clone 而非 GitHub API | 简单可靠，一次性获取所有文件，无需处理 API 分页 |
| 自动扫描 SKILL.md | 灵活，支持任意目录结构 |
| 仅支持公开仓库 | 无需处理认证，简化实现 |
| Git 代理配置 | 使用 `git -c http.proxy=...` 临时配置代理 |

---

## 实现方案设计

### 整体架构流程

```
用户输入 GitHub URL
    ↓
前端验证 URL 格式
    ↓
IPC → Python 后端
    ↓
创建临时目录 (tempfile.mkdtemp)
    ↓
配置 git 代理（如果启用）
    ↓
git clone --depth 1 --single-branch
    ↓
递归扫描目录，查找所有包含 SKILL.md 的子目录
    ↓
复制技能目录到目标位置
    ↓
清理临时目录 (shutil.rmtree)
    ↓
返回安装结果
```

### Python 后端实现

#### 新增函数：`_handle_clone_from_github()`

**文件**：`libs/deepagents-cli/deepagents_cli/desktop/protocol.py`

**位置**：在 `_handle_upload_skill` 函数之后添加（约第523行）

```python
async def _handle_clone_from_github(
    self,
    request_id: str,
    params: dict
) -> dict:
    """
    从 GitHub 仓库克隆技能

    Args:
        params: {
            'github_url': str,      # GitHub 仓库 URL
            'location': str,        # 'project' | 'user'
            'use_proxy': bool       # 是否使用代理
        }

    Returns:
        {
            'request_id': str,
            'status': 'success',
            'data': {
                'skills_installed': ['skill1', 'skill2'],
                'skills_count': 2,
                'target_path': '/path/to/skills/'
            }
        }
    """
```

**实现要点**：

1. **URL 验证**
```python
github_url = params.get('github_url', '').strip()
if not github_url.startswith('https://github.com/'):
    return {
        'request_id': request_id,
        'status': 'error',
        'error': 'INVALID_URL',
        'message': '无效的 GitHub URL'
    }
```

2. **临时目录**
```python
import tempfile
temp_dir = tempfile.mkdtemp(prefix='deepagents-github-')
try:
    # ... 克隆和复制操作
finally:
    # 清理临时目录
    shutil.rmtree(temp_dir, ignore_errors=True)
```

3. **代理配置**
```python
import os
import subprocess

use_proxy = params.get('use_proxy', False)
http_proxy = os.environ.get('HTTP_PROXY') or os.environ.get('HTTPS_PROXY')

if use_proxy and http_proxy:
    # 临时配置代理
    git_cmd = [
        'git', '-c',
        f'http.proxy={http_proxy}',
        'clone', '--depth', '1',
        '--single-branch',
        '--quiet',
        github_url, temp_dir
    ]
else:
    git_cmd = [
        'git', 'clone', '--depth', '1',
        '--single-branch',
        '--quiet',
        github_url, temp_dir
    ]

# 执行克隆（超时60秒）
result = subprocess.run(
    git_cmd,
    capture_output=True,
    text=True,
    timeout=60
)
```

4. **技能扫描**
```python
def _find_skills_in_directory(root_dir: Path) -> list[Path]:
    """递归扫描目录，找到所有包含 SKILL.md 的子目录"""
    skills = []
    for root, dirs, files in os.walk(root_dir):
        if 'SKILL.md' in files:
            skills.append(Path(root))
    return skills

skills = _find_skills_in_directory(Path(temp_dir))
```

5. **复制到目标位置**
```python
location = params.get('location', 'project')
if location == 'user':
    target_base = Path.home() / '.deepagents' / 'skills'
else:
    project_root = self._find_project_root()
    if not project_root:
        return {'error': 'PROJECT_ROOT_NOT_FOUND'}
    target_base = project_root / '.deepagents' / 'skills'

target_base.mkdir(parents=True, exist_ok=True)

installed_skills = []
for skill_dir in skills:
    skill_name = skill_dir.name
    target_dir = target_base / skill_name

    # 处理已存在的技能
    if target_dir.exists():
        # 询问用户或跳过
        continue

    # 复制整个目录
    shutil.copytree(skill_dir, target_dir)
    installed_skills.append(skill_name)
```

### IPC 通信设计

**Electron Main Process** (`desktop/src/main/index.js`)

在现有 IPC handlers 之后添加（约第298行）：

```javascript
// 从 GitHub 克隆技能
ipcMain.handle('cloneSkillFromGithub', async (event, params) => {
  const requestId = randomUUID();

  const responsePromise = new Promise((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject });
  });

  await sendToSocket({
    request_id: requestId,
    method: 'clone_from_github',
    params: params
  });

  return responsePromise;
});
```

**Electron Preload** (`desktop/src/preload/index.js`)

暴露 API 给渲染进程：

```javascript
cloneSkillFromGithub: (url, location, useProxy) =>
  ipcRenderer.invoke('cloneSkillFromGithub', {
    github_url: url,
    location: location,
    use_proxy: useProxy
  })
```

### 前端 UI 设计

**选项**：在技能列表顶部添加"从 GitHub 导入"按钮

**HTML** (`desktop/src/renderer/index.html`)

```html
<!-- 在技能列表上方添加 -->
<div style="padding: 8px 8px 0 8px; display: flex; gap: 8px;">
  <button id="add-skill-btn">+ 添加技能</button>
  <button id="github-import-btn">从 GitHub 导入</button>
</div>
```

**对话框**

```html
<!-- GitHub 导入对话框 -->
<div id="github-import-dialog" style="display: none; ...">
  <h3>从 GitHub 导入技能</h3>

  <div>
    <label>GitHub 仓库 URL</label>
    <input type="text" id="github-url-input"
           placeholder="https://github.com/user/repo" />
  </div>

  <div>
    <label>存储位置</label>
    <label><input type="radio" name="github-skill-location"
           value="project" checked> 项目</label>
    <label><input type="radio" name="github-skill-location"
           value="user"> 用户</label>
  </div>

  <div>
    <label>
      <input type="checkbox" id="use-proxy-checkbox">
      使用代理 (HTTP_PROXY / HTTPS_PROXY)
    </label>
  </div>

  <div id="github-import-status" style="display: none;">
    <span id="github-import-message"></span>
  </div>

  <div style="display: flex; gap: 8px; justify-content: flex-end;">
    <button id="cancel-github-import">取消</button>
    <button id="confirm-github-import">导入</button>
  </div>
</div>
```

**JavaScript** (`desktop/src/renderer/app.js`)

```javascript
// GitHub 导入按钮
const githubImportBtn = document.getElementById('github-import-btn');
const githubImportDialog = document.getElementById('github-import-dialog');
const githubUrlInput = document.getElementById('github-url-input');
const useProxyCheckbox = document.getElementById('use-proxy-checkbox');
const confirmGithubImport = document.getElementById('confirm-github-import');
const cancelGithubImport = document.getElementById('cancel-github-import');

// 打开对话框
githubImportBtn.addEventListener('click', () => {
  githubImportDialog.style.display = 'flex';
  githubUrlInput.value = '';
  githubUrlInput.focus();
});

// 取消
cancelGithubImport.addEventListener('click', () => {
  githubImportDialog.style.display = 'none';
});

// 确认导入
confirmGithubImport.addEventListener('click', async () => {
  const url = githubUrlInput.value.trim();
  const location = document.querySelector(
    'input[name="github-skill-location"]:checked'
  ).value;
  const useProxy = useProxyCheckbox.checked;

  // 验证 URL
  if (!url.startsWith('https://github.com/')) {
    alert('请输入有效的 GitHub URL');
    return;
  }

  // 禁用按钮，显示状态
  confirmGithubImport.disabled = true;
  confirmGithubImport.textContent = '克隆中...';

  try {
    const result = await window.deepagents.cloneSkillFromGithub(
      url, location, useProxy
    );

    if (result.status === 'success') {
      alert(`成功导入 ${result.data.skills_count} 个技能`);
      githubImportDialog.style.display = 'none';
      loadSkills(); // 刷新技能列表
    } else {
      alert(`导入失败: ${result.message}`);
    }
  } catch (error) {
    alert(`导入失败: ${error.message}`);
  } finally {
    confirmGithubImport.disabled = false;
    confirmGithubImport.textContent = '导入';
  }
});
```

### 错误处理

| 错误类型 | 错误码 | 用户提示 |
|---------|-------|---------|
| 无效的 GitHub URL | `INVALID_URL` | 请输入有效的 GitHub 仓库 URL |
| 仓库不存在 | `REPO_NOT_FOUND` | 无法找到指定的仓库，请检查 URL |
| 网络/代理问题 | `NETWORK_ERROR` | 网络连接失败，请检查网络或代理设置 |
| 没有找到技能 | `NO_SKILLS_FOUND` | 仓库中没有找到包含 SKILL.md 的技能目录 |
| 权限问题 | `PERMISSION_DENIED` | 无法写入目标目录，请检查权限 |
| Git 命令失败 | `GIT_ERROR` | Git 操作失败，请确保已安装 Git |

### 关键文件清单

| 文件 | 修改内容 | 优先级 |
|------|---------|-------|
| `libs/deepagents-cli/.../protocol.py` | 添加 `_handle_clone_from_github()` | 高 |
| `libs/deepagents-cli/.../protocol.py` | 更新 `METHOD_HANDLERS` 字典 | 高 |
| `desktop/src/main/index.js` | 添加 `cloneSkillFromGithub` IPC handler | 高 |
| `desktop/src/preload/index.js` | 暴露 `cloneSkillFromGithub` 方法 | 高 |
| `desktop/src/renderer/app.js` | 添加 GitHub 导入逻辑 | 高 |
| `desktop/src/renderer/index.html` | 添加 GitHub 导入按钮和对话框 | 高 |

### 安全考虑

1. **URL 验证**：只允许 `https://github.com/*` 格式
2. **路径安全**：使用 `Path` 对象防止路径遍历攻击
3. **临时文件**：使用 `tempfile` 创建临时目录，try-finally 确保清理
4. **超时控制**：git 操作设置 60 秒超时
5. **浅克隆**：使用 `--depth 1` 减少数据传输
6. **代码隔离**：不执行克隆仓库中的任何代码
7. **代理安全**：只从环境变量读取代理配置，不暴露在 UI 中

---

## 测试计划

### 单元测试
1. **URL 验证测试**：测试各种 GitHub URL 格式
2. **技能扫描测试**：测试不同目录结构的技能识别
3. **代理配置测试**：验证代理配置正确传递给 git

### 集成测试
1. **公开仓库克隆**：测试从真实的 GitHub 仓库克隆
2. **技能复制测试**：验证技能正确复制到目标位置
3. **临时目录清理**：确认临时目录被正确清理
4. **错误处理测试**：模拟各种错误场景

### 端到端测试
1. 打开桌面应用
2. 点击"从 GitHub 导入"按钮
3. 输入测试仓库 URL
4. 选择存储位置
5. 勾选"使用代理"（如需要）
6. 点击"导入"
7. 验证技能出现在列表中

---

## 备注
- 更新阶段状态: pending → in_progress → complete
- 在做重大决定前重新阅读此计划
- 记录所有错误 - 它们帮助避免重复
