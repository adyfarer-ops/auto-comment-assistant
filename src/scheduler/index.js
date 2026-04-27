const scheduler = require('../utils/scheduler');
const projectService = require('../services/project-service');
const syncService = require('../services/sync-service');
const weeklyReportService = require('../services/weekly-report-service');
const reportService = require('../services/report-service');
const logService = require('../services/log-service');
const notifyService = require('../services/notify-service');
const logger = require('../utils/logger');
const config = require('../../config');

function initSchedulers() {
  // 每日凌晨 2 点自动同步所有项目
  scheduler.start('daily-sync', '0 2 * * *', async () => {
    logger.info('Daily sync started');
    const projects = await projectService.listProjects();

    for (const project of projects) {
      const traceId = `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      try {
        await logService.logSyncStart(project.name, { traceId, triggerSource: '定时任务' });
        await syncService.syncProject({ fields: project, record_id: project.recordId }, { traceId, triggerSource: '定时任务' });
        await logService.logSyncSuccess(project.name, { traceId, triggerSource: '定时任务' });
      } catch (error) {
        logger.error('Daily sync project failed', { project: project.name, error: error.message });
        await logService.logSyncError(project.name, error, { traceId, triggerSource: '定时任务' });
      }
    }

    logger.info('Daily sync completed', { projectCount: projects.length });
  });

  // 每周一早上 9 点自动生成周报
  scheduler.start('weekly-report', '0 9 * * 1', async () => {
    logger.info('Weekly report generation started');
    const projects = await projectService.listProjects();

    for (const project of projects) {
      if (!project.weeklySheet) continue;

      const traceId = `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      try {
        const projectRecord = { fields: project, record_id: project.recordId };
        await weeklyReportService.generateWeeklyReport(projectRecord);
        await logService.createLog({
          '项目名称': project.name,
          '操作类型': '生成周报',
          '状态': '成功',
          '结束时间': Date.now(),
          'traceId': traceId,
          '触发来源': '定时任务',
        });
      } catch (error) {
        logger.error('Weekly report generation failed', { project: project.name, error: error.message });
        await logService.createLog({
          '项目名称': project.name,
          '操作类型': '生成周报',
          '状态': '失败',
          '结束时间': Date.now(),
          '错误信息': error.message,
          'traceId': traceId,
          '触发来源': '定时任务',
        });
      }
    }

    logger.info('Weekly report generation completed');
  });

  logger.info('Schedulers initialized');
}

module.exports = { initSchedulers };
