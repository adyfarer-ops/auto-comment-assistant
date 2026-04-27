const feishuBitable = require('./feishu-bitable');
const logger = require('../utils/logger');

class StatsService {
  constructor() {
    this.projectMgmtAppToken = null;
  }

  setProjectMgmtAppToken(token) {
    this.projectMgmtAppToken = token;
  }

  async getProjectStats(planTableId) {
    const accounts = await feishuBitable.searchRecords(this.projectMgmtAppToken, planTableId);

    const stats = {
      totalAccounts: accounts.length,
      totalPublished: 0,
      totalPlayCount: 0,
      totalTargetPlayCount: 0,
      avgCompletionRate: 0,
      avgPublishRate: 0,
      platformBreakdown: {},
      topAccounts: [],
      lowAccounts: [],
    };

    for (const account of accounts) {
      const af = account.fields;
      const published = parseInt(af['已发布']) || 0;
      const playCount = parseInt(af['目前播放量']) || 0;
      const targetPlay = parseInt(af['目标播放量']) || 0;
      const completionRate = parseFloat(af['播放量完成率']) || 0;
      const publishRate = parseFloat(af['发布完成率']) || 0;
      const accountName = af['账号名称'] || '';

      stats.totalPublished += published;
      stats.totalPlayCount += playCount;
      stats.totalTargetPlayCount += targetPlay;

      // Platform breakdown
      const platform = this.extractPlatform(accountName);
      if (!stats.platformBreakdown[platform]) {
        stats.platformBreakdown[platform] = { count: 0, playCount: 0, published: 0 };
      }
      stats.platformBreakdown[platform].count += 1;
      stats.platformBreakdown[platform].playCount += playCount;
      stats.platformBreakdown[platform].published += published;

      // Top/Low accounts
      const accountStats = {
        recordId: account.record_id,
        name: accountName,
        platform,
        published,
        playCount,
        completionRate,
        publishRate,
        responsible: af['负责人'] || '',
      };

      stats.topAccounts.push(accountStats);
      stats.lowAccounts.push(accountStats);
    }

    // Sort top/low
    stats.topAccounts.sort((a, b) => b.playCount - a.playCount);
    stats.lowAccounts.sort((a, b) => a.playCount - a.playCount);

    // Calculate averages
    if (accounts.length > 0) {
      stats.avgCompletionRate = (stats.topAccounts.reduce((sum, a) => sum + a.completionRate, 0) / accounts.length);
      stats.avgPublishRate = (stats.topAccounts.reduce((sum, a) => sum + a.publishRate, 0) / accounts.length);
    }

    // Overall completion rate
    stats.overallCompletionRate = stats.totalTargetPlayCount > 0
      ? stats.totalPlayCount / stats.totalTargetPlayCount
      : 0;

    logger.info('Project stats calculated', {
      planTableId,
      totalAccounts: stats.totalAccounts,
      totalPlayCount: stats.totalPlayCount,
    });

    return stats;
  }

  async getAccountStats(planTableId, recordId) {
    const records = await feishuBitable.searchRecords(
      this.projectMgmtAppToken,
      planTableId,
      `CurrentValue.[ID] = "${recordId}"`
    );

    if (records.length === 0) {
      throw new Error('Account not found');
    }

    const account = records[0];
    const af = account.fields;

    return {
      recordId: account.record_id,
      name: af['账号名称'],
      platform: this.extractPlatform(af['账号名称']),
      published: parseInt(af['已发布']) || 0,
      playCount: parseInt(af['目前播放量']) || 0,
      targetPlayCount: parseInt(af['目标播放量']) || 0,
      completionRate: parseFloat(af['播放量完成率']) || 0,
      publishRate: parseFloat(af['发布完成率']) || 0,
      avgPlayCount: parseFloat(af['稿均']) || 0,
      followers: parseInt(af['粉丝总量']) || 0,
      responsible: af['负责人'] || '',
    };
  }

  extractPlatform(accountName) {
    const platforms = ['TikTok', 'YouTube', 'Instagram', 'X', 'Reddit', 'Facebook', 'Bilibili', 'Douyin'];
    for (const p of platforms) {
      if (accountName.includes(p)) return p;
    }
    return 'Unknown';
  }
}

module.exports = new StatsService();
