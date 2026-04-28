require('dotenv').config();
const reportService = require('../src/services/report-service');

async function test() {
  const cases = [
    { name: 'quote', blocks: [{ block_type: 11, quote: { elements: [{ text_run: { content: 'Quote' } }] } }] },
    { name: 'todo', blocks: [{ block_type: 13, todo: { elements: [{ text_run: { content: 'Todo' } }], style: { done: false } } }] },
    { name: 'code', blocks: [{ block_type: 12, code: { elements: [{ text_run: { content: 'code' } }], style: { language: 0 } } }] },
  ];

  for (const c of cases) {
    try {
      const url = await reportService.createFeishuDoc(`测试-${c.name}`, c.blocks);
      console.log(`✅ ${c.name}:`, url);
    } catch (e) {
      console.error(`❌ ${c.name} failed:`, e.message);
    }
  }
}

test();
