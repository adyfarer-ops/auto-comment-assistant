const axios = require('axios');
const feishuBitable = require('./feishu-bitable');
const feishuAuth = require('./feishu-auth');
const aiService = require('./ai-service');
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

    // 生成 AI 运营建议
    let aiSuggestions = '';
    try {
      aiSuggestions = await aiService.generateSuggestions(fields['项目名称'], accounts);
    } catch (error) {
      logger.error('AI suggestions generation failed', { error: error.message });
      aiSuggestions = 'AI 建议生成失败，请稍后重试。';
    }

    const reportContent = this.buildReportContent(fields['项目名称'], template, accounts, versionStart, versionEnd);

    // 创建飞书文档
    const docUrl = await this.createFeishuDoc(fields['项目名称'], reportContent, accounts, template, aiSuggestions);

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
      content += `_按动画、漫画、攻略等类型分组统计（需在账号名称或备注中标注内容类型）_\n\n`;
    }

    content += `## 问题与建议\n\n`;
    content += `_详见文档中 AI 运营建议部分_\n\n`;

    return content;
  }

  async createFeishuDoc(projectName, content, accounts, template, aiSuggestions = '') {
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

      // 写入文档内容
      await this.writeDocBlocks(documentId, token, projectName, content, accounts, template, aiSuggestions);

      logger.info('Review report doc created', { documentId });

      return `https://vcnsfx7fytb0.feishu.cn/docx/${documentId}`;
    } catch (error) {
      logger.error('Failed to create feishu doc', { error: error.message });
      throw error;
    }
  }

  async writeDocBlocks(documentId, token, projectName, content, accounts, template, aiSuggestions = '') {
    const blocks = [];

    // 标题
    blocks.push({
      block_type: 3,
      heading1: {
        elements: [{ text_run: { content: `${projectName} 复盘报告` } }],
      },
    });

    // 统计周期
    blocks.push({
      block_type: 2,
      text: {
        elements: [{ text_run: { content: content.split('\n')[1] || '' } }],
      },
    });

    // 分隔线
    blocks.push({ block_type: 9 });

    // 数据概览标题
    blocks.push({
      block_type: 4,
      heading2: {
        elements: [{ text_run: { content: '数据概览' } }],
      },
    });

    const totalPublished = accounts.reduce((sum, a) => sum + (parseInt(a.fields['已发布']) || 0), 0);
    const totalPlayCount = accounts.reduce((sum, a) => sum + (parseInt(a.fields['目前播放量']) || 0), 0);
    const avgPlayCount = totalPublished > 0 ? Math.round(totalPlayCount / totalPublished) : 0;

    blocks.push({
      block_type: 6,
      bullet: {
        elements: [{ text_run: { content: `总账号数: ${accounts.length}` } }],
      },
    });
    blocks.push({
      block_type: 6,
      bullet: {
        elements: [{ text_run: { content: `总发布数: ${totalPublished}` } }],
      },
    });
    blocks.push({
      block_type: 6,
      bullet: {
        elements: [{ text_run: { content: `总播放量: ${totalPlayCount.toLocaleString()}` } }],
      },
    });
    blocks.push({
      block_type: 6,
      bullet: {
        elements: [{ text_run: { content: `平均播放量: ${avgPlayCount.toLocaleString()}` } }],
      },
    });

    // 账号表现标题
    blocks.push({
      block_type: 4,
      heading2: {
        elements: [{ text_run: { content: '账号表现' } }],
      },
    });

    // 表格
    const tableRows = [
      ['账号', '已发布', '播放量', '完成率', '负责人'],
      ...accounts.map(a => {
        const af = a.fields;
        return [
          af['账号名称'] || '',
          String(af['已发布'] || 0),
          String((parseInt(af['目前播放量']) || 0).toLocaleString()),
          `${(parseFloat(af['发布完成率']) * 100).toFixed(0)}%`,
          af['负责人'] || '',
        ];
      }),
    ];

    const tableBlock = {
      block_type: 14,
      table: {
        table_width: 5,
        table_rows: tableRows.length,
        table_columns: 5,
        merge_info: [],
      },
      children: tableRows.map(row => ({
        block_type: 15,
        table_cell: { children: row.map(cell => ({
          block_type: 2,
          text: { elements: [{ text_run: { content: cell } }] },
        })) },
      })),
    };

    blocks.push(tableBlock);

    // AI 运营建议
    if (aiSuggestions) {
      blocks.push({
        block_type: 4,
        heading2: {
          elements: [{ text_run: { content: 'AI 运营建议' } }],
        },
      });

      // 将 AI 建议按段落分割写入
      const paragraphs = aiSuggestions.split('\n').filter(p => p.trim());
      for (const para of paragraphs) {
        blocks.push({
          block_type: 2,
          text: {
            elements: [{ text_run: { content: para } }],
          },
        });
      }
    }

    // 批量写入 blocks
    await axios.post(`https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`, {
      children: blocks,
      index: 0,
    }, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
  }
}

module.exports = new ReportService();
