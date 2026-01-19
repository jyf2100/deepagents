const { app, BrowserWindow, ipcMain, session } = require('electron');
const log = require('electron-log/main');

// Initialize logger
log.initialize();
log.info('App starting...');

const { spawn, execSync } = require('child_process');
const { randomUUID } = require('crypto');
const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const msgpack = require('msgpackr');

let mainWindow;
let pythonProcess;
let socketServer;
let webviewSession = null;  // 将在 app.whenReady() 中初始化
const SOCKET_PATH = path.join(os.tmpdir(), 'deepagents-desktop.sock');
const pendingRequests = new Map();
const connectedClients = []; // 手动跟踪连接的客户端
let connectionTimeout = null; // Python agent 连接超时检测

// === 代理配置 ===
// 配置代理函数
async function configureWebviewProxy() {
  const httpProxy = process.env.HTTP_PROXY || process.env.ALL_PROXY;
  const httpsProxy = process.env.HTTPS_PROXY || process.env.ALL_PROXY;

  if (!httpProxy && !httpsProxy) {
    console.log('[Proxy] No proxy configured for webview');
    return;
  }

  try {
    const proxyRules = [];
    if (httpProxy) proxyRules.push(`http=${httpProxy}`);
    if (httpsProxy) proxyRules.push(`https=${httpsProxy}`);

    const rules = proxyRules.join(';');
    console.log('[Proxy] Configuring webview session:', rules);

    await webviewSession.setProxy({
      mode: 'fixed_servers',
      proxyRules: rules
    });

    console.log('[Proxy] ✓ Webview proxy configured successfully');
  } catch (error) {
    console.error('[Proxy] Failed to configure:', error);
  }
}

// === Unix Socket Server ===
async function startSocketServer() {
  // Clean up old socket if exists
  if (fs.existsSync(SOCKET_PATH)) {
    fs.unlinkSync(SOCKET_PATH);
  }

  socketServer = net.createServer((socket) => {
    console.log('✓ Python client connected');
    connectedClients.push(socket);

    // 清除连接超时计时器
    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
      connectionTimeout = null;
      console.log('✓ Connection timeout cleared - agent connected successfully');
    }

    let buffer = Buffer.alloc(0);

    socket.on('data', (data) => {
      buffer = Buffer.concat([buffer, data]);

      while (buffer.length >= 4) {
        const length = buffer.readUInt32LE(0);
        if (buffer.length < 4 + length) break;

        const messageData = buffer.slice(4, 4 + length);
        buffer = buffer.slice(4 + length);

        try {
          const message = msgpack.decode(messageData);
          handleSocketMessage(message);
        } catch (error) {
          console.error('Failed to decode message:', error);
        }
      }
    });

    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    socket.on('close', () => {
      console.log('✗ Python client disconnected');
      const index = connectedClients.indexOf(socket);
      if (index > -1) {
        connectedClients.splice(index, 1);
      }
    });
  });

  return new Promise((resolve, reject) => {
    socketServer.listen(SOCKET_PATH, () => {
      console.log(`Socket server listening on ${SOCKET_PATH}`);
      resolve();
    });
    socketServer.on('error', reject);
  });
}

function handleSocketMessage(message) {
  const { request_id, status, data, error, type } = message;

  // Handle special event types (not responses)
  if (type === 'interrupt_request') {
    console.log('[handleSocketMessage] Received interrupt_request event');
    // 重置超时计时器（HITL 场景下，用户正在交互，不应该超时）
    if (request_id) {
      const pending = pendingRequests.get(request_id);
      if (pending) {
        clearTimeout(pending.timeout);
        pending.timeout = setTimeout(() => {
          pendingRequests.delete(request_id);
          pending.reject(new Error('Request timeout'));
        }, 1800000); // 30 minutes
        console.log('[handleSocketMessage] Reset timeout for HITL request:', request_id);
      }
    }
    // Forward to renderer
    if (mainWindow) {
      mainWindow.webContents.send('agent-response', message);
    }
    return;
  }

  // Ignore messages without a valid request_id (e.g., heartbeat responses)
  if (!request_id) {
    return;
  }

  console.log('[handleSocketMessage] Received response:', { request_id, status, hasData: !!data, dataKeys: data ? Object.keys(data) : 'null', data });

  const pending = pendingRequests.get(request_id);
  if (pending) {
    console.log('[handleSocketMessage] Found pending request for:', request_id);

    // 检查是否是最终响应
    const isFinalResponse = status === 'success' || status === 'error';

    if (isFinalResponse) {
      // 最终响应：清除超时并 resolve/reject
      clearTimeout(pending.timeout);
      if (status === 'error') {
        pending.reject(new Error(error?.message || 'Unknown error'));
      } else {
        // 传递完整的响应对象，包含 status, data 等字段
        pending.resolve({ status, data });
      }
      pendingRequests.delete(request_id);
    } else {
      // 中间状态：重置超时计时器
      clearTimeout(pending.timeout);
      pending.timeout = setTimeout(() => {
        pendingRequests.delete(request_id);
        pending.reject(new Error('Request timeout'));
      }, 1800000); // 30 minutes
      console.log('[handleSocketMessage] Reset timeout for intermediate response:', request_id);
    }
  } else {
    console.log('[handleSocketMessage] No pending request found for:', request_id);
  }

  // Forward to renderer
  if (mainWindow) {
    mainWindow.webContents.send('agent-response', message);
  }
}

async function sendToSocket(message) {
  const encoded = msgpack.encode(message);
  const length = Buffer.alloc(4);
  length.writeUInt32LE(encoded.length);
  const payload = Buffer.concat([length, encoded]);

  // Wait for a client to be available (with timeout)
  const maxWait = 5000; // 5 seconds
  const start = Date.now();

  while (connectedClients.length === 0) {
    if (Date.now() - start > maxWait) {
      throw new Error('No Python client connected');
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Send to first available client
  const socket = connectedClients[0];
  return new Promise((resolve, reject) => {
    socket.write(payload, (err) => err ? reject(err) : resolve());
  });
}

// === Python Agent ===
function startPythonAgent() {
  // 在启动新进程前，先清理当前会话的旧进程
  // 注意：旧资源（来自之前的应用实例）已在 cleanupOldResources() 中清理
  if (pythonProcess) {
    console.log('[startPythonAgent] Killing existing Python agent process from this session');
    pythonProcess.kill();
    pythonProcess = null;
  }

  if (app.isPackaged) {
    // Production: Use packaged executable directly
    const agentPath = path.join(process.resourcesPath, 'deepagents-desktop-agent', 'deepagents-desktop-agent');
    console.log(`Starting Python Agent from: ${agentPath}`);
    console.log(`Socket path: ${SOCKET_PATH}`);

    // Use minimal clean environment - only keep essential variables
    const cleanEnv = {
      // Essential system paths
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      USER: process.env.USER,
      TMPDIR: process.env.TMPDIR,
      TEMP: process.env.TEMP,
      // Language/encoding
      LANG: process.env.LANG || 'en_US.UTF-8',
      LC_ALL: process.env.LC_ALL || 'en_US.UTF-8',
    };

    // PyInstaller executable uses main.py as entry point, which expects CLI format
    pythonProcess = spawn(agentPath, [
      'desktop',
      '--socket', SOCKET_PATH,
      '--agent', 'desktop'
    ], {
      env: cleanEnv
    });
  } else {
    // Development: Use uv run
    const cliPath = path.join(__dirname, '../../../libs/deepagents-cli');
    console.log(`Starting Python Agent from: ${cliPath}`);
    console.log(`Socket path: ${SOCKET_PATH}`);
    console.log(`Command: uv run --directory ${cliPath} deepagents-cli desktop --socket ${SOCKET_PATH}`);

    // Clean environment to avoid inheriting conflicting model config
    const cleanEnv = { ...process.env };
    delete cleanEnv.OPENAI_MODEL;
    delete cleanEnv.ANTHROPIC_MODEL;
    delete cleanEnv.GOOGLE_MODEL;

    pythonProcess = spawn('uv', [
      'run', '--directory', cliPath,
      'deepagents-cli', 'desktop',
      '--socket', SOCKET_PATH
    ], {
      env: cleanEnv
    });
  }

  pythonProcess.stdout.on('data', (data) => {
    try {
      const msg = `Python: ${data}`;
      console.log(msg);
      log.info(msg);
    } catch (e) {
      // Ignore EPIPE errors when stdout is closed
    }
  });
  pythonProcess.stderr.on('data', (data) => {
    try {
      const msg = `Python Error: ${data}`;
      console.error(msg);
      log.error(msg);
    } catch (e) {
      // Ignore EPIPE errors when stderr is closed
    }
  });

  pythonProcess.on('close', (code) => {
    try {
      console.log(`Python Agent exited with code ${code}`);
    } catch (e) {
      // Ignore EPIPE errors
    }
    for (const pending of pendingRequests.values()) {
      pending.reject(new Error('Python Agent exited'));
    }
    pendingRequests.clear();
  });
}

// === IPC Handlers ===
ipcMain.handle('chat', async (event, message, stream = false, workspaceId = null, conversationId = null) => {
  const requestId = randomUUID();

  const promise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error('Request timeout'));
    }, 1800000); // 30 minute timeout (for HITL scenarios with multiple tool approvals)

    pendingRequests.set(requestId, { resolve, reject, timeout });
  });

  await sendToSocket({
    request_id: requestId,
    method: 'chat',
    params: {
      message: String(message || ''),  // Ensure message is string
      stream,
      workspace_id: String(workspaceId || ''),
      conversation_id: conversationId ? String(conversationId) : null
    }
  });

  return promise;
});

// 获取技能列表（从 Python 后端）
ipcMain.handle('listSkills', async () => {
  const requestId = randomUUID();

  const promise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error('Request timeout'));
    }, 10000); // 10 second timeout

    pendingRequests.set(requestId, { resolve, reject, timeout });
  });

  await sendToSocket({
    request_id: requestId,
    method: 'list_skills',
    params: {}
  });

  return promise;
});

// 上传技能文件
ipcMain.handle('uploadSkill', async (event, skillName, files, location = 'project') => {
  console.log('[uploadSkill] Called with:', { skillName, fileCount: files?.length, location });

  const requestId = randomUUID();

  const promise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error('Request timeout'));
    }, 30000); // 30 second timeout for file upload

    pendingRequests.set(requestId, { resolve, reject, timeout });
  });

  // 文件数据包含 base64 内容，直接传递
  const fileData = files.map(f => ({
    name: String(f.name || ''),
    content: String(f.content || ''),
    mimeType: String(f.mimeType || 'text/plain'),
    size: Number(f.size || 0)
  }));

  console.log('[uploadSkill] Sending to socket:', { skillName, fileCount: fileData.length, location });

  await sendToSocket({
    request_id: requestId,
    method: 'upload_skill',
    params: {
      skill_name: skillName,
      files: fileData,
      location: location  // 'project' or 'user'
    }
  });

  return promise;
});

// 从 GitHub 克隆技能
ipcMain.handle('cloneSkillFromGithub', async (event, githubUrl, location = 'project', useProxy = false) => {
  console.log('[cloneSkillFromGithub] Called with:', { githubUrl, location, useProxy });

  const requestId = randomUUID();

  const promise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error('Request timeout'));
    }, 180000); // 3 minute timeout for git clone

    pendingRequests.set(requestId, { resolve, reject, timeout });
  });

  await sendToSocket({
    request_id: requestId,
    method: 'clone_from_github',
    params: {
      github_url: String(githubUrl || ''),
      location: location,  // 'project' or 'user'
      use_proxy: Boolean(useProxy)
    }
  });

  return promise;
});

// 扫描 GitHub 仓库中的技能
ipcMain.handle('scanGithubForSkills', async (event, githubUrl, useProxy = false) => {
  console.log('[scanGithubForSkills] Called with:', { githubUrl, useProxy });

  const requestId = randomUUID();

  const promise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error('Request timeout'));
    }, 180000); // 3 minute timeout for git clone

    pendingRequests.set(requestId, { resolve, reject, timeout });
  });

  await sendToSocket({
    request_id: requestId,
    method: 'scan_github_for_skills',
    params: {
      github_url: String(githubUrl || ''),
      use_proxy: Boolean(useProxy)
    }
  });

  return promise;
});

// 导入选定的技能
ipcMain.handle('importSelectedSkills', async (event, tempDir, selectedSkills, location = 'project') => {
  console.log('[importSelectedSkills] Called with:', { tempDir, selectedSkills, location });

  const requestId = randomUUID();

  const promise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error('Request timeout'));
    }, 60000); // 1 minute timeout for import

    pendingRequests.set(requestId, { resolve, reject, timeout });
  });

  await sendToSocket({
    request_id: requestId,
    method: 'import_selected_skills',
    params: {
      temp_dir: String(tempDir || ''),
      selected_skills: selectedSkills || [],
      location: location
    }
  });

  return promise;
});

// HITL: 工具批准处理
// Note: This handler sends the approval decision but doesn't wait for a response.
// The actual response will come through the original 'chat' request's promise.
ipcMain.handle('toolApproval', async (event, requestId, action) => {
  console.log('[toolApproval] Called with:', { requestId, action });

  console.log('[toolApproval] Sending tool_approval request to Python');
  await sendToSocket({
    request_id: requestId,
    method: 'tool_approval',
    params: {
      action: action  // 'approve' or 'reject'
    }
  });
  console.log('[toolApproval] Request sent');

  // Return immediate success - the chat response will come separately
  return { success: true, message: 'Approval decision sent' };
});

// 删除技能
ipcMain.handle('deleteSkill', async (event, skillName, location = 'auto') => {
  console.log('[deleteSkill] Called with:', { skillName, location });

  const requestId = randomUUID();

  const promise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error('Request timeout'));
    }, 10000); // 10 second timeout

    pendingRequests.set(requestId, { resolve, reject, timeout });
  });

  await sendToSocket({
    request_id: requestId,
    method: 'delete_skill',
    params: {
      skill_name: String(skillName || ''),
      location: location  // 'auto', 'user', or 'project'
    }
  });

  return promise;
});

// === 配置管理 IPC Handlers ===

// 读取配置（转发到 Python 后端）
ipcMain.handle('getConfig', async () => {
  const requestId = randomUUID();

  const promise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error('Request timeout'));
    }, 10000); // 10 second timeout

    pendingRequests.set(requestId, {
      resolve: (response) => {
        // 提取 config 对象返回给前端
        if (response.status === 'success' && response.data?.config) {
          resolve(response.data.config);
        } else {
          reject(new Error('Failed to get configuration'));
        }
      },
      reject,
      timeout
    });
  });

  await sendToSocket({
    request_id: requestId,
    method: 'getConfig',
    params: {}
  });

  return promise;
});

// 保存配置（转发到 Python 后端）
ipcMain.handle('setConfig', async (event, config) => {
  const requestId = randomUUID();

  const promise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error('Request timeout'));
    }, 10000); // 10 second timeout

    pendingRequests.set(requestId, { resolve, reject, timeout });
  });

  await sendToSocket({
    request_id: requestId,
    method: 'setConfig',
    params: { config }
  });

  return promise;
});

// 重新加载配置（直接返回成功，因为 setConfig 已经处理了保存）
ipcMain.handle('reloadConfig', async () => {
  // setConfig 已经保存了配置，这里直接返回成功
  return { success: true, message: 'Configuration saved' };
});

// === Workspace Management IPC Handlers ===

// 列出所有工作空间
ipcMain.handle('listWorkspaces', async () => {
  console.log('[listWorkspaces] Called');

  const requestId = randomUUID();

  const promise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error('Request timeout'));
    }, 10000); // 10 second timeout

    pendingRequests.set(requestId, { resolve, reject, timeout });
  });

  await sendToSocket({
    request_id: requestId,
    method: 'list_workspaces',
    params: {}
  });

  return promise;
});

// 创建工作空间
ipcMain.handle('createWorkspace', async (event, config) => {
  console.log('[createWorkspace] Called with:', config);

  const requestId = randomUUID();

  const promise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error('Request timeout'));
    }, 10000); // 10 second timeout

    pendingRequests.set(requestId, { resolve, reject, timeout });
  });

  await sendToSocket({
    request_id: requestId,
    method: 'create_workspace',
    params: {
      id: config.id || null,
      name: config.name || '',
      category: config.category || '通用',
      enabled_skills: config.enabled_skills || ['*'],
      icon: config.icon || 'folder'
    }
  });

  return promise;
});

// 删除工作空间
ipcMain.handle('deleteWorkspace', async (event, workspaceId) => {
  console.log('[deleteWorkspace] Called with:', workspaceId);

  const requestId = randomUUID();

  const promise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error('Request timeout'));
    }, 10000); // 10 second timeout

    pendingRequests.set(requestId, { resolve, reject, timeout });
  });

  await sendToSocket({
    request_id: requestId,
    method: 'delete_workspace',
    params: {
      workspace_id: String(workspaceId || '')
    }
  });

  return promise;
});

// 更新工作空间
ipcMain.handle('updateWorkspace', async (event, workspaceId, updates) => {
  console.log('[updateWorkspace] Called with:', workspaceId, updates);

  const requestId = randomUUID();

  const promise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error('Request timeout'));
    }, 10000); // 10 second timeout

    pendingRequests.set(requestId, { resolve, reject, timeout });
  });

  await sendToSocket({
    request_id: requestId,
    method: 'update_workspace',
    params: {
      workspace_id: String(workspaceId || ''),
      name: updates.name || null,
      category: updates.category || null,
      icon: updates.icon || null
    }
  });

  return promise;
});

// 设置工作空间技能
ipcMain.handle('setWorkspaceSkills', async (event, workspaceId, enabledSkills) => {
  console.log('[setWorkspaceSkills] Called with:', workspaceId, enabledSkills);

  const requestId = randomUUID();

  const promise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error('Request timeout'));
    }, 10000); // 10 second timeout

    pendingRequests.set(requestId, { resolve, reject, timeout });
  });

  await sendToSocket({
    request_id: requestId,
    method: 'set_workspace_skills',
    params: {
      workspace_id: String(workspaceId || ''),
      enabled_skills: Array.isArray(enabledSkills) ? enabledSkills : []
    }
  });

  return promise;
});

// === Conversation Management ===

// 创建新对话
ipcMain.handle('createConversation', async (event, workspaceId, title = null) => {
  console.log('[createConversation] Called with:', workspaceId, title);

  const requestId = randomUUID();
  const promise = new Promise((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject });
  });

  // 生成新的对话 ID
  const conversationId = randomUUID();
  const conversationTitle = title || '新对话';

  await sendToSocket({
    request_id: requestId,
    method: 'create_conversation',
    params: {
      workspace_id: String(workspaceId || ''),
      conversation_id: conversationId,
      title: conversationTitle
    }
  });

  // 返回包含 conversationId 的响应
  const result = await promise;
  if (result.status === 'success' && result.data) {
    result.data.conversation_id = conversationId;
  }
  return result;
});

// 列出工作空间的对话
ipcMain.handle('listConversations', async (event, workspaceId) => {
  console.log('[listConversations] Called with:', workspaceId);

  const requestId = randomUUID();
  const promise = new Promise((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject });
  });

  await sendToSocket({
    request_id: requestId,
    method: 'list_conversations',
    params: {
      workspace_id: String(workspaceId || '')
    }
  });

  return promise;
});

// 删除对话
ipcMain.handle('deleteConversation', async (event, conversationId) => {
  console.log('[deleteConversation] Called with:', conversationId);

  const requestId = randomUUID();
  const promise = new Promise((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject });
  });

  await sendToSocket({
    request_id: requestId,
    method: 'delete_conversation',
    params: {
      conversation_id: String(conversationId || '')
    }
  });

  return promise;
});

// 切换对话
ipcMain.handle('switchConversation', async (event, workspaceId, conversationId) => {
  console.log('[switchConversation] Called with:', { workspaceId, conversationId });

  const requestId = randomUUID();
  const promise = new Promise((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject });
  });

  await sendToSocket({
    request_id: requestId,
    method: 'switch_conversation',
    params: {
      workspace_id: String(workspaceId || ''),
      conversation_id: String(conversationId || '')
    }
  });

  return promise;
});

// 重命名对话
ipcMain.handle('renameConversation', async (event, conversationId, title) => {
  console.log('[renameConversation] Called with:', conversationId, title);

  const requestId = randomUUID();
  const promise = new Promise((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject });
  });

  await sendToSocket({
    request_id: requestId,
    method: 'rename_conversation',
    params: {
      conversation_id: String(conversationId || ''),
      title: String(title || '')
    }
  });

  return promise;
});

// 获取对话历史
ipcMain.handle('getConversationHistory', async (event, workspaceId, conversationId) => {
  console.log('[getConversationHistory] Called with:', { workspaceId, conversationId });

  const requestId = randomUUID();
  const promise = new Promise((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject });
  });

  await sendToSocket({
    request_id: requestId,
    method: 'get_conversation_history',
    params: {
      workspace_id: String(workspaceId || ''),
      conversation_id: String(conversationId || '')
    }
  });

  return promise;
});

// 选择目录对话框
ipcMain.handle('selectDirectory', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择工作空间目录'
  });
  return result;
});

// === Window Management ===
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Cowork',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,  // 启用 webview 标签支持
      webSecurity: false  // 允许本地文件访问
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

// === Cleanup Old Resources ===
// 在应用启动前清理旧资源（旧进程和 socket 文件）
function cleanupOldResources() {
  // 清理旧的 Python agent 进程（来自之前的应用实例）
  // 注意：不要删除 socket 文件，让 startSocketServer() 处理
  try {
    const result = execSync('pkill -f "deepagents-desktop-agent"', { encoding: 'utf-8' });
    console.log('[cleanupOldResources] Killed old Python agents:', result.trim());
  } catch (e) {
    // pkill 返回非零退出码表示没有找到进程，这是正常的
    console.log('[cleanupOldResources] No old Python agents found');
  }
}

// === App Lifecycle ===
app.whenReady().then(async () => {
  // 首先清理旧资源（旧进程）
  cleanupOldResources();

  // 初始化 webview session（必须在 app.ready 之后）
  webviewSession = session.fromPartition('persist:skillslm-proxy');
  await configureWebviewProxy();  // 配置代理（只影响 webview session）

  // 启动 socket 服务器
  await startSocketServer();

  // 等待一小段时间确保 socket 文件已创建
  await new Promise(resolve => setTimeout(resolve, 500));

  startPythonAgent();

  // 设置连接超时检测（5 秒超时）
  connectionTimeout = setTimeout(() => {
    if (connectedClients.length === 0) {
      console.error('✗ Python agent failed to connect within 5 seconds');
      console.error('✗ Please check if the Python agent is starting correctly');
    }
  }, 5000);

  createWindow();
});

app.on('before-quit', () => {
  if (socketServer) {
    socketServer.close();
  }
  if (fs.existsSync(SOCKET_PATH)) {
    fs.unlinkSync(SOCKET_PATH);
  }
  if (pythonProcess) {
    pythonProcess.kill();
  }
});
