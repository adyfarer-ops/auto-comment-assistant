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
      '亮点': '出现了一条133万播放量的爆款，热点捕捉及时',
      '缺点': '播放量不稳定，堡垒之夜内容后常规内容下滑',
      '成功要素': '视频制作时植物大战僵尸在tk上讨论度较高\n抓住了热点，火花和爻光都是本期up角色',
      '增长情况': '本版本播放增长与粉丝增速大幅上升\n独特的画风是涨粉核心',
      '核心问题': '连续使用火花x花火组合太多次，观众审美疲劳',
      '优化方向': '维持画风不变\n穿插制作其他经典ip角色的视频',
    }
  }
});

console.log('Total blocks:', docBlocks.length);

// 检查每个 block 的合法性
for (let i = 0; i < Math.min(docBlocks.length, 55); i++) {
  const b = docBlocks[i];
  const issues = [];

  if (!b.block_type && b.block_type !== 0) issues.push('缺少 block_type');

  // text block (2)
  if (b.block_type === 2) {
    if (!b.text) issues.push('text block 缺少 text');
    else if (!b.text.elements || b.text.elements.length === 0) issues.push('text block 空 elements');
    else {
      for (const el of b.text.elements) {
        if (el.text_run && (el.text_run.content === undefined || el.text_run.content === null)) {
          issues.push(`text_run content 为 ${el.text_run.content}`);
        }
        if (el.text_run && el.text_run.content === '') {
          issues.push(`text_run content 为空字符串`);
        }
      }
    }
  }

  // heading blocks (3,4,5)
  if ([3,4,5].includes(b.block_type)) {
    const heading = b.heading1 || b.heading2 || b.heading3;
    if (!heading) issues.push(`heading${b.block_type} 缺少 heading 对象`);
    else if (!heading.elements || heading.elements.length === 0) issues.push('heading 空 elements');
    else {
      for (const el of heading.elements) {
        if (el.text_run && el.text_run.content === '') {
          issues.push(`heading text_run content 为空字符串`);
        }
      }
    }
  }

  // table block (31)
  if (b.block_type === 31) {
    if (!b.table) issues.push('table block 缺少 table');
    else {
      if (!b.table.property) issues.push('table 缺少 property');
      if (!b.table.property?.row_size) issues.push('table 缺少 row_size');
      if (!b.table.property?.column_size) issues.push('table 缺少 column_size');
    }
    if (b.children) {
      const expected = b.table.property.row_size * b.table.property.column_size;
      if (b.children.length !== expected) issues.push(`children 数量 ${b.children.length} != 期望 ${expected}`);
      for (let ci = 0; ci < b.children.length; ci++) {
        const cell = b.children[ci];
        if (!Array.isArray(cell)) issues.push(`children[${ci}] 不是数组`);
        else {
          for (let cj = 0; cj < cell.length; cj++) {
            const cb = cell[cj];
            if (cb.block_type === 2 && cb.text?.elements) {
              for (const el of cb.text.elements) {
                if (el.text_run && (el.text_run.content === undefined || el.text_run.content === null)) {
                  issues.push(`table cell[${ci}][${cj}] text_run content 为 ${el.text_run.content}`);
                }
                if (el.text_run && el.text_run.content === '') {
                  issues.push(`table cell[${ci}][${cj}] text_run content 为空字符串`);
                }
              }
            }
          }
        }
      }
    }
  }

  // quote block (15)
  if (b.block_type === 15) {
    if (!b.quote) issues.push('quote block 缺少 quote');
    else if (!b.quote.elements || b.quote.elements.length === 0) issues.push('quote 空 elements');
    else {
      for (const el of b.quote.elements) {
        if (el.text_run && el.text_run.content === '') {
          issues.push(`quote text_run content 为空字符串`);
        }
      }
    }
  }

  // divider block (22)
  if (b.block_type === 22) {
    if (b.divider === undefined) issues.push('divider block 缺少 divider');
  }

  if (issues.length > 0) {
    console.log(`Block ${i} (type=${b.block_type}): ❌ ${issues.join(', ')}`);
    console.log('  Block:', JSON.stringify(b).slice(0, 300));
  } else {
    console.log(`Block ${i} (type=${b.block_type}): ✅`);
  }
}
