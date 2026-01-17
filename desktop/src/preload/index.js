const { contextBridge, ipcRenderer } = require('electron');

// 保存回调函数引用
let responseCallback = null;

// 在 preload 脚本加载时，清理所有旧的监听器
// （防止开发模式下的热重载导致监听器累积）
try {
  ipcRenderer.removeAllListeners('agent-response');
} catch (e) {
  // 忽略错误
}

contextBridge.exposeInMainWorld('deepagents', {
  // 发送聊天消息
  chat: (message, stream = false, workspaceId = null, conversationId = null) =>
    ipcRenderer.invoke('chat', message, stream, workspaceId, conversationId),

  // 获取技能列表
  listSkills: () => ipcRenderer.invoke('listSkills'),

  // 上传技能文件
  uploadSkill: (skillName, files, location = 'project') => ipcRenderer.invoke('uploadSkill', skillName, files, location),

  // 从 GitHub 克隆技能
  cloneSkillFromGithub: (githubUrl, location = 'project', useProxy = false) => ipcRenderer.invoke('cloneSkillFromGithub', githubUrl, location, useProxy),

  // 扫描 GitHub 仓库中的技能
  scanGithubForSkills: (githubUrl, useProxy = false) => ipcRenderer.invoke('scanGithubForSkills', githubUrl, useProxy),

  // 导入选定的技能
  importSelectedSkills: (tempDir, selectedSkills, location = 'project') => ipcRenderer.invoke('importSelectedSkills', tempDir, selectedSkills, location),

  // 删除技能
  deleteSkill: (skillName, location = 'auto') => ipcRenderer.invoke('deleteSkill', skillName, location),

  // HITL: 发送工具批准决定
  sendToolApproval: (requestId, action) => ipcRenderer.invoke('toolApproval', requestId, action),

  // 配置管理
  getConfig: () => ipcRenderer.invoke('getConfig'),
  setConfig: (config) => ipcRenderer.invoke('setConfig', config),
  reloadConfig: () => ipcRenderer.invoke('reloadConfig'),

  // 工作空间管理
  listWorkspaces: () => ipcRenderer.invoke('listWorkspaces'),
  createWorkspace: (config) => ipcRenderer.invoke('createWorkspace', config),
  deleteWorkspace: (workspaceId) => ipcRenderer.invoke('deleteWorkspace', workspaceId),
  updateWorkspace: (workspaceId, updates) => ipcRenderer.invoke('updateWorkspace', workspaceId, updates),
  setWorkspaceSkills: (workspaceId, enabledSkills) => ipcRenderer.invoke('setWorkspaceSkills', workspaceId, enabledSkills),

  // 对话管理
  createConversation: (workspaceId, title = null) => ipcRenderer.invoke('createConversation', workspaceId, title),
  listConversations: (workspaceId) => ipcRenderer.invoke('listConversations', workspaceId),
  deleteConversation: (conversationId) => ipcRenderer.invoke('deleteConversation', conversationId),
  switchConversation: (workspaceId, conversationId) => ipcRenderer.invoke('switchConversation', workspaceId, conversationId),
  renameConversation: (conversationId, title) => ipcRenderer.invoke('renameConversation', conversationId, title),
  getConversationHistory: (workspaceId, conversationId) => ipcRenderer.invoke('getConversationHistory', workspaceId, conversationId),

  // 文件选择对话框
  selectDirectory: () => ipcRenderer.invoke('selectDirectory'),

  // 监听响应（用于流式响应和 HITL interrupt_request）
  onResponse: (callback) => {
    // 移除旧的监听器（如果存在）
    if (responseCallback) {
      try {
        ipcRenderer.removeListener('agent-response', responseCallback);
      } catch (e) {
        // 忽略错误，监听器可能已经被移除
      }
    }

    // 保存新的回调引用
    responseCallback = (event, data) => callback(data);

    // 注册新的监听器
    ipcRenderer.on('agent-response', responseCallback);
  }
});
