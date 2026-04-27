const express = require('express');
const router = express.Router();
const videoAnalysis = require('../services/video-analysis-service');
const logger = require('../utils/logger');

router.post('/analyze', async (req, res, next) => {
  try {
    const { videoUrl, prompt, maxFrames } = req.body;
    if (!videoUrl) {
      return res.status(400).json({ code: 400, message: 'videoUrl is required' });
    }

    logger.info('Video analysis requested', { videoUrl: videoUrl.slice(0, 80) });
    const result = await videoAnalysis.analyzeVideo(videoUrl, {
      prompt,
      maxFrames: maxFrames || 5,
    });

    res.json({
      code: 0,
      data: {
        analysis: result.analysis,
        keyframesCount: result.keyframes.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
