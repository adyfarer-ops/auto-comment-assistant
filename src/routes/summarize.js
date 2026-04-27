const express = require('express');
const router = express.Router();
const projectService = require('../services/project-service');
const statsService = require('../services/stats-service');
const aiService = require('../services/ai-service');
const feishuBitable = require('../services/feishu-bitable');
const logger = require('../utils/logger');

// 单账号汇总
router.post('/account', async (req, res, next) => {
  try {
    const { planTableId, recordId } = req.body;
    if (!planTableId || !recordId) {
      return res.status(400).json({ code: 400, message: 'planTableId and recordId are required' });
    }

    const stats = await statsService.getAccountStats(planTableId, recordId);
    res.json({ code: 0, data: stats });
  } catch (error) {
    next(error);
  }
});

// 项目汇总
router.post('/project', async (req, res, next) => {
  try {
    const { recordId } = req.body;
    if (!recordId) {
      return res.status(400).json({ code: 400, message: 'recordId is required' });
    }

    const project = await projectService.getProjectByRecordId(recordId);
    if (!project) {
      return res.status(404).json({ code: 404, message: 'Project not found' });
    }

    const stats = await statsService.getProjectStats(project.fields['表格ID']);
    res.json({ code: 0, data: stats });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
