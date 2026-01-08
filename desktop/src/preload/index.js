const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('deepagents', {
  // 发送聊天消息
  chat: (message, stream = false) => ipcRenderer.invoke('chat', message, stream),

  // 监听响应（用于流式响应）
  onResponse: (callback) => {
    ipcRenderer.on('agent-response', (event, data) => callback(data));
  }
});
