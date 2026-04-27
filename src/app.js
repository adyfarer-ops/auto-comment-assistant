require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('../config');
const logger = require('./utils/logger');
const { errorHandler } = require('./middleware/error');
const apiRoutes = require('./api/routes');

const projectService = require('./services/project-service');
const syncService = require('./services/sync-service');
const weeklyReportService = require('./services/weekly-report-service');
const reportService = require('./services/report-service');
const logService = require('./services/log-service');
const statsService = require('./services/stats-service');
const suggestionService = require('./services/suggestion-service');
const tableResolver = require('./services/table-resolver');
const videoExtractionService = require('./services/video-extraction-service');

const app = express();

// 初始化飞书 app token
const projectMgmtAppToken = config.project.managementTableToken || 'GEZ9bWr5kaexSEssvUaczO0Knhh';
projectService.setProjectMgmtAppToken(projectMgmtAppToken);
syncService.setProjectMgmtAppToken(projectMgmtAppToken);
weeklyReportService.setProjectMgmtAppToken(projectMgmtAppToken);
reportService.setProjectMgmtAppToken(projectMgmtAppToken);
logService.setProjectMgmtAppToken(projectMgmtAppToken);
statsService.setProjectMgmtAppToken(projectMgmtAppToken);
suggestionService.setProjectMgmtAppToken(projectMgmtAppToken);
tableResolver.setProjectMgmtAppToken(projectMgmtAppToken);

app.locals.projectMgmtAppToken = projectMgmtAppToken;

// 启动时修复残留的旧“进行中”日志
logService.fixStaleLogs().catch((err) => logger.warn('Fix stale logs on startup failed', { error: err.message }));

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// API 路由总入口
app.use('/api', apiRoutes);

app.get('/', (req, res) => {
  res.json({ name: 'feishu-project-agent', version: '1.0.0', env: config.nodeEnv });
});

app.use(errorHandler);

module.exports = app;
