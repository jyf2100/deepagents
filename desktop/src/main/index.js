const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const msgpack = require('msgpackr');

let mainWindow;
let pythonProcess;
let socketServer;
const SOCKET_PATH = path.join(os.tmpdir(), 'deepagents-desktop.sock');
const pendingRequests = new Map();

// === Unix Socket Server ===
async function startSocketServer() {
  // Clean up old socket if exists
  if (fs.existsSync(SOCKET_PATH)) {
    fs.unlinkSync(SOCKET_PATH);
  }

  socketServer = net.createServer((socket) => {
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
  const { request_id, status, data, error } = message;

  const pending = pendingRequests.get(request_id);
  if (pending) {
    clearTimeout(pending.timeout);
    if (status === 'error') {
      pending.reject(new Error(error?.message || 'Unknown error'));
    } else {
      pending.resolve(data);
    }
    pendingRequests.delete(request_id);
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

  // Broadcast to all clients
  const sockets = socketServer?.connections || [];
  await Promise.all(sockets.map(s => {
    return new Promise((resolve, reject) => {
      s.write(payload, (err) => err ? reject(err) : resolve());
    });
  }));
}

// === Python Agent ===
function startPythonAgent() {
  const cliPath = path.join(__dirname, '../../../libs/deepagents-cli');

  pythonProcess = spawn('uv', [
    'run', '--directory', cliPath,
    'deepagents-cli', 'desktop',
    '--socket', SOCKET_PATH
  ], {
    env: { ...process.env }
  });

  pythonProcess.stdout.on('data', (data) => console.log(`Python: ${data}`));
  pythonProcess.stderr.on('data', (data) => console.error(`Python Error: ${data}`));

  pythonProcess.on('close', (code) => {
    console.log(`Python Agent exited with code ${code}`);
    for (const pending of pendingRequests.values()) {
      pending.reject(new Error('Python Agent exited'));
    }
    pendingRequests.clear();
  });
}

// === IPC Handlers ===
ipcMain.handle('chat', async (event, message, stream = false) => {
  const requestId = randomUUID();

  const promise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error('Request timeout'));
    }, 120000); // 2 minute timeout

    pendingRequests.set(requestId, { resolve, reject, timeout });
  });

  await sendToSocket({
    request_id: requestId,
    method: 'chat',
    params: { message, stream }
  });

  return promise;
});

// === Window Management ===
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'DeepAgents',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

// === App Lifecycle ===
app.whenReady().then(async () => {
  await startSocketServer();
  startPythonAgent();
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
