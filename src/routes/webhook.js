const express = require('express');
const router = express.Router();
const { verifyWebhookToken } = require('../middleware/auth');
const syncService = require('../services/sync-service');
const weeklyReportService = require('../services/weekly-report-service');
const reportService = require('../services/report-service');
const projectService = require('../services/project-service');
const logService = require('../services/log-service');
const notifyService = require('../services/notify-service');
const logger = require('../utils/logger');

// 飞书按钮触发同步
router.post('/sync/:recordId', verifyWebhookToken, async (req, res, next) => {
  try {
    const project = await projectService.getProjectByRecordId(req.params.recordId);
    if (!project) {
      return res.status(404).json({ code: 404, message: 'Project not found' });
    }

    await projectService.updateProjectStatus(project.record_id, '执行中');
    await logService.logSyncStart(project.fields['项目名称']);

    syncService.syncProject(project)
      .then(async (result) => {
        await projectService.updateProjectStatus(project.record_id, '成功');
        await logService.logSyncSuccess(project.fields['项目名称'], `Synced ${result.accountsCount} accounts`);
      })
      .catch(async (err) => {
        logger.error('Webhook sync failed', { error: err.message });
        await projectService.updateProjectStatus(project.record_id, '失败');
        await logService.logSyncError(project.fields['项目名称'], err);
      });

    res.json({ code: 0, message: 'Sync triggered via webhook' });
  } catch (error) {
    next(error);
  }
});

// 飞书按钮触发周报
router.post('/weekly/:recordId', verifyWebhookToken, async (req, res, next) => {
  try {
    const project = await projectService.getProjectByRecordId(req.params.recordId);
    if (!project) {
      return res.status(404).json({ code: 404, message: 'Project not found' });
    }

    const report = await weeklyReportService.generateWeeklyReport(project);
    res.json({ code: 0, data: report });
  } catch (error) {
    next(error);
  }
});

// 飞书按钮触发复盘报告
router.post('/review/:recordId', verifyWebhookToken, async (req, res, next) => {
  try {
    const project = await projectService.getProjectByRecordId(req.params.recordId);
    if (!project) {
      return res.status(404).json({ code: 404, message: 'Project not found' });
    }

    const result = await reportService.generateReviewReport(project);
    res.json({ code: 0, data: result });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
