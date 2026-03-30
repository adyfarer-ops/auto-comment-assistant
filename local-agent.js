// local-agent.js - 本地代理程序，运行在你的电脑
// 功能：接收服务器命令，自动启动 Chrome

const WebSocket = require('ws');
const { exec } = require('child_process');
const path = require('path');

const SERVER_URL = 'ws://101.43.54.252:3003';
const SCRIPT_DIR = __dirname;

console.log('========================================');
console.log('🤖 Local Agent - 本地 Chrome 启动代理');
console.log('========================================');
console.log('Server:', SERVER_URL);
console.log('Script Dir:', SCRIPT_DIR);
console.log('========================================\n');

// 测试 child_process 是否可用
console.log('[TEST] Testing child_process...');
exec('echo test', (err, stdout) => {
  if (err) {
    console.error('[TEST] child_process error:', err);
  } else {
    console.log('[TEST] child_process OK:', stdout.trim());
  }
});

let ws = null;
let reconnectInterval = 5000;

function connect() {
  console.log('[AGENT] Connecting to server...');
  
  ws = new WebSocket(SERVER_URL);
  
  ws.on('open', () => {
    console.log('[AGENT] ✅ Connected to server');
    
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
      
      if (cmd.action === 'start-chrome') {
        const { index, localPort, sshPort, userDataDir } = cmd.data;
        
        console.log(`[AGENT] Starting Chrome ${index}...`);
        console.log(`  Local Port: ${localPort}`);
        console.log(`  SSH Port: ${sshPort}`);
        console.log(`  User Data: ${userDataDir}`);
        
        // Windows 脚本
        const scriptPath = path.join(SCRIPT_DIR, 'start-chrome-by-index.bat');
        const command = `"${scriptPath}" ${index} ${localPort} ${sshPort} ${userDataDir}`;
        
        console.log('[AGENT] Command:', command);
        console.log('[AGENT] Script exists:', require('fs').existsSync(scriptPath));
        
        // 使用 spawn 代替 exec，更好地处理输出
        const { spawn } = require('child_process');
        const bat = spawn('cmd.exe', ['/c', scriptPath, index, localPort, sshPort, userDataDir], {
          detached: true,
          windowsHide: false  // 显示窗口以便调试
        });
        
        bat.stdout.on('data', (data) => {
          console.log(`[AGENT] stdout: ${data}`);
        });
        
        bat.stderr.on('data', (data) => {
          console.error(`[AGENT] stderr: ${data}`);
        });
        
        bat.on('close', (code) => {
          console.log(`[AGENT] child process exited with code ${code}`);
        });
        
        bat.on('error', (err) => {
          console.error('[AGENT] Failed to start:', err);
        });
        
        // 发送就绪状态
        setTimeout(() => {
          ws.send(JSON.stringify({
            type: 'chrome-status',
            status: 'ready',
            index: index,
            localPort: localPort,
            sshPort: sshPort
          }));
        }, 8000);
      }
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

connect();

process.on('SIGINT', () => {
  console.log('\n[AGENT] Shutting down...');
  if (ws) ws.close();
  process.exit(0);
});
