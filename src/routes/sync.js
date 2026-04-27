const express = require('express');
const router = express.Router();
const syncService = require('../services/sync-service');
const projectService = require('../services/project-service');
const logger = require('../utils/logger');

router.post('/:recordId', async (req, res, next) => {
  try {
    const project = await projectService.getProjectByRecordId(req.params.recordId);
    if (!project) {
      return res.status(404).json({ code: 404, message: 'Project not found' });
    }

    // 更新状态为执行中
    await projectService.updateProjectStatus(project.record_id, '执行中');

    // 异步执行同步（避免请求超时）
    syncService.syncProject(project)
      .then(() => projectService.updateProjectStatus(project.record_id, '成功'))
      .catch((err) => {
        logger.error('Sync failed', { error: err.message });
        projectService.updateProjectStatus(project.record_id, '失败');
      });

    res.json({ code: 0, message: 'Sync started', projectName: project.fields['项目名称'] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
