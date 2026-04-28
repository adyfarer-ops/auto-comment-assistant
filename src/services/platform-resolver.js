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

  getPlatformName(code) {
    const platform = PLATFORM_PATTERNS.find(p => p.code === code);
    return platform ? platform.name : code;
  }

  extractUsername(url, platformCode) {
    try {
      const urlObj = new URL(url);
      urlObj.search = ''; // 去掉查询参数
      urlObj.hash = '';   // 去掉 hash
      const pathParts = urlObj.pathname.split('/').filter(Boolean);

      switch (platformCode) {
        case 'TK': {
          const raw = pathParts.find(p => p.startsWith('@')) || pathParts[0];
          return raw ? raw.replace(/^@/, '') : null;
        }
        case 'YTB': {
          const cleanPath = urlObj.pathname.replace(/^\/c\/|^\/channel\//, '');
          const parts = cleanPath.split('/').filter(Boolean);
          return parts.find(p => p.startsWith('@')) || parts[0];
        }
        case 'INS':
        case 'X':
        case 'FB':
          return pathParts[0];
        case 'RD': {
          const redditUser = pathParts.find((_, i) => pathParts[i - 1] === 'user' || pathParts[i - 1] === 'u');
          return redditUser || pathParts[0];
        }
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
