const axios = require('axios');
const feishuBitable = require('./feishu-bitable');
const feishuAuth = require('./feishu-auth');
const aiService = require('./ai-service');
const templateRegistry = require('../templates/review-report/template-registry');
const tableResolver = require('./table-resolver');
const logger = require('../utils/logger');

class ReportService {
  constructor() {
    this.projectMgmtAppToken = null;
  }

  setProjectMgmtAppToken(token) {
    this.projectMgmtAppToken = token;
    tableResolver.setProjectMgmtAppToken(token);
  }

  async generateReviewReport(projectRecord) {
    const fields = projectRecord.fields;
    const planTableId = fields['表格ID'];
    const templateType = fields['复盘报告模板'] || '终末地';
    const versionStart = fields['版本开始日期'] ? new Date(fields['版本开始日期']) : null;
    const versionEnd = fields['版本结束日期'] ? new Date(fields['版本结束日期']) : null;
    const versionPeriod = versionStart && versionEnd
      ? `${versionStart.toISOString().split('T')[0]} ~ ${versionEnd.toISOString().split('T')[0]}`
      : '';

    logger.info('Generating review report', {
      projectName: fields['项目名称'],
      template: templateType,
    });

    const template = templateRegistry.get(templateType);

    // 获取所有账号数据
    const accounts = await feishuBitable.searchRecords(this.projectMgmtAppToken, planTableId);

    // 获取各账号的作品详情
    const worksMap = await this.fetchWorksForAccounts(fields['项目名称'], accounts);

    // 构建报告数据结构（模板特定）
    const reportData = template.buildReportData(
      fields['项目名称'],
      versionPeriod,
      accounts,
      worksMap
    );

    // 生成 AI 运营建议（模板特定 prompt）
    let aiSuggestions = '';
    try {
      const aiPrompt = template.buildAIPrompt(fields['项目名称'], accounts, worksMap);
      aiSuggestions = await aiService.callAnyProvider(aiPrompt);
    } catch (error) {
      logger.error('AI suggestions generation failed', { error: error.message });
      aiSuggestions = 'AI 建议生成失败，请稍后重试。';
    }

    // 生成飞书文档 blocks（模板特定）
    const docBlocks = template.buildDocBlocks(reportData);

    // 追加 AI 建议 blocks
    docBlocks.push(template.heading2('AI 运营建议'));
    const paragraphs = aiSuggestions.split('\n').filter(p => p.trim());
    for (const para of paragraphs) {
      docBlocks.push(template.text(para));
    }

    // 创建飞书文档
    const docUrl = await this.createFeishuDoc(fields['项目名称'], docBlocks);

    // 更新项目管理表
    await feishuBitable.updateRecord(this.projectMgmtAppToken, 'tblxbkkh03Kw10lI', projectRecord.record_id, {
      '复盘报告文档': docUrl,
    });

    return { docUrl, template: templateType };
  }

  async fetchWorksForAccounts(projectName, accounts) {
    const worksMap = new Map();

    for (const account of accounts) {
      const accountName = account.fields['账号名称'];
      const platformCode = this.extractPlatformCode(accountName);

      try {
        const detailTableId = await tableResolver.resolveDetailTable(projectName, accountName, platformCode);
        if (!detailTableId) {
          worksMap.set(account.record_id, []);
          continue;
        }

        const works = await feishuBitable.searchRecords(this.projectMgmtAppToken, detailTableId);
        worksMap.set(account.record_id, works.map(w => ({
          workId: w.fields['作品ID'],
          title: w.fields['作品标题'],
          link: w.fields['作品链接'],
          publishTime: w.fields['发布时间'],
          playCount: parseInt(w.fields['播放量']) || 0,
          diggCount: parseInt(w.fields['点赞数']) || 0,
          commentCount: parseInt(w.fields['评论数']) || 0,
          shareCount: parseInt(w.fields['分享数']) || 0,
          collectCount: parseInt(w.fields['收藏数']) || 0,
        })));
      } catch (error) {
        logger.warn('Failed to fetch works for account', { accountName, error: error.message });
        worksMap.set(account.record_id, []);
      }
    }

    return worksMap;
  }

  extractPlatformCode(accountName) {
    const upper = accountName.toUpperCase();
    if (upper.includes('TK')) return 'TK';
    if (upper.includes('YTB')) return 'YTB';
    if (upper.includes('INS')) return 'INS';
    if (upper.includes('X-') || upper.includes('X_')) return 'X';
    if (upper.includes('RD')) return 'RD';
    if (upper.includes('FB')) return 'FB';
    return 'TK';
  }

  async createFeishuDoc(projectName, blocks) {
    try {
      const token = await feishuAuth.getAppToken();

      // 创建文档
      const createRes = await axios.post('https://open.feishu.cn/open-apis/docx/v1/documents', {
        title: `${projectName} 复盘报告`,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (createRes.data.code !== 0) {
        throw new Error(`Create doc failed: ${createRes.data.msg}`);
      }

      const documentId = createRes.data.data.document.document_id;

      // 批量写入 blocks
      await axios.post(`https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`, {
        children: blocks,
        index: 0,
      }, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });

      logger.info('Review report doc created', { documentId });

      return `https://vcnsfx7fytb0.feishu.cn/docx/${documentId}`;
    } catch (error) {
      logger.error('Failed to create feishu doc', { error: error.message });
      throw error;
    }
  }
}

module.exports = new ReportService();
