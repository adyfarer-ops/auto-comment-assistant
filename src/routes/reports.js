const express = require('express');
const router = express.Router();
const weeklyReportService = require('../services/weekly-report-service');
const reportService = require('../services/report-service');
const projectService = require('../services/project-service');
const logger = require('../utils/logger');

// 生成周报
router.post('/weekly-report/generate', async (req, res, next) => {
  try {
    const { recordId } = req.body;
    if (!recordId) {
      return res.status(400).json({ code: 400, message: 'recordId is required' });
    }

    const project = await projectService.getProjectByRecordId(recordId);
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
router.post('/review-report/generate', async (req, res, next) => {
  try {
    const { recordId, templateType } = req.body;
    if (!recordId) {
      return res.status(400).json({ code: 400, message: 'recordId is required' });
    }

    const project = await projectService.getProjectByRecordId(recordId);
    if (!project) {
      return res.status(404).json({ code: 404, message: 'Project not found' });
    }

    // 如果指定了模板类型，临时覆盖项目模板
    if (templateType) {
      project.fields['复盘报告模板'] = templateType;
    }

    const result = await reportService.generateReviewReport(project);
    res.json({ code: 0, data: result });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
