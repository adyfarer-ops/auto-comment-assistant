const axios = require('axios');
const feishuAuth = require('./feishu-auth');
const logger = require('../utils/logger');

class NotifyService {
  constructor() {
    this.baseUrl = 'https://open.feishu.cn/open-apis/im/v1';
  }

  async sendMessage(chatId, content) {
    try {
      const token = await feishuAuth.getNotifyAppToken();

      const response = await axios.post(`${this.baseUrl}/messages`, {
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text: content }),
      }, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        params: { receive_id_type: 'chat_id' },
      });

      if (response.data.code !== 0) {
        throw new Error(`Send message failed: ${response.data.msg}`);
      }

      logger.info('Message sent', { chatId });
      return response.data.data;
    } catch (error) {
      logger.error('Failed to send message', { chatId, error: error.message });
      throw error;
    }
  }

  async sendProjectSyncResult(chatId, projectName, result) {
    const text = `📊 **${projectName}** 同步完成\n\n` +
      `✅ 账号数: ${result.accountsCount}\n` +
      `⏱️ 时间: ${new Date().toLocaleString('zh-CN')}`;

    return this.sendMessage(chatId, text);
  }

  async sendWeeklyReportResult(projectName, result) {
    const chatId = process.env.NOTIFY_CHAT_ID;
    if (!chatId) {
      logger.warn('NOTIFY_CHAT_ID not set, skipping weekly report notification');
      return;
    }

    let text = `📋 **${projectName}** 周报已生成\n\n` +
      `✅ 账号数: ${result.accountsCount}\n` +
      `📝 总发布数: ${result.totalPublished}\n` +
      `▶️ 总播放量: ${result.totalPlayCount}\n` +
      `📈 平均完成率: ${result.avgCompletionRate}\n` +
      `⏱️ 时间: ${new Date().toLocaleString('zh-CN')}`;

    if (result.docUrl) {
      text += `\n\n📄 文档链接: ${result.docUrl}`;
    }

    return this.sendMessage(chatId, text);
  }

  async sendError(chatId, projectName, error) {
    const text = `❌ **${projectName}** 同步失败\n\n` +
      `错误信息: ${error.message}\n` +
      `时间: ${new Date().toLocaleString('zh-CN')}`;

    return this.sendMessage(chatId, text);
  }
}

module.exports = new NotifyService();
