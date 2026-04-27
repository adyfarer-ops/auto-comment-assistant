const express = require('express');
const router = express.Router();
const feishuAuth = require('../services/feishu-auth');
const tikhubApi = require('../services/tikhub-api');
const youtubeApi = require('../services/youtube-api');
const platformResolver = require('../services/platform-resolver');
const videoAnalysis = require('../services/video-analysis-service');
const logger = require('../utils/logger');

router.get('/health/detailed', async (req, res) => {
  const checks = {
    feishu: false,
    tikhub: false,
    youtube: false,
    timestamp: new Date().toISOString(),
  };

  try {
    await feishuAuth.getAppToken();
    checks.feishu = true;
  } catch (error) {
    logger.warn('Feishu health check failed', { error: error.message });
  }

  try {
    const result = await tikhubApi.request('GET', '/api/v1/health');
    checks.tikhub = result.status === 'ok' || result.code === 0;
  } catch (error) {
    logger.warn('TikHub health check failed', { error: error.message });
  }

  try {
    if (process.env.YOUTUBE_API_KEY) {
      await youtubeApi.getChannelByHandle('@YouTube');
      checks.youtube = true;
    } else {
      checks.youtube = 'no_api_key';
    }
  } catch (error) {
    checks.youtube = error.response?.status === 404 || error.response?.status === 403;
  }

  const allHealthy = checks.feishu && checks.tikhub;
  res.status(allHealthy ? 200 : 503).json({ code: allHealthy ? 0 : 503, data: checks });
});

router.post('/refresh-token', async (req, res, next) => {
  try {
    feishuAuth.tokens.clear();
    const token = await feishuAuth.getAppToken();
    res.json({ code: 0, data: { token: token.slice(0, 10) + '...', refreshed: true } });
  } catch (error) {
    next(error);
  }
});

router.post('/test-platform', async (req, res, next) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ code: 400, message: 'url is required' });
    }

    const platform = platformResolver.detectPlatform(url);
    if (!platform) {
      return res.json({ code: 0, data: { platform: null, message: 'Unknown platform' } });
    }

    const username = platformResolver.extractUsername(url, platform.code);
    res.json({ code: 0, data: { platform, username, url } });
  } catch (error) {
    next(error);
  }
});

router.post('/test-video-analysis', async (req, res, next) => {
  try {
    const { videoUrl, prompt } = req.body;
    if (!videoUrl) {
      return res.status(400).json({ code: 400, message: 'videoUrl is required' });
    }

    logger.info('Test video analysis', { videoUrl: videoUrl.slice(0, 80) });
    const result = await videoAnalysis.analyzeVideo(videoUrl, { prompt, keepVideo: true });

    res.json({
      code: 0,
      data: {
        videoPath: result.videoPath,
        keyframes: result.keyframes,
        analysis: result.analysis,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
