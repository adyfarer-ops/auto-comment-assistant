const express = require('express');
const router = express.Router();
const statsService = require('../services/stats-service');
const projectService = require('../services/project-service');
const logger = require('../utils/logger');

router.get('/project/:recordId', async (req, res, next) => {
  try {
    const project = await projectService.getProjectByRecordId(req.params.recordId);
    if (!project) {
      return res.status(404).json({ code: 404, message: 'Project not found' });
    }

    const stats = await statsService.getProjectStats(project.fields['表格ID']);
    res.json({ code: 0, data: stats });
  } catch (error) {
    next(error);
  }
});

router.get('/account/:planTableId/:recordId', async (req, res, next) => {
  try {
    const stats = await statsService.getAccountStats(req.params.planTableId, req.params.recordId);
    res.json({ code: 0, data: stats });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
