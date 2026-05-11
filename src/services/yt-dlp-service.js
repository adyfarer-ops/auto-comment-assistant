const { spawn } = require('child_process');
const logger = require('../utils/logger');
const config = require('../../config');

class YtDlpService {
  constructor() {
    this.proxy = config.proxy?.httpsProxy;
  }

  _buildArgs(url, options = {}) {
    const args = [
      '--flat-playlist',
      '--print-json',
      '--no-download',
      '--skip-download',
      '--ignore-errors',
      '--no-warnings',
    ];

    if (this.proxy) {
      args.push('--proxy', this.proxy);
    }

    const { maxItems = 200, startDate, endDate } = options;
    if (maxItems) {
      args.push('--playlist-items', `1-${maxItems}`);
    }

    if (startDate) {
      args.push('--dateafter', this._formatDateArg(startDate));
    }
    if (endDate) {
      args.push('--datebefore', this._formatDateArg(endDate));
    }

    args.push(url);
    return args;
  }

  _formatDateArg(date) {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }

  async _runYtDlp(url, options = {}) {
    return new Promise((resolve, reject) => {
      const args = this._buildArgs(url, options);
      logger.info('[YtDlp] Starting extraction', { url, args: args.filter(a => !a.includes('://')) });

      const proc = spawn('yt-dlp', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 120000,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0 && code !== null) {
          logger.warn('[YtDlp] exited with non-zero code', { code, stderr: stderr.slice(0, 500) });
        }

        const lines = stdout.split('\n').filter(line => line.trim());
        const results = [];
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            results.push(data);
          } catch (e) {
            // Ignore non-JSON lines
          }
        }

        logger.info('[YtDlp] Extraction complete', { url, count: results.length });
        resolve(results);
      });

      proc.on('error', (err) => {
        logger.error('[YtDlp] Spawn failed', { url, error: err.message });
        reject(err);
      });
    });
  }

  async getFacebookPageVideos(username, options = {}) {
    const url = `https://www.facebook.com/${username}/videos`;
    const rawItems = await this._runYtDlp(url, options);

    return rawItems.map(item => {
      const publishTime = item.timestamp ? new Date(item.timestamp * 1000) : null;
      return {
        workId: item.id || '',
        title: item.title || item.description?.slice(0, 100) || '',
        link: item.webpage_url || `https://www.facebook.com/${username}/videos/${item.id}`,
        publishTime: publishTime ? publishTime.toISOString().split('T')[0] : null,
        playCount: parseInt(item.view_count) || 0,
        diggCount: parseInt(item.like_count) || parseInt(item.reactions?.count) || 0,
        commentCount: parseInt(item.comment_count) || 0,
        shareCount: parseInt(item.repost_count) || 0,
        collectCount: 0,
      };
    });
  }

  async getVideosByUrl(url, options = {}) {
    const rawItems = await this._runYtDlp(url, options);

    return rawItems.map(item => {
      const publishTime = item.timestamp ? new Date(item.timestamp * 1000) : null;
      return {
        workId: item.id || '',
        title: item.title || item.description?.slice(0, 100) || '',
        link: item.webpage_url || item.url || '',
        publishTime: publishTime ? publishTime.toISOString().split('T')[0] : null,
        playCount: parseInt(item.view_count) || 0,
        diggCount: parseInt(item.like_count) || parseInt(item.reactions?.count) || 0,
        commentCount: parseInt(item.comment_count) || 0,
        shareCount: parseInt(item.repost_count) || 0,
        collectCount: 0,
      };
    });
  }
}

module.exports = new YtDlpService();
