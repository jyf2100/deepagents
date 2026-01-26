// DOM 元素引用 - 在 initializeApp 中初始化
let messagesDiv, input, sendBtn, historyList, skillsList;

let isProcessing = false;
let conversations = [];
let currentConversationId = null;
let skills = [];

// 工作空间设置中的技能过滤状态
let workspaceSkillFilter = 'enabled'; // 'enabled' | 'disabled'

// === 全局函数：添加技能对话框 ===
// 在页面加载时就定义，确保 onclick 可以使用
window.showAddSkillDialogGlobal = function() {
  console.log('[showAddSkillDialogGlobal] Called');
  const dialog = document.getElementById('add-skill-dialog');
  if (dialog) {
    dialog.style.display = 'flex';
    const skillPathInput = document.getElementById('skill-path-input');
    const skillPreview = document.getElementById('skill-preview');
    const uploadBtn = document.getElementById('upload-skill-btn');
    if (skillPathInput) skillPathInput.value = '';
    if (skillPreview) skillPreview.style.display = 'none';
    if (uploadBtn) uploadBtn.disabled = true;
  } else {
    console.error('[showAddSkillDialogGlobal] Dialog not found');
  }
};

// === 标签页切换 ===
function setupTabs() {
  const tabs = document.querySelectorAll('.tab');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;

      // 更新标签状态
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // 获取面板元素
      const historyView = document.getElementById('history-view');
      const skillsPanelContent = document.getElementById('skills-panel-content');
      const skillsListPanel = document.getElementById('skills-list-panel');
      const webviewPanel = document.getElementById('skillslm-webview-panel');

      console.log('[Tabs] Clicked tab:', tabName);
      console.log('[Tabs] skillsPanelContent:', skillsPanelContent);
      console.log('[Tabs] skillsListPanel:', skillsListPanel);
      console.log('[Tabs] webviewPanel:', webviewPanel);

      if (tabName === 'history') {
        // 显示历史视图，隐藏技能面板 - 通过 CSS 类控制
        document.getElementById('side-panel').classList.remove('skills-active');
      } else if (tabName === 'skills') {
        // 显示技能面板（包含 webview）- 通过 CSS 类控制
        document.getElementById('side-panel').classList.add('skills-active');

        // webview 加载监听
        const webview = document.getElementById('skillslm-webview');
        if (webview) {
          console.log('[Tabs] webview element found');
          webview.addEventListener('dom-ready', () => {
            console.log('[Webview] DOM ready');
          });
          webview.addEventListener('did-start-loading', () => {
            console.log('[Webview] Started loading');
          });
          webview.addEventListener('did-finish-load', () => {
            console.log('[Webview] Finished loading');
          });
          webview.addEventListener('did-fail-load', (event) => {
            console.error('[Webview] Failed to load:', event);
          });
        } else {
          console.error('[Tabs] webview element NOT found!');
        }

        // 加载技能列表
        loadSkills();
      }
    });
  });

  // 初始化：确保历史视图默认显示（移除直接 style 设置，让 CSS 控制）
  const historyView = document.getElementById('history-view');
  const skillsPanelContent = document.getElementById('skills-panel-content');
  const webviewPanel = document.getElementById('skillslm-webview-panel');

  console.log('[Tabs Init] Elements:', {
    historyView: !!historyView,
    skillsPanelContent: !!skillsPanelContent,
    webviewPanel: !!webviewPanel
  });

  // 不需要手动设置 display，CSS 已经通过 #side-panel 的类来控制
  // 默认情况下没有 skills-active 类，所以显示历史视图
}

// === 技能管理 ===
async function loadSkills() {
  skillsList.innerHTML = '<div class="loading">加载技能中...</div>';

  try {
    // 获取技能列表
    const result = await window.deepagents.listSkills();
    // Python 返回: {status: 'success', data: {skills: [...]}}
    // handleSocketMessage 返回 data 部分，即 {skills: [...]}
    skills = result.data?.skills || result.skills || [];

    if (skills.length === 0) {
      skillsList.innerHTML = `
        <div class="empty-state">
          <div>暂无可用技能</div>
          <div style="margin-top: 12px; font-size: 11px; color: #6b7280;">
            将技能文件放在 ~/.deepagents/desktop/skills/ 目录
          </div>
        </div>
      `;
      return;
    }

    renderSkills();
  } catch (error) {
    console.error('Failed to load skills:', error);
    skillsList.innerHTML = `<div class="empty-state">加载失败: ${error.message}</div>`;
  }
}

function renderSkills() {
  skillsList.innerHTML = '';

  if (skills.length === 0) {
    skillsList.innerHTML = '<div class="empty-state">暂无可用技能</div>';
    return;
  }

  skills.forEach(skill => {
    const item = document.createElement('div');
    item.className = 'skill-item';

    const sourceLabel = skill.source === 'user' ? '用户' : '项目';
    const sourceClass = skill.source;

    item.innerHTML = `
      <div class="skill-header">
        <span class="skill-name">${escapeHtml(skill.name)}</span>
        <span class="skill-source ${sourceClass}">${sourceLabel}</span>
      </div>
      <div class="skill-description">${escapeHtml(skill.description)}</div>
      <div class="skill-footer">
        <button class="delete-skill-btn" data-skill="${skill.name}" data-dir-name="${skill.dir_name}" data-source="${skill.source}">
          🗑️ 删除
        </button>
      </div>
    `;

    // 绑定删除按钮事件
    const deleteBtn = item.querySelector('.delete-skill-btn');
    deleteBtn.addEventListener('click', () => {
      deleteSkill(skill.dir_name, skill.source);
    });

    skillsList.appendChild(item);
  });
}

async function deleteSkill(skillName, source = 'auto') {
  // 确认对话框
  const confirmed = confirm(`确定要删除技能 "${skillName}" 吗？\n\n此操作无法撤销。`);
  if (!confirmed) {
    return;
  }

  try {
    // 禁用按钮，显示加载状态
    const btn = document.querySelector(`.delete-skill-btn[data-skill="${skillName}"]`);
    if (btn) {
      btn.disabled = true;
      btn.textContent = '删除中...';
    }

    // 调用删除 API
    await window.deepagents.deleteSkill(skillName, source);

    // 刷新技能列表
    await loadSkills();

  } catch (error) {
    console.error('Failed to delete skill:', error);
    alert(`删除失败: ${error.message}`);

    // 恢复按钮状态
    const btn = document.querySelector(`.delete-skill-btn[data-skill="${skillName}"]`);
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🗑️ 删除';
    }
  }
}

// === 对话历史 ===
function loadConversations() {
  const saved = localStorage.getItem('deepagents-conversations');
  if (saved) {
    try {
      conversations = JSON.parse(saved);
    } catch (e) {
      conversations = [];
    }
  }
  renderHistory();
}

function saveConversations() {
  localStorage.setItem('deepagents-conversations', JSON.stringify(conversations));
}

function createConversation() {
  const id = Date.now().toString();
  const conversation = {
    id,
    title: '新对话',
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  conversations.unshift(conversation);
  currentConversationId = id;
  saveConversations();
  renderHistory();
  return conversation;
}

function getCurrentConversation() {
  return conversations.find(c => c.id === currentConversationId);
}

async function updateConversationTitle(conversation, firstMessage, syncToBackend = true) {
  const title = firstMessage.slice(0, 30) + (firstMessage.length > 30 ? '...' : '');
  conversation.title = title;
  saveConversations();
  renderHistory();

  // 同步标题到后端
  if (syncToBackend) {
    try {
      if (conversation.id) {
        await window.deepagents.renameConversation(conversation.id, title);
        console.log('[Conversation] Synced title to backend:', title);
      }
    } catch (error) {
      console.error('[Conversation] Failed to sync title to backend:', error);
    }
  } else {
    console.log('[Conversation] Updated local title, skipping backend sync for now');
  }
}

function addMessageToHistory(role, content) {
  let conversation = getCurrentConversation();
  if (!conversation) {
    conversation = createConversation();
  }

  // 确保 messages 数组存在
  if (!conversation.messages) {
    conversation.messages = [];
  }

  conversation.messages.push({ role, content, timestamp: new Date().toISOString() });
  conversation.updatedAt = new Date().toISOString();

  if (role === 'user' && conversation.messages.filter(m => m.role === 'user').length === 1) {
    // 仅更新本地标题，不立即同步到后端（防止后端对话尚未创建）
    updateConversationTitle(conversation, content, false);
  }

  saveConversations();
}

// 获取当前工作空间名称
function getCurrentWorkspaceName() {
  if (!currentWorkspaceId) return '未选择工作空间';
  const workspace = workspaces.find(w => w.id === currentWorkspaceId);
  return workspace ? workspace.name : '未知工作空间';
}

// 切换工作空间菜单
function toggleWorkspaceMenu() {
  const workspaceSelector = document.getElementById('workspace-selector');
  if (workspaceSelector) {
    workspaceSelector.click();
  }
}

function renderHistory() {
  console.log('[renderHistory] Start rendering. Conversations count:', conversations.length);
  historyList.innerHTML = '';

  // 工作空间头部
  const workspaceHeader = document.createElement('div');
  workspaceHeader.className = 'workspace-header';

  const workspaceInfo = document.createElement('div');
  workspaceInfo.className = 'workspace-info';
  workspaceInfo.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleWorkspaceMenu();
  };

  workspaceInfo.innerHTML = `
    <span class="workspace-icon">📁</span>
    <span class="workspace-name">${getCurrentWorkspaceName()}</span>
  `;

  const createWorkspaceBtn = document.createElement('button');
  createWorkspaceBtn.className = 'create-workspace-btn';
  createWorkspaceBtn.textContent = '+ 新建';
  createWorkspaceBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    showCreateWorkspaceDialog();
  };

  workspaceHeader.appendChild(workspaceInfo);
  workspaceHeader.appendChild(createWorkspaceBtn);
  historyList.appendChild(workspaceHeader);

  // 分隔线
  const divider = document.createElement('div');
  divider.className = 'workspace-divider';
  historyList.appendChild(divider);

  // 对话区域标题
  const conversationHeader = document.createElement('div');
  conversationHeader.className = 'conversation-header';
  conversationHeader.innerHTML = '<span class="section-label">💬 对话列表</span>';
  historyList.appendChild(conversationHeader);

  // 移除了"+ 新对话"按钮，因为发送消息时会自动创建对话

  // 渲染对话列表
  conversations.forEach(conv => {
    const item = document.createElement('div');
    item.className = `history-item ${conv.id === currentConversationId ? 'active' : ''}`;

    // 使用 created_at/updated_at (后端) 或 createdAt/updatedAt (本地)
    const timeField = conv.updated_at || conv.created_at || conv.updatedAt || conv.createdAt;
    
    let time = '';
    if (timeField) {
      const date = new Date(timeField);
      // 检查日期是否有效
      if (!isNaN(date.getTime())) {
        time = date.toLocaleString('zh-CN', {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
    }

    item.innerHTML = `
      <div class="history-content">
        <div class="history-title">${escapeHtml(conv.title || '未命名对话')}</div>
        <div class="history-time">${time}</div>
      </div>
      <button class="history-delete-btn" data-id="${conv.id}" title="删除对话">×</button>
    `;

    // 点击切换对话
    item.addEventListener('click', (e) => {
      console.log('[HistoryItem] Clicked conversation:', conv.id, conv.title);
      // 如果点击的是删除按钮，不触发加载
      if (e.target.classList.contains('history-delete-btn')) {
        console.log('[HistoryItem] Clicked delete button, ignoring switch');
        return;
      }
      switchConversation(conv.id);
    });

    // 删除按钮事件
    const deleteBtn = item.querySelector('.history-delete-btn');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteConversationBackend(conv.id);
    });

    historyList.appendChild(item);
  });
}

// 创建新对话
async function createNewConversation() {
  if (!currentWorkspaceId) {
    alert('请先选择一个工作空间');
    return;
  }

  try {
    const result = await window.deepagents.createConversation(currentWorkspaceId);
    const conversationId = result.data.conversation_id;

    // 切换到新对话
    await switchConversation(conversationId);

    console.log('[Conversation] Created new conversation:', conversationId);
  } catch (error) {
    console.error('[Conversation] Failed to create conversation:', error);
    alert('创建对话失败: ' + error.message);
  }
}

// 切换对话
async function switchConversation(conversationId) {
  console.log('[switchConversation] Called with ID:', conversationId);
  if (!currentWorkspaceId) {
    console.error('[Conversation] No workspace selected');
    return;
  }

  try {
    await window.deepagents.switchConversation(currentWorkspaceId, conversationId);
    currentConversationId = conversationId;

    // 清空消息视图
    if (messagesDiv) {
      messagesDiv.innerHTML = '';
    }

    // 更新历史列表高亮
    renderHistory();

    console.log('[Conversation] Switched to conversation:', conversationId);

    // 加载并渲染历史消息
    loadConversationHistory(currentWorkspaceId, conversationId);
  } catch (error) {
    console.error('[Conversation] Failed to switch conversation:', error);
  }
}

// 加载对话历史
async function loadConversationHistory(workspaceId, conversationId) {
  try {
    // 显示加载指示器
    if (messagesDiv) {
      messagesDiv.innerHTML = '<div class="loading-history">加载历史记录中...</div>';
    }

    const result = await window.deepagents.getConversationHistory(workspaceId, conversationId);
    console.log('[loadConversationHistory] Raw result:', JSON.stringify(result));
    
    // 清空加载指示器
    if (messagesDiv) {
      messagesDiv.innerHTML = '';
    }

    if (result.status === 'success' && result.data && result.data.messages) {
      const messages = result.data.messages;
      console.log('[History] Loaded messages:', messages.length);

      // 同步到本地状态，防止 addMessageToHistory 报错
      const conversation = conversations.find(c => c.id === conversationId);
      if (conversation) {
        // 将后端消息格式转换为本地格式并保存
        conversation.messages = messages.map(msg => {
          let role = 'unknown';
          let content = msg.content || '';
          
          if (msg.type === 'human' || msg.type === 'user') {
            role = 'user';
          } else if (msg.type === 'ai' || msg.type === 'assistant') {
            role = 'assistant';
          } else if (msg.type === 'tool') {
            role = 'tool'; // 保留原始类型，但在 UI 中可能作为 assistant 显示
          }
          
          return {
            role: role,
            content: content,
            type: msg.type, // 保存原始类型
            tool_calls: msg.tool_calls, // 保存工具调用
            timestamp: new Date().toISOString() // 模拟时间戳
          };
        });
        console.log('[History] Synced messages to local state');
      }

      messages.forEach(msg => {
        let role = 'unknown';
        let content = msg.content || '';
        
        // Debug log for troubleshooting missing history
        console.log('[History] Processing msg:', { 
          type: msg.type, 
          contentLen: content.length, 
          toolCalls: msg.tool_calls ? msg.tool_calls.length : 0,
          rawContent: content.substring(0, 50)
        });

        // 映射消息类型到 UI 角色
        if (msg.type === 'human' || msg.type === 'user') {
          role = 'user';
        } else if (msg.type === 'ai' || msg.type === 'assistant') {
          role = 'assistant';

          // 如果 AI 消息包含工具调用，先添加操作日志，再追加到内容中显示
          if (msg.tool_calls && msg.tool_calls.length > 0) {
            // 确保有思考过程面板用于显示操作日志
            if (!currentThinkingLog) {
              createThinkingLog();
            }

            // 为每个工具调用添加操作日志
            msg.tool_calls.forEach(tc => {
              const toolName = tc.name;
              const toolInput = tc.args || {};
              const inputSummary = formatToolInput(toolName, toolInput);

              // 添加操作日志
              addOperationLog(`📋 工具调用: ${toolName}\n${inputSummary}`);

              // 追加工具调用标记到内容，用于显示卡片
              const args = JSON.stringify(toolInput, null, 2);
              content += `\n\nTool Call: ${tc.id}\nname: ${toolName}\ntype: tool_call\ninput: ${args}`;
            });
          }
        } else if (msg.type === 'tool') {
          // 工具执行结果通常不直接作为独立消息显示，或者作为系统消息
          // 这里我们可以选择显示它，或者如果它被设计为隐藏则忽略
          // 既然是调试/开发工具，显示出来比较好
          role = 'assistant tool-output'; // 使用特殊样式类
          const toolName = msg.name || 'unknown';
          content = `🔧 Tool Output (${toolName}):\n${content}`;
        }

        if (role !== 'unknown' && content.trim()) {
          // 使用 addMessage 但不保存到本地历史（避免重复）
          // 创建一个新的 renderMessage 函数只负责渲染
          renderMessageToUI(role, content);
        }
      });
      
      // 滚动到底部
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
  } catch (error) {
    console.error('[History] Failed to load history:', error);
    if (messagesDiv) {
      messagesDiv.innerHTML += `<div class="error-message">加载历史记录失败: ${error.message}</div>`;
    }
  }
}

function renderMessageToUI(role, content) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.innerHTML = formatMessageContent(content);
  messagesDiv.appendChild(div);
}

// 删除对话（使用后端 API）
async function deleteConversationBackend(conversationId) {
  const conversation = conversations.find(c => c.id === conversationId);
  if (!conversation) return;

  const confirmed = confirm(`确定要删除对话"${conversation.title || '未命名对话'}"吗？`);
  if (!confirmed) return;

  try {
    await window.deepagents.deleteConversation(conversationId);

    // 从本地数组中删除
    conversations = conversations.filter(c => c.id !== conversationId);

    // 如果删除的是当前对话，清空消息区域
    if (currentConversationId === conversationId) {
      currentConversationId = null;
      if (messagesDiv) {
        messagesDiv.innerHTML = '';
      }
    }

    // 重新渲染
    renderHistory();

    console.log('[Conversation] Deleted conversation:', conversationId);
  } catch (error) {
    console.error('[Conversation] Failed to delete conversation:', error);
    alert('删除对话失败: ' + error.message);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatMessageContent(content) {
  // 处理多行内容和格式
  if (!content) return '';

  let formatted = content;

  // 使用 Map 存储解析后的 JSON 对象和代码块
  const jsonMap = new Map();
  const blockMap = new Map();
  const JSON_PREFIX = '___JSON_';
  const BLOCK_PREFIX = '___BLOCK_';

  // 1. 首先检测代码块 (```code```)
  let blockIndex = 0;
  formatted = formatted.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    // 如果是 JSON，尝试格式化
    if (lang === 'json') {
      try {
        const parsed = JSON.parse(code);
        code = JSON.stringify(parsed, null, 2);
      } catch (e) {
        // 不是有效 JSON，保持原样
      }
    }
    const marker = `${BLOCK_PREFIX}${blockIndex}___`;
    blockMap.set(blockIndex, code);
    blockIndex++;
    return marker;
  });

  // 2. 检测 JSON 对象（在 HTML 转义之前）
  // 简化 JSON 检测逻辑，避免复杂的正则导致性能问题
  // 只检测代码块中的 JSON，或者明显的 JSON 对象
  // 暂时移除自动检测行内复杂 JSON 的功能，防止正则回溯导致的卡死
  /*
  let jsonIndex = 0;
  formatted = formatted.replace(/(\{(?:[^{}]|\{[^{}]*\})*\})/g, (match) => {
    try {
      const parsed = JSON.parse(match);
      const marker = `${JSON_PREFIX}${jsonIndex}___`;
      jsonMap.set(jsonIndex, parsed);
      jsonIndex++;
      return marker;
    } catch (e) {
      return match;
    }
  });
  */

  // 3. 转义 HTML 防止 XSS
  formatted = escapeHtml(formatted);

  // 4. 处理标记的代码块 - 必须转义 code 中的 HTML
  formatted = formatted.replace(/___BLOCK_(\d+)___/g, (match, index) => {
    const code = blockMap.get(parseInt(index));
    if (code !== undefined) {
      return `<pre><code>${escapeHtml(code)}</code></pre>`;
    }
    return match;
  });

  // 5. 处理标记的 JSON 块
  formatted = formatted.replace(/___JSON_(\d+)___/g, (match, index) => {
    const parsed = jsonMap.get(parseInt(index));
    if (parsed) {
      const highlighted = JSON.stringify(parsed, null, 2)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/("(?:\\u[\dA-Fa-f]{4}|\\[^u]|[^\\"])*"(\s*:)?)/g, (m) => {
          let cls = 'json-string';
          if (/:$/.test(m)) {
            cls = 'json-key';
          }
          return `<span class="${cls}">${m}</span>`;
        })
        .replace(/\b(true|false|null)\b/g, '<span class="json-boolean">$1</span>')
        .replace(/\b(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g, '<span class="json-number">$1</span>');
      return `<pre><code class="language-json">${highlighted}</code></pre>`;
    }
    return match;
  });

  // 6. 检测行内代码 (`code`) - 但跳过已经在 <pre><code> 中的内容
  // 首先保护已有的 <pre><code>...</code></pre> 块
  const protectedBlocks = [];
  formatted = formatted.replace(/<pre><code>[\s\S]*?<\/code><\/pre>/g, (match) => {
    protectedBlocks.push(match);
    return `___PROTECTED_${protectedBlocks.length - 1}___`;
  });

  // 现在安全地处理行内代码
  formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 7. 检测粗体 (**text**)
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // 8. 检测斜体 (*text*)
  formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // 9. 格式化列表
  // 无序列表: - item (但避免与已处理的 <li> 冲突)
  formatted = formatted.replace(/^(?:[\-\*])\s+(.+)$/gm, '<li class="list-item">$1</li>');
  // 有序列表: 1. item
  formatted = formatted.replace(/^(\d+)\.\s+(.+)$/gm, '<li class="list-item-num" value="$1">$2</li>');

  // 10. 格式化链接 [text](url)
  formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="message-link">$1</a>');

  // 11. 将换行符转换为 <br> (但不在代码块中)
  formatted = formatted.replace(/\n/g, '<br>');

  // 恢复保护的代码块
  formatted = formatted.replace(/___PROTECTED_(\d+)___/g, (match, index) => {
    return protectedBlocks[parseInt(index)];
  });

  // 工具调用格式化
  formatted = formatToolCalls(formatted);

  // Todo list 格式化
  formatted = formatTodoList(formatted);

  // 文件路径格式化
  formatted = formatFilePaths(formatted);

  return formatted;
}

// 新增函数：Todo list 格式化
function formatTodoList(text) {
  // 检测 "Updated todo list to" 格式
  const todoPattern = /Updated todo list to\s+(\[[\s\S]*?\])(?=\n|$)/g;

  return text.replace(todoPattern, (match, todoListStr) => {
    try {
      // 解析 todo list（处理 Python repr 格式）
      const todos = parseTodoList(todoListStr);
      if (!todos || todos.length === 0) return match;

      // 构建格式化的 HTML
      let result = '<div class="todo-list-container">';
      result += '<div class="todo-list-header">📋 任务列表</div>';
      result += '<ul class="todo-list">';

      todos.forEach(todo => {
        const statusIcon = todo.status === 'completed' ? '✅' :
                           todo.status === 'in_progress' ? '🔄' : '⏳';
        const statusClass = todo.status === 'completed' ? 'completed' :
                            todo.status === 'in_progress' ? 'in-progress' : 'pending';
        result += `<li class="todo-item ${statusClass}">`;
        result += `<span class="todo-icon">${statusIcon}</span>`;
        result += `<span class="todo-content">${escapeHtml(todo.content)}</span>`;
        result += `</li>`;
      });

      result += '</ul></div>';
      return result;
    } catch (e) {
      console.error('[formatTodoList] Failed to parse:', e);
      return match;
    }
  });
}

// 解析 Python repr 格式的 todo list
function parseTodoList(str) {
  // 移除最外层的方括号和引号
  str = str.trim().replace(/^\[|\]$/g, '');

  // 使用简单的状态机解析
  const todos = [];
  let current = '';
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (escapeNext) {
      current += char;
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      current += char;
      continue;
    }

    if (char === "'" || char === '"') {
      inString = !inString;
      current += char;
      continue;
    }

    if (!inString) {
      if (char === '{') {
        depth++;
        current += char;
      } else if (char === '}') {
        depth--;
        current += char;
      } else if (char === ',' && depth === 0) {
        // 完成一个 todo 对象
        const todo = parseTodoItem(current.trim());
        if (todo) todos.push(todo);
        current = '';
      } else {
        current += char;
      }
    } else {
      current += char;
    }
  }

  // 处理最后一个
  if (current.trim()) {
    const todo = parseTodoItem(current.trim());
    if (todo) todos.push(todo);
  }

  return todos;
}

// 解析单个 todo 项
function parseTodoItem(str) {
  // 移除外层的 { }
  str = str.trim().replace(/^\{|\}$/g, '');

  const todo = { content: '', status: 'pending' };

  // 简单的正则匹配
  const contentMatch = str.match(/'content':\s*'([^']*)'/);
  const statusMatch = str.match(/'status':\s*'(\w+)'/);

  if (contentMatch) todo.content = contentMatch[1].replace(/\\'/g, "'");
  if (statusMatch) todo.status = statusMatch[1];

  return todo.content ? todo : null;
}

// 新增函数：JSON 语法高亮
function formatJsonWithHighlight(jsonStr) {
  try {
    const parsed = JSON.parse(jsonStr);
    const formatted = JSON.stringify(parsed, null, 2);
    return formatted
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/("(?:\\u[\dA-Fa-f]{4}|\\[^u]|[^\\"])*"(\s*:)?)/g, (m) => {
        let cls = /:$/.test(m) ? 'json-key' : 'json-string';
        return `<span class="${cls}">${m}</span>`;
      })
      .replace(/\b(true|false|null)\b/g, '<span class="json-boolean">$1</span>')
      .replace(/\b(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g, '<span class="json-number">$1</span>');
  } catch (e) {
    return escapeHtml(jsonStr);
  }
}

// 新增函数：工具调用格式化
function formatToolCalls(text) {
  // 首先处理 Tool Output 格式: 🔧 Tool Output (tool_name):\ncontent
  const toolOutputPattern = /🔧\s*Tool Output\s*\(([^)]+)\):\s*\n([\s\S]*?)(?=\n\n|\n🔧|Message|$)/gi;

  text = text.replace(toolOutputPattern, (match, toolName, output) => {
    // 格式化工具输出
    let result = `<div class="tool-output-compact">`;
    result += `<div class="tool-output-header">`;
    result += `<span class="tool-icon">✓</span>`;
    result += `<span class="tool-name">${escapeHtml(toolName.trim())}</span>`;
    result += `<span class="tool-type">输出</span>`;
    result += `</div>`;

    // 输出内容
    if (output.trim()) {
      // 尝试解析为 JSON 以美化显示
      try {
        const parsed = JSON.parse(output);
        const formattedOutput = formatJsonWithHighlight(JSON.stringify(parsed, null, 2));
        result += `<div class="tool-output-section">`;
        result += `<pre class="tool-output-content">${formattedOutput}</pre>`;
        result += `</div>`;
      } catch (e) {
        // 不是 JSON，直接显示文本
        result += `<div class="tool-output-section">`;
        result += `<pre class="tool-output-content">${escapeHtml(output.trim())}</pre>`;
        result += `</div>`;
      }
    }

    result += `</div>`;
    return result;
  });

  // 然后处理 Tool Call 格式
  const toolCallPattern = /(?:call_id|Tool Call):\s*([a-f0-9-]+)\s*\n([\s\S]*?)(?=\n\n|\n(?:call_id|已创建|已删除|✓|Error|🔧)|$)/gi;

  return text.replace(toolCallPattern, (match, callId, body) => {
    // 提取工具信息
    const nameMatch = body.match(/name:\s*(\w+)/i);
    const typeMatch = body.match(/type:\s*(\w+)/i);
    const inputMatch = body.match(/input:\s*(\{[\s\S]*\})/i);

    const toolName = nameMatch ? nameMatch[1] : 'unknown';
    const toolType = typeMatch ? typeMatch[1] : 'tool';

    // 构建结构化 HTML
    let result = `<div class="tool-call-compact">`;

    // 标题栏
    result += `<div class="tool-call-header">`;
    result += `<span class="tool-icon">🔧</span>`;
    result += `<span class="tool-name">${escapeHtml(toolName)}</span>`;
    result += `<span class="tool-type">${escapeHtml(toolType)}</span>`;
    result += `</div>`;

    // input 参数块（如果有）
    if (inputMatch) {
      const inputJson = inputMatch[1];
      try {
        // 解析 JSON
        const inputObj = JSON.parse(inputJson);

        // 检查是否有 content 字段
        if (inputObj.content && typeof inputObj.content === 'string') {
          // content 字段单独渲染为格式化内容
          const content = inputObj.content;
          const otherFields = Object.keys(inputObj).filter(k => k !== 'content');

          result += `<div class="tool-input-section">`;
          result += `<div class="section-label">内容预览</div>`;
          result += `<div class="tool-content-preview">${formatMessageContent(content)}</div>`;

          // 其他字段显示为 JSON
          if (otherFields.length > 0) {
            const otherObj = {};
            otherFields.forEach(k => otherObj[k] = inputObj[k]);
            if (Object.keys(otherObj).length > 0) {
              const otherJson = JSON.stringify(otherObj, null, 2);
              const formattedOther = formatJsonWithHighlight(otherJson);
              result += `<div class="section-label" style="margin-top: 8px;">其他参数</div>`;
              result += `<pre class="tool-input-json">${formattedOther}</pre>`;
            }
          }
          result += `</div>`;
        } else {
          // 没有 content 字段，显示完整 JSON
          const formattedInput = formatJsonWithHighlight(inputJson);
          result += `<div class="tool-input-section">`;
          result += `<div class="section-label">输入参数</div>`;
          result += `<pre class="tool-input-json">${formattedInput}</pre>`;
          result += `</div>`;
        }
      } catch (e) {
        // JSON 解析失败，回退到原样显示
        const formattedInput = formatJsonWithHighlight(inputJson);
        result += `<div class="tool-input-section">`;
        result += `<div class="section-label">输入参数</div>`;
        result += `<pre class="tool-input-json">${formattedInput}</pre>`;
        result += `</div>`;
      }
    }

    result += `</div>`;
    return result;
  });
}

// 新增函数：文件路径格式化
function formatFilePaths(text) {
  // 检测文件路径模式
  const pathPattern = /(?![<>])((?:\/[a-zA-Z0-9._-]+|[a-zA-Z]:\\[^\s<>)\]]+|[~][\/][^\s<>)\]]+)(?:\/[^\s<>)\]]*)*)/g;

  return text.replace(pathPattern, (match) => {
    // 长路径使用省略显示
    if (match.length > 50) {
      return `<span class="file-path-long" title="${escapeHtml(match)}">${escapeHtml(match)}</span>`;
    }
    return `<span class="file-path">${escapeHtml(match)}</span>`;
  });
}

function addMessage(role, content) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.innerHTML = formatMessageContent(content);
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  addMessageToHistory(role, content);
}

// 当前思考过程组件
let currentThinkingLog = null;

// 流式消息状态
let currentStreamingMessage = null;  // { container, contentDiv, cursor, fullContent }
let currentStreamRequestId = null;   // 当前流式请求的 ID

// 创建流式消息容器
function createStreamingMessage() {
  const container = document.createElement('div');
  container.className = 'message assistant streaming';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content streaming-content';

  // 光标动画
  const cursor = document.createElement('span');
  cursor.className = 'streaming-cursor';
  cursor.textContent = '▋';

  container.appendChild(contentDiv);
  container.appendChild(cursor);

  return { container, contentDiv, cursor, fullContent: '' };
}

// 追加内容到流式消息
function appendStreamingContent(contentDiv, newContent) {
  // 增量追加内容（只做 HTML 转义，不做完整格式化）
  contentDiv.insertAdjacentHTML('beforeend', escapeHtml(newContent));
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// 完成流式消息（移除光标，重新格式化内容）
function completeStreamingMessage(streamingMsg) {
  if (!streamingMsg) return;

  // 移除光标
  if (streamingMsg.cursor) {
    streamingMsg.cursor.remove();
  }

  // 重新格式化完整内容
  const formattedContent = formatMessageContent(streamingMsg.fullContent);
  streamingMsg.container.innerHTML = formattedContent;
  streamingMsg.container.classList.remove('streaming');
}

// 添加操作日志记录到思考过程面板
function addOperationLog(text) {
  // 如果当前没有思考过程组件，创建一个新的
  if (!currentThinkingLog) {
    createThinkingLog();
  }

  const div = document.createElement('div');
  div.className = 'operation-log';
  div.innerHTML = `
    <div class="log-icon">⚙️</div>
    <div class="log-text">${escapeHtml(text)}</div>
    <div class="log-time">${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
  `;
  currentThinkingLog.logContainer.appendChild(div);
  currentThinkingLog.logContainer.scrollTop = currentThinkingLog.logContainer.scrollHeight;
}

// 创建思考过程组件
function createThinkingLog() {
  const container = document.createElement('div');
  container.className = 'thinking-process';

  const header = document.createElement('div');
  header.className = 'thinking-header';
  header.innerHTML = `
    <span class="thinking-title">⚙️ 思考过程</span>
    <button class="thinking-toggle">收起</button>
  `;

  const logContainer = document.createElement('div');
  logContainer.className = 'thinking-log';

  container.appendChild(header);
  container.appendChild(logContainer);

  // 折叠/展开功能
  const toggleBtn = header.querySelector('.thinking-toggle');
  toggleBtn.addEventListener('click', () => {
    container.classList.toggle('collapsed');
    toggleBtn.textContent = container.classList.contains('collapsed') ? '展开' : '收起';
  });

  messagesDiv.appendChild(container);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  // 保存引用
  currentThinkingLog = { container, logContainer };
}

// 完成当前思考过程（助手回复后调用）
function completeThinkingLog() {
  currentThinkingLog = null;
}

// 简单的 HTML 转义函数
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// === @工作空间 快速切换 ===
let mentionDebounceTimer = null;

// 设置输入框监听
function setupWorkspaceMentionInput() {
  // Prevent duplicate initialization
  if (window.workspaceMentionInputInitialized) return;
  window.workspaceMentionInputInitialized = true;

  const input = document.getElementById('message-input');
  if (!input) return;

  // 监听输入检测 @ 符号
  input.addEventListener('input', (e) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;

    // 检测光标前的 @ 符号
    const beforeCursor = value.substring(0, cursorPos);
    const match = beforeCursor.match(/@(\w*)$/);

    if (match && workspaceMention) {
      // 延迟弹出避免闪烁
      clearTimeout(mentionDebounceTimer);
      mentionDebounceTimer = setTimeout(() => {
        if (workspaceMention) {  // Add guard
          const rect = input.getBoundingClientRect();
          workspaceMention.show(rect);
        }
      }, 100);
    } else {
      clearTimeout(mentionDebounceTimer);
      if (workspaceMention) {
        workspaceMention.hide();
      }
    }
  });

  // 监听键盘事件
  input.addEventListener('keydown', (e) => {
    if (!workspaceMention || !workspaceMention.isDropdownVisible()) {
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      workspaceMention.selectNext();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      workspaceMention.selectPrevious();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      workspaceMention.confirmSelection();
      // 恢复 Enter 发送消息的行为
      setTimeout(() => {
        input.focus();
      }, 10);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      workspaceMention.hide();
    }
  });
}

async function sendMessage() {
  const message = input.value.trim();
  if (!message || isProcessing) return;

  isProcessing = true;
  sendBtn.disabled = true;

  // 重置思考过程组件，为新的对话做准备
  currentThinkingLog = null;

  addMessage('user', message);
  input.value = '';

  // 创建流式消息容器
  currentStreamingMessage = createStreamingMessage();
  messagesDiv.appendChild(currentStreamingMessage.container);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  // 生成 requestId 并在发送前设置（避免时序问题）
  const requestId = crypto.randomUUID();
  currentStreamRequestId = requestId;
  console.log('[sendMessage] Generated Request ID:', requestId);

  try {
    // 调用后端（使用流式模式）
    // 传递简单字符串消息，而不是对象，避免后端解析错误
    const response = await window.deepagents.chat(message, true, currentWorkspaceId, currentConversationId, requestId);

    console.log('[sendMessage] Response:', response);

    // 检查是否是流式响应
    if (response?.data?.streamed) {
      // 流式响应已经在事件监听器中处理完成
      console.log('[sendMessage] Streaming complete');
    } else {
      // 非流式响应（回退到原有逻辑）
      const loadingElement = currentStreamingMessage.container;
      loadingElement.remove();

      // 安全地提取内容
      let content = '';
      if (response?.data?.content) {
        content = response.data.content;
      } else if (response?.content) {
        content = response.content;
      }

      // 确保 content 是字符串
      if (typeof content === 'object') {
        try {
          content = JSON.stringify(content);
        } catch (e) {
          content = String(content);
        }
      } else {
        content = String(content || '');
      }

      console.log('[sendMessage] Extracted content length:', content.length);
      addMessage('assistant', content);
    }

    // 如果是第一条用户消息，现在可以安全地同步标题到后端了
    const conversation = getCurrentConversation();
    if (conversation && conversation.messages.filter(m => m.role === 'user').length === 1) {
      const firstMsg = conversation.messages.find(m => m.role === 'user');
      if (firstMsg) {
        console.log('[sendMessage] Syncing title to backend after successful chat');
        updateConversationTitle(conversation, firstMsg.content, true);
      }
    }
  } catch (error) {
    // 清理流式消息容器
    if (currentStreamingMessage) {
      currentStreamingMessage.container.remove();
      currentStreamingMessage = null;
    }
    addMessage('assistant', `Error: ${error.message}`);
  } finally {
    isProcessing = false;
    sendBtn.disabled = false;
    currentStreamingMessage = null;
    currentStreamRequestId = null;
  }
}

// === 添加技能对话框 ===
let addSkillDialog, skillPathInput, skillFileInput, skillPreview, skillPreviewContent;
let selectedSkillFiles = null;
let selectedSkillName = null;

function showAddSkillDialog() {
  addSkillDialog.style.display = 'flex';
  skillPathInput.value = '';
  skillPreview.style.display = 'none';
  selectedSkillFiles = null;
  selectedSkillName = null;
  document.getElementById('upload-skill-btn').disabled = true;
}

function hideAddSkillDialog() {
  addSkillDialog.style.display = 'none';
}

function setupAddSkillButton() {
  // 获取所有 DOM 元素
  addSkillDialog = document.getElementById('add-skill-dialog');
  skillPathInput = document.getElementById('skill-path-input');
  skillFileInput = document.getElementById('skill-file-input');
  skillPreview = document.getElementById('skill-preview');
  skillPreviewContent = document.getElementById('skill-preview-content');

  const addSkillBtn = document.getElementById('add-skill-btn');

  if (!addSkillBtn) {
    console.error('[setupAddSkillButton] add-skill-btn not found!');
    return;
  }

  const browseBtn = document.getElementById('browse-skill-btn');
  const cancelBtn = document.getElementById('cancel-skill-btn');
  const uploadBtn = document.getElementById('upload-skill-btn');

  // 打开对话框 - 使用更明确的处理函数
  const handleAddSkillClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    showAddSkillDialog();
  };

  addSkillBtn.addEventListener('click', handleAddSkillClick);

  // 浏览按钮
  browseBtn.addEventListener('click', () => {
    skillFileInput.click();
  });

  // 文件选择 - 读取文件内容而不是路径
  skillFileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    console.log('[FileSelect] Selected files:', files.length);

    if (files.length === 0) return;

    // 查找 SKILL.md 文件
    const skillFile = files.find(f => f.name === 'SKILL.md');

    if (!skillFile) {
      skillPathInput.value = files[0].webkitRelativePath.split('/')[0];
      skillPreview.style.display = 'block';
      skillPreviewContent.innerHTML = '<span style="color: #ff3b30;">未找到 SKILL.md 文件</span>';
      uploadBtn.disabled = true;
      return;
    }

    // 提取技能名称（目录名）
    const pathParts = skillFile.webkitRelativePath.split('/');
    selectedSkillName = pathParts[pathParts.length - 2];

    // 读取所有文件的内容
    try {
      uploadBtn.textContent = '读取文件中...';
      uploadBtn.disabled = true;

      const fileData = [];

      for (const file of files) {
        // 跳过目录
        if (file.name === '.' || file.name === '') continue;

        // 读取文件内容为 base64
        const reader = new FileReader();
        const content = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // content 是 data URL 格式: data:mime/type;base64,BASE64DATA
        let base64Data = '';
        let mimeType = 'text/plain';

        if (typeof content === 'string' && content.startsWith('data:')) {
          const match = content.match(/data:([^;]+);base64,(.+)/);
          if (match) {
            mimeType = match[1];
            base64Data = match[2];
          } else {
            console.warn('[FileSelect] Unexpected data URL format:', content.substring(0, 100));
          }
        } else {
          console.warn('[FileSelect] Content is not a data URL:', typeof content);
        }

        if (!base64Data) {
          console.error('[FileSelect] Failed to extract base64 from:', content.substring(0, 100));
          continue;
        }

        fileData.push({
          name: file.name,
          content: base64Data,
          mimeType: mimeType,
          size: file.size
        });


        console.log('[FileSelect] Loaded file:', file.name, 'size:', base64Data.length, 'bytes (base64)');
      }

      selectedSkillFiles = fileData;

      skillPathInput.value = selectedSkillName;
      skillPreview.style.display = 'block';
      skillPreviewContent.innerHTML = `
        <strong>${selectedSkillName}</strong><br>
        <span style="color: #34c759;">✓ SKILL.md 文件已找到</span><br>
        <span style="color: #86868b;">${fileData.length} 个文件已读取</span>
      `;
      uploadBtn.textContent = '上传';
      uploadBtn.disabled = false;
    } catch (error) {
      console.error('[FileSelect] Error reading files:', error);
      skillPreview.style.display = 'block';
      skillPreviewContent.innerHTML = `<span style="color: #ff3b30;">读取文件失败: ${error.message}</span>`;
      uploadBtn.textContent = '上传';
      uploadBtn.disabled = true;
    }
  });

  // 取消按钮
  cancelBtn.addEventListener('click', hideAddSkillDialog);

  // 上传按钮
  uploadBtn.addEventListener('click', async () => {
    if (!selectedSkillName || !selectedSkillFiles) {
      return;
    }

    try {
      uploadBtn.disabled = true;
      uploadBtn.textContent = '上传中...';

      // 固定使用用户目录存储
      const location = 'user';

      const result = await window.deepagents.uploadSkill(selectedSkillName, selectedSkillFiles, location);

      // 显示固定的路径信息
      alert(`技能 "${selectedSkillName}" 上传成功！\n\n已安装到: ~/.deepagents/desktop/skills/${selectedSkillName}/`);

      hideAddSkillDialog();
      loadSkills();
    } catch (error) {
      console.error('上传技能失败:', error);
      alert('上传技能失败: ' + error.message);
      uploadBtn.disabled = false;
      uploadBtn.textContent = '上传';
    }
  });

  // ESC 键关闭对话框
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && addSkillDialog.style.display === 'flex') {
      hideAddSkillDialog();
    }
  });

  // 点击背景关闭对话框
  addSkillDialog.addEventListener('click', (e) => {
    if (e.target === addSkillDialog) {
      hideAddSkillDialog();
    }
  });
}

function setupGithubImportButton() {
  const githubImportBtn = document.getElementById('github-import-btn');
  const githubImportDialog = document.getElementById('github-import-dialog');
  const skillSelectionDialog = document.getElementById('skill-selection-dialog');
  const githubUrlInput = document.getElementById('github-url-input');
  const useProxyCheckbox = document.getElementById('use-proxy-checkbox');
  const confirmGithubImport = document.getElementById('confirm-github-import');
  const cancelGithubImport = document.getElementById('cancel-github-import');
  const githubImportStatus = document.getElementById('github-import-status');
  const githubImportMessage = document.getElementById('github-import-message');

  // 技能选择对话框元素
  const skillsListContainer = document.getElementById('skills-list-container');
  const skillsFoundCount = document.getElementById('skills-found-count');
  const selectedCount = document.getElementById('selected-count');
  const backToScanBtn = document.getElementById('back-to-scan');
  const confirmSelectedImport = document.getElementById('confirm-selected-import');
  const selectionImportStatus = document.getElementById('selection-import-status');
  const selectionImportMessage = document.getElementById('selection-import-message');

  // 用于保存扫描结果
  let scanResult = null;

  if (!githubImportBtn) {
    console.error('[setupGithubImportButton] github-import-btn not found!');
    return;
  }

  // 打开扫描对话框
  githubImportBtn.addEventListener('click', () => {
    githubUrlInput.value = '';
    githubImportStatus.style.display = 'none';
    githubImportDialog.style.display = 'flex';
    githubUrlInput.focus();
  });

  // 取消扫描
  cancelGithubImport.addEventListener('click', () => {
    githubImportDialog.style.display = 'none';
    scanResult = null; // 清除扫描结果
  });

  // 返回扫描对话框
  backToScanBtn.addEventListener('click', () => {
    skillSelectionDialog.style.display = 'none';
    githubImportDialog.style.display = 'flex';
    // 注意：不清除 scanResult，允许用户重新选择
  });

  // 阶段1: 扫描技能
  confirmGithubImport.addEventListener('click', async () => {
    const url = githubUrlInput.value.trim();
    const useProxy = useProxyCheckbox.checked;

    // 验证 URL - 支持 GitHub 和自定义 git 仓库
    if (!url) {
      alert('请输入有效的 Git URL');
      return;
    }

    // 支持 GitHub URL 或自定义 git 仓库 URL
    const isValidUrl = url.startsWith('https://github.com/') ||
                        url.startsWith('http://') ||
                        url.startsWith('https://') ||
                        url.endsWith('.git');

    if (!isValidUrl) {
      alert('请输入有效的 Git URL：\n- GitHub URL: https://github.com/xxx/xxx\n- 自定义仓库: http://172.32.153.184:29999/xxx.git\n- 或其他有效的 git 仓库地址');
      return;
    }

    // 移除末尾的 .git 后缀（如果有）
    const cleanUrl = url.endsWith('.git') ? url.slice(0, -4) : url;

    // 禁用按钮，显示状态
    confirmGithubImport.disabled = true;
    confirmGithubImport.textContent = '扫描中...';
    githubImportStatus.style.display = 'block';
    githubImportMessage.textContent = '正在克隆仓库并扫描技能，请稍候...';
    githubImportMessage.style.color = '#1d1d1f';

    try {
      const result = await window.deepagents.scanGithubForSkills(cleanUrl, useProxy);

      if (result.status === 'success') {
        // 保存扫描结果
        scanResult = result.data;

        // 显示技能选择对话框
        showSkillSelectionDialog(result.data.skills);
      } else {
        const errorMsg = result.error?.message || result.message || '未知错误';
        githubImportMessage.textContent = '扫描失败: ' + errorMsg;
        githubImportMessage.style.color = '#ff3b30';
      }
    } catch (error) {
      console.error('[confirmGithubImport] Error:', error);
      githubImportMessage.textContent = '扫描失败: ' + error.message;
      githubImportMessage.style.color = '#ff3b30';
    } finally {
      confirmGithubImport.disabled = false;
      confirmGithubImport.textContent = '扫描技能';
    }
  });

  // 阶段2: 显示技能选择对话框
  function showSkillSelectionDialog(skills) {
    // 更新技能数量
    skillsFoundCount.textContent = skills.length;
    selectedCount.textContent = skills.length;

    // 清空技能列表
    skillsListContainer.innerHTML = '';

    // 生成技能列表
    skills.forEach(skill => {
      const skillItem = document.createElement('div');
      skillItem.style.cssText = `
        margin-bottom: 12px;
        padding: 12px;
        background: #f5f5f7;
        border-radius: 8px;
        border: 1px solid #e5e5ea;
        cursor: pointer;
        transition: all 0.15s ease;
      `;

      // 选中状态样式
      skillItem.addEventListener('mouseenter', () => {
        if (!skillItem.dataset.selected) {
          skillItem.style.background = '#ebebeb';
        }
      });
      skillItem.addEventListener('mouseleave', () => {
        if (!skillItem.dataset.selected) {
          skillItem.style.background = '#f5f5f7';
        }
      });

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = true; // 默认全选
      checkbox.style.cssText = 'margin: 0; cursor: pointer;';
      checkbox.dataset.dirName = skill.dir_name;
      checkbox.dataset.relativePath = skill.relative_path || skill.dir_name;  // 存储相对路径

      const skillInfo = document.createElement('div');
      skillInfo.style.cssText = `
        display: flex;
        gap: 12px;
        align-items: flex-start;
      `;

      const skillText = document.createElement('div');
      skillText.style.cssText = 'flex: 1;';

      const skillName = document.createElement('div');
      skillName.textContent = skill.name;
      skillName.style.cssText = `
        font-size: 14px;
        font-weight: 600;
        color: #1d1d1f;
        margin-bottom: 4px;
      `;

      const skillDesc = document.createElement('div');
      skillDesc.textContent = skill.description;
      skillDesc.style.cssText = `
        font-size: 12px;
        color: #6e6e73;
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      `;

      skillText.appendChild(skillName);
      skillText.appendChild(skillDesc);
      skillInfo.appendChild(checkbox);
      skillInfo.appendChild(skillText);
      skillItem.appendChild(skillInfo);

      // 点击整行切换选中状态
      skillItem.addEventListener('click', (e) => {
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
        }
        updateSelectedCount();
      });

      skillsListContainer.appendChild(skillItem);
    });

    // 切换到技能选择对话框
    githubImportDialog.style.display = 'none';
    skillSelectionDialog.style.display = 'flex';
    selectionImportStatus.style.display = 'none';

    // 更新选中数量
    updateSelectedCount();

    function updateSelectedCount() {
      const checked = skillsListContainer.querySelectorAll('input[type="checkbox"]:checked');
      selectedCount.textContent = checked.length;
    }
  }

  // 阶段3: 导入选中的技能
  confirmSelectedImport.addEventListener('click', async () => {
    // 固定使用用户目录存储
    const location = 'user';

    // 获取选中的技能（包含 dir_name 和 relative_path）
    const checkedBoxes = skillsListContainer.querySelectorAll('input[type="checkbox"]:checked');
    const selectedSkills = Array.from(checkedBoxes).map(cb => ({
      dir_name: cb.dataset.dirName,
      relative_path: cb.dataset.relativePath
    }));

    if (selectedSkills.length === 0) {
      alert('请至少选择一个技能');
      return;
    }

    // 禁用按钮，显示状态
    confirmSelectedImport.disabled = true;
    backToScanBtn.disabled = true;
    selectionImportStatus.style.display = 'block';
    selectionImportMessage.textContent = `正在导入 ${selectedSkills.length} 个技能...`;
    selectionImportMessage.style.color = '#1d1d1f';

    try {
      const result = await window.deepagents.importSelectedSkills(
        scanResult.temp_dir,
        selectedSkills,
        location
      );

      if (result.status === 'success') {
        const data = result.data;
        let message = `导入完成！\n\n`;

        if (data.imported_count > 0) {
          message += `✓ 已导入: ${data.imported.join(', ')}\n`;
        }
        if (data.skipped_count > 0) {
          message += `⊘ 已存在（跳过）: ${data.skipped.join(', ')}\n`;
        }
        if (data.failed_count > 0) {
          message += `✗ 导入失败: ${data.failed.join(', ')}\n`;
        }

        alert(message);

        // 关闭对话框并刷新技能列表
        skillSelectionDialog.style.display = 'none';
        loadSkills();
      } else {
        const errorMsg = result.error?.message || result.message || '未知错误';
        selectionImportMessage.textContent = '导入失败: ' + errorMsg;
        selectionImportMessage.style.color = '#ff3b30';
      }
    } catch (error) {
      console.error('[confirmSelectedImport] Error:', error);
      selectionImportMessage.textContent = '导入失败: ' + error.message;
      selectionImportMessage.style.color = '#ff3b30';
    } finally {
      confirmSelectedImport.disabled = false;
      backToScanBtn.disabled = false;
    }
  });

  // ESC 键关闭对话框
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (skillSelectionDialog.style.display === 'flex') {
        skillSelectionDialog.style.display = 'none';
        githubImportDialog.style.display = 'flex';
      } else if (githubImportDialog.style.display === 'flex') {
        githubImportDialog.style.display = 'none';
        scanResult = null;
      }
    }
  });

  // 点击背景关闭对话框
  githubImportDialog.addEventListener('click', (e) => {
    if (e.target === githubImportDialog) {
      githubImportDialog.style.display = 'none';
      scanResult = null;
    }
  });

  skillSelectionDialog.addEventListener('click', (e) => {
    if (e.target === skillSelectionDialog) {
      skillSelectionDialog.style.display = 'none';
      githubImportDialog.style.display = 'flex';
    }
  });
}

// 在 DOM 加载完成后设置
async function initializeApp() {
  console.log('[INIT] Initializing app, readyState:', document.readyState);

  // 初始化 DOM 元素引用
  messagesDiv = document.getElementById('messages');
  input = document.getElementById('message-input');
  sendBtn = document.getElementById('send-btn');
  historyList = document.getElementById('history-list');
  skillsList = document.getElementById('skills-list');

  console.log('[INIT] DOM elements initialized');

  // 检查是否首次启动（无配置）
  const configStatus = await checkConfigStatus();
  if (!configStatus.has_config) {
    console.log('[INIT] No config found, showing first launch wizard');
    showFirstLaunchWizard();
    return; // 暂停其他初始化
  }

  // 正常初始化流程
  setupTabs();
  loadConversations();
  setupAddSkillButton();
  setupGithubImportButton();
  setupHITL(); // 初始化 HITL 功能
  setupWorkspaceManager(); // 初始化工作空间管理
  initConfigMenu(); // 初始化配置菜单
  setupThemeDialog(); // 初始化主题对话框

  // 初始化主题管理器
  if (window.themeManager) {
    await window.themeManager.init();
  }

  // 应用配置（包括 SkillsLM URL）
  try {
    const config = await window.deepagents.getConfig();
    applySkillsLMUrl(config.skillslm_url);
  } catch (error) {
    console.error('[INIT] Failed to apply SkillsLM URL:', error);
  }

  // === 焦点管理（修复 Windows 输入问题） ===
  // 将 ensureInputFocus 暴露到全局，供主进程调用
  window.ensureInputFocus = function() {
    // 检查是否暂停（例如对话框显示时）
    if (window.inputFocusPaused) {
      return false;
    }
    if (input && document.activeElement !== input) {
      console.log('[Focus] Forcing input focus');
      input.focus();
      return true;
    }
    return false;
  };

  // 本地引用，避免频繁访问 window
  const ensureInputFocus = window.ensureInputFocus;

  // 添加焦点事件监听
  input.addEventListener('focus', () => {
    console.log('[Focus] Input focused, activeElement:', document.activeElement?.tagName);
  });

  input.addEventListener('blur', () => {
    console.log('[Focus] Input blurred, new activeElement:', document.activeElement?.tagName);
    // Windows: 当输入框失去焦点时，延迟检查是否需要恢复焦点
    if (navigator.platform.includes('Win')) {
      setTimeout(() => {
        // 如果焦点不在输入框、按钮或其他交互元素上，恢复到输入框
        const tag = document.activeElement?.tagName?.toLowerCase();
        if (tag !== 'input' && tag !== 'button' && tag !== 'textarea' && tag !== 'select') {
          console.log('[Focus] Focus lost to non-interactive element, restoring');
          ensureInputFocus();
        }
      }, 100);
    }
  });

  // Windows 特殊处理：增强焦点管理
  if (navigator.platform.includes('Win')) {
    console.log('[Focus] Windows detected, adding enhanced focus handlers');

    // 点击时确保聚焦
    input.addEventListener('click', () => {
      console.log('[Focus] Input clicked, ensuring focus');
      ensureInputFocus();
    });

    // mousedown 时也确保聚焦（比 click 更早触发）
    input.addEventListener('mousedown', () => {
      console.log('[Focus] Input mousedown, ensuring focus');
      setTimeout(ensureInputFocus, 0);
    });

    // 鼠标进入输入框区域时也尝试聚焦
    input.addEventListener('mouseenter', () => {
      console.log('[Focus] Mouse entered input area');
      setTimeout(ensureInputFocus, 50);
    });

    // 定期检查焦点（更频繁，从 2 秒改为 500ms）
    let focusCheckCount = 0;
    setInterval(() => {
      focusCheckCount++;
      if (ensureInputFocus()) {
        console.log(`[Focus] Auto-restored focus (check #${focusCheckCount})`);
      }
    }, 500);

    // 监听整个文档的点击事件
    document.addEventListener('click', (e) => {
      // 如果点击的是输入框容器内部，确保输入框获得焦点
      const inputContainer = input.closest('.input-container, .message-input-area');
      if (inputContainer && inputContainer.contains(e.target)) {
        console.log('[Focus] Clicked inside input container');
        setTimeout(ensureInputFocus, 0);
      }
    }, true);  // 使用捕获阶段
  }

  // 初始化时自动聚焦
  setTimeout(() => {
    console.log('[Focus] Initial focus attempt');
    ensureInputFocus();
  }, 500);

  // 设置消息发送事件监听器
  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  console.log('[INIT] App initialized');
}

// 暴露添加技能对话框函数到全局（用于内联 onclick）
window.openAddSkillDialog = function() {
  console.log('[openAddSkillDialog] Called from global scope');
  if (typeof showAddSkillDialog === 'function') {
    showAddSkillDialog();
  } else {
    console.error('[openAddSkillDialog] showAddSkillDialog not defined yet');
  }
};

// 始终等待 DOMContentLoaded
if (document.readyState === 'loading') {
  console.log('[INIT] Waiting for DOMContentLoaded');
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  console.log('[INIT] DOM already loaded, initializing now');
  // 使用 setTimeout 确保 DOM 完全渲染
  setTimeout(initializeApp, 0);
}

// === HITL (Human-in-the-Loop) 功能 ===
let currentRequestId = null;  // 当前等待批准的请求 ID
let hitlCallbackRegistered = false;  // 防止重复注册回调
let isProcessingDecision = false;  // 防止重复提交决定
let currentToolInfo = null;  // 保存当前工具信息用于日志显示
let autoApproveAll = false;  // 自动批准全部模式
let processedToolCallIds = new Set(); // 已处理的工具调用 ID (防止重复弹窗)

function setupHITL() {
  console.log('[HITL] Setting up Human-in-the-Loop support');

  // 只注册一次回调
  if (!hitlCallbackRegistered) {
    // 监听来自 Python 的 interrupt_request 消息
    window.deepagents.onResponse((data) => {
      console.log('[HITL] Received message:', data);
      console.log('[HITL] Message type:', data?.type);

      if (data.type === 'interrupt_request') {
        console.log('[HITL] Showing tool approval dialog');
        showToolApprovalDialog(data);
      }
    });

    // 监听流式 chunk 消息
    window.deepagents.onChunk((data) => {
      console.log('[Stream] Received chunk:', { requestId: data.requestId, contentLen: data.content?.length, done: data.done });

      // 验证 requestId 是否匹配当前请求
      if (data.requestId !== currentStreamRequestId) {
        console.log('[Stream] Ignoring chunk for different request:', data.requestId, 'current:', currentStreamRequestId);
        return;
      }

      if (currentStreamingMessage && data.content) {
        // 追加内容到流式消息
        appendStreamingContent(currentStreamingMessage.contentDiv, data.content);
        // 累积完整内容用于最终格式化
        currentStreamingMessage.fullContent += data.content;
      }

      if (data.done) {
        // 流式完成，重新格式化内容
        console.log('[Stream] Streaming complete, finalizing...');
        completeStreamingMessage(currentStreamingMessage);
        currentStreamingMessage = null;
        currentStreamRequestId = null;  // 清空 requestId
      }
    });

    hitlCallbackRegistered = true;
    console.log('[HITL] Response callback registered');
  }

  // 自动批准全部按钮
  const autoApproveBtn = document.getElementById('auto-approve-btn');
  if (autoApproveBtn) {
    autoApproveBtn.addEventListener('click', async () => {
      console.log('[HITL] Auto-approve all mode enabled');
      autoApproveAll = true;

      // 更新按钮状态
      autoApproveBtn.textContent = '✓ 已开启自动批准';
      autoApproveBtn.disabled = true;

      // 批准当前工具
      await handleToolDecision('approve');

      // 显示自动批准状态提示
      addOperationLog('🤖 已开启自动批准模式，后续工具将自动批准');
    });
  }

  // 批准按钮
  const approveBtn = document.getElementById('approve-tool-btn');
  if (approveBtn) {
    approveBtn.addEventListener('click', async () => {
      await handleToolDecision('approve');
    });
  }

  // 拒绝按钮
  const rejectBtn = document.getElementById('reject-tool-btn');
  if (rejectBtn) {
    rejectBtn.addEventListener('click', async () => {
      await handleToolDecision('reject');
    });
  }

  console.log('[HITL] Setup complete');
}

function showToolApprovalDialog(data) {
  console.log('[HITL] showToolApprovalDialog called with:', data);
  console.log('[HITL] autoApproveAll:', autoApproveAll);

  // 检查是否处理过此 tool_call_id (防止重复弹窗)
  const toolCallId = data.data?.tool_call_id;
  if (toolCallId && processedToolCallIds.has(toolCallId)) {
    console.log('[HITL] Already processed tool call ID, ignoring duplicate:', toolCallId);
    return;
  }

  // 检查是否开启自动批准模式
  if (autoApproveAll) {
    console.log('[HITL] Auto-approve mode enabled, automatically approving:', data.request_id);

    const toolName = data.data.tool_name || 'unknown';
    const toolInput = data.data.tool_input || {};
    const agentThinking = data.data.agent_thinking || '';
    const toolCallId = data.data.tool_call_id;

    // 保存工具信息
    currentToolInfo = { toolName, toolInput, toolCallId };
    currentRequestId = data.request_id;

    // 显示 Agent 思考内容
    if (agentThinking && agentThinking.trim()) {
      addOperationLog(`💭 Agent 思考:\n${agentThinking.trim()}`);
    }

    // 自动批准并添加日志
    const inputSummary = formatToolInput(toolName, toolInput);
    addOperationLog(`🤖 自动批准: ${toolName}\n${inputSummary}`);

    // 直接发送批准
    handleToolDecision('approve');
    return;
  }

  // 检查是否已经在处理相同的请求
  if (currentRequestId === data.request_id) {
    console.log('[HITL] Already processing this request, ignoring duplicate');
    return;
  }

  // 立即更新 currentRequestId 防止重复处理
  currentRequestId = data.request_id;
  console.log('[HITL] Processing request:', currentRequestId);

  // 隐藏当前对话框（如果已显示）
  const dialog = document.getElementById('tool-approval-dialog');
  dialog.style.display = 'none';

  // 等待一下确保 DOM 更新
  setTimeout(() => {
    // currentRequestId 已经在外面更新了，这里不需要再次更新
    // currentRequestId = data.request_id; 
    
    const toolName = data.data.tool_name || 'unknown';
    const toolInput = data.data.tool_input || {};
    const agentThinking = data.data.agent_thinking || '';
    const toolCallId = data.data.tool_call_id;

    // 保存工具信息用于后续日志显示
    currentToolInfo = { toolName, toolInput, toolCallId };

    // 更新对话框内容
    document.getElementById('tool-name-display').textContent = toolName;
    document.getElementById('tool-input-display').textContent = JSON.stringify(toolInput, null, 2);

    // 显示对话框
    console.log('[HITL] Setting dialog display to flex');
    dialog.style.display = 'flex';
    console.log('[HITL] Dialog display style:', dialog.style.display);
    console.log('[HITL] Dialog visibility:', dialog.offsetParent !== null);

    // Windows: 对话框显示时，禁用输入框自动焦点，防止抢占焦点
    if (window.inputFocusPaused === undefined) {
      window.inputFocusPaused = false;
    }
    window.inputFocusPaused = true;
    console.log('[HITL] Paused input focus management for dialog');

    // 将焦点设置到批准按钮
    setTimeout(() => {
      const approveBtn = document.getElementById('approve-tool-btn');
      if (approveBtn) {
        approveBtn.focus();
        console.log('[HITL] Focus set to approve button');
      }
    }, 100);

    // 如果有 Agent 思考内容，先显示思考
    if (agentThinking && agentThinking.trim()) {
      addOperationLog(`💭 Agent 思考:\n${agentThinking.trim()}`);
    }

    // 添加待批准日志（包含工具详情）
    const inputSummary = formatToolInput(toolName, toolInput);
    addOperationLog(`🔔 等待批准: ${toolName}\n${inputSummary}`);
  }, 50);
}

// 格式化工具输入为简洁的摘要
function formatToolInput(toolName, toolInput) {
  if (Object.keys(toolInput).length === 0) {
    return '(无参数)';
  }

  switch (toolName) {
    case 'write_file':
      return `文件: ${toolInput.file_path || '(未知路径)'}`;
    case 'read_file':
      return `文件: ${toolInput.file_path || '(未知路径)'}`;
    case 'shell':
      return `命令: ${toolInput.command || '(未知命令)'}`;
    case 'ls':
      return `路径: ${toolInput.path || '(当前目录)'}`;
    case 'grep':
      return `搜索: ${toolInput.pattern || '(未知模式)'} 在 ${toolInput.path || '(未知路径)'}`;
    case 'task':
      return `子代理: ${toolInput.subagent_type || 'general-purpose'}`;
    default:
      // 对于其他工具，显示前两个参数
      const entries = Object.entries(toolInput).slice(0, 2);
      return entries.map(([k, v]) => {
        const vStr = JSON.stringify(v);
        // Handle undefined/null values
        if (vStr === undefined || vStr === null) {
          return `${k}: (null)`;
        }
        // Safe slice
        return `${k}: ${vStr.slice(0, 50)}${vStr.length > 50 ? '...' : ''}`;
      }).join(', ');
  }
}

async function handleToolDecision(action) {
  console.log('[HITL] User decision:', action, 'for request:', currentRequestId);

  // 防止重复提交
  if (isProcessingDecision) {
    console.log('[HITL] Already processing a decision, ignoring');
    return;
  }

  if (!currentRequestId) {
    console.error('[HITL] No request ID to respond to');
    alert('错误：没有待批准的操作');
    return;
  }

  isProcessingDecision = true;
  const requestIdToSend = currentRequestId;

  // 隐藏对话框
  const dialog = document.getElementById('tool-approval-dialog');
  dialog.style.display = 'none';

  // 恢复输入框焦点管理
  window.inputFocusPaused = false;
  console.log('[HITL] Resumed input focus management after dialog close');

  // 保持 currentRequestId 直到请求完成，以防止处理重复的事件
  // currentRequestId = null;

  // 获取工具信息用于显示记录
  const actionText = action === 'approve' ? '✅ 已批准' : '❌ 已拒绝';
  let logMessage = '';

  if (currentToolInfo) {
    const inputSummary = formatToolInput(currentToolInfo.toolName, currentToolInfo.toolInput);
    logMessage = `${actionText}: ${currentToolInfo.toolName}\n${inputSummary}`;
    
    // 记录已处理的 ID
    if (currentToolInfo.toolCallId) {
      processedToolCallIds.add(currentToolInfo.toolCallId);
      console.log('[HITL] Added processed tool call ID:', currentToolInfo.toolCallId);
    }
    
    currentToolInfo = null;  // 清除保存的工具信息
  } else {
    const toolName = document.getElementById('tool-name-display').textContent;
    logMessage = `${actionText}工具调用: ${toolName}`;
  }

  // 添加操作记录到聊天界面
  addOperationLog(logMessage);

  try {
    console.log('[HITL] Sending approval:', requestIdToSend, action);
    // 发送用户决定到后端
    await window.deepagents.sendToolApproval(requestIdToSend, action);
    console.log('[HITL] Approval sent successfully');
    
    // 成功后清除 ID
    currentRequestId = null;
  } catch (error) {
    console.error('[HITL] Failed to send decision:', error);
    alert('操作失败: ' + error.message);
    // 发送失败时恢复显示对话框，允许用户重试
    const dialog = document.getElementById('tool-approval-dialog');
    dialog.style.display = 'flex';

    // 重新暂停焦点管理并设置焦点到按钮
    window.inputFocusPaused = true;
    setTimeout(() => {
      const approveBtn = document.getElementById('approve-tool-btn');
      if (approveBtn) {
        approveBtn.focus();
      }
    }, 100);
  } finally {
    // 无论成功或失败，都重置处理标志
    isProcessingDecision = false;
  }
}

// === 配置状态检测 ===

// 检查配置状态
async function checkConfigStatus() {
  try {
    const status = await window.deepagents.checkConfigStatus();
    return status;
  } catch (error) {
    console.error('[Config] Failed to check config status:', error);
    return { has_config: false, providers: { openai: false, anthropic: false, google: false } };
  }
}

// 显示首次启动向导
function showFirstLaunchWizard() {
  const dialog = document.getElementById('config-dialog');
  const title = dialog.querySelector('h3');
  const cancelBtn = document.getElementById('cancel-config-btn');

  // 修改标题和样式
  title.textContent = '欢迎使用 Cowork - 请配置 API Key';
  cancelBtn.style.display = 'none'; // 隐藏取消按钮

  // 添加首次启动提示（插入到表单前面）
  const hint = document.createElement('div');
  hint.id = 'first-launch-hint';
  hint.style.cssText = 'background: #e3f2fd; color: #1565c0; padding: 12px; border-radius: 6px; margin-bottom: 16px;';
  hint.innerHTML = `
    <p><strong>欢迎使用 Cowork！</strong></p>
    <p>请选择一个 API 提供商并配置您的 API Key 以开始使用：</p>
    <ul style="margin: 8px 0; padding-left: 20px;">
      <li>OpenAI: 支持 GPT-4、GPT-3.5 等模型</li>
      <li>Anthropic: 支持 Claude 系列模型</li>
      <li>Google: 支持 Gemini 系列模型</li>
    </ul>
  `;
  const form = document.getElementById('config-form');
  form.insertBefore(hint, form.firstChild);

  // 显示对话框
  dialog.style.display = 'flex';
}

// === 配置菜单 ===

// 打开配置对话框
async function openConfigDialog() {
  const dialog = document.getElementById('config-dialog');
  const statusDiv = document.getElementById('config-status');

  try {
    console.log('[Config] Loading configuration...');
    const config = await window.deepagents.getConfig();

    // 填充表单
    document.getElementById('openai-api-key').value = config.openai_api_key || '';
    document.getElementById('openai-model').value = config.openai_model || 'gpt-4o-mini';
    document.getElementById('openai-base-url').value = config.openai_base_url || '';
    document.getElementById('tavily-api-key').value = config.tavily_api_key || '';
    document.getElementById('http-proxy').value = config.http_proxy || '';
    document.getElementById('https-proxy').value = config.https_proxy || '';
    document.getElementById('no-proxy').value = config.no_proxy || '';
    document.getElementById('skillslm-url').value = config.skillslm_url || '';

    // 应用 SkillsLM URL 配置
    applySkillsLMUrl(config.skillslm_url);

    // 隐藏状态消息
    statusDiv.style.display = 'none';

    // 显示对话框
    dialog.style.display = 'flex';
    console.log('[Config] Configuration loaded successfully');
  } catch (error) {
    console.error('[Config] Failed to load configuration:', error);
    showConfigStatus('加载配置失败: ' + error.message, 'error');
  }
}

// 关闭配置对话框
function closeConfigDialog() {
  const dialog = document.getElementById('config-dialog');
  dialog.style.display = 'none';
}

// 应用 SkillsLM URL 配置
function applySkillsLMUrl(url) {
  const iframe = document.getElementById('skillslm-webview');
  if (!iframe) {
    console.error('[SkillsLM] iframe not found!');
    return;
  }

  // 如果配置了 URL，使用配置的值；否则使用默认值
  const skillsLMUrl = url && url.trim() !== '' ? url.trim() : 'http://172.32.153.184:29999/skillers';
  iframe.src = skillsLMUrl;
  console.log('[SkillsLM] Applied URL:', skillsLMUrl);

  // 添加加载事件监听用于调试
  iframe.onerror = (event) => {
    console.error('[SkillsLM] iframe load error:', event);
  };
  iframe.onload = () => {
    console.log('[SkillsLM] iframe loaded successfully');
  };
}

// 显示状态消息
function showConfigStatus(message, type = 'info') {
  const statusDiv = document.getElementById('config-status');
  statusDiv.textContent = message;
  statusDiv.style.display = 'block';

  // 设置样式
  if (type === 'success') {
    statusDiv.style.background = '#d4edda';
    statusDiv.style.color = '#155724';
  } else if (type === 'error') {
    statusDiv.style.background = '#f8d7da';
    statusDiv.style.color = '#721c24';
  } else {
    statusDiv.style.background = '#d1ecf1';
    statusDiv.style.color = '#0c5460';
  }

  // 3秒后自动隐藏（成功消息）
  if (type === 'success') {
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  }
}

// 保存配置
async function saveConfig(event) {
  event.preventDefault();

  const statusDiv = document.getElementById('config-status');

  try {
    console.log('[Config] Saving configuration...');

    // 收集表单数据（后端会自动处理脱敏值的恢复）
    const newConfig = {
      openai_api_key: document.getElementById('openai-api-key').value,
      openai_model: document.getElementById('openai-model').value || 'gpt-4o-mini',
      openai_base_url: document.getElementById('openai-base-url').value,
      tavily_api_key: document.getElementById('tavily-api-key').value,
      http_proxy: document.getElementById('http-proxy').value,
      https_proxy: document.getElementById('https-proxy').value,
      no_proxy: document.getElementById('no-proxy').value,
      skillslm_url: document.getElementById('skillslm-url').value
    };

    // 保存配置（后端会自动恢复脱敏的 API 密钥）
    await window.deepagents.setConfig(newConfig);

    // 移除首次启动提示（如果存在）
    const hint = document.getElementById('first-launch-hint');
    if (hint) hint.remove();

    console.log('[Config] Configuration saved successfully');
    showConfigStatus('配置已保存', 'success');

    // 应用 SkillsLM URL 更新
    applySkillsLMUrl(newConfig.skillslm_url);

    // 1.5秒后关闭对话框
    setTimeout(() => {
      closeConfigDialog();

      // 如果是首次启动，重新初始化应用
      if (!window.appInitialized) {
        window.appInitialized = true;
        console.log('[Config] First launch setup complete, initializing app...');
        setupTabs();
        loadConversations();
        setupAddSkillButton();
        setupGithubImportButton();
        setupHITL();
        setupWorkspaceManager();
        initConfigMenu();

        // 设置消息发送事件监听器
        sendBtn.addEventListener('click', sendMessage);
        input.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') sendMessage();
        });

        console.log('[INIT] App initialized after first launch setup');
      }
    }, 1500);

  } catch (error) {
    console.error('[Config] Failed to save configuration:', error);
    showConfigStatus('保存失败: ' + error.message, 'error');
  }
}

// 初始化配置菜单
function initConfigMenu() {
  console.log('[Config] Initializing configuration menu...');

  // 设置按钮点击事件
  const settingsBtn = document.getElementById('settings-btn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', openConfigDialog);
    console.log('[Config] Settings button event registered');
  } else {
    console.error('[Config] Settings button not found!');
  }

  // 关闭按钮
  const closeBtn = document.getElementById('close-config-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeConfigDialog);
  }

  // 取消按钮
  const cancelBtn = document.getElementById('cancel-config-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeConfigDialog);
  }

  // 表单提交
  const form = document.getElementById('config-form');
  if (form) {
    form.addEventListener('submit', saveConfig);
  }

  // 点击对话框外部关闭
  const dialog = document.getElementById('config-dialog');
  if (dialog) {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) {
        closeConfigDialog();
      }
    });
  }

  console.log('[Config] Configuration menu initialized');
}

// === 工作空间管理 ===
let workspaces = [];
let currentWorkspaceId = null;

// WorkspaceMention 实例
let workspaceMention = null;

// 初始化 WorkspaceMention
function initWorkspaceMention() {
  workspaceMention = new WorkspaceMention(
    workspaces,
    currentWorkspaceId,
    (workspace) => {
      // 选择工作空间回调
      handleWorkspaceMentionSelect(workspace);
    }
  );
}

// 处理工作空间选择
function handleWorkspaceMentionSelect(workspace) {
  // 复用现有切换函数
  switchWorkspace(workspace.id);

  // UI 闪烁提示
  const selector = document.getElementById('workspace-selector');
  if (selector) {
    selector.classList.add('flash');
    setTimeout(() => selector.classList.remove('flash'), 500);
  }

  console.log('[WorkspaceMention] Switched to:', workspace.name);
}

// 图标映射
const workspaceIcons = {
  'folder': '📁',
  'code': '💻',
  'book': '📚',
  'briefcase': '💼',
  'lightbulb': '💡'
};

function setupWorkspaceManager() {
  // 防止重复初始化
  if (window.workspaceManagerInitialized) {
    console.log('[Workspace] Already initialized, skipping...');
    return;
  }
  window.workspaceManagerInitialized = true;

  console.log('[Workspace] Initializing workspace manager...');

  // 工作空间选择器按钮
  const workspaceSelector = document.getElementById('workspace-selector');
  const workspaceSettingsBtn = document.getElementById('workspace-settings-btn');
  const workspaceMenu = document.getElementById('workspace-menu');

  if (workspaceSelector) {
    // 切换下拉菜单
    workspaceSelector.addEventListener('click', (e) => {
      e.stopPropagation();
      workspaceMenu.classList.toggle('show');
      loadWorkspacesList();
    });

    // 点击其他地方关闭菜单
    document.addEventListener('click', () => {
      workspaceMenu.classList.remove('show');
    });

    // 阻止菜单内部点击关闭
    workspaceMenu.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  // 设置按钮
  if (workspaceSettingsBtn) {
    workspaceSettingsBtn.addEventListener('click', () => {
      showWorkspaceSettings();
    });
  }

  // 创建工作空间对话框
  setupCreateWorkspaceDialog();

  // 工作空间设置对话框
  setupWorkspaceSettingsDialog();

  // 加载工作空间列表
  loadWorkspaces().then(() => {
    // 初始加载工作空间列表到菜单
    loadWorkspacesList();

    // 初始化 WorkspaceMention (在 workspaces 加载完成后)
    initWorkspaceMention();

    // 设置输入框 @工作空间 监听
    setupWorkspaceMentionInput();
  });

  console.log('[Workspace] Workspace manager initialized');
}

// === 主题对话框 ===

function setupThemeDialog() {
  console.log('[Theme] Initializing theme dialog...');

  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const themeDialog = document.getElementById('theme-dialog');
  const closeThemeDialogBtn = document.getElementById('close-theme-dialog');

  if (!themeToggleBtn || !themeDialog || !closeThemeDialogBtn) {
    console.error('[Theme] Required elements not found');
    return;
  }

  // 打开主题对话框
  themeToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    themeDialog.style.display = 'block';
    updateThemeDialogState();
  });

  // 关闭主题对话框
  closeThemeDialogBtn.addEventListener('click', () => {
    themeDialog.style.display = 'none';
  });

  // 点击对话框外部关闭
  themeDialog.addEventListener('click', (e) => {
    if (e.target === themeDialog) {
      themeDialog.style.display = 'none';
    }
  });

  // 主题模式按钮
  document.querySelectorAll('.theme-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-mode');
      if (window.themeManager) {
        window.themeManager.setTheme(mode);
        updateThemeDialogState();
      }
    });
  });

  // 强调色按钮
  document.querySelectorAll('.accent-color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const color = btn.getAttribute('data-color');
      if (window.themeManager) {
        window.themeManager.setAccentColor(color);
        updateThemeDialogState();
      }
    });
  });

  console.log('[Theme] Theme dialog initialized');
}

// 更新主题对话框状态
function updateThemeDialogState() {
  if (!window.themeManager) return;

  const currentTheme = window.themeManager.currentTheme;
  const currentAccent = window.themeManager.accentColor;

  // 更新主题模式按钮状态
  document.querySelectorAll('.theme-mode-btn').forEach(btn => {
    const mode = btn.getAttribute('data-mode');
    if (mode === currentTheme) {
      btn.style.background = 'var(--accent-color)';
      btn.style.color = 'var(--text-inverse)';
    } else {
      btn.style.background = 'var(--bg-secondary)';
      btn.style.color = 'var(--text-primary)';
    }
  });

  // 更新强调色按钮状态
  document.querySelectorAll('.accent-color-btn').forEach(btn => {
    const color = btn.getAttribute('data-color');
    if (color === currentAccent) {
      btn.style.border = '2px solid var(--text-primary)';
      btn.style.boxShadow = '0 0 0 2px var(--accent-color)';
    } else {
      btn.style.border = '2px solid transparent';
      btn.style.boxShadow = 'none';
    }
  });
}

// 加载工作空间列表
async function loadWorkspaces() {
  try {
    const result = await window.deepagents.listWorkspaces();
    workspaces = result.data?.workspaces || [];

    // 获取当前工作空间（从 localStorage）
    const savedWorkspaceId = localStorage.getItem('deepagents-current-workspace');

    if (savedWorkspaceId && workspaces.find(w => w.id === savedWorkspaceId)) {
      currentWorkspaceId = savedWorkspaceId;
    } else if (workspaces.length > 0) {
      currentWorkspaceId = workspaces[0].id;
    }

    updateWorkspaceUI();

    // 更新 WorkspaceMention
    if (workspaceMention) {
      workspaceMention.updateWorkspaces(workspaces, currentWorkspaceId);
    }

    // 加载当前工作空间的对话列表
    if (currentWorkspaceId) {
      await loadWorkspaceConversations(currentWorkspaceId);
    }

    console.log('[Workspace] Loaded workspaces:', workspaces.length, 'current:', currentWorkspaceId);
  } catch (error) {
    console.error('[Workspace] Failed to load workspaces:', error);
  }
}

// 更新工作空间 UI
function updateWorkspaceUI() {
  const workspaceSelector = document.getElementById('workspace-selector');
  const currentWorkspace = workspaces.find(w => w.id === currentWorkspaceId);

  if (workspaceSelector && currentWorkspace) {
    const icon = workspaceIcons[currentWorkspace.icon] || '📁';
    workspaceSelector.textContent = `${icon} ${currentWorkspace.name}`;
  }
}

// 加载工作空间列表到下拉菜单
function loadWorkspacesList() {
  const workspaceMenu = document.getElementById('workspace-menu');

  if (!workspaceMenu) return;

  let html = '';

  // 显示所有工作空间
  workspaces.forEach(workspace => {
    const icon = workspaceIcons[workspace.icon] || '📁';
    const isActive = workspace.id === currentWorkspaceId;
    html += `
      <div class="workspace-menu-item ${isActive ? 'active' : ''}" data-workspace-id="${workspace.id}">
        <span class="workspace-icon">${icon}</span>
        <span class="workspace-name">${escapeHtml(workspace.name)}</span>
        <span class="workspace-category">${escapeHtml(workspace.category)}</span>
      </div>
    `;
  });

  // 分隔线
  html += '<div class="workspace-menu-divider"></div>';

  // 创建新工作空间选项
  html += `
    <div class="workspace-menu-action" id="create-workspace-action">
      <span>➕</span>
      <span>创建新工作空间</span>
    </div>
  `;

  workspaceMenu.innerHTML = html;

  // 绑定点击事件
  workspaceMenu.querySelectorAll('.workspace-menu-item').forEach(item => {
    item.addEventListener('click', () => {
      const workspaceId = item.getAttribute('data-workspace-id');
      switchWorkspace(workspaceId);
      workspaceMenu.classList.remove('show');
    });
  });

  // 创建工作空间按钮
  const createAction = document.getElementById('create-workspace-action');
  if (createAction) {
    createAction.addEventListener('click', () => {
      workspaceMenu.classList.remove('show');
      showCreateWorkspaceDialog();
    });
  }
}

// 切换工作空间
async function switchWorkspace(workspaceId) {
  if (workspaceId === currentWorkspaceId) return;

  // 确认切换（如果有未保存的内容）
  if (messagesDiv && messagesDiv.children.length > 0) {
    const confirmed = confirm('切换工作空间将清空当前对话视图，确定要继续吗？');
    if (!confirmed) return;
  }

  console.log('[Workspace] Switching to workspace:', workspaceId);

  currentWorkspaceId = workspaceId;
  localStorage.setItem('deepagents-current-workspace', workspaceId);

  // 清空对话视图
  if (messagesDiv) {
    messagesDiv.innerHTML = '';
  }

  // 重置对话
  currentConversationId = null;

  // 加载该工作空间的对话列表
  await loadWorkspaceConversations(workspaceId);

  // 更新 UI
  updateWorkspaceUI();

  console.log('[Workspace] Switched to workspace:', workspaceId);
}

// 加载工作空间的对话列表
async function loadWorkspaceConversations(workspaceId) {
  try {
    const result = await window.deepagents.listConversations(workspaceId);
    conversations = result.data?.conversations || [];
    console.log('[Conversation] Loaded conversations for workspace:', workspaceId, conversations.length);
    renderHistory();
  } catch (error) {
    console.error('[Conversation] Failed to load conversations:', error);
    conversations = [];
    renderHistory();
  }
}

// 创建工作空间对话框
function setupCreateWorkspaceDialog() {
  const dialog = document.getElementById('create-workspace-dialog');
  const form = document.getElementById('create-workspace-form');
  const cancelBtn = document.getElementById('cancel-create-workspace');
  const browseBtn = document.getElementById('browse-workspace-path');
  const pathInput = document.getElementById('new-workspace-path');

  // 存储选择的路径
  let selectedCustomPath = '';

  // 取消按钮
  cancelBtn.addEventListener('click', () => {
    dialog.style.display = 'none';
    // 重置路径选择
    selectedCustomPath = '';
    pathInput.value = '';
  });

  // 浏览按钮 - 使用 Electron 的 dialog API
  if (browseBtn) {
    browseBtn.addEventListener('click', async () => {
      try {
        // 注意：需要确保 Electron 主进程暴露了 dialog API
        // 如果没有，需要先在 main.js 中添加 ipcMain.handle
        const result = await window.deepagents.selectDirectory();
        if (result && result.canceled === false && result.filePaths && result.filePaths.length > 0) {
          selectedCustomPath = result.filePaths[0];
          pathInput.value = selectedCustomPath;
        }
      } catch (error) {
        console.error('[Workspace] Failed to select directory:', error);
        alert('选择目录失败: ' + error.message);
      }
    });
  }

  // 表单提交
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('new-workspace-name').value.trim();
    const category = document.getElementById('new-workspace-category').value;
    const icon = document.getElementById('new-workspace-icon').value;
    const customPath = pathInput.value.trim();

    if (!name) return;

    try {
      // 生成 ID（使用名称的拼音或简单处理）
      const id = name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-') || `workspace-${Date.now()}`;

      const result = await window.deepagents.createWorkspace({
        id,
        name,
        category,
        icon,
        custom_path: customPath || '',  // 传递自定义路径
        enabled_skills: ['*']
      });

      // 关闭对话框
      dialog.style.display = 'none';

      // 重置路径选择
      selectedCustomPath = '';
      pathInput.value = '';

      // 重新加载工作空间列表
      await loadWorkspaces();

      // 切换到新创建的工作空间
      switchWorkspace(result.data.id);

      alert(`工作空间 "${name}" 创建成功！`);
    } catch (error) {
      console.error('[Workspace] Failed to create workspace:', error);
      alert('创建工作空间失败: ' + error.message);
    }
  });

  // 点击外部关闭
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      dialog.style.display = 'none';
      // 重置路径选择
      selectedCustomPath = '';
      pathInput.value = '';
    }
  });
}

function showCreateWorkspaceDialog() {
  const dialog = document.getElementById('create-workspace-dialog');
  dialog.style.display = 'flex';

  // 重置表单
  document.getElementById('new-workspace-name').value = '';
  document.getElementById('new-workspace-category').value = '通用';
  document.getElementById('new-workspace-icon').value = 'folder';
}

// 工作空间设置对话框
let editingWorkspaceSkills = [];

function setupWorkspaceSettingsDialog() {
  const dialog = document.getElementById('workspace-settings-dialog');
  const closeBtn = document.getElementById('close-workspace-settings');
  const cancelBtn = document.getElementById('cancel-workspace-settings');
  const saveBtn = document.getElementById('save-workspace-settings');
  const deleteBtn = document.getElementById('delete-workspace-btn');

  // 关闭按钮
  closeBtn.addEventListener('click', () => {
    dialog.style.display = 'none';
  });

  cancelBtn.addEventListener('click', () => {
    dialog.style.display = 'none';
  });

  // 保存按钮
  saveBtn.addEventListener('click', async () => {
    try {
      // 保存技能配置
      await window.deepagents.setWorkspaceSkills(currentWorkspaceId, editingWorkspaceSkills);

      // 保存系统提示词
      if (editingSystemPrompt !== undefined) {
        await window.deepagents.updateWorkspace(currentWorkspaceId, {
          system_prompt: editingSystemPrompt
        });
        console.log('[Workspace] Saved system prompt:', editingSystemPrompt.substring(0, 50) + '...');
      }

      dialog.style.display = 'none';
      await loadWorkspaces();
      alert('工作空间设置已保存！');
    } catch (error) {
      console.error('[Workspace] Failed to save settings:', error);
      alert('保存设置失败: ' + error.message);
    }
  });

  // 删除按钮
  deleteBtn.addEventListener('click', async () => {
    if (currentWorkspaceId === 'default') {
      alert('默认工作空间不能删除！');
      return;
    }

    const currentWorkspace = workspaces.find(w => w.id === currentWorkspaceId);
    const confirmed = confirm(`确定要删除工作空间 "${currentWorkspace?.name}" 吗？\n\n文件目录将保留在磁盘上。`);
    if (!confirmed) return;

    try {
      await window.deepagents.deleteWorkspace(currentWorkspaceId);
      dialog.style.display = 'none';

      // 重新加载工作空间列表
      await loadWorkspaces();

      // 切换到默认工作空间
      switchWorkspace('default');

      alert('工作空间已删除！');
    } catch (error) {
      console.error('[Workspace] Failed to delete workspace:', error);
      alert('删除工作空间失败: ' + error.message);
    }
  });

  // 点击外部关闭
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      dialog.style.display = 'none';
    }
  });

  // === 系统提示词配置 ===
  setupPromptConfigUI();
}

// 渲染工作空间设置中的技能列表
function renderWorkspaceSkillsList(container, allSkills, enabledSkills) {
  const allEnabled = enabledSkills.includes('*');

  // 根据过滤器筛选技能
  const filteredSkills = allSkills.filter(skill => {
    const isEnabled = allEnabled || enabledSkills.includes(skill.dir_name);
    return workspaceSkillFilter === 'enabled' ? isEnabled : !isEnabled;
  });

  let html = '';

  // Segmented Control 过滤器
  html += `
    <div class="ws-skill-filter-tabs">
      <button class="ws-skill-filter-tab ${workspaceSkillFilter === 'enabled' ? 'active' : ''}" data-filter="enabled">
        已启用 <span style="opacity: 0.6;">(${allSkills.filter(s => allEnabled || enabledSkills.includes(s.dir_name)).length})</span>
      </button>
      <button class="ws-skill-filter-tab ${workspaceSkillFilter === 'disabled' ? 'active' : ''}" data-filter="disabled">
        未启用 <span style="opacity: 0.6;">(${allSkills.filter(s => !(allEnabled || enabledSkills.includes(s.dir_name))).length})</span>
      </button>
    </div>
  `;

  // 技能列表
  if (filteredSkills.length === 0) {
    const emptyText = workspaceSkillFilter === 'enabled' ? '暂无已启用技能' : '暂无未启用技能';
    html += `<div class="ws-skills-empty">${emptyText}</div>`;
  } else {
    html += '<div style="max-height: 200px; overflow-y: auto;">';

    filteredSkills.forEach(skill => {
      const isEnabled = allEnabled || enabledSkills.includes(skill.dir_name);

      html += `
        <div class="ws-skill-item">
          <div class="ws-skill-info">
            <div class="ws-skill-name">${escapeHtml(skill.name)}</div>
            <div class="ws-skill-description">${escapeHtml(skill.description)}</div>
          </div>
          <button class="ws-skill-toggle-switch ${isEnabled ? 'enabled' : ''}" data-skill-id="${skill.dir_name}"></button>
        </div>
      `;
    });

    html += '</div>';
  }

  container.innerHTML = html;

  // 绑定过滤器切换事件
  const filterTabs = container.querySelectorAll('.ws-skill-filter-tab');
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      workspaceSkillFilter = tab.dataset.filter;
      renderWorkspaceSkillsList(container, allSkills, enabledSkills);
    });
  });

  // 绑定开关切换事件
  const toggleSwitches = container.querySelectorAll('.ws-skill-toggle-switch');
  toggleSwitches.forEach(sw => {
    sw.addEventListener('click', () => {
      const skillId = sw.getAttribute('data-skill-id');
      toggleWorkspaceSkill(skillId, allSkills);
    });
  });
}

// 切换工作空间技能启用状态
function toggleWorkspaceSkill(skillId, allSkills) {
  const allEnabled = editingWorkspaceSkills.includes('*');

  if (allEnabled) {
    // 从全启用切换到部分禁用：转换为具体列表，排除当前技能
    editingWorkspaceSkills = allSkills
      .map(s => s.dir_name)
      .filter(id => id !== skillId);
  } else {
    // 普通列表模式
    const isEnabled = editingWorkspaceSkills.includes(skillId);
    if (isEnabled) {
      // 禁用
      editingWorkspaceSkills = editingWorkspaceSkills.filter(id => id !== skillId);
      // 如果全部禁空，保持空数组
    } else {
      // 启用
      editingWorkspaceSkills.push(skillId);
      // 如果全部启用，转换为 '*'
      if (editingWorkspaceSkills.length === allSkills.length) {
        editingWorkspaceSkills = ['*'];
      }
    }
  }

  // 重新渲染技能列表
  const skillsListDiv = document.getElementById('workspace-skills-list');
  renderWorkspaceSkillsList(skillsListDiv, allSkills, editingWorkspaceSkills);
}

async function showWorkspaceSettings() {
  // 重置技能过滤状态为"已启用"
  workspaceSkillFilter = 'enabled';

  const dialog = document.getElementById('workspace-settings-dialog');
  const currentWorkspace = workspaces.find(w => w.id === currentWorkspaceId);

  if (!currentWorkspace) {
    alert('请先选择一个工作空间');
    return;
  }

  // 更新当前工作空间信息
  document.getElementById('current-workspace-name').textContent = currentWorkspace.name;
  document.getElementById('current-workspace-category').textContent = currentWorkspace.category;

  // 加载当前系统提示词
  editingSystemPrompt = currentWorkspace.system_prompt || '';
  updatePromptPreview();

  // 重置提示词配置模式
  switchPromptMode('template');

  // 加载技能列表
  const skillsListDiv = document.getElementById('workspace-skills-list');
  skillsListDiv.innerHTML = '<div style="text-align: center; color: #86868b; font-size: 12px; padding: 20px;">加载技能列表中...</div>';

  try {
    // 获取所有可用技能
    const skillsResult = await window.deepagents.listSkills();
    const allSkills = skillsResult.data?.skills || skillsResult.skills || [];

    // 获取当前工作空间启用的技能
    editingWorkspaceSkills = currentWorkspace.enabled_skills || ['*'];

    // 渲染技能选择列表
    if (allSkills.length === 0) {
      skillsListDiv.innerHTML = '<div class="ws-skills-empty">暂无可用技能</div>';
    } else {
      // 渲染过滤器和技能列表
      renderWorkspaceSkillsList(skillsListDiv, allSkills, editingWorkspaceSkills);
    }

    dialog.style.display = 'flex';
  } catch (error) {
    console.error('[Workspace] Failed to load skills:', error);
    skillsListDiv.innerHTML = '<div style="text-align: center; color: #ff3b30; font-size: 12px; padding: 20px;">加载技能列表失败</div>';
    dialog.style.display = 'flex';
  }
}

// === 系统提示词配置 ===
let editingSystemPrompt = '';
let promptTemplates = [];
let currentPromptMode = 'template'; // 'template', 'generate', 'custom'

// 初始化系统提示词配置 UI
function setupPromptConfigUI() {
  // 模式切换按钮
  const templateBtn = document.getElementById('prompt-mode-template');
  const generateBtn = document.getElementById('prompt-mode-generate');
  const customBtn = document.getElementById('prompt-mode-custom');

  templateBtn.addEventListener('click', () => switchPromptMode('template'));
  generateBtn.addEventListener('click', () => switchPromptMode('generate'));
  customBtn.addEventListener('click', () => switchPromptMode('custom'));

  // 模板选择
  const templateSelect = document.getElementById('prompt-template-select');
  templateSelect.addEventListener('change', (e) => {
    const templateId = e.target.value;
    const template = promptTemplates.find(t => t.id === templateId);
    if (template) {
      editingSystemPrompt = template.prompt;
      updatePromptPreview();
      document.getElementById('template-preview').innerHTML = escapeHtml(template.prompt.replace(/\n/g, '<br>'));
    }
  });

  // AI 生成按钮
  const generateBtnAction = document.getElementById('generate-prompt-btn');
  generateBtnAction.addEventListener('click', generatePromptWithAI);

  // 自定义文本框
  const customTextarea = document.getElementById('custom-prompt-textarea');
  customTextarea.addEventListener('input', (e) => {
    editingSystemPrompt = e.target.value;
    updatePromptPreview();
  });

  // 默认显示模板模式
  switchPromptMode('template');
}

// 切换提示词配置模式
function switchPromptMode(mode) {
  currentPromptMode = mode;

  // 隐藏所有模式
  document.getElementById('prompt-template-mode').style.display = 'none';
  document.getElementById('prompt-generate-mode').style.display = 'none';
  document.getElementById('prompt-custom-mode').style.display = 'none';

  // 重置按钮样式
  document.querySelectorAll('.prompt-mode-btn').forEach(btn => {
    btn.style.background = '#ffffff';
    btn.style.color = '#1d1d1f';
    btn.style.border = '1px solid #d2d2d7';
  });

  // 显示选中的模式
  if (mode === 'template') {
    document.getElementById('prompt-template-mode').style.display = 'block';
    document.getElementById('prompt-mode-template').style.background = '#007aff';
    document.getElementById('prompt-mode-template').style.color = '#ffffff';
    document.getElementById('prompt-mode-template').style.border = '1px solid #007aff';
    loadPromptTemplates();
  } else if (mode === 'generate') {
    document.getElementById('prompt-generate-mode').style.display = 'block';
    document.getElementById('prompt-mode-generate').style.background = '#007aff';
    document.getElementById('prompt-mode-generate').style.color = '#ffffff';
    document.getElementById('prompt-mode-generate').style.border = '1px solid #007aff';
  } else if (mode === 'custom') {
    document.getElementById('prompt-custom-mode').style.display = 'block';
    document.getElementById('prompt-mode-custom').style.background = '#007aff';
    document.getElementById('prompt-mode-custom').style.color = '#ffffff';
    document.getElementById('prompt-mode-custom').style.border = '1px solid #007aff';
    document.getElementById('custom-prompt-textarea').value = editingSystemPrompt;
  }
}

// 加载提示词模板
async function loadPromptTemplates() {
  try {
    const result = await window.deepagents.listPromptTemplates();
    promptTemplates = result.data?.templates || [];

    const select = document.getElementById('prompt-template-select');
    select.innerHTML = '<option value="">选择一个模板...</option>';

    promptTemplates.forEach(template => {
      const option = document.createElement('option');
      option.value = template.id;
      option.textContent = template.name;
      select.appendChild(option);
    });

    console.log('[Prompt] Loaded templates:', promptTemplates.length);
  } catch (error) {
    console.error('[Prompt] Failed to load templates:', error);
  }
}

// AI 生成提示词
async function generatePromptWithAI() {
  const currentWorkspace = workspaces.find(w => w.id === currentWorkspaceId);
  const nameInput = document.getElementById('generate-prompt-name');
  const categoryInput = document.getElementById('generate-prompt-category');
  const descInput = document.getElementById('generate-prompt-description');
  const resultDiv = document.getElementById('generated-prompt-result');
  const generateBtn = document.getElementById('generate-prompt-btn');

  const name = nameInput.value.trim() || currentWorkspace?.name || '';
  const category = categoryInput.value.trim() || currentWorkspace?.category || '通用';
  const description = descInput.value.trim();

  if (!name) {
    alert('请输入工作空间用途');
    return;
  }

  // 显示加载状态
  generateBtn.disabled = true;
  generateBtn.textContent = '🔄 生成中...';
  resultDiv.style.display = 'block';
  resultDiv.innerHTML = '<span style="color: #86868b;">正在生成提示词，请稍候...</span>';

  try {
    const result = await window.deepagents.generateWorkspacePrompt(name, category, description);
    const generatedPrompt = result.data?.prompt || '';

    if (generatedPrompt) {
      editingSystemPrompt = generatedPrompt;
      updatePromptPreview();
      resultDiv.innerHTML = escapeHtml(generatedPrompt.replace(/\n/g, '<br>'));
      console.log('[Prompt] Generated prompt:', generatedPrompt.substring(0, 50) + '...');
    } else {
      resultDiv.innerHTML = '<span style="color: #ff3b30;">生成失败，请重试</span>';
    }
  } catch (error) {
    console.error('[Prompt] Failed to generate:', error);
    resultDiv.innerHTML = '<span style="color: #ff3b30;">生成失败: ' + error.message + '</span>';
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = '🤖 生成提示词';
  }
}

// 更新提示词预览
function updatePromptPreview() {
  const previewDiv = document.getElementById('current-prompt-text');
  if (editingSystemPrompt && editingSystemPrompt.trim()) {
    previewDiv.textContent = editingSystemPrompt;
    previewDiv.parentElement.style.display = 'block';
  } else {
    previewDiv.textContent = '使用默认提示词';
  }
}

// 在 DOM 加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initConfigMenu);
} else {
  initConfigMenu();
}
