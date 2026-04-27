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

  formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  async createLog(fields) {
    try {
      const result = await feishuBitable.createRecord(this.projectMgmtAppToken, this.logTableId, fields);
      return result?.record?.record_id || null;
    } catch (error) {
      logger.error('Failed to create log', { error: error.message, fields });
      return null;
    }
  }

  async updateLog(recordId, fields) {
    if (!recordId) return;
    try {
      await feishuBitable.updateRecord(this.projectMgmtAppToken, this.logTableId, recordId, fields);
    } catch (error) {
      logger.error('Failed to update log', { error: error.message, recordId, fields });
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
    const { logRecordId, accountName, masterTableId, detailTableId, accountRecordId, platformCode, traceId, triggerSource = 'API调用', errorMessage = '', stats = {} } = options;
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

    const { startTime } = options;
    if (startTime) {
      fields['耗时'] = this.formatDuration(Date.now() - startTime);
    }

    if (logRecordId) {
      return this.updateLog(logRecordId, fields);
    }
    return this.createLog(fields);
  }

  async logSyncSuccess(projectName, options = {}) {
    return this.logSyncEnd(projectName, '成功', options);
  }

  async logSyncError(projectName, error, options = {}) {
    return this.logSyncEnd(projectName, '失败', { ...options, errorMessage: error?.message || String(error) });
  }

  async fixStaleLogs(timeoutMs = 30 * 60 * 1000) {
    try {
      const records = await feishuBitable.searchRecords(this.projectMgmtAppToken, this.logTableId, 'CurrentValue.[状态] = "进行中"');
      const now = Date.now();
      let fixed = 0;
      for (const record of records) {
        const fields = record.fields || {};
        const startTime = fields['开始时间'];
        if (startTime && (now - startTime) > timeoutMs) {
          await this.updateLog(record.record_id, {
            '状态': '异常终止',
            '结束时间': now,
            '耗时': this.formatDuration(now - startTime),
            '错误信息': '任务超时或系统中断',
          });
          fixed++;
        }
      }
      if (fixed > 0) {
        logger.info('Fixed stale logs', { fixed, totalChecked: records.length });
      }
    } catch (error) {
      logger.error('Failed to fix stale logs', { error: error.message });
    }
  }
}

module.exports = new LogService();
