const reportService = require('../src/services/report-service');
const zhongmodiTemplate = require('../src/templates/review-report/zhongmodi-template');

const accounts = [
  {
    record_id: 'rec1',
    fields: {
      '账号名称': 'test_glowartTK',
      '目前播放量': '1500000',
      '已发布': '12',
      '粉丝总量': '5000',
    },
  },
  {
    record_id: 'rec2',
    fields: {
      '账号名称': 'test_aiYTB',
      '目前播放量': '800000',
      '已发布': '8',
      '粉丝总量': '3000',
    },
  },
];

const worksMap = new Map([
  ['rec1', [
    { title: 'Test work 1 - high', playCount: 500000, diggCount: 1000, commentCount: 50, shareCount: 20, collectCount: 10, link: 'https://example.com/1' },
    { title: 'Test work 2 - low', playCount: 500, diggCount: 10, commentCount: 1, shareCount: 0, collectCount: 0, link: 'https://example.com/2' },
  ]],
  ['rec2', [
    { title: 'AI work 1', playCount: 200000, diggCount: 500, commentCount: 30, shareCount: 10, collectCount: 5, link: 'https://example.com/3' },
  ]],
]);

const reportData = zhongmodiTemplate.buildReportData('终末地1.2版本', '2026-03-01 ~ 2026-04-01', accounts, worksMap);
const docBlocks = zhongmodiTemplate.buildDocBlocks(reportData, {
  '亮点': '测试亮点',
  '缺点': '测试缺点',
  '成功要素': '结合了近期热门IP\n画面以及音乐魔性洗脑\n融入了许多角色',
  '核心问题': '测试核心问题',
  '优化方向': '测试优化方向',
});

(async () => {
  try {
    const docUrl = await reportService.createFeishuDoc('终末地-full-test', docBlocks);
    console.log('✅ 终末地完整版本成功:', docUrl);
  } catch (e) {
    console.log('❌ 终末地完整版本失败:', e.message);
    if (e.response?.data) {
      console.log('Response:', JSON.stringify(e.response.data, null, 2));
    }
  }
})();
