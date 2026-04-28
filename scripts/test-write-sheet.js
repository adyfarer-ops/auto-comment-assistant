require('dotenv').config();
const config = require('../config');

const projectService = require('../src/services/project-service');
const weeklyReportService = require('../src/services/weekly-report-service');
const tableResolver = require('../src/services/table-resolver');
const feishuBitable = require('../src/services/feishu-bitable');
const aiService = require('../src/services/ai-service');
const logger = require('../src/utils/logger');

const projectMgmtAppToken = config.project.managementTableToken || 'GEZ9bWr5kaexSEssvUaczO0Knhh';
projectService.setProjectMgmtAppToken(projectMgmtAppToken);
weeklyReportService.setProjectMgmtAppToken(projectMgmtAppToken);
tableResolver.setProjectMgmtAppToken(projectMgmtAppToken);

async function main() {
  const recordId = process.argv[2];
  if (!recordId) {
    console.error('Usage: node scripts/test-write-sheet.js <recordId>');
    process.exit(1);
  }

  console.log(`Fetching project record: ${recordId}`);
  const project = await projectService.getProjectByRecordId(recordId);
  if (!project) {
    console.error('Project not found');
    process.exit(1);
  }

  const fields = project.fields;
  const planTableId = fields['表格ID'];
  const startDate = fields['周报开始日期'] ? weeklyReportService._parseDate(fields['周报开始日期']) : null;
  const endDate = fields['周报结束日期'] ? weeklyReportService._parseDate(fields['周报结束日期']) : null;
  const sheetToken = fields['周报Sheet'];

  if (!startDate || !endDate) {
    console.error('周报开始日期或周报结束日期未设置');
    process.exit(1);
  }
  if (!sheetToken) {
    console.error('周报Sheet未设置');
    process.exit(1);
  }

  console.log('Project:', fields['项目名称']);
  console.log('Weekly period:', weeklyReportService._formatDate(startDate), '~', weeklyReportService._formatDate(endDate));
  console.log('Sheet token:', sheetToken);

  const accounts = await feishuBitable.searchRecords(projectMgmtAppToken, planTableId);
  console.log(`Found ${accounts.length} accounts`);

  const reportData = {
    projectName: fields['项目名称'],
    period: `${weeklyReportService._formatDate(startDate)} ~ ${weeklyReportService._formatDate(endDate)}`,
    accounts: [],
    summary: {
      totalAccounts: accounts.length,
      totalPublished: 0,
      totalPlayCount: 0,
      avgCompletionRate: 0,
    },
  };

  for (const account of accounts) {
    const af = account.fields;
    const accountName = af['账号名称'];
    const target = parseInt(af['保底条数']) || 0;
    const responsible = af['负责人'] || '';
    const platform = weeklyReportService.extractPlatform(accountName);

    const versionStart = fields['版本开始日期'] ? weeklyReportService._parseDate(fields['版本开始日期']) : null;
    const versionEnd = fields['版本结束日期'] ? weeklyReportService._parseDate(fields['版本结束日期']) : null;
    const weeklyStart = startDate;
    const weeklyEnd = endDate;
    const homeLink = weeklyReportService._extractLink(af['主页链接']);

    console.log(`Calculating stats for ${accountName}...`);
    const detailStats = await weeklyReportService.calculateAccountStatsFromDetail(
      fields['项目名称'],
      accountName,
      platform,
      homeLink,
      versionStart,
      versionEnd,
      weeklyStart,
      weeklyEnd
    );

    const published = detailStats?.published ?? (parseInt(af['已发布']) || 0);
    const playCount = detailStats?.playCount ?? (parseInt(af['目前播放量']) || 0);
    const completionRate = target > 0 ? (published / target) : (parseFloat(af['发布完成率']) || 0);

    reportData.accounts.push({
      name: accountName,
      platform,
      published,
      target,
      playCount,
      completionRate: (completionRate * 100).toFixed(2) + '%',
      responsible,
    });

    reportData.summary.totalPublished += published;
    reportData.summary.totalPlayCount += playCount;
  }

  if (accounts.length > 0) {
    reportData.summary.avgCompletionRate = (reportData.accounts.reduce((sum, a) => {
      const rate = parseFloat(a.completionRate);
      return sum + (isNaN(rate) ? 0 : rate);
    }, 0) / accounts.length).toFixed(2) + '%';
  }

  reportData.startDate = startDate;
  reportData.endDate = endDate;

  // AI 分析建议
  let aiSuggestions = '';
  try {
    const aiPrompt = weeklyReportService.buildAIPrompt(reportData);
    aiSuggestions = await aiService.callAnyProvider(aiPrompt);
    console.log('AI suggestions generated');
    const parsed = weeklyReportService.parseAISuggestions(aiSuggestions);
    reportData.highlights = parsed.highlights;
    reportData.lowlights = parsed.lowlights;
    reportData.nextSteps = parsed.nextSteps;
  } catch (error) {
    console.error('AI suggestions generation failed', error.message);
    reportData.highlights = '';
    reportData.lowlights = '';
    reportData.nextSteps = '';
  }
  reportData.aiSuggestions = aiSuggestions;

  console.log('Report summary:', reportData.summary);
  console.log('Writing to spreadsheet...');

  await weeklyReportService.writeToSpreadsheet(sheetToken, reportData);
  console.log('Write completed successfully.');
}

main().catch((err) => {
  console.error('Failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
