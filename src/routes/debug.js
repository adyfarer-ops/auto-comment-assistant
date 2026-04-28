const express = require('express');
const router = express.Router();
const feishuAuth = require('../services/feishu-auth');
const feishuBitable = require('../services/feishu-bitable');
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
    await tikhubApi.request('GET', '/api/v1/tiktok/web/fetch_user_profile', { uniqueId: 'tiktok' });
    checks.tikhub = true;
  } catch (error) {
    checks.tikhub = error.response?.status === 404 || error.response?.status === 429;
    if (!checks.tikhub) {
      logger.warn('TikHub health check failed', { error: error.message });
    }
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

// 列出 Base 下所有表格
router.get('/tables', async (req, res, next) => {
  try {
    const appToken = req.query.appToken || req.app.locals.projectMgmtAppToken;
    const tables = await feishuBitable.getAppTables(appToken);
    res.json({ code: 0, data: tables.items || tables });
  } catch (error) {
    next(error);
  }
});

// 查询指定表格的所有记录
router.get('/records/:tableId', async (req, res, next) => {
  try {
    const { tableId } = req.params;
    const appToken = req.query.appToken || req.app.locals.projectMgmtAppToken;
    const records = await feishuBitable.searchRecords(appToken, tableId);
    res.json({ code: 0, data: records });
  } catch (error) {
    next(error);
  }
});

// 批量迁移同步时间格式
router.post('/migrate-sync-time', async (req, res, next) => {
  try {
    const { tableId, fieldName } = req.body;
    if (!tableId || !fieldName) {
      return res.status(400).json({ code: 400, message: 'tableId and fieldName are required' });
    }

    const appToken = req.app.locals.projectMgmtAppToken;
    const records = await feishuBitable.searchRecords(appToken, tableId);
    let migrated = 0;

    for (const record of records) {
      const value = record.fields[fieldName];
      if (value && typeof value === 'number') {
        const dateStr = new Date(value).toISOString();
        await feishuBitable.updateRecord(appToken, tableId, record.record_id, {
          [fieldName]: dateStr,
        });
        migrated++;
      }
    }

    res.json({ code: 0, data: { migrated, total: records.length } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
