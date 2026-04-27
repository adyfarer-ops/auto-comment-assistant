const express = require('express');
const router = express.Router();
const weeklyReportService = require('../services/weekly-report-service');
const reportService = require('../services/report-service');
const projectService = require('../services/project-service');
const notifyService = require('../services/notify-service');
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

    const traceId = `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    res.status(202).json({ code: 0, message: 'Weekly report generation started', traceId });

    // 后台执行
    (async () => {
      try {
        const report = await weeklyReportService.generateWeeklyReport(project);
        await notifyService.sendWeeklyReportResult(project.fields['项目名称'], report);
      } catch (error) {
        logger.error('Weekly report generation failed', { traceId, error: error.message });
        await notifyService.sendError(process.env.NOTIFY_CHAT_ID, project.fields['项目名称'], error);
      }
    })();
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

    const traceId = `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    res.status(202).json({ code: 0, message: 'Review report generation started', traceId });

    // 后台执行
    (async () => {
      try {
        const result = await reportService.generateReviewReport(project);
        const chatId = process.env.NOTIFY_CHAT_ID;
        if (chatId) {
          const text = `📊 **${project.fields['项目名称']}** 复盘报告已生成\n\n` +
            `模板类型: ${project.fields['复盘报告模板'] || '默认'}\n` +
            `traceId: ${traceId}\n` +
            `时间: ${new Date().toLocaleString('zh-CN')}` +
            (result.docUrl ? `\n\n📄 文档链接: ${result.docUrl}` : '');
          await notifyService.sendMessage(chatId, text);
        } else {
          logger.warn('NOTIFY_CHAT_ID not set, skipping review report notification');
        }
      } catch (error) {
        logger.error('Review report generation failed', { traceId, error: error.message });
        const chatId = process.env.NOTIFY_CHAT_ID;
        if (chatId) {
          await notifyService.sendError(chatId, project.fields['项目名称'], error);
        }
      }
    })();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
