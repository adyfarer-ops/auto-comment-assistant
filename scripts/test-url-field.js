require('dotenv').config();
const feishuBitable = require('../src/services/feishu-bitable');
const config = require('../config');

async function test() {
  const token = config.project.managementTableToken || 'GEZ9bWr5kaexSEssvUaczO0Knhh';
  const tableId = 'tblxbkkh03Kw10lI';
  const recordId = 'recvgg8oasm2za';

  try {
    await feishuBitable.updateRecord(token, tableId, recordId, {
      '复盘报告文档': { link: 'https://vcnsfx7fytb0.feishu.cn/docx/test123', text: '测试URL对象格式' },
    });
    console.log('✅ URL object format works');
  } catch (e) {
    console.error('❌ URL object format failed:', e.message);
    if (e.response?.data) {
      console.error('Response:', JSON.stringify(e.response.data, null, 2));
    }
  }
}

test();
