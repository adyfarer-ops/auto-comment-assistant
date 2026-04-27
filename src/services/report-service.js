const axios = require('axios');
const feishuBitable = require('./feishu-bitable');
const feishuAuth = require('./feishu-auth');
const logger = require('../utils/logger');

class ReportService {
  constructor() {
    this.projectMgmtAppToken = null;
  }

  setProjectMgmtAppToken(token) {
    this.projectMgmtAppToken = token;
  }

  async generateReviewReport(projectRecord) {
    const fields = projectRecord.fields;
    const planTableId = fields['表格ID'];
    const template = fields['复盘报告模板'];
    const versionStart = fields['版本开始日期'] ? new Date(fields['版本开始日期']) : null;
    const versionEnd = fields['版本结束日期'] ? new Date(fields['版本结束日期']) : null;

    logger.info('Generating review report', {
      projectName: fields['项目名称'],
      template,
    });

    // 获取所有账号数据
    const accounts = await feishuBitable.searchRecords(this.projectMgmtAppToken, planTableId);

    const reportContent = this.buildReportContent(fields['项目名称'], template, accounts, versionStart, versionEnd);

    // 创建飞书文档
    const docUrl = await this.createFeishuDoc(fields['项目名称'], reportContent);

    // 更新项目管理表
    await feishuBitable.updateRecord(this.projectMgmtAppToken, 'tblxbkkh03Kw10lI', projectRecord.record_id, {
      '复盘报告文档': docUrl,
    });

    return { docUrl };
  }

  buildReportContent(projectName, template, accounts, versionStart, versionEnd) {
    const period = versionStart && versionEnd
      ? `${versionStart.toISOString().split('T')[0]} ~ ${versionEnd.toISOString().split('T')[0]}`
      : '';

    let content = `# ${projectName} 复盘报告\n\n`;
    content += `**统计周期**: ${period}\n\n`;
    content += `---\n\n`;

    // 数据概览
    const totalPublished = accounts.reduce((sum, a) => sum + (parseInt(a.fields['已发布']) || 0), 0);
    const totalPlayCount = accounts.reduce((sum, a) => sum + (parseInt(a.fields['目前播放量']) || 0), 0);
    const avgPlayCount = totalPublished > 0 ? Math.round(totalPlayCount / totalPublished) : 0;

    content += `## 数据概览\n\n`;
    content += `- 总账号数: ${accounts.length}\n`;
    content += `- 总发布数: ${totalPublished}\n`;
    content += `- 总播放量: ${totalPlayCount.toLocaleString()}\n`;
    content += `- 平均播放量: ${avgPlayCount.toLocaleString()}\n\n`;

    // 账号明细
    content += `## 账号表现\n\n`;
    content += `| 账号 | 已发布 | 播放量 | 完成率 | 负责人 |\n`;
    content += `|------|--------|--------|--------|--------|\n`;

    for (const account of accounts) {
      const af = account.fields;
      content += `| ${af['账号名称'] || ''} | ${af['已发布'] || 0} | ${(parseInt(af['目前播放量']) || 0).toLocaleString()} | ${(parseFloat(af['发布完成率']) * 100).toFixed(0)}% | ${af['负责人'] || ''} |\n`;
    }

    content += `\n`;

    // 按模板分组（终末地模板按内容类型分组）
    if (template === '终末地') {
      content += `## 内容类型分析\n\n`;
      content += `_TODO: 按动画、漫画、攻略等类型分组统计_\n\n`;
    }

    content += `## 问题与建议\n\n`;
    content += `_TODO: 结合 AI 分析生成运营建议_\n\n`;

    return content;
  }

  async createFeishuDoc(projectName, content) {
    try {
      const token = await feishuAuth.getAppToken();

      // 创建文档
      const createRes = await axios.post('https://open.feishu.cn/open-apis/docx/v1/documents', {
        title: `${projectName} 复盘报告`,
        folder_token: '',
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (createRes.data.code !== 0) {
        throw new Error(`Create doc failed: ${createRes.data.msg}`);
      }

      const documentId = createRes.data.data.document.document_id;

      // TODO: 写入文档内容（需要调用 block API）
      logger.info('Review report doc created', { documentId });

      return `https://vcnsfx7fytb0.feishu.cn/docx/${documentId}`;
    } catch (error) {
      logger.error('Failed to create feishu doc', { error: error.message });
      throw error;
    }
  }
}

module.exports = new ReportService();
