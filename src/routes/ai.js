const express = require('express');
const router = express.Router();
const aiService = require('../services/ai-service');
const projectService = require('../services/project-service');

// AI 项目运营建议
router.post('/suggest/project', async (req, res, next) => {
  try {
    const { recordId } = req.body;
    if (!recordId) {
      return res.status(400).json({ code: 400, message: 'recordId is required' });
    }

    const project = await projectService.getProjectByRecordId(recordId);
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
