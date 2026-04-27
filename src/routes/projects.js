const express = require('express');
const router = express.Router();
const projectService = require('../services/project-service');
const logService = require('../services/log-service');
const logger = require('../utils/logger');

router.get('/', async (req, res, next) => {
  try {
    const projects = await projectService.listProjects();
    res.json({ code: 0, data: projects });
  } catch (error) {
    next(error);
  }
});

router.post('/create-table', async (req, res, next) => {
  try {
    const { recordId } = req.body;
    if (!recordId) {
      return res.status(400).json({ code: 400, message: 'recordId is required' });
    }

    const project = await projectService.getProjectByRecordId(recordId);
    if (!project) {
      return res.status(404).json({ code: 404, message: 'Project not found' });
    }
    const projectName = project.fields['项目名称'];

    const traceId = `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const logStartTime = Date.now();
    const logRecordId = await logService.createLog({
      '项目名称': projectName,
      '操作类型': '创建总表',
      '状态': '进行中',
      '开始时间': logStartTime,
      'traceId': traceId,
      '触发来源': req.body.triggerSource || 'API',
    });
    res.status(202).json({ code: 0, message: 'Project table creation started', traceId });

    projectService.createProjectTable(recordId, { traceId, triggerSource: req.body.triggerSource || 'API', logRecordId, logStartTime })
      .then((result) => {
        logger.info('createProjectTable background completed', { recordId, tableId: result.tableId, traceId });
      })
      .catch((err) => {
        logger.error('createProjectTable background failed', { recordId, traceId, error: err.message });
      });
  } catch (error) {
    next(error);
  }
});

router.get('/:recordId', async (req, res, next) => {
  try {
    const project = await projectService.getProjectByRecordId(req.params.recordId);
    if (!project) {
      return res.status(404).json({ code: 404, message: 'Project not found' });
    }
    res.json({ code: 0, data: project });
  } catch (error) {
    next(error);
  }
});

router.get('/:recordId/accounts', async (req, res, next) => {
  try {
    const project = await projectService.getProjectByRecordId(req.params.recordId);
    if (!project) {
      return res.status(404).json({ code: 404, message: 'Project not found' });
    }
    const accounts = await projectService.getProjectAccounts(project.fields['表格ID']);
    res.json({ code: 0, data: accounts });
  } catch (error) {
    next(error);
  }
});

router.post('/:tableId/create-tables', async (req, res, next) => {
  try {
    const { tableId } = req.params;
    if (!tableId) {
      return res.status(400).json({ code: 400, message: 'tableId is required' });
    }

    const traceId = `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const logStartTime = Date.now();
    const logRecordId = await logService.createLog({
      '项目名称': tableId,
      '操作类型': '创建详情表',
      '状态': '进行中',
      '开始时间': logStartTime,
      'traceId': traceId,
      '触发来源': req.body?.triggerSource || 'API',
    });
    res.status(202).json({ code: 0, message: 'Detail tables creation started', traceId });

    projectService.createProjectDetailTables(tableId, { traceId, triggerSource: req.body?.triggerSource || 'API', logRecordId, logStartTime })
      .then((result) => {
        logger.info('createProjectDetailTables background completed', { tableId, traceId, summary: { created: result.created, skipped: result.skipped, errors: result.errors } });
      })
      .catch((err) => {
        logger.error('createProjectDetailTables background failed', { tableId, traceId, error: err.message });
      });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
