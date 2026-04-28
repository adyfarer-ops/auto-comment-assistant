require('dotenv').config();
const reportService = require('../src/services/report-service');
const xingtieTemplate = require('../src/templates/review-report/xingtie-template');
const zhongmodiTemplate = require('../src/templates/review-report/zhongmodi-template');

async function testTemplate(template, projectName) {
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

  const reportData = template.buildReportData(
    `${projectName}-本地验证`,
    '2026-04-01 ~ 2026-04-07',
    accounts,
    worksMap
  );

  const docBlocks = template.buildDocBlocks(reportData, {
    '亮点': '测试亮点：数据表现稳定，爆款有突破',
    '缺点': '测试缺点：低播放内容占比偏高',
    '成功要素': '测试成功要素：热点时机把握准确',
    '核心问题': '测试核心问题：内容同质化',
    '优化方向': '测试优化方向：尝试新选题新趋势',
    '增长情况及原因': '测试增长：版本活动带动自然流量',
  });

  console.log(`[${template.name}] Total blocks:`, docBlocks.length);

  const tableCount = docBlocks.filter(b => b.block_type === 31).length;
  console.log(`[${template.name}] Table blocks:`, tableCount);

  try {
    const docUrl = await reportService.createFeishuDoc(`${projectName}-全量测试`, docBlocks);
    console.log(`✅ [${template.name}] Full test passed:`, docUrl);
    return true;
  } catch (error) {
    console.error(`❌ [${template.name}] Full test failed:`, error.message);
    if (error.response?.data) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
    return false;
  }
}

async function main() {
  const xingtieOk = await testTemplate(xingtieTemplate, '星铁');
  const zhongmodiOk = await testTemplate(zhongmodiTemplate, '终末地');

  console.log('\n=== Summary ===');
  console.log('星铁模板:', xingtieOk ? '✅ 通过' : '❌ 失败');
  console.log('终末地模板:', zhongmodiOk ? '✅ 通过' : '❌ 失败');

  process.exit(xingtieOk && zhongmodiOk ? 0 : 1);
}

main();
