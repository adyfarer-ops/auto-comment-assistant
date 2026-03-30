// local-agent.js - 本地代理程序，运行在你的电脑
// 功能：接收服务器命令，自动启动 Chrome

const WebSocket = require('ws');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const SERVER_URL = 'ws://101.43.54.252:3003';
// Windows 下使用 process.cwd() 获取工作目录
const SCRIPT_DIR = process.cwd();

console.log('========================================');
console.log('🤖 Local Agent - 本地 Chrome 启动代理');
console.log('========================================');
console.log('Server:', SERVER_URL);
console.log('Script Dir:', SCRIPT_DIR);
console.log('========================================\n');

let ws = null;
let reconnectInterval = 5000;

// 检查 Chrome 是否就绪
async function checkChromeReady(localPort, maxWait = 30000) {
  return new Promise((resolve) => {
    const checkInterval = 1000;
    let waited = 0;
    
    const check = () => {
      const req = http.request({
        hostname: 'localhost',
        port: localPort,
        path: '/json/version',
        method: 'GET',
        timeout: 2000
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.Browser) {
              console.log(`[AGENT] Chrome is ready on port ${localPort}`);
              resolve(true);
            } else {
              resolve(false);
            }
          } catch (e) {
            resolve(false);
          }
        });
      });
      
      req.on('error', () => {
        if (waited >= maxWait) {
          console.log(`[AGENT] Timeout waiting for Chrome on port ${localPort}`);
          resolve(false);
        } else {
          waited += checkInterval;
          setTimeout(check, checkInterval);
        }
      });
      
      req.on('timeout', () => {
        req.destroy();
        if (waited >= maxWait) {
          resolve(false);
        } else {
          waited += checkInterval;
          setTimeout(check, checkInterval);
        }
      });
      
      req.end();
    };
    
    check();
  });
}

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
  
  ws.on('message', async (data) => {
    try {
      const cmd = JSON.parse(data);
      console.log('[AGENT] Received command:', cmd);
      
      if (cmd.action === 'start-chrome') {
        const { index, localPort, sshPort, userDataDir } = cmd.data;
        
        console.log(`[AGENT] Starting Chrome ${index}...`);
        console.log(`  Local Port: ${localPort}`);
        console.log(`  SSH Port: ${sshPort}`);
        console.log(`  User Data: ${userDataDir}`);
        
        const scriptPath = path.join(process.cwd(), 'start-chrome-by-index.bat');
        
        console.log('[AGENT] Script path:', scriptPath);
        console.log('[AGENT] Script exists:', fs.existsSync(scriptPath));
        
        // 使用 spawn 启动脚本，在独立窗口中运行
        const bat = spawn('cmd.exe', ['/c', 'start', scriptPath, index, localPort, sshPort, userDataDir], {
          cwd: process.cwd(),
          windowsHide: false,
          shell: true
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
        
        // 等待脚本执行完成（约35秒，确保隧道建立）
        console.log('[AGENT] Waiting for script to complete...');
        await new Promise(r => setTimeout(r, 35000));
        
        // 检查 Chrome 是否真的就绪
        console.log('[AGENT] Checking if Chrome is really ready...');
        const isChromeReady = await checkChromeReady(localPort, 10000);
        
        if (!isChromeReady) {
          console.log(`[AGENT] Chrome ${index} failed to start properly`);
          ws.send(JSON.stringify({
            type: 'chrome-status',
            status: 'error',
            index: index,
            error: 'Chrome not responding'
          }));
          return;
        }
        
        console.log(`[AGENT] Chrome ${index} is ready on port ${localPort}`);
        
        // SSH 隧道检查：等待额外时间让隧道建立，然后让服务器验证
        console.log('[AGENT] Waiting for SSH tunnel to establish...');
        await new Promise(r => setTimeout(r, 10000)); // 额外等待10秒
        
        // 通知服务器 Chrome 已就绪，让服务器检查 SSH 隧道
        console.log(`[AGENT] Chrome ${index} is ready, notifying server to verify SSH tunnel...`);
        ws.send(JSON.stringify({
          type: 'chrome-status',
          status: 'ready',
          index: index,
          localPort: localPort,
          sshPort: sshPort
        }));
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
