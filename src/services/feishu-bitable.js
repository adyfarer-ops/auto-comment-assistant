const axios = require('axios');
const feishuAuth = require('./feishu-auth');
const logger = require('../utils/logger');

class FeishuBitableService {
  constructor() {
    this.baseUrl = 'https://open.feishu.cn/open-apis/bitable/v1';
  }

  async request(method, path, data = null, options = {}) {
    const token = await feishuAuth.getAppToken();
    const url = `${this.baseUrl}${path}`;

    const config = {
      method,
      url,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      ...options,
    };

    if (data) {
      config.data = data;
    }

    try {
      const response = await axios(config);
      if (response.data.code !== 0) {
        throw new Error(`Feishu API error: ${response.data.msg} (code: ${response.data.code})`);
      }
      return response.data.data;
    } catch (error) {
      logger.error('Feishu Bitable request failed', { method, path, error: error.message });
      throw error;
    }
  }

  // === App (Base) ===
  async listApps() {
    return this.request('GET', '/apps');
  }

  async getAppTables(appToken) {
    return this.request('GET', `/apps/${appToken}/tables`);
  }

  // === Table ===
  async createTable(appToken, name, fields = []) {
    return this.request('POST', `/apps/${appToken}/tables`, {
      table: { name, fields },
    });
  }

  async getTableFields(appToken, tableId) {
    return this.request('GET', `/apps/${appToken}/tables/${tableId}/fields`);
  }

  // === Records ===
  async listRecords(appToken, tableId, options = {}) {
    const params = new URLSearchParams();
    if (options.filter) params.append('filter', options.filter);
    if (options.pageSize) params.append('page_size', options.pageSize);
    if (options.pageToken) params.append('page_token', options.pageToken);
    if (options.viewId) params.append('view_id', options.viewId);
    if (options.fieldNames) params.append('field_names', JSON.stringify(options.fieldNames));

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request('GET', `/apps/${appToken}/tables/${tableId}/records${query}`);
  }

  async createRecord(appToken, tableId, fields) {
    return this.request('POST', `/apps/${appToken}/tables/${tableId}/records`, {
      fields,
    });
  }

  async batchCreateRecords(appToken, tableId, records) {
    return this.request('POST', `/apps/${appToken}/tables/${tableId}/records/batch_create`, {
      records: records.map(fields => ({ fields })),
    });
  }

  async updateRecord(appToken, tableId, recordId, fields) {
    return this.request('PUT', `/apps/${appToken}/tables/${tableId}/records/${recordId}`, {
      fields,
    });
  }

  async batchUpdateRecords(appToken, tableId, records) {
    return this.request('POST', `/apps/${appToken}/tables/${tableId}/records/batch_update`, {
      records: records.map(r => ({ record_id: r.recordId, fields: r.fields })),
    });
  }

  async deleteRecord(appToken, tableId, recordId) {
    return this.request('DELETE', `/apps/${appToken}/tables/${tableId}/records/${recordId}`);
  }

  async searchRecords(appToken, tableId, filter) {
    const allRecords = [];
    let pageToken = null;

    do {
      const result = await this.listRecords(appToken, tableId, {
        filter,
        pageSize: 500,
        pageToken,
      });

      if (result.items) {
        allRecords.push(...result.items);
      }
      pageToken = result.page_token;
    } while (pageToken);

    return allRecords;
  }
}

module.exports = new FeishuBitableService();
