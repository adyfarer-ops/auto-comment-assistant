const reportService = require('../src/services/report-service');
const xingtieTemplate = require('../src/templates/review-report/xingtie-template');

const accounts = [
  {
    record_id: 'rec1',
    fields: {
      '账号名称': 'starrailpainterzzTK',
      '目前播放量': '5570000',
      '已发布': '104',
      '粉丝总量': '150000',
      '2.14粉丝量': '140000',
      '3.27粉丝量': '150000',
    },
  },
];

const worksMap = new Map([
  ['rec1', [
    { title: '火花 花火 爻光三人的魔性meme舞蹈', playCount: 1330000, diggCount: 50000, commentCount: 2000, shareCount: 1000, collectCount: 500, link: 'https://www.tiktok.com/@starrailpainterzz/video/7613717507790097677' },
    { title: '复刻绝区零的同人二创手书', playCount: 21740, diggCount: 500, commentCount: 30, shareCount: 10, collectCount: 5, link: 'https://www.tiktok.com/@starrailpainterzz/video/7621148994642709773' },
  ]],
]);

const reportData = xingtieTemplate.buildReportData('星铁4.0版本', '2026-02-14 ~ 2026-03-27', accounts, worksMap);
const docBlocks = xingtieTemplate.buildDocBlocks(reportData, {
  global: {},
  accounts: {
    starrailpainterzzTK: {
      '亮点': '出现了一条133万播放量的爆款',
      '缺点': '播放量不稳定',
      '成功要素': '抓住了热点',
      '增长情况': '播放增长与粉丝增速大幅上升',
      '核心问题': '审美疲劳',
      '优化方向': '维持画风不变',
    }
  }
});

const sanitized = reportService._sanitizeBlocks(docBlocks);

// 检查 sanitized 后的 table block
for (let i = 0; i < sanitized.length; i++) {
  const b = sanitized[i];
  if (b.block_type === 31) {
    console.log(`Table block ${i}:`);
    console.log('  property:', JSON.stringify(b.table?.property));
    console.log('  has children:', !!b.children);
    if (b.children) {
      console.log('  children length:', b.children.length);
      console.log('  first cell:', JSON.stringify(b.children[0]).slice(0, 200));
    }
    console.log('  keys:', Object.keys(b));
  }
}

// 输出第一个 chunk（前50个）的 JSON
const firstChunk = sanitized.slice(0, 50).map(b => {
  if (b.block_type === 31 && b.children) {
    const { children, ...rest } = b;
    return rest;
  }
  if (b.children) {
    const { children, ...rest } = b;
    return rest;
  }
  return b;
});

console.log('\nFirst chunk first block:', JSON.stringify(firstChunk[0], null, 2));
console.log('\nFirst chunk table block:', JSON.stringify(firstChunk.find(b => b.block_type === 31), null, 2));
