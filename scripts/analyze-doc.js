const axios = require('axios');
const feishuAuth = require('../src/services/feishu-auth');

async function analyzeDoc(documentId) {
  const token = await feishuAuth.getAppToken();
  const res = await axios.get(
    `https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}/blocks?document_revision_id=-1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (res.data.code !== 0) {
    console.log('Error:', res.data.msg);
    return;
  }

  const items = res.data.data.items;
  console.log('Total blocks:', items.length);
  console.log('\nDocument structure:');

  for (let i = 0; i < items.length; i++) {
    const b = items[i];
    let content = '';
    if (b.block_type === 3 && b.heading1) content = b.heading1.elements?.map(e => e.text_run?.content).join('');
    else if (b.block_type === 4 && b.heading2) content = b.heading2.elements?.map(e => e.text_run?.content).join('');
    else if (b.block_type === 5 && b.heading3) content = b.heading3.elements?.map(e => e.text_run?.content).join('');
    else if (b.block_type === 2 && b.text) content = b.text.elements?.map(e => e.text_run?.content).join('');
    else if (b.block_type === 31) content = `[table ${b.table?.property?.row_size}x${b.table?.property?.column_size}]`;
    else if (b.block_type === 22) content = '---';
    else if (b.block_type === 15 && b.quote) content = b.quote.elements?.map(e => e.text_run?.content).join('');
    else if (b.block_type === 12 && b.bullet) content = b.bullet.elements?.map(e => e.text_run?.content).join('');

    console.log(`${i.toString().padStart(3)}: type=${b.block_type.toString().padStart(2)} ${content.slice(0, 100)}`);
  }

  // Check table contents
  const tables = items.filter(b => b.block_type === 31);
  console.log(`\nFound ${tables.length} table(s)`);
  for (let ti = 0; ti < tables.length; ti++) {
    const table = tables[ti];
    console.log(`\nTable ${ti}: ${table.table?.property?.row_size}x${table.table?.property?.column_size}`);
    for (const cellId of table.children.slice(0, 12)) {
      const cell = items.find(i => i.block_id === cellId);
      if (cell?.children) {
        for (const childId of cell.children) {
          const child = items.find(i => i.block_id === childId);
          if (child) {
            const text = child.text?.elements?.map(e => e.text_run?.content).join('') || '(no text)';
            console.log(`  Cell ${cellId.slice(-8)} -> ${text.slice(0, 60)}`);
          }
        }
      }
    }
  }
}

const docId = process.argv[2] || 'CQqgdEdioozdrGxdcNHcdbCNn6c';
analyzeDoc(docId);
