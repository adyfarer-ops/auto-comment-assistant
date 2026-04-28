const axios = require('axios');
const config = require('../../config');
const logger = require('../utils/logger');
const { createProxyAgent } = require('../utils/proxy');

class TikHubApiService {
  constructor() {
    this.client = axios.create({
      baseURL: config.tikhub.baseUrl,
      headers: {
        Authorization: `Bearer ${config.tikhub.apiKey}`,
      },
      timeout: 30000,
    });

    const agent = createProxyAgent();
    if (agent) {
      this.client.defaults.httpsAgent = agent;
    }
  }

  _shouldRetry(error) {
    if (!error.response) return true; // 网络超时/断开
    const status = error.response.status;
    if (status >= 500 || status === 429) return true;
    // 偶发性 400（速率限制或抖动）也允许有限重试
    if (status === 400) return true;
    return false;
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async request(method, path, params = null, data = null) {
    const maxRetries = config.sync?.maxRetries || 3;
    const retryDelay = config.sync?.retryDelay || 1000;
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.client.request({ method, url: path, params, data });
        return response.data;
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries && this._shouldRetry(error)) {
          logger.warn('TikHub API request failed, retrying', { method, path, attempt: attempt + 1, error: error.message });
          await this._sleep(retryDelay * (attempt + 1));
          continue;
        }
        logger.error('TikHub API request failed', { method, path, error: error.message });
        throw error;
      }
    }

    throw lastError;
  }

  // TikTok (app/v3 endpoints aligned with old project)
  async getTikTokUserInfo(username) {
    return this.request('GET', '/api/v1/tiktok/app/v3/get_user_id_and_sec_user_id_by_username', { username });
  }

  async getTikTokUserProfile(userId, secUid) {
    return this.request('GET', '/api/v1/tiktok/app/v3/handler_user_profile', { user_id: userId, sec_user_id: secUid });
  }

  async getTikTokUserVideos(username, cursor = 0) {
    const ids = await this.getTikTokUserInfo(username);
    const secUid = ids?.data?.sec_user_id;
    if (!secUid) {
      logger.warn('TikTok secUid not found', { username });
      return { data: { aweme_list: [] } };
    }
    return this.request('GET', '/api/v1/tiktok/app/v3/fetch_user_post_videos', {
      sec_user_id: secUid,
      cursor,
      count: 50,
    });
  }

  // Instagram (v3 primary, v2 fallback)
  async getInstagramUserInfo(username) {
    return this.request('GET', '/api/v1/instagram/v3/get_user_profile', { username });
  }

  async getInstagramUserPosts(username, after = '') {
    try {
      return this.request('GET', '/api/v1/instagram/v3/get_user_posts', {
        username,
        after,
        count: 50,
      });
    } catch (error) {
      logger.warn('Instagram v3 failed, falling back to v2', { username, error: error.message });
      return this.request('GET', '/api/v1/instagram/v2/fetch_user_posts', {
        username,
        pagination_token: after,
        count: 50,
      });
    }
  }

  // X (Twitter)
  async getXUserInfo(username) {
    return this.request('GET', '/api/v1/twitter/web/fetch_user_profile', { screen_name: username });
  }

  async getXUserTweets(username, cursor = '') {
    return this.request('GET', '/api/v1/twitter/web/fetch_user_post_tweet', {
      screen_name: username,
      cursor,
    });
  }

  // YouTube (via TikHub)
  async getYouTubeChannelInfo(handle) {
    return this.request('GET', '/api/v1/youtube/web/fetch_channel_info', { handle });
  }

  async getYouTubeChannelVideos(channelId, pageToken = '') {
    return this.request('GET', '/api/v1/youtube/web/fetch_channel_videos', {
      channel_id: channelId,
      page_token: pageToken,
      max_results: 50,
    });
  }

  // Reddit
  async getRedditUserInfo(username) {
    return this.request('GET', '/api/v1/reddit/app/fetch_user_profile', { username });
  }

  async getRedditUserPosts(username, after = '') {
    return this.request('GET', '/api/v1/reddit/app/fetch_user_posts', {
      username,
      after,
      limit: 25,
    });
  }

  // Facebook
  async getFacebookUserInfo(username) {
    return this.request('GET', '/api/v1/facebook/web/fetch_user_profile', { username });
  }

  async getFacebookUserPosts(username, cursor = '') {
    return this.request('GET', '/api/v1/facebook/web/fetch_user_posts', {
      username,
      cursor,
      count: 25,
    });
  }
}

module.exports = new TikHubApiService();
