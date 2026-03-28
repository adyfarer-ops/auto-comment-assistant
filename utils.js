// utils.js - 通用工具函数
const https = require('https');
const fs = require('fs');
const FormData = require('form-data');

// 配置
const CONFIG = {
  appId: 'cli_a94a6492e1f61cd3',
  appSecret: 'NyEi5RuX4YU2YJ4nNsFFwfetvWjpmRiS',
  appToken: 'QQ9Cbui0eaixinsS62VcGN47nqc',
  tableId: 'tbl5ovriK4ieq4sb',
  tableIds: ['tbl5ovriK4ieq4sb', 'tbl0ZAW2xnK7o7Tl'],
  CHAT_ID: 'oc_b8f9287e7c024fb9a7dfa274d1edc8d1'
};

// 当前请求使用的表格 ID
let currentRequestTableId = CONFIG.tableId;

// 设置当前表格 ID
function setCurrentTableId(tableId) {
  currentRequestTableId = tableId || CONFIG.tableId;
}

// 获取当前表格 ID
function getCurrentTableId() {
  return currentRequestTableId || CONFIG.tableId;
}

// 获取 tenant_access_token
async function getTenantAccessToken() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ app_id: CONFIG.appId, app_secret: CONFIG.appSecret });
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

// 更新记录字段
async function updateRecordField(token, recordId, fieldName, value) {
  return new Promise((resolve) => {
    const requestBody = { fields: { [fieldName]: value } };
    const data = JSON.stringify(requestBody);
    const targetTableId = getCurrentTableId();

    const options = {
      hostname: 'open.feishu.cn',
      port: 443,
      path: `/open-apis/bitable/v1/apps/${CONFIG.appToken}/tables/${targetTableId}/records/${recordId}`,
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    console.log('[API] Update record:', recordId, 'Table:', targetTableId, 'Field:', fieldName);

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
      receive_id: CONFIG.CHAT_ID,
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

// 发送进度消息
async function sendProgressMessage(token, message, data) {
  const fullMessage = `🔄 评论进度更新\n\n` +
    `📱 产品：${data.product_name}\n` +
    `📝 记录ID：${data.record_id}\n` +
    `⏱️ 时间：${new Date().toLocaleString()}\n\n` +
    `📍 进度：${message}`;
  await sendFeishuMessage(token, fullMessage);
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

// 上传截图到飞书
async function uploadScreenshot(token, filePath) {
  return new Promise((resolve) => {
    const stats = fs.statSync(filePath);
    const form = new FormData();
    form.append('file_name', 'comment_screenshot.png');
    form.append('parent_type', 'bitable');
    form.append('parent_node', CONFIG.appToken);
    form.append('size', stats.size.toString());
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
        try { resolve(JSON.parse(body)); } catch(e) { resolve({ code: -1, msg: body }); }
      });
    });
    req.on('error', (err) => resolve({ code: -1, msg: err.message }));
    form.pipe(req);
  });
}

module.exports = {
  CONFIG,
  setCurrentTableId,
  getCurrentTableId,
  getTenantAccessToken,
  updateRecordField,
  sendFeishuMessage,
  sendProgressMessage,
  detectContentType,
  uploadScreenshot
};
