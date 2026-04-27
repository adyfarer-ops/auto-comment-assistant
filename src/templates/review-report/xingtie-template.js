module.exports = {
  name: '星铁',
  description: '星铁（崩坏：星穹铁道）海外社媒运营复盘报告模板',

  sections: [
    { id: 'overview', title: '数据概览', type: 'stats' },
    { id: 'accounts', title: '账号表现', type: 'table' },
    { id: 'weekly_trend', title: '周趋势对比', type: 'chart' },
    { id: 'hot_content', title: '热门内容分析', type: 'top_list' },
    { id: 'ai_suggestions', title: 'AI 运营建议', type: 'text' },
    { id: 'risk_warning', title: '风险预警', type: 'alert_list' },
  ],

  hotContentMetrics: ['播放量', '点赞数', '评论数', '分享数'],

  buildPrompt(projectName, accounts) {
    return `请为《崩坏：星穹铁道》海外社媒运营项目生成复盘建议。

项目: ${projectName}
账号数: ${accounts.length}

重点分析维度：
1. 版本活动期间的内容爆发力
2. 角色PV/攻略/活动的播放量分层
3. 社区互动质量（评论情感倾向）
4. 跨平台内容分发效率

请给出具体的数据洞察和可执行的优化建议。`;
  },
};
