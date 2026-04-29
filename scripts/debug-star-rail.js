const reportService = require('../src/services/report-service');
const xingtieTemplate = require('../src/templates/review-report/xingtie-template');

const accounts = [
  {
    record_id: 'rec1',
    fields: {
      '账号名称': 'test_painterzzTK',
      '目前播放量': '1500000',
      '已发布': '12',
      '粉丝总量': '5000',
      '涨粉走势': '稳步上升',
      '用户画像': '18-25岁男性为主',
      '播放来源': '推荐页 70%',
    },
  },
  {
    record_id: 'rec2',
    fields: {
      '账号名称': 'test_local_EN',
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
    { title: 'Test work 3 - low', playCount: 300, diggCount: 5, commentCount: 0, shareCount: 0, collectCount: 0, link: 'https://example.com/3' },
  ]],
  ['rec2', [
    { title: 'Local work 1', playCount: 200000, diggCount: 500, commentCount: 30, shareCount: 10, collectCount: 5, link: 'https://example.com/3' },
  ]],
]);

const reportData = xingtieTemplate.buildReportData('星铁4.0版本', '2026-02-14 ~ 2026-03-27', accounts, worksMap);
const docBlocks = xingtieTemplate.buildDocBlocks(reportData, {
  '亮点': '测试亮点：数据表现稳定，爆款有突破',
  '缺点': '测试缺点：低播放内容占比偏高',
  '成功要素': '测试成功要素：热点时机把握准确',
  '核心问题': '测试核心问题：内容同质化',
  '优化方向': '测试优化方向：尝试新选题新趋势',
  '增长情况': '测试增长：版本活动带动自然流量',
});

(async () => {
  try {
    const docUrl = await reportService.createFeishuDoc('星铁-full-test', docBlocks);
    console.log('✅ 完整版本成功:', docUrl);
  } catch (e) {
    console.log('❌ 完整版本失败:', e.message);
    if (e.response?.data) {
      console.log('Response:', JSON.stringify(e.response.data, null, 2));
    }
  }
})();
