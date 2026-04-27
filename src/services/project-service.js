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

  async createProjectTable(recordId, options = {}) {
    const managementTableId = 'tblxbkkh03Kw10lI';
    const traceId = options.traceId || `tr_${Date.now()}`;
    logger.info('createProjectTable start', { recordId, traceId });

    const { projectName, startDate, endDate } = await this._readManagementRecord(managementTableId, recordId);
    if (!projectName || !startDate || !endDate) {
      throw new Error('管理记录缺少必要字段: 项目名称、开始日期、结束日期');
    }

    const tableName = `${projectName}-项目规划`;
    const existing = await this._checkTableExists(tableName);
    if (existing) {
      throw new Error(`项目规划表已存在: ${tableName}`);
    }

    const createResult = await feishuBitable.createTable(this.projectMgmtAppToken, tableName);
    const newTableId = createResult.table_id;
    if (!newTableId) {
      throw new Error('创建表失败，未返回 table_id');
    }
    logger.info('Empty plan table created', { newTableId, tableName });

    const fieldIdMap = await this._createBaseFields(newTableId);
    await this._createDateFields(newTableId, startDate, endDate);
    await this._createFormulaFields(newTableId, fieldIdMap);
    await this._writeBackTableId(managementTableId, recordId, newTableId);

    logger.info('createProjectTable completed', { newTableId, tableName, traceId });
    return { success: true, tableId: newTableId, tableName, projectName, startDate, endDate };
  }

  async _readManagementRecord(managementTableId, recordId) {
    const result = await feishuBitable.getRecord(this.projectMgmtAppToken, managementTableId, recordId);
    const fields = result?.record?.fields || {};
    return {
      projectName: fields['项目名称'],
      startDate: fields['开始日期'],
      endDate: fields['结束日期'],
      tableId: fields['表格ID'],
    };
  }

  async _checkTableExists(tableName) {
    const result = await feishuBitable.getAppTables(this.projectMgmtAppToken);
    const items = result?.items || [];
    return items.find(t => t.name === tableName);
  }

  async _createBaseFields(tableId) {
    const baseFields = [
      { field_name: '账号名称', type: 1 },
      { field_name: '负责人', type: 1 },
      { field_name: '制作', type: 1 },
      { field_name: '粉丝总量', type: 2, property: { formatter: '0' } },
      { field_name: '目标播放量', type: 2, property: { formatter: '0' } },
      { field_name: '已发布', type: 2, property: { formatter: '0' } },
      { field_name: '待发布', type: 2, property: { formatter: '0' } },
      { field_name: '保底条数', type: 2, property: { formatter: '0' } },
      { field_name: '主页链接', type: 1 },
    ];
    const fieldIdMap = {};
    for (const f of baseFields) {
      const result = await feishuBitable.createField(this.projectMgmtAppToken, tableId, f);
      const fieldId = result?.field?.field_id;
      if (fieldId) fieldIdMap[f.field_name] = fieldId;
      await this._sleep(300);
    }
    return fieldIdMap;
  }

  async _createDateFields(tableId, startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error('开始日期或结束日期格式无效');
    }
    if (start > end) {
      throw new Error('开始日期不能晚于结束日期');
    }
    const current = new Date(start);
    while (current <= end) {
      const month = current.getMonth() + 1;
      const day = current.getDate();
      await feishuBitable.createField(this.projectMgmtAppToken, tableId, {
        field_name: `${month}月${day}日`,
        type: 1,
      });
      current.setDate(current.getDate() + 1);
      await this._sleep(300);
    }
  }

  async _createFormulaFields(tableId, fieldIdMap) {
    const viewsResult = await feishuBitable.createField(this.projectMgmtAppToken, tableId, {
      field_name: '目前播放量',
      type: 2,
      property: { formatter: '0' },
    });
    const viewsFieldId = viewsResult?.field?.field_id;
    await this._sleep(300);

    const targetViewsFieldId = fieldIdMap['目标播放量'];
    const publishedFieldId = fieldIdMap['已发布'];
    if (!viewsFieldId || !targetViewsFieldId || !publishedFieldId) {
      throw new Error('创建公式字段失败：缺少依赖字段ID');
    }

    await feishuBitable.createField(this.projectMgmtAppToken, tableId, {
      field_name: '稿均',
      type: 20,
      property: {
        formula_expression: `bitable::$table[${tableId}].$field[${viewsFieldId}] / bitable::$table[${tableId}].$field[${publishedFieldId}]`,
      },
    });
    await this._sleep(300);

    const totalViewsResult = await feishuBitable.createField(this.projectMgmtAppToken, tableId, {
      field_name: '总完成播放',
      type: 20,
      property: {
        formula_expression: `SUM(bitable::$table[${tableId}].$column[${viewsFieldId}])`,
      },
    });
    const totalViewsFieldId = totalViewsResult?.field?.field_id;
    await this._sleep(300);

    await feishuBitable.createField(this.projectMgmtAppToken, tableId, {
      field_name: '完成率',
      type: 20,
      property: {
        formula_expression: `VALUE(bitable::$table[${tableId}].$field[${totalViewsFieldId}]) / VALUE(bitable::$table[${tableId}].$field[${targetViewsFieldId}])`,
      },
    });
  }

  async _writeBackTableId(managementTableId, recordId, newTableId) {
    return feishuBitable.updateRecord(this.projectMgmtAppToken, managementTableId, recordId, {
      '表格ID': newTableId,
    });
  }

  async _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new ProjectService();
