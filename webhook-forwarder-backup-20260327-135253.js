// Webhook 转发服务 - 将飞书按钮点击转发给 auto-comment-assistant
const express = require('express');
const https = require('https');
const puppeteer = require('puppeteer-core');

// 配置
const appId = 'cli_a94a6492e1f61cd3';
const appSecret = 'NyEi5RuX4YU2YJ4nNsFFwfetvWjpmRiS';
const appToken = 'QQ9Cbui0eaixinsS62VcGN47nqc';
const tableId = 'tbl5ovriK4ieq4sb';  // 默认表格ID
const tableIds = ['tbl5ovriK4ieq4sb', 'tbl0ZAW2xnK7o7Tl']; // 支持多个表格ID
const AGENT_ID = 'auto-comment-assistant';
const CHAT_ID = 'oc_b8f9287e7c024fb9a7dfa274d1edc8d1';

// 获取 tenant_access_token
async function getTenantAccessToken() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ app_id: appId, app_secret: appSecret });
    const options = {
      hostname: 'open.feishu.cn',
      port: 443,
      path: '/open-apis/auth/v3/tenant_access_token/internal',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (result.code === 0) resolve(result.tenant_access_token);
          else reject(new Error(result.msg));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// 当前请求使用的表格 ID（全局变量，用于在当前请求上下文中共享）
let currentRequestTableId = tableId;

// 发送进度消息给用户
async function sendProgressMessage(token, message, data) {
  const fullMessage = `🔄 评论进度更新\n\n` +
    `📱 产品：${data.product_name}\n` +
    `📝 记录ID：${data.record_id}\n` +
    `⏱️ 时间：${new Date().toLocaleString()}\n\n` +
    `📍 进度：${message}`;

  await sendFeishuMessage(token, fullMessage);
}

// 更新记录字段 - 使用请求中传递的 table_id 或默认表格 ID
async function updateRecordField(token, recordId, fieldName, value) {
  return new Promise((resolve) => {
    const requestBody = { fields: { [fieldName]: value } };
    const data = JSON.stringify(requestBody);
    const targetTableId = currentRequestTableId || tableId;

    const options = {
      hostname: 'open.feishu.cn',
      port: 443,
      path: `/open-apis/bitable/v1/apps/${appToken}/tables/${targetTableId}/records/${recordId}`,
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    console.log('[API] Update record:', recordId, 'Table:', targetTableId, 'Field:', fieldName);
    console.log('[API] Request body:', data);

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          console.log('[API] Update result:', JSON.stringify(result));
          resolve(result);
        } catch(e) {
          resolve({ code: -1, msg: body });
        }
      });
    });
    req.on('error', (err) => resolve({ code: -1, msg: err.message }));
    req.write(data);
    req.end();
  });
}

// 发送飞书消息
async function sendFeishuMessage(token, message) {
  return new Promise((resolve) => {
    const requestBody = {
      receive_id: CHAT_ID,
      content: JSON.stringify({ text: message }),
      msg_type: 'text'
    };
    const data = JSON.stringify(requestBody);
    const options = {
      hostname: 'open.feishu.cn',
      port: 443,
      path: '/open-apis/im/v1/messages?receive_id_type=chat_id',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch(e) { resolve({ code: -1, msg: body }); }
      });
    });
    req.on('error', () => resolve({ code: -1, msg: 'error' }));
    req.write(data);
    req.end();
  });
}

// 上传截图到飞书云文档/云空间，然后获取链接
async function uploadScreenshot(token, recordId, filePath) {
  return new Promise((resolve) => {
    const fs = require('fs');
    const FormData = require('form-data');

    const stats = fs.statSync(filePath);
    const fileSize = stats.size;

    const form = new FormData();
    form.append('file_name', 'comment_screenshot.png');
    form.append('parent_type', 'bitable');
    form.append('parent_node', appToken);
    form.append('size', fileSize.toString());
    form.append('file', fs.createReadStream(filePath));

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
        try {
          const result = JSON.parse(body);
          resolve(result);
        } catch(e) {
          resolve({ code: -1, msg: body });
        }
      });
    });
    req.on('error', (err) => resolve({ code: -1, msg: err.message }));
    form.pipe(req);
  });
}

// 识别内容类型
function detectContentType(url) {
  if (url.includes('douyin.com/note')) {
    return { platform: 'douyin', type: 'note', name: '抖音图文' };
  } else if (url.includes('douyin.com/video') || url.includes('v.douyin.com')) {
    return { platform: 'douyin', type: 'video', name: '抖音视频' };
  } else if (url.includes('xiaohongshu.com')) {
    return { platform: 'xiaohongshu', type: 'note', name: '小红书' };
  } else if (url.includes('bilibili.com')) {
    return { platform: 'bilibili', type: 'video', name: 'B站' };
  } else {
    return { platform: 'unknown', type: 'unknown', name: '未知平台' };
  }
}

// 通用评论输入和发送逻辑
async function inputAndSendComment(page, commentInput, data, token, contentType = 'default') {
  console.log('[AUTO] Inputting and sending comment...');
  console.log('[AUTO] Content type:', contentType);

  // 滚动到评论框位置
  try {
    await commentInput.evaluate(el => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await new Promise(r => setTimeout(r, 500));
  } catch(e) {}

  // 点击评论框 - 使用多种方式确保激活
  let activated = false;

  // 方式1: 直接点击
  try {
    await commentInput.click();
    console.log('[AUTO] Clicked comment input (direct)');
    activated = true;
  } catch(e) {
    console.log('[AUTO] Direct click failed:', e.message);
  }

  // 方式2: 点击输入框内的特定位置（模拟真实用户点击）
  if (!activated) {
    try {
      const box = await commentInput.boundingBox();
      if (box) {
        // 点击输入框的中心位置
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        console.log('[AUTO] Clicked comment input center position');
        activated = true;
      }
    } catch(e) {
      console.log('[AUTO] Center click failed:', e.message);
    }
  }

  // 方式3: JavaScript 点击
  if (!activated) {
    try {
      await commentInput.evaluate(el => {
        // 尝试点击子元素（placeholder 或实际输入区域）
        const child = el.querySelector('[contenteditable="true"]') ||
                     el.querySelector('div') ||
                     el;
        child.click();
        child.focus();
      });
      console.log('[AUTO] Clicked comment input child element');
      activated = true;
    } catch(e) {
      console.log('[AUTO] Child click failed:', e.message);
    }
  }

  // 方式4: dispatchEvent
  if (!activated) {
    try {
      await commentInput.evaluate(el => {
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        el.dispatchEvent(clickEvent);
      });
      console.log('[AUTO] Clicked comment input (dispatch)');
      activated = true;
    } catch(e) {
      console.log('[AUTO] Dispatch click failed:', e.message);
    }
  }

  if (!activated) {
    console.log('[AUTO] Failed to activate comment input');
    return { success: false, message: '无法激活评论框' };
  }

  // 等待激活完成
  await new Promise(r => setTimeout(r, 1500));

  // 根据内容类型使用不同的聚焦逻辑
  if (contentType === 'douyin_note') {
    // 抖音图文：简化聚焦逻辑
    console.log('[AUTO] Using douyin_note specific focus logic');
    try {
      await commentInput.evaluate(el => {
        el.focus();
      });
      console.log('[AUTO] Simple focus for douyin_note');
    } catch(e) {
      console.log('[AUTO] Simple focus failed:', e.message);
    }
  } else if (contentType === 'douyin_video') {
    // 抖音视频：使用昨天成功的方案
    console.log('[AUTO] Using douyin_video specific focus logic');
    try {
      await commentInput.click();
      await new Promise(r => setTimeout(r, 1000));
      await commentInput.evaluate(el => el.focus());
      await new Promise(r => setTimeout(r, 500));
      console.log('[AUTO] Focused for douyin_video');
    } catch(e) {
      console.log('[AUTO] Video focus failed:', e.message);
    }
  } else {
    // 其他平台的完整聚焦逻辑
    try {
      await commentInput.evaluate(el => {
        el.focus();

        if (el.contentEditable === 'true' || el.contentEditable === 'inherit') {
          el.innerHTML = '';
          const range = document.createRange();
          const sel = window.getSelection();
          range.setStart(el, 0);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        } else {
          el.value = '';
          el.setSelectionRange(0, 0);
        }

        el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
      });
      console.log('[AUTO] Focused and positioned cursor');
    } catch(e) {
      console.log('[AUTO] Focus failed:', e.message);
    }
  }

  // 等待光标出现
  await new Promise(r => setTimeout(r, 800));

  // 截图4: 激活评论框后
  try {
    await page.screenshot({ path: `/tmp/step4_activated_${Date.now()}.png`, fullPage: false });
    console.log('[AUTO] Screenshot 4: activated saved');
  } catch(e) {}

  // 使用多种方式输入评论
  console.log('[AUTO] Typing comment:', data.comment_script);
  await sendProgressMessage(token, `⌨️ 正在输入评论: ${data.comment_script.substring(0, 20)}...`, data);

  let inputSuccess = false;

  // 先确保页面有焦点
  try {
    await page.bringToFront();
    await new Promise(r => setTimeout(r, 200));
  } catch(e) {}

  // 方法1: 使用 keyboard 输入（最可靠的方式）
  try {
    console.log('[AUTO] Trying keyboard input...');
    // 先点击一下确保焦点
    await commentInput.click();
    await new Promise(r => setTimeout(r, 800));

    // 再次点击并聚焦
    await commentInput.evaluate(el => {
      el.focus();
      el.click();
    });
    await new Promise(r => setTimeout(r, 500));

    // 截图5: 点击准备输入
    try {
      await page.screenshot({ path: `/tmp/step5_ready_to_type_${Date.now()}.png`, fullPage: false });
      console.log('[AUTO] Screenshot 5: ready to type saved');
    } catch(e) {}

    // 然后输入
    await page.keyboard.type(data.comment_script, { delay: 50 });
    console.log('[AUTO] Typed with keyboard');
    inputSuccess = true;
  } catch(e) {
    console.log('[AUTO] Keyboard input failed:', e.message);
  }

  // 截图6: 输入后
  try {
    await page.screenshot({ path: `/tmp/step6_after_input_${Date.now()}.png`, fullPage: false });
    console.log('[AUTO] Screenshot 6: after input saved');
  } catch(e) {}

  // 方法2: 如果 keyboard 失败，使用 evaluate 直接设置
  if (!inputSuccess) {
    try {
      console.log('[AUTO] Trying evaluate input...');
      await commentInput.evaluate((el, text) => {
        // 确保元素获得焦点
        el.focus();
        el.click();

        // 清空现有内容
        if (el.contentEditable === 'true' || el.contentEditable === 'inherit') {
          el.innerHTML = '';
          // 创建文本节点并插入
          const textNode = document.createTextNode(text);
          el.appendChild(textNode);
        } else {
          el.value = text;
        }

        // 触发多个事件确保抖音能检测到输入
        el.dispatchEvent(new Event('focus', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

        // 再次聚焦
        el.focus();
      }, data.comment_script);

      // 等待事件处理
      await new Promise(r => setTimeout(r, 500));

      // 验证输入
      const content = await commentInput.evaluate(el => el.innerText || el.value || '');
      if (content && content.includes(data.comment_script.substring(0, 10))) {
        console.log('[AUTO] Input successful using evaluate');
        inputSuccess = true;
      } else {
        console.log('[AUTO] Evaluate input verification failed, content:', content.substring(0, 30));
      }
    } catch(e) {
      console.log('[AUTO] Evaluate input failed:', e.message);
    }
  }

  if (!inputSuccess) {
    await sendProgressMessage(token, '❌ 输入评论失败', data);
    return { success: false, message: '输入评论失败' };
  }

  // 截图验证输入结果
  try {
    await page.screenshot({ path: `/tmp/after_input_${Date.now()}.png`, fullPage: false });
  } catch(e) {}

  await sendProgressMessage(token, '✅ 评论内容已输入', data);
  console.log('[AUTO] Comment entered');
  await new Promise(r => setTimeout(r, 1500));

  // 查找发送按钮
  console.log('[AUTO] Looking for send button...');
  let sendButton = null;
  await new Promise(r => setTimeout(r, 1000));

  // 抖音发送按钮选择器（按优先级排序）
  const sendButtonSelectors = [
    'span.WFB7wUOX.NUzvFSPe',  // 最精确的选择器（两个 class）
    'span[class*="WFB7wUOX"][class*="NUzvFSPe"]',  // 包含两个 class
    'div[class*="comment-input-right-ct"] span[class*="WFB7wUOX"]',  // 容器内的按钮
    'div[class*="GXmFLge7"] ~ div span[class*="WFB7wUOX"]',  // 评论框后面的按钮
    'span[class*="WFB7wUOX"]',  // 通用 class
    'span[class*="NUzvFSPe"]',  // 另一个通用 class
    'div[class*="comment-input-right-ct"] svg',  // SVG 按钮
    'svg[class*="WFB7wUOX"]',  // SVG 特定 class
  ];

  for (const selector of sendButtonSelectors) {
    try {
      const btn = await page.$(selector);
      if (btn) {
        const className = await btn.evaluate(el => el.className || '');
        const tagName = await btn.evaluate(el => el.tagName);
        console.log('[AUTO] Found button:', selector, 'tag:', tagName, 'class:', className.substring(0, 30));
        sendButton = btn;
        break;
      }
    } catch(e) {}
  }

  // 截图7: 查找发送按钮前
  try {
    await page.screenshot({ path: `/tmp/step7_before_send_${Date.now()}.png`, fullPage: false });
    console.log('[AUTO] Screenshot 7: before send saved');
  } catch(e) {}

  if (sendButton) {
    console.log('[AUTO] Clicking send button...');
    await sendProgressMessage(token, '📤 点击发送按钮...', data);

    // 尝试多种点击方式
    let clicked = false;

    // 方式1: 直接点击
    try {
      await sendButton.click();
      console.log('[AUTO] Direct click success');
      clicked = true;
    } catch(e) {
      console.log('[AUTO] Direct click failed:', e.message);
    }

    // 方式2: 使用 evaluate 点击元素本身
    if (!clicked) {
      try {
        await sendButton.evaluate(el => el.click());
        console.log('[AUTO] Element click success');
        clicked = true;
      } catch(e) {
        console.log('[AUTO] Element click failed:', e.message);
      }
    }

    // 方式3: 使用 dispatchEvent 触发点击事件
    if (!clicked) {
      try {
        await sendButton.evaluate(el => {
          const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          });
          el.dispatchEvent(clickEvent);
        });
        console.log('[AUTO] Dispatch click success');
        clicked = true;
      } catch(e) {
        console.log('[AUTO] Dispatch click failed:', e.message);
      }
    }

    // 方式4: 点击父元素
    if (!clicked) {
      try {
        await sendButton.evaluate(el => {
          if (el.parentElement) {
            el.parentElement.click();
          }
        });
        console.log('[AUTO] Parent click success');
        clicked = true;
      } catch(e) {
        console.log('[AUTO] Parent click failed:', e.message);
      }
    }

    if (clicked) {
      await sendProgressMessage(token, '✅ 评论已发送', data);
      console.log('[AUTO] Sent!');
    } else {
      await sendProgressMessage(token, '❌ 点击发送按钮失败', data);
      return { success: false, message: '点击发送按钮失败' };
    }

    // 等待发送完成
    await new Promise(r => setTimeout(r, 3000));

    // 截图8: 发送后
    try {
      await page.screenshot({ path: `/tmp/step8_after_send_${Date.now()}.png`, fullPage: false });
      console.log('[AUTO] Screenshot 8: after send saved');
    } catch(e) {}

  } else {
    console.log('[AUTO] Button not found, trying Enter key...');
    await sendProgressMessage(token, '⚠️ 未找到发送按钮，尝试按回车键...', data);
    await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 3000));
  }

  return { success: true };
}

// 抖音图文处理流程 - 简化版（只保留切换tab和滚动）
async function handleDouyinNote(page, token, data, browser) {
  console.log('[AUTO] Handling Douyin Note...');
  await sendProgressMessage(token, '📝 处理抖音图文...', data);

  // 等待页面加载
  await new Promise(r => setTimeout(r, 2000));

  // 点击"评论"tab
  console.log('[AUTO] Clicking comment tab...');
  await sendProgressMessage(token, '🔘 点击评论tab...', data);

  try {
    // 使用 evaluate 查找并点击评论 tab
    const result = await page.evaluate(() => {
      // 方法1: 先尝试查找具有特定 class 的 tab
      const tabSelectors = [
        'div[class*="cxpsBymd"]',
        'div[class*="kNtvycrk"]',
        'div[role="tab"]'
      ];

      for (const selector of tabSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          const text = el.textContent || '';
          // 精确匹配"评论(数字)"，且文本不要太长（避免匹配到容器）
          if (text.match(/^评论\s*\(\d+\)$/) || text.match(/评论\s*\(\d+\)/)) {
            const rect = el.getBoundingClientRect();
            // 确保在内容区域
            if (rect.y > 100 && rect.y < 600 && text.length < 50) {
              el.click();
              return {
                found: true,
                text: text.substring(0, 30),
                y: rect.y,
                className: el.className,
                method: 'selector'
              };
            }
          }
        }
      }

      // 方法2: 遍历所有元素，找最接近纯"评论(数字)"的
      const elements = document.querySelectorAll('div, span, button, a');
      let bestMatch = null;
      let bestLength = Infinity;

      for (const el of elements) {
        const text = el.textContent || '';
        // 匹配"评论(数字)"
        if (text.match(/评论\s*\(\d+\)/)) {
          const rect = el.getBoundingClientRect();
          // 确保在内容区域，且文本较短（避免容器）
          if (rect.y > 100 && rect.y < 600 && text.length < bestLength) {
            bestMatch = {
              element: el,
              text: text,
              y: rect.y,
              className: el.className,
              length: text.length
            };
            bestLength = text.length;
          }
        }
      }

      if (bestMatch) {
        bestMatch.element.click();
        return {
          found: true,
          text: bestMatch.text.substring(0, 30),
          y: bestMatch.y,
          className: bestMatch.className,
          method: 'bestMatch',
          length: bestMatch.length
        };
      }

      return { found: false };
    });

    if (!result.found) {
      console.log('[AUTO] Comment tab not found');
      await sendProgressMessage(token, '❌ 未找到评论tab', data);
      return null;
    }

    console.log('[AUTO] Clicked comment tab:', result.text, 'y:', result.y, 'class:', result.className);
    await sendProgressMessage(token, '✅ 已点击评论tab', data);

    // 等待页面切换动画
    await new Promise(r => setTimeout(r, 2000));

    // 截图查看点击后的页面
    try {
      await page.screenshot({ path: `/tmp/after_tab_click_${Date.now()}.png`, fullPage: false });
    } catch(e) {}

    // 滚动到评论区（图文页面需要滚动才能看到评论框）
    console.log('[AUTO] Scrolling to comment section...');

    // 多次滚动确保评论区可见
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        // 尝试找到评论区并滚动到它
        const commentSection = document.querySelector('div[class*="comment"]') ||
                              document.querySelector('div[class*="GXmFLge7"]') ||
                              document.querySelector('div[contenteditable="true"]');
        if (commentSection) {
          commentSection.scrollIntoView({ behavior: 'instant', block: 'center' });
        } else {
          // 如果找不到，滚动到页面底部
          window.scrollTo(0, document.body.scrollHeight);
        }
      });
      await new Promise(r => setTimeout(r, 1000));
    }

    // 再次截图查看滚动后的页面
    try {
      await page.screenshot({ path: `/tmp/after_scroll_${Date.now()}.png`, fullPage: false });
    } catch(e) {}

    console.log('[AUTO] Douyin Note: Tab switched and scrolled to comment section');
    await sendProgressMessage(token, '✅ 已切换到评论区', data);

    // 等待评论区加载 - 增加等待时间
    console.log('[AUTO] Waiting for comment section to load...');
    await new Promise(r => setTimeout(r, 3000));

    // 截图查看当前页面状态
    try {
      const debugPath = `/tmp/douyin_note_debug_${Date.now()}.png`;
      await page.screenshot({ path: debugPath, fullPage: false });
      console.log('[AUTO] Debug screenshot saved:', debugPath);
    } catch(e) {}

    // 扫描页面上的所有元素，帮助调试
    console.log('[AUTO] Scanning page elements...');
    const pageInfo = await page.evaluate(() => {
      const info = {
        contentEditableCount: document.querySelectorAll('div[contenteditable="true"]').length,
        gxmElements: document.querySelectorAll('[class*="GXm"]').length,
        commentInputElements: document.querySelectorAll('[class*="comment-input"]').length,
        allClasses: []
      };

      // 收集页面上所有包含特定关键词的 class
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        if (el.className && typeof el.className === 'string') {
          if (el.className.includes('GXm') ||
              el.className.includes('comment') ||
              el.className.includes('input')) {
            info.allClasses.push({
              tag: el.tagName,
              class: el.className.substring(0, 100),
              y: el.getBoundingClientRect().y
            });
          }
        }
      }

      return info;
    });

    console.log('[AUTO] Page scan result:', JSON.stringify(pageInfo, null, 2));

    // 查找评论框 - 参考抖音视频的逻辑
    console.log('[AUTO] Looking for comment input...');
    await sendProgressMessage(token, '🔍 查找评论框...', data);

    let commentInput = null;
    let attempts = 0;
    const maxAttempts = 15;  // 增加尝试次数

    // 抖音图文评论框选择器（按优先级排序）
    const noteSelectors = [
      'div.GXmFLge7.comment-input-inner-container',  // 精确匹配
      'div[class*="GXmFLge7"][class*="comment-input-inner-container"]',  // 同时包含两个 class
      'div[class*="GXmFLge7"]',  // 图文评论框 class
      'div[class*="comment-input-inner-container"]',  // 通用容器
      'div[contenteditable="true"]',  // 通用的 contenteditable
      'div[placeholder*="评论"]',  // placeholder 包含评论
      'div[placeholder*="说点什么"]',  // placeholder 包含说点什么
    ];

    while (!commentInput && attempts < maxAttempts) {
      // 方法1: 使用预设选择器
      for (const selector of noteSelectors) {
        try {
          const elements = await page.$$(selector);
          console.log(`[AUTO] Selector "${selector}" found ${elements.length} elements`);

          for (const el of elements) {
            const box = await el.boundingBox();
            const className = await el.evaluate(e => e.className);
            console.log(`[AUTO] Element: class="${className?.substring(0, 50)}", y=${box?.y}, visible=${box && box.width > 0}`);

            // 确保元素可见且在页面底部（评论区）
            if (box && box.width > 0 && box.height > 0 && box.y > 300) {
              commentInput = el;
              console.log('[AUTO] Found comment input with selector:', selector, 'y:', box.y);
              break;
            }
          }

          if (commentInput) break;
        } catch(e) {
          console.log(`[AUTO] Selector "${selector}" error:`, e.message);
        }
      }

      // 方法2: 查找所有 contenteditable 元素，选择最底部的
      if (!commentInput) {
        try {
          const inputs = await page.$$('div[contenteditable="true"]');
          console.log(`[AUTO] Found ${inputs.length} contenteditable elements`);

          let bestInput = null;
          let maxY = 0;

          for (const input of inputs) {
            try {
              const box = await input.boundingBox();
              const className = await input.evaluate(e => e.className);
              console.log(`[AUTO] contenteditable: class="${className?.substring(0, 50)}", y=${box?.y}`);

              if (box && box.y > maxY && box.y > 300) {
                maxY = box.y;
                bestInput = input;
              }
            } catch(e) {}
          }

          if (bestInput) {
            commentInput = bestInput;
            console.log('[AUTO] Found comment input at bottom, y:', maxY);
          }
        } catch(e) {}
      }

      if (!commentInput) {
        await new Promise(r => setTimeout(r, 800));  // 增加等待时间
        attempts++;
        console.log(`[AUTO] Waiting for comment input... ${attempts}/${maxAttempts}`);
      }
    }

    if (!commentInput) {
      console.log('[AUTO] Comment input not found after all attempts');
      await sendProgressMessage(token, '❌ 未找到评论框', data);
      return null;
    }

    console.log('[AUTO] Comment input found');
    await sendProgressMessage(token, '✅ 找到评论框', data);

    // 确保评论框在可视区域
    try {
      await commentInput.evaluate(el => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      await new Promise(r => setTimeout(r, 500));
    } catch(e) {}

    // TODO: 光标定位逻辑 - 参考抖音视频的成功方案
    console.log('[AUTO] Positioning cursor in comment input...');
    await sendProgressMessage(token, '🎯 定位光标...', data);

    try {
      // 参考抖音视频的成功方案：
      // 1. 点击评论框
      // 2. 等待 1 秒
      // 3. 调用 focus()
      // 4. 等待 0.5 秒
      // 5. 使用 keyboard.type 输入

      await commentInput.click();
      console.log('[AUTO] Clicked comment input');
      await new Promise(r => setTimeout(r, 1000));

      await commentInput.evaluate(el => el.focus());
      console.log('[AUTO] Focused comment input');
      await new Promise(r => setTimeout(r, 500));

      console.log('[AUTO] Cursor positioned (using video logic)');
      await sendProgressMessage(token, '✅ 光标已定位', data);

      // 截图验证光标定位
      try {
        const cursorPath = `/tmp/douyin_note_cursor_${Date.now()}.png`;
        await page.screenshot({ path: cursorPath, fullPage: false });
        console.log('[AUTO] Cursor screenshot saved:', cursorPath);
      } catch(e) {}

      // 输入评论内容
      console.log('[AUTO] Typing comment:', data.comment_script);
      await sendProgressMessage(token, `⌨️ 正在输入评论...`, data);

      try {
        // 使用 keyboard.type 输入，模拟真实用户输入
        await page.keyboard.type(data.comment_script, { delay: 50 });
        console.log('[AUTO] Comment typed successfully');
        await sendProgressMessage(token, '✅ 评论内容已输入', data);

        // 截图验证输入结果
        try {
          const inputPath = `/tmp/douyin_note_input_${Date.now()}.png`;
          await page.screenshot({ path: inputPath, fullPage: false });
          console.log('[AUTO] Input screenshot saved:', inputPath);
        } catch(e) {}

        // 查找并点击发送按钮
        console.log('[AUTO] Looking for send button...');
        await sendProgressMessage(token, '🔍 查找发送按钮...', data);

        await new Promise(r => setTimeout(r, 1000)); // 等待按钮状态更新

        let sendButton = null;

        // 抖音图文发送按钮选择器（按优先级排序）
        const sendButtonSelectors = [
          'span.WFB7wUOX.NUzvFSPe',  // 最精确的选择器（两个 class）
          'span[class*="WFB7wUOX"][class*="NUzvFSPe"]',  // 包含两个 class
          'div[class*="comment-input-right-ct"] span[class*="WFB7wUOX"]',  // 容器内的按钮
          'span[class*="WFB7wUOX"]',  // 通用 class
          'span[class*="NUzvFSPe"]',  // 另一个通用 class
          'svg[class*="WFB7wUOX"]',  // SVG 特定 class
        ];

        for (const selector of sendButtonSelectors) {
          try {
            sendButton = await page.$(selector);
            if (sendButton) {
              const className = await sendButton.evaluate(el => el.className || '');
              const tagName = await sendButton.evaluate(el => el.tagName);
              console.log('[AUTO] Found send button:', selector, 'tag:', tagName, 'class:', className.substring(0, 30));
              break;
            }
          } catch(e) {}
        }

        if (sendButton) {
          console.log('[AUTO] Clicking send button...');
          await sendProgressMessage(token, '📤 点击发送按钮...', data);

          // 尝试多种点击方式
          let clicked = false;

          // 方式1: 直接点击
          try {
            await sendButton.click();
            console.log('[AUTO] Send button clicked (direct)');
            clicked = true;
          } catch(e) {
            console.log('[AUTO] Direct click failed:', e.message);
          }

          // 方式2: 使用 evaluate 点击
          if (!clicked) {
            try {
              await sendButton.evaluate(el => el.click());
              console.log('[AUTO] Send button clicked (evaluate)');
              clicked = true;
            } catch(e) {
              console.log('[AUTO] Evaluate click failed:', e.message);
            }
          }

          // 方式3: dispatchEvent
          if (!clicked) {
            try {
              await sendButton.evaluate(el => {
                const clickEvent = new MouseEvent('click', {
                  bubbles: true,
                  cancelable: true,
                  view: window
                });
                el.dispatchEvent(clickEvent);
              });
              console.log('[AUTO] Send button clicked (dispatch)');
              clicked = true;
            } catch(e) {
              console.log('[AUTO] Dispatch click failed:', e.message);
            }
          }

          if (clicked) {
            console.log('[AUTO] Comment sent successfully');
            await sendProgressMessage(token, '✅ 评论已发送', data);

            // 等待发送完成
            await new Promise(r => setTimeout(r, 2000));

            // 截图验证发送结果
            try {
              const sentPath = `/tmp/douyin_note_sent_${Date.now()}.png`;
              await page.screenshot({ path: sentPath, fullPage: false });
              console.log('[AUTO] Sent screenshot saved:', sentPath);
            } catch(e) {}

            // 给自己的评论点赞 - 完全复制抖音视频的实现
            console.log('[AUTO] Looking for like button on my comment...');
            await sendProgressMessage(token, '👍 尝试给自己评论点赞...', data);
            try {
              // 等待一下让评论渲染
              await new Promise(r => setTimeout(r, 2000));

              // 查找刚发布的评论（包含"刚刚"文本的评论）
              console.log('[AUTO] Finding my comment...');

              // 使用 evaluate 查找包含"刚刚"文本的评论
              let myComment = null;
              try {
                const commentHandle = await page.evaluateHandle(() => {
                  const comments = document.querySelectorAll('div[class*="comment-item"], div[data-e2e*="comment-item"]');
                  for (const comment of comments) {
                    // 检查是否包含"刚刚"文本
                    if (comment.textContent.includes('刚刚')) {
                      return comment;
                    }
                  }
                  return null;
                });
                if (commentHandle) {
                  myComment = commentHandle.asElement();
                  console.log('[AUTO] Found my comment (with 刚刚)');
                }
              } catch(e) {
                console.log('[AUTO] Error finding comment with 刚刚:', e.message);
              }

              // 如果没找到，尝试查找第一个评论
              if (!myComment) {
                myComment = await page.$('div[class*="comment-item"]:first-child, div[data-e2e*="comment-item"]:first-child');
                console.log('[AUTO] Using first comment as fallback');
              }

              if (myComment) {
                console.log('[AUTO] Found my comment element');

                // 在评论内查找点赞按钮 - 优先查找包含特定 class 的元素，然后找其内部的 SVG
                console.log('[AUTO] Searching for like button in comment...');
                let likeButton = await myComment.$('[class*="xZh"] svg, [class*="LeV"] svg');

                // 如果没找到，再尝试查找包含特定 class 的元素本身
                if (!likeButton) {
                  likeButton = await myComment.$('[class*="xZh"], [class*="LeV"]');
                }

                // 如果还没找到，尝试查找 SVG
                if (!likeButton) {
                  likeButton = await myComment.$('svg');
                }

                console.log('[AUTO] Like button search result:', likeButton ? 'found' : 'not found');

                if (likeButton) {
                  console.log('[AUTO] Found like button, getting details...');
                  // 添加调试信息
                  try {
                    const tagName = await likeButton.evaluate(el => el.tagName);
                    let className = '';
                    try {
                      const rawClassName = await likeButton.evaluate(el => el.className);
                      if (typeof rawClassName === 'string') {
                        className = rawClassName;
                      } else if (rawClassName && rawClassName.baseVal) {
                        className = rawClassName.baseVal;
                      }
                    } catch(e) {}
                    console.log('[AUTO] Like button - tag:', tagName, 'class:', className.substring(0, 50));
                  } catch(e) {
                    console.log('[AUTO] Failed to get like button details:', e.message);
                  }

                  console.log('[AUTO] Clicking like button...');
                  try {
                    // 获取 SVG 的父元素（P 标签）
                    const parentP = await likeButton.evaluateHandle(el => {
                      let p = el;
                      while (p && p.tagName !== 'P') {
                        p = p.parentElement;
                      }
                      return p;
                    });

                    if (parentP) {
                      const pElement = parentP.asElement();
                      // 获取 P 标签的位置
                      const box = await pElement.boundingBox();
                      if (box) {
                        console.log('[AUTO] Clicking at position:', box.x + box.width/2, box.y + box.height/2);
                        // 使用鼠标点击
                        await page.mouse.click(box.x + box.width/2, box.y + box.height/2);
                        console.log('[AUTO] Liked my comment with mouse click!');
                      } else {
                        // 如果无法获取位置，使用 JavaScript 点击
                        await pElement.evaluate(el => {
                          el.click();
                          el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                        });
                        console.log('[AUTO] Liked my comment with JS click!');
                      }
                    } else {
                      // 如果没有 P 标签，直接点击 SVG
                      await likeButton.evaluate(el => {
                        el.click();
                        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                      });
                      console.log('[AUTO] Liked my comment with SVG click!');
                    }
                    await sendProgressMessage(token, '✅ 已给自己评论点赞', data);
                  } catch(clickError) {
                    console.log('[AUTO] Click failed:', clickError.message);
                    await sendProgressMessage(token, '⚠️ 点赞点击失败', data);
                  }
                  await new Promise(r => setTimeout(r, 1000));
                } else {
                  console.log('[AUTO] Like button not found in comment');
                  await sendProgressMessage(token, '⚠️ 未找到点赞按钮', data);
                }
              } else {
                console.log('[AUTO] My comment not found');
                await sendProgressMessage(token, '⚠️ 未找到自己发布的评论', data);
              }
            } catch (e) {
              console.log('[AUTO] Like failed:', e.message);
              await sendProgressMessage(token, '⚠️ 点赞失败', data);
            }

          } else {
            console.log('[AUTO] Failed to click send button');
            await sendProgressMessage(token, '❌ 点击发送按钮失败', data);
          }

        } else {
          console.log('[AUTO] Send button not found');
          await sendProgressMessage(token, '❌ 未找到发送按钮', data);
        }

      } catch(e) {
        console.log('[AUTO] Typing failed:', e.message);
        await sendProgressMessage(token, '❌ 输入评论失败', data);
      }

    } catch(e) {
      console.log('[AUTO] Cursor positioning failed:', e.message);
      await sendProgressMessage(token, '⚠️ 光标定位失败', data);
    }

    // 抖音图文评论流程完成
    console.log('[AUTO] Douyin Note comment process completed');
    await sendProgressMessage(token, '✅ 抖音图文评论流程完成', data);
    
    // 截图保存（让 handleCommentTask 统一处理上传）
    console.log('[AUTO] Taking screenshot...');
    await sendProgressMessage(token, '📸 正在截图...', data);
    
    try {
      const screenshotPath = `/tmp/douyin_note_success_${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log('[AUTO] Screenshot saved:', screenshotPath);
      await sendProgressMessage(token, '✅ 截图已保存', data);
      
      // 断开浏览器连接
      await browser.disconnect();
      
      // 返回成功结果，让 handleCommentTask 处理截图上传
      return { success: true, screenshotPath };
    } catch(screenshotError) {
      console.log('[AUTO] Screenshot error:', screenshotError.message);
      await sendProgressMessage(token, '⚠️ 截图失败', data);
      
      // 断开浏览器连接
      await browser.disconnect();
      return { success: false, message: '截图失败' };
    }

  } catch (e) {
    console.log('[AUTO] Error in handleDouyinNote:', e.message);
    return null;
  }
}

// 通用查找评论框逻辑
async function findCommentInput(page, type = 'default') {
  console.log(`[AUTO] Looking for comment input (${type})...`);

  // 根据类型使用不同的选择器
  let selectors = [];

  if (type === 'note') {
    // 抖音图文特定的选择器
    selectors = [
      'div.GXmFLge7.comment-input-inner-container',  // 精确匹配
      'div[class*="GXmFLge7"][class*="comment-input-inner-container"]',  // 同时包含两个 class
      'div[class*="GXmFLge7"]',  // 图文评论框 class
      'div[class*="comment-input-inner-container"]',  // 通用容器
      'div[contenteditable="true"]',
    ];
  } else if (type === 'video') {
    // 抖音视频特定的选择器
    selectors = [
      'div.GXmFLge7.comment-input-inner-container',  // 精确匹配
      'div[class*="GXmFLge7"][class*="comment-input-inner-container"]',  // 同时包含两个 class
      'div[class*="GXmFLge7"]',  // 视频评论框 class
      'div[class*="comment-input-inner-container"]',  // 通用容器
      'div[contenteditable="true"]',
    ];
  } else {
    // 默认选择器
    selectors = [
      'div[class*="GXmFLge7"]',  // 从截图中看到的精确 class (L 不是 1)
      'div[class*="comment-input-inner-container"]',  // 另一个 class
      'div[contenteditable="true"]',
      'div[class*="comment"] div[contenteditable]',
      'input[placeholder*="评论"]',
      'div[placeholder*="说点什么"]'
    ];
  }

  for (const selector of selectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        console.log(`[AUTO] Found comment input (${type}):`, selector);
        return el;
      }
    } catch(e) {}
  }

  // 如果没找到，尝试点击"说点什么"
  const clicked = await page.evaluate(() => {
    const elements = document.querySelectorAll('*');
    for (const el of elements) {
      if (el.textContent && (el.textContent.includes('说点什么') || el.textContent.includes('写评论'))) {
        el.click();
        return true;
      }
    }
    return false;
  });

  if (clicked) {
    await new Promise(r => setTimeout(r, 1500));

    // 再次查找
    for (const selector of selectors) {
      try {
        const el = await page.$(selector);
        if (el) {
          return el;
        }
      } catch(e) {}
    }
  }

  // 最后尝试查找所有 contenteditable
  const inputs = await page.$$('div[contenteditable="true"]');
  if (inputs.length > 0) {
    console.log('[AUTO] Found editable input');
    return inputs[0];
  }

  return null;
}

// 抖音视频处理流程
async function handleDouyinVideo(page, token, data) {
  console.log('[AUTO] Handling Douyin Video...');
  await sendProgressMessage(token, '🎬 处理抖音视频...', data);

  // 滚动到页面底部找评论区
  console.log('[AUTO] Scrolling to find comment area...');
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
  await new Promise(r => setTimeout(r, 1500));

  // 使用通用的查找评论框逻辑（传入类型）
  return await findCommentInput(page, 'video');
}

// 默认处理流程
async function handleDefault(page, token, data) {
  console.log('[AUTO] Using default handler...');
  await sendProgressMessage(token, '🔧 使用默认处理方式...', data);

  // 滚动到页面底部
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
  await new Promise(r => setTimeout(r, 1500));

  // 使用通用的查找评论框逻辑（默认类型）
  return await findCommentInput(page, 'default');
}

// 等待登录处理
async function handleLoginWait(page, token, data, contentType, browser) {
  console.log('[AUTO] Comment input not found - may need login');
  await sendProgressMessage(token, '❌ 未找到评论框，可能需要登录', data);

  // 截图
  try {
    const ts = Date.now();
    const path = `/tmp/comment_${data.record_id}_${ts}_need_login.png`;
    await page.screenshot({ path, fullPage: false });
  } catch (e) {
    console.log('[AUTO] Screenshot failed:', e.message);
  }

  await sendProgressMessage(token, '🔐 等待用户登录（最多等待5分钟）...', data);

  await updateRecordField(token, data.record_id, '状态', '待登录');
  await updateRecordField(token, data.record_id, '备注',
    `[${new Date().toLocaleString()}] 等待登录账号`);

  // 等待用户登录，每5秒检查一次，最多等待5分钟
  let loginWaitTime = 0;
  const maxWaitTime = 5 * 60 * 1000;
  const checkInterval = 5000;

  await sendProgressMessage(token, '⚠️ 请在Chrome中完成登录，登录后脚本会自动继续...', data);

  let commentInput = null;
  let pageClosed = false;

  while (loginWaitTime < maxWaitTime && !pageClosed) {
    await new Promise(r => setTimeout(r, checkInterval));
    loginWaitTime += checkInterval;

    // 检查页面是否已关闭
    try {
      // 尝试访问页面，如果关闭会抛出错误
      await page.evaluate(() => document.title);
    } catch (e) {
      if (e.message.includes('Session closed') || e.message.includes('Target closed')) {
        console.log('[AUTO] Page was closed by user, stopping wait');
        pageClosed = true;
        break;
      }
    }

    console.log(`[AUTO] Waiting for login... ${loginWaitTime / 1000}s`);

    // 根据内容类型重新尝试查找评论框
    try {
      if (contentType.platform === 'douyin' && contentType.type === 'note') {
        commentInput = await handleDouyinNote(page, token, data, browser);
      } else if (contentType.platform === 'douyin' && contentType.type === 'video') {
        commentInput = await handleDouyinVideo(page, token, data);
      } else {
        commentInput = await handleDefault(page, token, data);
      }
    } catch (e) {
      console.log('[AUTO] Error finding comment input:', e.message);
      if (e.message.includes('Session closed') || e.message.includes('Target closed')) {
        pageClosed = true;
        break;
      }
    }

    if (commentInput) {
      // 检查是否可编辑
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
    await sendProgressMessage(token, '❌ 页面已关闭，任务已取消', data);
    await updateRecordField(token, data.record_id, '状态', '失败');
    await updateRecordField(token, data.record_id, '备注',
      `[${new Date().toLocaleString()}] 页面被关闭`);
    return null;
  }

  if (!commentInput) {
    console.log('[AUTO] Login timeout');
    await sendProgressMessage(token, '❌ 等待登录超时，任务已取消', data);
    await updateRecordField(token, data.record_id, '状态', '失败');
    await updateRecordField(token, data.record_id, '备注',
      `[${new Date().toLocaleString()}] 等待登录超时`);
    return null;
    return null;
  }

  return commentInput;
}

// 执行浏览器自动化
async function executeBrowserAutomation(data, token) {
  console.log('[AUTO] Starting...');
  console.log('[AUTO] Link:', data.product_link);
  console.log('[AUTO] Comment:', data.comment_script);

  // 识别内容类型
  const contentType = detectContentType(data.product_link);
  console.log(`[AUTO] Content type: ${contentType.name} (${contentType.platform}/${contentType.type})`);
  await sendProgressMessage(token, `📱 识别平台: ${contentType.name}`, data);

  let browser = null;

  try {
    // 连接 Chrome
    console.log('[AUTO] Connecting to Chrome...');
    await sendProgressMessage(token, '🔌 正在连接 Chrome...', data);

    browser = await puppeteer.connect({
      browserURL: 'http://localhost:62030',
      defaultViewport: { width: 1280, height: 800 }
    });
    console.log('[AUTO] Chrome connected');
    await sendProgressMessage(token, '✅ 已连接到 Chrome', data);

    // 获取或创建页面
    const pages = await browser.pages();
    let page = pages[0];
    if (!page) {
      page = await browser.newPage();
    }

    await page.bringToFront();

    // 清除浏览器缓存和 Cookie
    console.log('[AUTO] Clearing cache and cookies...');
    await sendProgressMessage(token, '🧹 正在清除浏览器缓存...', data);
    try {
      // 只清除当前页面的 Cookie 和缓存
      await page.evaluate(() => {
        document.cookie.split(';').forEach(function(c) {
          document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
        });
        localStorage.clear();
        sessionStorage.clear();
      });
      console.log('[AUTO] Cookies and storage cleared');
      await sendProgressMessage(token, '✅ 缓存已清除', data);
    } catch (e) {
      console.log('[AUTO] Failed to clear cache:', e.message);
      await sendProgressMessage(token, '⚠️ 清除缓存失败，继续执行', data);
    }

    // 打开链接
    console.log('[AUTO] Opening page...');
    await sendProgressMessage(token, '🌐 正在打开产品链接...', data);
    try {
      await page.goto(data.product_link, {
        waitUntil: 'domcontentloaded',
        timeout: 90000
      });
      console.log('[AUTO] Page loaded');
      await sendProgressMessage(token, '✅ 页面已加载完成', data);
    } catch (e) {
      console.log('[AUTO] Page load timeout, continuing...');
      await sendProgressMessage(token, '⚠️ 页面加载超时，继续执行...', data);
    }

    await page.bringToFront();

    // 等待页面完全加载
    console.log('[AUTO] Waiting for page to fully load...');
    await new Promise(r => setTimeout(r, 3000));

    // 页面打开后，重新检测实际的内容类型（短链接会跳转）
    const actualUrl = page.url();
    console.log('[AUTO] Actual URL:', actualUrl);
    const actualContentType = detectContentType(actualUrl);
    if (actualContentType.type !== contentType.type) {
      console.log(`[AUTO] Content type corrected: ${actualContentType.name}`);
      await sendProgressMessage(token, `📱 修正平台类型: ${actualContentType.name}`, data);
    }

    // 根据内容类型执行不同的处理流程
    let commentInput = null;
    let isDouyinNote = false;

    if (actualContentType.platform === 'douyin' && actualContentType.type === 'note') {
      // 抖音图文处理流程
      isDouyinNote = true;
      const noteResult = await handleDouyinNote(page, token, data, browser);
      // 如果 handleDouyinNote 返回成功结果，直接返回
      if (noteResult && noteResult.success) {
        console.log('[AUTO] Douyin Note completed successfully');
        return noteResult;
      }
      // 如果返回 null 或失败，进入后续流程
      if (!noteResult) {
        console.log('[AUTO] Douyin Note: Test phase completed, skipping further steps');
        await sendProgressMessage(token, '⏹️ 抖音图文测试阶段结束', data);
        await browser.disconnect();
        return { success: false, message: '抖音图文测试阶段结束' };
      }
      commentInput = noteResult;
    } else if (actualContentType.platform === 'douyin' && actualContentType.type === 'video') {
      // 抖音视频处理流程
      commentInput = await handleDouyinVideo(page, token, data);
    } else {
      // 默认处理流程
      commentInput = await handleDefault(page, token, data);
    }

    // 如果还是没找到评论框，可能是未登录，等待用户登录（抖音图文除外）
    if (!commentInput && !isDouyinNote) {
      commentInput = await handleLoginWait(page, token, data, actualContentType, browser);
      if (!commentInput) {
        return { success: false, message: '等待登录超时或页面已关闭' };
      }
    }

    // 使用通用的输入和发送评论逻辑，传入内容类型
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

    // 检查是否出现验证码弹窗（发送后可能出现）
    console.log('[AUTO] Checking for verification popup after send...');
    const verificationSelectors = [
      'div[class*="verify"]',
      'div[class*="captcha"]',
      'div:has-text("接收短信验证码")',
      'div:has-text("请输入验证码")',
      'input[placeholder*="验证码"]',
      'input[placeholder*="短信"]',
      'div[class*="modal"]:has-text("验证")',
      'div[class*="dialog"]:has-text("验证")'
    ];

    let verificationPopup = null;
    for (const selector of verificationSelectors) {
      try {
        const el = await page.$(selector);
        if (el) {
          const text = await el.evaluate(el => el.textContent || '');
          const placeholder = await el.evaluate(el => el.placeholder || '');
          if (text.includes('验证码') || text.includes('验证') || text.includes('短信') ||
              placeholder.includes('验证码') || placeholder.includes('短信')) {
            console.log('[AUTO] Found verification popup after send:', selector);
            verificationPopup = el;
            break;
          }
        }
      } catch(e) {}
    }

    // 如果检测到验证码弹窗，等待用户手动验证
    if (verificationPopup) {
      console.log('[AUTO] Verification popup detected after sending');
      await sendProgressMessage(token, '🔒 发送后检测到验证码弹窗，请手动完成验证', data);

      // 截图保存
      const verifyTs = Date.now();
      const verifyPath = `/tmp/comment_${data.record_id}_${verifyTs}_verification.png`;
      await page.screenshot({ path: verifyPath, fullPage: false });

      await updateRecordField(token, data.record_id, '状态', '待验证');
      await updateRecordField(token, data.record_id, '备注',
        `[${new Date().toLocaleString()}] 发送评论后需要验证码验证，请完成验证`);

      // 等待用户完成验证，每3秒检查一次，最多等待10分钟
      let verifyWaitTime = 0;
      const maxVerifyWaitTime = 10 * 60 * 1000;
      const verifyCheckInterval = 3000;

      while (verifyWaitTime < maxVerifyWaitTime) {
        await new Promise(r => setTimeout(r, verifyCheckInterval));
        verifyWaitTime += verifyCheckInterval;

        console.log(`[AUTO] Waiting for verification after send... ${verifyWaitTime / 1000}s`);

        // 检查验证码弹窗是否还在
        let popupStillExists = false;
        for (const selector of verificationSelectors) {
          try {
            const el = await page.$(selector);
            if (el) {
              const text = await el.evaluate(el => el.textContent || '');
              const placeholder = await el.evaluate(el => el.placeholder || '');
              if (text.includes('验证码') || text.includes('验证') || text.includes('短信') ||
                  placeholder.includes('验证码') || placeholder.includes('短信')) {
                popupStillExists = true;
                break;
              }
            }
          } catch(e) {}
        }

        if (!popupStillExists) {
          console.log('[AUTO] Verification popup closed after send');
          await sendProgressMessage(token, '✅ 检测到验证已完成，继续执行后续操作', data);
          await new Promise(r => setTimeout(r, 2000));
          break;
        }

        // 每30秒发送一次等待提示
        if (verifyWaitTime % 30000 === 0) {
          const remainingTime = Math.ceil((maxVerifyWaitTime - verifyWaitTime) / 1000);
          await sendProgressMessage(token, `⏳ 仍在等待验证完成...剩余${remainingTime}秒`, data);
        }
      }

      if (verifyWaitTime >= maxVerifyWaitTime) {
        console.log('[AUTO] Verification timeout after send');
        await sendProgressMessage(token, '❌ 等待验证超时，任务已取消', data);
        await updateRecordField(token, data.record_id, '状态', '失败');
        await updateRecordField(token, data.record_id, '备注',
          `[${new Date().toLocaleString()}] 发送后等待验证超时`);
        await browser.disconnect();
        return { success: false, message: '发送后等待验证超时' };
      }
    }

    // 给自己发布的评论点赞
    console.log('[AUTO] Looking for like button on my comment...');
    await sendProgressMessage(token, '👍 尝试给自己评论点赞...', data);
    try {
      // 等待一下让评论渲染
      await new Promise(r => setTimeout(r, 2000));

      // 查找刚发布的评论（通常是第一个评论，带有"刚刚"标记）
      const myComment = await page.$('div[data-e2e*="comment-item"]:first-child, div[class*="comment-item"]:first-child');
      if (myComment) {
        console.log('[AUTO] Found my comment');

        // 在评论内查找点赞按钮
        const likeButton = await myComment.$('svg, span[class*="like"], div[class*="like"], [data-e2e*="like"]');
        if (likeButton) {
          console.log('[AUTO] Clicking like button...');
          await likeButton.click();
          console.log('[AUTO] Liked my comment!');
          await sendProgressMessage(token, '✅ 已给自己评论点赞', data);
          await new Promise(r => setTimeout(r, 1000));
        } else {
          console.log('[AUTO] Like button not found in comment');
          await sendProgressMessage(token, '⚠️ 未找到点赞按钮', data);
        }
      } else {
        console.log('[AUTO] My comment not found');
        await sendProgressMessage(token, '⚠️ 未找到自己发布的评论', data);
      }
    } catch (e) {
      console.log('[AUTO] Like failed:', e.message);
      await sendProgressMessage(token, '⚠️ 点赞失败', data);
    }

    // 截图（在点赞后）
    const ts = Date.now();
    const screenshotPath = `/tmp/comment_${data.record_id}_${ts}.png`;
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log('[AUTO] Screenshot saved:', screenshotPath);
    await sendProgressMessage(token, '📸 已保存截图', data);

    await browser.disconnect();
    return { success: true, screenshotPath };

  } catch (error) {
    console.error('[AUTO] Error:', error.message);
    if (browser) {
      try { await browser.disconnect(); } catch(e) {}
    }
    return { success: false, message: error.message };
  }
}

// 处理评论任务
async function handleCommentTask(data) {
  console.log('\n========================================');
  console.log('Task:', data.record_id);
  console.log('Product:', data.product_name);
  console.log('Table ID:', data.table_id || tableId);
  console.log('========================================\n');

  // 设置当前请求使用的表格 ID
  currentRequestTableId = data.table_id || tableId;

  let token;
  try {
    token = await getTenantAccessToken();

    await updateRecordField(token, data.record_id, '状态', '处理中');
    console.log('[TASK] Processing...');

    const result = await executeBrowserAutomation(data, token);

    if (result.success) {
      await updateRecordField(token, data.record_id, '状态', '已完成');
      await updateRecordField(token, data.record_id, '完成时间', Date.now());
      await updateRecordField(token, data.record_id, '备注',
        `[${new Date().toLocaleString()}] 评论成功`);

      // 上传截图到表格附件字段
      if (result.screenshotPath) {
        console.log('[TASK] Uploading screenshot to table...');
        // 提前保存 record_id，避免在嵌套 Promise 中丢失
        const currentRecordId = data.record_id;
        console.log('[TASK] Current record_id:', currentRecordId);
        try {
          const fs = require('fs');
          const FormData = require('form-data');

          // 1. 先上传文件获取 file_token
          const form = new FormData();
          form.append('file_name', 'comment_screenshot.png');
          form.append('parent_type', 'bitable');
          form.append('parent_node', appToken);
          form.append('size', fs.statSync(result.screenshotPath).size.toString());
          form.append('file', fs.createReadStream(result.screenshotPath));

          const uploadResult = await new Promise((resolve) => {
            const https = require('https');
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

          console.log('[TASK] Upload result:', JSON.stringify(uploadResult));

          if (uploadResult.code === 0 && uploadResult.data && uploadResult.data.file_token) {
            const fileToken = uploadResult.data.file_token;
            console.log('[TASK] File token:', fileToken);

            // 2. 更新表格记录，将 file_token 添加到附件字段
            console.log('[TASK] Updating record with record_id:', currentRecordId);
            console.log('[TASK] AppToken:', appToken);
            console.log('[TASK] TableId:', currentRequestTableId || tableId);

            // 更新评论截图附件字段
            const attachmentUpdateResult = await updateRecordField(token, currentRecordId, '评论截图', [{ file_token: fileToken }]);
            console.log('[TASK] Attachment update result:', JSON.stringify(attachmentUpdateResult));

            if (attachmentUpdateResult.code === 0) {
              console.log('[TASK] Screenshot added to 评论截图 field');
            } else {
              console.log('[TASK] Attachment update failed:', attachmentUpdateResult.msg);
            }

            // 获取截图的预览链接
            console.log('[TASK] Getting screenshot preview URL...');
            const previewUrl = `https://open.feishu.cn/open-apis/drive/v1/medias/${fileToken}/download`;
            console.log('[TASK] Preview URL:', previewUrl);

            // 更新备注字段，添加截图链接
            const newRemark = `[${new Date().toLocaleString()}] 评论成功\n截图链接: ${previewUrl}`;
            const remarkUpdateResult = await updateRecordField(token, currentRecordId, '备注', newRemark);
            console.log('[TASK] Remark update result:', JSON.stringify(remarkUpdateResult));

            if (remarkUpdateResult.code === 0) {
              console.log('[TASK] Screenshot link added to remark');
              await sendProgressMessage(token, '✅ 截图已上传到表格附件字段', data);
            } else {
              console.log('[TASK] Remark update failed:', remarkUpdateResult.msg);
              await sendProgressMessage(token, `✅ 截图已上传，但备注更新失败`, data);
            }
          } else {
            console.log('[TASK] Upload failed:', uploadResult.msg);
            await sendProgressMessage(token, '⚠️ 评论成功但截图上传失败', data);
          }
        } catch (e) {
          console.log('[TASK] Upload error:', e.message);
          await sendProgressMessage(token, '⚠️ 评论成功但截图处理出错', data);
        }
      }

      await sendProgressMessage(token, '✅ 任务全部完成', data);
      console.log('[TASK] Complete');

    } else if (result.needLogin) {
      console.log('[TASK] Need login - this should not happen with auto-wait');
      await sendProgressMessage(token, '⚠️ 登录检测异常', data);
      // 状态已更新为"待登录"

    } else {
      await updateRecordField(token, data.record_id, '状态', '失败');
      await updateRecordField(token, data.record_id, '备注',
        `[${new Date().toLocaleString()}] 失败: ${result.message}`);

      await sendProgressMessage(token, `❌ 评论失败: ${result.message}`, data);
      console.log('[TASK] Failed');
    }

    return result;
  } catch (error) {
    console.error('[TASK] Error:', error.message);
    try {
      if (!token) token = await getTenantAccessToken();
      await updateRecordField(token, data.record_id, '状态', '失败');
      await sendProgressMessage(token, `❌ 执行异常: ${error.message}`, data);
    } catch(e) {}
    return { success: false, message: error.message };
  }
}

// 处理评论请求
async function handleCommentRequest(data) {
  console.log('\n[REQUEST] Received:', data.record_id);

  try {
    const token = await getTenantAccessToken();
    await updateRecordField(token, data.record_id, '状态', '进行中');
    console.log('[REQUEST] Started');

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
const PORT = 3001;

app.use(express.json({ strict: false }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Webhook', agent: AGENT_ID });
});

app.post('/comment', async (req, res) => {
  try {
    console.log('\n[HTTP] POST /comment');
    const result = await handleCommentRequest(req.body);
    res.json({ code: result.success ? 0 : -1, msg: result.success ? 'success' : 'error', data: result });
  } catch (error) {
    console.error('[HTTP] Error:', error.message);
    res.status(400).json({ code: -1, msg: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('========================================');
  console.log('Webhook Forwarder');
  console.log('Port:', PORT);
  console.log('========================================\n');
});
