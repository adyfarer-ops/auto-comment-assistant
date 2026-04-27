const feishuBitable = require('./feishu-bitable');
const feishuSpreadsheet = require('./feishu-spreadsheet');
const logger = require('../utils/logger');

class WeeklyReportService {
  constructor() {
    this.projectMgmtAppToken = null;
  }

  setProjectMgmtAppToken(token) {
    this.projectMgmtAppToken = token;
  }

  async generateWeeklyReport(projectRecord) {
    const fields = projectRecord.fields;
    const planTableId = fields['表格ID'];
    const startDate = fields['周报开始日期'] ? new Date(fields['周报开始日期']) : null;
    const endDate = fields['周报结束日期'] ? new Date(fields['周报结束日期']) : null;
    const sheetToken = fields['周报Sheet'];

    if (!startDate || !endDate) {
      throw new Error('周报开始日期或结束日期未设置');
    }

    logger.info('Generating weekly report', {
      projectName: fields['项目名称'],
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      sheetToken,
    });

    const accounts = await feishuBitable.searchRecords(this.projectMgmtAppToken, planTableId);

    const reportData = {
      projectName: fields['项目名称'],
      period: `${startDate.toISOString().split('T')[0]} ~ ${endDate.toISOString().split('T')[0]}`,
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
      const published = parseInt(af['已发布']) || 0;
      const playCount = parseInt(af['目前播放量']) || 0;
      const completionRate = parseFloat(af['发布完成率']) || 0;

      reportData.accounts.push({
        name: af['账号名称'],
        platform: this.extractPlatform(af['账号名称']),
        published,
        target: parseInt(af['保底条数']) || 0,
        playCount,
        completionRate: (completionRate * 100).toFixed(2) + '%',
        responsible: af['负责人'] || '',
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

    // 写入飞书 Spreadsheet
    if (sheetToken) {
      try {
        await this.writeToSpreadsheet(sheetToken, reportData);
        logger.info('Weekly report written to spreadsheet', { sheetToken });
      } catch (error) {
        logger.error('Failed to write weekly report to spreadsheet', { sheetToken, error: error.message });
      }
    }

    logger.info('Weekly report generated', { summary: reportData.summary });
    return reportData;
  }

  async writeToSpreadsheet(sheetToken, reportData) {
    const sheetName = 'Sheet1';
    const headerRow = 1;

    // 写入表头
    const headers = ['账号名称', '平台', '已发布', '保底条数', '播放量', '发布完成率', '负责人'];
    await feishuSpreadsheet.writeValues(sheetToken, `${sheetName}!A${headerRow}:G${headerRow}`, [headers]);

    // 写入数据
    const rows = reportData.accounts.map((a, i) => [
      a.name,
      a.platform,
      a.published,
      a.target,
      a.playCount,
      a.completionRate,
      a.responsible,
    ]);

    if (rows.length > 0) {
      await feishuSpreadsheet.writeValues(sheetToken, `${sheetName}!A2:G${rows.length + 1}`, rows);
    }

    // 写入汇总
    const summaryRow = rows.length + 3;
    await feishuSpreadsheet.writeValues(sheetToken, `${sheetName}!A${summaryRow}:G${summaryRow + 2}`, [
      ['汇总', '', '', '', '', '', ''],
      ['总账号数', reportData.summary.totalAccounts, '', '', '', '', ''],
      ['总发布数', reportData.summary.totalPublished, '', '', '', '', ''],
      ['总播放量', reportData.summary.totalPlayCount, '', '', '', '', ''],
    ]);
  }

  extractPlatform(accountName) {
    const platforms = ['TikTok', 'YouTube', 'Instagram', 'X', 'Reddit', 'Facebook', 'Bilibili', 'Douyin'];
    for (const p of platforms) {
      if (accountName.includes(p)) return p;
    }
    return 'Unknown';
  }
}

module.exports = new WeeklyReportService();
