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
        const traceId = `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const weeklyStartTime = Date.now();
        const weeklyLogId = await logService.createLog({
          '项目名称': projectName,
          '操作类型': '生成周报',
          '状态': '进行中',
          '开始时间': weeklyStartTime,
          'traceId': traceId,
          '触发来源': 'Webhook按钮',
        });
        res.status(202).json({ code: 0, message: 'Weekly report generation started', traceId });

        (async () => {
          try {
            await weeklyReportService.generateWeeklyReport(project);
            await logService.updateLog(weeklyLogId, {
              '项目名称': projectName,
              '操作类型': '生成周报',
              '状态': '成功',
              '结束时间': Date.now(),
              '耗时': String(Date.now() - weeklyStartTime),
              'traceId': traceId,
              '触发来源': 'Webhook按钮',
            });
          } catch (err) {
            logger.error('Webhook weekly report failed', { error: err.message, traceId });
            await logService.updateLog(weeklyLogId, {
              '项目名称': projectName,
              '操作类型': '生成周报',
              '状态': '失败',
              '结束时间': Date.now(),
              '耗时': String(Date.now() - weeklyStartTime),
              '错误信息': err.message,
              'traceId': traceId,
              '触发来源': 'Webhook按钮',
            });
          }
        })();
        return;
      }

      case 'review': {
        const traceId = `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const reviewStartTime = Date.now();
        const reviewLogId = await logService.createLog({
          '项目名称': projectName,
          '操作类型': '生成复盘报告',
          '状态': '进行中',
          '开始时间': reviewStartTime,
          'traceId': traceId,
          '触发来源': 'Webhook按钮',
        });
        res.status(202).json({ code: 0, message: 'Review report generation started', traceId });

        (async () => {
          try {
            await reportService.generateReviewReport(project);
            await logService.updateLog(reviewLogId, {
              '项目名称': projectName,
              '操作类型': '生成复盘报告',
              '状态': '成功',
              '结束时间': Date.now(),
              '耗时': String(Date.now() - reviewStartTime),
              'traceId': traceId,
              '触发来源': 'Webhook按钮',
            });
          } catch (err) {
            logger.error('Webhook review report failed', { error: err.message, traceId });
            await logService.updateLog(reviewLogId, {
              '项目名称': projectName,
              '操作类型': '生成复盘报告',
              '状态': '失败',
              '结束时间': Date.now(),
              '耗时': String(Date.now() - reviewStartTime),
              '错误信息': err.message,
              'traceId': traceId,
              '触发来源': 'Webhook按钮',
            });
          }
        })();
        return;
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

    const projectName = project.fields['项目名称'];
    const traceId = `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const weeklyStartTime = Date.now();
    const weeklyLogId = await logService.createLog({
      '项目名称': projectName,
      '操作类型': '生成周报',
      '状态': '进行中',
      '开始时间': weeklyStartTime,
      'traceId': traceId,
      '触发来源': 'Webhook按钮',
    });
    res.status(202).json({ code: 0, message: 'Weekly report generation started', traceId });

    (async () => {
      try {
        await weeklyReportService.generateWeeklyReport(project);
        await logService.updateLog(weeklyLogId, {
          '项目名称': projectName,
          '操作类型': '生成周报',
          '状态': '成功',
          '结束时间': Date.now(),
          '耗时': String(Date.now() - weeklyStartTime),
          'traceId': traceId,
          '触发来源': 'Webhook按钮',
        });
      } catch (err) {
        logger.error('Webhook weekly report failed', { error: err.message, traceId });
        await logService.updateLog(weeklyLogId, {
          '项目名称': projectName,
          '操作类型': '生成周报',
          '状态': '失败',
          '结束时间': Date.now(),
          '耗时': String(Date.now() - weeklyStartTime),
          '错误信息': err.message,
          'traceId': traceId,
          '触发来源': 'Webhook按钮',
        });
      }
    })();
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

    const projectName = project.fields['项目名称'];
    const traceId = `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const reviewStartTime = Date.now();
    const reviewLogId = await logService.createLog({
      '项目名称': projectName,
      '操作类型': '生成复盘报告',
      '状态': '进行中',
      '开始时间': reviewStartTime,
      'traceId': traceId,
      '触发来源': 'Webhook按钮',
    });
    res.status(202).json({ code: 0, message: 'Review report generation started', traceId });

    (async () => {
      try {
        await reportService.generateReviewReport(project);
        await logService.updateLog(reviewLogId, {
          '项目名称': projectName,
          '操作类型': '生成复盘报告',
          '状态': '成功',
          '结束时间': Date.now(),
          '耗时': String(Date.now() - reviewStartTime),
          'traceId': traceId,
          '触发来源': 'Webhook按钮',
        });
      } catch (err) {
        logger.error('Webhook review report failed', { error: err.message, traceId });
        await logService.updateLog(reviewLogId, {
          '项目名称': projectName,
          '操作类型': '生成复盘报告',
          '状态': '失败',
          '结束时间': Date.now(),
          '耗时': String(Date.now() - reviewStartTime),
          '错误信息': err.message,
          'traceId': traceId,
          '触发来源': 'Webhook按钮',
        });
      }
    })();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
