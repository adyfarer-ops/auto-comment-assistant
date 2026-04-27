const axios = require('axios');
const config = require('../../config');
const logger = require('../utils/logger');

class FeishuAuthService {
  constructor() {
    this.tokens = new Map();
  }

  async getTenantAccessToken(appId, appSecret) {
    const cacheKey = `${appId}`;
    const cached = this.tokens.get(cacheKey);

    if (cached && cached.expireAt > Date.now() + 60000) {
      return cached.token;
    }

    try {
      const response = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
        app_id: appId,
        app_secret: appSecret,
      });

      if (response.data.code !== 0) {
        throw new Error(`Feishu auth error: ${response.data.msg}`);
      }

      const token = response.data.tenant_access_token;
      const expire = response.data.expire || 7200;

      this.tokens.set(cacheKey, {
        token,
        expireAt: Date.now() + expire * 1000,
      });

      return token;
    } catch (error) {
      logger.error('Failed to get tenant access token', { error: error.message });
      throw error;
    }
  }

  async getAppToken() {
    return this.getTenantAccessToken(config.feishu.appId, config.feishu.appSecret);
  }

  async getNotifyAppToken() {
    return this.getTenantAccessToken(config.feishu.notifyAppId, config.feishu.notifyAppSecret);
  }
}

module.exports = new FeishuAuthService();
