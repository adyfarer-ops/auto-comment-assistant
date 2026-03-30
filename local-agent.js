// local-agent.js - 本地代理程序，运行在你的电脑
// 功能：接收服务器命令，自动启动 Chrome

const WebSocket = require('ws');
const { exec } = require('child_util');
const path = require('path');

const SERVER_URL = 'ws://101.43.54.252:3003';
const SCRIPT_DIR = __dirname;

console.log('========================================');
console.log('🤖 Local Agent - 本地 Chrome 启动代理');
console.log('========================================');
console.log('Server:', SERVER_URL);
console.log('Script Dir:', SCRIPT_DIR);
console.log('========================================\n');

let ws = null;
let reconnectInterval = 5000;

function connect() {
  console.log('[AGENT] Connecting to server...');
  
  ws = new WebSocket(SERVER_URL);
  
  ws.on('open', () => {
    console.log('[AGENT] ✅ Connected to server');
    
    // 发送注册信息
    ws.send(JSON.stringify({
      type: 'register',
      client: 'local-agent',
      timestamp: Date.now()
    }));
  });
  
  ws.on('message', (data) => {
    try {
      const cmd = JSON.parse(data);
      console.log('[AGENT] Received command:', cmd);
      
      handleCommand(cmd);
    } catch (e) {
      console.error('[AGENT] Failed to parse message:', e.message);
    }
  });
  
  ws.on('close', () => {
    console.log('[AGENT] ❌ Connection closed, reconnecting in', reconnectInterval, 'ms');
    setTimeout(connect, reconnectInterval);
  });
  
  ws.on('error', (err) => {
    console.error('[AGENT] Connection error:', err.message);
  });
}

function handleCommand(cmd) {
  switch (cmd.action) {
    case 'start-chrome':
      startChrome(cmd.data);
      break;
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;
    default:
      console.log('[AGENT] Unknown command:', cmd.action);
  }
}

function startChrome(data) {
  const { index, localPort, sshPort, userDataDir } = data;
  
  console.log(`[AGENT] Starting Chrome ${index}...`);
  console.log(`  Local Port: ${localPort}`);
  console.log(`  SSH Port: ${sshPort}`);
  console.log(`  User Data: ${userDataDir}`);
  
  // Windows 脚本
  const scriptPath = path.join(SCRIPT_DIR, 'start-chrome-by-index.bat');
  const command = `"${scriptPath}" ${index} ${localPort} ${sshPort} ${userDataDir}`;
  
  console.log('[AGENT] Executing:', command);
  
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error('[AGENT] Failed to start Chrome:', error);
      ws.send(JSON.stringify({
        type: 'chrome-status',
        status: 'error',
        index: index,
        error: error.message
      }));
      return;
    }
    
    console.log('[AGENT] Chrome started:', stdout);
    
    // 等待 Chrome 启动完成
    setTimeout(() => {
      ws.send(JSON.stringify({
        type: 'chrome-status',
        status: 'ready',
        index: index,
        localPort: localPort,
        sshPort: sshPort
      }));
    }, 5000);
  });
}

// 启动连接
connect();

// 保持进程运行
process.on('SIGINT', () => {
  console.log('\n[AGENT] Shutting down...');
  if (ws) ws.close();
  process.exit(0);
});
