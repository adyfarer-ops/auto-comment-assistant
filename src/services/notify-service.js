const axios = require('axios');
const feishuAuth = require('./feishu-auth');
const logger = require('../utils/logger');
const aiService = require('./ai-service');

class NotifyService {
  constructor() {
    this.baseUrl = 'https://open.feishu.cn/open-apis/im/v1';
    this.notificationCache = new Map();
    this.dedupTtlMs = 5 * 60 * 1000; // 5 minutes
  }

  _shouldSendNotification(key) {
    const lastSent = this.notificationCache.get(key);
    if (lastSent && Date.now() - lastSent < this.dedupTtlMs) {
      return false;
    }
    this.notificationCache.set(key, Date.now());
    return true;
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
        content: JSON.stringify(card),
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
      const responseBody = error.response?.data;
      logger.error('Failed to send interactive card', { chatId, error: error.message, responseBody });
      throw error;
    }
  }

  async sendProjectSyncResult(chatId, projectName, result) {
    const time = new Date().toLocaleString('zh-CN');
    const card = {
      schema: '2.0',
      config: { wide_screen_mode: true },
      header: {
        title: { tag: 'plain_text', content: `📊 同步完成 | ${projectName}` },
        template: 'green',
      },
      body: {
        elements: [
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**账号数：**${result.accountsCount || 0}`,
            },
          },
          {
            tag: 'div',
            text: { tag: 'plain_text', content: `⏱️ ${time}` },
          },
        ],
      },
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
      schema: '2.0',
      config: { wide_screen_mode: true },
      header: {
        title: { tag: 'plain_text', content: `📋 周报已生成 | ${projectName}` },
        template: 'blue',
      },
      body: {
        elements: [
          {
            tag: 'div',
            text: { tag: 'lark_md', content: mdContent },
          },
          {
            tag: 'div',
            text: { tag: 'plain_text', content: `⏱️ ${time}` },
          },
        ],
      },
    };

    return this.sendInteractiveCard(chatId, card);
  }

  async sendError(chatId, projectName, error) {
    const time = new Date().toLocaleString('zh-CN');
    const card = {
      schema: '2.0',
      config: { wide_screen_mode: true },
      header: {
        title: { tag: 'plain_text', content: `❌ 同步失败 | ${projectName}` },
        template: 'red',
      },
      body: {
        elements: [
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**错误信息：**${error.message || '未知错误'}`,
            },
          },
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `⏱️ ${time}`,
            },
          },
        ],
      },
    };

    return this.sendInteractiveCard(chatId, card);
  }

  async sendSyncResult(projectName, status, options = {}) {
    const chatId = process.env.NOTIFY_CHAT_ID;
    if (!chatId) {
      logger.warn('NOTIFY_CHAT_ID not set, skipping sync notification');
      return;
    }

    const dedupKey = `sync:${projectName}:${status}`;
    if (!this._shouldSendNotification(dedupKey)) {
      logger.info('Skipping duplicate sync notification', { projectName, status, dedupKey });
      return;
    }

    const { traceId, accountsCount, totalWorks, totalErrors, errorMessage, triggerSource, startDate, endDate, versionProgress, accountStats } = options;

    // 如果提供了详细的账号统计，使用旧项目格式的文本通知
    if (status === '成功' && accountStats && accountStats.length > 0) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const dateStr = `${year}年${month}月${day}日`;
      const progressPercent = versionProgress !== undefined && versionProgress !== null
        ? (versionProgress * 100).toFixed(2)
        : '0.00';

      let header = projectName;
      if (startDate && endDate) {
        header += `（${startDate} ~ ${endDate}）`;
      }
      header += `\n更新日期：${dateStr}  版本进度：${progressPercent}%\n`;

      // 计算视觉宽度（中文字符算2，英文算1），用于空格填充对齐
      const visualWidth = (str) => {
        let len = 0;
        for (const ch of str) {
          len += (ch.charCodeAt(0) > 127) ? 2 : 1;
        }
        return len;
      };

      const maxNameLen = Math.max(...accountStats.map(s => visualWidth(`${s.accountName}[${s.platformCode}]`)));

      const lines = [];
      for (const stat of accountStats) {
        const name = `${stat.accountName}[${stat.platformCode}]`;
        const nameVisLen = visualWidth(name);
        const padLen = Math.max(1, maxNameLen - nameVisLen + 4);
        const padding = ' '.repeat(padLen);

        const publishRate = stat.targetPublished > 0 ? (stat.publishedCount / stat.targetPublished * 100).toFixed(2) : '0.00';
        const playRate = stat.targetPlayCount > 0 ? (stat.totalPlayCount / stat.targetPlayCount * 100).toFixed(2) : '0.00';

        const playCountStr = stat.totalPlayCount.toLocaleString();
        const targetPlayStr = stat.targetPlayCount.toLocaleString();

        const line = `${name}${padding}| 发布  ${stat.publishedCount}/${stat.targetPublished}(${publishRate}%) | 播放  ${playCountStr}/${targetPlayStr}(${playRate}%)`;
        lines.push(line);
      }

      // 调用 AI 生成建议
      let suggestions = '\n建议：\n';
      try {
        const prompt = `请为以下游戏海外社媒运营项目生成简短的运营建议（3-5条，每条一行用「-」开头）：\n\n项目名称: ${projectName}\n版本进度: ${progressPercent}%\n\n各账号数据:\n${lines.join('\n')}\n\n请从数据表现、内容策略、发布节奏、风险预警等维度给出简洁建议。`;
        const aiResult = await aiService.callAnyProvider(prompt);
        suggestions += aiResult.trim();
      } catch (aiError) {
        logger.warn('AI suggestion generation failed, falling back to static suggestions', { projectName, error: aiError.message });
        const lowPublish = accountStats.filter(s => s.targetPublished > 0 && (s.publishedCount / s.targetPublished) < 0.5);
        const lowPlay = accountStats.filter(s => s.targetPlayCount > 0 && (s.totalPlayCount / s.targetPlayCount) < 0.1);
        if (lowPublish.length > 0) {
          suggestions += `- 以下账号发布进度不足50%，建议增加发布频率：${lowPublish.map(a => a.accountName).join('、')}\n`;
        }
        if (lowPlay.length > 0) {
          suggestions += `- 以下账号播放量进度不足10%，建议优化内容或加强推广：${lowPlay.map(a => a.accountName).join('、')}\n`;
        }
        if (lowPublish.length === 0 && lowPlay.length === 0) {
          suggestions += '- 各账号运营数据正常，请继续保持当前节奏。\n';
        }
      }

      // 使用普通文本而非代码块，避免移动端无法点击展开的问题
      const mdContent = header + '\n' + lines.join('\n') + '\n' + suggestions;
      const card = {
        schema: '2.0',
        config: { wide_screen_mode: true },
        header: {
          title: { tag: 'plain_text', content: `📊 同步完成 | ${projectName}` },
          template: 'green',
        },
        body: {
          elements: [
            {
              tag: 'div',
              text: { tag: 'lark_md', content: mdContent },
            },
          ],
        },
      };
      return this.sendInteractiveCard(chatId, card);
    }

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
      schema: '2.0',
      config: { wide_screen_mode: true },
      header: {
        title: { tag: 'plain_text', content: headerTitle },
        template: templateColor,
      },
      body: {
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
            tag: 'div',
            text: { tag: 'plain_text', content: `⏱️ ${time}` },
          },
        ],
      },
    };

    return this.sendInteractiveCard(chatId, card);
  }
}

module.exports = new NotifyService();
