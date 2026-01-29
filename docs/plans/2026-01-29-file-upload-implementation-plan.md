# 文件上传功能实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标:** 在 Cowork 桌面应用的对话区域添加文件上传功能，支持用户上传文档、数据、图片和代码文件。

**架构:** 前端使用文件输入控件选择文件，以 base64 格式通过 IPC 传递给后端，后端将文件写入临时目录后传递给 Python Agent 处理。

**技术栈:** Electron IPC, HTML5 File API, CSS3, JavaScript (ES6+)

---

## Task 1: 添加附件按钮和隐藏的文件输入框

**Files:**
- Modify: `desktop/src/renderer/index.html:2029-2031`

**Step 1: 修改输入区域 HTML 结构**

找到 `<div id="input-area">` 元素，将其修改为：

```html
<div id="input-area">
  <!-- 附件区域 -->
  <div id="attachments-container" style="display: none;">
    <div id="attachments-list" class="attachments-list"></div>
  </div>

  <!-- 输入区域 -->
  <div class="input-wrapper">
    <input type="file" id="file-input" multiple accept=".pdf,.doc,.docx,.txt,.csv,.xlsx,.xls,.json,.png,.jpg,.jpeg,.gif,.webp,.py,.js,.ts,.java,.cpp,.c,.go,.rs" style="display: none;">
    <input type="text" id="message-input" placeholder="输入消息..." />
    <button id="attach-btn" title="上传文件">📎</button>
    <button id="send-btn">发送</button>
  </div>
</div>
```

**Step 2: 验证 HTML 结构正确**

打开 Cowork 应用，在开发者工具控制台运行：

```javascript
console.log(document.getElementById('file-input'));  // 应该显示 input 元素
console.log(document.getElementById('attach-btn'));  // 应该显示 button 元素
console.log(document.getElementById('attachments-container'));  // 应该显示 div 元素
```

预期输出：三个元素都存在

**Step 3: 提交更改**

```bash
cd /Volumes/work/workspace/deepagents/.worktrees/file-upload
git add desktop/src/renderer/index.html
git commit -m "feat: add attachment button and hidden file input

Add file input button and attachments container to the input area
for the upcoming file upload feature.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: 添加附件卡片和按钮的 CSS 样式

**Files:**
- Modify: `desktop/src/renderer/glassmorphism.css`

**Step 1: 在文件末尾添加附件相关样式**

打开 `desktop/src/renderer/glassmorphism.css`，在文件末尾添加：

```css
/* === 附件区域样式 === */

/* 附件容器 */
#attachments-container {
  margin-bottom: 8px;
  padding: 0 4px;
}

/* 附件列表 */
.attachments-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* 文件卡片 */
.file-card {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--glass-bg);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-1);
  font-size: 13px;
  color: var(--text-primary);
  transition: all var(--duration-fast) var(--ease-standard);
  animation: slideIn 0.2s var(--ease-bounce);
}

/* 文件卡片滑入动画 */
@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 文件卡片悬浮效果 */
.file-card:hover {
  background: var(--glass-bg-strong);
  box-shadow: var(--shadow-2);
}

/* 文件信息 */
.file-info {
  display: flex;
  align-items: center;
  gap: 6px;
}

.file-name {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  font-size: 11px;
  color: var(--text-secondary);
}

/* 删除按钮 */
.file-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--black-10);
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-secondary);
  transition: all var(--duration-fast) var(--ease-standard);
}

.file-remove:hover {
  background: var(--danger-color);
  color: white;
  transform: scale(1.1);
}

/* 输入区域包装器 */
.input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--glass-bg);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
}

/* 附件按钮 */
#attach-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: transform var(--duration-fast) var(--ease-standard);
}

#attach-btn:hover {
  transform: scale(1.1);
  background: var(--black-10);
}

/* 有附件时的输入框样式 */
.has-attachments #message-input {
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}
```

**Step 2: 验证样式加载**

在开发者工具控制台运行：

```javascript
// 检查样式是否应用
const btn = document.getElementById('attach-btn');
console.log(window.getComputedStyle(btn).width);  // 应该显示 "36px"
```

预期输出：`"36px"`

**Step 3: 提交更改**

```bash
git add desktop/src/renderer/glassmorphism.css
git commit -m "feat: add CSS styles for attachment cards and button

Add styles for:
- Attachment container and list layout
- File card with glassmorphism effect
- File icon, name, size display
- Remove button with hover effects
- Input wrapper with attachment button

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: 实现附件状态管理模块

**Files:**
- Create: `desktop/src/renderer/attachment-manager.js`

**Step 1: 创建附件管理器模块**

创建新文件 `desktop/src/renderer/attachment-manager.js`：

```javascript
/**
 * 附件管理器
 * 管理用户上传的文件附件
 */

// 文件限制配置
const FILE_LIMITS = {
  maxSize: 50 * 1024 * 1024,  // 50MB
  maxCount: 10,                // 最多 10 个文件
  allowedTypes: [
    // 文档
    '.pdf', '.doc', '.docx', '.txt', '.md',
    // 数据
    '.csv', '.xlsx', '.xls', '.json',
    // 图片
    '.png', '.jpg', '.jpeg', '.gif', '.webp',
    // 代码
    '.py', '.js', '.ts', '.java', '.cpp', '.c', '.go', '.rs'
  ]
};

// 文件图标映射
const FILE_ICONS = {
  '.pdf': '📄', '.doc': '📄', '.docx': '📄', '.txt': '📄', '.md': '📄',
  '.csv': '📊', '.xlsx': '📊', '.xls': '📊', '.json': '📊',
  '.png': '🖼️', '.jpg': '🖼️', '.jpeg': '🖼️', '.gif': '🖼️', '.webp': '🖼️',
  '.py': '💻', '.js': '💻', '.ts': '💻', '.java': '💻', '.cpp': '💻', '.c': '💻', '.go': '💻', '.rs': '💻'
};

/**
 * 附件状态管理类
 */
class AttachmentManager {
  constructor() {
    this.files = [];
  }

  /**
   * 添加多个文件
   * @param {FileList} fileList - 文件列表
   */
  addFiles(fileList) {
    Array.from(fileList).forEach(file => this.addFile(file));
  }

  /**
   * 添加单个文件
   * @param {File} file - 文件对象
   */
  addFile(file) {
    if (!this.validateFile(file)) {
      return;
    }

    this.files.push(file);
    this.render();
  }

  /**
   * 删除文件
   * @param {number} index - 文件索引
   */
  removeFile(index) {
    this.files.splice(index, 1);
    this.render();
  }

  /**
   * 验证文件
   * @param {File} file - 文件对象
   * @returns {boolean} - 是否通过验证
   */
  validateFile(file) {
    // 大小检查
    if (file.size > FILE_LIMITS.maxSize) {
      showToast(`文件 "${file.name}" 超过 50MB 限制`);
      return false;
    }

    // 类型检查
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!FILE_LIMITS.allowedTypes.includes(ext)) {
      showToast(`不支持的文件类型: ${ext}`);
      return false;
    }

    // 数量检查
    if (this.files.length >= FILE_LIMITS.maxCount) {
      showToast('最多只能上传 10 个文件');
      return false;
    }

    return true;
  }

  /**
   * 获取文件图标
   * @param {string} filename - 文件名
   * @returns {string} - 图标 emoji
   */
  getFileIcon(filename) {
    const ext = '.' + filename.split('.').pop().toLowerCase();
    return FILE_ICONS[ext] || '📁';
  }

  /**
   * 格式化文件大小
   * @param {number} bytes - 字节数
   * @returns {string} - 格式化后的大小
   */
  formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /**
   * 渲染附件列表
   */
  render() {
    const container = document.getElementById('attachments-container');
    const list = document.getElementById('attachments-list');

    if (!container || !list) {
      console.error('[AttachmentManager] Container elements not found');
      return;
    }

    if (this.files.length === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    list.innerHTML = this.files.map((file, index) => `
      <div class="file-card">
        <div class="file-info">
          <span>${this.getFileIcon(file.name)}</span>
          <span class="file-name" title="${file.name}">${file.name}</span>
          <span class="file-size">${this.formatSize(file.size)}</span>
        </div>
        <button class="file-remove" data-index="${index}">×</button>
      </div>
    `).join('');

    // 绑定删除事件
    list.querySelectorAll('.file-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.removeFile(index);
      });
    });
  }

  /**
   * 清空所有附件
   */
  clear() {
    this.files = [];
    this.render();
  }

  /**
   * 获取所有文件
   * @returns {File[]} - 文件数组
   */
  getFiles() {
    return this.files;
  }

  /**
   * 获取文件数量
   * @returns {number} - 文件数量
   */
  getCount() {
    return this.files.length;
  }

  /**
   * 检查是否有附件
   * @returns {boolean} - 是否有附件
   */
  hasAttachments() {
    return this.files.length > 0;
  }
}

/**
 * 显示 Toast 提示
 * @param {string} message - 提示消息
 * @param {string} type - 类型 (info/error)
 * @param {number} duration - 持续时间 (ms)
 */
function showToast(message, type = 'info', duration = 3000) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  // 样式
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '80px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '12px 24px',
    borderRadius: '14px',
    background: type === 'error' ? 'var(--danger-color)' : 'var(--text-primary)',
    color: type === 'error' ? 'white' : 'var(--bg-primary)',
    fontSize: '14px',
    fontWeight: '500',
    boxShadow: 'var(--shadow-3)',
    zIndex: '10000',
    opacity: '0',
    transition: 'opacity 0.15s ease-out'
  });

  document.body.appendChild(toast);

  // 动画
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 150);
  }, duration);
}

// 导出到全局
window.AttachmentManager = AttachmentManager;
window.attachmentManager = new AttachmentManager();
```

**Step 2: 在 HTML 中引入脚本**

修改 `desktop/src/renderer/index.html`，在脚本引入区域添加：

```html
<script src="attachment-manager.js"></script>
```

位置：在 `<script src="app.js"></script>` 之前

**Step 3: 验证模块加载**

在开发者工具控制台运行：

```javascript
console.log(window.attachmentManager);  // 应该显示 AttachmentManager 实例
console.log(window.attachmentManager.getCount());  // 应该显示 0
```

预期输出：
```
AttachmentManager { files: [], ... }
0
```

**Step 4: 提交更改**

```bash
git add desktop/src/renderer/attachment-manager.js desktop/src/renderer/index.html
git commit -m "feat: add attachment manager module

Implement AttachmentManager class for managing file uploads:
- File validation (size, type, count limits)
- File icon mapping by extension
- Attachment list rendering with card UI
- Toast notification for errors
- Clear, remove, and get file operations

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: 实现附件按钮点击事件

**Files:**
- Modify: `desktop/src/renderer/app.js`
- Test: 手动测试

**Step 1: 在 initializeApp 函数中添加附件按钮事件监听**

找到 `function initializeApp()` 函数，在其中添加附件按钮的初始化代码。在 `sendBtn.addEventListener` 之后添加：

```javascript
  // 附件按钮事件
  const attachBtn = document.getElementById('attach-btn');
  const fileInput = document.getElementById('file-input');

  if (attachBtn && fileInput) {
    // 点击附件按钮触发文件选择
    attachBtn.addEventListener('click', () => {
      fileInput.click();
    });

    // 文件选择变化事件
    fileInput.addEventListener('change', (e) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        window.attachmentManager.addFiles(files);
        // 清空 input，允许重复选择同一文件
        fileInput.value = '';
      }
    });
  } else {
    console.error('[init] Attach button or file input not found');
  }
```

**Step 2: 测试附件按钮功能**

1. 打开 Cowork 应用
2. 点击输入框右侧的 📎 按钮
3. 选择一个文件（如 PDF 或图片）
4. 验证：文件卡片应该显示在输入框上方

预期结果：文件卡片显示，包含文件图标、名称、大小和删除按钮

**Step 3: 测试删除功能**

点击文件卡片上的 × 按钮

预期结果：文件卡片被移除

**Step 4: 测试文件验证**

尝试上传：
1. 超过 50MB 的文件 → 应显示错误提示
2. 不支持的类型（如 .exe）→ 应显示错误提示
3. 选择 11 个文件 → 应显示"最多只能上传 10 个文件"

**Step 5: 提交更改**

```bash
git add desktop/src/renderer/app.js
git commit -m "feat: add attachment button event handlers

Implement file upload button functionality:
- Click attachment button to open file picker
- Add selected files to attachment manager
- Clear file input to allow re-selecting same files
- File validation with error toasts

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: 实现文件读取为 base64

**Files:**
- Modify: `desktop/src/renderer/app.js`

**Step 1: 添加文件读取辅助函数**

在 `app.js` 文件顶部添加文件读取函数：

```javascript
/**
 * 读取文件为 base64
 * @param {File} file - 文件对象
 * @returns {Promise<string>} - base64 编码的文件内容
 */
async function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // 移除 data URL 前缀 (如 "data:application/pdf;base64,")
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => {
      reject(new Error(`Failed to read file: ${file.name}`));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * 批量读取文件为 base64
 * @param {File[]} files - 文件数组
 * @returns {Promise<Object[]>} - 附件信息数组
 */
async function readFilesAsAttachments(files) {
  return await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      content: await readFileAsBase64(file)
    }))
  );
}
```

**Step 2: 测试文件读取功能**

在开发者工具控制台运行：

```javascript
// 创建一个测试文件
const testFile = new File(['test content'], 'test.txt', { type: 'text/plain' });

// 测试读取
readFileAsBase64(testFile).then(base64 => {
  console.log('Base64 length:', base64.length);
  console.log('Starts with:', base64.substring(0, 20));
}).catch(err => {
  console.error('Error:', err);
});
```

预期输出：
```
Base64 length: 24
Starts with: dGVzdCBjb250ZW50
```

**Step 3: 提交更改**

```bash
git add desktop/src/renderer/app.js
git commit -m "feat: add file to base64 conversion functions

Add helper functions for reading files:
- readFileAsBase64: Convert single file to base64
- readFilesAsAttachments: Convert multiple files to attachment objects

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: 修改发送逻辑支持附件

**Files:**
- Modify: `desktop/src/renderer/app.js`

**Step 1: 修改发送按钮事件处理**

找到发送按钮的事件监听器（`sendBtn.addEventListener`），修改发送逻辑以支持附件。

原代码类似：
```javascript
sendBtn.addEventListener('click', async () => {
  const message = input.value.trim();
  if (!message) return;

  // ... 发送逻辑
});
```

修改为：

```javascript
sendBtn.addEventListener('click', async () => {
  const message = input.value.trim();
  const hasAttachments = window.attachmentManager.hasAttachments();

  // 检查是否有内容
  if (!message && !hasAttachments) {
    showToast('请输入消息或选择文件');
    return;
  }

  // 禁用输入
  setInputState(true);

  try {
    let attachments = [];

    // 如果有附件，读取文件
    if (hasAttachments) {
      showToast('正在处理附件...', 'info', 2000);
      attachments = await readFilesAsAttachments(window.attachmentManager.getFiles());
    }

    // 发送消息
    const response = await window.deepagents.chat(
      message || '请分析上传的文件',
      true,
      currentWorkspaceId,
      currentConversationId,
      null,
      attachments  // 新增：附件参数
    );

    // 处理响应...

  } catch (error) {
    console.error('[Send] Error:', error);
    showToast('发送失败，请重试', 'error');
  } finally {
    setInputState(false);
    // 清空输入和附件
    input.value = '';
    window.attachmentManager.clear();
  }
});
```

**Step 2: 同样处理 Enter 键发送**

找到 `input.addEventListener('keydown', ...)` 或类似的 Enter 键处理代码，添加相同的附件处理逻辑。

**Step 3: 提交更改**

```bash
git add desktop/src/renderer/app.js
git commit -m "feat: integrate attachments into message sending

Modify send button and Enter key handlers to:
- Check for attachments before sending
- Read files as base64 before transmission
- Include attachments in chat API call
- Clear attachments after successful send
- Show toast for attachments processing

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: 扩展后端 IPC 接口支持附件

**Files:**
- Modify: `desktop/src/main/index.js`

**Step 1: 修改 ipcMain.handle('chat') 函数签名**

找到 `ipcMain.handle('chat', async ...)` 函数，修改其参数列表以接受 attachments 参数。

原代码：
```javascript
ipcMain.handle('chat', async (event, message, stream = false, workspaceId = null, conversationId = null, clientRequestId = null) => {
```

修改为：
```javascript
ipcMain.handle('chat', async (event, message, stream = false, workspaceId = null, conversationId = null, clientRequestId = null, attachments = []) => {
```

**Step 2: 在函数内添加附件处理逻辑**

在 `params` 对象构建之后，添加附件处理代码：

```javascript
  console.log('[chat] Called with:', {
    message,
    attachmentsCount: attachments?.length || 0
  });

  // ... 现有的 promise 和 timeout 代码 ...

  const params = {
    request_id: requestId,
    method: 'chat',
    params: {
      message,
      workspace_id: String(workspaceId || ''),
      conversation_id: String(conversationId || ''),
      stream
    }
  };

  // 处理附件
  if (attachments && attachments.length > 0) {
    const tempDir = path.join(os.tmpdir(), 'cowork-uploads', requestId);
    fs.mkdirSync(tempDir, { recursive: true });

    console.log('[chat] Processing', attachments.length, 'attachments, temp dir:', tempDir);

    params.params.attachments = await Promise.all(attachments.map(async (att, idx) => {
      try {
        const filePath = path.join(tempDir, att.name);
        const buffer = Buffer.from(att.content, 'base64');
        fs.writeFileSync(filePath, buffer);

        console.log(`[chat] Wrote attachment ${idx + 1}:`, att.name, '→', filePath);

        return {
          name: att.name,
          type: att.type,
          path: filePath,
          size: att.size
        };
      } catch (err) {
        console.error(`[chat] Failed to write attachment ${att.name}:`, err);
        return {
          name: att.name,
          type: att.type,
          path: null,
          error: err.message
        };
      }
    }));
  }

  await sendToSocket(params);
  return promise;
```

**Step 3: 添加清理临时文件的逻辑**

在 promise 的 resolve/reject 处理中添加临时文件清理：

```javascript
  const promise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      // 清理临时文件
      cleanupTempDir(requestId);
      pendingRequests.delete(requestId);
      reject(new Error('Request timeout'));
    }, 120000);

    pendingRequests.set(requestId, {
      resolve: (data) => {
        cleanupTempDir(requestId);
        clearTimeout(timeout);
        resolve(data);
      },
      reject: (error) => {
        cleanupTempDir(requestId);
        clearTimeout(timeout);
        reject(error);
      },
      timeout
    });
  });

  // 添加清理函数
  function cleanupTempDir(requestId) {
    const tempDir = path.join(os.tmpdir(), 'cowork-uploads', requestId);
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.log('[chat] Cleaned temp dir:', tempDir);
      }
    } catch (err) {
      console.error('[chat] Failed to cleanup temp dir:', err);
    }
  }
```

**Step 4: 提交更改**

```bash
cd /Volumes/work/workspace/deepagents/.worktrees/file-upload
git add desktop/src/main/index.js
git commit -m "feat: add attachments support to IPC chat interface

Extend chat IPC handler to support file attachments:
- Add attachments parameter to function signature
- Create temp directory for each request
- Decode base64 and write files to temp dir
- Pass file paths to Python Agent
- Cleanup temp files after request completes

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8: 在 preload 中暴露附件参数

**Files:**
- Modify: `desktop/src/preload/index.js`

**Step 1: 更新 chat 函数参数**

找到 `contextBridge.exposeInMainWorld('deepagents', {` 中的 `chat` 函数，修改其参数：

原代码：
```javascript
  chat: (message, stream = false, workspaceId = null, conversationId = null, requestId = null) =>
    ipcRenderer.invoke('chat', message, stream, workspaceId, conversationId, requestId),
```

修改为：
```javascript
  chat: (message, stream = false, workspaceId = null, conversationId = null, requestId = null, attachments = null) =>
    ipcRenderer.invoke('chat', message, stream, workspaceId, conversationId, requestId, attachments),
```

**Step 2: 提交更改**

```bash
git add desktop/src/preload/index.js
git commit -m "feat: expose attachments parameter in preload

Update chat function signature to include attachments parameter
for IPC communication between renderer and main process.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 9: 添加深色主题支持

**Files:**
- Modify: `desktop/src/renderer/glassmorphism.css`

**Step 1: 添加深色主题样式覆盖**

在 `.theme-dark` 部分添加附件相关样式：

```css
/* === 深色主题：附件样式 === */

.theme-dark .file-card {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  color: var(--text-primary);
}

.theme-dark .file-card:hover {
  background: var(--glass-bg-strong);
}

.theme-dark .file-size {
  color: var(--text-secondary);
}

.theme-dark .file-remove {
  background: var(--white-10);
  color: var(--text-secondary);
}

.theme-dark .file-remove:hover {
  background: var(--danger-color);
  color: white;
}

.theme-dark #attach-btn:hover {
  background: var(--white-10);
}

.theme-dark .input-wrapper {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
}
```

**Step 2: 测试深色主题**

1. 切换到深色主题
2. 上传文件
3. 验证：文件卡片应该正确显示

**Step 3: 提交更改**

```bash
git add desktop/src/renderer/glassmorphism.css
git commit -m "feat: add dark theme support for attachments

Add theme-dark overrides for attachment UI elements:
- File card background and border
- Remove button hover states
- Attachment button styles
- Input wrapper styles

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 10: 端到端测试

**Files:**
- Manual testing

**Step 1: 测试基本文件上传**

1. 打开 Cowork 应用
2. 点击 📎 按钮
3. 选择一个 PDF 文件
4. 验证：文件卡片显示
5. 输入消息："请分析这个文档"
6. 点击发送
7. 验证：消息发送成功，AI 开始处理

**Step 2: 测试多文件上传**

1. 点击 📎 按钮
2. 选择多个文件（按 Cmd/Ctrl 多选）
3. 验证：所有文件都显示为卡片
4. 发送消息
5. 验证：所有文件都被处理

**Step 3: 测试文件验证**

1. 尝试上传超过 50MB 的文件
2. 验证：显示错误提示

3. 尝试上传不支持的类型（如 .zip）
4. 验证：显示错误提示

**Step 4: 测试删除功能**

1. 上传多个文件
2. 逐个删除文件
3. 验证：文件被正确移除

**Step 5: 测试深色主题**

1. 切换到深色主题
2. 上传文件
3. 验证：样式正确显示

**Step 6: 测试空附件发送**

1. 只输入文字，不上传文件
2. 点击发送
3. 验证：正常发送

**Step 7: 测试只有附件没有文字**

1. 只上传文件，不输入文字
2. 点击发送
3. 验证：正常发送，默认消息为"请分析上传的文件"

**Step 8: 创建测试报告**

```bash
cat > /tmp/file-upload-test-report.md << 'EOF'
# 文件上传功能测试报告

## 测试环境
- Cowork Desktop App
- macOS 14.5
- 测试日期: 2026-01-29

## 测试结果

### 测试项 1: 基本 PDF 上传
- [ ] 文件卡片正确显示
- [ ] 文件大小格式化正确
- [ ] 文件图标正确
- [ ] 发送成功

### 测试项 2: 多文件上传
- [ ] 多个文件都显示
- [ ] 删除功能正常
- [ ] 发送成功

### 测试项 3: 文件验证
- [ ] 超大文件被拒绝
- [ ] 不支持类型被拒绝
- [ ] 超过数量限制被拒绝

### 测试项 4: 深色主题
- [ ] 样式正确显示

### 测试项 5: 边界情况
- [ ] 只有文字发送正常
- [ ] 只有附件发送正常
- [ ] 删除所有附件后容器隐藏
EOF
```

**Step 9: 提交测试完成标记**

如果所有测试通过：

```bash
git commit --allow-empty -m "test: complete file upload feature testing

Manual testing completed:
- Basic PDF upload: PASS
- Multi-file upload: PASS
- File validation: PASS
- Dark theme: PASS
- Edge cases: PASS

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 完成检查清单

在提交 PR 或合并到主分支前，确认以下所有项完成：

- [ ] HTML 结构已添加（附件按钮、文件输入、附件容器）
- [ ] CSS 样式已添加（文件卡片、按钮、深色主题支持）
- [ ] AttachmentManager 模块已创建并正常工作
- [ ] 附件按钮点击事件已绑定
- [ ] 文件读取为 base64 功能已实现
- [ ] 发送逻辑已集成附件支持
- [ ] 后端 IPC 接口已扩展支持附件
- [ ] 临时文件处理已实现
- [ ] 临时文件清理已实现
- [ ] preload 层已暴露附件参数
- [ ] 深色主题样式已添加
- [ ] 所有场景已手动测试通过

---

## 合并到主分支

测试完成后，执行以下命令合并到主分支：

```bash
# 切换到主分支
git checkout desktop-macos

# 合并 feature 分支
git merge feature/file-upload

# 推送远程
git push origin desktop-macos

# 删除 worktree（可选）
git worktree remove .worktrees/file-upload
git branch -d feature/file-upload
```
