const logger = require('../../utils/logger');

module.exports = {
  name: '终末地',
  description: '终末地海外社媒运营复盘报告模板（内容生产驱动型）',

  // 内容方向分组映射规则（从账号名称中提取方向标签）
  directionGroups: [
    { key: '美系', label: '动画类账号（美系画风）', keywords: ['glowart', 'ryan', 'akendfield'] },
    { key: 'Q版', label: '动画类账号（Q版画风）', keywords: ['chen', 'q版', 'chibi'] },
    { key: 'AIGC', label: 'AIGC方向账号', keywords: ['ai', 'aigc', 'gigi'] },
    { key: '漫画', label: '漫画类账号', keywords: ['漫画', 'comic', 'manga'] },
    { key: '娱乐杂谈', label: '解说剪辑类-娱乐杂谈方向', keywords: ['杂谈', 'talk', 'tips', 'insight'] },
    { key: '游戏展示', label: '解说剪辑类-游戏展示方向', keywords: ['展示', 'lens', 'mod', ' gameplay'] },
    { key: '考据攻略', label: '解说剪辑类-考据攻略方向', keywords: ['攻略', 'sys', 'guide', '考据'] },
  ],

  // 判断账号所属方向
  classifyDirection(accountName) {
    const lower = accountName.toLowerCase();
    for (const group of this.directionGroups) {
      if (group.keywords.some(kw => lower.includes(kw.toLowerCase()))) {
        return group;
      }
    }
    return this.directionGroups[this.directionGroups.length - 1];
  },

  // 构建报告数据结构
  buildReportData(projectName, versionPeriod, accounts, worksMap) {
    const directions = new Map();

    for (const account of accounts) {
      const af = account.fields;
      const dir = this.classifyDirection(af['账号名称'] || '');
      if (!directions.has(dir.key)) {
        directions.set(dir.key, {
          label: dir.label,
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
      const dirData = directions.get(dir.key);
      const works = worksMap.get(account.record_id) || [];
      const playCount = parseInt(af['目前播放量']) || 0;
      const published = parseInt(af['已发布']) || 0;

      dirData.accounts.push({
        name: af['账号名称'],
        platform: this.extractPlatform(af['账号名称']),
        playCount,
        published,
        works,
        fields: af,
      });
      dirData.totalWorks += published;
      dirData.totalPlayCount += playCount;

      for (const work of works) {
        const pc = work.playCount || 0;
        if (pc >= 10000) dirData.break10k++;
        if (pc >= 100000) dirData.break100k++;
        if (pc >= 1000000) dirData.break1m++;
      }

      // 取播放量最高的3条作为爆款候选
      const sorted = [...works].sort((a, b) => (b.playCount || 0) - (a.playCount || 0));
      dirData.topWorks.push(...sorted.slice(0, 3).map(w => ({
        ...w,
        accountName: af['账号名称'],
      })));

      // 取播放量最低的3条作为低播放候选
      dirData.lowWorks.push(...sorted.slice(-3).map(w => ({
        ...w,
        accountName: af['账号名称'],
      })));
    }

    // 对每个方向去重并排序
    for (const dirData of directions.values()) {
      dirData.topWorks = dirData.topWorks
        .sort((a, b) => b.playCount - a.playCount)
        .slice(0, 3);
      dirData.lowWorks = dirData.lowWorks
        .sort((a, b) => a.playCount - b.playCount)
        .slice(0, 3);
    }

    return {
      template: '终末地',
      projectName,
      versionPeriod,
      directions: Array.from(directions.values()),
      totalAccounts: accounts.length,
      totalPlayCount: accounts.reduce((sum, a) => sum + (parseInt(a.fields['目前播放量']) || 0), 0),
      totalPublished: accounts.reduce((sum, a) => sum + (parseInt(a.fields['已发布']) || 0), 0),
    };
  },

  extractPlatform(accountName) {
    const map = { TK: 'TikTok', YTB: 'YouTube', INS: 'Instagram', X: 'X', RD: 'Reddit', FB: 'Facebook' };
    for (const [code, name] of Object.entries(map)) {
      if (accountName.toUpperCase().includes(code)) return name;
    }
    return 'Unknown';
  },

  // 生成飞书 Docx blocks
  buildDocBlocks(data, aiContent = {}) {
    const blocks = [];

    // 标题
    blocks.push(this.heading1(`${data.projectName} 复盘报告`));
    blocks.push(this.text(`统计周期: ${data.versionPeriod}`));
    blocks.push({ block_type: 9 }); // divider

    // 一、数据总览
    blocks.push(this.heading2('一、数据总览&KPI完成情况'));
    blocks.push(this.text(`总账号数: ${data.totalAccounts}`));
    blocks.push(this.text(`总发布数: ${data.totalPublished}`));
    blocks.push(this.text(`总播放量: ${data.totalPlayCount.toLocaleString()}`));
    blocks.push({ block_type: 9 });

    // 二、账号整体运营情况复盘
    blocks.push(this.heading2('二、账号整体运营情况复盘'));

    for (const dir of data.directions) {
      blocks.push(this.heading3(dir.label));

      // 1）本版本数据小结
      blocks.push(this.bold('1）本版本数据小结'));
      blocks.push(this.text(
        `本版本累计播放量${(dir.totalPlayCount / 10000).toFixed(0)}w，` +
        `产出单条破w播视频${dir.break10k}条，` +
        `其中10w+视频${dir.break100k}条、` +
        `${dir.break1m > 0 ? dir.break1m + '条百万级爆款、' : ''}`
      ));

      // 各平台拆分
      for (const acc of dir.accounts) {
        blocks.push(this.bullet(
          `${acc.platform}平台账号${acc.name}新增播放量${(acc.playCount / 10000).toFixed(0)}w`
        ));
      }

      // 手动录入字段（方案A）
      const sampleAcc = dir.accounts[0];
      if (sampleAcc) {
        const f = sampleAcc.fields;
        if (f['涨粉走势']) blocks.push(this.text(`涨粉走势：${f['涨粉走势']}`));
        if (f['用户画像']) blocks.push(this.text(`用户画像：${f['用户画像']}`));
        if (f['播放来源']) blocks.push(this.text(`播放来源：${f['播放来源']}`));
      }

      blocks.push(this.text(`本版本亮点：${aiContent['亮点'] || aiContent['本版本亮点'] || '_待AI填充_'}`));
      blocks.push(this.text(`本版本缺点：${aiContent['缺点'] || aiContent['本版本缺点'] || '_待AI填充_'}`));

      // 2）内容分类及分析
      blocks.push(this.bold('2）内容分类及分析'));
      blocks.push(this.bold('a. 爆款案例解构'));

      for (const work of dir.topWorks) {
        const cleanLink = (work.link || '').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$2');
        blocks.push(this.text(`平台：${work.accountName}`));
        blocks.push(this.text(`链接：${cleanLink}`));
        blocks.push(this.text(`内容简述：${work.title || ''}`));
        blocks.push(this.text(`播放量：${(work.playCount / 10000).toFixed(0)}w`));
        blocks.push(this.text(`成功要素：${aiContent['成功要素'] || '_待AI填充_'}`));
        blocks.push({ block_type: 9 });
      }

      blocks.push(this.bold('b. 低播放内容分析'));
      blocks.push(this.table(
        ['帖子', '浏览量', '原因分析'],
        dir.lowWorks.map(w => {
          const cleanLink = (w.link || '').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$2');
          return [
            w.title?.slice(0, 30) || '',
            String(w.playCount || 0),
            `链接：${cleanLink.slice(0, 60)}`,
          ];
        })
      ));

      // 3）核心问题及优化方向
      blocks.push(this.bold('3）核心问题及优化方向'));
      blocks.push(this.text(`核心问题：${aiContent['核心问题'] || '_待AI填充_'}`));
      blocks.push(this.text(`优化方向：${aiContent['优化方向'] || '_待AI填充_'}`));
      blocks.push({ block_type: 9 });
    }

    return blocks;
  },

  buildAIPrompt(projectName, accounts, worksMap) {
    let prompt = `请为《终末地》海外社媒运营项目生成复盘建议，采用"内容生产驱动型"分析视角。\n\n`;
    prompt += `项目: ${projectName}\n`;
    prompt += `账号数: ${accounts.length}\n\n`;

    for (const account of accounts) {
      const af = account.fields;
      const works = worksMap.get(account.record_id) || [];
      prompt += `账号: ${af['账号名称']}\n`;
      prompt += `- 播放量: ${af['目前播放量'] || 0}\n`;
      prompt += `- 已发布: ${af['已发布'] || 0}\n`;
      if (works.length > 0) {
        const top = works.sort((a, b) => b.playCount - a.playCount)[0];
        prompt += `- 最高播放作品: ${top.title?.slice(0, 40)} (${top.playCount}播放)\n`;
      }
      prompt += `\n`;
    }

    prompt += `\n分析要求（终末地风格）：\n`;
    prompt += `1. 每个内容方向需总结"亮点"和"缺点"\n`;
    prompt += `2. 爆款成功要素要分析到内容元素层面（画风、IP结合、音乐趋势、剧情冲突点、用户留存机制）\n`;
    prompt += `3. AIGC方向需额外关注技术局限（生成指令、剪辑复杂度、多人同屏表现）\n`;
    prompt += `4. 低播放原因常指向平台差异或素材局限\n`;
    prompt += `5. 优化方向要具体可执行（如"尝试吊带袜天使画风"、"形成爆款系列"）\n`;
    prompt += `6. 解说剪辑类账号需给出版本内容规划建议\n`;
    prompt += `\n请按以下格式输出：\n`;
    prompt += `[亮点]\n...\n\n`;
    prompt += `[缺点]\n...\n\n`;
    prompt += `[成功要素]\n...\n\n`;
    prompt += `[核心问题]\n...\n\n`;
    prompt += `[优化方向]\n...\n`;

    return prompt;
  },

  // Block helpers
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
