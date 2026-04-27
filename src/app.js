require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('../config');
const logger = require('./utils/logger');
const { errorHandler } = require('./middleware/error');
const healthRouter = require('./routes/health');
const projectsRouter = require('./routes/projects');
const syncRouter = require('./routes/sync');
const reportsRouter = require('./routes/reports');
const aiRouter = require('./routes/ai');
const webhookRouter = require('./routes/webhook');

const projectService = require('./services/project-service');
const syncService = require('./services/sync-service');
const weeklyReportService = require('./services/weekly-report-service');
const reportService = require('./services/report-service');

const app = express();

// 初始化飞书 app token
const projectMgmtAppToken = config.project.managementTableToken || 'GEZ9bWr5kaexSEssvUaczO0Knhh';
projectService.setProjectMgmtAppToken(projectMgmtAppToken);
syncService.setProjectMgmtAppToken(projectMgmtAppToken);
weeklyReportService.setProjectMgmtAppToken(projectMgmtAppToken);
reportService.setProjectMgmtAppToken(projectMgmtAppToken);

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/health', healthRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/sync', syncRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/ai', aiRouter);
app.use('/webhook', webhookRouter);

app.get('/', (req, res) => {
  res.json({ name: 'feishu-project-agent', version: '1.0.0', env: config.nodeEnv });
});

app.use(errorHandler);

const PORT = config.port;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

module.exports = app;
