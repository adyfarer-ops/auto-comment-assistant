const youtubeApi = require('../src/services/youtube-api');

async function checkChannel() {
  const handle = 'kimanhletran3404';
  const startDate = new Date('2026/04/17');
  const endDate = new Date('2026/06/05');

  console.log(`Checking YouTube channel: @${handle}`);
  console.log(`Version cycle: ${startDate.toISOString().split('T')[0]} ~ ${endDate.toISOString().split('T')[0]}`);

  try {
    const channel = await youtubeApi.getChannelByHandle(handle);
    if (!channel) {
      console.error('Channel not found');
      process.exit(1);
    }

    console.log(`Channel ID: ${channel.id}`);
    console.log(`Channel Title: ${channel.snippet?.title}`);
    console.log(`Subscribers: ${channel.statistics?.subscriberCount}`);

    const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) {
      console.error('Uploads playlist not found');
      process.exit(1);
    }
    console.log(`Uploads Playlist ID: ${uploadsPlaylistId}`);

    let pageToken = '';
    let page = 0;
    const maxPages = 20;
    const allVideos = [];

    while (page < maxPages) {
      const videosData = await youtubeApi.getVideos(uploadsPlaylistId, pageToken);
      const videoIds = videosData.items?.map(i => i.contentDetails?.videoId).filter(Boolean) || [];

      if (videoIds.length > 0) {
        const stats = await youtubeApi.getVideoStatistics(videoIds);
        for (const v of stats) {
          const publishedAt = v.snippet?.publishedAt;
          const publishDate = publishedAt ? new Date(publishedAt) : null;
          const inRange = publishDate && publishDate >= startDate && publishDate <= endDate;
          allVideos.push({
            id: v.id,
            title: v.snippet?.title,
            publishedAt: publishedAt,
            publishDate: publishDate ? publishDate.toISOString().split('T')[0] : null,
            inRange,
            views: parseInt(v.statistics?.viewCount) || 0,
            likes: parseInt(v.statistics?.likeCount) || 0,
            comments: parseInt(v.statistics?.commentCount) || 0,
          });
        }
      }

      if (!videosData.nextPageToken) break;
      pageToken = videosData.nextPageToken;
      page++;
    }

    const inRangeVideos = allVideos.filter(v => v.inRange);
    console.log(`\nTotal videos fetched: ${allVideos.length}`);
    console.log(`Videos in version cycle: ${inRangeVideos.length}`);

    console.log('\n--- Videos in version cycle ---');
    for (const v of inRangeVideos) {
      console.log(`${v.publishDate} | ${v.title?.substring(0, 60)} | views:${v.views}`);
    }

    console.log('\n--- Videos OUTSIDE version cycle (recent 10) ---');
    const outRange = allVideos.filter(v => !v.inRange).slice(0, 10);
    for (const v of outRange) {
      console.log(`${v.publishDate} | ${v.title?.substring(0, 60)} | inRange:${v.inRange}`);
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkChannel();
