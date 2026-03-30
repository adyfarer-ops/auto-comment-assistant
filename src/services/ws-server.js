// ws-server.js - WebSocket 服务器，运行在云端
// 功能：管理本地代理连接，转发启动命令

const WebSocket = require('ws');
const http = require('http');
const express = require('express');

const PORT = 3003;

// 存储连接的客户端
const clients = new Map();
const pendingCommands = [];
const agentStatuses = {};

// 创建 HTTP 服务器
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    service: 'WebSocket Server',
    clients: clients.size,
    timestamp: Date.now()
  }));
});

// 创建 WebSocket 服务器
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  const clientId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
  console.log(`[WS] Client connected: ${clientId}`);

  clients.set(clientId, {
    ws: ws,
    connectedAt: Date.now(),
    lastPing: Date.now()
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      handleMessage(clientId, msg);
    } catch (e) {
      console.error('[WS] Failed to parse message:', e.message);
    }
  });

  ws.on('close', () => {
    console.log(`[WS] Client disconnected: ${clientId}`);
    clients.delete(clientId);
  });

  ws.on('error', (err) => {
    console.error(`[WS] Client error (${clientId}):`, err.message);
  });
});

function handleMessage(clientId, msg) {
  console.log(`[WS] Message from ${clientId}:`, msg.type);

  switch (msg.type) {
    case 'register':
      console.log(`[WS] Client registered: ${clientId}`);
      break;
    case 'chrome-status':
      console.log(`[WS] Chrome status from ${clientId}:`, msg.status, msg.index);
      global.chromeStatus = global.chromeStatus || {};
      global.chromeStatus[msg.index] = {
        status: msg.status,
        localPort: msg.localPort,
        sshPort: msg.sshPort,
        updatedAt: Date.now()
      };
      break;
    case 'pong':
      if (clients.has(clientId)) {
        clients.get(clientId).lastPing = Date.now();
      }
      break;
  }
}

// 发送命令给客户端
function sendCommand(index) {
  const baseLocalPort = 9000;
  const baseSSHPort = 62000;

  const cmd = {
    action: 'start-chrome',
    data: {
      index: index,
      localPort: baseLocalPort + index,
      sshPort: baseSSHPort + index,
      userDataDir: `account_${index}`
    }
  };

  for (const [clientId, client] of clients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      console.log(`[WS] Sending command to ${clientId}:`, cmd);
      client.ws.send(JSON.stringify(cmd));
      return true;
    }
  }

  console.log('[WS] No connected clients');
  return false;
}

// 检查 Chrome 是否已就绪
function isChromeReady(index) {
  const status = global.chromeStatus?.[index];
  if (!status) return false;

  const maxAge = 5 * 60 * 1000;
  return status.status === 'ready' && (Date.now() - status.updatedAt) < maxAge;
}

// 创建 Express 应用
const app = express();
app.use(express.json());

// 注册端点
app.post('/register', (req, res) => {
  console.log('[API] Agent registered:', req.body);
  res.json({ success: true, message: 'Registered' });
});

// 查询待处理命令
app.get('/pending-commands', (req, res) => {
  const commands = [...pendingCommands];
  pendingCommands.length = 0;
  res.json({ commands });
});

// 报告状态
app.post('/report-status', (req, res) => {
  const { index, status, error } = req.body;
  console.log('[API] Status report:', { index, status, error });
  agentStatuses[index] = { status, error, updatedAt: Date.now() };
  res.json({ success: true });
});

// 查询 Chrome 状态
app.get('/chrome-status/:index', (req, res) => {
  const index = parseInt(req.params.index);
  const ready = isChromeReady(index);
  res.json({
    index: index,
    ready: ready,
    status: global.chromeStatus?.[index] || null
  });
});

// 启动 Chrome
app.post('/start-chrome/:index', (req, res) => {
  const index = parseInt(req.params.index);

  if (isChromeReady(index)) {
    return res.json({
      success: true,
      message: 'Chrome already ready',
      index: index
    });
  }

  const sent = sendCommand(index);

  if (!sent) {
    const baseLocalPort = 9000;
    const baseSSHPort = 62000;

    pendingCommands.push({
      action: 'start-chrome',
      data: {
        index: index,
        localPort: baseLocalPort + index,
        sshPort: baseSSHPort + index,
        userDataDir: `account_${index}`
      }
    });

    console.log('[API] Command queued for HTTP polling:', index);
  }

  res.json({
    success: true,
    message: sent ? 'Command sent via WebSocket' : 'Command queued for HTTP polling',
    index: index
  });
});

// 启动 HTTP API（使用不同端口）
app.listen(3004, '0.0.0.0', () => {
  console.log('[API] HTTP API listening on port 3004');
});

// 启动 WebSocket 服务器
server.listen(PORT, '0.0.0.0', () => {
  console.log('========================================');
  console.log('🌐 WebSocket Server');
  console.log('========================================');
  console.log(`WS Port: ${PORT}`);
  console.log(`HTTP API Port: 3004`);
  console.log('========================================\n');
});

// 导出函数
module.exports = {
  sendCommand,
  isChromeReady
};
