const config = require('../../config');
const feishuBitable = require('./feishu-bitable');
const tikhubApi = require('./tikhub-api');
const youtubeApi = require('./youtube-api');
const platformResolver = require('./platform-resolver');
const logService = require('./log-service');
const logger = require('../utils/logger');
const projectService = require('./project-service');
const syncQueue = require('../utils/sync-queue');
const notifyService = require('./notify-service');

class SyncService {
  constructor() {
    this.projectMgmtAppToken = null;
  }

  setProjectMgmtAppToken(token) {
    this.projectMgmtAppToken = token;
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _normalizeNumber(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return value;
    const cleaned = String(value).replace(/[,\s]/g, '');
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : 0;
  }

  _formatDateTime(date) {
    const d = date || new Date();
    // 飞书旧表日期字段只接受毫秒时间戳数字
    return d.getTime();
  }

  async syncProject(projectRecord, options = {}) {
    const fields = projectRecord.fields;
    const planTableId = fields['表格ID'];
    const projectName = fields['项目名称'];
    const traceId = options.traceId || `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const triggerSource = options.triggerSource || 'API调用';

    logger.info('Starting project sync', { projectName, planTableId, traceId });
    const startTime = Date.now();
    let projectLogId = options.logRecordId;
    if (!projectLogId) {
      projectLogId = await logService.logSyncStart(projectName, { masterTableId: planTableId, traceId, triggerSource });
    }

    return syncQueue.enqueue(`project:${projectName}`, async () => {
      try {
        const accounts = await feishuBitable.searchRecords(this.projectMgmtAppToken, planTableId);
        let totalWorks = 0;
        let totalErrors = 0;

        for (const account of accounts) {
          try {
            const result = await this.syncAccount(account, planTableId, projectName, { traceId, triggerSource });
            if (result && result.worksCount) totalWorks += result.worksCount;
          } catch (error) {
            totalErrors++;
            logger.error('Account sync failed in project sync', { accountName: account.fields?.['账号名称'], error: error.message });
          }
        }

        await this.updateProjectStats(planTableId, projectRecord);

        if (totalErrors > 0 && totalWorks === 0) {
          throw new Error(`${totalErrors} 个账号同步全部失败，最近错误：API 余额不足或授权失效，请检查配置后重试`);
        }

        logger.info('Project sync completed', { projectName, accountsCount: accounts.length, totalWorks, totalErrors, traceId });
        await logService.logSyncSuccess(projectName, {
          masterTableId: planTableId,
          traceId,
          triggerSource,
          logRecordId: projectLogId,
          startTime,
          stats: { fetched: totalWorks },
        });

        try {
          await notifyService.sendSyncResult(projectName, totalErrors > 0 ? '部分失败' : '成功', { traceId, accountsCount: accounts.length, totalWorks, totalErrors, triggerSource });
        } catch (notifyError) {
          logger.warn('sendSyncResult success notification failed', { projectName, error: notifyError.message, traceId });
        }
        return { accountsCount: accounts.length, totalWorks, totalErrors };
      } catch (error) {
        logger.error('Project sync failed', { projectName, error: error.message, traceId });
        await logService.logSyncError(projectName, error, { masterTableId: planTableId, traceId, triggerSource, logRecordId: projectLogId, startTime });
        try {
          await notifyService.sendSyncResult(projectName, '失败', { traceId, errorMessage: error.message, triggerSource });
        } catch (notifyError) {
          logger.warn('sendSyncResult failure notification failed', { projectName, error: notifyError.message, traceId });
        }
        throw error;
      }
    });
  }

  async syncAccountByRecordId(planTableId, recordId, projectName, options = {}) {
    const traceId = options.traceId || `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const triggerSource = options.triggerSource || 'API调用';

    return syncQueue.enqueue(`account:${projectName}:${recordId}`, async () => {
      try {
        const accounts = await feishuBitable.searchRecords(
          this.projectMgmtAppToken,
          planTableId,
          `CurrentValue.[记录ID] = "${recordId}"`
        );

        if (!accounts || accounts.length === 0) {
          throw new Error('Account not found');
        }

        const result = await this.syncAccount(accounts[0], planTableId, projectName, { traceId, triggerSource });
        try {
          await notifyService.sendSyncResult(projectName, '成功', { traceId, recordId, totalWorks: result?.worksCount || 0, accountsCount: 1, triggerSource });
        } catch (notifyError) {
          logger.warn('sendSyncResult success notification failed', { projectName, error: notifyError.message, traceId });
        }
        return { success: true, worksCount: result?.worksCount || 0 };
      } catch (error) {
        try {
          await notifyService.sendSyncResult(projectName, '失败', { traceId, recordId, errorMessage: error.message, triggerSource });
        } catch (notifyError) {
          logger.warn('sendSyncResult failure notification failed', { projectName, error: notifyError.message, traceId });
        }
        throw error;
      }
    });
  }

  _parseDate(input) {
    if (!input) return null;
    if (input instanceof Date) return input;
    const str = String(input).replace(/-/g, '/');
    const d = new Date(str);
    if (isNaN(d.getTime())) return null;
    return d;
  }

  async syncProjectIncremental(projectRecord, startDate, endDate, options = {}) {
    const fields = projectRecord.fields;
    const planTableId = fields['表格ID'];
    const projectName = fields['项目名称'];
    const traceId = options.traceId || `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const triggerSource = options.triggerSource || 'API调用';

    logger.info('Starting incremental sync', { projectName, planTableId, startDate, endDate, traceId });
    const projectStartTime = Date.now();
    const projectLogId = await logService.logSyncStart(projectName, { masterTableId: planTableId, traceId, triggerSource, operationType: '周期增量同步项目' });

    return syncQueue.enqueue(`project:${projectName}:incremental`, async () => {
      const parsedStart = this._parseDate(startDate);
      const parsedEnd = this._parseDate(endDate);

      let totalWorks = 0;
      let totalErrors = 0;
      const accountStats = [];

      try {
        const accounts = await feishuBitable.searchRecords(this.projectMgmtAppToken, planTableId);

        for (const account of accounts) {
          const accountFields = account.fields;
          const accountName = accountFields['账号名称'];
          const homeLink = accountFields['主页链接']?.link || accountFields['主页链接'];
          const targetPublished = parseInt(accountFields['保底条数']) || 0;
          const targetPlayCount = parseInt(accountFields['目标播放量']) || 0;

          if (!homeLink) continue;

          const platform = platformResolver.detectPlatform(homeLink);
          if (!platform) continue;

          const username = platformResolver.extractUsername(homeLink, platform.code);
          if (!username) continue;

          const accountStartTime = Date.now();
          const accountLogId = await logService.logSyncStart(projectName, {
            accountName,
            masterTableId: planTableId,
            accountRecordId: account.record_id,
            platformCode: platform.code,
            traceId,
            triggerSource,
            operationType: '周期增量同步账号',
          });

          try {
            const works = await this.fetchPlatformWorks(platform.code, username, {
              startDate: options.startDate || startDate,
              endDate: options.endDate || endDate,
            });
            const filteredWorks = works.filter(work => {
              if (!work.publishTime) return false;
              const publishDate = new Date(work.publishTime);
              if (parsedStart && publishDate < parsedStart) return false;
              if (parsedEnd && publishDate > parsedEnd) return false;
              return true;
            });

            const detailTableId = await this.getOrCreateDetailTable(projectName, accountName, platform.code);

            let createdCount = 0;
            let updatedCount = 0;
            let skippedCount = 0;

            const followersCount = await this.fetchPlatformFollowers(platform.code, username);
            const totalPlayCount = filteredWorks.reduce((sum, w) => sum + (w.playCount || 0), 0);
            const publishedCount = filteredWorks.length;

            if (detailTableId) {
              if (filteredWorks.length > 0) {
                const syncResult = await this.syncWorksToDetailTable(detailTableId, filteredWorks, account.record_id, false);
                createdCount = syncResult.createdCount || 0;
                updatedCount = syncResult.updatedCount || 0;
                totalWorks += filteredWorks.length;
              }
              // 主表统计始终基于全量作品更新，避免周期过滤导致数据被"删除"
              await this.updateAccountStats(account, planTableId, works, followersCount, platform.code);
            } else {
              skippedCount = works.length - filteredWorks.length;
            }

            accountStats.push({
              accountName,
              platformCode: platform.code,
              publishedCount,
              targetPublished,
              totalPlayCount,
              targetPlayCount,
            });

            if (detailTableId) {
              await logService.logSyncSuccess(projectName, {
                accountName,
                masterTableId: planTableId,
                detailTableId,
                accountRecordId: account.record_id,
                platformCode: platform.code,
                traceId,
                triggerSource,
                logRecordId: accountLogId,
                startTime: accountStartTime,
                operationType: '周期增量同步账号',
                stats: {
                  original: works.length,
                  filtered: filteredWorks.length,
                  fetched: filteredWorks.length,
                  created: createdCount,
                  updated: updatedCount,
                  skipped: skippedCount,
                },
              });
            } else {
              await logService.logSyncEnd(projectName, '跳过', {
                accountName,
                masterTableId: planTableId,
                detailTableId,
                accountRecordId: account.record_id,
                platformCode: platform.code,
                traceId,
                triggerSource,
                logRecordId: accountLogId,
                startTime: accountStartTime,
                operationType: '周期增量同步账号',
              });
            }
          } catch (error) {
            totalErrors++;
            logger.error('Incremental sync account failed', { accountName, error: error.message, traceId });
            await logService.logSyncError(projectName, error, {
              accountName,
              masterTableId: planTableId,
              accountRecordId: account.record_id,
              platformCode: platform.code,
              traceId,
              triggerSource,
              logRecordId: accountLogId,
              startTime: accountStartTime,
              operationType: '周期增量同步账号',
            });
          }
        }

        await this.updateProjectStats(planTableId, projectRecord);

        const versionProgress = this.calculateVersionProgress(projectRecord.fields);

        if (totalErrors > 0 && totalWorks === 0) {
          throw new Error(`${totalErrors} 个账号同步全部失败，最近错误：TikHub API 余额不足(402)，请充值后重试`);
        }

        logger.info('Incremental sync completed', { projectName, totalWorks, totalErrors, traceId });
        await logService.logSyncSuccess(projectName, {
          masterTableId: planTableId,
          traceId,
          triggerSource,
          logRecordId: projectLogId,
          startTime: projectStartTime,
          operationType: '周期增量同步项目',
          stats: { fetched: totalWorks },
        });

        // 只有非周报触发的增量同步才发送通知
        if (triggerSource !== '周报生成') {
          try {
            const fmtDate = (d) => {
              if (!d) return '';
              const date = d instanceof Date ? d : new Date(String(d).replace(/-/g, '/'));
              if (isNaN(date.getTime())) return String(d);
              const y = date.getFullYear();
              const m = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              return `${y}/${m}/${day}`;
            };
            const syncStatus = totalErrors > 0 ? '部分失败' : '成功';
            await notifyService.sendSyncResult(projectName, syncStatus, { traceId, accountsCount: accounts.length, totalWorks, totalErrors, triggerSource, startDate: fmtDate(startDate), endDate: fmtDate(endDate), versionProgress, accountStats });
          } catch (notifyError) {
            logger.warn('sendSyncResult success notification failed', { projectName, error: notifyError.message, traceId });
          }
        }
        return { totalWorks, totalErrors };
      } catch (error) {
        logger.error('Incremental sync failed', { projectName, error: error.message, traceId });
        await logService.logSyncError(projectName, error, { masterTableId: planTableId, traceId, triggerSource, logRecordId: projectLogId, startTime: projectStartTime, operationType: '周期增量同步项目' });
        if (triggerSource !== '周报生成') {
          try {
            await notifyService.sendSyncResult(projectName, '失败', { traceId, errorMessage: error.message, triggerSource });
          } catch (notifyError) {
            logger.warn('sendSyncResult failure notification failed', { projectName, error: notifyError.message, traceId });
          }
        }
        throw error;
      }
    });
  }

  async clearSyncProgress(projectName) {
    logger.info('Clearing sync progress', { projectName });
    return { cleared: true, projectName };
  }

  async syncAccount(account, planTableId, projectName, options = {}) {
    const traceId = options.traceId || `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const triggerSource = options.triggerSource || 'API调用';
    const accountFields = account.fields;
    const accountName = accountFields['账号名称'];
    const homeLink = accountFields['主页链接']?.link || accountFields['主页链接'];

    if (!homeLink) {
      logger.warn('Account missing home link', { accountName });
      return { worksCount: 0 };
    }

    const platform = platformResolver.detectPlatform(homeLink);
    if (!platform) {
      logger.warn('Unknown platform', { accountName, homeLink });
      return { worksCount: 0 };
    }

    const username = platformResolver.extractUsername(homeLink, platform.code);
    if (!username) {
      logger.warn('Cannot extract username', { accountName, homeLink, platform: platform.code });
      return { worksCount: 0 };
    }

    logger.info('Syncing account', { accountName, platform: platform.code, username, traceId });
    const accountStartTime = Date.now();
    const accountLogId = await logService.logSyncStart(projectName, {
      accountName,
      masterTableId: planTableId,
      accountRecordId: account.record_id,
      platformCode: platform.code,
      traceId,
      triggerSource,
    });

    try {
      const detailTableId = await this.getOrCreateDetailTable(projectName, accountName, platform.code);
      const works = await this.fetchPlatformWorks(platform.code, username);
      const followersCount = await this.fetchPlatformFollowers(platform.code, username);

      if (detailTableId) {
        await this.syncWorksToDetailTable(detailTableId, works, account.record_id);
        await this.updateAccountStats(account, planTableId, works, followersCount, platform.code);
      }

      logger.info('Account sync completed', { accountName, worksCount: works.length, traceId });
      await logService.logSyncSuccess(projectName, {
        accountName,
        masterTableId: planTableId,
        detailTableId,
        accountRecordId: account.record_id,
        platformCode: platform.code,
        traceId,
        triggerSource,
        logRecordId: accountLogId,
        startTime: accountStartTime,
        stats: { fetched: works.length },
      });

      return { worksCount: works.length };
    } catch (error) {
      logger.error('Account sync failed', { accountName, error: error.message, traceId });
      await logService.logSyncError(projectName, error, {
        accountName,
        masterTableId: planTableId,
        accountRecordId: account.record_id,
        platformCode: platform.code,
        traceId,
        triggerSource,
        logRecordId: accountLogId,
        startTime: accountStartTime,
      });
      throw error;
    }
  }

  async fetchPlatformFollowers(platformCode, username) {
    try {
      switch (platformCode) {
        case 'TK':
        case 'DY': {
          const ids = await tikhubApi.getTikTokUserInfo(username);
          const userId = ids?.data?.user_id;
          const secUid = ids?.data?.sec_user_id;
          if (!secUid) return 0;
          const profile = await tikhubApi.getTikTokUserProfile(userId, secUid);
          return parseInt(profile?.data?.user?.follower_count) || 0;
        }
        case 'YTB': {
          const channel = await youtubeApi.getChannelByHandle(username) || await youtubeApi.getChannelById(username);
          return parseInt(channel?.statistics?.subscriberCount) || 0;
        }
        case 'X': {
          const info = await tikhubApi.getXUserInfo(username);
          return parseInt(info?.data?.sub_count) || 0;
        }
        case 'INS': {
          const info = await tikhubApi.getInstagramUserInfo(username);
          return parseInt(info?.data?.data?.user?.edge_followed_by?.count) || 0;
        }
        case 'RD': {
          const info = await tikhubApi.getRedditUserInfo(username);
          return parseInt(info?.data?.redditorInfoByName?.profile?.subscribersCount) || 0;
        }
        case 'FB': {
          const info = await tikhubApi.getFacebookUserInfo(username);
          return parseInt(info?.data?.followers_count || info?.data?.user?.followers_count) || 0;
        }
        default:
          return 0;
      }
    } catch (error) {
      logger.warn('Failed to fetch followers count', { platformCode, username, error: error.message });
      return 0;
    }
  }

  async fetchPlatformWorks(platformCode, username, options = {}) {
    const works = [];
    const maxPages = options.maxPages || 200;
    const startDate = options.startDate ? new Date(options.startDate) : null;

    const shouldBreakByDate = (items, getTimestamp) => {
      if (!startDate || !items.length) return false;
      const timestamps = items.map(getTimestamp).filter(Boolean);
      if (!timestamps.length) return false;
      const oldestInPage = Math.min(...timestamps);
      return oldestInPage < startDate.getTime();
    };

    const fetchWithRetry = async (fetchFn, context) => {
      const pageMaxRetries = 3;
      for (let attempt = 0; attempt <= pageMaxRetries; attempt++) {
        try {
          return await fetchFn();
        } catch (error) {
          if (attempt < pageMaxRetries) {
            logger.warn(`${context} failed, retrying page`, { username, attempt: attempt + 1, error: error.message });
            await this._sleep(1000 * (attempt + 1));
          } else {
            throw error;
          }
        }
      }
    };

    switch (platformCode) {
      case 'TK':
      case 'DY': {
        try {
          let cursor = 0;
          let page = 0;
          const seenWorkIds = new Set();
          while (page < maxPages) {
            const videos = await fetchWithRetry(() => tikhubApi.getTikTokUserVideos(username, cursor), 'TikTok');
            const items = videos.data?.aweme_list || videos.data?.itemList || videos.data?.videos || [];
            if (items.length) {
              for (const v of items) {
                const workId = v.video_id || v.aweme_id || v.id;
                if (!workId) continue;
                const key = String(workId);
                if (seenWorkIds.has(key)) {
                  logger.warn('TikTok fetch skipping duplicate workId', { username, workId: key, page });
                  continue;
                }
                seenWorkIds.add(key);
                const stats = v.statistics || v.stats || {};
                if (parseInt(stats.play_count) === 0 && parseInt(stats.digg_count) > 0) {
                  logger.warn('TikHub returned playCount=0, possible data source limitation', { username });
                }
                works.push({
                  workId: key,
                  title: v.desc || v.title || '',
                  link: v.share_url || `https://www.tiktok.com/@${username}/video/${key}`,
                  publishTime: v.create_time ? new Date(v.create_time * 1000).toISOString().split('T')[0] : null,
                  playCount: parseInt(stats.play_count) || 0,
                  diggCount: parseInt(stats.digg_count) || 0,
                  commentCount: parseInt(stats.comment_count) || 0,
                  shareCount: parseInt(stats.share_count) || 0,
                  collectCount: parseInt(stats.collect_count) || 0,
                });
              }
            }
            if (shouldBreakByDate(items, v => v.create_time ? new Date(v.create_time * 1000).getTime() : null)) {
              logger.info('TikTok pagination stopped by date boundary', { username, page });
              break;
            }
            const hasMore = videos.data?.has_more ?? videos.data?.hasMore ?? false;
            const nextCursor = videos.data?.max_cursor ?? videos.data?.cursor;
            if (!hasMore || nextCursor === undefined || nextCursor === cursor) break;
            cursor = nextCursor;
            page++;
            await this._sleep(300);
          }
        } catch (error) {
          const status = error.response?.status;
          if (status === 402) {
            throw new Error(`TikHub API 余额不足(${status})，请充值后重试: ${error.message}`);
          }
          if (platformCode === 'DY') {
            logger.warn('Douyin fetch failed, returning empty works', { username, error: error.message });
          } else {
            logger.error('TikTok API failed after retries, returning partial works', { username, error: error.message, platformCode, fetchedWorks: works.length });
          }
        }
        break;
      }
      case 'YTB': {
        try {
          const channel = await youtubeApi.getChannelByHandle(username) ||
                         await youtubeApi.getChannelById(username);
          if (channel) {
            let pageToken = '';
            let page = 0;
            const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
            if (!uploadsPlaylistId) {
              logger.warn('YouTube channel uploads playlist not found', { username, channelId: channel.id });
              break;
            }
            while (page < maxPages) {
              const videosData = await fetchWithRetry(() => youtubeApi.getVideos(uploadsPlaylistId, pageToken), 'YouTube');
              const videoIds = videosData.items?.map(i => i.contentDetails?.videoId).filter(Boolean) || [];
              if (videoIds.length > 0) {
                const stats = await fetchWithRetry(() => youtubeApi.getVideoStatistics(videoIds), 'YouTube stats');
                works.push(...stats.map(v => ({
                  workId: v.id,
                  title: v.snippet?.title,
                  link: `https://www.youtube.com/watch?v=${v.id}`,
                  publishTime: v.snippet?.publishedAt ? v.snippet.publishedAt.split('T')[0] : null,
                  playCount: parseInt(v.statistics?.viewCount) || 0,
                  diggCount: parseInt(v.statistics?.likeCount) || 0,
                  commentCount: parseInt(v.statistics?.commentCount) || 0,
                  shareCount: 0,
                  collectCount: 0,
                })));
              }
              if (!videosData.nextPageToken) break;
              pageToken = videosData.nextPageToken;
              page++;
              await this._sleep(300);
            }
          }
        } catch (error) {
          const status = error.response?.status;
          if (status === 402 || status === 403) {
            throw new Error(`YouTube API 授权/余额不足(${status})，请检查配置后重试: ${error.message}`);
          }
          logger.error('YouTube API failed after retries, returning partial works', { username, error: error.message, platformCode: 'YTB', fetchedWorks: works.length });
        }
        break;
      }
      case 'INS': {
        try {
          let paginationToken = '';
          let page = 0;
          while (page < maxPages) {
            const posts = await fetchWithRetry(() => tikhubApi.getInstagramUserPosts(username, paginationToken), 'Instagram');
            const items = posts.data?.data?.items || posts.data?.edges || posts.data?.items || [];
            if (items.length) {
              works.push(...items.map(item => {
                const p = item.node || item;
                return {
                  workId: p.id || p.shortcode || p.code,
                  title: p.caption?.text?.slice(0, 100) || p.caption?.slice(0, 100) || '',
                  link: p.link || `https://www.instagram.com/p/${p.code}/`,
                  publishTime: p.taken_at ? new Date(p.taken_at * 1000).toISOString().split('T')[0] : null,
                  playCount: parseInt(p.play_count) || parseInt(p.view_count) || parseInt(p.video_play_count) || 0,
                  diggCount: parseInt(p.like_count) || 0,
                  commentCount: parseInt(p.comment_count) || 0,
                  shareCount: parseInt(p.share_count) || 0,
                  collectCount: parseInt(p.save_count) || 0,
                };
              }));
            }
            if (shouldBreakByDate(items, p => p.taken_at ? new Date(p.taken_at * 1000).getTime() : null)) {
              logger.info('Instagram pagination stopped by date boundary', { username, page });
              break;
            }
            const nextToken = posts.data?.pagination_token || posts.data?.page_info?.end_cursor;
            if (!nextToken || nextToken === paginationToken) break;
            paginationToken = nextToken;
            page++;
            await this._sleep(300);
          }
        } catch (error) {
          const status = error.response?.status;
          if (status === 402) {
            throw new Error(`TikHub API 余额不足(${status})，请充值后重试: ${error.message}`);
          }
          logger.error('Instagram API failed after retries, returning partial works', { username, error: error.message, platformCode: 'INS', fetchedWorks: works.length });
        }
        break;
      }
      case 'X': {
        try {
          let cursor = '';
          let page = 0;
          while (page < maxPages) {
            const tweets = await fetchWithRetry(() => tikhubApi.getXUserTweets(username, cursor), 'X');
            let tweetList = [];
            if (tweets.data?.timeline && typeof tweets.data.timeline === 'object') {
              tweetList = Object.values(tweets.data.timeline);
            } else if (Array.isArray(tweets.data?.tweets)) {
              tweetList = tweets.data.tweets;
            }
            if (tweetList.length) {
              works.push(...tweetList.map(t => ({
                workId: t.id || t.rest_id || t.tweet_id,
                title: t.text?.slice(0, 100) || t.legacy?.full_text?.slice(0, 100) || '',
                link: `https://x.com/${username}/status/${t.id || t.rest_id || t.tweet_id}`,
                publishTime: t.created_at ? new Date(t.created_at).toISOString().split('T')[0] : null,
                playCount: parseInt(t.views) || parseInt(t.views?.count) || 0,
                diggCount: parseInt(t.favorites) || parseInt(t.legacy?.favorite_count) || 0,
                commentCount: parseInt(t.replies) || parseInt(t.legacy?.reply_count) || 0,
                shareCount: parseInt(t.retweets) || parseInt(t.quotes) || parseInt(t.legacy?.retweet_count) || 0,
                collectCount: parseInt(t.bookmarks) || parseInt(t.legacy?.bookmark_count) || 0,
              })));
            }
            if (shouldBreakByDate(tweetList, t => t.created_at ? new Date(t.created_at).getTime() : null)) {
              logger.info('X pagination stopped by date boundary', { username, page });
              break;
            }
            const nextCursor = tweets.data?.next_cursor;
            if (!nextCursor || nextCursor === cursor) break;
            cursor = nextCursor;
            page++;
            await this._sleep(300);
          }
        } catch (error) {
          const status = error.response?.status;
          if (status === 402) {
            throw new Error(`TikHub API 余额不足(${status})，请充值后重试: ${error.message}`);
          }
          logger.error('X API failed after retries, returning partial works', { username, error: error.message, platformCode: 'X', fetchedWorks: works.length });
        }
        break;
      }
      case 'RD': {
        try {
          let after = '';
          let page = 0;
          while (page < maxPages) {
            const posts = await fetchWithRetry(() => tikhubApi.getRedditUserPosts(username, after), 'Reddit');
            const edges = posts.data?.postFeed?.elements?.edges || posts.data?.posts || posts.data?.items || [];
            const postList = edges.map(e => e.node || e).filter(Boolean);
            if (postList.length) {
              works.push(...postList.map(p => ({
                workId: p.id,
                title: p.postTitle?.slice(0, 100) || p.title?.slice(0, 100) || '',
                link: p.url || p.permalink_url || p.permalink || `https://www.reddit.com${p.permalink}`,
                publishTime: p.createdAt ? p.createdAt.split('T')[0] : (p.created_utc ? new Date(p.created_utc * 1000).toISOString().split('T')[0] : null),
                playCount: parseInt(p.score) || 0,
                diggCount: parseInt(p.ups) || 0,
                commentCount: parseInt(p.commentCount) || parseInt(p.num_comments) || 0,
                shareCount: 0,
                collectCount: 0,
              })));
            }
            if (shouldBreakByDate(postList, p => p.createdAt ? new Date(p.createdAt).getTime() : (p.created_utc ? new Date(p.created_utc * 1000).getTime() : null))) {
              logger.info('Reddit pagination stopped by date boundary', { username, page });
              break;
            }
            const pageInfo = posts.data?.postFeed?.elements?.pageInfo;
            const nextAfter = pageInfo?.endCursor || posts.data?.after;
            const hasMore = pageInfo?.hasNextPage ?? (nextAfter ? true : false);
            if (!hasMore || !nextAfter || nextAfter === after) break;
            after = nextAfter;
            page++;
            await this._sleep(300);
          }
        } catch (error) {
          const status = error.response?.status;
          if (status === 402) {
            throw new Error(`TikHub API 余额不足(${status})，请充值后重试: ${error.message}`);
          }
          logger.error('Reddit API failed after retries, returning partial works', { username, error: error.message, platformCode: 'RD', fetchedWorks: works.length });
        }
        break;
      }
      case 'FB': {
        try {
          let cursor = '';
          let page = 0;
          while (page < maxPages) {
            const posts = await fetchWithRetry(() => tikhubApi.getFacebookUserPosts(username, cursor), 'Facebook');
            const postList = posts.data?.posts || posts.data?.items || [];
            if (postList.length) {
              works.push(...postList.map(p => ({
                workId: p.id,
                title: p.message?.slice(0, 100) || p.story?.slice(0, 100) || '',
                link: p.permalink_url || `https://www.facebook.com/${p.id}`,
                publishTime: p.created_time ? p.created_time.split('T')[0] : null,
                playCount: parseInt(p.insights?.find(i => i.name === 'post_impressions')?.values?.[0]?.value) || 0,
                diggCount: parseInt(p.likes?.summary?.total_count) || 0,
                commentCount: parseInt(p.comments?.summary?.total_count) || 0,
                shareCount: parseInt(p.shares?.count) || 0,
                collectCount: 0,
              })));
            }
            if (shouldBreakByDate(postList, p => p.created_time ? new Date(p.created_time).getTime() : null)) {
              logger.info('Facebook pagination stopped by date boundary', { username, page });
              break;
            }
            const nextCursor = posts.data?.paging?.cursors?.after || posts.data?.next;
            if (!nextCursor || nextCursor === cursor) break;
            cursor = nextCursor;
            page++;
            await this._sleep(300);
          }
        } catch (error) {
          const status = error.response?.status;
          if (status === 402) {
            throw new Error(`TikHub API 余额不足(${status})，请充值后重试: ${error.message}`);
          }
          logger.error('Facebook API failed after retries, returning partial works', { username, error: error.message, platformCode: 'FB', fetchedWorks: works.length });
        }
        break;
      }
      default:
        logger.warn('Platform not supported yet', { platformCode });
    }

    return works;
  }

  async getOrCreateDetailTable(projectName, accountName, platformCode) {
    const prefix = projectName.split('-')[0];
    const normalizedAccount = accountName.replace(/\s+/g, '');
    const shortName = `${prefix}-${normalizedAccount}${platformCode}-作品详情`;
    const fullName = `${prefix}-${normalizedAccount}${platformResolver.getPlatformName(platformCode)}-作品详情`;

    try {
      const tables = await feishuBitable.getAppTables(this.projectMgmtAppToken);
      const matched = tables.items?.find(t => t.name === shortName || t.name === fullName);

      if (matched) {
        logger.info('Detail table found', { tableName: matched.name, tableId: matched.table_id });
        return matched.table_id;
      }

      logger.info('Detail table not found, creating', { shortName });
      const newTableId = await projectService.createDetailTable(projectName, accountName, platformCode);
      return newTableId;
    } catch (error) {
      logger.error('Failed to lookup or create detail table', { shortName, fullName, error: error.message });
      return null;
    }
  }

  async syncWorksToDetailTable(detailTableId, works, accountRecordId, allowDelete = true) {
    if (!detailTableId || !works.length) return { createdCount: 0, updatedCount: 0 };

    const now = this._formatDateTime();

    // 查询表字段类型，兼容新旧表字段差异
    let publishTimeIsDate = false;
    let linkIsUrl = false;
    try {
      const tableFields = await feishuBitable.getTableFields(this.projectMgmtAppToken, detailTableId);
      for (const f of tableFields?.items || []) {
        if (f.field_name === '发布时间' && f.type === 5) publishTimeIsDate = true;
        if (f.field_name === '作品链接' && f.type === 15) linkIsUrl = true;
      }
    } catch (e) {
      logger.warn('Failed to get table fields, falling back to safe mode', { detailTableId, error: e.message });
    }

    const allRecords = await feishuBitable.searchRecords(this.projectMgmtAppToken, detailTableId);
    const existingMap = new Map();
    const duplicateRecordIds = [];
    for (const r of allRecords) {
      const workId = r.fields?.['作品ID'];
      if (workId) {
        const key = String(workId);
        if (existingMap.has(key)) {
          duplicateRecordIds.push(r.record_id);
        } else {
          existingMap.set(key, r.record_id);
        }
      }
    }

    // 对 works 去重，防止 API 返回重复数据导致重复插入
    const uniqueWorks = [...new Map(works.map(w => [String(w.workId), w])).values()];
    logger.info('Detail table dedup check', { detailTableId, allRecordsCount: allRecords.length, existingMapSize: existingMap.size, worksCount: works.length, uniqueWorksCount: uniqueWorks.length, publishTimeIsDate, linkIsUrl });

    const toCreate = [];
    const toUpdate = [];
    const processedWorkIds = new Set();

    for (const work of uniqueWorks) {
      processedWorkIds.add(String(work.workId));
      const fields = {
        '作品ID': String(work.workId),
        '作品标题': work.title || '',
        '播放量': Number(work.playCount) || 0,
        '点赞数': Number(work.diggCount) || 0,
        '评论数': Number(work.commentCount) || 0,
        '分享数': Number(work.shareCount) || 0,
        '收藏数': Number(work.collectCount) || 0,
        '数据状态': '正常',
        '同步时间': now,
        '总表记录ID': accountRecordId,
      };
      // 旧表可能把 作品链接 设为 URL 类型、发布时间 设为日期类型，
      // 空字符串或不合法值会导致 FieldConvFail，只传有效值
      if (work.link && (!linkIsUrl || String(work.link).match(/^https?:\/\//))) {
        fields['作品链接'] = linkIsUrl ? { link: work.link, text: work.link } : work.link;
      }
      if (work.publishTime) {
        if (publishTimeIsDate) {
          // 旧表日期字段只接受毫秒时间戳
          const ts = new Date(String(work.publishTime).replace(/-/g, '/')).getTime();
          if (!isNaN(ts)) fields['发布时间'] = ts;
        } else {
          fields['发布时间'] = work.publishTime;
        }
      }
      const recordId = existingMap.get(String(work.workId));
      if (recordId) {
        toUpdate.push({ recordId, fields });
      } else {
        toCreate.push(fields);
      }
    }

    // 删除重复记录（旧代码遗留），以及不在新数据中的旧记录（仅在全量同步时）
    const toDelete = [...duplicateRecordIds];
    if (allowDelete) {
      for (const [workId, recordId] of existingMap) {
        if (!processedWorkIds.has(workId)) {
          toDelete.push(recordId);
        }
      }
    }

    logger.info('Syncing works to detail table', { detailTableId, toCreate: toCreate.length, toUpdate: toUpdate.length, toDelete: toDelete.length, duplicates: duplicateRecordIds.length });

    if (toCreate.length > 0) {
      const createResult = await feishuBitable.batchCreateRecords(this.projectMgmtAppToken, detailTableId, toCreate);
      logger.info('Detail table batch create completed', { detailTableId, created: toCreate.length, result: createResult ? 'success' : 'empty' });
    }
    if (toCreate.length > 0 && toUpdate.length > 0) {
      await this._sleep(config.sync?.batchInterval || 500);
    }
    if (toUpdate.length > 0) {
      const updateResult = await feishuBitable.batchUpdateRecords(this.projectMgmtAppToken, detailTableId, toUpdate);
      logger.info('Detail table batch update completed', { detailTableId, updated: toUpdate.length, result: updateResult ? 'success' : 'empty' });
    }
    if (toDelete.length > 0) {
      await this._sleep(config.sync?.batchInterval || 500);
      for (const recordId of toDelete) {
        await feishuBitable.deleteRecord(this.projectMgmtAppToken, detailTableId, recordId);
        await this._sleep(100);
      }
      logger.info('Detail table delete completed', { detailTableId, deleted: toDelete.length });
    }

    return { createdCount: toCreate.length, updatedCount: toUpdate.length, deletedCount: toDelete.length };
  }

  async updateAccountStats(account, planTableId, works, followersCount = 0, platformCode = '') {
    if (!works || works.length === 0) {
      logger.warn('Skipping account stats update due to empty works', { accountName: account.fields?.['账号名称'] });
      return;
    }

    const totalPlayCount = works.reduce((sum, w) => sum + (w.playCount || 0), 0);
    const publishedCount = works.length;

    const dateStats = this.calculateDateStats(works);

    const baseFields = {
      '目前播放量': totalPlayCount,
      '已发布': publishedCount,
      '粉丝总量': followersCount,
      '平台': platformCode,
    };

    const baseFieldDefs = {
      '目前播放量': { field_name: '目前播放量', type: 2, property: { formatter: '0' } },
      '已发布': { field_name: '已发布', type: 2, property: { formatter: '0' } },
      '粉丝总量': { field_name: '粉丝总量', type: 2, property: { formatter: '0' } },
      '平台': { field_name: '平台', type: 1 },
    };

    try {
      const tableFields = await feishuBitable.getTableFields(this.projectMgmtAppToken, planTableId);
      const existingFieldNames = new Set((tableFields?.items || []).map(f => f.field_name));

      // 自动创建缺失的 baseFields（兼容旧表升级）
      for (const fieldName of Object.keys(baseFields)) {
        if (!existingFieldNames.has(fieldName)) {
          const fieldDef = baseFieldDefs[fieldName];
          if (fieldDef) {
            try {
              await feishuBitable.createField(this.projectMgmtAppToken, planTableId, fieldDef);
              existingFieldNames.add(fieldName);
              logger.info('Auto-created missing field during sync', { fieldName, planTableId });
              await this._sleep(300);
            } catch (createError) {
              logger.warn('Failed to auto-create field during sync', { fieldName, planTableId, error: createError.message });
            }
          }
        }
      }

      const filteredDateStats = {};
      for (const [key, value] of Object.entries(dateStats)) {
        if (existingFieldNames.has(key)) {
          filteredDateStats[key] = value;
        }
      }

      const fieldsToUpdate = {};
      for (const [key, value] of Object.entries({ ...baseFields, ...filteredDateStats })) {
        if (existingFieldNames.has(key)) {
          fieldsToUpdate[key] = value;
        }
      }
      await feishuBitable.updateRecord(this.projectMgmtAppToken, planTableId, account.record_id, fieldsToUpdate);
      logger.info('Account stats updated', { accountName: account.fields?.['账号名称'], planTableId, dateFieldsCount: Object.keys(filteredDateStats).length });
    } catch (error) {
      const msg = error.message || '';
      const errCode = msg.match(/code[:：]\s*(\d+)/)?.[1] || String(error.code);
      logger.error('updateAccountStats failed, skipping stats update for this account', { accountName: account.fields?.['账号名称'], planTableId, error: msg, code: errCode });
    }
  }

  calculateDateStats(works) {
    const dateMap = new Map();

    works.forEach(work => {
      if (work.publishTime) {
        const date = new Date(work.publishTime);
        if (isNaN(date.getTime())) return;
        const key = `${date.getMonth() + 1}月${date.getDate()}日`;
        dateMap.set(key, (dateMap.get(key) || 0) + 1);
      }
    });

    const result = {};
    for (const [key, count] of dateMap) {
      result[key] = String(count);
    }

    return result;
  }

  async updateProjectStats(planTableId, projectRecord) {
    const accounts = await feishuBitable.searchRecords(this.projectMgmtAppToken, planTableId);

    const totalPlayCount = accounts.reduce((sum, a) => sum + this._normalizeNumber(a.fields['目前播放量']), 0);
    const totalPublished = accounts.reduce((sum, a) => sum + this._normalizeNumber(a.fields['已发布']), 0);

    const versionProgress = this.calculateVersionProgress(projectRecord.fields);

    const updateFields = {
      '更新日期': this._formatDateTime(),
    };

    if (versionProgress !== null) {
      updateFields['版本进度'] = versionProgress;
    }

    await feishuBitable.updateRecord(this.projectMgmtAppToken, 'tblxbkkh03Kw10lI', projectRecord.record_id, updateFields);

    logger.info('Project stats updated', {
      projectName: projectRecord.fields['项目名称'],
      totalPlayCount,
      totalPublished,
      versionProgress,
    });
  }

  calculateVersionProgress(fields) {
    const start = fields['版本开始日期'] ? new Date(fields['版本开始日期']) : null;
    const end = fields['版本结束日期'] ? new Date(fields['版本结束日期']) : null;

    if (!start || !end) return null;

    const now = Date.now();
    const startTime = start.getTime();
    const endTime = end.getTime();

    if (now <= startTime) return 0;
    if (now >= endTime) return 1;

    const progress = (now - startTime) / (endTime - startTime);
    return parseFloat(progress.toFixed(6));
  }
}

module.exports = new SyncService();
