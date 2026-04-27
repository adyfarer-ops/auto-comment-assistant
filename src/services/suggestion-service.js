const aiService = require('./ai-service');
const feishuBitable = require('./feishu-bitable');
const logger = require('../utils/logger');

class SuggestionService {
  constructor() {
    this.projectMgmtAppToken = null;
  }

  setProjectMgmtAppToken(token) {
    this.projectMgmtAppToken = token;
  }

  async generateProjectSuggestions(recordId) {
    const project = await feishuBitable.searchRecords(
      this.projectMgmtAppToken,
      'tblxbkkh03Kw10lI',
      `CurrentValue.[序号] = "${recordId}"`
    );

    if (!project || project.length === 0) {
      throw new Error('Project not found');
    }

    const projectRecord = project[0];
    const planTableId = projectRecord.fields['表格ID'];
    const accounts = await feishuBitable.searchRecords(this.projectMgmtAppToken, planTableId);

    const suggestions = await aiService.generateSuggestions(
      projectRecord.fields['项目名称'],
      accounts
    );

    logger.info('Project suggestions generated', {
      projectName: projectRecord.fields['项目名称'],
      recordId,
    });

    return {
      projectName: projectRecord.fields['项目名称'],
      suggestions,
      accountCount: accounts.length,
    };
  }

  async generateAccountSuggestions(planTableId, recordId) {
    const accounts = await feishuBitable.searchRecords(
      this.projectMgmtAppToken,
      planTableId,
      `CurrentValue.[记录ID] = "${recordId}"`
    );

    if (!accounts || accounts.length === 0) {
      throw new Error('Account not found');
    }

    const account = accounts[0];
    const af = account.fields;

    const prompt = `请为以下海外社媒账号生成具体的运营建议：

账号名称: ${af['账号名称']}
平台: ${af['账号名称']?.split('-')[0] || '未知'}
已发布: ${af['已发布'] || 0} 条
播放量: ${af['目前播放量'] || 0}
粉丝总量: ${af['粉丝总量'] || 0}
发布完成率: ${(parseFloat(af['发布完成率']) * 100).toFixed(0)}%
负责人: ${af['负责人'] || '未指定'}

请给出：
1. 内容方向建议
2. 发布节奏优化
3. 互动增长策略
4. 数据异常预警（如有）
`;

    const suggestion = await aiService.callAnyProvider(prompt);

    logger.info('Account suggestions generated', {
      accountName: af['账号名称'],
      recordId,
    });

    return {
      accountName: af['账号名称'],
      suggestion,
    };
  }
}

module.exports = new SuggestionService();
