const axios = require('axios');
const feishuAuth = require('./feishu-auth');
const logger = require('../utils/logger');

class FeishuSpreadsheetService {
  constructor() {
    this.baseUrl = 'https://open.feishu.cn/open-apis/sheets/v2/spreadsheets';
  }

  async request(method, spreadsheetToken, path, data = null) {
    const token = await feishuAuth.getAppToken();
    const url = `${this.baseUrl}/${spreadsheetToken}${path}`;

    try {
      const response = await axios({
        method,
        url,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        data,
      });

      if (response.data.code !== 0) {
        throw new Error(`Spreadsheet API error: ${response.data.msg} (code: ${response.data.code})`);
      }

      return response.data.data;
    } catch (error) {
      logger.error('Spreadsheet request failed', { method, path, error: error.message });
      throw error;
    }
  }

  async writeValues(spreadsheetToken, range, values) {
    return this.request('PUT', spreadsheetToken, `/values/${range}`, {
      valueRange: {
        range,
        values,
      },
    });
  }

  async appendValues(spreadsheetToken, range, values) {
    return this.request('POST', spreadsheetToken, `/values/${range}?insertDataOption=INSERT_ROWS&valueInputOption=RAW`, {
      valueRange: {
        range,
        values,
      },
    });
  }

  async getSheetMetadata(spreadsheetToken) {
    return this.request('GET', spreadsheetToken, '/metainfo');
  }
}

module.exports = new FeishuSpreadsheetService();
