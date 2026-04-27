const axios = require('axios');
const config = require('../../config');
const feishuAuth = require('./feishu-auth');
const logger = require('../utils/logger');

class FeishuBitableService {
  constructor() {
    this.baseUrl = 'https://open.feishu.cn/open-apis/bitable/v1';
  }

  _shouldRetry(error) {
    if (!error.response) return true; // 网络超时/断开
    const status = error.response.status;
    if (status >= 500 || status === 429) return true;
    return false;
  }

  _chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async request(method, path, data = null, options = {}) {
    const maxRetries = config.sync?.maxRetries || 3;
    const retryDelay = config.sync?.retryDelay || 1000;
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const token = await feishuAuth.getAppToken();
        const url = `${this.baseUrl}${path}`;

        const axiosConfig = {
          method,
          url,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          ...options,
        };

        if (data) {
          axiosConfig.data = data;
        }

        const response = await axios(axiosConfig);
        if (response.data.code !== 0) {
          const isRateLimit = response.data.code === 99991400 || response.data.code === 99991401;
          if (isRateLimit && attempt < maxRetries) {
            logger.warn('Feishu Bitable rate limited, retrying', { method, path, attempt: attempt + 1, code: response.data.code });
            await this._sleep(retryDelay * (attempt + 1));
            continue;
          }
          throw new Error(`Feishu API error: ${response.data.msg} (code: ${response.data.code})`);
        }
        return response.data.data;
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries && this._shouldRetry(error)) {
          logger.warn('Feishu Bitable request failed, retrying', { method, path, attempt: attempt + 1, error: error.message });
          await this._sleep(retryDelay * (attempt + 1));
          continue;
        }
        logger.error('Feishu Bitable request failed', { method, path, error: error.message });
        throw error;
      }
    }

    throw lastError;
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
    const body = { table: { name } };
    if (fields && fields.length > 0) {
      body.table.fields = fields;
    }
    return this.request('POST', `/apps/${appToken}/tables`, body);
  }

  async getTableFields(appToken, tableId) {
    return this.request('GET', `/apps/${appToken}/tables/${tableId}/fields`);
  }

  async createField(appToken, tableId, fieldData) {
    return this.request('POST', `/apps/${appToken}/tables/${tableId}/fields`, fieldData);
  }

  async updateField(appToken, tableId, fieldId, fieldData) {
    return this.request('PUT', `/apps/${appToken}/tables/${tableId}/fields/${fieldId}`, fieldData);
  }

  // === Records ===
  async getRecord(appToken, tableId, recordId) {
    return this.request('GET', `/apps/${appToken}/tables/${tableId}/records/${recordId}`);
  }

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
    if (records.length <= 500) {
      return this.request('POST', `/apps/${appToken}/tables/${tableId}/records/batch_create`, {
        records: records.map(fields => ({ fields })),
      });
    }

    const chunks = this._chunkArray(records, 500);
    const results = [];
    for (let i = 0; i < chunks.length; i++) {
      try {
        const chunkResult = await this.request('POST', `/apps/${appToken}/tables/${tableId}/records/batch_create`, {
          records: chunks[i].map(fields => ({ fields })),
        });
        if (chunkResult) {
          results.push(chunkResult);
        }
      } catch (error) {
        logger.error('Feishu Bitable batchCreateRecords chunk failed', { appToken, tableId, chunkIndex: i, error: error.message });
      }
      if (i < chunks.length - 1) {
        await this._sleep(config.sync?.batchInterval || 500);
      }
    }
    return results;
  }

  async updateRecord(appToken, tableId, recordId, fields) {
    return this.request('PUT', `/apps/${appToken}/tables/${tableId}/records/${recordId}`, {
      fields,
    });
  }

  async batchUpdateRecords(appToken, tableId, records) {
    if (records.length <= 500) {
      return this.request('POST', `/apps/${appToken}/tables/${tableId}/records/batch_update`, {
        records: records.map(r => ({ record_id: r.recordId, fields: r.fields })),
      });
    }

    const chunks = this._chunkArray(records, 500);
    const results = [];
    for (let i = 0; i < chunks.length; i++) {
      try {
        const chunkResult = await this.request('POST', `/apps/${appToken}/tables/${tableId}/records/batch_update`, {
          records: chunks[i].map(r => ({ record_id: r.recordId, fields: r.fields })),
        });
        if (chunkResult) {
          results.push(chunkResult);
        }
      } catch (error) {
        logger.error('Feishu Bitable batchUpdateRecords chunk failed', { appToken, tableId, chunkIndex: i, error: error.message });
      }
      if (i < chunks.length - 1) {
        await this._sleep(config.sync?.batchInterval || 500);
      }
    }
    return results;
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
