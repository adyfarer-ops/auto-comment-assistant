const logger = require('../utils/logger');

const PLATFORM_PATTERNS = [
  { name: 'TikTok', code: 'TK', regex: /tiktok\.com/i },
  { name: 'YouTube', code: 'YTB', regex: /youtube\.com|youtu\.be/i },
  { name: 'Instagram', code: 'INS', regex: /instagram\.com/i },
  { name: 'X', code: 'X', regex: /x\.com|twitter\.com/i },
  { name: 'Reddit', code: 'RD', regex: /reddit\.com/i },
  { name: 'Facebook', code: 'FB', regex: /facebook\.com/i },
  { name: 'Bilibili', code: 'BILI', regex: /bilibili\.com|b23\.tv/i },
  { name: 'Douyin', code: 'DY', regex: /douyin\.com/i },
  { name: 'Xiaohongshu', code: 'XHS', regex: /xiaohongshu\.com|xhslink\.com/i },
  { name: 'Weibo', code: 'WB', regex: /weibo\.com/i },
  { name: 'Kuaishou', code: 'KS', regex: /kuaishou\.com/i },
];

class PlatformResolver {
  detectPlatform(url) {
    for (const platform of PLATFORM_PATTERNS) {
      if (platform.regex.test(url)) {
        return platform;
      }
    }
    return null;
  }

  detectPlatformFromName(name) {
    const upperName = name.toUpperCase();
    for (const platform of PLATFORM_PATTERNS) {
      if (upperName.includes(platform.code)) {
        return platform;
      }
    }
    return null;
  }

  extractUsername(url, platformCode) {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);

      switch (platformCode) {
        case 'TK': {
          const raw = pathParts.find(p => p.startsWith('@')) || pathParts[0];
          return raw ? raw.replace(/^@/, '') : null;
        }
        case 'YTB':
          return pathParts.find(p => p.startsWith('@')) || pathParts[1];
        case 'INS':
        case 'X':
        case 'FB':
        case 'RD':
          return pathParts[0];
        case 'BILI':
          return pathParts[1];
        case 'DY':
          return pathParts[pathParts.length - 1];
        default:
          return pathParts[0];
      }
    } catch (error) {
      logger.error('Failed to extract username', { url, platformCode, error: error.message });
      return null;
    }
  }
}

module.exports = new PlatformResolver();
