const express = require('express');
const router = express.Router();
const taskStatusService = require('../services/task-status-service');

router.get('/:traceId', (req, res) => {
  const task = taskStatusService.get(req.params.traceId);
  if (!task) {
    return res.status(404).json({ code: 404, message: 'Task not found' });
  }
  res.json({ code: 0, data: task });
});

router.get('/', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const tasks = taskStatusService.list(limit);
  res.json({ code: 0, data: tasks });
});

module.exports = router;
