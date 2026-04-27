const feishuBitable = require('./feishu-bitable');
const logger = require('../utils/logger');

class LogService {
  constructor() {
    this.logTableId = 'tbl7FbL99XJMpSEQ'; // 项目管理日志表
    this.projectMgmtAppToken = null;
  }

  setProjectMgmtAppToken(token) {
    this.projectMgmtAppToken = token;
  }

  async createLog(projectName, taskType, status, message = '') {
    try {
      await feishuBitable.createRecord(this.projectMgmtAppToken, this.logTableId, {
        '项目名称': projectName,
        '任务类型': taskType,
        '执行状态': status,
        '日志内容': message,
        '执行时间': Date.now(),
      });
    } catch (error) {
      logger.error('Failed to create log', { error: error.message });
    }
  }

  async logSyncStart(projectName) {
    return this.createLog(projectName, '数据同步', '执行中', '开始同步数据');
  }

  async logSyncSuccess(projectName, details) {
    return this.createLog(projectName, '数据同步', '成功', details);
  }

  async logSyncError(projectName, error) {
    return this.createLog(projectName, '数据同步', '失败', error.message);
  }

  async logReportGenerated(projectName, reportType, docUrl) {
    return this.createLog(projectName, reportType, '成功', `报告链接: ${docUrl}`);
  }
}

module.exports = new LogService();
