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
  async getTikTokUserInfo(username, url = null) {
    try {
      return await this.request('GET', '/api/v1/tiktok/app/v3/get_user_id_and_sec_user_id_by_username', { username });
    } catch (error) {
      if (url && error.response?.status === 400) {
        logger.warn('TikHub app/v3 username lookup failed, falling back to web URL lookup', { username });
        const secUid = await this.getTikTokSecUidByUrl(url);
        if (secUid) {
          return { data: { sec_user_id: secUid } };
        }
      }
      throw error;
    }
  }

  async getTikTokSecUidByUrl(url) {
    try {
      const result = await this.request('GET', '/api/v1/tiktok/web/get_sec_user_id', { url });
      const secUid = result?.data;
      if (secUid && typeof secUid === 'string') {
        return secUid;
      }
      logger.warn('TikHub web URL lookup returned no sec_uid', { url, data: result?.data });
      return null;
    } catch (error) {
      logger.error('TikHub web URL lookup failed', { url, error: error.message });
      return null;
    }
  }

  async getTikTokUserProfile(userId, secUid) {
    return this.request('GET', '/api/v1/tiktok/app/v3/handler_user_profile', { user_id: userId, sec_user_id: secUid });
  }

  async getTikTokUserVideos(username, cursor = 0, url = null) {
    const ids = await this.getTikTokUserInfo(username, url);
    const secUid = ids?.data?.sec_user_id;
    if (!secUid) {
      logger.warn('TikTok secUid not found', { username });
      return { data: { aweme_list: [] } };
    }
    const params = {
      sec_user_id: secUid,
      count: 50,
    };
    if (cursor) {
      params.max_cursor = cursor;
    } else {
      params.cursor = 0;
    }
    return this.request('GET', '/api/v1/tiktok/app/v3/fetch_user_post_videos', params);
  }

  // Instagram (v1 for user info, v3/v2 for posts)
  async getInstagramUserInfo(username) {
    return this.request('GET', '/api/v1/instagram/v1/fetch_user_info_by_username', { username });
  }

  async getInstagramUserPosts(username, after = '') {
    // fetch_user_reels 才有正确的播放量(play_count)，fetch_user_posts 的播放量为 null
    return this.request('GET', '/api/v1/instagram/v2/fetch_user_reels', {
      username,
      pagination_token: after,
      count: 50,
    });
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

  // YouTube (via TikHub) — endpoints removed by TikHub, use youtube-api.js instead
  async getYouTubeChannelInfo(handle) {
    throw new Error('TikHub YouTube endpoints have been removed (404). Use src/services/youtube-api.js instead.');
  }

  async getYouTubeChannelVideos(channelId, pageToken = '') {
    throw new Error('TikHub YouTube endpoints have been removed (404). Use src/services/youtube-api.js instead.');
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

  // Facebook — endpoints removed by TikHub (404)
  async getFacebookUserInfo(username) {
    throw new Error('TikHub Facebook endpoints have been removed (404).');
  }

  async getFacebookUserPosts(username, cursor = '') {
    throw new Error('TikHub Facebook endpoints have been removed (404).');
  }
}

module.exports = new TikHubApiService();
