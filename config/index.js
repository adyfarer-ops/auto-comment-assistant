require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
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
    },
    deepseek: {
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
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
};
