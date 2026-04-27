const express = require('express');
const router = express.Router();
const projectService = require('../services/project-service');
const logger = require('../utils/logger');

router.get('/', async (req, res, next) => {
  try {
    const projects = await projectService.listProjects();
    res.json({ code: 0, data: projects });
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

module.exports = router;
