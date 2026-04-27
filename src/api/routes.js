const express = require('express');
const router = express.Router();

const healthRouter = require('../routes/health');
const projectsRouter = require('../routes/projects');
const syncRouter = require('../routes/sync');
const statsRouter = require('../routes/stats');
const reportsRouter = require('../routes/reports');
const aiRouter = require('../routes/ai');
const webhookRouter = require('../routes/webhook');
const debugRouter = require('../routes/debug');
const videoRouter = require('../routes/video');

// 健康检查
router.use('/health', healthRouter);

// 项目 API
router.use('/projects', projectsRouter);

// 同步 API
router.use('/sync', syncRouter);

// 统计 API
router.use('/stats', statsRouter);

// 周报 / 复盘报告 API
router.use('/reports', reportsRouter);

// AI 建议 API
router.use('/ai', aiRouter);

// Webhook 接口
router.use('/webhook', webhookRouter);

// 视频分析 API
router.use('/video', videoRouter);

// 调试 API
router.use('/debug', debugRouter);

module.exports = router;
