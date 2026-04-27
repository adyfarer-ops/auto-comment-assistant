const feishuBitable = require('./feishu-bitable');
const logger = require('../utils/logger');

class ProjectService {
  constructor() {
    this.projectMgmtAppToken = null;
  }

  setProjectMgmtAppToken(token) {
    this.projectMgmtAppToken = token;
  }

  async listProjects() {
    const records = await feishuBitable.searchRecords(this.projectMgmtAppToken, 'tblxbkkh03Kw10lI');
    return records.map(r => ({
      recordId: r.record_id,
      name: r.fields['项目名称'],
      planTableId: r.fields['表格ID'],
      status: r.fields['任务执行状态'],
      reportTemplate: r.fields['复盘报告模板'],
      reportDoc: r.fields['复盘报告文档'],
      versionStart: r.fields['版本开始日期'],
      versionEnd: r.fields['版本结束日期'],
    }));
  }

  async getProjectByRecordId(recordId) {
    const records = await feishuBitable.searchRecords(
      this.projectMgmtAppToken,
      'tblxbkkh03Kw10lI',
      `CurrentValue.[序号] = "${recordId}"`
    );
    return records[0] || null;
  }

  async getProjectByTableId(tableId) {
    const records = await feishuBitable.searchRecords(
      this.projectMgmtAppToken,
      'tblxbkkh03Kw10lI',
      `CurrentValue.[表格ID] = "${tableId}"`
    );
    return records[0] || null;
  }

  async updateProjectStatus(recordId, status) {
    return feishuBitable.updateRecord(this.projectMgmtAppToken, 'tblxbkkh03Kw10lI', recordId, {
      '任务执行状态': status,
    });
  }

  async getProjectAccounts(planTableId) {
    return feishuBitable.searchRecords(this.projectMgmtAppToken, planTableId);
  }

  async createDetailTable(projectName, accountName, platformCode) {
    const tableName = `${projectName.split('-')[0]}-${accountName.replace(/\s+/g, '')}${platformCode}-作品详情`;

    try {
      const result = await feishuBitable.createTable(this.projectMgmtAppToken, tableName, [
        { field_name: 'ID', type: 'auto_number' },
        { field_name: '总表记录ID', type: 'text' },
        { field_name: '作品ID', type: 'text' },
        { field_name: '作品标题', type: 'text' },
        { field_name: '作品链接', type: 'text' },
        { field_name: '发布时间', type: 'text' },
        { field_name: '播放量', type: 'number' },
        { field_name: '点赞数', type: 'number' },
        { field_name: '评论数', type: 'number' },
        { field_name: '分享数', type: 'number' },
        { field_name: '收藏数', type: 'number' },
        { field_name: '数据状态', type: 'text' },
        { field_name: '同步时间', type: 'date' },
      ]);

      logger.info('Detail table created', { tableName, tableId: result.table_id });
      return result.table_id;
    } catch (error) {
      logger.error('Failed to create detail table', { tableName, error: error.message });
      throw error;
    }
  }
}

module.exports = new ProjectService();
