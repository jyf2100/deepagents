/**
 * Unix Socket 连接测试 - 与 Python Agent 集成测试
 *
 * 架构说明：
 * - Node.js 创建 Unix Socket 服务器
 * - Python Agent 作为客户端连接到服务器
 * - 测试双向通信
 */

const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const os = require('os');
const fs = require('fs');
const msgpack = require('msgpackr');

describe('Python Socket Connection (Integration)', () => {
  let socketPath;
  let socketServer;
  let pythonProcess;
  let socketClient;
  let connectedClients = [];

  beforeAll(async () => {
    // 设置测试 socket 路径
    socketPath = path.join(os.tmpdir(), `deepagents-test-${Date.now()}.sock`);

    // 清理旧 socket
    if (fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }

    // === Step 1: 创建 Unix Socket 服务器 ===
    await new Promise((resolve, reject) => {
      socketServer = net.createServer((socket) => {
        console.log('✓ Python client connected');
        connectedClients.push(socket);  // 手动跟踪连接

        socket.on('data', (data) => {
          console.log('📨 Received data from Python');
        });
        socket.on('error', (err) => {
          console.error('Socket error:', err);
        });
        socket.on('close', () => {
          console.log('✗ Python client disconnected');
          connectedClients = connectedClients.filter(c => c !== socket);
        });
      });

      socketServer.listen(socketPath, () => {
        console.log(`✓ Socket server listening on ${socketPath}`);
        resolve();
      });

      socketServer.on('error', reject);
    });

    // === Step 2: 启动 Python Agent（测试模式） ===
    const cliPath = path.join(__dirname, '../../../libs/deepagents-cli');
    pythonProcess = spawn('uv', [
      'run',
      '--directory', cliPath,
      'deepagents-cli',
      'desktop',
      '--socket', socketPath,
      '--agent', 'test-desktop'
    ], {
      env: { ...process.env, DEEPAGENTS_TEST: '1' }
    });

    // 记录 Python 输出
    pythonProcess.stdout.on('data', (data) => {
      console.log(`[Python] ${data}`);
    });
    pythonProcess.stderr.on('data', (data) => {
      console.error(`[Python Error] ${data}`);
    });

    // 等待 Python 连接
    await new Promise(resolve => setTimeout(resolve, 3000));
  });

  afterAll(async () => {
    // 清理
    if (socketClient) {
      socketClient.destroy();
    }
    if (pythonProcess) {
      pythonProcess.kill();
    }
    if (socketServer) {
      socketServer.close();
    }
    if (fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }
  });

  describe('Unix Socket 连接', () => {
    test('Python Agent 应该已连接到服务器', () => {
      // 验证服务器有连接
      expect(connectedClients.length).toBeGreaterThan(0);
    });

    test('应该能通过服务器向 Python 发送消息', async () => {
      // 获取第一个连接的客户端（Python）
      const pythonSocket = connectedClients[0];
      expect(pythonSocket).toBeTruthy();

      // 发送 ping 请求
      const request = {
        request_id: 'test-ping',
        method: 'ping',
        params: {}
      };

      const encoded = msgpack.encode(request);
      const length = Buffer.alloc(4);
      length.writeUInt32LE(encoded.length);
      const payload = Buffer.concat([length, encoded]);

      // 发送并等待响应
      const response = await new Promise((resolve, reject) => {
        let buffer = Buffer.alloc(0);

        const timeout = setTimeout(() => {
          reject(new Error('Response timeout'));
        }, 5000);

        pythonSocket.once('data', (data) => {
          clearTimeout(timeout);
          try {
            buffer = Buffer.concat([buffer, data]);
            if (buffer.length >= 4) {
              const responseLength = buffer.readUInt32LE(0);
              if (buffer.length >= 4 + responseLength) {
                const responseData = buffer.slice(4, 4 + responseLength);
                const decoded = msgpack.decode(responseData);
                resolve(decoded);
              }
            }
          } catch (e) {
            reject(e);
          }
        });

        pythonSocket.write(payload);
      });

      // 验证响应
      expect(response).toHaveProperty('request_id', 'test-ping');
      expect(response).toHaveProperty('status', 'success');
      expect(response.data).toHaveProperty('pong', true);
    });

    test('应该正确处理未知方法', async () => {
      const pythonSocket = connectedClients[0];

      const request = {
        request_id: 'test-unknown',
        method: 'unknown_method',
        params: {}
      };

      const encoded = msgpack.encode(request);
      const length = Buffer.alloc(4);
      length.writeUInt32LE(encoded.length);
      const payload = Buffer.concat([length, encoded]);

      const response = await new Promise((resolve, reject) => {
        let buffer = Buffer.alloc(0);

        const timeout = setTimeout(() => {
          reject(new Error('Response timeout'));
        }, 5000);

        pythonSocket.once('data', (data) => {
          clearTimeout(timeout);
          try {
            buffer = Buffer.concat([buffer, data]);
            if (buffer.length >= 4) {
              const responseLength = buffer.readUInt32LE(0);
              if (buffer.length >= 4 + responseLength) {
                const responseData = buffer.slice(4, 4 + responseLength);
                resolve(msgpack.decode(responseData));
              }
            }
          } catch (e) {
            reject(e);
          }
        });

        pythonSocket.write(payload);
      });

      expect(response.status).toBe('error');
      expect(response.error).toHaveProperty('code', 'UNKNOWN_METHOD');
    });
  });
});
