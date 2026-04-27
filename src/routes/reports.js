const express = require('express');
const router = express.Router();
const weeklyReportService = require('../services/weekly-report-service');
const reportService = require('../services/report-service');
const projectService = require('../services/project-service');
const logger = require('../utils/logger');

// 生成周报
router.post('/weekly/:recordId', async (req, res, next) => {
  try {
    const project = await projectService.getProject(req.params.recordId);
    if (!project) {
      return res.status(404).json({ code: 404, message: 'Project not found' });
    }

    const report = await weeklyReportService.generateWeeklyReport(project);
    res.json({ code: 0, data: report });
  } catch (error) {
    next(error);
  }
});

// 生成复盘报告
router.post('/review/:recordId', async (req, res, next) => {
  try {
    const project = await projectService.getProject(req.params.recordId);
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
