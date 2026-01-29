# 文件上传功能设计文档

> **创建日期**: 2026-01-29
> **状态**: 设计完成，待实施
> **优先级**: 高

---

## 目标

在 Cowork 桌面应用的对话区域添加文件上传功能，支持用户上传文档、数据、图片和代码文件，让 AI 可以分析和处理这些文件。

---

## 功能需求

### 支持的场景
- **文献分析**：上传 PDF/Word 文档，让 AI 分析内容
- **数据处理**：上传 CSV/Excel 文件，让 AI 处理数据
- **图片识别**：上传图片，让 AI 识别或分析
- **代码审查**：上传代码文件，让 AI 审查或解释

### 核心功能
1. 点击附件按钮选择文件（支持多选）
2. 文件以卡片样式展示在输入框上方
3. 支持删除已选择的文件
4. 文件可以附带文字说明一起发送
5. 支持 PDF、Office、图片、代码等多种格式

---

## 技术规格

### 文件限制

| 限制项 | 值 |
|--------|-----|
| 单文件最大 | 50 MB |
| 最多文件数 | 10 个 |
| 支持类型 | .pdf, .doc, .docx, .txt, .csv, .xlsx, .xls, .json, .png, .jpg, .jpeg, .gif, .webp, .py, .js, .ts, .java, .cpp, .c, .go, .rs |

### 文件图标映射

| 类型 | 图标 | 扩展名 |
|------|------|--------|
| 📄 | 文档 | .pdf, .doc, .docx, .txt |
| 📊 | 数据 | .csv, .xlsx, .xls, .json |
| 🖼️ | 图片 | .png, .jpg, .jpeg, .gif, .webp |
| 💻 | 代码 | .py, .js, .ts, .java, .cpp, .c, .go, .rs |
| 📁 | 其他 | 其他文件 |

---

## UI 设计

### 布局结构

```
┌─────────────────────────────────────────────────┐
│  输入区域                                         │
├─────────────────────────────────────────────────┤
│  📄 document.pdf (2.3 MB)  ×                    │
│  📊 data.xlsx (156 KB)    ×                     │
├─────────────────────────────────────────────────┤
│  [输入框：请添加说明文字...]              [📎][发送]│
└─────────────────────────────────────────────────┘
```

### HTML 结构

```html
<div id="input-area">
  <!-- 附件区域 -->
  <div id="attachments-container" style="display: none;">
    <div id="attachments-list" class="attachments-list"></div>
  </div>

  <!-- 输入区域 -->
  <div class="input-wrapper">
    <input type="file" id="file-input" multiple accept="..." style="display: none;">
    <input type="text" id="message-input" placeholder="输入消息..." />
    <button id="attach-btn" title="上传文件">📎</button>
    <button id="send-btn">发送</button>
  </div>
</div>
```

### CSS 样式

```css
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

@keyframes slideIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
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
```

---

## 数据流

### 前端 → 后端消息格式

```javascript
{
  message: "请分析这个文档",
  workspace_id: "xxx",
  conversation_id: "xxx",
  attachments: [
    {
      name: "document.pdf",
      type: "application/pdf",
      size: 2345678,
      content: "base64_encoded_content..."
    }
  ]
}
```

### 处理流程

```
用户选择文件
    ↓
前端验证（大小、类型、数量）
    ↓
显示文件卡片
    ↓
用户输入文字，点击发送
    ↓
读取文件为 base64
    ↓
发送到后端 IPC
    ↓
后端写入临时文件
    ↓
传递给 Python Agent
    ↓
Agent 根据文件类型使用技能处理
    ↓
清理临时文件
```

---

## 组件实现

### JavaScript 状态管理

```javascript
const attachmentState = {
  files: [],

  addFiles(fileList) {
    Array.from(fileList).forEach(file => this.addFile(file));
  },

  addFile(file) {
    if (!this.validateFile(file)) return;
    this.files.push(file);
    this.render();
  },

  removeFile(index) {
    this.files.splice(index, 1);
    this.render();
  },

  validateFile(file) {
    // 大小检查
    if (file.size > 50 * 1024 * 1024) {
      showToast(`文件 "${file.name}" 超过 50MB 限制`);
      return false;
    }

    // 类型检查
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    const allowedTypes = ['.pdf', '.doc', '.docx', '.txt', '.csv', '.xlsx', '.xls',
                          '.json', '.png', '.jpg', '.jpeg', '.gif', '.webp',
                          '.py', '.js', '.ts', '.java', '.cpp', '.c', '.go', '.rs'];
    if (!allowedTypes.includes(ext)) {
      showToast(`不支持的文件类型: ${ext}`);
      return false;
    }

    // 数量检查
    if (this.files.length >= 10) {
      showToast('最多只能上传 10 个文件');
      return false;
    }

    return true;
  },

  render() {
    const container = document.getElementById('attachments-container');
    const list = document.getElementById('attachments-list');

    if (this.files.length === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    list.innerHTML = this.files.map((file, index) => `
      <div class="file-card">
        <span>${this.getFileIcon(file.name)}</span>
        <span class="file-name" title="${file.name}">${file.name}</span>
        <span class="file-size">${this.formatSize(file.size)}</span>
        <button class="file-remove" data-index="${index}">×</button>
      </div>
    `).join('');
  },

  clear() {
    this.files = [];
    this.render();
  }
};
```

---

## 后端集成

### IPC 接口扩展

```javascript
// desktop/src/main/index.js

ipcMain.handle('chat', async (event, message, stream, workspaceId, conversationId, clientRequestId, attachments = []) => {
  const requestId = clientRequestId || randomUUID();

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

    params.params.attachments = await Promise.all(attachments.map(async (att) => {
      const filePath = path.join(tempDir, att.name);
      fs.writeFileSync(filePath, Buffer.from(att.content, 'base64'));
      return { name: att.name, type: att.type, path: filePath };
    }));
  }

  await sendToSocket(params);
  return promise;
});
```

---

## 错误处理

| 场景 | 处理方式 |
|------|----------|
| 文件过大 | 前端拦截 + Toast 提示 |
| 类型不支持 | 前端拦截 + Toast 提示 |
| 数量超限 | 前端拦截 + Toast 提示 |
| 网络中断 | 重试机制 |
| 后端处理失败 | 显示错误，保留附件 |
| 文件读取失败 | 提示"无法读取文件" |

---

## 实施计划

### Phase 1: 前端 UI
- [ ] 添加附件按钮到输入区域
- [ ] 实现文件选择对话框
- [ ] 实现文件卡片展示
- [ ] 实现删除功能

### Phase 2: 文件处理
- [ ] 实现文件验证逻辑
- [ ] 实现 base64 编码
- [ ] 实现发送逻辑

### Phase 3: 后端集成
- [ ] 扩展 IPC 接口支持 attachments
- [ ] 实现临时文件处理
- [ ] 集成到 Python Agent

### Phase 4: 测试
- [ ] 单元测试
- [ ] 集成测试
- [ ] 用户测试

---

## 参考文件

- `desktop/src/renderer/index.html` - HTML 结构
- `desktop/src/renderer/app.js` - 前端逻辑
- `desktop/src/main/index.js` - IPC 接口
- `desktop/src/renderer/glassmorphism.css` - 样式变量
