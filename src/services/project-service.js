const feishuBitable = require('./feishu-bitable');
const platformResolver = require('./platform-resolver');
const logService = require('./log-service');
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
      const createResult = await feishuBitable.createTable(this.projectMgmtAppToken, tableName);
      const newTableId = createResult.table_id;
      if (!newTableId) {
        throw new Error('创建作品详情表失败，未返回 table_id');
      }
      logger.info('Empty detail table created', { tableName, tableId: newTableId });

      const detailFields = [
        { field_name: 'ID', type: 1005 },
        { field_name: '总表记录ID', type: 1 },
        { field_name: '作品ID', type: 1 },
        { field_name: '作品标题', type: 1 },
        { field_name: '作品链接', type: 1 },
        { field_name: '发布时间', type: 1 },
        { field_name: '播放量', type: 2, property: { formatter: '0' } },
        { field_name: '点赞数', type: 2, property: { formatter: '0' } },
        { field_name: '评论数', type: 2, property: { formatter: '0' } },
        { field_name: '分享数', type: 2, property: { formatter: '0' } },
        { field_name: '收藏数', type: 2, property: { formatter: '0' } },
        { field_name: '数据状态', type: 1 },
        { field_name: '同步时间', type: 5, property: { date_formatter: 'yyyy/MM/dd HH:mm' } },
      ];
      for (const f of detailFields) {
        await feishuBitable.createField(this.projectMgmtAppToken, newTableId, f);
        await this._sleep(300);
      }

      logger.info('Detail table fields populated', { tableName, tableId: newTableId, fieldCount: detailFields.length });
      return newTableId;
    } catch (error) {
      logger.error('Failed to create detail table', { tableName, error: error.message });
      throw error;
    }
  }

  async createProjectDetailTables(tableId, options = {}) {
    const traceId = options.traceId || `tr_${Date.now()}`;
    logger.info('createProjectDetailTables start', { tableId, traceId });

    const tablesResult = await feishuBitable.getAppTables(this.projectMgmtAppToken);
    const allTables = tablesResult?.items || [];
    const masterTable = allTables.find(t => t.table_id === tableId);
    if (!masterTable) {
      throw new Error(`未找到总表: ${tableId}`);
    }

    const masterName = masterTable.name || '';
    const match = masterName.match(/^(.+)-项目规划$/);
    if (!match) {
      throw new Error(`表名不符合总表命名规则: ${masterName}`);
    }
    const projectName = match[1];
    const detailPrefix = `${projectName.split('-')[0]}-`;
    const existingDetailNames = new Set(
      allTables
        .filter(t => (t.name || '').startsWith(detailPrefix) && (t.name || '').endsWith('-作品详情'))
        .map(t => t.name)
    );

    const records = await feishuBitable.searchRecords(this.projectMgmtAppToken, tableId);
    logger.info('Loaded account records', { tableId, count: records.length, traceId });

    const result = {
      projectName,
      tableId,
      totalAccounts: records.length,
      created: 0,
      skipped: 0,
      errors: 0,
      details: [],
    };

    for (const record of records) {
      const fields = record.fields || {};
      const accountName = this._extractFieldText(fields['账号名称']);
      const homeLink = this._extractFieldText(fields['主页链接']);
      if (!accountName) {
        result.skipped++;
        result.details.push({ recordId: record.record_id, status: 'skipped', reason: 'no account name' });
        continue;
      }

      const platform = (homeLink && platformResolver.detectPlatform(homeLink))
        || platformResolver.detectPlatformFromName(accountName);
      if (!platform) {
        result.errors++;
        result.details.push({ recordId: record.record_id, accountName, status: 'error', reason: 'platform unresolved' });
        logger.warn('Platform unresolved for account', { accountName, homeLink, traceId });
        continue;
      }

      const expectedName = `${detailPrefix}${accountName.replace(/\s+/g, '')}${platform.code}-作品详情`;
      if (existingDetailNames.has(expectedName)) {
        result.skipped++;
        result.details.push({ recordId: record.record_id, accountName, status: 'skipped', reason: 'table exists', tableName: expectedName });
        continue;
      }

      try {
        const newTableId = await this.createDetailTable(projectName, accountName, platform.code);
        existingDetailNames.add(expectedName);
        result.created++;
        result.details.push({ recordId: record.record_id, accountName, platform: platform.code, status: 'created', tableId: newTableId, tableName: expectedName });
        await this._sleep(300);
      } catch (err) {
        result.errors++;
        result.details.push({ recordId: record.record_id, accountName, platform: platform.code, status: 'error', reason: err.message });
        logger.error('Failed to create detail table for account', { accountName, error: err.message, traceId });
      }
    }

    logger.info('createProjectDetailTables completed', { tableId, ...result, traceId });
    return result;
  }

  _extractFieldText(value) {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) {
      return value.map(v => (typeof v === 'string' ? v : (v?.text || v?.name || ''))).join('').trim();
    }
    if (typeof value === 'object') {
      return (value.text || value.name || '').toString().trim();
    }
    return String(value).trim();
  }

  async createProjectTable(recordId, options = {}) {
    const managementTableId = 'tblxbkkh03Kw10lI';
    const traceId = options.traceId || `tr_${Date.now()}`;
    logger.info('createProjectTable start', { recordId, traceId });
    let projectName = '';

    try {
      const record = await this._readManagementRecord(managementTableId, recordId);
      projectName = record.projectName;
      const { startDate, endDate } = record;
      const missing = [];
      if (!projectName) missing.push('项目名称');
      if (!startDate) missing.push('开始日期');
      if (!endDate) missing.push('结束日期');
      if (missing.length > 0) {
        throw new Error(`管理记录缺少必要字段: ${missing.join('、')}`);
      }

      const tableName = projectName.endsWith('-项目规划') ? projectName : `${projectName}-项目规划`;
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

      await logService.createLog({
        '项目名称': projectName,
        '操作类型': '创建总表',
        '状态': '成功',
        '结束时间': Math.floor(Date.now() / 1000),
        '总表ID': newTableId,
        'traceId': traceId,
        '触发来源': options.triggerSource || 'API',
      });

      return { success: true, tableId: newTableId, tableName, projectName, startDate, endDate };
    } catch (error) {
      await logService.createLog({
        '项目名称': projectName || '',
        '操作类型': '创建总表',
        '状态': '失败',
        '结束时间': Math.floor(Date.now() / 1000),
        '错误信息': error.message,
        'traceId': traceId,
        '触发来源': options.triggerSource || 'API',
      });
      throw error;
    }
  }

  async _readManagementRecord(managementTableId, recordId) {
    const result = await feishuBitable.getRecord(this.projectMgmtAppToken, managementTableId, recordId);
    const fields = result?.record?.fields || {};
    return {
      projectName: fields['项目名称'],
      startDate: fields['版本开始日期'] || fields['开始日期'],
      endDate: fields['版本结束日期'] || fields['结束日期'],
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
      { field_name: '主页链接', type: 15 },
      { field_name: '粉丝总量', type: 2, property: { formatter: '0' } },
      { field_name: '目标播放量', type: 2, property: { formatter: '0' } },
      { field_name: '保底条数', type: 2, property: { formatter: '0' } },
      { field_name: '已发布', type: 2, property: { formatter: '0' } },
      { field_name: '待发布', type: 2, property: { formatter: '0' } },
      { field_name: '目前播放量', type: 2, property: { formatter: '0' } },
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
    const viewsFieldId = fieldIdMap['目前播放量'];
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
