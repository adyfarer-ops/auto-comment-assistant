const axios = require('axios');
const config = require('../../config');
const logger = require('../utils/logger');
const { createProxyAgent } = require('../utils/proxy');

class AIService {
  constructor() {
    this.agent = createProxyAgent();
  }

  async generateSuggestions(projectName, accounts) {
    const prompt = this.buildPrompt(projectName, accounts);

    // 优先使用 Moonshot
    if (config.ai.moonshot.apiKey) {
      return this.callMoonshot(prompt);
    }

    // 其次使用 DeepSeek
    if (config.ai.deepseek.apiKey) {
      return this.callDeepSeek(prompt);
    }

    throw new Error('No AI provider configured');
  }

  buildPrompt(projectName, accounts) {
    let content = `请为以下游戏海外社媒运营项目生成运营建议复盘报告：\n\n`;
    content += `项目名称: ${projectName}\n`;
    content += `账号数: ${accounts.length}\n\n`;

    content += `各账号数据:\n`;
    for (const account of accounts) {
      const af = account.fields;
      content += `- ${af['账号名称']}: 已发布${af['已发布'] || 0}条, 播放量${af['目前播放量'] || 0}, 粉丝${af['粉丝总量'] || 0}, 完成率${(parseFloat(af['发布完成率']) * 100).toFixed(0)}%\n`;
    }

    content += `\n请从以下几个维度给出建议:\n`;
    content += `1. 数据表现总结（整体播放量、完成率、稿均等核心指标）\n`;
    content += `2. 内容策略建议（哪些类型表现好，如何优化）\n`;
    content += `3. 账号运营建议（增粉、互动提升）\n`;
    content += `4. 风险预警（数据异常、内容合规）\n`;
    content += `5. 下周/下阶段重点方向\n`;

    return content;
  }

  async callMoonshot(prompt) {
    try {
      const response = await axios.post(`${config.ai.moonshot.baseUrl}/chat/completions`, {
        model: 'moonshot-v1-8k',
        messages: [
          { role: 'system', content: '你是一位资深的游戏海外社媒运营专家，擅长数据分析和内容策略。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      }, {
        headers: {
          Authorization: `Bearer ${config.ai.moonshot.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
        httpsAgent: this.agent,
      });

      return response.data.choices[0].message.content;
    } catch (error) {
      logger.error('Moonshot API failed', { error: error.message });
      throw error;
    }
  }

  async callDeepSeek(prompt) {
    try {
      const response = await axios.post(`${config.ai.deepseek.baseUrl}/chat/completions`, {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是一位资深的游戏海外社媒运营专家，擅长数据分析和内容策略。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      }, {
        headers: {
          Authorization: `Bearer ${config.ai.deepseek.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
        httpsAgent: this.agent,
      });

      return response.data.choices[0].message.content;
    } catch (error) {
      logger.error('DeepSeek API failed', { error: error.message });
      throw error;
    }
  }
}

module.exports = new AIService();
