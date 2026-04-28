const axios = require('axios');
const feishuBitable = require('./feishu-bitable');
const feishuSpreadsheet = require('./feishu-spreadsheet');
const feishuAuth = require('./feishu-auth');
const aiService = require('./ai-service');
const notifyService = require('./notify-service');
const syncService = require('./sync-service');
const platformResolver = require('./platform-resolver');
const tableResolver = require('./table-resolver');
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
      throw new Error('周报开始日期或周报结束日期未设置');
    }

    logger.info('Generating weekly report', {
      projectName: fields['项目名称'],
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      sheetToken,
    });

    // 先按周报周期同步数据，确保详情表和账号统计是最新的
    try {
      await syncService.syncProjectIncremental(projectRecord, startDate, endDate, {
        triggerSource: '周报生成',
      });
      logger.info('Weekly data sync completed before report generation', { projectName: fields['项目名称'] });
    } catch (error) {
      logger.error('Weekly data sync failed before report generation, continuing with existing data', { projectName: fields['项目名称'], error: error.message });
    }

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
      const accountName = af['账号名称'];
      const target = parseInt(af['保底条数']) || 0;
      const responsible = af['负责人'] || '';
      const platform = this.extractPlatform(accountName);

      // 从详情表按周期统计，避免使用主表全量累计数据
      const periodStats = await this.calculateAccountPeriodStats(
        fields['项目名称'],
        accountName,
        platform,
        af['主页链接'],
        startDate,
        endDate
      );

      // 如果详情表统计失败，回退到主表数据
      const published = periodStats?.published ?? (parseInt(af['已发布']) || 0);
      const playCount = periodStats?.playCount ?? (parseInt(af['目前播放量']) || 0);
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

    // AI 分析建议
    let aiSuggestions = '';
    try {
      const aiPrompt = this.buildAIPrompt(reportData);
      aiSuggestions = await aiService.callAnyProvider(aiPrompt);
      logger.info('AI suggestions generated for weekly report');
    } catch (error) {
      logger.error('AI suggestions generation failed', { error: error.message });
      aiSuggestions = 'AI 建议生成失败，请稍后重试。';
    }
    reportData.aiSuggestions = aiSuggestions;

    // 写入飞书 Spreadsheet
    if (sheetToken) {
      try {
        await this.writeToSpreadsheet(sheetToken, reportData);
        logger.info('Weekly report written to spreadsheet', { sheetToken });
      } catch (error) {
        logger.error('Failed to write weekly report to spreadsheet', { sheetToken, error: error.message });
      }
    }

    // 生成飞书 Docx 文档
    let docUrl = null;
    try {
      docUrl = await this.createWeeklyReportDoc(reportData);
      logger.info('Weekly report doc created', { docUrl });
    } catch (error) {
      logger.error('Failed to create weekly report doc', { error: error.message });
    }

    // 更新项目管理表：周报开始日期、周报结束日期（时间戳秒级）
    try {
      const startTimestamp = Math.floor(startDate.getTime() / 1000);
      const endTimestamp = Math.floor(endDate.getTime() / 1000);
      await feishuBitable.updateRecord(this.projectMgmtAppToken, 'tblxbkkh03Kw10lI', projectRecord.record_id, {
        '周报开始日期': startTimestamp,
        '周报结束日期': endTimestamp,
      });
      logger.info('Project management table updated with weekly report dates');
    } catch (error) {
      logger.error('Failed to update project management table', { error: error.message });
    }

    logger.info('Weekly report generated', { summary: reportData.summary });
    return reportData;
  }

  buildAIPrompt(reportData) {
    const { projectName, period, summary, accounts } = reportData;
    const accountLines = accounts.map(a =>
      `- ${a.name}(${a.platform}): 已发布${a.published}条, 播放量${a.playCount}, 完成率${a.completionRate}`
    ).join('\n');

    return `请为以下游戏海外社媒运营项目生成本周报分析建议：

项目: ${projectName}
统计周期: ${period}
总发布数: ${summary.totalPublished}
总播放量: ${summary.totalPlayCount}
平均完成率: ${summary.avgCompletionRate}

各账号数据:
${accountLines}

请给出：
1. 本周数据表现总结（整体播放量、完成率、稿均等核心指标）
2. 各平台/账号表现分析（哪些表现好，哪些需要关注）
3. 下周重点方向建议
4. 风险预警（如有数据异常）`;
  }

  async createWeeklyReportDoc(reportData) {
    const token = await feishuAuth.getAppToken();
    const title = `${reportData.projectName} 周报 (${reportData.period})`;

    // 创建文档
    const createRes = await axios.post('https://open.feishu.cn/open-apis/docx/v1/documents', {
      title,
    }, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (createRes.data.code !== 0) {
      throw new Error(`Create doc failed: ${createRes.data.msg}`);
    }

    const documentId = createRes.data.data.document.document_id;

    // 构建 blocks
    const blocks = [];

    // 标题
    blocks.push(this.heading1(title));

    // 统计周期
    blocks.push(this.text(`统计周期：${reportData.period}`));
    blocks.push(this.text(''));

    // 汇总数据表格
    blocks.push(this.heading1('汇总数据'));
    blocks.push(this.table(
      ['指标', '数值'],
      [
        ['总账号数', String(reportData.summary.totalAccounts)],
        ['总发布数', String(reportData.summary.totalPublished)],
        ['总播放量', String(reportData.summary.totalPlayCount)],
        ['平均完成率', reportData.summary.avgCompletionRate],
      ]
    ));
    blocks.push(this.text(''));

    // 各账号明细表格
    blocks.push(this.heading1('各账号明细'));
    blocks.push(this.table(
      ['账号名称', '平台', '已发布', '保底条数', '播放量', '完成率', '负责人'],
      reportData.accounts.map(a => [
        a.name,
        a.platform,
        String(a.published),
        String(a.target),
        String(a.playCount),
        a.completionRate,
        a.responsible,
      ])
    ));
    blocks.push(this.text(''));

    // AI 分析建议
    blocks.push(this.heading1('AI 分析建议'));
    const paragraphs = reportData.aiSuggestions.split('\n').filter(p => p.trim());
    for (const para of paragraphs) {
      blocks.push(this.text(para));
    }

    // 过滤空 content block
    const validBlocks = blocks.filter(b => {
      if (b.block_type === 2 && b.text?.elements) {
        return b.text.elements.some(e => e.text_run?.content?.length > 0);
      }
      return true;
    });

    // 批量写入 blocks
    await axios.post(`https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`, {
      children: validBlocks,
      index: 0,
    }, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });

    return `https://vcnsfx7fytb0.feishu.cn/docx/${documentId}`;
  }

  heading1(text) {
    return {
      block_type: 3,
      heading1: { elements: [{ text_run: { content: text } }] },
    };
  }

  text(text) {
    return {
      block_type: 2,
      text: { elements: [{ text_run: { content: text } }] },
    };
  }

  table(headers, rows) {
    const allRows = [headers, ...rows];
    return {
      block_type: 14,
      table: {
        table_width: headers.length,
        table_rows: allRows.length,
        table_columns: headers.length,
        merge_info: [],
      },
      children: allRows.map(row => ({
        block_type: 15,
        table_cell: {
          children: row.map(cell => ({
            block_type: 2,
            text: { elements: [{ text_run: { content: cell } }] },
          })),
        },
      })),
    };
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

  async calculateAccountPeriodStats(projectName, accountName, platform, homeLink, startDate, endDate) {
    try {
      const platformInfo = platformResolver.detectPlatform(homeLink);
      if (!platformInfo) {
        logger.warn('Cannot detect platform for weekly report stats', { accountName, homeLink });
        return null;
      }

      const detailTableId = await tableResolver.resolveDetailTable(projectName, accountName, platformInfo.code);
      if (!detailTableId) {
        logger.warn('Detail table not found for weekly report stats', { projectName, accountName, platform: platformInfo.code });
        return null;
      }

      const records = await feishuBitable.searchRecords(this.projectMgmtAppToken, detailTableId);
      let periodPublished = 0;
      let periodPlayCount = 0;

      for (const r of records) {
        const publishTimeField = r.fields?.['发布时间'];
        if (!publishTimeField) continue;

        // 兼容新旧表：date 类型是数字时间戳，text 类型是字符串
        let publishTime;
        if (typeof publishTimeField === 'number') {
          publishTime = new Date(publishTimeField);
        } else {
          publishTime = new Date(String(publishTimeField).replace(/-/g, '/'));
        }
        if (isNaN(publishTime.getTime())) continue;

        // 按周期过滤：包含开始和结束日期
        const dateOnly = new Date(publishTime.getFullYear(), publishTime.getMonth(), publishTime.getDate());
        const startOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
        const endOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

        if (dateOnly < startOnly || dateOnly > endOnly) continue;

        periodPublished++;
        periodPlayCount += parseInt(r.fields?.['播放量']) || 0;
      }

      return {
        published: periodPublished,
        playCount: periodPlayCount,
      };
    } catch (error) {
      logger.error('Failed to calculate account period stats', { accountName, error: error.message });
      return null;
    }
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
