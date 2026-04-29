const reportService = require('../src/services/report-service');

// Test different column counts
async function testTable(cols, rows) {
  const headers = Array.from({ length: cols }, (_, i) => `Col${i + 1}`);
  const data = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => `R${r + 1}C${c + 1}`)
  );

  const blocks = [
    { block_type: 3, heading1: { elements: [{ text_run: { content: `Table ${cols}x${rows}` } }] } },
    reportService._sanitizeBlocks([{
      block_type: 31,
      table: {
        property: {
          row_size: rows + 1,
          column_size: cols,
        },
      },
      children: [headers, ...data].flatMap(row =>
        row.map(cell => [{ block_type: 2, text: { elements: [{ text_run: { content: cell } }] } }])
      ),
    }])[0],
  ];

  try {
    const docUrl = await reportService.createFeishuDoc(`table-test-${cols}x${rows}`, blocks);
    console.log(`✅ ${cols}x${rows} success:`, docUrl);
    return true;
  } catch (e) {
    console.log(`❌ ${cols}x${rows} failed:`, e.message);
    return false;
  }
}

(async () => {
  await testTable(9, 5);
})();
