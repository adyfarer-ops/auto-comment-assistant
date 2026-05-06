require('dotenv').config();
const config = require('../config');
const projectService = require('../src/services/project-service');
const syncService = require('../src/services/sync-service');
const platformResolver = require('../src/services/platform-resolver');
const feishuBitable = require('../src/services/feishu-bitable');

const PROJECT_MGMT_APP_TOKEN = config.project.managementTableToken || 'GEZ9bWr5kaexSEssvUaczO0Knhh';

async function main() {
  projectService.setProjectMgmtAppToken(PROJECT_MGMT_APP_TOKEN);
  syncService.setProjectMgmtAppToken(PROJECT_MGMT_APP_TOKEN);

  const projects = await projectService.listProjects();
  const project = projects.find(p => p.name.includes('终末地1.2') || p.name.includes('终末地 1.2'));
  if (!project) {
    console.error('未找到项目: 终末地1.2-项目规划');
    console.log('可用项目:', projects.map(p => p.name).join(', '));
    process.exit(1);
  }

  console.log(`项目: ${project.name}`);
  console.log(`版本周期: ${project.versionStart} ~ ${project.versionEnd}`);
  console.log('---');

  const accounts = await feishuBitable.searchRecords(PROJECT_MGMT_APP_TOKEN, project.planTableId);
  const tkAccounts = accounts.filter(a => {
    const link = a.fields['主页链接']?.link || a.fields['主页链接'];
    if (!link) return false;
    const platform = platformResolver.detectPlatform(link);
    return platform && platform.code === 'TK';
  });

  console.log(`TK 账号数: ${tkAccounts.length}`);
  console.log('---');

  const startDate = project.versionStart;
  const endDate = project.versionEnd;
  const results = [];

  for (const account of tkAccounts) {
    const accountName = account.fields['账号名称'];
    const homeLink = account.fields['主页链接']?.link || account.fields['主页链接'];
    const username = platformResolver.extractUsername(homeLink, 'TK');

    console.log(`\n正在获取: ${accountName} (@${username})`);
    const works = await syncService.fetchPlatformWorks('TK', username, {
      startDate,
      endDate,
      maxPages: 200,
    });

    const filtered = works.filter(w => {
      if (!w.publishTime) return false;
      const d = new Date(w.publishTime);
      if (startDate && d < new Date(startDate)) return false;
      if (endDate && d > new Date(endDate)) return false;
      return true;
    });

    const totalPlays = filtered.reduce((s, w) => s + (w.playCount || 0), 0);

    // 获取粉丝数并同步到详情表和主表
    console.log(`  正在获取粉丝数...`);
    const followersCount = await syncService.fetchPlatformFollowers('TK', username);
    console.log(`  粉丝数: ${followersCount.toLocaleString()}`);

    console.log(`  正在同步详情表格...`);
    const detailTableId = await syncService.getOrCreateDetailTable(project.name, accountName, 'TK');
    if (detailTableId) {
      const syncResult = await syncService.syncWorksToDetailTable(detailTableId, filtered, account.record_id, false);
      console.log(`  详情表同步: 新增 ${syncResult.createdCount}, 更新 ${syncResult.updatedCount}, 删除 ${syncResult.deletedCount}`);
    } else {
      console.log(`  警告: 未找到或创建详情表格`);
    }

    console.log(`  正在更新主表统计...`);
    const statsResult = await syncService.updateAccountStats(account, project.planTableId, filtered, followersCount, 'TK', detailTableId, startDate, endDate);
    if (statsResult) {
      console.log(`  主表更新: 已发布 ${statsResult.publishedCount}, 播放量 ${statsResult.totalPlayCount.toLocaleString()}`);
    }

    results.push({
      accountName,
      username,
      totalFetched: works.length,
      inRange: filtered.length,
      totalPlays,
      works: filtered,
    });

    console.log(`  获取总数: ${works.length}, 周期内: ${filtered.length}, 总播放: ${totalPlays.toLocaleString()}`);
  }

  console.log('\n========== 统计汇总 ==========');
  let totalWorks = 0;
  let totalPlaysAll = 0;
  for (const r of results) {
    totalWorks += r.inRange;
    totalPlaysAll += r.totalPlays;
    console.log(`${r.accountName} (@${r.username}): ${r.inRange} 条, 播放 ${r.totalPlays.toLocaleString()}`);
  }
  console.log(`------------------------------`);
  console.log(`TK 账号总计: ${results.length} 个`);
  console.log(`作品总计: ${totalWorks} 条`);
  console.log(`播放量总计: ${totalPlaysAll.toLocaleString()}`);
}

main().catch(err => {
  console.error('执行失败:', err.message);
  if (err.response) {
    console.error('响应状态:', err.response.status);
    console.error('响应数据:', JSON.stringify(err.response.data, null, 2));
  }
  process.exit(1);
});
