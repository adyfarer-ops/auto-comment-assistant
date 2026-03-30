// local-agent-http.js - 使用 HTTP 轮询的本地代理（备用方案）
// 如果 WebSocket 连不上，用这个版本

const http = require('http');
const { exec } = require('child_process');
const path = require('path');

const SERVER_HOST = '101.43.54.252';
const SERVER_PORT = 3004;
const POLL_INTERVAL = 3000; // 3秒轮询一次

console.log('========================================');
console.log('🤖 Local Agent HTTP - 本地 Chrome 启动代理');
console.log('========================================');
console.log('Server:', `http://${SERVER_HOST}:${SERVER_PORT}`);
console.log('Mode: HTTP Polling');
console.log('========================================\n');

let myIndex = null; // 当前代理负责的序号

// 注册自己到服务器
function register() {
  const data = JSON.stringify({
    client: 'local-agent-http',
    timestamp: Date.now()
  });
  
  const options = {
    hostname: SERVER_HOST,
    port: SERVER_PORT,
    path: '/register',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };
  
  const req = http.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      try {
        const result = JSON.parse(body);
        console.log('[AGENT] Registered:', result);
      } catch (e) {}
    });
  });
  
  req.on('error', (err) => {
    console.error('[AGENT] Register error:', err.message);
  });
  
  req.write(data);
  req.end();
}

// 检查是否有启动命令
function checkForCommands() {
  const options = {
    hostname: SERVER_HOST,
    port: SERVER_PORT,
    path: '/pending-commands',
    method: 'GET'
  };
  
  const req = http.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      try {
        const result = JSON.parse(body);
        if (result.commands && result.commands.length > 0) {
          result.commands.forEach(cmd => {
            handleCommand(cmd);
          });
        }
      } catch (e) {}
    });
  });
  
  req.on('error', (err) => {
    console.error('[AGENT] Check commands error:', err.message);
  });
  
  req.end();
}

// 处理命令
function handleCommand(cmd) {
  console.log('[AGENT] Received command:', cmd);
  
  if (cmd.action === 'start-chrome') {
    const { index, localPort, sshPort, userDataDir } = cmd.data;
    myIndex = index;
    
    const scriptPath = path.join(__dirname, 'start-chrome-by-index.bat');
    const command = `"${scriptPath}" ${index} ${localPort} ${sshPort} ${userDataDir}`;
    
    console.log('[AGENT] Executing:', command);
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('[AGENT] Execution error:', error);
        reportStatus(index, 'error', error.message);
      } else {
        console.log('[AGENT] Chrome started');
        // 等待 Chrome 启动完成
        setTimeout(() => {
          reportStatus(index, 'ready');
        }, 5000);
      }
    });
  }
}

// 报告状态
function reportStatus(index, status, error = null) {
  const data = JSON.stringify({
    index: index,
    status: status,
    error: error,
    timestamp: Date.now()
  });
  
  const options = {
    hostname: SERVER_HOST,
    port: SERVER_PORT,
    path: '/report-status',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };
  
  const req = http.request(options);
  req.on('error', () => {});
  req.write(data);
  req.end();
}

// 主循环
console.log('[AGENT] Starting HTTP polling...');
register();
setInterval(checkForCommands, POLL_INTERVAL);

// 保持运行
process.on('SIGINT', () => {
  console.log('\n[AGENT] Shutting down...');
  process.exit(0);
});
