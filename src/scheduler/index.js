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
      try {
        await logService.logSyncStart(project.name);
        await syncService.syncProject({ fields: project, record_id: project.recordId });
        await logService.logSyncSuccess(project.name, `Synced ${project.name}`);
      } catch (error) {
        logger.error('Daily sync project failed', { project: project.name, error: error.message });
        await logService.logSyncError(project.name, error);
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

      try {
        const projectRecord = { fields: project, record_id: project.recordId };
        await weeklyReportService.generateWeeklyReport(projectRecord);
        await logService.createLog(project.name, '周报生成', '成功', '周报已生成');
      } catch (error) {
        logger.error('Weekly report generation failed', { project: project.name, error: error.message });
        await logService.createLog(project.name, '周报生成', '失败', error.message);
      }
    }

    logger.info('Weekly report generation completed');
  });

  logger.info('Schedulers initialized');
}

module.exports = { initSchedulers };
