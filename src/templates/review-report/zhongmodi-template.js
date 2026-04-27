module.exports = {
  name: '终末地',
  description: '终末地海外社媒运营复盘报告模板',

  sections: [
    { id: 'overview', title: '数据概览', type: 'stats' },
    { id: 'accounts', title: '账号表现', type: 'table' },
    { id: 'content_types', title: '内容类型分析', type: 'grouped_stats' },
    { id: 'platform_breakdown', title: '平台分布', type: 'chart' },
    { id: 'ai_suggestions', title: 'AI 运营建议', type: 'text' },
    { id: 'next_steps', title: '下阶段重点', type: 'checklist' },
  ],

  contentTypeGroups: ['动画', '漫画', '攻略', '同人', '资讯', '其他'],

  buildPrompt(projectName, accounts) {
    return `请为《终末地》海外社媒运营项目生成复盘建议。

项目: ${projectName}
账号数: ${accounts.length}

重点分析维度：
1. 动画/漫画类内容的播放量表现
2. 攻略类内容的互动率
3. 各平台（TK/YTB/INS/X）的差异化表现
4. 粉丝增长与内容发布的相关性

请给出具体的数据洞察和可执行的优化建议。`;
  },
};
