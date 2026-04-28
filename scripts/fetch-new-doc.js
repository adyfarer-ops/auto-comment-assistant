require('dotenv').config();
const axios = require('axios');
const feishuAuth = require('../src/services/feishu-auth');

async function fetchDoc() {
  const token = await feishuAuth.getAppToken();
  const docId = 'DuQvdBcpyohAMexPHJdcjl7ynHb';
  
  try {
    const res = await axios.get(
      'https://open.feishu.cn/open-apis/docx/v1/documents/' + docId + '/blocks/' + docId + '/children',
      { headers: { Authorization: 'Bearer ' + token } }
    );
    // Only print block types and first 100 chars of content
    const items = res.data.data?.items || [];
    for (const item of items) {
      const type = item.block_type;
      let content = '';
      if (item.text?.elements?.[0]?.text_run?.content) content = item.text.elements[0].text_run.content;
      if (item.heading1?.elements?.[0]?.text_run?.content) content = item.heading1.elements[0].text_run.content;
      if (item.heading2?.elements?.[0]?.text_run?.content) content = item.heading2.elements[0].text_run.content;
      if (item.heading3?.elements?.[0]?.text_run?.content) content = item.heading3.elements[0].text_run.content;
      console.log(`[${type}] ${content.slice(0, 100)}`);
    }
  } catch (e) {
    console.error('Failed:', JSON.stringify(e.response?.data, null, 2) || e.message);
  }
}

fetchDoc();
