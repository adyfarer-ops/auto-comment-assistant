// 简化版的抖音图文处理 - 修复 page.$x 错误
async function handleDouyinNoteSimple(page, token, data) {
  console.log('[AUTO] Handling Douyin Note (Simple)...');
  await sendProgressMessage(token, '📝 处理抖音图文...', data);
  
  // 等待页面加载
  await new Promise(r => setTimeout(r, 2000));
  
  // 点击"评论"tab - 使用 evaluate 方式
  console.log('[AUTO] Clicking comment tab...');
  await sendProgressMessage(token, '🔘 点击评论tab...', data);
  
  try {
    const clicked = await page.evaluate(() => {
      // 查找所有可能包含"评论"的元素
      const elements = document.querySelectorAll('div, span, button, a');
      for (const el of elements) {
        const text = el.textContent || '';
        // 匹配"评论(数字)"格式
        const match = text.match(/评论\s*\((\d+)\)/);
        if (match) {
          const rect = el.getBoundingClientRect();
          // 确保在内容区域（不在底部导航）
          if (rect.y > 100 && rect.y < 600) {
            el.click();
            console.log('[AUTO] Clicked tab:', text.substring(0, 30), 'y:', rect.y);
            return true;
          }
        }
      }
      return false;
    });
    
    if (!clicked) {
      console.log('[AUTO] Comment tab not found');
      await sendProgressMessage(token, '❌ 未找到评论tab', data);
      return null;
    }
    
    await sendProgressMessage(token, '✅ 已点击评论tab', data);
    
    // 等待评论区加载
    console.log('[AUTO] Waiting for comment section...');
    await new Promise(r => setTimeout(r, 3000));
    
    // 等待评论框出现
    let commentInput = null;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (!commentInput && attempts < maxAttempts) {
      try {
        // 检查页面是否已关闭
        await page.evaluate(() => document.title);
      } catch (e) {
        console.log('[AUTO] Page closed during wait');
        return null;
      }
      
      commentInput = await page.evaluate(() => {
        // 查找评论框
        const selectors = [
          'div.GXmFLge7.comment-input-inner-container',
          'div[class*="GXmFLge7"]',
          'div[class*="comment-input-inner-container"]',
          'div[contenteditable="true"]'
        ];
        
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el) {
            console.log('[AUTO] Found input:', selector);
            return selector;
          }
        }
        return null;
      });
      
      if (!commentInput) {
        await new Promise(r => setTimeout(r, 500));
        attempts++;
        console.log(`[AUTO] Waiting for input... ${attempts}/${maxAttempts}`);
      }
    }
    
    if (!commentInput) {
      console.log('[AUTO] Comment input not found');
      await sendProgressMessage(token, '❌ 未找到评论框', data);
      return null;
    }
    
    console.log('[AUTO] Comment section loaded');
    
    // 返回实际的元素
    const inputEl = await page.$('div.GXmFLge7.comment-input-inner-container') ||
                   await page.$('div[class*="GXmFLge7"]') ||
                   await page.$('div[contenteditable="true"]');
    
    return inputEl;
    
  } catch (e) {
    console.log('[AUTO] Error in handleDouyinNoteSimple:', e.message);
    return null;
  }
}