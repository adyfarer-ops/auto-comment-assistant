const axios = require('axios');
const config = require('../../config');
const logger = require('../utils/logger');

class VideoExtractionService {
  constructor() {
    this.apiKey = config.henghhengmao?.apiKey;
    this.baseUrl = config.henghhengmao?.baseUrl || 'https://api.henghhengmao.com';
  }

  async extractVideoUrl(shareUrl) {
    if (!this.apiKey) {
      throw new Error('HENGHENGMAO_API_KEY not configured');
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/api/v1/video/parse`,
        { url: shareUrl },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.code !== 0) {
        throw new Error(`HENGHENGMAO API error: ${response.data.msg}`);
      }

      const data = response.data.data;
      logger.info('Video extraction success', { shareUrl: shareUrl.slice(0, 80) });

      return {
        videoUrl: data.video_url,
        coverUrl: data.cover_url,
        title: data.title,
        description: data.description,
        author: data.author,
        platform: data.platform,
        duration: data.duration,
        raw: data,
      };
    } catch (error) {
      logger.error('Video extraction failed', { shareUrl: shareUrl.slice(0, 80), error: error.message });
      throw error;
    }
  }

  async batchExtract(urls) {
    const results = [];
    for (const url of urls) {
      try {
        const result = await this.extractVideoUrl(url);
        results.push({ url, success: true, data: result });
      } catch (error) {
        results.push({ url, success: false, error: error.message });
      }
    }
    return results;
  }
}

module.exports = new VideoExtractionService();
