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
    return Math.floor(d.getTime() / 1000);
  }

  async syncProject(projectRecord, options = {}) {
    const fields = projectRecord.fields;
    const planTableId = fields['表格ID'];
    const projectName = fields['项目名称'];
    const traceId = options.traceId || `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const triggerSource = options.triggerSource || 'API调用';

    return syncQueue.enqueue(`project:${projectName}`, async () => {
      logger.info('Starting project sync', { projectName, planTableId, traceId });
      await logService.logSyncStart(projectName, { masterTableId: planTableId, traceId, triggerSource });

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

        logger.info('Project sync completed', { projectName, accountsCount: accounts.length, totalWorks, totalErrors, traceId });
        await logService.logSyncSuccess(projectName, {
          masterTableId: planTableId,
          traceId,
          triggerSource,
          stats: { fetched: totalWorks },
        });

        await notifyService.sendSyncResult(projectName, '成功', { traceId, accountsCount: accounts.length, totalWorks, totalErrors, triggerSource });
        return { accountsCount: accounts.length, totalWorks, totalErrors };
      } catch (error) {
        logger.error('Project sync failed', { projectName, error: error.message, traceId });
        await logService.logSyncError(projectName, error, { masterTableId: planTableId, traceId, triggerSource });
        await notifyService.sendSyncResult(projectName, '失败', { traceId, errorMessage: error.message, triggerSource });
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
        await notifyService.sendSyncResult(projectName, '成功', { traceId, recordId, totalWorks: result?.worksCount || 0, accountsCount: 1, triggerSource });
        return { success: true, worksCount: result?.worksCount || 0 };
      } catch (error) {
        await notifyService.sendSyncResult(projectName, '失败', { traceId, recordId, errorMessage: error.message, triggerSource });
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

    return syncQueue.enqueue(`project:${projectName}:incremental`, async () => {
      const parsedStart = this._parseDate(startDate);
      const parsedEnd = this._parseDate(endDate);

      logger.info('Starting incremental sync', { projectName, planTableId, startDate, endDate, traceId });
      await logService.logSyncStart(projectName, { masterTableId: planTableId, traceId, triggerSource });

      let totalWorks = 0;
      let totalErrors = 0;

      try {
        const accounts = await feishuBitable.searchRecords(this.projectMgmtAppToken, planTableId);

        for (const account of accounts) {
          const accountFields = account.fields;
          const accountName = accountFields['账号名称'];
          const homeLink = accountFields['主页链接']?.link || accountFields['主页链接'];

          if (!homeLink) continue;

          const platform = platformResolver.detectPlatform(homeLink);
          if (!platform) continue;

          const username = platformResolver.extractUsername(homeLink, platform.code);
          if (!username) continue;

          await logService.logSyncStart(projectName, {
            accountName,
            masterTableId: planTableId,
            accountRecordId: account.record_id,
            platformCode: platform.code,
            traceId,
            triggerSource,
          });

          try {
            const works = await this.fetchPlatformWorks(platform.code, username);
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

            if (filteredWorks.length > 0 && detailTableId) {
              const syncResult = await this.syncWorksToDetailTable(detailTableId, filteredWorks, account.record_id);
              createdCount = syncResult.createdCount || 0;
              updatedCount = syncResult.updatedCount || 0;
              await this.updateAccountStats(account, planTableId, filteredWorks);
              totalWorks += filteredWorks.length;
            } else {
              skippedCount = works.length - filteredWorks.length;
            }

            if (detailTableId) {
              await logService.logSyncSuccess(projectName, {
                accountName,
                masterTableId: planTableId,
                detailTableId,
                accountRecordId: account.record_id,
                platformCode: platform.code,
                traceId,
                triggerSource,
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
            });
          }
        }

        await this.updateProjectStats(planTableId, projectRecord);

        logger.info('Incremental sync completed', { projectName, totalWorks, totalErrors, traceId });
        await logService.logSyncSuccess(projectName, {
          masterTableId: planTableId,
          traceId,
          triggerSource,
          stats: { fetched: totalWorks },
        });

        await notifyService.sendSyncResult(projectName, '成功', { traceId, accountsCount: accounts.length, totalWorks, totalErrors, triggerSource });
        return { totalWorks, totalErrors };
      } catch (error) {
        logger.error('Incremental sync failed', { projectName, error: error.message, traceId });
        await logService.logSyncError(projectName, error, { masterTableId: planTableId, traceId, triggerSource });
        await notifyService.sendSyncResult(projectName, '失败', { traceId, errorMessage: error.message, triggerSource });
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
    await logService.logSyncStart(projectName, {
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

      if (detailTableId) {
        await this.syncWorksToDetailTable(detailTableId, works, account.record_id);
        await this.updateAccountStats(account, planTableId, works);
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
      });
      throw error;
    }
  }

  async fetchPlatformWorks(platformCode, username) {
    const works = [];
    const maxPages = 20;

    switch (platformCode) {
      case 'TK':
      case 'DY': {
        try {
          let cursor = 0;
          let page = 0;
          while (page < maxPages) {
            const videos = await tikhubApi.getTikTokUserVideos(username, cursor);
            const items = videos.data?.itemList || videos.data?.videos || [];
            if (items.length) {
              works.push(...items.map(v => {
                const stats = v.statistics || v.stats || {};
                if (parseInt(stats.play_count) === 0 && parseInt(stats.digg_count) > 0) {
                  logger.warn('TikHub returned play_count=0, possible data source limitation', { username });
                }
                return {
                  workId: v.id || v.video_id || v.aweme_id,
                  title: v.desc || v.title || '',
                  link: v.share_url || `https://www.tiktok.com/@${username}/video/${v.id || v.video_id}`,
                  publishTime: v.create_time ? new Date(v.create_time * 1000).toISOString().split('T')[0] : null,
                  playCount: parseInt(stats.play_count) || 0,
                  diggCount: parseInt(stats.digg_count) || 0,
                  commentCount: parseInt(stats.comment_count) || 0,
                  shareCount: parseInt(stats.share_count) || 0,
                  collectCount: parseInt(stats.collect_count) || 0,
                };
              }));
            }
            const hasMore = videos.data?.hasMore ?? false;
            const nextCursor = videos.data?.cursor;
            if (!hasMore || nextCursor === undefined || nextCursor === cursor) break;
            cursor = nextCursor;
            page++;
            await this._sleep(300);
          }
        } catch (error) {
          if (platformCode === 'DY') {
            logger.warn('Douyin fetch failed, returning empty works', { username, error: error.message });
          } else {
            throw error;
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
            while (page < maxPages) {
              const videosData = await youtubeApi.getVideos(channel.id, pageToken);
              const videoIds = videosData.items?.map(i => i.contentDetails?.videoId).filter(Boolean) || [];
              if (videoIds.length > 0) {
                const stats = await youtubeApi.getVideoStatistics(videoIds);
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
          logger.error('YouTube API failed, possibly due to network restriction', { username, error: error.message, platformCode: 'YTB' });
        }
        break;
      }
      case 'INS': {
        try {
          let endCursor = '';
          let page = 0;
          while (page < maxPages) {
            const posts = await tikhubApi.getInstagramUserPosts(username, endCursor);
            const edges = posts.data?.edges || posts.data?.items || [];
            if (edges.length) {
              works.push(...edges.map(item => {
                const p = item.node || item;
                return {
                  workId: p.id || p.pk || p.code,
                  title: p.caption?.text?.slice(0, 100) || p.caption?.slice(0, 100) || '',
                  link: p.link || `https://www.instagram.com/p/${p.code}/`,
                  publishTime: p.taken_at ? new Date(p.taken_at * 1000).toISOString().split('T')[0] : null,
                  playCount: parseInt(p.view_count) || parseInt(p.video_play_count) || 0,
                  diggCount: parseInt(p.like_count) || 0,
                  commentCount: parseInt(p.comment_count) || 0,
                  shareCount: 0,
                  collectCount: parseInt(p.save_count) || 0,
                };
              }));
            }
            const pageInfo = posts.data?.page_info;
            if (!pageInfo?.has_next_page || !pageInfo?.end_cursor) break;
            if (pageInfo.end_cursor === endCursor) break;
            endCursor = pageInfo.end_cursor;
            page++;
            await this._sleep(300);
          }
        } catch (error) {
          logger.error('Instagram API failed mid-pagination, returning partial works', { username, error: error.message, platformCode: 'INS', fetchedWorks: works.length });
        }
        break;
      }
      case 'X': {
        try {
          let cursor = '';
          let page = 0;
          while (page < maxPages) {
            const tweets = await tikhubApi.getXUserTweets(username, cursor);
            let tweetList = [];
            if (tweets.data?.timeline && typeof tweets.data.timeline === 'object') {
              tweetList = Object.values(tweets.data.timeline);
            } else if (Array.isArray(tweets.data?.tweets)) {
              tweetList = tweets.data.tweets;
            }
            if (tweetList.length) {
              works.push(...tweetList.map(t => ({
                workId: t.tweet_id || t.id || t.rest_id,
                title: t.text?.slice(0, 100) || t.legacy?.full_text?.slice(0, 100) || '',
                link: `https://x.com/${username}/status/${t.tweet_id || t.id || t.rest_id}`,
                publishTime: t.created_at ? new Date(t.created_at).toISOString().split('T')[0] : null,
                playCount: parseInt(t.views) || parseInt(t.views?.count) || 0,
                diggCount: parseInt(t.favorites) || parseInt(t.legacy?.favorite_count) || 0,
                commentCount: parseInt(t.replies) || parseInt(t.legacy?.reply_count) || 0,
                shareCount: parseInt(t.retweets) || parseInt(t.quotes) || parseInt(t.legacy?.retweet_count) || 0,
                collectCount: parseInt(t.bookmarks) || parseInt(t.legacy?.bookmark_count) || 0,
              })));
            }
            const nextCursor = tweets.data?.next_cursor;
            if (!nextCursor || nextCursor === cursor) break;
            cursor = nextCursor;
            page++;
            await this._sleep(300);
          }
        } catch (error) {
          logger.error('X API failed mid-pagination, returning partial works', { username, error: error.message, platformCode: 'X', fetchedWorks: works.length });
        }
        break;
      }
      case 'RD': {
        try {
          let after = '';
          let page = 0;
          while (page < maxPages) {
            const posts = await tikhubApi.getRedditUserPosts(username, after);
            const postList = posts.data?.posts || posts.data?.items || [];
            if (postList.length) {
              works.push(...postList.map(p => ({
                workId: p.id,
                title: p.title?.slice(0, 100) || '',
                link: p.permalink_url || p.permalink || `https://www.reddit.com${p.permalink}`,
                publishTime: p.created_utc ? new Date(p.created_utc * 1000).toISOString().split('T')[0] : null,
                playCount: parseInt(p.score) || 0,
                diggCount: parseInt(p.ups) || 0,
                commentCount: parseInt(p.num_comments) || 0,
                shareCount: 0,
                collectCount: 0,
              })));
            }
            const nextAfter = posts.data?.after;
            if (!nextAfter || nextAfter === after) break;
            after = nextAfter;
            page++;
            await this._sleep(300);
          }
        } catch (error) {
          logger.error('Reddit API failed mid-pagination, returning partial works', { username, error: error.message, platformCode: 'RD', fetchedWorks: works.length });
        }
        break;
      }
      case 'FB': {
        try {
          let cursor = '';
          let page = 0;
          while (page < maxPages) {
            const posts = await tikhubApi.getFacebookUserPosts(username, cursor);
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
            const nextCursor = posts.data?.paging?.cursors?.after || posts.data?.next;
            if (!nextCursor || nextCursor === cursor) break;
            cursor = nextCursor;
            page++;
            await this._sleep(300);
          }
        } catch (error) {
          logger.error('Facebook API failed mid-pagination, returning partial works', { username, error: error.message, platformCode: 'FB', fetchedWorks: works.length });
        }
        break;
      }
      default:
        logger.warn('Platform not supported yet', { platformCode });
    }

    return works;
  }

  async getOrCreateDetailTable(projectName, accountName, platformCode) {
    const tableName = `${projectName.split('-')[0]}-${accountName.replace(/\s+/g, '')}${platformCode}-作品详情`;

    try {
      const tables = await feishuBitable.getAppTables(this.projectMgmtAppToken);
      const matched = tables.items?.find(t => t.name === tableName);

      if (matched) {
        logger.info('Detail table found', { tableName, tableId: matched.table_id });
        return matched.table_id;
      }

      logger.info('Detail table not found, creating', { tableName });
      const newTableId = await projectService.createDetailTable(projectName, accountName, platformCode);
      return newTableId;
    } catch (error) {
      logger.error('Failed to lookup or create detail table', { tableName, error: error.message });
      return null;
    }
  }

  async syncWorksToDetailTable(detailTableId, works, accountRecordId) {
    if (!detailTableId || !works.length) return { createdCount: 0, updatedCount: 0 };

    const now = this._formatDateTime();
    const allRecords = await feishuBitable.searchRecords(this.projectMgmtAppToken, detailTableId);
    const existingMap = new Map();
    for (const r of allRecords) {
      const workId = r.fields?.['作品ID'];
      if (workId) {
        existingMap.set(String(workId), r.record_id);
      }
    }

    const toCreate = [];
    const toUpdate = [];

    for (const work of works) {
      const fields = {
        '作品ID': String(work.workId),
        '作品标题': work.title,
        '作品链接': work.link,
        '发布时间': work.publishTime,
        '播放量': Number(work.playCount) || 0,
        '点赞数': Number(work.diggCount) || 0,
        '评论数': Number(work.commentCount) || 0,
        '分享数': Number(work.shareCount) || 0,
        '收藏数': Number(work.collectCount) || 0,
        '数据状态': '正常',
        '同步时间': now,
        '总表记录ID': accountRecordId,
      };
      const recordId = existingMap.get(String(work.workId));
      if (recordId) {
        toUpdate.push({ recordId, fields });
      } else {
        toCreate.push(fields);
      }
    }

    if (toCreate.length > 0) {
      await feishuBitable.batchCreateRecords(this.projectMgmtAppToken, detailTableId, toCreate);
    }
    if (toCreate.length > 0 && toUpdate.length > 0) {
      await this._sleep(config.sync?.batchInterval || 500);
    }
    if (toUpdate.length > 0) {
      await feishuBitable.batchUpdateRecords(this.projectMgmtAppToken, detailTableId, toUpdate);
    }

    return { createdCount: toCreate.length, updatedCount: toUpdate.length };
  }

  async updateAccountStats(account, planTableId, works) {
    if (!works || works.length === 0) {
      logger.warn('Skipping account stats update due to empty works', { accountName: account.fields?.['账号名称'] });
      return;
    }

    const totalPlayCount = works.reduce((sum, w) => sum + (w.playCount || 0), 0);
    const publishedCount = works.length;

    const dateStats = this.calculateDateStats(works);

    const updateFields = {
      '目前播放量': totalPlayCount,
      '已发布': publishedCount,
      ...dateStats,
    };

    await feishuBitable.updateRecord(this.projectMgmtAppToken, planTableId, account.record_id, updateFields);
  }

  calculateDateStats(works) {
    const dateMap = new Map();

    works.forEach(work => {
      if (work.publishTime) {
        const date = new Date(work.publishTime);
        const key = `${date.getMonth() + 1}月${date.getDate()}日`;
        dateMap.set(key, (dateMap.get(key) || 0) + 1);
      }
    });

    const entries = Array.from(dateMap.entries())
      .sort((a, b) => {
        const [ma, da] = a[0].match(/(\d+)月(\d+)日/).slice(1).map(Number);
        const [mb, db] = b[0].match(/(\d+)月(\d+)日/).slice(1).map(Number);
        return ma !== mb ? ma - mb : da - db;
      })
      .map(([key, count]) => `${key}: ${count}条`)
      .join(', ');

    return { '发布日期统计': entries || '' };
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
