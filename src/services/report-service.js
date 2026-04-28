const axios = require('axios');
const feishuBitable = require('./feishu-bitable');
const feishuAuth = require('./feishu-auth');
const aiService = require('./ai-service');
const templateRegistry = require('../templates/review-report/template-registry');
const tableResolver = require('./table-resolver');
const videoExtractionService = require('./video-extraction-service');
const videoAnalysisService = require('./video-analysis-service');
const logger = require('../utils/logger');

class ReportService {
  constructor() {
    this.projectMgmtAppToken = null;
  }

  setProjectMgmtAppToken(token) {
    this.projectMgmtAppToken = token;
    tableResolver.setProjectMgmtAppToken(token);
  }

  async generateReviewReport(projectRecord) {
    const fields = projectRecord.fields;
    const planTableId = fields['表格ID'];
    const templateType = fields['复盘报告模板'] || '终末地';
    const versionStart = fields['版本开始日期'] ? new Date(fields['版本开始日期']) : null;
    const versionEnd = fields['版本结束日期'] ? new Date(fields['版本结束日期']) : null;
    const versionPeriod = versionStart && versionEnd
      ? `${versionStart.toISOString().split('T')[0]} ~ ${versionEnd.toISOString().split('T')[0]}`
      : '';

    logger.info('Generating review report', {
      projectName: fields['项目名称'],
      template: templateType,
    });

    const template = templateRegistry.get(templateType);

    // 获取所有账号数据
    const accounts = await feishuBitable.searchRecords(this.projectMgmtAppToken, planTableId);

    // 获取各账号的作品详情
    const worksMap = await this.fetchWorksForAccounts(fields['项目名称'], accounts);

    // 对各账号 Top 作品进行视频画面分析
    await this._analyzeTopWorks(worksMap);

    // 构建报告数据结构（模板特定）
    const reportData = template.buildReportData(
      fields['项目名称'],
      versionPeriod,
      accounts,
      worksMap
    );

    // 生成 AI 运营建议（模板特定 prompt）
    let aiContent = {};
    try {
      const aiPrompt = template.buildAIPrompt(fields['项目名称'], accounts, worksMap) +
        '\n\n请按以下格式输出：\n' +
        '[亮点]\n...\n\n' +
        '[缺点]\n...\n\n' +
        '[成功要素]\n...\n\n' +
        '[核心问题]\n...\n\n' +
        '[优化方向]\n...\n';
      const aiSuggestions = await aiService.callAnyProvider(aiPrompt);
      aiContent = this.parseAISuggestions(aiSuggestions);
    } catch (error) {
      logger.error('AI suggestions generation failed', { error: error.message });
      aiContent = {
        '亮点': 'AI 建议生成失败，请稍后重试。',
        '缺点': 'AI 建议生成失败，请稍后重试。',
        '成功要素': 'AI 建议生成失败，请稍后重试。',
        '核心问题': 'AI 建议生成失败，请稍后重试。',
        '优化方向': 'AI 建议生成失败，请稍后重试。',
      };
    }

    // 生成飞书文档 blocks（模板特定）
    const docBlocks = template.buildDocBlocks(reportData, aiContent);

    // 创建飞书文档
    const docUrl = await this.createFeishuDoc(fields['项目名称'], docBlocks);

    // 更新项目管理表
    await feishuBitable.updateRecord(this.projectMgmtAppToken, 'tblxbkkh03Kw10lI', projectRecord.record_id, {
      '复盘报告文档': docUrl,
    });

    return { docUrl, template: templateType };
  }

  async fetchWorksForAccounts(projectName, accounts) {
    const worksMap = new Map();

    for (const account of accounts) {
      const accountName = account.fields['账号名称'];
      const platformCode = this.extractPlatformCode(accountName);

      try {
        const detailTableId = await tableResolver.resolveDetailTable(projectName, accountName, platformCode);
        if (!detailTableId) {
          worksMap.set(account.record_id, []);
          continue;
        }

        const works = await feishuBitable.searchRecords(this.projectMgmtAppToken, detailTableId);
        worksMap.set(account.record_id, works.map(w => ({
          workId: w.fields['作品ID'],
          title: w.fields['作品标题'],
          link: this._extractLink(w.fields['作品链接']),
          publishTime: w.fields['发布时间'],
          playCount: parseInt(w.fields['播放量']) || 0,
          diggCount: parseInt(w.fields['点赞数']) || 0,
          commentCount: parseInt(w.fields['评论数']) || 0,
          shareCount: parseInt(w.fields['分享数']) || 0,
          collectCount: parseInt(w.fields['收藏数']) || 0,
        })));
      } catch (error) {
        logger.warn('Failed to fetch works for account', { accountName, error: error.message });
        worksMap.set(account.record_id, []);
      }
    }

    return worksMap;
  }

  parseAISuggestions(aiText) {
    const sections = {};
    const regex = /\[(.+?)\]\n?([\s\S]*?)(?=\n\[|$)/g;
    let match;
    while ((match = regex.exec(aiText)) !== null) {
      sections[match[1]] = match[2].trim();
    }

    // 补充缺失章节
    const defaults = ['亮点', '缺点', '成功要素', '核心问题', '优化方向'];
    for (const key of defaults) {
      if (!sections[key]) {
        sections[key] = '（该部分 AI 未生成，请手动补充）';
      }
    }

    return sections;
  }

  extractPlatformCode(accountName) {
    const upper = (accountName || '').toUpperCase();
    if (upper.includes('TK')) return 'TK';
    if (upper.includes('YTB')) return 'YTB';
    if (upper.includes('INS')) return 'INS';
    if (upper.includes('X-') || upper.includes('X_')) return 'X';
    if (upper.includes('RD')) return 'RD';
    if (upper.includes('FB')) return 'FB';
    return 'TK';
  }

  async _analyzeTopWorks(worksMap) {
    for (const [recordId, works] of worksMap.entries()) {
      if (!works || works.length === 0) continue;

      const topWork = works.reduce((max, w) => ((w.playCount || 0) > (max.playCount || 0) ? w : max), works[0]);
      if (!topWork || !topWork.link) continue;

      try {
        const extracted = await videoExtractionService.extractVideoUrl(topWork.link);
        if (!extracted || !extracted.videoUrl) {
          logger.warn('No video URL extracted for top work', { title: topWork.title?.slice(0, 40) });
          continue;
        }

        const analysis = await videoAnalysisService.analyzeVideoDirect(extracted.videoUrl, {
          prompt: '请分析这个短视频的画面风格、主要元素、节奏感、氛围，并给出内容运营建议。',
        });

        topWork.videoAnalysis = analysis;
        logger.info('Video analysis completed for top work', { title: topWork.title?.slice(0, 40), playCount: topWork.playCount });
      } catch (error) {
        logger.warn('Video analysis failed for top work', { title: topWork.title?.slice(0, 40), error: error.message });
        topWork.videoAnalysis = null;
      }
    }
  }

  _extractLink(value) {
    if (!value) return '';
    if (typeof value === 'object') {
      return value.link || value.url || '';
    }
    return String(value);
  }

  _sanitizeBlocks(blocks) {
    const sanitizeElement = (e) => {
      if (e.text_run) {
        if (e.text_run.content == null) {
          e.text_run.content = '';
        } else {
          e.text_run.content = String(e.text_run.content)
            .replace(/\r/g, '')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$2');
        }
      }
      return e;
    };

    const filterElements = (elements) => {
      if (!Array.isArray(elements)) return elements;
      return elements.filter(e => {
        if (e.text_run) {
          return e.text_run.content !== undefined;
        }
        return true;
      });
    };

    const sanitizeBlock = (b) => {
      // 清洗普通文本块
      if (b.block_type === 2 && b.text?.elements) {
        b.text.elements = filterElements(b.text.elements.map(sanitizeElement));
      }
      // 清洗标题块
      if ([3, 4, 5].includes(b.block_type) && b.heading1?.elements) {
        b.heading1.elements = filterElements(b.heading1.elements.map(sanitizeElement));
      }
      if ([3, 4, 5].includes(b.block_type) && b.heading2?.elements) {
        b.heading2.elements = filterElements(b.heading2.elements.map(sanitizeElement));
      }
      if ([3, 4, 5].includes(b.block_type) && b.heading3?.elements) {
        b.heading3.elements = filterElements(b.heading3.elements.map(sanitizeElement));
      }
      // 清洗列表块
      if (b.block_type === 6 && b.bullet?.elements) {
        b.bullet.elements = filterElements(b.bullet.elements.map(sanitizeElement));
      }
      // 清洗表格单元格
      if (b.block_type === 15 && b.table_cell?.children) {
        b.table_cell.children = sanitizeBlock(b.table_cell.children);
      }
      // 递归清洗表格子块
      if (b.children && Array.isArray(b.children)) {
        b.children = sanitizeBlock(b.children);
      }
      return b;
    };

    const walkBlocks = (arr) => {
      return arr.map(sanitizeBlock).filter(b => {
        // 过滤掉空的文本类 block
        if (b.block_type === 2 && b.text?.elements) {
          return b.text.elements.length > 0;
        }
        return true;
      });
    };

    return walkBlocks(blocks);
  }

  async _writeBlocksInChunks(documentId, blocks, token) {
    const chunkSize = 50;
    for (let i = 0; i < blocks.length; i += chunkSize) {
      const chunk = blocks.slice(i, i + chunkSize);
      try {
        await axios.post(`https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`, {
          children: chunk,
          index: i,
        }, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
      } catch (error) {
        const responseBody = error.response?.data;
        logger.error('Docx chunk write failed', {
          index: i,
          chunkSize: chunk.length,
          error: error.message,
          responseBody: JSON.stringify(responseBody || {}),
        });
        throw error;
      }
    }
  }

  async createFeishuDoc(projectName, docBlocks) {
    try {
      const token = await feishuAuth.getAppToken();

      // 创建文档
      const createRes = await axios.post('https://open.feishu.cn/open-apis/docx/v1/documents', {
        title: `${projectName} 复盘报告`,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (createRes.data.code !== 0) {
        throw new Error(`Create doc failed: ${createRes.data.msg}`);
      }

      const documentId = createRes.data.data.document.document_id;

      // 清洗 blocks
      const sanitized = this._sanitizeBlocks(docBlocks);

      // 分块写入 blocks
      await this._writeBlocksInChunks(documentId, sanitized, token);

      logger.info('Review report doc created', { documentId });

      return `https://vcnsfx7fytb0.feishu.cn/docx/${documentId}`;
    } catch (error) {
      logger.error('Failed to create feishu doc', { error: error.message });
      throw error;
    }
  }
}

module.exports = new ReportService();
