const feishuBitable = require('./feishu-bitable');
const logger = require('../utils/logger');

class LogService {
  constructor() {
    this.logTableId = 'tbl7FbL99XJMpSEQ';
    this.projectMgmtAppToken = null;
  }

  setProjectMgmtAppToken(token) {
    this.projectMgmtAppToken = token;
  }

  _formatDateTime(date) {
    const d = date || new Date();
    return d.getTime();
  }

  _formatDate(date) {
    const d = date || new Date();
    return d.getTime();
  }

  async createLog(fields) {
    try {
      await feishuBitable.createRecord(this.projectMgmtAppToken, this.logTableId, fields);
    } catch (error) {
      logger.error('Failed to create log', { error: error.message, fields });
    }
  }

  async logSyncStart(projectName, options = {}) {
    const { accountName, masterTableId, detailTableId, accountRecordId, platformCode, traceId, triggerSource = 'API调用' } = options;
    return this.createLog({
      '项目名称': projectName,
      '账号名称': accountName || '',
      '总表ID': masterTableId || '',
      '详情表ID': detailTableId || '',
      '账号记录ID': accountRecordId || '',
      '操作类型': accountName ? '同步账号' : '同步项目',
      '状态': '进行中',
      '开始时间': this._formatDateTime(),
      '平台类型': platformCode || '',
      'traceId': traceId || '',
      '触发来源': triggerSource,
    });
  }

  async logSyncEnd(projectName, status, options = {}) {
    const { accountName, masterTableId, detailTableId, accountRecordId, platformCode, traceId, triggerSource = 'API调用', errorMessage = '', stats = {} } = options;
    const fields = {
      '项目名称': projectName,
      '账号名称': accountName || '',
      '总表ID': masterTableId || '',
      '详情表ID': detailTableId || '',
      '账号记录ID': accountRecordId || '',
      '操作类型': accountName ? '同步账号' : '同步项目',
      '状态': status,
      '结束时间': this._formatDateTime(),
      '平台类型': platformCode || '',
      '错误信息': errorMessage,
      'traceId': traceId || '',
      '触发来源': triggerSource,
    };

    if (stats.pages !== undefined) fields['分页数'] = stats.pages;
    if (stats.fetched !== undefined) fields['抓取作品数'] = stats.fetched;
    if (stats.original !== undefined) fields['原始作品数'] = stats.original;
    if (stats.filtered !== undefined) fields['日期过滤后作品数'] = stats.filtered;
    if (stats.created !== undefined) fields['新建数'] = stats.created;
    if (stats.updated !== undefined) fields['更新数'] = stats.updated;
    if (stats.skipped !== undefined) fields['跳过数'] = stats.skipped;

    return this.createLog(fields);
  }

  async logSyncSuccess(projectName, options = {}) {
    return this.logSyncEnd(projectName, '成功', options);
  }

  async logSyncError(projectName, error, options = {}) {
    return this.logSyncEnd(projectName, '失败', { ...options, errorMessage: error?.message || String(error) });
  }
}

module.exports = new LogService();
