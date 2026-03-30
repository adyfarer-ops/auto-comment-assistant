const https = require('https');

// 配置
const CONFIG = {
  appId: 'cli_a94a6492e1f61cd3',
  appSecret: 'NyEi5RuX4YU2YJ4nNsFFwfetvWjpmRiS',
  appToken: 'QQ9Cbui0eaixinsS62VcGN47nqc',
  tableId: 'tbl5ovriK4ieq4sb'
};

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

// 创建字段
async function createField(token, fieldName, type) {
  return new Promise((resolve) => {
    const requestBody = {
      field_name: fieldName,
      type: type  // 2 = 数字
    };
    const data = JSON.stringify(requestBody);

    const options = {
      hostname: 'open.feishu.cn',
      port: 443,
      path: `/open-apis/bitable/v1/apps/${CONFIG.appToken}/tables/${CONFIG.tableId}/fields`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    console.log('[API] Creating field:', fieldName, 'Type:', type);

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          console.log('[API] Create field result:', JSON.stringify(result));
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

// 主函数
async function main() {
  try {
    console.log('Getting token...');
    const token = await getTenantAccessToken();
    console.log('Token obtained');

    console.log('Creating field "序号"...');
    const result = await createField(token, '序号', 2);

    if (result.code === 0) {
      console.log('✅ Field "序号" created successfully!');
    } else {
      console.log('❌ Failed:', result.msg);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
