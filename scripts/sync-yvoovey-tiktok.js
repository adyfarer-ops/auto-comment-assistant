const axios = require('axios');
const config = require('../config');

const TIKHUB_API_KEY = config.tikhub.apiKey;
const TIKHUB_BASE_URL = config.tikhub.baseUrl;
const FEISHU_APP_ID = config.feishu.appId;
const FEISHU_APP_SECRET = config.feishu.appSecret;
const PROJECT_MGMT_TOKEN = config.project.managementTableToken;

const PROJECT_TABLE_ID = 'tblxbkkh03Kw10lI';
const PLAN_TABLE_ID = 'tblkiw3Jte3ULO8d';
const DETAIL_TABLE_ID = 'tblzGRDlK7uwlMMJ';
const PROJECT_NAME = '终末地1.2分发账号-项目规划';
const ACCOUNT_NAME = 'yvoovey';
const USERNAME = 'yvoovey'; // 小写，用于 TikHub API

async function feishuRequest(method, url, data = null, params = null) {
  const token = await getFeishuToken();
  const res = await axios({
    method,
    url: `https://open.feishu.cn/open-apis${url}`,
    headers: { Authorization: `Bearer ${token}` },
    data,
    params,
  });
  if (res.data.code !== 0) {
    throw new Error(`Feishu API error: ${res.data.msg} (code: ${res.data.code})`);
  }
  return res.data.data;
}

let feishuTokenCache = null;
async function getFeishuToken() {
  if (feishuTokenCache) return feishuTokenCache;
  const res = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    app_id: FEISHU_APP_ID,
    app_secret: FEISHU_APP_SECRET,
  });
  feishuTokenCache = res.data.tenant_access_token;
  setTimeout(() => { feishuTokenCache = null; }, 7000000);
  return feishuTokenCache;
}

async function getProjectRecord() {
  const res = await feishuRequest('POST', `/bitable/v1/apps/${PROJECT_MGMT_TOKEN}/tables/${PROJECT_TABLE_ID}/records/search`, {
    filter: {
      conjunction: 'and',
      conditions: [{ field_name: '项目名称', operator: 'is', value: [PROJECT_NAME] }],
    },
  });
  const items = res.items || [];
  if (!items.length) throw new Error('Project record not found');
  return items[0];
}

async function getAccountRecord() {
  const res = await feishuRequest('POST', `/bitable/v1/apps/${PROJECT_MGMT_TOKEN}/tables/${PLAN_TABLE_ID}/records/search`, {
    filter: {
      conjunction: 'and',
      conditions: [{ field_name: '账号名称', operator: 'is', value: [ACCOUNT_NAME] }],
    },
  });
  const items = res.items || [];
  if (!items.length) throw new Error('Account record not found in plan table');
  // 如果有多条记录（TK/YTB），取 TK 那条，或取第一条
  const tkRecord = items.find(r => r.fields?.['平台'] === 'TK');
  return tkRecord || items[0];
}

async function getTikTokUserInfo(username) {
  const res = await axios.get(`${TIKHUB_BASE_URL}/api/v1/tiktok/app/v3/get_user_id_and_sec_user_id_by_username`, {
    params: { username },
    headers: { Authorization: `Bearer ${TIKHUB_API_KEY}` },
    timeout: 30000,
  });
  return res.data;
}

async function getTikTokUserVideos(secUid, cursor = 0) {
  const params = { sec_user_id: secUid, count: 50 };
  if (cursor) {
    params.max_cursor = cursor;
  } else {
    params.cursor = 0;
  }
  const res = await axios.get(`${TIKHUB_BASE_URL}/api/v1/tiktok/app/v3/fetch_user_post_videos`, {
    params,
    headers: { Authorization: `Bearer ${TIKHUB_API_KEY}` },
    timeout: 30000,
  });
  return res.data;
}

async function getTikTokUserProfile(userId, secUid) {
  const res = await axios.get(`${TIKHUB_BASE_URL}/api/v1/tiktok/app/v3/handler_user_profile`, {
    params: { user_id: userId, sec_user_id: secUid },
    headers: { Authorization: `Bearer ${TIKHUB_API_KEY}` },
    timeout: 30000,
  });
  return res.data;
}

async function fetchAllTikTokWorks(secUid) {
  const works = [];
  let cursor = 0;
  let page = 0;
  const maxPages = 200;
  const seenIds = new Set();

  while (page < maxPages) {
    const videos = await getTikTokUserVideos(secUid, cursor);
    const items = videos.data?.aweme_list || videos.data?.itemList || videos.data?.videos || [];
    for (const v of items) {
      const workId = v.video_id || v.aweme_id || v.id;
      if (!workId) continue;
      const key = String(workId);
      if (seenIds.has(key)) continue;
      seenIds.add(key);
      const stats = v.statistics || v.stats || {};
      works.push({
        workId: key,
        title: v.desc || v.title || '',
        link: v.share_url || `https://www.tiktok.com/@${USERNAME}/video/${key}`,
        publishTime: v.create_time ? new Date(v.create_time * 1000).toISOString().split('T')[0] : null,
        playCount: parseInt(stats.play_count) || 0,
        diggCount: parseInt(stats.digg_count) || 0,
        commentCount: parseInt(stats.comment_count) || 0,
        shareCount: parseInt(stats.share_count) || 0,
        collectCount: parseInt(stats.collect_count) || 0,
      });
    }
    const hasMore = videos.data?.has_more ?? videos.data?.hasMore ?? false;
    const nextCursor = videos.data?.max_cursor ?? videos.data?.cursor;
    if (!hasMore || nextCursor === undefined || nextCursor === cursor) break;
    cursor = nextCursor;
    page++;
    await new Promise(r => setTimeout(r, 300));
  }
  return works;
}

async function getTableFields(tableId) {
  const res = await feishuRequest('GET', `/bitable/v1/apps/${PROJECT_MGMT_TOKEN}/tables/${tableId}/fields`);
  return res.items || [];
}

async function batchCreateRecords(tableId, records) {
  const res = await feishuRequest('POST', `/bitable/v1/apps/${PROJECT_MGMT_TOKEN}/tables/${tableId}/records/batch_create`, {
    records: records.map(r => ({ fields: r })),
  });
  return res;
}

async function updateRecord(tableId, recordId, fields) {
  const res = await feishuRequest('PUT', `/bitable/v1/apps/${PROJECT_MGMT_TOKEN}/tables/${tableId}/records/${recordId}`, {
    fields,
  });
  return res;
}

async function getExistingRecords(tableId) {
  const all = [];
  let hasMore = true;
  let pageToken = '';
  while (hasMore) {
    const params = pageToken ? { page_token: pageToken, page_size: 500 } : { page_size: 500 };
    const res = await feishuRequest('GET', `/bitable/v1/apps/${PROJECT_MGMT_TOKEN}/tables/${tableId}/records`, null, params);
    all.push(...(res.items || []));
    hasMore = res.has_more;
    pageToken = res.page_token;
  }
  return all;
}

async function main() {
  console.log('=== 开始单独同步 yvoovey TikTok 数据 ===');

  // 1. 获取项目记录，拿到版本周期
  const projectRecord = await getProjectRecord();
  const startDateStr = projectRecord.fields['版本开始日期'];
  const endDateStr = projectRecord.fields['版本结束日期'];
  console.log('项目:', PROJECT_NAME);
  console.log('版本周期:', startDateStr, '~', endDateStr);

  const startDate = startDateStr ? new Date(startDateStr) : null;
  const endDate = endDateStr ? new Date(endDateStr) : null;

  // 2. 获取账号记录
  const accountRecord = await getAccountRecord();
  console.log('账号 record_id:', accountRecord.record_id);
  console.log('当前平台字段:', accountRecord.fields?.['平台']);

  // 3. 调用 TikHub API 获取 user info（小写）
  console.log('正在调用 TikHub API 获取 user info...');
  const userInfo = await getTikTokUserInfo(USERNAME);
  console.log('userInfo:', JSON.stringify(userInfo, null, 2));

  if (!userInfo.data?.sec_user_id) {
    throw new Error('TikHub API 返回的 sec_user_id 为空');
  }

  const userId = userInfo.data.user_id;
  const secUid = userInfo.data.sec_user_id;
  console.log('user_id:', userId);
  console.log('sec_user_id:', secUid);

  // 4. 获取粉丝数
  let followersCount = 0;
  try {
    const profile = await getTikTokUserProfile(userId, secUid);
    const userData = profile.data?.user || profile.data;
    followersCount = parseInt(userData?.follower_count || userData?.stats?.follower_count || 0);
    console.log('粉丝数:', followersCount);
  } catch (e) {
    console.warn('获取粉丝数失败:', e.message);
  }

  // 5. 获取所有作品
  console.log('正在获取 TikTok 作品列表...');
  const allWorks = await fetchAllTikTokWorks(secUid);
  console.log('获取到作品总数:', allWorks.length);

  // 6. 按版本周期过滤
  const filteredWorks = allWorks.filter(work => {
    if (!work.publishTime) return false;
    const pt = new Date(work.publishTime);
    if (isNaN(pt.getTime())) return false;
    if (startDate && pt < startDate) return false;
    if (endDate && pt > endDate) return false;
    return true;
  });
  console.log('版本周期内作品数:', filteredWorks.length);

  if (filteredWorks.length === 0) {
    console.log('版本周期内没有作品，无需写入');
    return;
  }

  // 7. 获取详情表字段
  const fields = await getTableFields(DETAIL_TABLE_ID);
  const fieldNames = new Set(fields.map(f => f.field_name));
  const fieldTypeMap = new Map(fields.map(f => [f.field_name, f.type]));
  console.log('详情表字段:', Array.from(fieldNames));
  console.log('字段类型:', Array.from(fieldTypeMap.entries()));

  // 8. 获取现有记录，去重
  const existingRecords = await getExistingRecords(DETAIL_TABLE_ID);
  const existingMap = new Map();
  for (const r of existingRecords) {
    const link = r.fields?.['作品链接']?.link || r.fields?.['作品链接'];
    const title = r.fields?.['作品标题'];
    if (link) existingMap.set(link, r.record_id);
    if (title) existingMap.set(title, r.record_id);
  }
  console.log('现有记录数:', existingRecords.length);

  // 9. 准备写入的数据
  const recordsToCreate = [];
  for (const work of filteredWorks) {
    if (existingMap.has(work.link) || existingMap.has(work.title)) {
      console.log('跳过已存在作品:', work.title || work.workId);
      continue;
    }
    const record = {};
    if (fieldNames.has('作品标题')) record['作品标题'] = work.title;
    if (fieldNames.has('作品ID')) record['作品ID'] = work.workId;
    if (fieldNames.has('作品链接')) {
      const linkType = fieldTypeMap.get('作品链接');
      // type 15 = URL, type 1 = 文本
      if (linkType === 15) {
        record['作品链接'] = { link: work.link, text: '查看作品' };
      } else {
        record['作品链接'] = work.link;
      }
    }
    if (fieldNames.has('发布时间')) {
      const ptType = fieldTypeMap.get('发布时间');
      if (ptType === 5) {
        // 日期字段传毫秒时间戳
        record['发布时间'] = work.publishTime ? new Date(work.publishTime).getTime() : null;
      } else {
        // 文本字段传日期字符串
        record['发布时间'] = work.publishTime || '';
      }
    }
    if (fieldNames.has('播放量')) record['播放量'] = work.playCount;
    if (fieldNames.has('点赞数')) record['点赞数'] = work.diggCount;
    if (fieldNames.has('评论数')) record['评论数'] = work.commentCount;
    if (fieldNames.has('分享数')) record['分享数'] = work.shareCount;
    if (fieldNames.has('收藏数')) record['收藏数'] = work.collectCount;
    if (fieldNames.has('同步时间')) record['同步时间'] = new Date().getTime();
    recordsToCreate.push(record);
  }

  console.log('待创建记录数:', recordsToCreate.length);
  if (recordsToCreate.length > 0) {
    console.log('第一条记录示例:', JSON.stringify(recordsToCreate[0], null, 2));
  }

  if (recordsToCreate.length > 0) {
    // 飞书 batch_create 每次最多 500 条
    const batchSize = 500;
    for (let i = 0; i < recordsToCreate.length; i += batchSize) {
      const batch = recordsToCreate.slice(i, i + batchSize);
      try {
        await batchCreateRecords(DETAIL_TABLE_ID, batch);
        console.log(`已写入 ${i + batch.length} / ${recordsToCreate.length} 条记录`);
      } catch (err) {
        console.error('batch create 失败:', err.message);
        console.error('失败批次第一条记录:', JSON.stringify(batch[0], null, 2));
        throw err;
      }
      if (i + batchSize < recordsToCreate.length) await new Promise(r => setTimeout(r, 500));
    }
  }

  // 10. 计算统计
  const publishedCount = filteredWorks.length;
  const totalPlayCount = filteredWorks.reduce((sum, w) => sum + w.playCount, 0);

  // 按日期统计
  const dateMap = new Map();
  for (const work of filteredWorks) {
    if (work.publishTime) {
      const d = new Date(work.publishTime);
      const key = `${d.getMonth() + 1}月${d.getDate()}日`;
      dateMap.set(key, (dateMap.get(key) || 0) + 1);
    }
  }

  // 11. 获取 planTable 字段
  const planFields = await getTableFields(PLAN_TABLE_ID);
  const planFieldNames = new Set(planFields.map(f => f.field_name));

  // 12. 更新账号统计
  const updateFields = {
    '目前播放量': totalPlayCount,
    '已发布': publishedCount,
    '粉丝总量': followersCount,
    '平台': 'TK',
    '同步时间': new Date().getTime(),
  };

  for (const [key, value] of dateMap) {
    if (planFieldNames.has(key)) updateFields[key] = String(value);
  }

  // 只更新 planTable 中存在的字段
  const fieldsToUpdate = {};
  for (const [key, value] of Object.entries(updateFields)) {
    if (planFieldNames.has(key)) {
      fieldsToUpdate[key] = value;
    } else {
      console.log('planTable 缺少字段，跳过:', key);
    }
  }

  await updateRecord(PLAN_TABLE_ID, accountRecord.record_id, fieldsToUpdate);
  console.log('账号统计已更新:', { publishedCount, totalPlayCount, followersCount });
  console.log('=== 同步完成 ===');
}

main().catch(err => {
  console.error('同步失败:', err.message);
  process.exit(1);
});
