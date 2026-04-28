require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3456,
  nodeEnv: process.env.NODE_ENV || 'development',

  feishu: {
    appId: process.env.FEISHU_APP_ID,
    appSecret: process.env.FEISHU_APP_SECRET,
    notifyAppId: process.env.FEISHU_NOTIFY_APP_ID,
    notifyAppSecret: process.env.FEISHU_NOTIFY_APP_SECRET,
  },

  tikhub: {
    apiKey: process.env.TIKHUB_API_KEY,
    baseUrl: process.env.TIKHUB_BASE_URL || 'https://api.tikhub.io',
  },

  youtube: {
    apiKey: process.env.YOUTUBE_API_KEY,
  },

  ai: {
    moonshot: {
      apiKey: process.env.MOONSHOT_API_KEY,
      baseUrl: 'https://api.moonshot.cn/v1',
    },
    doubao: {
      apiKey: process.env.DOUBAO_API_KEY,
      baseUrl: process.env.DOUBAO_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
      model: process.env.DOUBAO_MODEL || 'doubao-seed-2-0-lite-260215',
    },
    deepseek: {
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    },
    videoAnalysis: {
      apiKey: process.env.VIDEO_ANALYSIS_API_KEY,
      baseUrl: process.env.VIDEO_ANALYSIS_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
    },
  },

  proxy: {
    httpsProxy: process.env.HTTPS_PROXY,
  },

  project: {
    managementTableToken: process.env.PROJECT_MANAGEMENT_TABLE_TOKEN,
  },

  henghhengmao: {
    apiKey: process.env.HENGHENGMAO_API_KEY,
    baseUrl: process.env.HENGHENGMAO_BASE_URL || 'https://api.henghhengmao.com',
  },

  notify: {
    chatId: process.env.NOTIFY_CHAT_ID,
  },

  sync: {
    maxRetries: 3,
    retryDelay: 1000,
    batchInterval: 500,
    queueConcurrency: 1,
  },
};

function validate() {
  const missing = [];
  if (!module.exports.feishu.appId) missing.push('FEISHU_APP_ID');
  if (!module.exports.feishu.appSecret) missing.push('FEISHU_APP_SECRET');
  if (!module.exports.tikhub.apiKey) missing.push('TIKHUB_API_KEY');
  if (missing.length > 0) {
    console.warn(`[CONFIG WARN] Missing env vars: ${missing.join(', ')}. Related features may be disabled.`);
  }
}
validate();
