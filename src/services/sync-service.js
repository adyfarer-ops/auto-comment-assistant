const feishuBitable = require('./feishu-bitable');
const tikhubApi = require('./tikhub-api');
const youtubeApi = require('./youtube-api');
const platformResolver = require('./platform-resolver');
const logger = require('../utils/logger');

class SyncService {
  constructor() {
    this.projectMgmtAppToken = null;
  }

  setProjectMgmtAppToken(token) {
    this.projectMgmtAppToken = token;
  }

  async syncProject(projectRecord) {
    const fields = projectRecord.fields;
    const planTableId = fields['表格ID'];
    const projectName = fields['项目名称'];

    logger.info('Starting project sync', { projectName, planTableId });

    // 获取项目规划表中的所有账号
    const accounts = await feishuBitable.searchRecords(this.projectMgmtAppToken, planTableId);

    for (const account of accounts) {
      await this.syncAccount(account, planTableId, projectName);
    }

    // 更新项目统计
    await this.updateProjectStats(planTableId, projectRecord);

    logger.info('Project sync completed', { projectName, accountsCount: accounts.length });
    return { accountsCount: accounts.length };
  }

  async syncAccount(account, planTableId, projectName) {
    const accountFields = account.fields;
    const accountName = accountFields['账号名称'];
    const homeLink = accountFields['主页链接']?.link || accountFields['主页链接'];

    if (!homeLink) {
      logger.warn('Account missing home link', { accountName });
      return;
    }

    const platform = platformResolver.detectPlatform(homeLink);
    if (!platform) {
      logger.warn('Unknown platform', { accountName, homeLink });
      return;
    }

    const username = platformResolver.extractUsername(homeLink, platform.code);
    if (!username) {
      logger.warn('Cannot extract username', { accountName, homeLink, platform: platform.code });
      return;
    }

    logger.info('Syncing account', { accountName, platform: platform.code, username });

    try {
      // 获取作品详情表ID
      const detailTableId = await this.getOrCreateDetailTable(projectName, accountName, platform.code);

      // 抓取平台数据
      const works = await this.fetchPlatformWorks(platform.code, username);

      // 同步到作品详情表
      await this.syncWorksToDetailTable(detailTableId, works, account.record_id);

      // 更新账号统计
      await this.updateAccountStats(account, planTableId, works);

      logger.info('Account sync completed', { accountName, worksCount: works.length });
    } catch (error) {
      logger.error('Account sync failed', { accountName, error: error.message });
    }
  }

  async fetchPlatformWorks(platformCode, username) {
    const works = [];

    switch (platformCode) {
      case 'TK': {
        const userInfo = await tikhubApi.getTikTokUserInfo(username);
        const videos = await tikhubApi.getTikTokUserVideos(username);
        if (videos.data?.videos) {
          works.push(...videos.data.videos.map(v => ({
            workId: v.video_id || v.aweme_id,
            title: v.title || v.desc,
            link: v.share_url || `https://www.tiktok.com/@${username}/video/${v.video_id}`,
            publishTime: v.create_time ? new Date(v.create_time * 1000).toISOString().split('T')[0] : null,
            playCount: parseInt(v.statistics?.play_count) || 0,
            diggCount: parseInt(v.statistics?.digg_count) || 0,
            commentCount: parseInt(v.statistics?.comment_count) || 0,
            shareCount: parseInt(v.statistics?.share_count) || 0,
            collectCount: parseInt(v.statistics?.collect_count) || 0,
          })));
        }
        break;
      }
      case 'YTB': {
        const channel = await youtubeApi.getChannelByHandle(username) ||
                       await youtubeApi.getChannelById(username);
        if (channel) {
          const videosData = await youtubeApi.getVideos(channel.id);
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
        }
        break;
      }
      case 'INS': {
        const posts = await tikhubApi.getInstagramUserPosts(username);
        if (posts.data?.items) {
          works.push(...posts.data.items.map(p => ({
            workId: p.id || p.shortcode,
            title: p.caption?.text?.slice(0, 100) || '',
            link: `https://www.instagram.com/p/${p.shortcode}/`,
            publishTime: p.taken_at ? new Date(p.taken_at * 1000).toISOString().split('T')[0] : null,
            playCount: parseInt(p.video_play_count) || parseInt(p.view_count) || 0,
            diggCount: parseInt(p.like_count) || 0,
            commentCount: parseInt(p.comment_count) || 0,
            shareCount: 0,
            collectCount: parseInt(p.save_count) || 0,
          })));
        }
        break;
      }
      case 'X': {
        const tweets = await tikhubApi.getXUserTweets(username);
        if (tweets.data?.tweets) {
          works.push(...tweets.data.tweets.map(t => ({
            workId: t.id || t.rest_id,
            title: t.legacy?.full_text?.slice(0, 100) || '',
            link: `https://x.com/${username}/status/${t.id || t.rest_id}`,
            publishTime: t.legacy?.created_at ? new Date(t.legacy.created_at).toISOString().split('T')[0] : null,
            playCount: parseInt(t.views?.count) || parseInt(t.legacy?.views?.count) || 0,
            diggCount: parseInt(t.legacy?.favorite_count) || 0,
            commentCount: parseInt(t.legacy?.reply_count) || 0,
            shareCount: parseInt(t.legacy?.retweet_count) || 0,
            collectCount: parseInt(t.legacy?.bookmark_count) || 0,
          })));
        }
        break;
      }
      case 'RD': {
        const posts = await tikhubApi.getRedditUserPosts(username);
        if (posts.data?.posts) {
          works.push(...posts.data.posts.map(p => ({
            workId: p.id,
            title: p.title?.slice(0, 100) || '',
            link: `https://www.reddit.com${p.permalink}`,
            publishTime: p.created_utc ? new Date(p.created_utc * 1000).toISOString().split('T')[0] : null,
            playCount: parseInt(p.score) || 0,
            diggCount: parseInt(p.ups) || 0,
            commentCount: parseInt(p.num_comments) || 0,
            shareCount: 0,
            collectCount: 0,
          })));
        }
        break;
      }
      case 'FB': {
        const posts = await tikhubApi.getFacebookUserPosts(username);
        if (posts.data?.posts) {
          works.push(...posts.data.posts.map(p => ({
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
        break;
      }
      default:
        logger.warn('Platform not supported yet', { platformCode });
    }

    return works;
  }

  async getOrCreateDetailTable(projectName, accountName, platformCode) {
    // 从项目管理表查找对应的详情表ID
    // 实际项目中，这里应该有映射关系存储
    // 简化处理：假设详情表名格式为 {项目名}-{账号名}{平台标识}-作品详情
    const tableName = `${projectName.split('-')[0]}-${accountName.replace(/\s+/g, '')}${platformCode}-作品详情`;

    // 这里简化处理，实际应该从配置或数据库中获取
    logger.info('Detail table name resolved', { tableName });
    return null; // TODO: implement table lookup/creation
  }

  async syncWorksToDetailTable(detailTableId, works, accountRecordId) {
    if (!detailTableId || !works.length) return;

    const now = Date.now();
    const records = works.map(work => ({
      '作品ID': String(work.workId),
      '作品标题': work.title,
      '作品链接': work.link,
      '发布时间': work.publishTime,
      '播放量': work.playCount,
      '点赞数': work.diggCount,
      '评论数': work.commentCount,
      '分享数': work.shareCount,
      '收藏数': work.collectCount,
      '数据状态': '正常',
      '同步时间': now,
      '总表记录ID': accountRecordId,
    }));

    await feishuBitable.batchCreateRecords(this.projectMgmtAppToken, detailTableId, records);
  }

  async updateAccountStats(account, planTableId, works) {
    const totalPlayCount = works.reduce((sum, w) => sum + (w.playCount || 0), 0);
    const publishedCount = works.length;

    await feishuBitable.updateRecord(this.projectMgmtAppToken, planTableId, account.record_id, {
      '目前播放量': totalPlayCount,
      '已发布': String(publishedCount),
      '粉丝总量': account.fields['粉丝总量'], // 保持原值
    });
  }

  async updateProjectStats(planTableId, projectRecord) {
    // 获取所有账号的最新数据
    const accounts = await feishuBitable.searchRecords(this.projectMgmtAppToken, planTableId);

    const totalPlayCount = accounts.reduce((sum, a) => sum + (parseInt(a.fields['目前播放量']) || 0), 0);
    const totalPublished = accounts.reduce((sum, a) => sum + (parseInt(a.fields['已发布']) || 0), 0);

    logger.info('Project stats updated', {
      projectName: projectRecord.fields['项目名称'],
      totalPlayCount,
      totalPublished
    });
  }
}

module.exports = new SyncService();
