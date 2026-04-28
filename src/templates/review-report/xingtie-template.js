const logger = require('../../utils/logger');

module.exports = {
  name: '星铁',
  description: '星穹铁道海外社媒运营复盘报告模板（运营增长驱动型）',

  // 内容类型分类（从账号名称或分组字段中提取）
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

  buildReportData(projectName, versionPeriod, accounts, worksMap) {
    // 按内容类型分组
    const typeGroups = new Map();
    for (const type of this.contentTypes) {
      typeGroups.set(type.key, {
        label: type.label,
        accounts: [],
        totalWorks: 0,
        totalPlayCount: 0,
        break10k: 0,
        break100k: 0,
        break1m: 0,
        topWorks: [],
        lowWorks: [],
      });
    }

    for (const account of accounts) {
      const af = account.fields;
      const contentType = this.classifyContentType(af['账号名称'] || '');
      const group = typeGroups.get(contentType.key);
      const works = worksMap.get(account.record_id) || [];
      const playCount = parseInt(af['目前播放量']) || 0;
      const published = parseInt(af['已发布']) || 0;

      group.accounts.push({
        name: af['账号名称'],
        platform: this.extractPlatform(af['账号名称']),
        playCount,
        published,
        fans: parseInt(af['粉丝总量']) || 0,
        works,
        fields: af,
      });
      group.totalWorks += published;
      group.totalPlayCount += playCount;

      for (const work of works) {
        const pc = work.playCount || 0;
        if (pc >= 10000) group.break10k++;
        if (pc >= 100000) group.break100k++;
        if (pc >= 1000000) group.break1m++;
      }

      const sorted = [...works].sort((a, b) => (b.playCount || 0) - (a.playCount || 0));
      group.topWorks.push(...sorted.slice(0, 3).map(w => ({ ...w, accountName: af['账号名称'] })));
      group.lowWorks.push(...sorted.slice(-3).map(w => ({ ...w, accountName: af['账号名称'] })));
    }

    // 对每个方向去重并排序
    for (const group of typeGroups.values()) {
      group.topWorks = group.topWorks
        .sort((a, b) => b.playCount - a.playCount)
        .slice(0, 3);
      group.lowWorks = group.lowWorks
        .sort((a, b) => a.playCount - b.playCount)
        .slice(0, 3);
    }

    // 按内容类型汇总（总表维度）
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

    for (const account of accounts) {
      const af = account.fields;
      const works = worksMap.get(account.record_id) || [];
      const playCount = parseInt(af['目前播放量']) || 0;
      const published = parseInt(af['已发布']) || 0;
      const fans = parseInt(af['粉丝总量']) || 0;
      const contentType = this.classifyContentType(af['账号名称'] || '');
      const summary = typeSummary.get(contentType.key);

      if (summary) {
        summary.playCount += playCount;
        summary.accountCount += 1;
        summary.workCount += published;
        summary.fansEnd += fans;
        summary.interactCount += works.reduce((sum, w) =>
          sum + (w.diggCount || 0) + (w.commentCount || 0) + (w.shareCount || 0) + (w.collectCount || 0), 0);
      }
    }

    const allTypes = Array.from(typeSummary.values());
    const totalPlay = allTypes.reduce((s, t) => s + t.playCount, 0);
    const totalWork = allTypes.reduce((s, t) => s + t.workCount, 0);
    const totalInteract = allTypes.reduce((s, t) => s + t.interactCount, 0);
    const totalFansEnd = allTypes.reduce((s, t) => s + t.fansEnd, 0);

    allTypes.push({
      type: 'ALL',
      playCount: totalPlay,
      accountCount: accounts.length,
      workCount: totalWork,
      fansStart: 0,
      fansEnd: totalFansEnd,
      interactCount: totalInteract,
      avgPlay: totalWork > 0 ? Math.round(totalPlay / totalWork) : 0,
      interactRate: totalPlay > 0 ? ((totalInteract / totalPlay) * 100).toFixed(2) + '%' : '0%',
    });

    for (const t of allTypes) {
      if (t.type !== 'ALL') {
        t.avgPlay = t.workCount > 0 ? Math.round(t.playCount / t.workCount) : 0;
        t.interactRate = t.playCount > 0 ? ((t.interactCount / t.playCount) * 100).toFixed(2) + '%' : '0%';
      }
    }

    return {
      template: '星铁',
      projectName,
      versionPeriod,
      typeSummary: allTypes,
      typeGroups: Array.from(typeGroups.values()).filter(g => g.accounts.length > 0),
      totalAccounts: accounts.length,
      totalPlayCount: totalPlay,
      totalPublished: totalWork,
    };
  },

  buildDocBlocks(data, aiContent = {}) {
    const blocks = [];

    // 标题
    blocks.push(this.heading1(`${data.projectName} 复盘报告`));
    blocks.push(this.text(`统计周期: ${data.versionPeriod}`));
    blocks.push({ block_type: 22, divider: {} });

    // 一、数据总览 & KPI 完成情况
    blocks.push(this.heading1('一、数据总览 & KPI 完成情况'));
    blocks.push(this.bold('账号数据附件：'));
    if (data.bitableUrl) {
      blocks.push(this.linkText('点击链接可查看完整电子表格：', data.bitableUrl));
    } else {
      blocks.push(this.text('（点击链接可查看完整电子表格，支持筛选、排序和计算）'));
    }

    // 1. 数据汇总
    blocks.push(this.heading2('1. 数据汇总'));
    blocks.push(this.table(
      ['类型', '播放量', '账号数', '条数', '稿均', '增粉量', '互动量', '互动率'],
      data.typeSummary.map(t => [
        t.type,
        t.playCount.toLocaleString(),
        String(t.accountCount),
        String(t.workCount),
        t.avgPlay?.toLocaleString() || '0',
        String(t.fansEnd),
        t.interactCount.toLocaleString(),
        t.interactRate,
      ])
    ));
    blocks.push({ block_type: 22, divider: {} });

    // 二、账号整体运营情况复盘
    blocks.push(this.heading1('二、账号整体运营情况复盘'));

    let typeIndex = 1;
    for (const group of data.typeGroups) {
      blocks.push(this.heading1(`${typeIndex}. ${group.label}`));

      // 1）本版本数据小结
      blocks.push(this.heading2('1）本版本数据小结'));
      blocks.push(this.text(
        `本版本累计发布 ${group.totalWorks} 条，总播放量 ${group.totalPlayCount.toLocaleString()}。`
      ));

      // 各平台拆分
      for (const acc of group.accounts) {
        blocks.push(this.text(
          `${acc.platform}平台账号${acc.name}新增播放量${(acc.playCount / 10000).toFixed(0)}w`
        ));
      }

      // AI 亮点 / 待改进
      const highlight = aiContent['亮点'] || aiContent['本版本亮点'] || '_待AI填充_';
      const lowlight = aiContent['缺点'] || aiContent['本版本缺点'] || '_待AI填充_';
      blocks.push(this.quote(`亮点｜${highlight}`, true));
      blocks.push(this.quote(`待改进｜${lowlight}`, true));

      // 2）涨粉走势分析
      blocks.push(this.heading2('2）涨粉走势分析'));
      blocks.push(this.quote('📷 图片提示：请插入【粉丝增长趋势截图 / 后台数据截图】', false, true));

      // 3）用户画像分析
      blocks.push(this.heading2('3）用户画像分析'));
      blocks.push(this.quote('📷 图片提示：请插入【用户画像后台截图 / 受众分析截图】', false, true));

      // 4）播放来源分析
      blocks.push(this.heading2('4）播放来源分析'));
      blocks.push(this.quote('📷 图片提示：请插入【播放来源 / 流量来源后台截图】', false, true));

      // 5）内容分类及分析
      blocks.push(this.heading2('5）内容分类及分析'));
      blocks.push(this.bold('a. 爆款案例解构'));

      for (const work of group.topWorks) {
        const cleanLink = (work.link || '').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$2');
        blocks.push(this.textWithLabel('平台：', work.accountName));
        blocks.push(this.linkText('链接：', cleanLink));
        blocks.push(this.textWithLabel('内容简述：', work.title || ''));
        blocks.push(this.textWithLabel('播放量：', `${(work.playCount / 10000).toFixed(1)}w`));
        blocks.push(this.quote(`📷 图片提示：请插入【${work.title?.slice(0, 40) || ''}】的封面截图 / 播放页截图`, false, true));

        if (work.videoAnalysis) {
          blocks.push(this.quote(`视频视觉分析｜${work.videoAnalysis}`));
        } else {
          blocks.push(this.quote('视频分析｜该平台视频暂不支持下载分析，请直接访问原链接查看'));
        }
      }

      blocks.push(this.bold('b. 低播放内容分析'));
      blocks.push(this.table(
        ['帖子', '浏览量', '原因分析'],
        group.lowWorks.map(w => {
          const cleanLink = (w.link || '').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$2');
          return [
            w.title?.slice(0, 30) || '',
            String(w.playCount || 0),
            `链接：${cleanLink.slice(0, 60)}`,
          ];
        })
      ));

      // 6）核心问题及优化方向
      blocks.push(this.heading2('6）核心问题及优化方向'));
      blocks.push(this.textWithLabel('核心问题：', aiContent['核心问题'] || '_待AI填充_'));
      blocks.push(this.textWithLabel('优化方向：', aiContent['优化方向'] || '_待AI填充_'));
      blocks.push({ block_type: 22, divider: {} });

      typeIndex++;
    }

    return blocks;
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

      prompt += `账号: ${af['账号名称']}\n`;
      prompt += `- 播放量: ${af['目前播放量'] || 0}\n`;
      prompt += `- 已发布: ${af['已发布'] || 0}\n`;
      prompt += `- 粉丝: ${af['粉丝总量'] || 0}\n`;
      prompt += `- 互动率: ${interactRate}%\n`;
      if (works.length > 0) {
        const top = works.sort((a, b) => b.playCount - a.playCount)[0];
        prompt += `- 最高播放作品: ${top.title?.slice(0, 40)} (${top.playCount}播放)\n`;
      }
      prompt += `\n`;
    }

    prompt += `\n分析要求（星铁风格）：\n`;
    prompt += `1. 每个账号需总结"亮点"和"缺点"（1-2句话概括）\n`;
    prompt += `2. 爆款成功要素要强调热点时机（"第一波热度"、"首曝窗口期"）、角色适配度、BGM/原唱互动引流\n`;
    prompt += `3. 关注数据稳定性（"数据下限"、"稿均"），分析波动原因\n`;
    prompt += `4. 低播放原因要具体（审美疲劳、画风改动、旧梗重复）\n`;
    prompt += `5. 优化方向要具体可执行（如"维持画风不变"、"穿插其他IP角色"、"优先新选题新趋势"）\n`;
    prompt += `6. 如有联动/活动，需单独做专项复盘（时间线、流量节点、内容分类）\n`;
    prompt += `\n请按以下格式输出：\n`;
    prompt += `[亮点]\n...\n\n`;
    prompt += `[缺点]\n...\n\n`;
    prompt += `[成功要素]\n...\n\n`;
    prompt += `[核心问题]\n...\n\n`;
    prompt += `[优化方向]\n...\n`;

    return prompt;
  },

  // Block helpers with center alignment
  heading1(text) {
    return {
      block_type: 3,
      heading1: {
        elements: [{ text_run: { content: text || '' } }],
        style: { align: 1 },
      },
    };
  },
  heading2(text) {
    return {
      block_type: 4,
      heading2: {
        elements: [{ text_run: { content: text || '' } }],
        style: { align: 1 },
      },
    };
  },
  heading3(text) {
    return {
      block_type: 5,
      heading3: {
        elements: [{ text_run: { content: text || '' } }],
        style: { align: 1 },
      },
    };
  },
  text(text) {
    return {
      block_type: 2,
      text: {
        elements: [{ text_run: { content: text || '' } }],
        style: { align: 1 },
      },
    };
  },
  bold(text) {
    return {
      block_type: 2,
      text: {
        elements: [{ text_run: { content: text || '', text_element_style: { bold: true } } }],
        style: { align: 1 },
      },
    };
  },
  bullet(text) {
    return {
      block_type: 12,
      bullet: {
        elements: [{ text_run: { content: text || '' } }],
        style: { align: 1 },
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
        style: { align: 1 },
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
        style: { align: 1 },
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
        style: { align: 1 },
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
