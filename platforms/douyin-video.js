// platforms/douyin-video.js - 抖音视频处理逻辑（添加反馈信息）
const { sendProgressMessage } = require('../utils');

// 抖音视频处理流程（添加反馈信息）
async function handleDouyinVideo(page, token, data) {
  console.log('[AUTO] Handling Douyin Video...');
  await sendProgressMessage(token, '🎬 处理抖音视频...', data);

  // 滚动到页面底部找评论区
  console.log('[AUTO] Scrolling to find comment area...');
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
  await new Promise(r => setTimeout(r, 1500));

  // 使用通用的查找评论框逻辑（传入类型）
  return await findCommentInput(page, 'video', token, data);
}

// 通用查找评论框逻辑（添加反馈信息）
async function findCommentInput(page, type = 'default', token, data) {
  console.log(`[AUTO] Looking for comment input (${type})...`);

  // 根据类型使用不同的选择器
  let selectors = [];

  if (type === 'note' || type === 'video') {
    // 抖音图文/视频特定的选择器
    selectors = [
      'div.GXmFLge7.comment-input-inner-container',
      'div[class*="GXmFLge7"][class*="comment-input-inner-container"]',
      'div[class*="GXmFLge7"]',
      'div[class*="comment-input-inner-container"]',
      'div[contenteditable="true"]',
    ];
  } else {
    // 默认选择器
    selectors = [
      'div[class*="GXmFLge7"]',
      'div[class*="comment-input-inner-container"]',
      'div[contenteditable="true"]',
      'div[class*="comment"] div[contenteditable]',
      'input[placeholder*="评论"]',
      'div[placeholder*="说点什么"]'
    ];
  }

  for (const selector of selectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        console.log(`[AUTO] Found comment input (${type}):`, selector);
        // 发送反馈：找到评论框
        if (token && data) {
          await sendProgressMessage(token, '✅ 找到评论框', data);
        }
        return el;
      }
    } catch(e) {}
  }

  // 如果没找到，尝试点击"说点什么"
  const clicked = await page.evaluate(() => {
    const elements = document.querySelectorAll('*');
    for (const el of elements) {
      if (el.textContent && (el.textContent.includes('说点什么') || el.textContent.includes('写评论'))) {
        el.click();
        return true;
      }
    }
    return false;
  });

  if (clicked) {
    await new Promise(r => setTimeout(r, 1500));

    // 再次查找
    for (const selector of selectors) {
      try {
        const el = await page.$(selector);
        if (el) {
          console.log(`[AUTO] Found comment input after click (${type})`);
          if (token && data) {
            await sendProgressMessage(token, '✅ 找到评论框', data);
          }
          return el;
        }
      } catch(e) {}
    }
  }

  // 最后尝试查找所有 contenteditable
  const inputs = await page.$$('div[contenteditable="true"]');
  if (inputs.length > 0) {
    console.log('[AUTO] Found editable input');
    if (token && data) {
      await sendProgressMessage(token, '✅ 找到评论框', data);
    }
    return inputs[0];
  }

  return null;
}

module.exports = {
  handleDouyinVideo,
  findCommentInput
};
