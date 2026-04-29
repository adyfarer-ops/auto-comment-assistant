const express = require('express');
const router = express.Router();
const syncService = require('../services/sync-service');
const projectService = require('../services/project-service');
const logger = require('../utils/logger');

// 同步单个账号
router.post('/account', async (req, res, next) => {
  try {
    const { tableId, recordId, limit } = req.body;
    if (!tableId || !recordId) {
      return res.status(400).json({ code: 400, message: 'tableId and recordId are required' });
    }

    const project = await projectService.getProjectByTableId(tableId);
    const projectName = project ? project.fields['项目名称'] : 'Unknown';

    logger.info('Sync account', { tableId, recordId, projectName });
    const result = await syncService.syncAccountByRecordId(tableId, recordId, projectName, {
      triggerSource: 'API调用',
    });
    res.json({ code: 0, message: 'Account sync completed', data: result });
  } catch (error) {
    next(error);
  }
});

// 批量同步整个项目
router.post('/project', async (req, res, next) => {
  try {
    const { tableId, startDate, endDate } = req.body;
    if (!tableId) {
      return res.status(400).json({ code: 400, message: 'tableId is required' });
    }

    const project = await projectService.getProjectByTableId(tableId);
    if (!project) {
      return res.status(404).json({ code: 404, message: 'Project not found' });
    }

    await projectService.updateProjectStatus(project.record_id, '执行中');

    syncService.syncProject(project, { triggerSource: 'API调用' })
      .then(async () => {
        try {
          await projectService.updateProjectStatus(project.record_id, '成功');
        } catch (statusErr) {
          logger.error('Failed to update project status to success', { error: statusErr.message });
        }
      })
      .catch(async (err) => {
        logger.error('Sync project failed', { error: err.message });
        try {
          await projectService.updateProjectStatus(project.record_id, '失败');
        } catch (statusErr) {
          logger.error('Failed to update project status to failure', { error: statusErr.message });
        }
      });

    res.json({ code: 0, message: 'Project sync started', tableId });
  } catch (error) {
    next(error);
  }
});

// 增量同步
router.post('/project-incremental', async (req, res, next) => {
  try {
    const { tableId, startDate, endDate } = req.body;
    if (!tableId) {
      return res.status(400).json({ code: 400, message: 'tableId is required' });
    }

    const project = await projectService.getProjectByTableId(tableId);
    if (!project) {
      return res.status(404).json({ code: 404, message: 'Project not found' });
    }

    await projectService.updateProjectStatus(project.record_id, '执行中');

    syncService.syncProjectIncremental(project, startDate, endDate, { triggerSource: 'API调用' })
      .then(async () => {
        try {
          await projectService.updateProjectStatus(project.record_id, '成功');
        } catch (statusErr) {
          logger.error('Failed to update project status to success after incremental sync', { error: statusErr.message });
        }
      })
      .catch(async (err) => {
        logger.error('Incremental sync failed', { error: err.message });
        try {
          await projectService.updateProjectStatus(project.record_id, '失败');
        } catch (statusErr) {
          logger.error('Failed to update project status to failure after incremental sync', { error: statusErr.message });
        }
      });

    res.json({ code: 0, message: 'Incremental sync started', tableId, startDate, endDate });
  } catch (error) {
    next(error);
  }
});

// 清除同步进度
router.post('/clear-progress', async (req, res, next) => {
  try {
    const { projectName } = req.body;
    logger.info('Clear sync progress', { projectName });
    const result = await syncService.clearSyncProgress(projectName);
    res.json({ code: 0, message: 'Sync progress cleared', data: result });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
