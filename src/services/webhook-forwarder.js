// Webhook 转发服务 - 使用平台模块（基于备份代码重构，优化版）
const express = require('express');
const https = require('https');
const puppeteer = require('puppeteer-core');
const FormData = require('form-data');
const fs = require('fs');

// 导入平台处理模块
const { handleDouyinNote, inputAndSendComment } = require('../platforms/douyin-note');
const { handleDouyinVideo, findCommentInput } = require('../platforms/douyin-video');
const {
  CONFIG,
  setCurrentTableId,
  getTenantAccessToken,
  updateRecordField,
  sendFeishuMessage,
  sendProgressMessage,
  detectContentType
} = require('../utils/utils');

// 任务队列
const taskQueue = [];
let isProcessing = false;

// 添加任务到队列
function addToQueue(taskData) {
  return new Promise((resolve, reject) => {
    const task = {
      data: taskData,
      resolve,
      reject,
      id: Date.now() + Math.random().toString(36).substr(2, 9)
    };
    taskQueue.push(task);
    console.log(`[QUEUE] Task ${task.id} added. Queue length: ${taskQueue.length}`);
    
    // 通知用户任务已排队
    sendQueueStatusNotification(taskData, taskQueue.length);
    
    processQueue();
  });
}

// 发送队列状态通知
async function sendQueueStatusNotification(data, position) {
  try {
    const token = await getTenantAccessToken();
    if (position === 1) {
      await sendProgressMessage(token, '📋 任务已添加到队列，正在执行...', data);
    } else {
      await sendProgressMessage(token, `📋 任务已添加到队列，当前排在第 ${position} 位，请稍候...`, data);
    }
  } catch (e) {
    console.log('[QUEUE] Failed to send queue status:', e.message);
  }
}

// 处理队列
async function processQueue() {
  if (isProcessing || taskQueue.length === 0) {
    return;
  }
  
  isProcessing = true;
  const task = taskQueue.shift();
  
  console.log(`[QUEUE] Processing task ${task.id}. Remaining: ${taskQueue.length}`);
  
  try {
    // 通知下一个任务开始执行
    if (taskQueue.length > 0) {
      const token = await getTenantAccessToken();
      await sendProgressMessage(token, '📋 开始执行当前任务...', task.data);
    }
    
    const result = await handleCommentTask(task.data);
    task.resolve(result);
  } catch (error) {
    console.error(`[QUEUE] Task ${task.id} failed:`, error.message);
    task.reject(error);
  } finally {
    isProcessing = false;
    
    // 继续处理下一个任务
    if (taskQueue.length > 0) {
      console.log(`[QUEUE] ${taskQueue.length} tasks remaining, processing next...`);
      setTimeout(processQueue, 2000); // 2秒间隔
    } else {
      console.log('[QUEUE] All tasks completed');
    }
  }
}

// 序号到端口的映射
function getPortsByIndex(index) {
  const baseLocalPort = 9000;
  const baseSSHPort = 62000;
  
  // 为不同序号分配不同的标识颜色
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', 
    '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52BE80',
    '#EC7063', '#5DADE2', '#48C9B0', '#F5B041', '#AF7AC5',
    '#5499C7', '#58D68D', '#F4D03F', '#EB984E', '#A569BD',
    '#E74C3C', '#3498DB', '#1ABC9C', '#F39C12', '#9B59B6',
    '#2980B9', '#27AE60', '#F1C40F', '#E67E22', '#8E44AD',
    '#C0392B', '#2874A6', '#117A65', '#D68910', '#7D3C98',
    '#2E86AB', '#A23B72', '#F18F01', '#C73E1D', '#6A4C93',
    '#1B4965', '#5FA8D3', '#62B6CB', '#BEE9E8', '#CAE9FF',
    '#5C374C', '#985277', '#CE6A85', '#F2A0A1', '#EFD5C3'
  ];

  return {
    localPort: baseLocalPort + index,      // 9001, 9002, ...
    sshPort: baseSSHPort + index,          // 62001, 62002, ...
    userDataDir: `account_${index}`,         // account_1, account_2, ...
    color: colors[(index - 1) % colors.length] // 循环使用颜色
  };
}

// 关闭指定序号的浏览器
async function closeBrowser(index) {
  return new Promise((resolve) => {
    const { userDataDir } = getPortsByIndex(index);
    
    // 使用 taskkill 关闭对应窗口标题的 Chrome
    const { exec } = require('child_process');
    const cmd = `taskkill /F /IM chrome.exe /FI "WINDOWTITLE eq Chrome*${userDataDir}*"`;
    
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.log(`[CLOSE] Browser ${index} may already be closed`);
      } else {
        console.log(`[CLOSE] Browser ${index} closed successfully`);
      }
      resolve();
    });
  });
}

// 关闭指定序号的 SSH 隧道
async function closeSSHTunnel(index) {
  return new Promise((resolve) => {
    const { sshPort } = getPortsByIndex(index);
    
    // 使用 taskkill 关闭占用该 SSH 端口的进程
    const { exec } = require('child_process');
    
    // 先找到占用端口的进程
    const findCmd = `netstat -ano | findstr :${sshPort}`;
    
    exec(findCmd, (error, stdout, stderr) => {
      if (error || !stdout) {
        console.log(`[CLOSE] SSH tunnel ${index} (port ${sshPort}) may already be closed`);
        resolve();
        return;
      }
      
      // 解析输出获取 PID
      const lines = stdout.trim().split('\n');
      const pids = new Set();
      
      for (const line of lines) {
        const match = line.match(/LISTENING\s+(\d+)/);
        if (match) {
          pids.add(match[1]);
        }
      }
      
      if (pids.size === 0) {
        console.log(`[CLOSE] No SSH tunnel found for port ${sshPort}`);
        resolve();
        return;
      }
      
      // 杀死这些进程
      let killed = 0;
      for (const pid of pids) {
        const killCmd = `taskkill /F /PID ${pid}`;
        exec(killCmd, (err) => {
          killed++;
          if (err) {
            console.log(`[CLOSE] Failed to kill PID ${pid}: ${err.message}`);
          } else {
            console.log(`[CLOSE] Killed SSH tunnel PID ${pid}`);
          }
          if (killed === pids.size) {
            console.log(`[CLOSE] SSH tunnel ${index} (port ${sshPort}) closed`);
            resolve();
          }
        });
      }
    });
  });
}

// 关闭 CMD 窗口（通过窗口标题）
async function closeCMDWindow(index) {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    
    // 查找包含 "SSH Tunnel" 和序号的 CMD 窗口
    const findCmd = `tasklist /V /FI "IMAGENAME eq cmd.exe" /FO CSV | findstr "SSH Tunnel ${index}"`;
    
    exec(findCmd, (error, stdout, stderr) => {
      if (error || !stdout) {
        console.log(`[CLOSE] No CMD window found for index ${index}`);
        resolve();
        return;
      }
      
      // 解析 CSV 输出获取 PID
      const lines = stdout.trim().split('\n');
      const pids = [];
      
      for (const line of lines) {
        const parts = line.split('","');
        if (parts.length > 1) {
          const pid = parts[1].replace(/"/g, '');
          if (pid && !isNaN(parseInt(pid))) {
            pids.push(pid);
          }
        }
      }
      
      if (pids.length === 0) {
        console.log(`[CLOSE] No CMD window PID found for index ${index}`);
        resolve();
        return;
      }
      
      // 杀死这些 CMD 进程
      let killed = 0;
      for (const pid of pids) {
        const killCmd = `taskkill /F /PID ${pid}`;
        exec(killCmd, (err) => {
          killed++;
          if (err) {
            console.log(`[CLOSE] Failed to kill CMD PID ${pid}: ${err.message}`);
          } else {
            console.log(`[CLOSE] Killed CMD window PID ${pid}`);
          }
          if (killed === pids.length) {
            console.log(`[CLOSE] CMD windows for index ${index} closed`);
            resolve();
          }
        });
      }
    });
  });
}

// 获取记录详情
async function getRecordDetail(token, recordId, tableId) {
  return new Promise((resolve) => {
    const targetTableId = tableId || CONFIG.tableId;

    const options = {
      hostname: 'open.feishu.cn',
      port: 443,
      path: `/open-apis/bitable/v1/apps/${CONFIG.appToken}/tables/${targetTableId}/records/${recordId}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    };

    console.log('[API] Get record detail:', recordId, 'Table:', targetTableId);

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          console.log('[API] Record detail result:', JSON.stringify(result));
          resolve(result);
        } catch(e) {
          resolve({ code: -1, msg: body });
        }
      });
    });
    req.on('error', (err) => resolve({ code: -1, msg: err.message }));
    req.end();
  });
}

// 请求本地代理启动 Chrome
async function requestLocalAgentStart(index, maxWaitTime = 60000) {
  const http = require('http');

  return new Promise((resolve) => {
    console.log(`[AGENT] Requesting local agent to start Chrome ${index}...`);

    const data = JSON.stringify({});
    const options = {
      hostname: 'localhost',
      port: 3004,
      path: `/start-chrome/${index}`,
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
          console.log('[AGENT] Start request result:', result);

          if (result.success) {
            // 等待 Chrome 启动完成
            console.log(`[AGENT] Waiting for Chrome ${index} to be ready...`);
            const checkInterval = 2000;
            let waited = 0;

            const checkReady = () => {
              const checkReq = http.request({
                hostname: 'localhost',
                port: 3004,
                path: `/chrome-status/${index}`,
                method: 'GET'
              }, (checkRes) => {
                let checkBody = '';
                checkRes.on('data', (chunk) => checkBody += chunk);
                checkRes.on('end', () => {
                  try {
                    const status = JSON.parse(checkBody);
                    if (status.ready) {
                      console.log(`[AGENT] Chrome ${index} is ready!`);
                      resolve({ success: true });
                    } else if (waited >= maxWaitTime) {
                      console.log('[AGENT] Timeout waiting for Chrome');
                      resolve({ success: false, message: 'Timeout' });
                    } else {
                      waited += checkInterval;
                      setTimeout(checkReady, checkInterval);
                    }
                  } catch (e) {
                    resolve({ success: false, message: e.message });
                  }
                });
              });
              checkReq.on('error', (err) => {
                console.log('[AGENT] Check status error:', err.message);
                if (waited >= maxWaitTime) {
                  resolve({ success: false, message: err.message });
                } else {
                  waited += checkInterval;
                  setTimeout(checkReady, checkInterval);
                }
              });
              checkReq.end();
            };

            setTimeout(checkReady, 5000); // 先等 5 秒让 Chrome 启动
          } else {
            resolve({ success: false, message: result.message });
          }
        } catch (e) {
          resolve({ success: false, message: e.message });
        }
      });
    });

    req.on('error', (err) => {
      console.error('[AGENT] Request error:', err.message);
      resolve({ success: false, message: err.message });
    });

    req.write(data);
    req.end();
  });
}

// 执行浏览器自动化
async function executeBrowserAutomation(data, token) {
  console.log('[AUTO] Starting...');
  
  // 处理 product_link 可能是对象的情况
  let productLink = data.product_link;
  if (typeof productLink === 'object' && productLink !== null) {
    productLink = productLink.link || productLink.url || productLink.href || '';
  }
  data.product_link = productLink;
  
  console.log('[AUTO] Link:', data.product_link);
  console.log('[AUTO] Comment:', data.comment_script);

  // 获取序号（默认 1）
  const index = parseInt(data.index) || 1;
  const { localPort, sshPort, userDataDir } = getPortsByIndex(index);

  console.log(`[AUTO] Using index ${index}: local=${localPort}, ssh=${sshPort}, dir=${userDataDir}`);
  await sendProgressMessage(token, `🔢 使用账号序号: ${index} (端口: ${sshPort})`, data);

  const contentType = detectContentType(data.product_link);
  console.log(`[AUTO] Content type: ${contentType.name} (${contentType.platform}/${contentType.type})`);
  await sendProgressMessage(token, `📱 识别平台: ${contentType.name}`, data);

  let browser = null;
  let connectRetries = 0;
  const maxConnectRetries = 2;

  while (connectRetries <= maxConnectRetries) {
    try {
      // 连接 Chrome（使用对应的 SSH 端口）
      console.log(`[AUTO] Connecting to Chrome on port ${sshPort}... (attempt ${connectRetries + 1})`);
      await sendProgressMessage(token, `🔌 正在连接 Chrome (端口 ${sshPort})...`, data);
      browser = await puppeteer.connect({
        browserURL: `http://localhost:${sshPort}`,
        defaultViewport: { width: 1280, height: 800 }
      });
      console.log('[AUTO] Chrome connected');
      await sendProgressMessage(token, '🔌 已连接到 Chrome', data);
      break; // 连接成功，跳出循环
    } catch (connectError) {
      console.log(`[AUTO] Connection failed: ${connectError.message}`);
      connectRetries++;

      if (connectRetries <= maxConnectRetries) {
        // 尝试通过本地代理启动 Chrome
        console.log('[AUTO] Trying to start Chrome via local agent...');
        await sendProgressMessage(token, '🚀 Chrome 未运行，正在通知本地启动...', data);

        const startResult = await requestLocalAgentStart(index);
        if (!startResult.success) {
          console.log('[AUTO] Failed to start Chrome via agent:', startResult.message);
          await sendProgressMessage(token, '❌ 本地启动 Chrome 失败，请手动启动', data);
          return { success: false, message: 'Chrome 启动失败: ' + startResult.message };
        }

        // 等待一段时间再重试连接
        console.log('[AUTO] Waiting for Chrome to start...');
        await new Promise(r => setTimeout(r, 8000));
      } else {
        // 重试次数用完
        console.error('[AUTO] Max retries reached, giving up');
        await sendProgressMessage(token, '❌ 无法连接到 Chrome，请检查本地代理是否运行', data);
        return { success: false, message: '无法连接到 Chrome: ' + connectError.message };
      }
    }
  }

  try {
    // 获取或创建页面
    const pages = await browser.pages();
    let page = pages[0];
    if (!page) {
      page = await browser.newPage();
    }

    await page.bringToFront();
    
    // 打开颜色标识页面（让用户区分不同账号）
    const { color } = getPortsByIndex(index);
    console.log(`[AUTO] Opening color marker page (index ${index}, color ${color})...`);
    await page.goto(`data:text/html,<html><head><title>账号 ${index}</title></head><body style="margin:0;display:flex;justify-content:center;align-items:center;height:100vh;background:${color};font-family:Arial;font-size:48px;color:white;text-shadow:2px 2px 4px rgba(0,0,0,0.5);"><div>🤖 账号 ${index}</div></body></html>`, {
      waitUntil: 'networkidle0'
    });
    await new Promise(r => setTimeout(r, 2000));

    // 打开链接
    console.log('[AUTO] Opening page...');
    await sendProgressMessage(token, '🌐 正在打开产品链接...', data);
    try {
      await page.goto(data.product_link, {
        waitUntil: 'domcontentloaded',
        timeout: 90000
      });
      console.log('[AUTO] Page loaded');
      await sendProgressMessage(token, '🌐 页面已加载完成', data);
    } catch (e) {
      console.log('[AUTO] Page load timeout, continuing...');
    }

    await page.bringToFront();
    await new Promise(r => setTimeout(r, 3000));

    // 页面打开后，重新检测实际的内容类型
    const actualUrl = page.url();
    console.log('[AUTO] Actual URL:', actualUrl);
    const actualContentType = detectContentType(actualUrl);
    if (actualContentType.type !== contentType.type) {
      console.log(`[AUTO] Content type corrected: ${actualContentType.name}`);
      await sendProgressMessage(token, `📱 修正平台类型: ${actualContentType.name}`, data);
    }

    // 检测是否需要验证（打开链接后）- 只在抖音平台检测
    if (actualContentType.platform === 'douyin') {
      console.log('[AUTO] Checking for verification after page load...');
      const verificationSelectors = [
        'div[class*="verify"]',
        'div[class*="captcha"]',
        'div:has-text("接收短信验证码")',
        'div:has-text("请输入验证码")',
        'input[placeholder*="验证码"]',
        'div[class*="mask"]',
        'div[class*="modal"]',
        'div[class*="dialog"]'
      ];
      
      let hasVerification = false;
      for (const selector of verificationSelectors) {
        try {
          const popup = await page.$(selector);
          if (popup) {
            const text = await popup.evaluate(el => el.textContent || '');
            const placeholder = await popup.evaluate(el => el.placeholder || '');
            if (text.includes('验证码') || text.includes('验证') || text.includes('短信') ||
                placeholder.includes('验证码') || placeholder.includes('短信')) {
              console.log('[AUTO] Found verification popup after page load:', selector);
              hasVerification = true;
              break;
            }
          }
        } catch(e) {}
      }
      
      if (hasVerification) {
        console.log('[AUTO] Verification required after page load');
        await sendProgressMessage(token, '🔒 打开页面需要验证，请手动完成验证（最多等待5分钟）', data);
        await updateRecordField(token, data.record_id, '状态', '待验证');
        
        let verifyWaitTime = 0;
        const maxVerifyWait = 5 * 60 * 1000;
        const verifyCheckInterval = 5000;
        let verificationCleared = false;
        
        while (verifyWaitTime < maxVerifyWait && !verificationCleared) {
          await new Promise(r => setTimeout(r, verifyCheckInterval));
          verifyWaitTime += verifyCheckInterval;
          
          let popupStillExists = false;
          for (const selector of verificationSelectors) {
            try {
              const popup = await page.$(selector);
              if (popup) {
                const text = await popup.evaluate(el => el.textContent || '');
                if (text.includes('验证码') || text.includes('验证')) {
                  popupStillExists = true;
                  break;
                }
              }
            } catch(e) {}
          }
          
          if (!popupStillExists) {
            console.log('[AUTO] Verification popup cleared');
            verificationCleared = true;
            await sendProgressMessage(token, '✅ 验证已完成，继续执行', data);
          }
          
          if (verifyWaitTime % 30000 === 0) {
            const remainingTime = Math.ceil((maxVerifyWait - verifyWaitTime) / 1000);
            await sendProgressMessage(token, `⏳ 等待验证完成...剩余${remainingTime}秒`, data);
          }
        }
        
        if (!verificationCleared) {
          console.log('[AUTO] Verification timeout after page load');
          return { success: false, message: '打开页面验证超时' };
        }
      }
    }

    // 根据内容类型执行不同的处理流程
    let commentInput = null;
    let isDouyinNote = false;

    if (actualContentType.platform === 'douyin' && actualContentType.type === 'note') {
      isDouyinNote = true;
      const noteResult = await handleDouyinNote(page, token, data, browser);
      if (noteResult && noteResult.success) {
        console.log('[AUTO] Douyin Note completed successfully');
        // 关闭浏览器、SSH隧道和CMD窗口
        console.log('[AUTO] Closing browser...');
        try { await closeBrowser(index); } catch(e) {}
        console.log('[AUTO] Closing SSH tunnel...');
        try { await closeSSHTunnel(index); } catch(e) {}
        console.log('[AUTO] Closing CMD window...');
        try { await closeCMDWindow(index); } catch(e) {}
        return noteResult;
      }
      if (noteResult && noteResult.commentInput) {
        commentInput = noteResult.commentInput;
      }
      // 如果没有找到评论框，继续到登录等待逻辑
    } else if (actualContentType.platform === 'douyin' && actualContentType.type === 'video') {
      await sendProgressMessage(token, '🎬 处理抖音视频...', data);
      commentInput = await handleDouyinVideo(page, token, data);
    } else {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await new Promise(r => setTimeout(r, 1500));
      commentInput = await findCommentInput(page, 'default', token, data);
    }

    // 如果还是没找到评论框，等待用户登录（支持所有平台类型）
    if (!commentInput) {
      commentInput = await handleLoginWait(page, token, data, actualContentType, browser);
      if (!commentInput) {
        return { success: false, message: '等待登录超时或页面已关闭' };
      }
    }

    // 使用通用的输入和发送评论逻辑
    let contentTypeStr = 'default';
    if (actualContentType.platform === 'douyin' && actualContentType.type === 'note') {
      contentTypeStr = 'douyin_note';
    } else if (actualContentType.platform === 'douyin' && actualContentType.type === 'video') {
      contentTypeStr = 'douyin_video';
    }
    const result = await inputAndSendComment(page, commentInput, data, token, contentTypeStr);
    if (!result.success) {
      return result;
    }

    // 检查是否出现验证码弹窗
    console.log('[AUTO] Checking for verification popup...');
    const verificationPopup = await checkVerificationPopup(page);

    if (verificationPopup) {
      const verified = await waitForVerification(page, token, data, browser);
      if (!verified) {
        return { success: false, message: '发送后等待验证超时' };
      }
    }

    // 给自己发布的评论点赞
    console.log('[AUTO] Looking for like button...');
    try {
      await new Promise(r => setTimeout(r, 2000));
      const myComment = await page.$('div[data-e2e*="comment-item"]:first-child, div[class*="comment-item"]:first-child');
      if (myComment) {
        const likeButton = await myComment.$('svg, span[class*="like"], div[class*="like"], [data-e2e*="like"]');
        if (likeButton) {
          await likeButton.click();
          console.log('[AUTO] Liked my comment!');
        } else {
          console.log('[AUTO] Like button not found');
        }
      } else {
        console.log('[AUTO] My comment not found');
      }
    } catch (e) {
      console.log('[AUTO] Like failed:', e.message);
    }

    // 最终截图
    const ts = Date.now();
    const screenshotPath = `/tmp/comment_${data.record_id}_${ts}.png`;
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log('[AUTO] Screenshot saved:', screenshotPath);

    await browser.disconnect();
    
    // 关闭浏览器（但保留用户数据）
    console.log('[AUTO] Closing browser...');
    try {
      await closeBrowser(index);
    } catch(e) {
      console.log('[AUTO] Failed to close browser:', e.message);
    }
    
    // 关闭 SSH 隧道
    console.log('[AUTO] Closing SSH tunnel...');
    try {
      await closeSSHTunnel(index);
    } catch(e) {
      console.log('[AUTO] Failed to close SSH tunnel:', e.message);
    }
    
    // 关闭 CMD 窗口
    console.log('[AUTO] Closing CMD window...');
    try {
      await closeCMDWindow(index);
    } catch(e) {
      console.log('[AUTO] Failed to close CMD window:', e.message);
    }
    
    return { success: true, screenshotPath };

  } catch (error) {
    console.error('[AUTO] Error:', error.message);
    if (browser) {
      try { await browser.disconnect(); } catch(e) {}
    }
    // 失败时也关闭浏览器和 SSH
    try {
      await closeBrowser(index);
    } catch(e) {}
    try {
      await closeSSHTunnel(index);
    } catch(e) {}
    try {
      await closeCMDWindow(index);
    } catch(e) {}
    return { success: false, message: error.message };
  }
}

// 检查验证码弹窗
async function checkVerificationPopup(page) {
  const verificationSelectors = [
    'div[class*="verify"]',
    'div[class*="captcha"]',
    'div:has-text("接收短信验证码")',
    'div:has-text("请输入验证码")',
    'input[placeholder*="验证码"]',
    'input[placeholder*="短信"]'
  ];

  for (const selector of verificationSelectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        const text = await el.evaluate(el => el.textContent || '');
        const placeholder = await el.evaluate(el => el.placeholder || '');
        if (text.includes('验证码') || text.includes('验证') || text.includes('短信') ||
            placeholder.includes('验证码') || placeholder.includes('短信')) {
          console.log('[AUTO] Found verification popup:', selector);
          return el;
        }
      }
    } catch(e) {}
  }
  return null;
}

// 等待验证
async function waitForVerification(page, token, data, browser) {
  console.log('[AUTO] Verification popup detected');
  await sendProgressMessage(token, '🔒 发送后检测到验证码弹窗，请手动完成验证', data);
  await updateRecordField(token, data.record_id, '状态', '待验证');

  let verifyWaitTime = 0;
  const maxVerifyWaitTime = 10 * 60 * 1000;
  const verifyCheckInterval = 3000;

  while (verifyWaitTime < maxVerifyWaitTime) {
    await new Promise(r => setTimeout(r, verifyCheckInterval));
    verifyWaitTime += verifyCheckInterval;

    console.log(`[AUTO] Waiting for verification... ${verifyWaitTime / 1000}s`);

    const popupStillExists = await checkVerificationPopup(page);
    if (!popupStillExists) {
      console.log('[AUTO] Verification popup closed');
      await sendProgressMessage(token, '✅ 检测到验证已完成，继续执行后续操作', data);
      await new Promise(r => setTimeout(r, 2000));
      return true;
    }

    // 每30秒发送一次等待提示
    if (verifyWaitTime % 30000 === 0) {
      const remainingTime = Math.ceil((maxVerifyWaitTime - verifyWaitTime) / 1000);
      await sendProgressMessage(token, `⏳ 仍在等待验证完成...剩余${remainingTime}秒`, data);
    }
  }

  console.log('[AUTO] Verification timeout');
  await updateRecordField(token, data.record_id, '状态', '失败');
  await browser.disconnect();
  return false;
}

// 等待登录处理
async function handleLoginWait(page, token, data, contentType, browser) {
  console.log('[AUTO] Comment input not found - may need login');
  await sendProgressMessage(token, '🔐 等待用户登录（最多等待5分钟）...', data);
  await updateRecordField(token, data.record_id, '状态', '待登录');

  let loginWaitTime = 0;
  const maxWaitTime = 5 * 60 * 1000;
  const checkInterval = 5000;

  let commentInput = null;
  let pageClosed = false;

  while (loginWaitTime < maxWaitTime && !pageClosed) {
    await new Promise(r => setTimeout(r, checkInterval));
    loginWaitTime += checkInterval;

    try {
      await page.evaluate(() => document.title);
    } catch (e) {
      if (e.message.includes('Session closed') || e.message.includes('Target closed')) {
        console.log('[AUTO] Page was closed');
        pageClosed = true;
        break;
      }
    }

    console.log(`[AUTO] Waiting for login... ${loginWaitTime / 1000}s`);

    try {
      if (contentType.platform === 'douyin' && contentType.type === 'note') {
        commentInput = await handleDouyinNote(page, token, data, browser);
      } else if (contentType.platform === 'douyin' && contentType.type === 'video') {
        commentInput = await handleDouyinVideo(page, token, data);
      } else {
        commentInput = await findCommentInput(page, 'default', token, data);
      }
    } catch (e) {
      console.log('[AUTO] Error finding comment input:', e.message);
      if (e.message.includes('Session closed') || e.message.includes('Target closed') || e.message.includes('detached Frame')) {
        pageClosed = true;
        console.log('[AUTO] Page closed or detached, terminating task');
        break;
      }
    }

    if (commentInput) {
      try {
        const isEditable = await commentInput.evaluate(el => {
          return !el.disabled && !el.readOnly && el.contentEditable !== 'false';
        });
        if (isEditable) {
          console.log('[AUTO] Found editable comment input after login');
          await sendProgressMessage(token, '✅ 检测到用户已登录，继续执行任务', data);
          break;
        }
      } catch(e) {}
    }

    // 每30秒发送一次等待提示
    if (loginWaitTime % 30000 === 0) {
      const remainingTime = Math.ceil((maxWaitTime - loginWaitTime) / 1000);
      await sendProgressMessage(token, `⏳ 仍在等待登录...剩余${remainingTime}秒`, data);
    }
  }

  if (pageClosed) {
    console.log('[AUTO] Page closed, task cancelled');
    await updateRecordField(token, data.record_id, '状态', '失败');
    return null;
  }

  if (!commentInput) {
    console.log('[AUTO] Login timeout');
    await updateRecordField(token, data.record_id, '状态', '失败');
    return null;
  }

  return commentInput;
}

// 处理评论任务
async function handleCommentTask(data) {
  console.log('\n========================================');
  console.log('Task:', data.record_id);
  console.log('Product:', data.product_name);
  console.log('Table ID:', data.table_id);
  console.log('========================================\n');

  // 如果 table_id 无效，使用默认
  let effectiveTableId = data.table_id || CONFIG.tableId;
  
  // 尝试验证 table_id 是否有效
  const token = await getTenantAccessToken();
  const testRecord = await getRecordDetail(token, data.record_id, effectiveTableId);
  if (testRecord.code !== 0 && effectiveTableId !== CONFIG.tableId) {
    console.log('[TASK] Provided table_id invalid, using default:', CONFIG.tableId);
    effectiveTableId = CONFIG.tableId;
    data.table_id = CONFIG.tableId; // 更新 data 中的 table_id
  }
  
  setCurrentTableId(effectiveTableId);

  try {
    await updateRecordField(token, data.record_id, '状态', '处理中');
    console.log('[TASK] Processing...');

    const result = await executeBrowserAutomation(data, token);

    if (result.success) {
      await updateRecordField(token, data.record_id, '状态', '已完成');
      await updateRecordField(token, data.record_id, '完成时间', Date.now());

      // 上传最终截图到附件字段
      if (result.screenshotPath) {
        console.log('[TASK] Uploading screenshot...');
        try {
          const form = new FormData();
          form.append('file_name', 'comment_screenshot.png');
          form.append('parent_type', 'bitable');
          form.append('parent_node', CONFIG.appToken);
          form.append('size', fs.statSync(result.screenshotPath).size.toString());
          form.append('file', fs.createReadStream(result.screenshotPath));

          const uploadResult = await new Promise((resolve) => {
            const options = {
              hostname: 'open.feishu.cn',
              port: 443,
              path: '/open-apis/drive/v1/medias/upload_all',
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                ...form.getHeaders()
              }
            };

            const req = https.request(options, (res) => {
              let body = '';
              res.on('data', (chunk) => body += chunk);
              res.on('end', () => {
                try { resolve(JSON.parse(body)); } catch(e) { resolve({ code: -1, msg: body }); }
              });
            });
            req.on('error', (err) => resolve({ code: -1, msg: err.message }));
            form.pipe(req);
          });

          if (uploadResult.code === 0 && uploadResult.data && uploadResult.data.file_token) {
            await updateRecordField(token, data.record_id, '评论截图', [{ file_token: uploadResult.data.file_token }]);
            console.log('[TASK] Screenshot uploaded');
            await sendProgressMessage(token, '📤 截图已上传飞书表格', data);
          } else {
            console.log('[TASK] Upload failed:', uploadResult.msg);
          }
        } catch (e) {
          console.log('[TASK] Upload error:', e.message);
        }
      }

      // 发送简洁的成功通知
      await sendFeishuMessage(token, `✅ 任务全部完成: ${data.product_name}`);
      console.log('[TASK] Complete');

    } else {
      await updateRecordField(token, data.record_id, '状态', '失败');
      await sendFeishuMessage(token, `❌ 评论失败: ${data.product_name} - ${result.message}`);
      console.log('[TASK] Failed');
    }

    return result;
  } catch (error) {
    console.error('[TASK] Error:', error.message);
    try {
      if (!token) token = await getTenantAccessToken();
      await updateRecordField(token, data.record_id, '状态', '失败');
    } catch(e) {}
    return { success: false, message: error.message };
  }
}

// 处理评论请求
async function handleCommentRequest(data) {
  console.log('\n[REQUEST] Received:', data.record_id);
  console.log('[REQUEST] Raw data:', JSON.stringify(data));

  try {
    const token = await getTenantAccessToken();

    // 获取记录详情（包含序号等字段）
    console.log('[REQUEST] Fetching record detail...');
    let recordDetail = await getRecordDetail(token, data.record_id, data.table_id);

    // 如果失败，尝试使用默认表格 ID
    if (recordDetail.code !== 0 && data.table_id !== CONFIG.tableId) {
      console.log('[REQUEST] Failed with provided table_id, trying default...');
      recordDetail = await getRecordDetail(token, data.record_id, CONFIG.tableId);
      if (recordDetail.code === 0) {
        data.table_id = CONFIG.tableId;
        console.log('[REQUEST] Using default table_id:', CONFIG.tableId);
      }
    }

    if (recordDetail.code === 0 && recordDetail.data && recordDetail.data.record) {
      const record = recordDetail.data.record;
      const fields = record.fields || {};

      // 合并记录详情到 data
      data.index = fields['序号'] || data.index || '1';
      data.product_name = fields['产品名称'] || data.product_name || '';
      data.product_link = fields['产品链接'] || data.product_link || '';
      data.comment_script = fields['评论话术'] || data.comment_script || '';
      data.product_info = fields['产品信息'] || data.product_info || '';

      console.log('[REQUEST] Merged data:', {
        record_id: data.record_id,
        index: data.index,
        product_name: data.product_name,
        product_link: data.product_link
      });
    } else {
      console.log('[REQUEST] Failed to get record detail, using default index: 1');
      data.index = data.index || '1';
    }

    await updateRecordField(token, data.record_id, '状态', '进行中');
    console.log('[REQUEST] Started with index:', data.index);

    handleCommentTask(data).then(result => {
      console.log('[REQUEST] Result:', result.success ? 'success' : 'failed');
    }).catch(err => {
      console.error('[REQUEST] Error:', err.message);
    });

    return { success: true, message: 'Processing...' };
  } catch (error) {
    console.error('[REQUEST] Error:', error.message);
    return { success: false, message: error.message };
  }
}

// Express 应用
const app = express();
const PORT = CONFIG.PORT || 3001;

app.use(express.json({ strict: false }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Webhook', agent: CONFIG.AGENT_ID });
});

app.post('/comment', async (req, res) => {
  try {
    console.log('\n[HTTP] POST /comment');
    
    // 将任务添加到队列
    const result = await addToQueue(req.body);
    res.json({ code: result.success ? 0 : -1, msg: result.success ? 'success' : 'error', data: result });
  } catch (error) {
    console.error('[HTTP] Error:', error.message);
    res.status(400).json({ code: -1, msg: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('========================================');
  console.log('Webhook Forwarder - Optimized');
  console.log('Port:', PORT);
  console.log('========================================\n');
});
