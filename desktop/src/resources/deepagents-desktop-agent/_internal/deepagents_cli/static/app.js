// WebSocket connection
const events = document.getElementById('events');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('btn-send');
const status = document.getElementById('status');
const hitlDialog = document.getElementById('hitl-dialog');
const sessionList = document.getElementById('session-list');
const sessionTitle = document.getElementById('session-title');
const btnNewChat = document.getElementById('btn-new-chat');
const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
const btnVscodeLocal = document.getElementById('btn-vscode-local');
const btnSandboxVscode = document.getElementById('btn-sandbox-vscode');
const sidebar = document.querySelector('.sidebar');

let currentDecisionId = null;
let wsSessionId = null;  // WebSocket session ID from server

// Track current message element for streaming
let currentMessageDiv = null;
let currentMessageContent = '';

// Smart scrolling management
let shouldAutoScroll = true;
let isUserScrolling = false;
let scrollTimeout = null;

// Session management for chat history
const SESSIONS_KEY = 'deepagents_sessions';
const CURRENT_SESSION_KEY = 'deepagents_current_session';
const WS_SESSION_ID_KEY = 'deepagents_ws_session_id';  // Persistent WebSocket session ID

let sessions = JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]');
let currentSessionId = localStorage.getItem(CURRENT_SESSION_KEY) || null;

// Reconnection management
let reconnectAttempts = 0;
let maxReconnectAttempts = 5;
let reconnectDelay = 3000;
let ws = null;

// Create WebSocket connection
function createWebSocket() {
    ws = new WebSocket(`ws://${location.host}/ws/chat`);

    // Connection state management
    ws.onopen = () => {
        // Send persistent session ID if exists
        const persistentSessionId = localStorage.getItem(WS_SESSION_ID_KEY);
        if (persistentSessionId) {
            ws.send(JSON.stringify({
                type: 'init',
                session_id: persistentSessionId
            }));
        }

        status.textContent = '已连接';
        status.className = 'connected';
        reconnectAttempts = 0;
        console.log('WebSocket connected');
    };

    ws.onclose = () => {
        status.textContent = '已断开';
        status.className = 'disconnected';

        // Try to reconnect
        if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            const delay = reconnectDelay * reconnectAttempts;
            console.log(`Reconnecting in ${delay}ms... (attempt ${reconnectAttempts}/${maxReconnectAttempts})`);
            status.textContent = `重连中... (${reconnectAttempts}/${maxReconnectAttempts})`;

            setTimeout(() => {
                if (ws.readyState === WebSocket.CLOSED) {
                    createWebSocket();
                }
            }, delay);
        } else {
            status.textContent = '连接失败';
            showError('无法连接到服务器，请刷新页面重试');
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        status.textContent = '连接错误';
        status.className = 'disconnected';
    };

    // Message handling
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        renderEvent(data);
    };
}

// Get current session
function getCurrentSession() {
    if (!currentSessionId) return null;
    return sessions.find(s => s.id === currentSessionId);
}

// Save event to current session
function saveToHistory(event) {
    let session = getCurrentSession();

    // Create new session if none exists
    if (!session) {
        currentSessionId = Date.now().toString();
        session = {
            id: currentSessionId,
            title: '新对话',
            created: Date.now(),
            updated: Date.now(),
            events: []
        };
        sessions.unshift(session);
    }

    // Add event to session
    session.events.push({
        ...event,
        timestamp: Date.now()
    });

    // Update session title based on first user message
    if (event.type === 'user_message' && session.title === '新对话') {
        session.title = event.data.content.slice(0, 30) + (event.data.content.length > 30 ? '...' : '');
    }

    session.updated = Date.now();

    // Keep only last 1000 events per session
    if (session.events.length > 1000) {
        session.events = session.events.slice(-1000);
    }

    // Sort sessions by updated time
    sessions.sort((a, b) => b.updated - a.updated);

    // Save to localStorage
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    localStorage.setItem(CURRENT_SESSION_KEY, currentSessionId);

    // Render session list
    renderSessionList();
}

// Load session events
function loadSession(sessionId) {
    currentSessionId = sessionId;
    localStorage.setItem(CURRENT_SESSION_KEY, sessionId);

    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    // Clear current events
    events.innerHTML = '';

    // Disable auto-scroll while loading history
    shouldAutoScroll = false;

    // Render session events
    session.events.forEach(event => {
        renderEvent(event, false);
    });

    // Re-enable auto-scroll and scroll to bottom
    shouldAutoScroll = true;
    isUserScrolling = false;

    if (session.events.length > 0) {
        events.scrollTop = events.scrollHeight;
    }

    // Update title
    sessionTitle.textContent = session.title;

    // Re-render session list to update active state
    renderSessionList();
}

// Create new session
function createNewSession() {
    currentSessionId = null;
    events.innerHTML = '';
    sessionTitle.textContent = '新对话';
    renderSessionList();
    localStorage.removeItem(CURRENT_SESSION_KEY);
    userInput.focus();
}

// Delete session
function deleteSession(sessionId, event) {
    event.stopPropagation();

    if (!confirm('确定要删除这个对话吗？')) return;

    sessions = sessions.filter(s => s.id !== sessionId);
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));

    // If deleted current session, create new one
    if (currentSessionId === sessionId) {
        createNewSession();
    } else {
        renderSessionList();
    }
}

// Render session list
function renderSessionList() {
    sessionList.innerHTML = '';

    if (sessions.length === 0) {
        sessionList.innerHTML = '<div style="padding: 1rem; text-align: center; opacity: 0.5;">暂无历史对话</div>';
        return;
    }

    sessions.forEach(session => {
        const div = document.createElement('div');
        div.className = `session-item ${session.id === currentSessionId ? 'active' : ''}`;
        div.onclick = () => loadSession(session.id);

        const date = new Date(session.updated);
        const timeStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

        div.innerHTML = `
            <div class="session-title">${escapeHtml(session.title)}</div>
            <div class="session-time">${timeStr}</div>
            <button class="session-delete" onclick="deleteSession('${session.id}', event)">×</button>
        `;

        sessionList.appendChild(div);
    });
}

// Toggle sidebar on mobile
function toggleSidebar() {
    sidebar.classList.toggle('open');
}


// Show error message
function showError(message) {
    const div = document.createElement('div');
    div.className = 'event error-toast';
    div.textContent = message;
    div.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #f44336;
        color: white;
        padding: 1rem;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 2000;
        animation: slideIn 0.3s ease-out;
    `;
    document.body.appendChild(div);

    setTimeout(() => {
        div.style.opacity = '0';
        div.style.transition = 'opacity 0.3s';
        setTimeout(() => div.remove(), 300);
    }, 5000);
}

// Show info message
function showInfo(message) {
    const div = document.createElement('div');
    div.className = 'event info-toast';
    div.textContent = message;
    div.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #2196F3;
        color: white;
        padding: 1rem;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 2000;
        animation: slideIn 0.3s ease-out;
    `;
    document.body.appendChild(div);

    setTimeout(() => {
        div.style.opacity = '0';
        div.style.transition = 'opacity 0.3s';
        setTimeout(() => div.remove(), 300);
    }, 5000);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function renderEvent(data, save = true) {
    // Handle session_init - store session ID
    if (data.type === 'session_init') {
        wsSessionId = data.data.session_id;
        localStorage.setItem(WS_SESSION_ID_KEY, wsSessionId);
        console.log('[DEBUG] Session initialized:', wsSessionId);
        return;
    }

    // Save to history
    if (save) {
        saveToHistory(data);
    }

    // Handle user messages
    if (data.type === 'user_message') {
        const div = document.createElement('div');
        div.className = 'event user-message';
        div.innerHTML = `<strong>👤 你:</strong> ${escapeHtml(data.data.content)}`;
        events.appendChild(div);
        events.scrollTop = events.scrollHeight;
        return;
    }

    // Handle HITL prompts specially
    if (data.type === 'hitl_prompt') {
        showHITLDialog(data);
        return;
    }

    // For agent messages with done=false, accumulate content
    if (data.type === 'agent_message' && !data.data.done) {
        if (!currentMessageDiv) {
            currentMessageDiv = document.createElement('div');
            currentMessageDiv.className = 'event agent-message markdown-content';
            currentMessageContent = '';
            events.appendChild(currentMessageDiv);
        }
        currentMessageContent += data.data.content;
        // Render as markdown
        if (typeof marked !== 'undefined') {
            currentMessageDiv.innerHTML = marked.parse(currentMessageContent);
        } else {
            currentMessageDiv.textContent = currentMessageContent;
        }
        // Only scroll if auto-scroll is enabled
        if (shouldAutoScroll && !isUserScrolling) {
            events.scrollTop = events.scrollHeight;
        }
        return;
    }

    // For agent messages with done=true, finalize and reset
    if (data.type === 'agent_message' && data.data.done) {
        if (currentMessageDiv) {
            currentMessageContent += data.data.content;
            if (typeof marked !== 'undefined') {
                currentMessageDiv.innerHTML = marked.parse(currentMessageContent);
            } else {
                currentMessageDiv.textContent = currentMessageContent;
            }
            currentMessageDiv = null;
            currentMessageContent = '';
            // Only scroll if auto-scroll is enabled
            if (shouldAutoScroll && !isUserScrolling) {
                events.scrollTop = events.scrollHeight;
            }
            return;
        }
        // If no buffered message, create new element
        const div = document.createElement('div');
        div.className = 'event agent-message markdown-content';
        if (typeof marked !== 'undefined') {
            div.innerHTML = marked.parse(data.data.content);
        } else {
            div.textContent = data.data.content;
        }
        events.appendChild(div);
        // Only scroll if auto-scroll is enabled
        if (shouldAutoScroll && !isUserScrolling) {
            events.scrollTop = events.scrollHeight;
        }
        return;
    }

    // For all other event types, finalize any pending message first
    if (currentMessageDiv) {
        currentMessageDiv = null;
        currentMessageContent = '';
    }

    // Create event element
    const div = document.createElement('div');
    div.className = `event ${data.type.replace(/_/g, '-')}`;

    // Render based on event type
    switch (data.type) {
        case 'session_start':
            div.innerHTML = `<strong>会话开始:</strong> ${data.data.session_id}`;
            break;

        case 'session_complete':
            div.innerHTML = `<strong>会话完成</strong>`;
            break;

        case 'tool_start':
            const args = JSON.stringify(data.data.args, null, 2);
            div.innerHTML = `
                <strong>🔧 工具调用:</strong> ${data.data.name}
                <pre>${args}</pre>
            `;
            break;

        case 'tool_complete':
            div.innerHTML = `<strong>✓ 工具完成:</strong> ${data.data.name}`;
            break;

        case 'thinking_start':
            div.innerHTML = `<span class="loading"></span> 思考中...`;
            break;

        case 'thinking_stop':
            div.innerHTML = `思考完成`;
            break;

        case 'file_diff':
            const path = data.data.path || '未知文件';
            const operation = data.data.operation || 'edit';
            div.innerHTML = `
                <strong>📝 文件${operation === 'edit' ? '修改' : '操作'}:</strong> ${path}
            `;
            break;

        case 'todo_update':
            const todos = data.data.todos || [];
            if (todos.length === 0) {
                div.innerHTML = `<strong>📋 任务列表:</strong> 无任务`;
            } else {
                const todoItems = todos.map(t => {
                    const statusIcon = t.status === 'completed' ? '✅' :
                                      t.status === 'in_progress' ? '🔄' : '⏳';
                    return `<li>${statusIcon} ${escapeHtml(t.content)} <span class="todo-status">(${t.status})</span></li>`;
                }).join('');
                div.innerHTML = `<strong>📋 任务列表:</strong><ul class="todo-list">${todoItems}</ul>`;
            }
            break;

        case 'token_usage':
            const inputTokens = data.data.input_tokens || 0;
            const outputTokens = data.data.output_tokens || 0;
            const totalTokens = data.data.total_tokens || (inputTokens + outputTokens);
            const percentage = totalTokens > 0 ? ((inputTokens / totalTokens) * 100).toFixed(1) : 0;

            div.innerHTML = `
                <strong>📊 Token 使用:</strong>
                <div class="token-stats">
                    <div class="token-stat">
                        <span class="token-label">输入:</span>
                        <span class="token-value">${inputTokens.toLocaleString()}</span>
                    </div>
                    <div class="token-stat">
                        <span class="token-label">输出:</span>
                        <span class="token-value">${outputTokens.toLocaleString()}</span>
                    </div>
                    <div class="token-stat">
                        <span class="token-label">总计:</span>
                        <span class="token-value">${totalTokens.toLocaleString()}</span>
                    </div>
                </div>
                <div class="token-bar">
                    <div class="token-bar-fill" style="width: ${percentage}%"></div>
                </div>
            `;
            break;

        case 'error':
            div.innerHTML = `
                <strong>❌ 错误:</strong> ${data.data.message}
                <div style="font-size: 0.875rem; opacity: 0.7;">类型: ${data.data.type}</div>
            `;
            break;

        default:
            div.innerHTML = `<strong>${data.type}:</strong> ${JSON.stringify(data.data, null, 2)}`;
    }

    events.appendChild(div);
    // Auto-scroll to bottom (only if user is not viewing history)
    if (shouldAutoScroll && !isUserScrolling) {
        events.scrollTop = events.scrollHeight;
    }
}

// HITL Dialog
function showHITLDialog(data) {
    currentDecisionId = data.data.decision_id;
    const toolName = data.data.tool_name || '未知工具';
    const toolArgs = data.data.tool_args || {};
    const preview = data.data.preview || '';

    let details = `工具: ${toolName}\n`;
    details += `参数:\n${JSON.stringify(toolArgs, null, 2)}`;
    if (preview) {
        details += `\n\n预览:\n${preview}`;
    }

    document.getElementById('hitl-details').textContent = details;
    hitlDialog.classList.remove('hidden');
}

// HITL button handlers
document.getElementById('btn-approve').onclick = () => {
    console.log('[DEBUG] Approve button clicked, currentDecisionId:', currentDecisionId);
    console.log('[DEBUG] WebSocket readyState:', ws.readyState, WebSocket ? '(OPEN=1)' : 'ws is null');

    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.error('[ERROR] WebSocket not connected. readyState:', ws ? ws.readyState : 'ws is null');
        showError('连接已断开，无法提交决策');
        return;
    }

    const decisionId = currentDecisionId;
    if (!decisionId) {
        console.error('[ERROR] No decision ID available');
        return;
    }

    const message = {
        type: 'hitl_decision',
        decision_id: decisionId,
        decision: { action: 'approve' }
    };

    try {
        const messageStr = JSON.stringify(message);
        console.log('[DEBUG] Sending HITL decision:', messageStr);
        ws.send(messageStr);
        console.log('[DEBUG] HITL decision sent successfully');
    } catch (e) {
        console.error('[ERROR] Failed to send HITL decision:', e);
        showError('发送决策失败: ' + e.message);
        return;
    }

    // Only close dialog after sending
    hitlDialog.classList.add('hidden');
    currentDecisionId = null;
};

document.getElementById('btn-reject').onclick = () => {
    console.log('[DEBUG] Reject button clicked, currentDecisionId:', currentDecisionId);
    console.log('[DEBUG] WebSocket readyState:', ws.readyState);

    if (ws.readyState !== WebSocket.OPEN) {
        showError('连接已断开，无法提交决策');
        return;
    }

    const decisionId = currentDecisionId;
    const message = {
        type: 'hitl_decision',
        decision_id: decisionId,
        decision: { action: 'reject' }
    };

    console.log('[DEBUG] Sending HITL decision:', message);
    ws.send(JSON.stringify(message));

    // Only close dialog after sending
    hitlDialog.classList.add('hidden');
    currentDecisionId = null;
};

// Send message
sendBtn.onclick = sendMessage;
userInput.onkeypress = (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
};

function sendMessage() {
    const content = userInput.value.trim();
    if (!content) return;

    // Only send if connected
    if (ws.readyState !== WebSocket.OPEN) {
        alert('WebSocket 未连接，请稍后再试');
        return;
    }

    ws.send(JSON.stringify({
        type: 'start',
        content: content
    }));

    userInput.value = '';
}

// Clear history button
function clearHistory() {
    if (confirm('确定要清空所有聊天记录吗？')) {
        sessions = [];
        currentSessionId = null;
        localStorage.removeItem(SESSIONS_KEY);
        localStorage.removeItem(CURRENT_SESSION_KEY);
        events.innerHTML = '';
        sessionTitle.textContent = '新对话';
        renderSessionList();
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Clear any stale decision ID from previous session
    currentDecisionId = null;
    // Hide any stale HITL dialog
    hitlDialog.classList.add('hidden');

    // Render session list
    renderSessionList();

    // Load current session if exists
    if (currentSessionId) {
        loadSession(currentSessionId);
    }

    // Create WebSocket connection
    createWebSocket();

    // Focus input
    userInput.focus();

    // Setup event listeners
    btnNewChat.onclick = createNewSession;
    btnToggleSidebar.onclick = toggleSidebar;
    btnVscodeLocal?.addEventListener('click', () => {
        window.open('http://172.32.153.184:8084/?folder=/workspace', '_blank');
    });

    // Sandbox VS Code button - create new sandbox environment
    btnSandboxVscode?.addEventListener('click', async () => {
        try {
            // Show loading message
            showInfo('正在创建沙箱...');

            // Call API to create sandbox
            const response = await fetch('/api/sandboxes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: 'default',
                    session_id: wsSessionId || 'default',
                    timeout_minutes: 240,
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || '创建沙箱失败');
            }

            const data = await response.json();

            // Open new tab with VS Code
            window.open(data.url, '_blank');

            // Show success message
            showInfo(`VS Code 沙箱已创建: ${data.sandbox_id}`);
        } catch (error) {
            console.error('创建沙箱失败:', error);
            showError('创建 VS Code 沙箱失败: ' + error.message);
        }
    });

    // Monitor user scrolling behavior
    events.addEventListener('scroll', () => {
        const distanceToBottom = events.scrollHeight - events.scrollTop - events.clientHeight;

        // If user scrolled up more than 100px, they're viewing history
        if (distanceToBottom > 100) {
            isUserScrolling = true;
        } else {
            isUserScrolling = false;
        }

        // Clear previous timeout
        if (scrollTimeout) clearTimeout(scrollTimeout);

        // Resume auto-scroll after 2 seconds of inactivity
        scrollTimeout = setTimeout(() => {
            isUserScrolling = false;
        }, 2000);
    });
});

// Add keyboard shortcut for clearing history (Ctrl+L)
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'l') {
        e.preventDefault();
        clearHistory();
    }
});
