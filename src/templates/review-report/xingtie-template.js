const logger = require('../../utils/logger');

module.exports = {
  name: '星铁',
  description: '星穹铁道海外社媒运营复盘报告模板（按账号逐个分析）',

  // 内容类型分类（仅用于数据总览表格汇总）
  contentTypes: [
    { key: '原创', label: '原创', keywords: ['painter', 'idrila', 'popilala', '动画', '俄区'] },
    { key: '本地化分发', label: '本地化分发', keywords: ['分发', 'local', 'transfer'] },
    { key: '平台分发', label: '平台分发', keywords: ['平台', 'repost', 'mirror'] },
  ],

  classifyContentType(accountName) {
    const lower = (accountName || '').toLowerCase();
    for (const type of this.contentTypes) {
      if (type.keywords.some(kw => lower.includes(kw.toLowerCase()))) return type;
    }
    return { key: '原创', label: '原创' };
  },

  extractPlatform(accountName) {
    const name = accountName || '';
    const map = { TK: 'TikTok', YTB: 'YouTube', INS: 'Instagram', X: 'X', RD: 'Reddit', FB: 'Facebook' };
    for (const [code, platformName] of Object.entries(map)) {
      if (name.toUpperCase().includes(code)) return platformName;
    }
    return 'Unknown';
  },

  // 动态查找周期初/末粉丝量字段
  _findFanFields(accountFields) {
    const keys = Object.keys(accountFields || {});

    // 先找明确的周期初/末粉丝量字段
    const startKey = keys.find(k => /(周期初|版本初|开始|start|初).*粉丝/i.test(k));
    const endKey = keys.find(k => /(周期末|版本末|结束|end|末).*粉丝/i.test(k));
    if (startKey && endKey) return { startKey, endKey };

    // 找包含"粉丝量"且不是"粉丝总量"的字段（如 "2.14粉丝量"、"3.27粉丝量"）
    const fanKeys = keys.filter(k => k.includes('粉丝量') && k !== '粉丝总量');
    if (fanKeys.length >= 2) {
      fanKeys.sort();
      return { startKey: fanKeys[0], endKey: fanKeys[1] };
    }
    if (fanKeys.length === 1) {
      return { startKey: null, endKey: fanKeys[0] };
    }

    // 回退到粉丝总量
    return { startKey: null, endKey: '粉丝总量' };
  },

  buildReportData(projectName, versionPeriod, accounts, worksMap) {
    // 1. 数据总览（按内容类型汇总）
    const typeSummary = new Map();
    for (const type of this.contentTypes) {
      typeSummary.set(type.key, {
        type: type.label,
        playCount: 0,
        accountCount: 0,
        workCount: 0,
        fansStart: 0,
        fansEnd: 0,
        interactCount: 0,
      });
    }

    // 2. 按账号逐个分析的数据
    const accountAnalysis = [];

    for (const account of accounts) {
      const af = account.fields;
      const works = worksMap.get(account.record_id) || [];
      const playCount = parseInt(af['目前播放量']) || 0;
      const published = parseInt(af['已发布']) || 0;
      const contentType = this.classifyContentType(af['账号名称'] || '');

      // 查找粉丝量字段
      const { startKey, endKey } = this._findFanFields(af);
      const fansStart = startKey ? (parseInt(af[startKey]) || 0) : 0;
      const fansEnd = endKey ? (parseInt(af[endKey]) || 0) : (parseInt(af['粉丝总量']) || 0);
      const fansGrowth = fansEnd - fansStart;

      // 汇总到类型
      const summary = typeSummary.get(contentType.key);
      if (summary) {
        summary.playCount += playCount;
        summary.accountCount += 1;
        summary.workCount += published;
        summary.fansStart += fansStart;
        summary.fansEnd += fansEnd;
        summary.interactCount += works.reduce((sum, w) =>
          sum + (w.diggCount || 0) + (w.commentCount || 0) + (w.shareCount || 0) + (w.collectCount || 0), 0);
      }

      // 按播放量排序作品
      const sortedWorks = [...works].sort((a, b) => (b.playCount || 0) - (a.playCount || 0));
      const topWorks = sortedWorks.slice(0, 3).map(w => ({ ...w, accountName: af['账号名称'] }));
      const lowWorks = sortedWorks.slice(-3).map(w => ({ ...w, accountName: af['账号名称'] }));

      // 检测联动/堡垒之夜内容（用于专项复盘）
      const specialWorks = works.filter(w =>
        (w.title || '').toLowerCase().includes('堡垒') ||
        (w.title || '').toLowerCase().includes('fortnite') ||
        (w.link || '').toLowerCase().includes('fortnite')
      );

      accountAnalysis.push({
        name: af['账号名称'],
        platform: this.extractPlatform(af['账号名称']),
        playCount,
        published,
        fansStart,
        fansEnd,
        fansGrowth,
        works,
        topWorks,
        lowWorks,
        specialWorks,
        contentType: contentType.label,
        fields: af,
      });
    }

    // 类型汇总计算衍生指标
    const allTypes = Array.from(typeSummary.values()).filter(t => t.accountCount > 0);
    const totalPlay = allTypes.reduce((s, t) => s + t.playCount, 0);
    const totalWork = allTypes.reduce((s, t) => s + t.workCount, 0);
    const totalInteract = allTypes.reduce((s, t) => s + t.interactCount, 0);
    const totalFansStart = allTypes.reduce((s, t) => s + t.fansStart, 0);
    const totalFansEnd = allTypes.reduce((s, t) => s + t.fansEnd, 0);
    const totalFansGrowth = totalFansEnd - totalFansStart;

    allTypes.push({
      type: 'ALL',
      playCount: totalPlay,
      accountCount: accounts.length,
      workCount: totalWork,
      fansStart: totalFansStart,
      fansEnd: totalFansEnd,
      fansGrowth: totalFansGrowth,
      interactCount: totalInteract,
      avgPlay: totalWork > 0 ? Math.round(totalPlay / totalWork) : 0,
      interactRate: totalPlay > 0 ? ((totalInteract / totalPlay) * 100).toFixed(2) + '%' : '0%',
    });

    for (const t of allTypes) {
      if (t.type !== 'ALL') {
        t.avgPlay = t.workCount > 0 ? Math.round(t.playCount / t.workCount) : 0;
        t.interactRate = t.playCount > 0 ? ((t.interactCount / t.playCount) * 100).toFixed(2) + '%' : '0%';
        t.fansGrowth = t.fansEnd - t.fansStart;
      }
    }

    // 检测是否有联动/堡垒之夜内容需要专项复盘
    const hasSpecialReview = accountAnalysis.some(a => a.specialWorks.length > 0);

    return {
      template: '星铁',
      projectName,
      versionPeriod,
      typeSummary: allTypes,
      accountAnalysis,
      hasSpecialReview,
      totalAccounts: accounts.length,
      totalPlayCount: totalPlay,
      totalPublished: totalWork,
    };
  },

  // 解析 AI 返回（支持按账号嵌套，失败时回退到全局解析）
  parseAIResponse(aiText) {
    const result = {
      global: {},
      accounts: {},
    };

    // 尝试按【账号名称】分段解析
    const accountRegex = /【([^【\]]+?)】/g;
    const accountMatches = [];
    let m;
    while ((m = accountRegex.exec(aiText)) !== null) {
      accountMatches.push({ name: m[1].trim(), index: m.index });
    }

    if (accountMatches.length > 0) {
      for (let i = 0; i < accountMatches.length; i++) {
        const { name, index } = accountMatches[i];
        const endIndex = i + 1 < accountMatches.length ? accountMatches[i + 1].index : aiText.length;
        const section = aiText.slice(index, endIndex);

        const accountData = {};
        // 提取 [字段名] 内容
        const fieldRegex = /\[(.+?)\]\n?([\s\S]*?)(?=\n\[|$)/g;
        let fm;
        while ((fm = fieldRegex.exec(section)) !== null) {
          accountData[fm[1].trim()] = fm[2].trim();
        }
        result.accounts[name] = accountData;
      }
    }

    // 无论是否解析到按账号的内容，都做一次全局解析作为 fallback
    const globalRegex = /\[(.+?)\]\n?([\s\S]*?)(?=\n\[|$)/g;
    let gm;
    while ((gm = globalRegex.exec(aiText)) !== null) {
      result.global[gm[1].trim()] = gm[2].trim();
    }

    return result;
  },

  buildDocBlocks(data, aiContent = {}) {
    const blocks = [];
    const global = aiContent.global || aiContent;
    const accountsAI = aiContent.accounts || {};

    // 标题
    blocks.push(this.heading1(`${data.projectName} 复盘报告`));
    blocks.push(this.text(`统计周期: ${data.versionPeriod}`));
    blocks.push({ block_type: 22, divider: {} });

    // 数据总览 & KPI 完成情况
    blocks.push(this.heading1('数据总览&KPI完成情况：'));
    blocks.push(this.table(
      ['', '播放量', '账号数', '条数', '稿均', '周期初粉丝量', '周期末粉丝量', '增粉量', '互动量'],
      data.typeSummary.map(t => [
        t.type,
        t.playCount.toLocaleString(),
        String(t.accountCount),
        String(t.workCount),
        t.avgPlay?.toLocaleString() || '0',
        t.fansStart.toLocaleString(),
        t.fansEnd.toLocaleString(),
        t.fansGrowth.toLocaleString(),
        t.interactCount.toLocaleString(),
      ])
    ));
    blocks.push({ block_type: 22, divider: {} });

    // 账号数据附件
    if (data.bitableUrl) {
      blocks.push(this.linkText('账号数据附件：', data.bitableUrl));
    }

    // 账号内容复盘（按单个账号逐个分析）
    blocks.push(this.heading1('1. 账号内容复盘'));

    for (const account of data.accountAnalysis) {
      const ai = accountsAI[account.name] || global;

      blocks.push(this.heading2(account.name));

      // 1）本版本数据小结
      blocks.push(this.bold('1）本版本数据小结'));
      blocks.push(this.text(
        `本版本仅新增视频累计${(account.playCount / 10000).toFixed(0)}w播放量，新增${account.fansGrowth}粉丝。`
      ));
      blocks.push(this.text(`本版本亮点：${ai['亮点'] || ai['本版本亮点'] || '_待AI填充_'}`));
      blocks.push(this.text(`本版本缺点：${ai['缺点'] || ai['本版本缺点'] || '_待AI填充_'}`));

      // 2）内容分析
      blocks.push(this.bold('2）内容分析'));
      blocks.push(this.bold('a. 爆款案例解构'));

      for (const work of account.topWorks) {
        const cleanLink = (work.link || '').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$2');
        blocks.push(this.text(`链接：${cleanLink}`));
        blocks.push(this.text(`内容简述：${work.title || ''}`));
        blocks.push(this.text(`播放量：${this._formatPlayCount(work.playCount)}`));

        // 成功要素：优先使用 AI 按作品生成的，否则使用通用成功要素
        const successKey = `成功要素_${work.title?.slice(0, 20)}`;
        let successFactors = ai[successKey] || ai['成功要素'] || '_待AI填充_';
        blocks.push(this.text('成功要素：'));
        // 多行成功要素处理
        const lines = successFactors.split('\n').filter(l => l.trim());
        if (lines.length > 1) {
          for (const line of lines) {
            blocks.push(this.text(line.trim()));
          }
        } else {
          blocks.push(this.text(successFactors));
        }

        if (work.videoAnalysis) {
          blocks.push(this.text(`视频画面分析：${work.videoAnalysis}`));
        }
        blocks.push({ block_type: 22, divider: {} });
      }

      blocks.push(this.bold('b.低播放内容分析'));
      blocks.push(this.table(
        ['帖子', '浏览量', '原因分析'],
        account.lowWorks.map(w => {
          const cleanLink = (w.link || '').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$2');
          return [
            w.title?.slice(0, 30) || '',
            String(w.playCount || 0),
            `链接：${cleanLink.slice(0, 60)}`,
          ];
        })
      ));

      // 3）增长情况及原因
      blocks.push(this.bold('3）增长情况及原因'));
      const growthText = ai['增长情况'] || ai['增长情况及原因'] || '_待AI填充_';
      const growthLines = growthText.split('\n').filter(l => l.trim());
      if (growthLines.length > 1) {
        for (const line of growthLines) {
          blocks.push(this.text(line.trim()));
        }
      } else {
        blocks.push(this.text(growthText));
      }

      // 4）核心问题及优化方向
      blocks.push(this.bold('4）核心问题及优化方向'));
      blocks.push(this.text(`核心问题：${ai['核心问题'] || '_待AI填充_'}`));
      const directionText = ai['优化方向'] || '_待AI填充_';
      const directionLines = directionText.split('\n').filter(l => l.trim());
      if (directionLines.length > 1) {
        for (const line of directionLines) {
          blocks.push(this.text(line.trim()));
        }
      } else {
        blocks.push(this.text(directionText));
      }
      blocks.push({ block_type: 22, divider: {} });
    }

    // 堡垒之夜/联动专项复盘
    if (data.hasSpecialReview) {
      blocks.push(this.heading1('堡垒之夜复盘报告'));
      blocks.push(this.text('（联动专项复盘内容待后续版本补充完整时间线与分类分析）'));
    }

    return blocks;
  },

  _formatPlayCount(count) {
    if (!count || count === 0) return '0';
    if (count >= 1000000) return (count / 10000).toFixed(0) + 'w';
    if (count >= 10000) return (count / 10000).toFixed(0) + 'w';
    if (count >= 1000) return (count / 1000).toFixed(1) + 'k';
    return String(count);
  },

  buildAIPrompt(projectName, accounts, worksMap) {
    let prompt = `请为《崩坏：星穹铁道》海外社媒运营项目生成复盘建议，采用"运营增长驱动型"分析视角。\n\n`;
    prompt += `项目: ${projectName}\n`;
    prompt += `账号数: ${accounts.length}\n\n`;

    for (const account of accounts) {
      const af = account.fields;
      const works = worksMap.get(account.record_id) || [];
      const totalInteract = works.reduce((sum, w) =>
        sum + (w.diggCount || 0) + (w.commentCount || 0) + (w.shareCount || 0) + (w.collectCount || 0), 0);
      const interactRate = (parseInt(af['目前播放量']) || 0) > 0
        ? ((totalInteract / (parseInt(af['目前播放量']) || 1)) * 100).toFixed(2)
        : 0;

      const { startKey, endKey } = this._findFanFields(af);
      const fansStart = startKey ? (parseInt(af[startKey]) || 0) : 0;
      const fansEnd = endKey ? (parseInt(af[endKey]) || 0) : (parseInt(af['粉丝总量']) || 0);

      prompt += `【${af['账号名称']}】\n`;
      prompt += `- 播放量: ${af['目前播放量'] || 0}\n`;
      prompt += `- 已发布: ${af['已发布'] || 0}\n`;
      prompt += `- 周期初粉丝: ${fansStart}\n`;
      prompt += `- 周期末粉丝: ${fansEnd}\n`;
      prompt += `- 增粉: ${fansEnd - fansStart}\n`;
      prompt += `- 互动率: ${interactRate}%\n`;

      if (works.length > 0) {
        const sorted = [...works].sort((a, b) => b.playCount - a.playCount);
        prompt += `- 作品列表（按播放量排序）:\n`;
        for (const w of sorted.slice(0, 5)) {
          prompt += `  * ${w.title?.slice(0, 40) || ''} | ${w.playCount}播放 | 链接: ${w.link?.slice(0, 60) || ''}\n`;
        }
      }
      prompt += `\n`;
    }

    prompt += `\n分析要求（星铁风格，必须为每个账号分别输出）：\n`;
    prompt += `请严格按以下格式为每个账号输出独立分析块：\n\n`;
    prompt += `【账号名称】\n`;
    prompt += `[亮点]\n（1-2句话概括本版本亮点，如爆款数据、趋势捕捉、粉丝增长等）\n\n`;
    prompt += `[缺点]\n（1-2句话概括本版本缺点，如数据波动、内容单一、审美疲劳等）\n\n`;
    prompt += `[成功要素]\n（针对该账号播放量最高的1-2条作品，分别输出2-3行详细成功要素分析。必须包含：热点时机、角色适配度、BGM/趋势、用户互动/评论区引流等维度）\n\n`;
    prompt += `[增长情况]\n（分析该账号播放增长与粉丝增长的原因，2-4句话，可分段）\n\n`;
    prompt += `[核心问题]\n（1-2句话概括该账号当前最核心的运营问题）\n\n`;
    prompt += `[优化方向]\n（1-3条具体可执行的优化方向，每条一行）\n\n`;
    prompt += `注意事项：\n`;
    prompt += `- 每个账号必须单独用【账号名称】包裹\n`;
    prompt += `- 成功要素必须具体到作品层面，不要泛泛而谈\n`;
    prompt += `- 低播放原因要具体（如审美疲劳、画风改动、旧梗重复、角色适配度低）\n`;
    prompt += `- 优化方向要具体可执行（如"维持画风不变"、"穿插其他IP角色"、"优先新选题新趋势"）\n`;

    return prompt;
  },

  // Block helpers with center alignment
  heading1(text) {
    return {
      block_type: 3,
      heading1: {
        elements: [{ text_run: { content: text || '' } }],
      },
    };
  },
  heading2(text) {
    return {
      block_type: 4,
      heading2: {
        elements: [{ text_run: { content: text || '' } }],
      },
    };
  },
  heading3(text) {
    return {
      block_type: 5,
      heading3: {
        elements: [{ text_run: { content: text || '' } }],
      },
    };
  },
  text(text) {
    return {
      block_type: 2,
      text: {
        elements: [{ text_run: { content: text || '' } }],
      },
    };
  },
  bold(text) {
    return {
      block_type: 2,
      text: {
        elements: [{ text_run: { content: text || '', text_element_style: { bold: true } } }],
      },
    };
  },
  bullet(text) {
    return {
      block_type: 12,
      bullet: {
        elements: [{ text_run: { content: text || '' } }],
      },
    };
  },
  quote(content, isBold = false, isItalic = false) {
    return {
      block_type: 15,
      quote: {
        elements: [{
          text_run: {
            content: content || '',
            text_element_style: {
              bold: isBold,
              italic: isItalic,
            },
          },
        }],
      },
    };
  },
  textWithLabel(label, content) {
    return {
      block_type: 2,
      text: {
        elements: [
          { text_run: { content: label || '', text_element_style: { bold: true } } },
          { text_run: { content: content || '' } },
        ],
      },
    };
  },
  linkText(label, url) {
    return {
      block_type: 2,
      text: {
        elements: [
          { text_run: { content: label || '', text_element_style: { bold: true } } },
          {
            text_run: {
              content: url || '',
              text_element_style: { link: { url: url || '' } },
            },
          },
        ],
      },
    };
  },
  table(headers, rows) {
    const allRows = [headers, ...rows];
    return {
      block_type: 31,
      table: {
        property: {
          row_size: allRows.length,
          column_size: headers.length,
        },
      },
      children: allRows.flatMap(row =>
        row.map(cell => [{ block_type: 2, text: { elements: [{ text_run: { content: cell } }] } }])
      ),
    };
  },
};
