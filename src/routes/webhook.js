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

// 飞书按钮触发统一入口
router.post('/button', verifyWebhookToken, async (req, res, next) => {
  try {
    const { recordId, action } = req.body;
    if (!recordId || !action) {
      return res.status(400).json({ code: 400, message: 'recordId and action are required' });
    }

    const project = await projectService.getProjectByRecordId(recordId);
    if (!project) {
      return res.status(404).json({ code: 404, message: 'Project not found' });
    }

    const projectName = project.fields['项目名称'];
    logger.info('Webhook button triggered', { recordId, action, projectName });

    switch (action) {
      case 'sync': {
        await projectService.updateProjectStatus(project.record_id, '执行中');

        syncService.syncProject(project, { triggerSource: 'Webhook按钮' })
          .then(async () => {
            await projectService.updateProjectStatus(project.record_id, '成功');
          })
          .catch(async (err) => {
            logger.error('Webhook sync failed', { error: err.message });
            await projectService.updateProjectStatus(project.record_id, '失败');
          });

        return res.json({ code: 0, message: 'Sync triggered via webhook' });
      }

      case 'weekly': {
        const report = await weeklyReportService.generateWeeklyReport(project);
        return res.json({ code: 0, data: report });
      }

      case 'review': {
        const result = await reportService.generateReviewReport(project);
        return res.json({ code: 0, data: result });
      }

      default:
        return res.status(400).json({ code: 400, message: `Unknown action: ${action}` });
    }
  } catch (error) {
    next(error);
  }
});

// 兼容旧版路由（保留一段时间）
router.post('/sync/:recordId', verifyWebhookToken, async (req, res, next) => {
  try {
    const project = await projectService.getProjectByRecordId(req.params.recordId);
    if (!project) {
      return res.status(404).json({ code: 404, message: 'Project not found' });
    }

    await projectService.updateProjectStatus(project.record_id, '执行中');

    syncService.syncProject(project, { triggerSource: 'Webhook按钮' })
      .then(async () => {
        await projectService.updateProjectStatus(project.record_id, '成功');
      })
      .catch(async (err) => {
        logger.error('Webhook sync failed', { error: err.message });
        await projectService.updateProjectStatus(project.record_id, '失败');
      });

    res.json({ code: 0, message: 'Sync triggered via webhook' });
  } catch (error) {
    next(error);
  }
});

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
