const tikhubApi = require('../src/services/tikhub-api');

async function countVideosInRange(username, startDate, endDate) {
  const startTimestamp = Math.floor(startDate.getTime() / 1000);
  const endTimestamp = Math.floor(endDate.getTime() / 1000);

  console.log(`查询账号: @${username}`);
  console.log(`时间范围: ${startDate.toISOString()} ~ ${endDate.toISOString()}`);
  console.log('---');

  const ids = await tikhubApi.getTikTokUserInfo(username);
  const secUid = ids?.data?.sec_user_id;
  if (!secUid) {
    throw new Error('Failed to get sec_user_id');
  }

  let maxCursor = 0;
  let allVideos = [];
  let pageCount = 0;

  while (pageCount < 50) {
    pageCount++;
    const params = {
      sec_user_id: secUid,
      count: 50,
    };
    if (maxCursor) {
      params.max_cursor = maxCursor;
    } else {
      params.cursor = 0;
    }

    const result = await tikhubApi.request('GET', '/api/v1/tiktok/app/v3/fetch_user_post_videos', params);
    const videos = result?.data?.aweme_list || [];

    if (videos.length === 0) break;

    const times = videos.map(v => v.create_time);
    console.log(
      `第 ${pageCount} 页: ${videos.length} 条, has_more=${result?.data?.has_more}, ` +
      `时间范围: ${new Date(Math.min(...times) * 1000).toISOString().slice(0, 10)} ~ ${new Date(Math.max(...times) * 1000).toISOString().slice(0, 10)}`
    );

    allVideos = allVideos.concat(videos);

    if (!result?.data?.has_more) break;
    const nextMaxCursor = result?.data?.max_cursor;
    if (!nextMaxCursor || nextMaxCursor == maxCursor) break;
    maxCursor = nextMaxCursor;
  }

  // 去重
  const seen = new Set();
  const uniqueVideos = allVideos.filter(v => {
    if (seen.has(v.aweme_id)) return false;
    seen.add(v.aweme_id);
    return true;
  });

  // 过滤指定时间范围
  const filtered = uniqueVideos.filter(v => {
    const t = v.create_time;
    return t >= startTimestamp && t <= endTimestamp;
  });

  // 按时间排序
  filtered.sort((a, b) => a.create_time - b.create_time);

  console.log('---');
  console.log(`总共获取视频: ${uniqueVideos.length} (去重前 ${allVideos.length}, 共 ${pageCount} 页)`);
  console.log(`在 ${startDate.toISOString().split('T')[0]} ~ ${endDate.toISOString().split('T')[0]} 范围内发布的视频: ${filtered.length}`);

  if (filtered.length > 0) {
    console.log('\n视频列表 (按发布时间排序):');
    filtered.forEach((v, i) => {
      const date = new Date(v.create_time * 1000).toISOString();
      const playCount = v.statistics?.play_count ?? 'N/A';
      console.log(`  ${i + 1}. ${date} | 播放:${playCount} | ${v.desc?.slice(0, 40) || '(无描述)'}`);
    });
  }

  return {
    totalFetched: uniqueVideos.length,
    countInRange: filtered.length,
    videos: filtered,
  };
}

(async () => {
  try {
    // 2026-03-28 到 2026-05-08
    const start = new Date('2026-03-28T00:00:00Z');
    const end = new Date('2026-05-08T23:59:59Z');
    const result = await countVideosInRange('idrila', start, end);
    console.log(`\n最终结果: ${result.countInRange} 个作品`);
  } catch (err) {
    console.error('查询失败:', err.message);
    if (err.response) {
      console.error('响应状态:', err.response.status);
      console.error('响应数据:', JSON.stringify(err.response.data, null, 2));
    }
    process.exit(1);
  }
})();
