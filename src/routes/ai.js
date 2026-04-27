const express = require('express');
const router = express.Router();
const aiService = require('../services/ai-service');
const projectService = require('../services/project-service');

router.post('/suggestions/:recordId', async (req, res, next) => {
  try {
    const project = await projectService.getProject(req.params.recordId);
    if (!project) {
      return res.status(404).json({ code: 404, message: 'Project not found' });
    }

    const accounts = await projectService.getProjectAccounts(project.fields['表格ID']);
    const suggestions = await aiService.generateSuggestions(project.fields['项目名称'], accounts);

    res.json({ code: 0, data: { suggestions } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
