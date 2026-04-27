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

    logger.info('Sync account', { tableId, recordId });
    // TODO: implement single account sync
    res.json({ code: 0, message: 'Account sync triggered', tableId, recordId });
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

    syncService.syncProject(project)
      .then(async () => {
        await projectService.updateProjectStatus(project.record_id, '成功');
      })
      .catch(async (err) => {
        logger.error('Sync project failed', { error: err.message });
        await projectService.updateProjectStatus(project.record_id, '失败');
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

    logger.info('Incremental sync', { tableId, startDate, endDate });
    res.json({ code: 0, message: 'Incremental sync triggered', tableId, startDate, endDate });
  } catch (error) {
    next(error);
  }
});

// 清除同步进度
router.post('/clear-progress', async (req, res, next) => {
  try {
    const { projectName } = req.body;
    logger.info('Clear sync progress', { projectName });
    res.json({ code: 0, message: 'Sync progress cleared', projectName });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
