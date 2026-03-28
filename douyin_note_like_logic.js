// 抖音图文点赞逻辑 - 完全复制抖音视频的实现
// 等待一下让评论渲染
await new Promise(r => setTimeout(r, 2000));

// 查找刚发布的评论（通常是第一个评论，带有"刚刚"标记）
const myComment = await page.$('div[data-e2e*="comment-item"]:first-child, div[class*="comment-item"]:first-child');
if (myComment) {
  console.log('[AUTO] Found my comment');

  // 在评论内查找点赞按钮 - 和抖音视频完全一样
  const likeButton = await myComment.$('svg, span[class*="like"], div[class*="like"], [data-e2e*="like"]');
  if (likeButton) {
    console.log('[AUTO] Clicking like button...');
    await likeButton.click();
    console.log('[AUTO] Liked my comment!');
    await sendProgressMessage(token, '✅ 已给自己评论点赞', data);
    await new Promise(r => setTimeout(r, 1000));
  } else {
    console.log('[AUTO] Like button not found in comment');
    await sendProgressMessage(token, '⚠️ 未找到点赞按钮', data);
  }
} else {
  console.log('[AUTO] My comment not found');
  await sendProgressMessage(token, '⚠️ 未找到自己发布的评论', data);
}