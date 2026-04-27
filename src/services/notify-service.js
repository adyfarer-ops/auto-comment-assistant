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

  async sendInteractiveCard(chatId, card) {
    try {
      const token = await feishuAuth.getNotifyAppToken();

      const response = await axios.post(`${this.baseUrl}/messages`, {
        receive_id: chatId,
        msg_type: 'interactive',
        content: JSON.stringify({ card }),
      }, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        params: { receive_id_type: 'chat_id' },
      });

      if (response.data.code !== 0) {
        throw new Error(`Send interactive card failed: ${response.data.msg}`);
      }

      logger.info('Interactive card sent', { chatId });
      return response.data.data;
    } catch (error) {
      logger.error('Failed to send interactive card', { chatId, error: error.message });
      throw error;
    }
  }

  async sendProjectSyncResult(chatId, projectName, result) {
    const time = new Date().toLocaleString('zh-CN');
    const card = {
      header: {
        title: { tag: 'plain_text', content: `📊 同步完成 | ${projectName}` },
        template: 'green',
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**账号数：**${result.accountsCount || 0}`,
          },
        },
        {
          tag: 'note',
          elements: [{ tag: 'plain_text', content: `⏱️ ${time}` }],
        },
      ],
    };

    return this.sendInteractiveCard(chatId, card);
  }

  async sendWeeklyReportResult(projectName, result) {
    const chatId = process.env.NOTIFY_CHAT_ID;
    if (!chatId) {
      logger.warn('NOTIFY_CHAT_ID not set, skipping weekly report notification');
      return;
    }

    const time = new Date().toLocaleString('zh-CN');
    let mdContent = `**账号数：**${result.accountsCount || 0}\n` +
      `**总发布数：**${result.totalPublished || 0}\n` +
      `**总播放量：**${result.totalPlayCount || 0}\n` +
      `**平均完成率：**${result.avgCompletionRate || 0}`;

    if (result.docUrl) {
      mdContent += `\n\n**文档链接：**${result.docUrl}`;
    }

    const card = {
      header: {
        title: { tag: 'plain_text', content: `📋 周报已生成 | ${projectName}` },
        template: 'blue',
      },
      elements: [
        {
          tag: 'div',
          text: { tag: 'lark_md', content: mdContent },
        },
        {
          tag: 'note',
          elements: [{ tag: 'plain_text', content: `⏱️ ${time}` }],
        },
      ],
    };

    return this.sendInteractiveCard(chatId, card);
  }

  async sendError(chatId, projectName, error) {
    const time = new Date().toLocaleString('zh-CN');
    const card = {
      header: {
        title: { tag: 'plain_text', content: `❌ 同步失败 | ${projectName}` },
        template: 'red',
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**错误信息：**${error.message || '未知错误'}`,
          },
        },
        {
          tag: 'note',
          elements: [{ tag: 'plain_text', content: `⏱️ ${time}` }],
        },
      ],
    };

    return this.sendInteractiveCard(chatId, card);
  }

  async sendSyncResult(projectName, status, options = {}) {
    const chatId = process.env.NOTIFY_CHAT_ID;
    if (!chatId) {
      logger.warn('NOTIFY_CHAT_ID not set, skipping sync notification');
      return;
    }

    const { traceId, accountsCount, totalWorks, totalErrors, errorMessage, triggerSource, startDate, endDate } = options;
    const time = new Date().toLocaleString('zh-CN');

    let titleText;
    let templateColor;
    let mdContent;

    if (status === '成功') {
      titleText = `✅ 同步成功 | ${projectName}`;
      templateColor = 'green';
      mdContent = `**账号数：**${accountsCount || 0}\n` +
        `**作品数：**${totalWorks || 0}\n` +
        `**失败数：**${totalErrors || 0}`;
    } else {
      titleText = `❌ 同步失败 | ${projectName}`;
      templateColor = 'red';
      mdContent = `**错误：**${errorMessage || '未知错误'}`;
    }

    // 日期范围（参考旧设计格式：项目名称（开始日期 ~ 结束日期））
    let headerTitle = titleText;
    if (startDate && endDate) {
      headerTitle = `${titleText}（${startDate} ~ ${endDate}）`;
    }

    const card = {
      header: {
        title: { tag: 'plain_text', content: headerTitle },
        template: templateColor,
      },
      elements: [
        {
          tag: 'div',
          text: { tag: 'lark_md', content: mdContent },
        },
        { tag: 'hr' },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**来源：**${triggerSource || 'API'}\n**traceId：**${traceId || ''}`,
          },
        },
        {
          tag: 'note',
          elements: [{ tag: 'plain_text', content: `⏱️ ${time}` }],
        },
      ],
    };

    return this.sendInteractiveCard(chatId, card);
  }
}

module.exports = new NotifyService();
