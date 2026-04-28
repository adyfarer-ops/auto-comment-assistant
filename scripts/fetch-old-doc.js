require('dotenv').config();
const axios = require('axios');
const feishuAuth = require('../src/services/feishu-auth');

async function fetchDoc() {
  const token = await feishuAuth.getAppToken();
  const docId = 'CQqgdEdioozdrGxdcNHcdbCNn6c';
  
  try {
    const res = await axios.get(
      'https://open.feishu.cn/open-apis/docx/v1/documents/' + docId + '/blocks/' + docId + '/children',
      { headers: { Authorization: 'Bearer ' + token } }
    );
    console.log(JSON.stringify(res.data, null, 2));
  } catch (e) {
    console.error('Failed:', JSON.stringify(e.response?.data, null, 2) || e.message);
  }
}

fetchDoc();
