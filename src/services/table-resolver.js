const feishuBitable = require('./feishu-bitable');
const platformResolver = require('./platform-resolver');
const logger = require('../utils/logger');

class TableResolver {
  constructor() {
    this.projectMgmtAppToken = null;
    this.cache = new Map();
    this.cacheTtl = 5 * 60 * 1000; // 5 minutes
  }

  setProjectMgmtAppToken(token) {
    this.projectMgmtAppToken = token;
  }

  async resolveDetailTable(projectName, accountName, platformCode) {
    const prefix = projectName.split('-')[0];
    const normalizedAccount = accountName.replace(/\s+/g, '');
    const shortName = `${prefix}-${normalizedAccount}${platformCode}-作品详情`;
    const fullName = `${prefix}-${normalizedAccount}${platformResolver.getPlatformName(platformCode)}-作品详情`;

    const cached = this.getCached(shortName) || this.getCached(fullName);
    if (cached) return cached;

    try {
      const tables = await feishuBitable.getAppTables(this.projectMgmtAppToken);
      const items = tables.items || tables;
      let matched = items.find(t => t.name === shortName);
      if (!matched) {
        matched = items.find(t => t.name === fullName);
      }

      if (matched) {
        this.setCached(shortName, matched.table_id);
        this.setCached(fullName, matched.table_id);
        return matched.table_id;
      }

      logger.warn('Detail table not found', { shortName, fullName });
      return null;
    } catch (error) {
      logger.error('Failed to resolve detail table', { shortName, fullName, error: error.message });
      return null;
    }
  }

  async findTablesByPattern(pattern) {
    try {
      const tables = await feishuBitable.getAppTables(this.projectMgmtAppToken);
      const items = tables.items || tables;
      const regex = new RegExp(pattern);
      return items.filter(t => regex.test(t.name));
    } catch (error) {
      logger.error('Failed to find tables by pattern', { pattern, error: error.message });
      return [];
    }
  }

  async getTableSchema(tableId) {
    try {
      const fields = await feishuBitable.getTableFields(this.projectMgmtAppToken, tableId);
      return fields.items || fields;
    } catch (error) {
      logger.error('Failed to get table schema', { tableId, error: error.message });
      return null;
    }
  }

  getCached(key) {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.time < this.cacheTtl) {
      return entry.value;
    }
    this.cache.delete(key);
    return null;
  }

  setCached(key, value) {
    this.cache.set(key, { value, time: Date.now() });
  }
}

module.exports = new TableResolver();
