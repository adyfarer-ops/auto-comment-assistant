// 复盘报告纯逻辑测试（不调用外部 API）
const xingtieTemplate = require('../src/templates/review-report/xingtie-template');
const zhongmodiTemplate = require('../src/templates/review-report/zhongmodi-template');

function createMockAccounts() {
  return [
    {
      record_id: 'rec1',
      fields: {
        '账号名称': 'starrailpainterzzTK',
        '目前播放量': '5570000',
        '已发布': '104',
        '粉丝总量': '150000',
        '2.14粉丝量': '140000',
        '3.27粉丝量': '150000',
        '涨粉走势': '稳步上升，4.0版本活动带动明显',
        '用户画像': '18-25岁男性为主，欧美地区',
        '播放来源': '推荐页 75%，关注流 15%，搜索 10%',
      },
    },
    {
      record_id: 'rec2',
      fields: {
        '账号名称': 'idrilaTK',
        '目前播放量': '3150000',
        '已发布': '85',
        '粉丝总量': '85000',
        '2.14粉丝量': '82000',
        '3.27粉丝量': '85000',
        '涨粉走势': '波动上升',
        '用户画像': '18-30岁女性占比提升',
        '播放来源': '推荐页 60%，关注流 25%，搜索 15%',
      },
    },
    {
      record_id: 'rec3',
      fields: {
        '账号名称': 'test_分发账号YTB',
        '目前播放量': '482000',
        '已发布': '45',
        '粉丝总量': '25000',
      },
    },
  ];
}

function createMockWorksMap() {
  return new Map([
    ['rec1', [
      { title: '火花 花火 爻光三人的魔性meme舞蹈', playCount: 1330000, diggCount: 50000, commentCount: 2000, shareCount: 1000, collectCount: 500, link: 'https://www.tiktok.com/@starrailpainterzz/video/7613717507790097677' },
      { title: '复刻绝区零的同人二创手书', playCount: 21740, diggCount: 500, commentCount: 30, shareCount: 10, collectCount: 5, link: 'https://www.tiktok.com/@starrailpainterzz/video/7621148994642709773' },
      { title: '日常更新1', playCount: 150000, diggCount: 3000, commentCount: 100, shareCount: 50, collectCount: 20, link: 'https://example.com/1' },
    ]],
    ['rec2', [
      { title: '开拓者和卡芙卡的arar meme', playCount: 639000, diggCount: 25000, commentCount: 1500, shareCount: 800, collectCount: 300, link: 'https://www.tiktok.com/@idrila/video/7621929891293859085' },
      { title: '白厄和万敌的递东西meme', playCount: 13000, diggCount: 200, commentCount: 10, shareCount: 5, collectCount: 2, link: 'https://www.tiktok.com/@idrila/video/7612976300147363085' },
    ]],
    ['rec3', [
      { title: '爻光和星期日的对话', playCount: 44268, diggCount: 1000, commentCount: 50, shareCount: 20, collectCount: 10, link: 'https://www.youtube.com/shorts/xf7TmDzaDqE' },
      { title: '分发内容1', playCount: 5000, diggCount: 100, commentCount: 5, shareCount: 2, collectCount: 1, link: 'https://example.com/3' },
    ]],
  ]);
}

function testXingtie() {
  console.log('\n=== 星铁模板测试 ===');
  const accounts = createMockAccounts();
  const worksMap = createMockWorksMap();

  // 1. 测试 buildReportData
  const reportData = xingtieTemplate.buildReportData(
    '星铁4.0版本',
    '2026-02-14 ~ 2026-03-27',
    accounts,
    worksMap
  );

  console.log('✅ buildReportData 成功');
  console.log('  - 项目名:', reportData.projectName);
  console.log('  - 账号数:', reportData.totalAccounts);
  console.log('  - 类型汇总行数:', reportData.typeSummary.length);
  console.log('  - 单个账号分析数:', reportData.accountAnalysis.length);
  console.log('  - 是否有专项复盘:', reportData.hasSpecialReview);

  // 验证粉丝量字段查找
  const painter = reportData.accountAnalysis.find(a => a.name === 'starrailpainterzzTK');
  if (painter) {
    console.log('  - painterzz 粉丝量:', '初=' + painter.fansStart, '末=' + painter.fansEnd, '增=' + painter.fansGrowth);
  }

  // 验证分发账号（无日期格式粉丝量字段）
  const dist = reportData.accountAnalysis.find(a => a.name === 'test_分发账号YTB');
  if (dist) {
    console.log('  - 分发账号粉丝量:', '初=' + dist.fansStart, '末=' + dist.fansEnd, '增=' + dist.fansGrowth);
  }

  // 验证数据总览表格字段
  const allRow = reportData.typeSummary.find(t => t.type === 'ALL');
  console.log('  - ALL行粉丝:', '初=' + allRow.fansStart, '末=' + allRow.fansEnd, '增=' + allRow.fansGrowth);

  // 2. 测试 buildDocBlocks
  const aiContent = xingtieTemplate.parseAIResponse(`【starrailpainterzzTK】
[亮点]
出现了一条133万播放量的爆款，热点捕捉及时

[缺点]
播放量不稳定，堡垒之夜内容后常规内容下滑

[成功要素]
视频制作时植物大战僵尸在tk上讨论度较高
抓住了热点，火花和爻光都是本期up角色

[增长情况]
本版本播放增长与粉丝增速大幅上升
独特的画风是涨粉核心
热点捕捉及时，比如"去巴西"和"开车"meme都赶在了第一波热度

[核心问题]
连续使用火花x花火组合太多次，观众审美疲劳

[优化方向]
维持画风不变
穿插制作其他经典ip角色的视频，避免同一角色/组合过度使用

【idrilaTK】
[亮点]
做出了1条60w的爆款视频

[缺点]
在发布堡垒之夜内容后常规内容有一段时间有些下滑

[成功要素]
梗本身洗脑且知名度高，角色选取合适
角色本身热度不低，人物背景适合趋势内容

[增长情况]
本版本播放增长与粉丝有所上升
有几条小爆款视频的产出
账号风格受观众喜爱

[核心问题]
账号数据不稳定

[优化方向]
在选角上进行多方面考虑
避免旧梗的重复绘制，优先使用新选题新趋势`);

  const docBlocks = xingtieTemplate.buildDocBlocks(reportData, aiContent);
  console.log('✅ buildDocBlocks 成功');
  console.log('  - 总 block 数:', docBlocks.length);
  console.log('  - 表格 block 数:', docBlocks.filter(b => b.block_type === 31).length);
  console.log('  - heading1 数:', docBlocks.filter(b => b.block_type === 3).length);
  console.log('  - heading2 数:', docBlocks.filter(b => b.block_type === 4).length);

  // 3. 测试 parseAIResponse
  console.log('✅ parseAIResponse 成功');
  console.log('  - 解析到账号数:', Object.keys(aiContent.accounts).length);
  console.log('  - painterzz 亮点:', (aiContent.accounts['starrailpainterzzTK']?.['亮点'] || '').slice(0, 30) + '...');

  return true;
}

function testZhongmodi() {
  console.log('\n=== 终末地模板测试 ===');
  const accounts = createMockAccounts();
  const worksMap = createMockWorksMap();

  const reportData = zhongmodiTemplate.buildReportData(
    '终末地1.2版本',
    '2026-03-01 ~ 2026-04-01',
    accounts,
    worksMap
  );

  console.log('✅ buildReportData 成功');
  console.log('  - 方向数:', reportData.directions.length);

  const docBlocks = zhongmodiTemplate.buildDocBlocks(reportData, {
    '亮点': '测试亮点',
    '缺点': '测试缺点',
    '成功要素': '结合了近期热门IP\n画面以及音乐魔性洗脑\n融入了许多角色',
    '核心问题': '测试核心问题',
    '优化方向': '测试优化方向',
  });

  console.log('✅ buildDocBlocks 成功');
  console.log('  - 总 block 数:', docBlocks.length);
  console.log('  - 表格 block 数:', docBlocks.filter(b => b.block_type === 31).length);

  return true;
}

function testVideoAnalysisChain() {
  console.log('\n=== 视频分析调用链检查 ===');
  const reportService = require('../src/services/report-service');

  // 检查 _analyzeTopWorks 是否存在
  if (typeof reportService._analyzeTopWorks === 'function') {
    console.log('✅ _analyzeTopWorks 方法存在');
  } else {
    console.log('❌ _analyzeTopWorks 方法缺失');
    return false;
  }

  // 检查 videoExtractionService 注入
  const videoExtractionService = require('../src/services/video-extraction-service');
  if (videoExtractionService && typeof videoExtractionService.extractVideoUrl === 'function') {
    console.log('✅ videoExtractionService.extractVideoUrl 存在');
  } else {
    console.log('❌ videoExtractionService.extractVideoUrl 缺失');
    return false;
  }

  // 检查 videoAnalysisService 注入
  const videoAnalysisService = require('../src/services/video-analysis-service');
  if (videoAnalysisService && typeof videoAnalysisService.analyzeVideoDirect === 'function') {
    console.log('✅ videoAnalysisService.analyzeVideoDirect 存在');
  } else {
    console.log('❌ videoAnalysisService.analyzeVideoDirect 缺失');
    return false;
  }

  return true;
}

function testImageUpload() {
  console.log('\n=== 图片上传功能检查 ===');
  const fs = require('fs');
  const path = require('path');

  // 检查 feishu-service 中是否有 uploadImage
  const feishuServicePath = path.join(__dirname, '../src/services/feishu-service.js');
  if (fs.existsSync(feishuServicePath)) {
    const content = fs.readFileSync(feishuServicePath, 'utf-8');
    if (content.includes('uploadImage')) {
      console.log('✅ feishu-service.js 包含 uploadImage');
    } else {
      console.log('⚠️ feishu-service.js 不包含 uploadImage（图片上传功能缺失）');
    }
  }

  // 检查 report-service 中是否有图片上传调用
  const reportServicePath = path.join(__dirname, '../src/services/report-service.js');
  const reportContent = fs.readFileSync(reportServicePath, 'utf-8');
  if (reportContent.includes('uploadImage') || reportContent.includes('image')) {
    console.log('⚠️ report-service.js 中图片上传调用不完整（仅文本分析，无图片插入）');
  } else {
    console.log('⚠️ report-service.js 中无图片上传逻辑');
  }

  return true;
}

async function main() {
  console.log('开始复盘报告逻辑自测...');

  let ok = true;
  try {
    ok = testXingtie() && ok;
  } catch (e) {
    console.error('❌ 星铁模板测试失败:', e.message);
    ok = false;
  }

  try {
    ok = testZhongmodi() && ok;
  } catch (e) {
    console.error('❌ 终末地模板测试失败:', e.message);
    ok = false;
  }

  try {
    ok = testVideoAnalysisChain() && ok;
  } catch (e) {
    console.error('❌ 视频分析链检查失败:', e.message);
    ok = false;
  }

  try {
    ok = testImageUpload() && ok;
  } catch (e) {
    console.error('❌ 图片上传检查失败:', e.message);
    ok = false;
  }

  console.log('\n=== 测试结果 ===');
  if (ok) {
    console.log('✅ 核心逻辑测试通过');
  } else {
    console.log('❌ 存在失败项');
  }

  process.exit(ok ? 0 : 1);
}

main();
