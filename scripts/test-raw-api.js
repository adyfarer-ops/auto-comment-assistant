require('dotenv').config();
const axios = require('axios');
const feishuAuth = require('../src/services/feishu-auth');

async function test() {
  const token = await feishuAuth.getAppToken();

  const createRes = await axios.post('https://open.feishu.cn/open-apis/docx/v1/documents', {
    title: '测试-newline',
  }, { headers: { Authorization: `Bearer ${token}` } });

  const docId = createRes.data.data.document.document_id;

  try {
    const res = await axios.post(
      `https://open.feishu.cn/open-apis/docx/v1/documents/${docId}/blocks/${docId}/children`,
      {
        children: [{ block_type: 2, text: { elements: [{ text_run: { content: 'Line1\nLine2\nLine3' } }] } }],
        index: 0,
      },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
    console.log('✅ newline:', res.data.code === 0 ? 'ok' : res.data.msg);
  } catch (e) {
    console.error('❌ newline:', e.response?.data?.code, e.response?.data?.msg);
  }
}

test();
