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

    const accountDetails = [];

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

      const sortedWorks = [...works].sort((a, b) => (b.playCount || 0) - (a.playCount || 0));
      const totalInteract = works.reduce((sum, w) =>
        sum + (w.diggCount || 0) + (w.commentCount || 0) + (w.shareCount || 0) + (w.collectCount || 0), 0);

      accountDetails.push({
        name: af['账号名称'],
        platform: this.extractPlatform(af['账号名称']),
        playCount,
        published,
        fans,
        interactCount: totalInteract,
        interactRate: playCount > 0 ? ((totalInteract / playCount) * 100).toFixed(2) + '%' : '0%',
        topWork: sortedWorks[0] || null,
        lowWorks: sortedWorks.slice(-3),
        works,
        fields: af,
      });
    }

    // 计算总表指标
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
      accountDetails,
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
    blocks.push({ block_type: 9 });

    // 数据总览&KPI完成情况
    blocks.push(this.heading2('数据总览&KPI完成情况'));
    blocks.push(this.text('账号数据附件：详见数据汇总表格'));

    // 总表
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
    blocks.push({ block_type: 9 });

    // 账号内容复盘
    blocks.push(this.heading2('账号内容复盘'));

    for (const acc of data.accountDetails) {
      blocks.push(this.heading3(acc.name));

      // 1）本版本数据小结
      blocks.push(this.bold('1）本版本数据小结'));
      blocks.push(this.text(
        `本版本累计${acc.playCount.toLocaleString()}播放量，` +
        `新增${acc.fans}粉丝。`
      ));
      // 手动录入字段（方案A）
      const f = acc.fields;
      if (f['涨粉走势']) blocks.push(this.text(`涨粉走势：${f['涨粉走势']}`));
      if (f['用户画像']) blocks.push(this.text(`用户画像：${f['用户画像']}`));
      if (f['播放来源']) blocks.push(this.text(`播放来源：${f['播放来源']}`));

      blocks.push(this.text(`本版本亮点：${aiContent['亮点'] || aiContent['本版本亮点'] || '_待AI填充_'}`));
      blocks.push(this.text(`本版本缺点：${aiContent['缺点'] || aiContent['本版本缺点'] || '_待AI填充_'}`));

      // 2）内容分析
      blocks.push(this.bold('2）内容分析'));
      blocks.push(this.bold('a. 爆款案例解构'));
      if (acc.topWork) {
        const cleanLink = (acc.topWork.link || '').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$2');
        blocks.push(this.text(`链接：${cleanLink}`));
        blocks.push(this.text(`内容简述：${acc.topWork.title || ''}`));
        blocks.push(this.text(`播放量：${acc.topWork.playCount?.toLocaleString() || 0}`));
        blocks.push(this.text(`成功要素：${aiContent['成功要素'] || '_待AI填充_'}`));
      }
      blocks.push(this.bold('b. 低播放内容分析'));
      blocks.push(this.table(
        ['帖子', '浏览量', '原因分析'],
        acc.lowWorks.map(w => {
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
      blocks.push(this.text('本版本播放增长与粉丝增速变化，主要原因包括：'));
      blocks.push(this.bullet(aiContent['增长情况及原因'] || '_待AI填充_'));
      blocks.push(this.bullet(aiContent['增长情况'] || '_待AI填充_'));
      blocks.push(this.bullet(aiContent['增长原因'] || '_待AI填充_'));

      // 4）核心问题及优化方向
      blocks.push(this.bold('4）核心问题及优化方向'));
      blocks.push(this.text(`核心问题：${aiContent['核心问题'] || '_待AI填充_'}`));
      blocks.push(this.text(`优化方向：${aiContent['优化方向'] || '_待AI填充_'}`));
      blocks.push({ block_type: 9 });
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
    prompt += `2. 必须有独立的"增长情况及原因"章节，明确列出增长归因清单\n`;
    prompt += `3. 爆款成功要素要强调热点时机（"第一波热度"、"首曝窗口期"）、角色适配度、BGM/原唱互动引流\n`;
    prompt += `4. 关注数据稳定性（"数据下限"、"稿均"），分析波动原因\n`;
    prompt += `5. 低播放原因要具体（审美疲劳、画风改动、旧梗重复）\n`;
    prompt += `6. 优化方向要具体可执行（如"维持画风不变"、"穿插其他IP角色"、"优先新选题新趋势"）\n`;
    prompt += `7. 如有联动/活动，需单独做专项复盘（时间线、流量节点、内容分类）\n`;
    prompt += `\n请按以下格式输出：\n`;
    prompt += `[亮点]\n...\n\n`;
    prompt += `[缺点]\n...\n\n`;
    prompt += `[成功要素]\n...\n\n`;
    prompt += `[核心问题]\n...\n\n`;
    prompt += `[优化方向]\n...\n\n`;
    prompt += `[增长情况及原因]\n...\n`;

    return prompt;
  },

  heading1(text) { return { block_type: 3, heading1: { elements: [{ text_run: { content: text } }] } }; },
  heading2(text) { return { block_type: 4, heading2: { elements: [{ text_run: { content: text } }] } }; },
  heading3(text) { return { block_type: 5, heading3: { elements: [{ text_run: { content: text } }] } }; },
  text(text) { return { block_type: 2, text: { elements: [{ text_run: { content: text } }] } }; },
  bold(text) { return { block_type: 2, text: { elements: [{ text_run: { content: text, text_element_style: { bold: true } } }] } }; },
  bullet(text) { return { block_type: 6, bullet: { elements: [{ text_run: { content: text } }] } }; },
  table(headers, rows) {
    const allRows = [headers, ...rows];
    return {
      block_type: 14,
      table: { table_width: headers.length, table_rows: allRows.length, table_columns: headers.length, merge_info: [] },
      children: allRows.map(row => ({
        block_type: 15,
        table_cell: { children: row.map(cell => ({ block_type: 2, text: { elements: [{ text_run: { content: cell } }] } })) },
      })),
    };
  },
};
