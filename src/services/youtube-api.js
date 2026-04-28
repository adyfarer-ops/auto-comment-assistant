const axios = require('axios');
const config = require('../../config');
const logger = require('../utils/logger');
const { createProxyAgent } = require('../utils/proxy');

class YouTubeApiService {
  constructor() {
    this.apiKey = config.youtube.apiKey;
    this.baseUrl = 'https://www.googleapis.com/youtube/v3';
    this.agent = createProxyAgent();
  }

  async request(path, params = {}) {
    try {
      const response = await axios.get(`${this.baseUrl}${path}`, {
        params: { ...params, key: this.apiKey },
        timeout: 30000,
        httpsAgent: this.agent,
      });
      return response.data;
    } catch (error) {
      logger.error('YouTube API request failed', { path, error: error.message });
      throw error;
    }
  }

  async getChannelByHandle(handle) {
    // handle should be like @ChannelName
    const handleQuery = handle.startsWith('@') ? handle : `@${handle}`;
    const data = await this.request('/channels', {
      part: 'snippet,statistics,contentDetails',
      forHandle: handleQuery,
    });
    return data.items?.[0] || null;
  }

  async getChannelById(channelId) {
    const data = await this.request('/channels', {
      part: 'snippet,statistics,contentDetails',
      id: channelId,
    });
    return data.items?.[0] || null;
  }

  async getVideos(uploadsPlaylistId, pageToken = '') {
    const data = await this.request('/playlistItems', {
      part: 'snippet,contentDetails',
      playlistId: uploadsPlaylistId,
      maxResults: 50,
      pageToken,
    });
    return data;
  }

  async getVideoStatistics(videoIds) {
    const ids = Array.isArray(videoIds) ? videoIds.join(',') : videoIds;
    const data = await this.request('/videos', {
      part: 'statistics,snippet',
      id: ids,
    });
    return data.items || [];
  }
}

module.exports = new YouTubeApiService();
