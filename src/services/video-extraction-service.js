const axios = require('axios');
const config = require('../../config');
const logger = require('../utils/logger');

class VideoExtractionService {
  constructor() {
    this.apiKey = config.meowload?.apiKey || config.henghhengmao?.apiKey;
    this.baseUrl = config.meowload?.baseUrl || 'https://api.meowload.net';
  }

  async extractVideoUrl(shareUrl) {
    if (!this.apiKey) {
      throw new Error('MEOWLOAD_API_KEY not configured');
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/openapi/extract/post`,
        { url: shareUrl },
        {
          headers: {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json',
            'accept-language': 'zh',
          },
          timeout: 30000,
        }
      );

      const data = response.data;
      if (!data.medias || data.medias.length === 0) {
        throw new Error('MEOWLOAD API returned no media');
      }

      const videoMedia = data.medias.find(m => m.media_type === 'video');
      if (!videoMedia) {
        throw new Error('MEOWLOAD API returned no video media');
      }

      logger.info('Video extraction success', { shareUrl: shareUrl.slice(0, 80) });

      return {
        videoUrl: videoMedia.resource_url,
        coverUrl: videoMedia.preview_url,
        title: data.text || '',
        description: data.text || '',
        author: '',
        platform: this._detectPlatform(shareUrl),
        duration: videoMedia.duration || 0,
        raw: data,
      };
    } catch (error) {
      logger.error('Video extraction failed', { shareUrl: shareUrl.slice(0, 80), error: error.message });
      throw error;
    }
  }

  _detectPlatform(shareUrl) {
    const url = (shareUrl || '').toLowerCase();
    if (url.includes('tiktok')) return 'TikTok';
    if (url.includes('youtube') || url.includes('youtu.be')) return 'YouTube';
    if (url.includes('instagram')) return 'Instagram';
    if (url.includes('x.com') || url.includes('twitter')) return 'X';
    if (url.includes('reddit')) return 'Reddit';
    if (url.includes('facebook')) return 'Facebook';
    return 'Unknown';
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
