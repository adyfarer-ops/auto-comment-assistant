// platforms/douyin-note.js - 抖音图文处理逻辑（简化版，与视频保持一致）
const { sendProgressMessage, updateRecordField } = require('../utils/utils');

// 抖音图文处理流程（简化，与视频保持一致）
async function handleDouyinNote(page, token, data, browser) {
  console.log('[AUTO] Handling Douyin Note...');
  await sendProgressMessage(token, '📝 处理抖音图文...', data);

  // 等待页面加载
  await new Promise(r => setTimeout(r, 2000));

  // 滚动到页面底部找评论区（和视频一样）
  console.log('[AUTO] Scrolling to find comment area...');
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
  await new Promise(r => setTimeout(r, 1500));

  // 使用通用的查找评论框逻辑（传入类型）
  return await findCommentInput(page, 'note', token, data);
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

// 通用评论输入和发送逻辑（供外部调用）
async function inputAndSendComment(page, commentInput, data, token, contentType) {
  console.log('[AUTO] Inputting and sending comment...');
  console.log('[AUTO] Content type:', contentType);

  // 滚动到评论框位置
  try {
    await commentInput.evaluate(el => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await new Promise(r => setTimeout(r, 500));
  } catch(e) {}

  // 点击评论框
  try {
    await commentInput.click();
    console.log('[AUTO] Clicked comment input');
  } catch(e) {
    console.log('[AUTO] Click failed:', e.message);
  }

  // 等待激活
  await new Promise(r => setTimeout(r, 1000));

  // 输入评论
  console.log('[AUTO] Typing comment:', data.comment_script);
  try {
    await page.keyboard.type(data.comment_script, { delay: 50 });
    console.log('[AUTO] Typed with keyboard');
  } catch(e) {
    console.log('[AUTO] Keyboard input failed:', e.message);
    return { success: false, message: '输入评论失败' };
  }

  // 发送反馈：评论内容已输入
  await sendProgressMessage(token, '✅ 评论内容已输入', data);
  await new Promise(r => setTimeout(r, 1500));

  // 查找发送按钮
  console.log('[AUTO] Looking for send button...');
  const sendButtonSelectors = [
    'span.WFB7wUOX.NUzvFSPe',
    'span[class*="WFB7wUOX"][class*="NUzvFSPe"]',
    'div[class*="comment-input-right-ct"] span[class*="WFB7wUOX"]',
    'span[class*="WFB7wUOX"]',
    'span[class*="NUzvFSPe"]',
    'div[class*="comment-input-right-ct"] svg',
  ];

  let sendButton = null;
  for (const selector of sendButtonSelectors) {
    try {
      const btn = await page.$(selector);
      if (btn) {
        sendButton = btn;
        console.log('[AUTO] Found send button:', selector);
        break;
      }
    } catch(e) {}
  }

  if (sendButton) {
    // 点击发送按钮
    try {
      await sendButton.click();
      console.log('[AUTO] Send button clicked');
      await sendProgressMessage(token, '📤 评论已发送', data);
    } catch(e) {
      console.log('[AUTO] Click send button failed:', e.message);
      return { success: false, message: '点击发送按钮失败' };
    }
  } else {
    // 尝试按 Enter 键
    console.log('[AUTO] Send button not found, trying Enter key...');
    await page.keyboard.press('Enter');
    await sendProgressMessage(token, '📤 评论已发送（Enter）', data);
  }

  // 等待发送完成
  await new Promise(r => setTimeout(r, 3000));

  return { success: true };
}

module.exports = {
  handleDouyinNote,
  findCommentInput,
  inputAndSendComment
};
